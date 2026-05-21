<script>
  import { onMount, onDestroy, afterUpdate, tick } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { io } from "socket.io-client";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { API_BASE_URL, ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { checkAuth } from "$lib/utils/auth";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { queryUnreadCounts, clearUnread } from "$lib/stores/queryUnreadCounts";
  import { queryPrivacy } from "$lib/stores/queryPrivacy";
  import Swal from "sweetalert2";
  import LightBox from "$lib/components/LightBox.svelte";

  let lightboxData = [];
  let lightboxStartIndex = 0;

  function openImageLightbox(urls, index = 0) {
    lightboxStartIndex = index;
    lightboxData = urls;
  }

  function openAttachment(url, mime, name) {
    const isImg = mime
      ? mime.startsWith("image/")
      : /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name ?? "");
    if (isImg) {
      openImageLightbox([url], 0);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  let queryId = $page.params.id;
  let _prevId = $page.params.id;
  let currentUser;
  let query = null;
  let chats = [];
  let loading = true;
  let chatMessage = "";
  let attachedFiles = [];
  let pendingFiles = []; // staged from drop/paste — shown in preview modal before confirm
  let pendingIndex = 0;  // active slide in the preview modal
  let fileInputEl;
  let sendingChat = false;
  let actionLoading = false;
  let switching = false; // true while selectQuery is loading new data (shows shimmer bar)

  // reply state
  let replyTo = null; // { id, senderLabel, message, senderType } | null

  // edit state
  let editingChatId = null;
  let editingChatText = "";
  let savingEdit = false;

  // final flag state
  let settingFinalFlag = null; // chatId being toggled

  // read-more state
  const CHAR_LIMIT = 300;
  let expandedMessages = new Set();
  function toggleExpand(id) {
    if (expandedMessages.has(id)) expandedMessages.delete(id);
    else expandedMessages.add(id);
    expandedMessages = expandedMessages; // trigger reactivity
  }

  // socket state
  let socket = null;
  let otherTyping = false;
  let typingTimer = null;
  let isTyping = false;
  let typingQueries = new Set(); // queryIds of other queries where someone is typing

  // in-progress list
  let inProgressList = [];
  let inProgressLoading = false;
  let inProgressLoadingMore = false;
  let inProgressPage = 1;
  let inProgressTotal = 0;
  const IN_PROGRESS_LIMIT = 15;

  async function loadInProgress(reset = true) {
    if (reset) {
      inProgressPage = 1;
      inProgressTotal = 0;
    }
    // full spinner only on first page with empty list; otherwise silent refresh or bottom spinner
    if (inProgressPage === 1 && inProgressList.length === 0) inProgressLoading = true;
    else if (inProgressPage > 1) inProgressLoadingMore = true;
    try {
      let res;
      const p = inProgressPage;
      if (isTech(currentUser)) {
        res = await authApiFetch(`${API_ROUTES.QUERY}/assigned?status=in_progress&limit=${IN_PROGRESS_LIMIT}&page=${p}`);
      } else if (isTelecaller(currentUser)) {
        res = await authApiFetch(`${API_ROUTES.QUERY}/my?status=in_progress&limit=${IN_PROGRESS_LIMIT}&page=${p}`);
      } else {
        res = await authApiFetch(`${API_ROUTES.QUERY}?status=in_progress&limit=${IN_PROGRESS_LIMIT}&page=${p}`);
      }
      const newItems = Array.isArray(res?.data) ? res.data : [];
      inProgressTotal = res?.total ?? inProgressTotal;
      if (p === 1) {
        inProgressList = newItems;
        joinInProgressRooms();
      } else {
        inProgressList = [...inProgressList, ...newItems];
      }
    } catch (_) {
      if (inProgressPage === 1) inProgressList = [];
    } finally {
      inProgressLoading = false;
      inProgressLoadingMore = false;
    }
  }

  async function loadMoreInProgress() {
    if (inProgressLoadingMore || inProgressLoading || inProgressList.length >= inProgressTotal) return;
    inProgressPage += 1;
    await loadInProgress(false);
  }

  function handleInProgressScroll(e) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 30) {
      loadMoreInProgress();
    }
  }

  // Watch other in-progress query rooms for typing events only
  // Uses 'watch-query' (not 'join-query') so presenceMap stays accurate
  function joinInProgressRooms() {
    if (!socket || !socket.connected) return;
    for (const q of inProgressList) {
      if (q.id !== Number(queryId)) {
        socket.emit("watch-query", q.id);
      }
    }
  }

  // live status banner
  let statusBanner = null; // { status, assignedToName } | null
  let bannerTimer = null;

  function showStatusBanner(status, assignedToName) {
    if (bannerTimer) clearTimeout(bannerTimer);
    statusBanner = { status, assignedToName };
    bannerTimer = setTimeout(() => { statusBanner = null; }, 5000);
  }

  $: {
    const _id = $page.params.id;
    if (_id && _prevId && _id !== _prevId) {
      _prevId = _id;
      queryId = _id;
      _reloadForId(_id);
    }
  }

  function _reloadForId(id) {
    disconnectSocket();
    typingQueries = new Set();
    query = null;
    chats = [];
    otherTyping = false;
    expandedMessages = new Set();
    chatMessage = "";
    attachedFiles = [];
    cancelPending();
    replyTo = null;
    editingChatId = null;
    editingChatText = "";
    newMsgCount = 0;
    showNewMsgBanner = false;
    isAtBottom = true;
    statusBanner = null;
    if (bannerTimer) clearTimeout(bannerTimer);
    clearUnread(Number(id));
    // queryId is already updated by the reactive block before this is called
    loadQuery(id);
    loadChats(id);
    connectSocket();
    loadInProgress();
    authApiFetch(`${API_ROUTES.QUERY}/${id}/read-notifications`, { method: "PATCH" }).catch(() => {});
  }

  const isTelecaller = (u) => u?.subRole === "telecaller";
  const isTech = (u) => u?.subRole === "tech";
  const isMasterView = (u) => u?.role !== "user";

  /**
   * Derive a stable sender type used for avatar colour + bubble tint.
   * senderSubRole comes from the API/socket:
   *   null      → admin / master / manager
   *   'tech'    → tech
   *   'telecaller' → telecaller
   *   undefined → not present (old socket message) → fall back to senderLabel
   */
  function deriveSenderType(isOwn, senderLabel, senderSubRole) {
    if (isOwn) return "own";
    if (senderSubRole !== undefined) {
      if (senderSubRole === null)           return "admin";
      if (senderSubRole === "tech")         return "tech";
      if (senderSubRole === "telecaller")   return "telecaller";
    }
    // label-based fallback (non-master users, or old socket messages)
    if (senderLabel === "Admin")            return "admin";
    if (senderLabel === "Support Team")     return "tech";
    if (senderLabel === "Requester")        return "telecaller";
    return "other";
  }

  function setReply(chat) {
    replyTo = { id: chat.id, senderLabel: chat.senderLabel, message: chat.message, senderType: chat.senderType };
    chatInputEl?.focus();
  }

  function canSetFinalFlag() {
    return currentUser?.subRole === 'telecaller' || currentUser?.subRole === 'tech';
  }

  function canEditChat(chat) {
    if (!chat.isOwn) return false;
    const ageMs = Date.now() - new Date(chat.createdAt).getTime();
    return ageMs <= 30 * 60 * 1000;
  }

  function startEditChat(chat) {
    editingChatId = chat.id;
    editingChatText = chat.message ?? "";
  }

  function cancelEditChat() {
    editingChatId = null;
    editingChatText = "";
  }

  async function saveEditChat(chatId) {
    if (!editingChatText.trim()) return;
    savingEdit = true;
    try {
      const result = await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/chat/${chatId}`, {
        method: "PATCH",
        data: JSON.stringify({ message: editingChatText.trim() }),
      });
      chats = chats.map((c) =>
        c.id === chatId
          ? { ...c, message: result.data.message, editedAt: result.data.editedAt }
          : c
      );
      editingChatId = null;
      editingChatText = "";
    } catch (e) {
      const msg = e?.data?.message;
      Swal.fire({
        icon: "error",
        title: "Cannot edit",
        text: typeof msg === "string" ? msg : "Failed to edit message.",
      });
    } finally {
      savingEdit = false;
    }
  }

  async function toggleFinalFlag(chat) {
    if (settingFinalFlag === chat.id) return;
    settingFinalFlag = chat.id;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/chat/${chat.id}/flag`, { method: 'PATCH' });
      const isFinal = res?.data?.isFinal ?? false;
      // Clear previous final flag in local state, then set new one
      chats = chats.map(c => ({
        ...c,
        isFinal: c.id === chat.id ? isFinal : (isFinal ? false : c.isFinal),
        finalSetById: c.id === chat.id ? (isFinal ? currentUser?.id : null) : (isFinal ? null : c.finalSetById),
      }));
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'Could not update final flag.' });
    } finally {
      settingFinalFlag = null;
    }
  }

  function scrollToMessage(msgId) {
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("chat-row--highlight");
    setTimeout(() => el.classList.remove("chat-row--highlight"), 1500);
  }

  const STATUS_COLORS = {
    open: "bg-primary text-white",
    in_progress: "bg-warning text-dark",
    resolved: "bg-success text-white",
    reopened: "bg-danger text-white",
    closed: "bg-secondary text-white",
  };

  const PRIORITY_COLORS = {
    high: "bg-danger text-white",
    medium: "bg-warning text-dark",
    low: "bg-success text-white",
  };

  const QUERY_TYPES = [
    { value: "order_issue", label: "Order Issue" },
    { value: "payment_issue", label: "Payment Issue" },
    { value: "invoice_issue", label: "Invoice Issue" },
    { value: "stock_issue", label: "Stock Issue" },
    { value: "technical", label: "Technical" },
    { value: "customer_complaint", label: "Customer Complaint" },
    { value: "access_issue", label: "Access Issue" },
    { value: "other", label: "Other" },
  ];

  let chatContainer;
  let shouldScroll = false;
  let isAtBottom = true;
  let newMsgCount = 0;
  let showNewMsgBanner = false;

  // drag-and-drop state
  let isDragOver = false;
  let dragDepth = 0;
  const previewCache = new WeakMap(); // File → blob URL; avoids duplicate createObjectURL calls

  function checkAtBottom() {
    if (!chatContainer) return true;
    return chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 60;
  }

  function handleChatScroll() {
    isAtBottom = checkAtBottom();
    if (isAtBottom) {
      newMsgCount = 0;
      showNewMsgBanner = false;
    }
  }

  function scrollToBottom() {
    if (!chatContainer) return;
    chatContainer.scrollTop = chatContainer.scrollHeight;
    newMsgCount = 0;
    showNewMsgBanner = false;
    isAtBottom = true;
  }

  $: if (chats || otherTyping) shouldScroll = true;

  afterUpdate(() => {
    if (shouldScroll && chatContainer) {
      if (isAtBottom) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      shouldScroll = false;
    }
  });

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.role === "user" && !currentUser.subRole) { goto("/admin/dashboard"); return; }
    clearUnread(Number(queryId));
    await loadQuery();
    await loadChats();
    connectSocket();
    loadInProgress();
    // mark any existing notifications for this query as read
    authApiFetch(`${API_ROUTES.QUERY}/${queryId}/read-notifications`, { method: "PATCH" }).catch(() => {});
  });

  onDestroy(() => {
    disconnectSocket();
    if (bannerTimer) clearTimeout(bannerTimer);
  });

  // Switch to a different query without a page navigation.
  // Fetches new data first, then swaps atomically — old content stays visible (no blink).
  async function selectQuery(newId) {
    newId = Number(newId);
    if (newId === Number(queryId)) return;

    // stop typing on the old query
    if (isTyping) {
      isTyping = false;
      clearTimeout(typingTimer);
      socket?.emit("typing-stop", Number(queryId));
    }

    // reset non-panel state (typing, attachments, status banner, reply)
    otherTyping = false;
    typingQueries = new Set();
    expandedMessages = new Set();
    chatMessage = "";
    attachedFiles = [];
    cancelPending();
    replyTo = null;
    editingChatId = null;
    editingChatText = "";
    newMsgCount = 0;
    showNewMsgBanner = false;
    isAtBottom = true;
    statusBanner = null;
    if (bannerTimer) clearTimeout(bannerTimer);
    if (chatInputEl) chatInputEl.style.height = "auto";

    // show shimmer bar — old query detail + chat stay visible underneath
    switching = true;

    // commit queryId now so socket handlers immediately use the new id
    queryId = String(newId);
    clearUnread(newId);
    history.replaceState({}, "", `/admin/query/${newId}`);
    socket?.emit("join-query", newId);
    loadInProgress();

    // fetch both panels in parallel
    const [newQuery, newChats] = await Promise.all([
      authApiFetch(`${API_ROUTES.QUERY}/${newId}`).catch(() => null),
      authApiFetch(`${API_ROUTES.QUERY}/${newId}/chat`).catch(() => []),
    ]);

    // atomic swap — single render tick, no blank flash
    query = newQuery;
    chats = Array.isArray(newChats)
      ? newChats.map((c) => ({ ...c, senderType: deriveSenderType(c.isOwn, c.senderLabel, c.senderSubRole) }))
      : [];
    switching = false;

    await tick();
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;

    authApiFetch(`${API_ROUTES.QUERY}/${newId}/read-notifications`, { method: "PATCH" }).catch(() => {});
  }

  // Socket handlers deliberately reference `queryId` (the live let-binding),
  // NOT a captured snapshot, so switching queries via selectQuery() works correctly.
  function connectSocket() {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    socket = io(`${API_BASE_URL}/query-chat`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit("join-query", Number(queryId));
      // also watch other in-progress rooms for typing (list may already be loaded)
      joinInProgressRooms();
    });

    socket.on("new-message", (msg) => {
      // handle messages for other in-progress queries — bubble to top of list
      if (msg.queryId !== Number(queryId)) {
        const idx = inProgressList.findIndex(q => q.id === msg.queryId);
        if (idx === 0) {
          // already at top — just refresh lastMessage preview
          inProgressList[0] = { ...inProgressList[0], lastMessage: msg.message ?? inProgressList[0].lastMessage };
          inProgressList = [...inProgressList];
        } else if (idx > 0) {
          const item = { ...inProgressList[idx], lastMessage: msg.message ?? inProgressList[idx].lastMessage };
          inProgressList = [item, ...inProgressList.filter((_, i) => i !== idx)];
        } else {
          // not in loaded pages yet — refresh from page 1
          loadInProgress(true);
        }
        return;
      }
      // skip if already added locally (own message added immediately after send)
      if (chats.find((c) => c.id === msg.id)) return;

      const isOwn = msg.senderId === currentUser?.id;
      // msg.isAdminSender is true when sender has no subRole (master/admin/manager)
      const isAdminSender = msg.isAdminSender ?? false;
      let senderLabel;

      if (isMasterView(currentUser)) {
        senderLabel = isOwn ? "You" : (msg.senderName || "Unknown");
      } else if (isOwn) {
        senderLabel = "You";
      } else if (isAdminSender) {
        senderLabel = "Admin";
      } else if (isTelecaller(currentUser)) {
        senderLabel = "Support Team";
      } else {
        senderLabel = "Requester";
      }

      const senderType = deriveSenderType(isOwn, senderLabel, msg.senderSubRole);

      // resolve replyTo from local chats array (message already loaded on client)
      let msgReplyTo = null;
      if (msg.replyToId) {
        const ref = chats.find((c) => c.id === msg.replyToId);
        if (ref) msgReplyTo = { id: ref.id, senderLabel: ref.senderLabel, message: ref.message, senderType: ref.senderType };
      }

      const atBottom = checkAtBottom();
      chats = [
        ...chats,
        {
          id: msg.id,
          message: msg.message,
          attachments: msg.attachments ?? [],
          createdAt: msg.createdAt,
          isOwn,
          senderLabel,
          senderType,
          replyTo: msgReplyTo,
          isNew: true,
        },
      ];
      if (!atBottom && !isOwn) {
        newMsgCount += 1;
        showNewMsgBanner = true;
      }
    });

    socket.on("user-typing", (data) => {
      const qid = data?.queryId;
      if (qid && qid !== Number(queryId)) {
        // typing in a different in-progress query
        typingQueries.add(qid);
        typingQueries = typingQueries;
      } else {
        // typing in the currently viewed query
        otherTyping = true;
      }
    });

    socket.on("typing-stopped", (data) => {
      const qid = data?.queryId;
      if (qid && qid !== Number(queryId)) {
        typingQueries.delete(qid);
        typingQueries = typingQueries;
      } else {
        otherTyping = false;
      }
    });

    // personal room event — another query's status changed, refresh our list
    socket.on("query-list-changed", () => {
      loadInProgress();
    });

    socket.on("message-edited", (data) => {
      if (data.queryId !== Number(queryId)) return;
      chats = chats.map((c) =>
        c.id === data.chatId
          ? { ...c, message: data.message, editedAt: data.editedAt }
          : c
      );
    });

    socket.on("status-update", (data) => {
      // refresh in-progress list on any status change (query may enter or leave in_progress)
      loadInProgress();
      if (!query || data.queryId !== Number(queryId)) return;
      // patch query reactively — triggers all {#if query.status === ...} blocks
      query = {
        ...query,
        status: data.status,
        assignedToId: data.assignedToId ?? query.assignedToId,
        assignedTo: data.assignedToName
          ? { ...(query.assignedTo ?? {}), name: data.assignedToName }
          : query.assignedTo,
      };
      showStatusBanner(data.status, data.assignedToName);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });
  }

  function disconnectSocket() {
    if (typingTimer) clearTimeout(typingTimer);
    if (socket) { socket.disconnect(); socket = null; }
  }

  let chatInputEl;

  function autoResize(node) {
    node.style.height = "auto";
    node.style.height = node.scrollHeight + "px";
  }

  function handleTyping(e) {
    autoResize(e.target);
    if (!socket || !canSendChat()) return;
    if (!isTyping) {
      isTyping = true;
      socket.emit("typing-start", Number(queryId));
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      isTyping = false;
      socket.emit("typing-stop", Number(queryId));
    }, 2500);
  }

  async function loadQuery(id = queryId) {
    loading = true;
    try {
      query = await authApiFetch(`${API_ROUTES.QUERY}/${id}`);
    } catch (e) {
      // network errors: ServerOffline modal already covers the UI
      if (!e?.isNetworkError && e?.status !== 0) errorHandle(e);
    } finally {
      loading = false;
    }
  }

  async function loadChats(id = queryId) {
    try {
      const raw = await authApiFetch(`${API_ROUTES.QUERY}/${id}/chat`);
      chats = Array.isArray(raw)
        ? raw.map((c) => ({ ...c, senderType: deriveSenderType(c.isOwn, c.senderLabel, c.senderSubRole), isFinal: c.isFinal ?? false, finalSetById: c.finalSetById ?? null }))
        : [];
      await tick();
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (_) {}
  }

  function onFileSelect(e) {
    const input = e.target;
    const picked = Array.from(input.files ?? []);
    if (picked.length) {
      attachedFiles = [...attachedFiles, ...picked].slice(0, 5);
    }
    input.value = "";
  }

  function triggerFilePicker() {
    fileInputEl?.click();
  }

  function clearAttachment(index) {
    const f = attachedFiles[index];
    const url = previewCache.get(f);
    if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
    attachedFiles = attachedFiles.filter((_, i) => i !== index);
  }

  function isImage(mime) { return mime?.startsWith("image/") ?? false; }

  async function sendChat() {
    if (!chatMessage.trim() && !attachedFiles.length) return;
    sendingChat = true;

    if (isTyping) {
      isTyping = false;
      clearTimeout(typingTimer);
      socket?.emit("typing-stop", Number(queryId));
    }

    const msgText = chatMessage.trim();
    const msgFiles = [...attachedFiles];
    const msgReplyTo = replyTo; // capture before clearing
    chatMessage = "";
    attachedFiles = [];
    replyTo = null;
    // reset textarea height back to 1 row after clearing
    if (chatInputEl) { chatInputEl.style.height = "auto"; }

    try {
      const fd = new FormData();
      if (msgText) fd.append("message", msgText);
      for (const f of msgFiles) fd.append("files", f);
      if (msgReplyTo) fd.append("replyToId", String(msgReplyTo.id));

      const result = await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/chat`, {
        method: "POST",
        data: fd,
      });

      const chat = result.data;
      if (!chats.find((c) => c.id === chat.id)) {
        chats = [
          ...chats,
          {
            id: chat.id,
            message: chat.message,
            attachments: chat.attachments ?? [],
            createdAt: chat.createdAt,
            isOwn: true,
            senderLabel: "You",
            senderType: "own",
            replyTo: msgReplyTo ? { id: msgReplyTo.id, senderLabel: msgReplyTo.senderLabel, message: msgReplyTo.message, senderType: msgReplyTo.senderType } : null,
            isNew: true,
          },
        ];
      }
      await tick();
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
      // revoke blob preview URLs created for chip thumbnails (files now uploaded)
      for (const f of msgFiles) {
        const url = previewCache.get(f);
        if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
      }
    } catch (e) {
      chatMessage = msgText;
      attachedFiles = msgFiles;
      replyTo = msgReplyTo; // restore reply context on failure
      const status = e?.status;
      const rawMsg = e?.data?.message;
      const msg = typeof rawMsg === "string" ? rawMsg : null;

      if (status === 413 || msg?.toLowerCase().includes("too large") || msg?.includes("LIMIT_FILE_SIZE")) {
        Swal.fire({
          icon: "error",
          title: "File too large",
          text: "Maximum allowed file size is 5 MB per file. Please reduce the file size and try again.",
        });
      } else if (status === 400 && msg?.toLowerCase().includes("too many")) {
        Swal.fire({
          icon: "error",
          title: "Too many files",
          text: "You can attach a maximum of 5 files per message.",
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "Failed to send",
          text: msg ?? "Something went wrong. Please try again.",
        });
      }
    } finally {
      sendingChat = false;
    }
  }

  async function pickUp() {
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/assign`, { method: "PATCH" });
      Swal.fire({ icon: "success", title: "Query assigned to you", timer: 1500, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      const status = e?.status ?? e?.response?.status;
      if (status === 409) {
        Swal.fire({
          icon: "warning",
          title: "Already picked up",
          text: "This query was just picked up by another team member.",
          timer: 2500,
          showConfirmButton: false,
        });
        await loadQuery(); // refresh so the button disappears
      } else {
        Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
      }
    } finally { actionLoading = false; }
  }

  async function markResolved() {
    const confirm = await Swal.fire({
      icon: "question", title: "Mark as Resolved?",
      text: "The requester will be notified and can reopen if needed.",
      showCancelButton: true, confirmButtonText: "Yes, resolve it", confirmButtonColor: "#198754",
    });
    if (!confirm.isConfirmed) return;
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/resolve`, { method: "PATCH" });
      Swal.fire({ icon: "success", title: "Query resolved!", timer: 1500, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
    } finally { actionLoading = false; }
  }

  async function acceptSolution() {
    const confirm = await Swal.fire({
      icon: "question", title: "Accept Solution?",
      text: "This will close the query. You won't be able to reopen it after accepting.",
      showCancelButton: true, confirmButtonText: "Yes, accept it", confirmButtonColor: "#198754",
    });
    if (!confirm.isConfirmed) return;
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/accept`, { method: "PATCH" });
      Swal.fire({ icon: "success", title: "Solution accepted!", text: "Query has been closed.", timer: 1800, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
    } finally { actionLoading = false; }
  }

  async function reopen() {
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/reopen`, { method: "PATCH" });
      Swal.fire({ icon: "success", title: "Query reopened", timer: 1500, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
    } finally { actionLoading = false; }
  }

  async function closeQuery() {
    const confirm = await Swal.fire({
      icon: "warning", title: "Close this query?", text: "This action is permanent.",
      showCancelButton: true, confirmButtonText: "Yes, close it",
    });
    if (!confirm.isConfirmed) return;
    actionLoading = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}`, {
        method: "PATCH",
        data: JSON.stringify({ status: "closed" }),
      });
      Swal.fire({ icon: "success", title: "Query closed", timer: 1500, showConfirmButton: false });
      await loadQuery();
      loadInProgress();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
    } finally { actionLoading = false; }
  }

  function canSendChat() {
    if (!query) return false;
    if (isTelecaller(currentUser)) return query.status !== "closed" && query.status !== "resolved";
    if (isTech(currentUser)) return query.status === "in_progress" && query.assignedToId === currentUser?.id;
    if (isMasterView(currentUser)) return query.status !== "closed";
    return false;
  }

  function typingLabel() {
    if (isTelecaller(currentUser)) return "Support Team is typing…";
    if (isTech(currentUser)) return "Requester is typing…";
    return "Someone is typing…";
  }

  const ALLOWED_TYPES = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar";

  // ── Privacy masking (master-only) ────────────────────────────────────────
  $: maskTC   = (name) => (currentUser?.role === "master" && $queryPrivacy.telecaller && name) ? "Telecaller" : (name ?? "-");
  $: maskTech = (name) => (currentUser?.role === "master" && $queryPrivacy.tech       && name) ? "Tech"        : (name ?? "-");
  $: maskChatSender = (chat) => {
    if (currentUser?.role !== "master") return chat.senderLabel;
    if ($queryPrivacy.telecaller && chat.senderType === "telecaller") return "Telecaller";
    if ($queryPrivacy.tech       && chat.senderType === "tech")       return "Tech";
    return chat.senderLabel;
  };

  // ── Preview attached file before sending ─────────────────────────────────
  function previewAttachedFile(file) {
    if (file.type.startsWith("image/")) {
      const imgFiles = attachedFiles.filter(f => f.type.startsWith("image/"));
      const urls = imgFiles.map(f => URL.createObjectURL(f));
      const idx = imgFiles.indexOf(file);
      openImageLightbox(urls, idx < 0 ? 0 : idx);
      setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 60_000);
    } else {
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }

  // ── Pending files helpers ─────────────────────────────────────────────────
  function getPreviewUrl(file) {
    if (previewCache.has(file)) return previewCache.get(file);
    const url = URL.createObjectURL(file);
    previewCache.set(file, url);
    return url;
  }

  function confirmPendingFiles() {
    const remaining = 5 - attachedFiles.length;
    if (remaining <= 0) { cancelPending(); return; }
    attachedFiles = [...attachedFiles, ...pendingFiles.slice(0, remaining)];
    pendingFiles = []; // URLs kept alive in previewCache — reused by chip thumbnails
  }

  function cancelPending() {
    for (const f of pendingFiles) {
      const url = previewCache.get(f);
      if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
    }
    pendingFiles = [];
    pendingIndex = 0;
  }

  function removePendingFile(i) {
    const f = pendingFiles[i];
    const url = previewCache.get(f);
    if (url) { URL.revokeObjectURL(url); previewCache.delete(f); }
    pendingFiles = pendingFiles.filter((_, idx) => idx !== i);
    // keep index in-bounds after removal
    if (pendingIndex >= pendingFiles.length) {
      pendingIndex = Math.max(0, pendingFiles.length - 1);
    }
  }

  function prevPending()  { if (pendingIndex > 0) pendingIndex--; }
  function nextPending()  { if (pendingIndex < pendingFiles.length - 1) pendingIndex++; }
  function jumpPending(i) { pendingIndex = i; }

  // ── Drag & drop handlers ──────────────────────────────────────────────────
  function handleDragEnter(e) {
    if (!canSendChat()) return;
    e.preventDefault();
    dragDepth++;
    isDragOver = true;
  }

  function handleDragLeave(e) {
    if (!canSendChat()) return;
    dragDepth--;
    if (dragDepth <= 0) { dragDepth = 0; isDragOver = false; }
  }

  function handleDragOver(e) {
    if (!canSendChat()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(e) {
    if (!canSendChat()) return;
    e.preventDefault();
    dragDepth = 0;
    isDragOver = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    const capacity = 5 - attachedFiles.length - pendingFiles.length;
    if (capacity <= 0) return;
    pendingFiles = [...pendingFiles, ...files.slice(0, capacity)];
  }

  // ── Paste image handler ───────────────────────────────────────────────────
  function handlePaste(e) {
    if (!canSendChat()) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter(item => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    const capacity = 5 - attachedFiles.length - pendingFiles.length;
    if (capacity <= 0) return;
    imageItems.slice(0, capacity).forEach(item => {
      const file = item.getAsFile();
      if (file) pendingFiles = [...pendingFiles, file];
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }
</script>

<div class="page-wrapper">
  <div class="content">
    <div class="d-flex align-items-center gap-2 mb-3">
      <button class="btn btn-sm btn-outline-secondary" on:click={() => history.back()}>
        <i class="ti ti-arrow-left"></i> Back
      </button>
      <h4 class="fw-bold mb-0">Query Detail</h4>
    </div>

    {#if loading}
      <div class="text-center py-5"><span class="spinner-border text-primary"></span></div>
    {:else if !query}
      <div class="text-center py-5 text-muted">Query not found.</div>
    {:else}
      <LightBox data={lightboxData} startIndex={lightboxStartIndex} />

      <!-- ── Pending-files preview modal (slider) ─────────────────────────── -->
      {#if pendingFiles.length > 0}
        {@const totalAllowed = Math.max(0, 5 - attachedFiles.length)}
        {@const cur = pendingFiles[pendingIndex]}
        {@const curAllowed = pendingIndex < totalAllowed}
        <div class="pf-backdrop" on:click={cancelPending} role="dialog" aria-modal="true" aria-label="Preview files">
          <div class="pf-card" on:click|stopPropagation role="document">

            <!-- header -->
            <div class="pf-header">
              <i class="ti ti-photo-check" style="color:#3b5bdb;font-size:15px;"></i>
              <span>Preview Files</span>
              <span class="pf-index">{pendingIndex + 1} / {pendingFiles.length}</span>
              <button class="pf-close" on:click={cancelPending} title="Discard"><i class="ti ti-x"></i></button>
            </div>

            <!-- over-limit warning -->
            {#if pendingFiles.length > totalAllowed}
              <div class="pf-warn">
                <i class="ti ti-alert-triangle"></i>
                Only {totalAllowed} of {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} can be added (5-file limit). Dimmed items will be skipped.
              </div>
            {/if}

            <!-- main stage -->
            <div class="pf-stage">
              {#if pendingIndex > 0}
                <button class="pf-arrow pf-arrow--left" on:click={prevPending} title="Previous">
                  <i class="ti ti-chevron-left"></i>
                </button>
              {/if}

              <div class="pf-preview" class:pf-preview--overlimit={!curAllowed}>
                {#if cur?.type.startsWith('image/')}
                  <img src={getPreviewUrl(cur)} alt={cur.name} class="pf-stage-img" />
                {:else}
                  <div
                    class="pf-stage-file"
                    role="button"
                    tabindex="0"
                    title="Click to open file"
                    on:click={() => window.open(getPreviewUrl(cur), '_blank', 'noopener,noreferrer')}
                    on:keydown={(e) => e.key === 'Enter' && window.open(getPreviewUrl(cur), '_blank', 'noopener,noreferrer')}
                  >
                    <i class="ti ti-file-description pf-stage-file-icon"></i>
                    <span class="pf-stage-ext">.{cur?.name.split('.').pop()?.toLowerCase() ?? 'file'}</span>
                    <span class="pf-stage-open-hint"><i class="ti ti-external-link"></i> Click to open</span>
                  </div>
                {/if}

                {#if curAllowed}
                  <button class="pf-stage-remove" on:click={() => removePendingFile(pendingIndex)}>
                    <i class="ti ti-trash"></i> Remove
                  </button>
                {:else}
                  <div class="pf-overlimit-badge"><i class="ti ti-ban"></i> Over limit</div>
                {/if}
              </div>

              {#if pendingIndex < pendingFiles.length - 1}
                <button class="pf-arrow pf-arrow--right" on:click={nextPending} title="Next">
                  <i class="ti ti-chevron-right"></i>
                </button>
              {/if}
            </div>

            <!-- filename -->
            <div class="pf-stage-name" title={cur?.name}>{cur?.name}</div>

            <!-- thumbnail strip -->
            <div class="pf-strip">
              {#each pendingFiles as file, i}
                <button
                  class="pf-thumb"
                  class:pf-thumb--active={i === pendingIndex}
                  class:pf-thumb--overlimit={i >= totalAllowed}
                  on:click={() => jumpPending(i)}
                  title={file.name}
                >
                  {#if file.type.startsWith('image/')}
                    <img src={getPreviewUrl(file)} alt={file.name} class="pf-thumb-img" />
                  {:else}
                    <i class="ti ti-file-description pf-thumb-icon"></i>
                  {/if}
                </button>
              {/each}
            </div>

            <!-- footer -->
            <div class="pf-footer">
              <button class="pf-btn-cancel" on:click={cancelPending}>Discard</button>
              <button class="pf-btn-confirm" on:click={confirmPendingFiles} disabled={attachedFiles.length >= 5}>
                <i class="ti ti-check"></i>
                Add {Math.min(pendingFiles.length, totalAllowed)} file{Math.min(pendingFiles.length, totalAllowed) !== 1 ? 's' : ''}
              </button>
            </div>

          </div>
        </div>
      {/if}

      {#if statusBanner}
        <div class="status-live-banner status-live-banner--{statusBanner.status.replace('_','-')}">
          <i class="ti ti-refresh-alert me-2"></i>
          <span>
            Status updated to
            <strong>{statusBanner.status.replace("_", " ")}</strong>
            {#if statusBanner.assignedToName}
              — assigned to <strong>{maskTech(statusBanner.assignedToName)}</strong>
            {/if}
          </span>
          <button class="status-banner-close" on:click={() => statusBanner = null}>
            <i class="ti ti-x"></i>
          </button>
        </div>
      {/if}

      <div class="row g-4">
        <!-- Left: query info + actions -->
        <div class="col-lg-4 query-left-col">
          {#if !isTech(currentUser) && query.order}
            <div class="card border-0 shadow-sm mb-3">
              <div class="card-header py-2 d-flex align-items-center gap-2">
                <i class="ti ti-receipt text-primary"></i>
                <span class="fw-semibold small">Linked Order</span>
                <a href="/admin/order/{query.order.id}" class="btn btn-sm btn-outline-primary ms-auto py-0 px-2" style="font-size:11px;">
                  <i class="ti ti-external-link me-1"></i>View
                </a>
              </div>
              <div class="card-body py-3 px-4 small">
                <div class="mb-1 fw-semibold text-dark">{query.order.title ?? "-"}</div>
                <div class="text-muted mb-1"><i class="ti ti-hash me-1"></i>Order #{query.order.pId}</div>
                {#if query.order.company}
                  <div class="text-muted mb-1"><i class="ti ti-building me-1"></i>{query.order.company}</div>
                {/if}
                {#if query.order.category}
                  <div class="text-muted mb-1"><i class="ti ti-tag me-1"></i>{query.order.category}</div>
                {/if}
                <div class="mt-2">
                  <span class="badge bg-secondary">{query.order.status}</span>
                  {#if query.order.price}
                    <span class="badge bg-light text-dark border ms-1">₹{Number(query.order.price).toLocaleString("en-IN")}</span>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
          <div class="qd-card mb-3">

            <!-- ── Switching shimmer bar (always rendered, animated when switching) ── -->
            <div class="switch-bar" class:switch-bar--active={switching}></div>

            <!-- ── Header: subject + status ── -->
            <div class="qd-header">
              <div class="qd-subject-wrap">
                <h6 class="qd-subject">{query.subject}</h6>
                <span class="badge {STATUS_COLORS[query.status] ?? 'bg-secondary'} qd-status-badge">
                  {query.status?.replace("_", " ")}
                </span>
              </div>
            </div>

            <!-- ── Tags: type + priority ── -->
            <div class="qd-tags">
              <span class="qd-tag qd-tag--type">
                <i class="ti ti-tag"></i>
                {QUERY_TYPES.find(t => t.value === query.type)?.label ?? query.type ?? "Other"}
              </span>
              <span class="qd-tag qd-tag--priority qd-tag--{query.priority ?? 'medium'}">
                <i class="ti ti-flag"></i>
                {query.priority ?? "medium"}
              </span>
            </div>

            <!-- ── Description ── -->
            <div class="qd-description">{query.description}</div>

            <!-- ── Reopened alert ── -->
            {#if isTelecaller(currentUser) && query.status === "reopened"}
              <div class="qd-alert">
                <i class="ti ti-clock-pause"></i>
                <span>Your query has been reopened. Waiting for the support team to pick it up.</span>
              </div>
            {/if}

            <!-- ── Meta info ── -->
            <div class="qd-meta">
              <div class="qd-meta-row">
                <span class="qd-meta-label"><i class="ti ti-calendar"></i> Raised</span>
                <span class="qd-meta-value">{formatDate(query.createdAt)}</span>
              </div>
              {#if query.resolvedAt}
                <div class="qd-meta-row">
                  <span class="qd-meta-label"><i class="ti ti-circle-check"></i> Resolved</span>
                  <span class="qd-meta-value">{formatDate(query.resolvedAt)}</span>
                </div>
              {/if}
              {#if isMasterView(currentUser)}
                <div class="qd-meta-row">
                  <span class="qd-meta-label"><i class="ti ti-user"></i> Raised by</span>
                  <span class="qd-meta-value">{maskTC(query.raisedBy?.name)}</span>
                </div>
                <div class="qd-meta-row">
                  <span class="qd-meta-label"><i class="ti ti-user-check"></i> Assigned</span>
                  <span class="qd-meta-value">{query.assignedTo ? maskTech(query.assignedTo.name) : "Unassigned"}</span>
                </div>
                {#if query.orderId}
                  <div class="qd-meta-row">
                    <span class="qd-meta-label"><i class="ti ti-receipt"></i> Order</span>
                    <span class="qd-meta-value">#{ query.orderId}</span>
                  </div>
                {/if}
              {/if}
            </div>

            <!-- ── Actions ── -->
            {#if
              (isTech(currentUser) && (query.status === "open" || query.status === "reopened" || (query.status === "in_progress" && query.assignedToId === currentUser?.id))) ||
              (isTelecaller(currentUser) && query.status === "resolved") ||
              (isMasterView(currentUser) && query.status !== "closed")
            }
              <div class="qd-actions">
                {#if isTech(currentUser)}
                  {#if query.status === "open" || query.status === "reopened"}
                    <button class="qd-btn qd-btn--warning" on:click={pickUp} disabled={actionLoading}>
                      <i class="ti ti-hand-stop"></i> Pick Up Query
                    </button>
                  {/if}
                  {#if query.status === "in_progress" && query.assignedToId === currentUser?.id}
                    <button class="qd-btn qd-btn--success" on:click={markResolved} disabled={actionLoading}>
                      <i class="ti ti-circle-check"></i> Mark as Resolved
                    </button>
                  {/if}
                {/if}
                {#if isTelecaller(currentUser) && query.status === "resolved"}
                  <button class="qd-btn qd-btn--success" on:click={acceptSolution} disabled={actionLoading}>
                    <i class="ti ti-thumb-up"></i> Accept Solution
                  </button>
                  <button class="qd-btn qd-btn--danger-outline" on:click={reopen} disabled={actionLoading}>
                    <i class="ti ti-refresh"></i> Reopen Query
                  </button>
                {/if}
                {#if isMasterView(currentUser) && query.status !== "closed"}
                  <button class="qd-btn qd-btn--danger-outline" on:click={closeQuery} disabled={actionLoading}>
                    <i class="ti ti-lock"></i> Close Query
                  </button>
                {/if}
              </div>
            {/if}

          </div>

          <!-- In-progress list — inside left column, below detail card -->
          {#if inProgressLoading}
            <div class="card border-0 shadow-sm p-3 text-center">
              <span class="spinner-border spinner-border-sm text-primary"></span>
            </div>
          {:else if inProgressList.length > 0}
            <div class="card border-0 shadow-sm ip-card">
              <div class="card-header py-2 px-3 d-flex align-items-center gap-2">
                <i class="ti ti-loader text-warning"></i>
                <span class="fw-semibold small">In Progress</span>
                <span class="badge bg-warning text-dark ms-1">{inProgressTotal || inProgressList.length}</span>
                {#if isTech(currentUser)}
                  <a href="/admin/query/assigned" class="ms-auto small text-muted text-decoration-none">View all →</a>
                {:else}
                  <a href="/admin/query" class="ms-auto small text-muted text-decoration-none">View all →</a>
                {/if}
              </div>
              <div class="card-body p-0 ip-list-body" on:scroll={handleInProgressScroll}>
                {#each inProgressList as q}
                  {@const unread = $queryUnreadCounts[q.id] ?? 0}
                  {@const isTypingHere = typingQueries.has(q.id)}
                  {@const isCurrent = Number(queryId) === q.id}
                  {@const typeLabel = QUERY_TYPES.find(t => t.value === q.type)?.label ?? q.type ?? "Other"}
                  <div
                    class="in-progress-row {isCurrent ? 'in-progress-row--active' : ''}"
                    role="button"
                    tabindex="0"
                    on:click={() => selectQuery(q.id)}
                    on:keydown={(e) => e.key === 'Enter' && selectQuery(q.id)}
                  >
                    <!-- circle icon with priority dot -->
                    <div class="ip-avatar-wrap">
                      <div class="ip-avatar {isCurrent ? 'ip-avatar--active' : ''}">
                        <i class="ti ti-message-circle"></i>
                      </div>
                      <span class="ip-priority-dot ip-priority-dot--{q.priority ?? 'medium'}"></span>
                    </div>

                    <!-- subject + sub-line -->
                    <div class="ip-body">
                      <span class="ip-subject">{q.subject}</span>
                      <span class="ip-sub {isTypingHere ? 'ip-sub--typing' : ''}">
                        {#if isTypingHere}
                          <i class="ti ti-pencil" style="font-size:10px;"></i> typing…
                        {:else if q.lastMessage}
                          {q.lastMessage.length > 42 ? q.lastMessage.slice(0, 42).trimEnd() + '…' : q.lastMessage}
                        {:else}
                          {typeLabel}
                        {/if}
                      </span>
                      {#if isMasterView(currentUser)}
                        <span class="ip-meta">
                          {#if q.raisedBy?.name}<i class="ti ti-user" style="font-size:9px;"></i> {maskTC(q.raisedBy.name)}{/if}{#if q.assignedTo?.name}&nbsp;·&nbsp;<i class="ti ti-user-check" style="font-size:9px;"></i> {maskTech(q.assignedTo.name)}{/if}
                        </span>
                      {/if}
                    </div>

                    <!-- unread count -->
                    {#if unread > 0}
                      <span class="in-progress-unread">{unread > 99 ? "99+" : unread}</span>
                    {/if}
                  </div>
                {/each}
                {#if inProgressLoadingMore}
                  <div class="ip-loading-more">
                    <span class="spinner-border spinner-border-sm text-warning" style="width:14px;height:14px;border-width:2px;"></span>
                  </div>
                {:else if inProgressList.length > 0 && inProgressList.length >= inProgressTotal && inProgressTotal > IN_PROGRESS_LIMIT}
                  <div class="ip-all-loaded">All caught up</div>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- Right: chat -->
        <div class="col-lg-8">
          <div class="chat-card d-flex flex-column">
            <!-- Switching shimmer bar (always rendered, animated when switching) -->
            <div class="switch-bar switch-bar--chat" class:switch-bar--active={switching}></div>

            <!-- Chat header -->
            <div class="chat-header d-flex align-items-center gap-3 px-4 py-3">
              <div class="chat-avatar chat-avatar--support">
                <i class="ti ti-headset"></i>
              </div>
              <div class="flex-grow-1">
                <div class="fw-semibold">Discussion Thread</div>
                {#if otherTyping}
                  <div class="typing-indicator">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="ms-1">{typingLabel()}</span>
                  </div>
                {:else}
                  <div class="small text-muted">{chats.length} message{chats.length !== 1 ? "s" : ""}</div>
                {/if}
              </div>
              <span class="badge {query.status === 'resolved' ? 'bg-success' : query.status === 'closed' ? 'bg-secondary' : query.status === 'in_progress' ? 'bg-warning text-dark' : 'bg-primary'}">
                {query.status?.replace("_", " ")}
              </span>
            </div>

            <!-- Policy notice -->
            <div class="chat-policy-notice">
              <i class="ti ti-shield-lock chat-policy-icon"></i>
              <div class="chat-policy-marquee-wrap">
                <span class="chat-policy-marquee-text">
                  Sharing personal contact information (name, mobile, email, address, etc.) is not allowed in Query Chat. Violations may lead to account suspension or termination.
                </span>
              </div>
            </div>

            <!-- Messages -->
            <div class="chat-messages-wrap"
              on:dragenter={handleDragEnter}
              on:dragleave={handleDragLeave}
              on:dragover={handleDragOver}
              on:drop={handleDrop}
            >
            {#if isDragOver}
              <div class="drag-overlay" aria-hidden="true">
                <div class="drag-overlay-content">
                  <i class="ti ti-upload"></i>
                  <span>Drop files here</span>
                </div>
              </div>
            {/if}
            <div bind:this={chatContainer} class="chat-messages flex-grow-1 overflow-auto px-4 py-3" style="flex:1 1 0;min-height:0;" on:scroll={handleChatScroll}>
              {#if chats.length === 0}
                <div class="chat-empty">
                  <i class="ti ti-messages-off"></i>
                  <p>No messages yet. Start the discussion.</p>
                </div>
              {/if}
              {#each chats as chat}
                <div class="chat-row" class:chat-row--own={chat.isOwn} class:chat-row--new={chat.isNew} id="chat-msg-{chat.id}">
                  {#if !chat.isOwn}
                    <div class="chat-avatar chat-avatar--sm chat-avatar--{chat.senderType ?? 'other'}">
                      {maskChatSender(chat).charAt(0).toUpperCase()}
                    </div>
                  {/if}
                  <div class="chat-bubble-wrap">
                  <div class="chat-bubble chat-bubble--{chat.senderType ?? (chat.isOwn ? 'own' : 'other')} {chat.isFinal ? 'chat-bubble--final' : ''} {chat.isNew ? 'chat-bubble--new' : ''}">
                    <!-- reply quote block -->
                    {#if chat.replyTo}
                      <div
                        class="chat-reply-quote chat-reply-quote--{chat.senderType ?? 'other'}"
                        role="button"
                        tabindex="0"
                        on:click={() => scrollToMessage(chat.replyTo.id)}
                        on:keydown={(e) => e.key === 'Enter' && scrollToMessage(chat.replyTo.id)}
                        title="Jump to original message"
                      >
                        <span class="chat-reply-quote-sender">{chat.replyTo.senderLabel}</span>
                        <span class="chat-reply-quote-text">
                          {#if chat.replyTo.message}
                            {chat.replyTo.message.length > 70 ? chat.replyTo.message.slice(0, 70).trimEnd() + '…' : chat.replyTo.message}
                          {:else}
                            📎 Attachment
                          {/if}
                        </span>
                      </div>
                    {/if}
                    <div class="chat-sender">{maskChatSender(chat)}</div>
                    {#if editingChatId === chat.id}
                      <!-- inline edit mode -->
                      <textarea
                        class="chat-edit-input"
                        bind:value={editingChatText}
                        rows="2"
                        on:keydown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEditChat(chat.id); }
                          if (e.key === "Escape") cancelEditChat();
                        }}
                      ></textarea>
                      <div class="chat-edit-actions">
                        <button
                          class="chat-edit-save"
                          on:click={() => saveEditChat(chat.id)}
                          disabled={savingEdit || !editingChatText.trim()}
                        >
                          {savingEdit ? "Saving…" : "Save"}
                        </button>
                        <button class="chat-edit-cancel" on:click={cancelEditChat}>Cancel</button>
                      </div>
                    {:else if chat.message}
                      {@const isLong = chat.message.length > CHAR_LIMIT}
                      {@const expanded = expandedMessages.has(chat.id)}
                      <div class="chat-text">
                        {#if isLong && !expanded}
                          {chat.message.slice(0, CHAR_LIMIT).trimEnd()}…
                        {:else}
                          {chat.message}
                        {/if}
                      </div>
                      {#if isLong}
                        <button
                          class="read-more-btn read-more-btn--{chat.senderType ?? (chat.isOwn ? 'own' : 'other')}"
                          on:click|stopPropagation={() => toggleExpand(chat.id)}
                        >
                          {#if expanded}
                            <i class="ti ti-chevron-up"></i> Show less
                          {:else}
                            <i class="ti ti-chevron-down"></i> Read more
                          {/if}
                        </button>
                      {/if}
                    {/if}
                    {#if chat.attachments?.length}
                      {@const imgs = chat.attachments.filter(a => isImage(a.mime))}
                      {@const files = chat.attachments.filter(a => !isImage(a.mime))}
                      {#if imgs.length}
                        {@const imgUrls = imgs.map(a => ATTACHMENT_BASE_URL + a.url)}
                        <div class="chat-attachments-grid" class:chat-attachments-grid--single={imgs.length === 1}>
                          {#each imgs as att, i}
                            <button
                              class="chat-attachment-img-btn"
                              on:click={() => openImageLightbox(imgUrls, i)}
                              title="View {att.name}"
                            >
                              <img src="{ATTACHMENT_BASE_URL}{att.url}" alt={att.name} class="chat-attachment-img" />
                            </button>
                          {/each}
                        </div>
                      {/if}
                      {#if files.length}
                        <div class="chat-attachments-files">
                          {#each files as att}
                            <button
                              class="chat-attachment-file {chat.senderType === 'own' ? 'chat-attachment-file--own' : ''}"
                              on:click={() => openAttachment(ATTACHMENT_BASE_URL + att.url, att.mime, att.name)}
                            >
                              <i class="ti ti-file-download me-1"></i>{att.name}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                    <div class="chat-time-row">
                      <span class="chat-time">{formatDate(chat.createdAt)}</span>
                      {#if chat.editedAt}
                        <span class="chat-edited-badge">edited</span>
                      {/if}
                      {#if chat.isFinal}
                        <span class="final-badge"><i class="ti ti-flag-check"></i> Final Quotation</span>
                      {/if}
                    </div>
                  </div>
                  </div>
                  <!-- action buttons: flag → edit → reply -->
                  <div class="chat-action-btns">
                    {#if canSetFinalFlag()}
                      <button
                        class="final-flag-btn {chat.isFinal ? 'final-flag-btn--active' : ''}"
                        title="{chat.isFinal ? 'Remove final flag' : 'Mark as Final Quotation'}"
                        disabled={settingFinalFlag === chat.id}
                        on:click={() => toggleFinalFlag(chat)}
                      >
                        {#if settingFinalFlag === chat.id}
                          <span class="spinner-border spinner-border-sm" style="width:10px;height:10px;border-width:1.5px;"></span>
                        {:else}
                          <i class="ti ti-flag"></i>
                        {/if}
                      </button>
                    {/if}
                    {#if canEditChat(chat) && editingChatId !== chat.id}
                      <button
                        class="chat-edit-btn"
                        title="Edit message (within 30 min)"
                        on:click={() => startEditChat(chat)}
                      >
                        <i class="ti ti-pencil"></i>
                      </button>
                    {/if}
                    {#if canSendChat()}
                      <button
                        class="chat-reply-btn"
                        title="Reply"
                        on:click={() => setReply(chat)}
                      >
                        <i class="ti ti-corner-up-left"></i>
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
            {#if showNewMsgBanner}
              <button class="new-msg-banner" on:click={scrollToBottom}>
                <i class="ti ti-arrow-down"></i>
                {newMsgCount > 1 ? `${newMsgCount} new messages` : "New message"}
              </button>
            {:else if !isAtBottom}
              <button class="scroll-bottom-btn" title="Scroll to bottom" on:click={scrollToBottom}>
                <i class="ti ti-arrow-down"></i>
              </button>
            {/if}
            </div>

            <!-- Input -->
            {#if canSendChat()}
              <!-- hidden file input lives outside the bar so Svelte never re-creates it -->
              <input
                type="file"
                class="d-none"
                accept={ALLOWED_TYPES}
                multiple={true}
                bind:this={fileInputEl}
                on:change={onFileSelect}
              />
              <div class="chat-input-wrap">
                {#if replyTo}
                  <div class="chat-reply-preview">
                    <i class="ti ti-corner-up-left chat-reply-preview-icon"></i>
                    <div class="chat-reply-preview-body">
                      <span class="chat-reply-preview-sender">{replyTo.senderLabel}</span>
                      <span class="chat-reply-preview-text">
                        {#if replyTo.message}
                          {replyTo.message.length > 90 ? replyTo.message.slice(0, 90).trimEnd() + '…' : replyTo.message}
                        {:else}
                          📎 Attachment
                        {/if}
                      </span>
                    </div>
                    <button class="chat-reply-preview-close" on:click={() => replyTo = null} title="Cancel reply">
                      <i class="ti ti-x"></i>
                    </button>
                  </div>
                {/if}
                {#if attachedFiles.length > 0}
                  <div class="chat-file-preview-row">
                    {#each attachedFiles as file, i}
                      <div
                        class="chat-file-chip"
                        role="button"
                        tabindex="0"
                        title="Click to preview"
                        on:click={() => previewAttachedFile(file)}
                        on:keydown={(e) => e.key === "Enter" && previewAttachedFile(file)}
                      >
                        {#if file.type.startsWith('image/')}
                          <img src={getPreviewUrl(file)} alt={file.name} class="chip-thumb" />
                        {:else}
                          <i class="ti ti-file-text"></i>
                        {/if}
                        <span class="chip-name">{file.name}</span>
                        <button type="button" class="chip-remove" on:click|stopPropagation={() => clearAttachment(i)} title="Remove">
                          <i class="ti ti-x"></i>
                        </button>
                      </div>
                    {/each}
                    {#if attachedFiles.length >= 5}
                      <span class="chip-limit-note">Max 5 files</span>
                    {/if}
                  </div>
                {/if}
                <div class="chat-input-bar">
                  <button
                    type="button"
                    class="chat-attach-btn"
                    title="Attach up to 5 files (image, PDF, doc…)"
                    on:click={triggerFilePicker}
                    disabled={attachedFiles.length >= 5}
                  >
                    <i class="ti ti-paperclip"></i>
                  </button>
                  <div class="chat-input-grow-wrap">
                    <textarea
                      class="chat-input"
                      rows="1"
                      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                      bind:value={chatMessage}
                      bind:this={chatInputEl}
                      on:input={handleTyping}
                      on:paste={handlePaste}
                      on:keydown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
                      }}
                    ></textarea>
                    {#if chatMessage.length > 100}
                      <div class="chat-char-count">{chatMessage.length}</div>
                    {/if}
                  </div>
                  <button class="chat-send-btn" on:click={sendChat} disabled={sendingChat || (!chatMessage.trim() && !attachedFiles.length)}>
                    {#if sendingChat}
                      <span class="spinner-border spinner-border-sm"></span>
                    {:else}
                      <i class="ti ti-send"></i>
                    {/if}
                  </button>
                </div>
              </div>
            {:else}
              <div class="chat-blocked">
                {#if query.status === "closed"}
                  <i class="ti ti-lock me-1"></i> This query is closed. No further messages can be sent.
                {:else if query.status === "resolved" && isTelecaller(currentUser)}
                  <i class="ti ti-check-circle me-1 text-success"></i> Query resolved — reopen to continue the discussion.
                {:else if isTech(currentUser) && (query.status === "open" || query.status === "reopened")}
                  <i class="ti ti-hand-stop me-1"></i> Pick up this query to send messages.
                {:else if isTech(currentUser) && query.assignedToId !== currentUser?.id}
                  <i class="ti ti-hand-stop me-1"></i> Pick up this query to send messages.
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .chat-card {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    height: calc(100vh - 200px);
    min-height: 480px;
    overflow: hidden;
  }
  .chat-header {
    border-bottom: 1px solid #f0f0f0;
    background: #fafafa;
    border-radius: 16px 16px 0 0;
  }
  .chat-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 15px; flex-shrink: 0;
  }
  .chat-avatar--sm { width: 32px; height: 32px; font-size: 12px; }
  .chat-avatar--support    { background: #e8f0fe; color: #3b5bdb; font-size: 18px; }
  /* own — blue */
  .chat-avatar--own        { background: #3b5bdb; color: #fff; }
  /* admin / master — purple */
  .chat-avatar--admin      { background: #7048e8; color: #fff; }
  /* tech / support team — teal */
  .chat-avatar--tech       { background: #0ca678; color: #fff; }
  /* telecaller / requester — amber */
  .chat-avatar--telecaller { background: #f59f00; color: #fff; }
  /* fallback */
  .chat-avatar--other      { background: #f1f3f5; color: #495057; }
  .chat-policy-notice {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; background: #fff5f5;
    border-bottom: 1px solid #fecaca;
    font-size: 12px; color: #991b1b;
    overflow: hidden;
  }
  .chat-policy-icon {
    font-size: 14px; color: #dc3545; flex-shrink: 0;
  }
  .chat-policy-marquee-wrap {
    flex: 1; overflow: hidden; white-space: nowrap;
  }
  .chat-policy-marquee-text {
    display: inline-block;
    animation: policy-marquee 22s linear infinite;
  }
  .chat-policy-marquee-text:hover {
    animation-play-state: paused;
  }
  @keyframes policy-marquee {
    0%   { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
  .chat-messages-wrap {
    position: relative;
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* drag-and-drop overlay */
  .drag-overlay {
    position: absolute;
    inset: 0;
    background: rgba(59, 91, 219, 0.10);
    border: 2.5px dashed #3b5bdb;
    border-radius: 8px;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    animation: drag-overlay-in 0.15s ease;
  }
  @keyframes drag-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .drag-overlay-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: #3b5bdb;
    font-weight: 700;
    font-size: 18px;
    background: rgba(255, 255, 255, 0.88);
    padding: 28px 40px;
    border-radius: 14px;
    box-shadow: 0 4px 20px rgba(59, 91, 219, 0.18);
  }
  .drag-overlay-content i { font-size: 42px; opacity: 0.85; }
  .chat-messages {
    display: flex; flex-direction: column; gap: 16px;
    padding: 20px; background: #f8f9fa;
  }
  .new-msg-banner {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    background: #3b5bdb;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    box-shadow: 0 3px 10px rgba(59,91,219,0.35);
    animation: new-msg-slide-up 0.2s ease;
    z-index: 10;
    white-space: nowrap;
  }
  .new-msg-banner:hover { background: #2f4ac2; }
  .new-msg-banner i { font-size: 13px; }
  @keyframes new-msg-slide-up {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .scroll-bottom-btn {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    width: 34px; height: 34px;
    border-radius: 50%;
    background: #fff;
    border: 1.5px solid #c5cff9;
    color: #3b5bdb;
    font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(59,91,219,0.15);
    transition: background 0.15s, border-color 0.15s;
    z-index: 10;
    animation: scroll-btn-slide-up 0.2s ease;
  }
  .scroll-bottom-btn:hover { background: #eef2ff; border-color: #748ffc; }
  @keyframes scroll-btn-slide-up {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .chat-empty { text-align: center; color: #adb5bd; margin-top: 40px; font-size: 14px; }
  .chat-empty i { font-size: 2.5rem; display: block; margin-bottom: 8px; }
  .chat-row { display: flex; align-items: flex-end; gap: 8px; }
  .chat-row--own { flex-direction: row-reverse; }
  /* highlight flash when scrolled-to */
  .chat-row--highlight .chat-bubble { animation: msg-highlight 1.5s ease; }
  @keyframes msg-highlight {
    0%, 100% { box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
    25%       { box-shadow: 0 0 0 3px #748ffc66; }
    75%       { box-shadow: 0 0 0 3px #748ffc33; }
  }
  /* new message: slide-in on row */
  .chat-row--new { animation: new-row-slide-in 0.25s ease; }
  @keyframes new-row-slide-in {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  /* new message: glow pulse on bubble */
  .chat-bubble--new { animation: new-bubble-glow 1.4s ease forwards; }
  @keyframes new-bubble-glow {
    0%   { box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
    25%  { box-shadow: 0 0 0 4px rgba(59,91,219,0.22); }
    65%  { box-shadow: 0 0 0 4px rgba(59,91,219,0.08); }
    100% { box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
  }
  .chat-bubble {
    width: 100%; padding: 10px 14px; border-radius: 16px;
    line-height: 1.5; position: relative; word-break: break-word;
    box-sizing: border-box;
  }
  /* own — light blue tint */
  .chat-bubble--own {
    background: #dbe4ff; color: #1c3faa;
    border-bottom-right-radius: 4px;
    border-right: 3px solid #3b5bdb;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  /* admin / master — light purple tint */
  .chat-bubble--admin {
    background: #f3f0ff; color: #3b2a8c;
    border-bottom-left-radius: 4px;
    border-left: 3px solid #7048e8;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  /* tech / support team — light teal tint */
  .chat-bubble--tech {
    background: #e6fcf5; color: #0b5e45;
    border-bottom-left-radius: 4px;
    border-left: 3px solid #0ca678;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  /* telecaller / requester — light amber tint */
  .chat-bubble--telecaller {
    background: #fff9db; color: #7a4800;
    border-bottom-left-radius: 4px;
    border-left: 3px solid #f59f00;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
  /* fallback — plain white */
  .chat-bubble--other {
    background: #fff; color: #212529;
    border-bottom-left-radius: 4px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  }
  /* bubble wrapper — needed for reply button hover */
  .chat-bubble-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 68%;
  }
  .chat-row--own .chat-bubble-wrap { align-items: flex-end; }
  /* extra horizontal space so the absolutely-positioned flag button isn't clipped */
  .chat-bubble-wrap { overflow: visible; }

  /* reply button — flex sibling in chat-row, shown on row hover */
  .chat-reply-btn {
    display: flex;
    align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: #f1f3f5; border: 1px solid #e9ecef;
    color: #6c757d; font-size: 13px; cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }
  .chat-reply-btn:hover { background: #dbe4ff; color: #3b5bdb; border-color: #c5cff9; }

  /*
   * Own messages use flex-direction: row-reverse.
   * HTML order: [bubble-wrap] [chat-action-btns] [own-avatar]
   * row-reverse order: avatar(right, order 0) → bubble(middle, order 2) → action-btns(left, order 3)
   */
  .chat-row--own .chat-bubble-wrap { order: 2; }

  /* reply quote block inside bubble */
  .chat-reply-quote {
    display: flex; flex-direction: column; gap: 1px;
    padding: 5px 10px; border-radius: 6px; margin-bottom: 6px;
    cursor: pointer; transition: opacity 0.15s;
    border-left: 3px solid rgba(0,0,0,0.15);
    background: rgba(0,0,0,0.05);
    max-width: 100%;
  }
  .chat-reply-quote:hover { opacity: 0.8; }
  .chat-reply-quote--own { background: rgba(59,91,219,0.1); border-left-color: rgba(59,91,219,0.4); }
  .chat-reply-quote-sender { font-size: 10.5px; font-weight: 700; opacity: 0.85; }
  .chat-reply-quote-text {
    font-size: 11.5px; opacity: 0.75;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 260px;
  }

  /* reply preview bar above input */
  .chat-reply-preview {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 16px; border-top: 1px solid #e9ecef;
    background: #f8f9fa;
  }
  .chat-reply-preview-icon { color: #3b5bdb; font-size: 16px; flex-shrink: 0; }
  .chat-reply-preview-body { flex: 1; display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
  .chat-reply-preview-sender { font-size: 11px; font-weight: 700; color: #3b5bdb; }
  .chat-reply-preview-text {
    font-size: 12px; color: #6c757d;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .chat-reply-preview-close {
    background: none; border: none; padding: 2px 4px; cursor: pointer;
    color: #adb5bd; font-size: 14px; flex-shrink: 0;
    display: flex; align-items: center; border-radius: 4px;
  }
  .chat-reply-preview-close:hover { color: #dc3545; background: #fff0f0; }

  .chat-sender { font-size: 11px; font-weight: 600; margin-bottom: 3px; opacity: 0.75; letter-spacing: 0.3px; }
  .chat-text { white-space: pre-line; font-size: 14px; }
  .read-more-btn {
    display: inline-flex; align-items: center; gap: 3px;
    background: none; border: none; padding: 2px 0 0;
    font-size: 11.5px; font-weight: 600; cursor: pointer;
    letter-spacing: 0.2px; transition: opacity 0.15s;
    opacity: 0.7;
  }
  .read-more-btn:hover { opacity: 1; }
  .read-more-btn--own        { color: #3b5bdb; }
  .read-more-btn--admin      { color: #7048e8; }
  .read-more-btn--tech       { color: #0ca678; }
  .read-more-btn--telecaller { color: #f59f00; }
  .read-more-btn--other      { color: #3b5bdb; }
  .chat-time-row {
    display: flex; align-items: center; gap: 8px;
    margin-top: 5px; justify-content: flex-end; flex-wrap: wrap;
  }
  .chat-row--own .chat-time-row { flex-direction: row-reverse; }
  .chat-time { font-size: 10px; opacity: 0.6; }
  .final-badge {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.3px;
    color: #0ca678; background: #e6fcf5; border: 1px solid #0ca678;
    padding: 1px 7px; border-radius: 20px;
  }
  .final-badge i { font-size: 10px; }

  /* final flag button — inline inside chat-action-btns */
  .final-flag-btn {
    display: flex;
    align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: #f1f3f5; border: 1px solid #e9ecef;
    color: #adb5bd; font-size: 13px; cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .final-flag-btn:hover { background: #e6fcf5; color: #0ca678; border-color: #0ca678; }
  .final-flag-btn--active { background: #e6fcf5; color: #0ca678; border-color: #0ca678; }
  .final-flag-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* highlighted bubble when marked as final quotation */
  .chat-bubble--final {
    outline: 2px solid #0ca678;
    outline-offset: 1px;
  }
  .chat-input-bar {
    display: flex; align-items: flex-end; gap: 10px;
    padding: 10px 16px 12px; background: transparent;
  }
  .chat-input-grow-wrap {
    flex: 1; position: relative; display: flex; flex-direction: column;
  }
  .chat-input {
    width: 100%; border: 1px solid #dee2e6; border-radius: 20px;
    padding: 10px 16px; font-size: 14px; resize: none; outline: none;
    line-height: 1.5; max-height: 200px; overflow-y: auto;
    transition: border-color 0.2s; box-sizing: border-box;
  }
  .chat-input:focus { border-color: #3b5bdb; }
  .chat-input { scrollbar-width: thin; scrollbar-color: #c5cff9 transparent; }
  .chat-input::-webkit-scrollbar       { width: 4px; }
  .chat-input::-webkit-scrollbar-track { background: transparent; }
  .chat-input::-webkit-scrollbar-thumb { background: #c5cff9; border-radius: 10px; }
  .chat-input::-webkit-scrollbar-thumb:hover { background: #3b5bdb; }
  .chat-char-count {
    align-self: flex-end; font-size: 11px; color: #adb5bd;
    margin-top: 3px; padding-right: 6px; user-select: none;
  }
  .chat-send-btn {
    width: 42px; height: 42px; border-radius: 50%; background: #3b5bdb;
    color: #fff; border: none; display: flex; align-items: center;
    justify-content: center; font-size: 18px; cursor: pointer; flex-shrink: 0;
    transition: background 0.2s, transform 0.1s;
  }
  .chat-send-btn:hover:not(:disabled) { background: #2f4ac2; transform: scale(1.05); }
  .chat-send-btn:disabled { background: #adb5bd; cursor: not-allowed; }
  .chat-blocked {
    padding: 14px 20px; text-align: center; font-size: 13px; color: #6c757d;
    background: #fff; border-top: 1px solid #f0f0f0; border-radius: 0 0 16px 16px;
  }
  .chat-input-wrap { background: #fff; border-top: 1px solid #f0f0f0; border-radius: 0 0 16px 16px; }
  .chat-file-preview-row {
    padding: 8px 16px 0;
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  }
  .chip-limit-note { font-size: 11px; color: #868e96; font-style: italic; }
  .chat-file-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px 5px 8px; border-radius: 20px;
    background: #eef2ff; border: 1px solid #c5cff9;
    color: #3b5bdb; font-size: 12px; font-weight: 500; max-width: 100%;
    cursor: pointer; transition: background 0.15s, border-color 0.15s;
  }
  .chat-file-chip:hover { background: #dbe4ff; border-color: #748ffc; }
  .chip-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
  .chip-remove {
    background: none; border: none; padding: 0; line-height: 1;
    color: #3b5bdb; cursor: pointer; opacity: 0.7; font-size: 13px;
    display: flex; align-items: center; flex-shrink: 0;
  }
  .chip-remove:hover { opacity: 1; }
  /* ── Chip image thumbnail ───────────────────────────────────────────────── */
  .chip-thumb {
    width: 20px; height: 20px; object-fit: cover;
    border-radius: 4px; flex-shrink: 0; display: block;
  }

  /* ── Pending-files preview modal — slider ────────────────────────────────── */
  .pf-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.50);
    z-index: 1200;
    display: flex; align-items: center; justify-content: center;
    animation: pf-fade-in 0.15s ease;
  }
  @keyframes pf-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .pf-card {
    background: #fff;
    border-radius: 18px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    width: min(420px, 94vw);
    display: flex; flex-direction: column;
    overflow: hidden;
    animation: pf-slide-in 0.18s ease;
  }
  @keyframes pf-slide-in {
    from { opacity: 0; transform: scale(0.96) translateY(-10px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
  }

  /* header */
  .pf-header {
    display: flex; align-items: center; gap: 8px;
    padding: 13px 16px;
    border-bottom: 1px solid #f1f3f5;
    font-size: 13px; font-weight: 700; color: #212529;
    flex-shrink: 0;
  }
  .pf-index {
    margin-left: auto;
    font-size: 11px; font-weight: 600; color: #868e96;
    background: #f1f3f5; padding: 2px 9px; border-radius: 20px;
  }
  .pf-close {
    background: none; border: none; padding: 2px 4px; cursor: pointer;
    color: #adb5bd; font-size: 14px;
    display: flex; align-items: center; border-radius: 4px;
    transition: color 0.15s;
  }
  .pf-close:hover { color: #dc3545; }

  /* over-limit warning */
  .pf-warn {
    display: flex; align-items: center; gap: 7px;
    padding: 8px 14px;
    background: #fff8e6; border-bottom: 1px solid #ffc94d;
    font-size: 11.5px; font-weight: 600; color: #7a4800;
    flex-shrink: 0;
  }

  /* main stage */
  .pf-stage {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    height: 240px;
    background: #f8f9fa;
    flex-shrink: 0;
    overflow: hidden;
  }
  .pf-preview {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    position: relative;
  }
  .pf-preview--overlimit::after {
    content: '';
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.28);
    pointer-events: none;
  }
  .pf-stage-img {
    max-width: 100%; max-height: 100%;
    object-fit: contain; display: block;
    user-select: none;
  }
  .pf-stage-file {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    cursor: pointer; padding: 16px; border-radius: 12px;
    transition: background 0.15s;
    outline: none;
  }
  .pf-stage-file:hover { background: rgba(59,91,219,0.06); }
  .pf-stage-file:hover .pf-stage-file-icon { color: #3b5bdb; }
  .pf-stage-file:hover .pf-stage-open-hint { opacity: 1; }
  .pf-stage-file-icon { font-size: 72px; color: #adb5bd; line-height: 1; transition: color 0.15s; }
  .pf-stage-ext {
    font-size: 12px; font-weight: 700; color: #6c757d;
    background: #e9ecef; padding: 3px 12px; border-radius: 20px;
    letter-spacing: 0.5px; text-transform: uppercase;
  }
  .pf-stage-open-hint {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 600; color: #3b5bdb;
    opacity: 0; transition: opacity 0.15s;
  }
  /* remove button — bottom-centre of stage */
  .pf-stage-remove {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 16px; border-radius: 20px;
    background: rgba(220,53,69,0.85); border: none; color: #fff;
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: background 0.15s;
    z-index: 2; white-space: nowrap;
  }
  .pf-stage-remove:hover { background: #dc3545; }
  /* over-limit badge */
  .pf-overlimit-badge {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 13px; border-radius: 20px;
    background: rgba(0,0,0,0.55); color: #fff;
    font-size: 11.5px; font-weight: 600;
    z-index: 3; white-space: nowrap;
  }
  /* arrow buttons */
  .pf-arrow {
    position: absolute; top: 50%; transform: translateY(-50%);
    z-index: 5;
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(255,255,255,0.92); border: 1px solid #dee2e6;
    color: #495057; font-size: 17px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.14);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .pf-arrow:hover { background: #fff; color: #3b5bdb; border-color: #748ffc; }
  .pf-arrow--left  { left: 10px; }
  .pf-arrow--right { right: 10px; }

  /* filename label */
  .pf-stage-name {
    padding: 8px 16px 4px;
    font-size: 11.5px; font-weight: 500; color: #495057;
    text-align: center;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    flex-shrink: 0;
  }

  /* thumbnail strip */
  .pf-strip {
    display: flex; gap: 6px; align-items: center;
    padding: 8px 14px 12px;
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .pf-strip::-webkit-scrollbar { display: none; }
  .pf-thumb {
    flex-shrink: 0;
    width: 46px; height: 46px;
    border-radius: 8px; overflow: hidden;
    border: 2.5px solid transparent;
    background: #f1f3f5;
    cursor: pointer; padding: 0;
    display: flex; align-items: center; justify-content: center;
    transition: border-color 0.15s, opacity 0.15s;
  }
  .pf-thumb--active  { border-color: #3b5bdb; }
  .pf-thumb--overlimit { opacity: 0.35; }
  .pf-thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pf-thumb-icon { font-size: 22px; color: #adb5bd; }

  /* footer */
  .pf-footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px;
    padding: 12px 16px;
    border-top: 1px solid #f1f3f5;
    flex-shrink: 0;
  }
  .pf-btn-cancel {
    padding: 7px 16px; border-radius: 8px;
    border: 1px solid #dee2e6; background: #fff;
    color: #6c757d; font-size: 13px; font-weight: 500; cursor: pointer;
    transition: background 0.15s;
  }
  .pf-btn-cancel:hover { background: #f8f9fa; }
  .pf-btn-confirm {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 18px; border-radius: 8px;
    background: #3b5bdb; border: none; color: #fff;
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: background 0.15s;
  }
  .pf-btn-confirm:hover:not(:disabled) { background: #2f4ac2; }
  .pf-btn-confirm:disabled { background: #adb5bd; cursor: not-allowed; }

  .chat-attach-btn {
    width: 36px; height: 36px; border-radius: 50%; background: #f1f3f5;
    color: #6c757d; display: flex; align-items: center; justify-content: center;
    font-size: 18px; cursor: pointer; flex-shrink: 0; border: none;
    transition: background 0.2s, color 0.2s;
  }
  .chat-attach-btn:hover:not(:disabled) { background: #e8ecf8; color: #3b5bdb; }
  .chat-attach-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .chat-attachments-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 3px;
    margin-top: 6px;
    border-radius: 8px;
    overflow: hidden;
    max-width: 200px;
  }
  .chat-attachments-grid--single { grid-template-columns: 1fr; }
  .chat-attachments-files { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .chat-attachment-img-btn {
    background: none; border: none; padding: 0; cursor: pointer;
    display: block; width: 100%; aspect-ratio: 1; overflow: hidden;
  }
  .chat-attachments-grid--single .chat-attachment-img-btn { aspect-ratio: auto; }
  .chat-attachment-img-btn:hover .chat-attachment-img { opacity: 0.85; }
  .chat-attachment-img {
    width: 100%; height: 100%; display: block;
    cursor: pointer; object-fit: cover; border: none;
    transition: opacity 0.15s;
  }
  .chat-attachments-grid--single .chat-attachment-img {
    max-width: 200px; max-height: 200px; width: auto; height: auto;
    border-radius: 8px; border: 1px solid rgba(0,0,0,0.06); object-fit: contain;
  }
  .chat-attachment-file {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 500;
    background: rgba(0,0,0,0.07); color: inherit; text-decoration: none;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .chat-attachment-file:hover { background: rgba(0,0,0,0.13); text-decoration: none; }
  .chat-attachment-file--own { background: rgba(59,91,219,0.12); color: #1c3faa; }
  .chat-attachment-file--own:hover { background: rgba(59,91,219,0.2); }

  /* ── Chat action buttons (reply + edit) ─────────────────────────────────── */
  .chat-action-btns {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-self: flex-end;
    margin-bottom: 6px;
    flex-shrink: 0;
    visibility: hidden;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .chat-row:hover .chat-action-btns { visibility: visible; opacity: 1; }
  .chat-row--own .chat-action-btns { order: 3; }

  .chat-edit-btn {
    display: flex;
    align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: #f1f3f5; border: 1px solid #e9ecef;
    color: #6c757d; font-size: 13px; cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .chat-edit-btn:hover { background: #fff3cd; color: #b45309; border-color: #fde68a; }

  .chat-edit-input {
    width: 100%;
    border: 1px solid #748ffc;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    resize: none;
    outline: none;
    line-height: 1.5;
    background: rgba(255,255,255,0.85);
    color: inherit;
    margin-top: 4px;
    box-sizing: border-box;
  }
  .chat-edit-input:focus { border-color: #3b5bdb; }

  .chat-edit-actions {
    display: flex; gap: 6px; margin-top: 5px; justify-content: flex-end;
  }
  .chat-edit-save {
    padding: 3px 12px; border-radius: 6px; border: none;
    background: #3b5bdb; color: #fff; font-size: 12px; font-weight: 600;
    cursor: pointer; transition: background 0.15s;
  }
  .chat-edit-save:hover:not(:disabled) { background: #2f4ac2; }
  .chat-edit-save:disabled { opacity: 0.55; cursor: not-allowed; }
  .chat-edit-cancel {
    padding: 3px 10px; border-radius: 6px;
    border: 1px solid #dee2e6; background: #fff;
    color: #6c757d; font-size: 12px; cursor: pointer;
    transition: background 0.15s;
  }
  .chat-edit-cancel:hover { background: #f8f9fa; }

  .chat-edited-badge {
    font-size: 9.5px; color: #adb5bd;
    font-style: italic; letter-spacing: 0.2px;
  }

  /* ── Switch shimmer bar ─────────────────────────────────────────────────── */
  /* Always 3px tall so layout never shifts — only the animation turns on/off */
  .switch-bar {
    height: 3px;
    background: transparent;
    border-radius: 3px 3px 0 0;
    flex-shrink: 0;
  }
  .switch-bar--chat {
    border-radius: 16px 16px 0 0;
  }
  .switch-bar--active {
    background: linear-gradient(90deg, #eef2ff 0%, #3b5bdb 40%, #748ffc 60%, #eef2ff 100%);
    background-size: 250% 100%;
    animation: switch-shimmer 1.2s linear infinite;
  }
  @keyframes switch-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  /* ─────────────────────────────────────────────────────────────────────────── */

  /* ── Query detail card ───────────────────────────────────────────────────── */
  .qd-card {
    background: #fff; border-radius: 6px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    overflow: hidden;
  }

  /* header */
  .qd-header {
    padding: 16px 18px 12px;
    border-bottom: 1px solid #f1f3f5;
  }
  .qd-subject-wrap {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: 10px;
  }
  .qd-subject {
    font-size: 15px; font-weight: 700;
    color: #1a1a2e; margin: 0; line-height: 1.4; flex: 1;
  }
  .qd-status-badge { flex-shrink: 0; font-size: 11px; padding: 4px 9px; border-radius: 20px; }

  /* tags */
  .qd-tags {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 10px 18px;
    border-bottom: 1px solid #f1f3f5;
  }
  .qd-tag {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11.5px; font-weight: 500;
    padding: 3px 10px; border-radius: 20px;
  }
  .qd-tag i { font-size: 12px; }
  .qd-tag--type { background: #f1f3f5; color: #495057; }
  .qd-tag--priority { color: #fff; }
  .qd-tag--high   { background: #dc3545; }
  .qd-tag--medium { background: #ffc107; color: #212529 !important; }
  .qd-tag--low    { background: #198754; }

  /* description */
  .qd-description {
    padding: 12px 18px;
    font-size: 13px; color: #6c757d;
    white-space: pre-line; line-height: 1.6;
    border-bottom: 1px solid #f1f3f5;
  }

  /* reopened alert */
  .qd-alert {
    display: flex; align-items: flex-start; gap: 8px;
    margin: 0; padding: 10px 18px;
    background: #fff9e6; border-bottom: 1px solid #fde68a;
    font-size: 12px; color: #7a5800;
  }
  .qd-alert i { font-size: 15px; color: #d97706; flex-shrink: 0; margin-top: 1px; }

  /* meta */
  .qd-meta {
    padding: 10px 18px;
    display: flex; flex-direction: column; gap: 6px;
    border-bottom: 1px solid #f1f3f5;
  }
  .qd-meta-row {
    display: flex; align-items: center;
    justify-content: space-between; gap: 8px;
  }
  .qd-meta-label {
    font-size: 11.5px; color: #adb5bd;
    display: flex; align-items: center; gap: 4px;
    white-space: nowrap; flex-shrink: 0;
  }
  .qd-meta-label i { font-size: 12px; }
  .qd-meta-value {
    font-size: 12px; color: #495057; font-weight: 500;
    text-align: right; word-break: break-word;
  }

  /* actions */
  .qd-actions {
    padding: 12px 18px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .qd-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 8px 14px; border-radius: 8px;
    font-size: 13px; font-weight: 500; cursor: pointer;
    border: none; transition: opacity 0.15s, transform 0.1s;
    width: 100%;
  }
  .qd-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .qd-btn:not(:disabled):hover { opacity: 0.88; }
  .qd-btn:not(:disabled):active { transform: scale(0.98); }
  .qd-btn i { font-size: 15px; }
  .qd-btn--success       { background: #198754; color: #fff; }
  .qd-btn--warning       { background: #ffc107; color: #212529; }
  .qd-btn--danger-outline {
    background: transparent; color: #dc3545;
    border: 1.5px solid #dc3545;
  }
  .qd-btn--danger-outline:not(:disabled):hover { background: #fff5f5; }
  /* ───────────────────────────────────────────────────────────────────────── */

  /* in-progress list */
  .in-progress-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px; border-bottom: 1px solid #f3f4f6;
    border-left: 3px solid transparent;
    cursor: pointer; user-select: none;
    transition: background 0.15s, border-color 0.15s;
  }
  .in-progress-row:last-child { border-bottom: none; }
  .in-progress-row:hover { background: #f8f9fa; }
  .in-progress-row--active { background: #eef2ff; border-left-color: #3b5bdb; }
  .in-progress-row--active:hover { background: #e5ebff; }

  /* circle avatar wrapper — needed for dot positioning */
  .ip-avatar-wrap { position: relative; flex-shrink: 0; width: 36px; height: 36px; }

  /* priority dot */
  .ip-priority-dot {
    position: absolute; top: 1px; right: 1px;
    width: 9px; height: 9px; border-radius: 50%;
    border: 1.5px solid #fff;
  }
  .ip-priority-dot--high   { background: #dc3545; }
  .ip-priority-dot--medium { background: #ffc107; }
  .ip-priority-dot--low    { background: #198754; }

  /* circle avatar */
  .ip-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid #e9ecef; background: #f8f9fa;
    color: #adb5bd; font-size: 16px; transition: border-color 0.15s, color 0.15s;
  }
  .ip-avatar--active { border-color: #c5cff9; color: #3b5bdb; background: #eef2ff; }
  .in-progress-row:hover .ip-avatar { border-color: #ced4da; }

  /* body — subject + sub-line */
  .ip-body {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden; gap: 1px;
  }
  .ip-subject {
    font-size: 13px; font-weight: 500; color: #e07b00;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ip-sub {
    font-size: 11px; color: #3b5bdb;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ip-sub--typing {
    animation: typing-fade 1.2s infinite ease-in-out;
    font-style: italic;
  }
  @keyframes typing-fade {
    0%, 100% { opacity: 0.45; }
    50%       { opacity: 1; }
  }

  /* left column — same height as chat card */
  .query-left-col {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 200px);
    min-height: 480px;
    overflow: hidden;
  }
  /* qd-card: fixed height, scrollable if content overflows */
  .query-left-col .qd-card {
    flex-shrink: 0;
    overflow-y: auto;
    min-height: 0;
  }
  /* optional linked order card: also fixed */
  .query-left-col > .card.border-0.shadow-sm.mb-3 {
    flex-shrink: 0;
  }
  /* in-progress card: fill remaining space */
  .ip-card {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .ip-card .card-header { flex-shrink: 0; }

  /* scrollable list body — fills ip-card, no fixed max-height */
  .ip-list-body {
    flex: 1 1 0;
    max-height: none;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #e9ecef transparent;
  }
  .ip-list-body::-webkit-scrollbar { width: 4px; }
  .ip-list-body::-webkit-scrollbar-track { background: transparent; }
  .ip-list-body::-webkit-scrollbar-thumb { background: #dee2e6; border-radius: 10px; }
  .ip-list-body::-webkit-scrollbar-thumb:hover { background: #adb5bd; }

  /* raised by / assigned to meta line */
  .ip-meta {
    font-size: 10px; color: #adb5bd;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: flex; align-items: center; gap: 2px; margin-top: 1px;
  }

  /* load-more bottom states */
  .ip-loading-more {
    display: flex; align-items: center; justify-content: center;
    padding: 8px 0;
  }
  .ip-all-loaded {
    text-align: center; font-size: 10px; color: #ced4da;
    padding: 6px 0; letter-spacing: 0.3px;
  }

  /* unread count */
  .in-progress-unread {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 20px; height: 20px; padding: 0 5px;
    background: #dc3545; color: #fff; border-radius: 10px;
    font-size: 10px; font-weight: 700; line-height: 1; flex-shrink: 0;
  }

  /* live status banner */
  .status-live-banner {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; border-radius: 8px; margin-bottom: 14px;
    font-size: 13.5px; font-weight: 500; border: 1px solid transparent;
    animation: banner-slide-in 0.25s ease;
    position: relative;
  }
  @keyframes banner-slide-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .status-live-banner--in-progress  { background: #fff9e6; border-color: #ffc107; color: #7a5800; }
  .status-live-banner--resolved      { background: #edfaf3; border-color: #198754; color: #145c38; }
  .status-live-banner--closed        { background: #f4f5f6; border-color: #6c757d; color: #4a4f54; }
  .status-live-banner--reopened      { background: #fff0f0; border-color: #dc3545; color: #8b1a24; }
  .status-live-banner--open          { background: #eaf1ff; border-color: #0d6efd; color: #083a85; }
  .status-banner-close {
    margin-left: auto; background: none; border: none; padding: 0;
    font-size: 14px; cursor: pointer; opacity: 0.6; color: inherit;
    display: flex; align-items: center;
  }
  .status-banner-close:hover { opacity: 1; }

  /* typing indicator */
  .typing-indicator {
    display: flex; align-items: center; gap: 2px;
    color: #3b5bdb; font-size: 12px; font-style: italic;
  }
  .typing-dot {
    display: inline-block; width: 5px; height: 5px; border-radius: 50%;
    background: #3b5bdb; animation: typing-bounce 1.2s infinite ease-in-out;
  }
  .typing-dot:nth-child(1) { animation-delay: 0s; }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typing-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-4px); opacity: 1; }
  }
</style>
