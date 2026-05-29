<script>
  import { onMount, onDestroy, afterUpdate, tick } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { io } from "socket.io-client";
  import { checkAuth } from "$lib/utils/auth";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { API_BASE_URL, ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { clearGroupUnread, groupUnreadStore, groupListStore, sortedByActivity } from "$lib/stores/groupChatStore";
  import Swal from "sweetalert2";
  import { showToast } from "$lib/stores/uiToast";

  $: groupId = $page.params.id;
  let currentUser;

  let group        = null;
  let members      = [];
  let myMemberRole = null;
  let messages     = [];
  let loading      = true;
  let loadingMore  = false;
  let hasMore      = true;

  let chatMessage   = "";
  let sendingChat   = false;
  let attachedFiles = [];
  let fileInputEl;
  let replyTo       = null;
  let editingId     = null;
  let editingText   = "";
  let savingEdit    = false;

  let showMembers   = false;
  let showEditModal = false;
  let editName      = "";
  let editDesc      = "";
  let editColor     = "#3b5bdb";
  let savingGroup   = false;
  let chatContainer;
  let isAtBottom    = true;

  let socket      = null;
  let typingUsers = new Map();
  let typingText  = "";
  let isTyping    = false;
  let typingTimer = null;

  const CHAR_LIMIT  = 300;
  let expandedMsgs  = new Set();

  // ── Drag & drop ────────────────────────────────────────────────────────────
  let isDragOver      = false;
  let dropPreviewFiles = [];   // pending files waiting for confirm
  let dropPreviews     = [];   // { file, objectUrl, isImage } per pending file

  // ── Lightbox ───────────────────────────────────────────────────────────────
  let lightboxSrc  = "";
  let lightboxName = "";

  // ── Unread jump ────────────────────────────────────────────────────────────
  let unreadJump = 0;

  // ── Search ─────────────────────────────────────────────────────────────────
  let searchOpen    = false;
  let searchQuery   = "";
  let searchResults = null;
  let searchLoading = false;
  let searchTimer   = null;

  // ── Link previews ──────────────────────────────────────────────────────────
  let linkPreviews = {};

  // Sender name colors (cycles through palette)
  const NAME_COLORS = ["#e03131","#2f9e44","#1971c2","#7048e8","#c2255c","#0c8599","#e67700","#5c940d"];
  const colorCache  = new Map();
  function senderColor(id) {
    if (!colorCache.has(id)) colorCache.set(id, NAME_COLORS[colorCache.size % NAME_COLORS.length]);
    return colorCache.get(id);
  }

  // ── Name resolution ────────────────────────────────────────────────────────
  function buildRoleLabel(subRole, role) {
    if (subRole === "telecaller")  return "Telecaller";
    if (subRole === "tech")        return "Tech";
    if (subRole === "tech_helper") return "Sr. Tech";
    if (role === "admin")          return "Admin";
    if (role === "master")         return "Master";
    return "Member";
  }

  function resolveName(msg) {
    if (!currentUser) return buildRoleLabel(msg.senderSubRole, msg.senderRole);
    if (msg.senderId === currentUser.id) return "You";
    const isPrivileged = currentUser.role === "master" || currentUser.role === "admin";
    if (isPrivileged) {
      // master sender → just "Master" (identity hidden)
      if (msg.senderRole === "master") return "Master";
      // others → "Real Name (Role Label)"
      return `${msg.senderNameReal} (${buildRoleLabel(msg.senderSubRole, msg.senderRole)})`;
    } else {
      // regular viewer → role label only; master sender shows as "Admin"
      if (msg.senderRole === "master") return "Admin";
      return buildRoleLabel(msg.senderSubRole, msg.senderRole);
    }
  }

  function resolveTypingName(nameReal, nameMasked) {
    if (!currentUser) return nameMasked;
    return currentUser.role === "master" || currentUser.role === "admin" ? nameReal : nameMasked;
  }

  // ── Scroll ─────────────────────────────────────────────────────────────────
  function checkBottom() {
    if (!chatContainer) return;
    isAtBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 80;
    if (isAtBottom) unreadJump = 0;
  }
  function scrollToBottom() {
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // ── Load data ──────────────────────────────────────────────────────────────
  async function loadGroup() {
    const info = await authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}`);
    group = info; members = info.members ?? []; myMemberRole = info.myMemberRole;
  }
  async function loadMessages(beforeId) {
    const p = new URLSearchParams({ limit: "30" });
    if (beforeId) p.set("before", String(beforeId));
    return authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}/messages?${p}`);
  }
  async function loadInitial() {
    loading = true;
    try {
      await loadGroup();
      const msgs = await loadMessages(undefined);
      messages = msgs; hasMore = msgs.length >= 30;
      triggerLinkPreviews(msgs);
    } catch (e) {
      if (e?.status === 403) { goto("/admin/group-chat"); return; }
    } finally { loading = false; }
    await tick();
    scrollToBottom();
    markRead();
    clearGroupUnread(Number(groupId));
    groupUnreadStore.update((c) => { const n = { ...c }; delete n[Number(groupId)]; return n; });
  }
  async function loadMore() {
    if (loadingMore || !hasMore || !messages.length) return;
    loadingMore = true;
    const topId = messages[0]?.id;
    const prevH = chatContainer?.scrollHeight ?? 0;
    try {
      const older = await loadMessages(topId);
      messages = [...older, ...messages]; hasMore = older.length >= 30;
      await tick();
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight - prevH;
    } catch (_) {} finally { loadingMore = false; }
  }
  function markRead() {
    authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}/read`, { method: "POST" }).catch(() => {});
  }

  // ── Socket ─────────────────────────────────────────────────────────────────
  function connectSocket() {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    socket = io(`${API_BASE_URL}/group-chat`, { auth: { token }, transports: ["websocket"] });
    socket.on("connect", () => socket.emit("join-group", Number(groupId)));
    socket.on("new-message", (msg) => {
      if (msg.groupId !== Number(groupId)) return;
      // Socket only sends replyToId; resolve the full replyTo object from loaded messages
      let resolvedReplyTo = msg.replyTo ?? null;
      if (!resolvedReplyTo && msg.replyToId) {
        const parent = messages.find((m) => m.id === msg.replyToId);
        if (parent) {
          resolvedReplyTo = {
            id:         parent.id,
            message:    parent.message,
            senderName: resolveName(parent),
          };
        }
      }
      messages = [...messages, { ...msg, replyTo: resolvedReplyTo, isOwn: msg.senderId === currentUser?.id }];
      if (isAtBottom) { tick().then(scrollToBottom); }
      else if (msg.senderId !== currentUser?.id) { unreadJump++; }
      if (msg.senderId !== currentUser?.id) { markRead(); clearGroupUnread(Number(groupId)); }
      if (msg.message) triggerLinkPreviews([msg]);
    });
    socket.on("message-edited", (d) => {
      if (d.groupId !== Number(groupId)) return;
      messages = messages.map((m) => m.id === d.messageId ? { ...m, message: d.message, editedAt: d.editedAt } : m);
    });
    socket.on("message-deleted", (d) => {
      if (d.groupId !== Number(groupId)) return;
      messages = messages.map((m) => m.id === d.messageId ? { ...m, isDeleted: true, message: null, attachments: null } : m);
    });
    socket.on("group-updated", (d) => {
      if (d.groupId !== Number(groupId)) return;
      group = { ...group, name: d.name, description: d.description, avatarColor: d.avatarColor };
    });
    socket.on("member-added",   (d) => { if (d.groupId === Number(groupId)) loadGroup(); });
    socket.on("member-removed", (d) => {
      if (d.groupId !== Number(groupId)) return;
      if (d.userId === currentUser?.id) { goto("/admin/group-chat"); return; }
      loadGroup();
    });
    socket.on("user-typing", (d) => {
      if (d.groupId !== Number(groupId) || d.userId === currentUser?.id) return;
      const name = resolveTypingName(d.nameReal, d.nameMasked);
      if (typingUsers.has(d.userId)) clearTimeout(typingUsers.get(d.userId).timer);
      const timer = setTimeout(() => { typingUsers.delete(d.userId); typingUsers = new Map(typingUsers); rebuildTypingText(); }, 3000);
      typingUsers.set(d.userId, { name, timer }); typingUsers = new Map(typingUsers); rebuildTypingText();
    });
    socket.on("typing-stopped", (d) => {
      if (d.groupId !== Number(groupId)) return;
      if (typingUsers.has(d.userId)) { clearTimeout(typingUsers.get(d.userId).timer); typingUsers.delete(d.userId); typingUsers = new Map(typingUsers); rebuildTypingText(); }
    });
  }
  function rebuildTypingText() {
    const names = [...typingUsers.values()].map((u) => u.name);
    if (!names.length) { typingText = ""; return; }
    if (names.length === 1)      typingText = `${names[0]} is typing…`;
    else if (names.length === 2) typingText = `${names[0]} and ${names[1]} are typing…`;
    else                         typingText = `${names.length} people are typing…`;
  }
  function emitTypingStart() {
    if (!isTyping) { isTyping = true; socket?.emit("typing-start", Number(groupId)); }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(emitTypingStop, 2500);
  }
  function emitTypingStop() {
    if (isTyping) { isTyping = false; socket?.emit("typing-stop", Number(groupId)); }
  }

  // ── Reinitialize when group changes ───────────────────────────────────────
  function resetState() {
    // Disconnect old socket
    if (socket) { socket.disconnect(); socket = null; }
    // Clear typing timers
    for (const { timer } of typingUsers.values()) clearTimeout(timer);
    clearTimeout(typingTimer);
    // Reset all chat state
    group         = null;
    members       = [];
    myMemberRole  = null;
    messages      = [];
    loading       = true;
    loadingMore   = false;
    hasMore       = true;
    chatMessage   = "";
    attachedFiles = [];
    replyTo       = null;
    editingId     = null;
    editingText   = "";
    showMembers   = false;
    showEditModal = false;
    showAddMembers = false;
    typingUsers   = new Map();
    typingText    = "";
    isTyping      = false;
    typingTimer   = null;
    expandedMsgs  = new Set();
    isDragOver    = false;
    dropPreviews  = [];
    dropPreviewFiles = [];
    lightboxSrc   = "";
    lightboxName  = "";
    unreadJump    = 0;
    searchOpen    = false;
    searchQuery   = "";
    searchResults = null;
    linkPreviews  = {};
    isAtBottom    = true;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  let initialized = false;

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    initialized = true;
    await loadInitial();
    connectSocket();
  });

  // Re-run when groupId changes (user clicks a different group in sidebar)
  $: if (initialized && groupId) {
    (async () => {
      resetState();
      await loadInitial();
      connectSocket();
    })();
  }

  onDestroy(() => {
    if (socket) { socket.disconnect(); socket = null; }
    for (const { timer } of typingUsers.values()) clearTimeout(timer);
  });
  afterUpdate(() => { if (isAtBottom) scrollToBottom(); });

  // ── Send ───────────────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = chatMessage.trim();
    if (!text && !attachedFiles.length) return;
    if (sendingChat) return;
    sendingChat = true; emitTypingStop();
    try {
      const form = new FormData();
      if (text)    form.append("message", text);
      if (replyTo) form.append("replyToId", String(replyTo.id));
      for (const f of attachedFiles) form.append("files", f);
      await authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}/messages`, { method: "POST", data: form });
      chatMessage = ""; attachedFiles = []; replyTo = null;
      // Move this group to top (own messages are skipped by global socket)
      const now = new Date().toISOString();
      const preview = text || "📎 Attachment";
      groupListStore.update((groups) =>
        sortedByActivity(
          groups.map((g) =>
            g.id === Number(groupId)
              ? { ...g, lastMessage: { message: preview, senderName: currentUser?.name ?? "You", createdAt: now } }
              : g
          )
        )
      );
      await tick(); scrollToBottom();
    } catch (e) {
      showToast({ type: "error", message: e?.data?.message ?? "Failed to send" });
    } finally { sendingChat = false; }
  }
  function handleKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    else emitTypingStart();
  }

  // ── Edit / Delete ──────────────────────────────────────────────────────────
  function startEdit(msg)  { editingId = msg.id; editingText = msg.message ?? ""; }
  function cancelEdit()    { editingId = null; editingText = ""; }
  async function saveEdit(msgId) {
    if (!editingText.trim()) return;
    savingEdit = true;
    try {
      await authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}/messages/${msgId}`, { method: "PATCH", data: { message: editingText.trim() } });
      cancelEdit();
    } catch (_) {} finally { savingEdit = false; }
  }
  async function deleteMessage(msgId) {
    const r = await Swal.fire({ title: "Delete message?", icon: "warning", showCancelButton: true, confirmButtonColor: "#dc3545", confirmButtonText: "Delete" });
    if (!r.isConfirmed) return;
    await authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}/messages/${msgId}`, { method: "DELETE" });
  }

  // ── Members ────────────────────────────────────────────────────────────────
  async function removeMember(userId) {
    const r = await Swal.fire({ title: "Remove member?", icon: "warning", showCancelButton: true, confirmButtonColor: "#dc3545", confirmButtonText: "Remove" });
    if (!r.isConfirmed) return;
    try { await authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}/members/${userId}`, { method: "DELETE" }); }
    catch (e) { showToast({ type: "error", message: "Failed to remove member" }); }
  }
  async function leaveGroup() {
    const r = await Swal.fire({ title: "Leave group?", icon: "warning", showCancelButton: true, confirmButtonText: "Leave", confirmButtonColor: "#dc3545" });
    if (!r.isConfirmed) return;
    await authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}/members/${currentUser.id}`, { method: "DELETE" });
    goto("/admin/group-chat");
  }
  async function archiveGroup() {
    const r = await Swal.fire({
      title: "Archive Group?",
      text: "This will hide the group for all members.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      confirmButtonText: "Archive",
    });
    if (!r.isConfirmed) return;
    try {
      await authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}`, { method: "DELETE" });
      groupListStore.update((g) => g.filter((x) => x.id !== Number(groupId)));
      showToast({ type: "success", message: "Group archived" });
      goto("/admin/group-chat");
    } catch (_) {
      showToast({ type: "error", message: "Failed to archive" });
    }
  }

  // ── Add Members Modal ─────────────────────────────────────────────────────
  let showAddMembers   = false;
  let addMemberSearch  = "";
  let addMemberUsers   = [];
  let addMemberLoading = false;
  let addMemberSelIds  = [];
  let addMemberSubmit  = false;

  const ROLE_LABEL = {
    telecaller: "Telecaller", tech: "Technician", tech_helper: "Senior Tech",
    manager: "Manager", admin: "Admin", master: "Master",
  };
  function userLabel(u) { return ROLE_LABEL[u.subRole ?? u.role ?? "user"] ?? "User"; }

  async function openAddMembers() {
    showAddMembers  = true;
    addMemberSelIds = [];
    addMemberSearch = "";
    if (addMemberUsers.length) return; // already loaded
    addMemberLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.USER}?limit=200`);
      const existingIds = members.map((m) => m.id);
      addMemberUsers = (res.data ?? res ?? []).filter(
        (u) => u.status === "active" && !existingIds.includes(u.id)
      );
    } catch (_) {} finally { addMemberLoading = false; }
  }
  function closeAddMembers() { showAddMembers = false; addMemberSelIds = []; addMemberSearch = ""; addMemberUsers = []; }
  function toggleAddMember(id) {
    addMemberSelIds = addMemberSelIds.includes(id)
      ? addMemberSelIds.filter((x) => x !== id)
      : [...addMemberSelIds, id];
  }
  async function submitAddMembers() {
    if (!addMemberSelIds.length) return;
    addMemberSubmit = true;
    try {
      await authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}/members`, { method: "POST", data: { userIds: addMemberSelIds } });
      showToast({ type: "success", message: `${addMemberSelIds.length} member${addMemberSelIds.length !== 1 ? "s" : ""} added!` });
      await loadGroup();
      closeAddMembers();
    } catch (e) {
      showToast({ type: "error", message: e?.data?.message ?? "Failed to add members" });
    } finally { addMemberSubmit = false; }
  }

  $: addMemberFiltered = addMemberUsers.filter((u) =>
    !addMemberSearch ||
    u.name.toLowerCase().includes(addMemberSearch.toLowerCase()) ||
    (u.subRole ?? u.role ?? "").toLowerCase().includes(addMemberSearch.toLowerCase())
  );

  // ── Group edit ────────────────────────────────────────────────────────────
  const AVATAR_COLORS = [
    "#3b5bdb","#e03131","#0ca678","#f59f00",
    "#7950f2","#0dcaf0","#2f9e44","#e64980",
  ];
  function openEditModal() {
    editName  = group?.name ?? "";
    editDesc  = group?.description ?? "";
    editColor = group?.avatarColor ?? "#3b5bdb";
    showEditModal = true;
  }
  function closeEditModal() { showEditModal = false; }
  async function saveGroupEdit() {
    if (!editName.trim()) {
      showToast({ type: "warning", message: "Group name is required" });
      return;
    }
    savingGroup = true;
    try {
      const updated = await authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}`, {
        method: "PATCH",
        data: { name: editName.trim(), description: editDesc.trim() || undefined, avatarColor: editColor },
      });
      group = { ...group, name: updated.name ?? editName.trim(), description: updated.description ?? editDesc.trim(), avatarColor: updated.avatarColor ?? editColor };
      groupListStore.update((gs) => gs.map((g) => g.id === Number(groupId) ? { ...g, name: group.name, avatarColor: group.avatarColor } : g));
      showToast({ type: "success", message: "Group updated!" });
      closeEditModal();
    } catch (e) {
      showToast({ type: "error", message: e?.data?.message ?? "Failed to update" });
    } finally {
      savingGroup = false;
    }
  }

  // ── Files ──────────────────────────────────────────────────────────────────
  function handleFileSelect(e) {
    const files = Array.from(e.target.files ?? []);
    attachedFiles = [...attachedFiles, ...files].slice(0, 5);
    e.target.value = "";
  }
  function removeFile(idx) { attachedFiles = attachedFiles.filter((_, i) => i !== idx); }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  function handleDragOver(e) { e.preventDefault(); isDragOver = true; }
  function handleDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) isDragOver = false; }
  function handleDrop(e) {
    e.preventDefault(); isDragOver = false;
    if (!canPost) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    // Build preview objects with temporary object URLs
    dropPreviews = files.slice(0, 5).map((file) => ({
      file,
      objectUrl: URL.createObjectURL(file),
      isImage:   file.type.startsWith("image/"),
    }));
    dropPreviewFiles = files.slice(0, 5);
  }
  function removeDropPreview(idx) {
    URL.revokeObjectURL(dropPreviews[idx].objectUrl);
    dropPreviews     = dropPreviews.filter((_, i) => i !== idx);
    dropPreviewFiles = dropPreviewFiles.filter((_, i) => i !== idx);
  }
  function cancelDropPreview() {
    dropPreviews.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    dropPreviews = []; dropPreviewFiles = [];
  }
  function confirmDropPreview() {
    // Merge into attachedFiles (respect overall 5-file limit)
    attachedFiles = [...attachedFiles, ...dropPreviewFiles].slice(0, 5);
    dropPreviews.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    dropPreviews = []; dropPreviewFiles = [];
  }

  // ── Lightbox ───────────────────────────────────────────────────────────────
  function isImage(att) {
    if (att.mime?.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(att.name ?? "");
  }
  function openLightbox(att) {
    lightboxSrc  = `${ATTACHMENT_BASE_URL}${att.url}`;
    lightboxName = att.name ?? "image";
  }

  // ── Unread jump ────────────────────────────────────────────────────────────
  function jumpToBottom() { scrollToBottom(); unreadJump = 0; }

  // ── Search ─────────────────────────────────────────────────────────────────
  function openSearch()  { searchOpen = true; searchQuery = ""; searchResults = null; }
  function closeSearch() { searchOpen = false; searchQuery = ""; searchResults = null; clearTimeout(searchTimer); }
  async function doSearch() {
    const q = searchQuery.trim();
    if (!q) { searchResults = null; return; }
    searchLoading = true;
    try {
      searchResults = await authApiFetch(`${API_ROUTES.GROUP_CHAT}/${groupId}/messages?q=${encodeURIComponent(q)}`);
    } catch (_) { searchResults = []; } finally { searchLoading = false; }
  }
  function onSearchInput() { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 350); }

  // ── Link previews ──────────────────────────────────────────────────────────
  const URL_REGEX = /https?:\/\/[^\s<>"']+/g;
  function extractFirstUrl(text) { return text?.match(URL_REGEX)?.[0] ?? null; }
  async function loadLinkPreview(url) {
    if (url in linkPreviews) return;
    linkPreviews[url] = null;
    try {
      const data = await authApiFetch(`${API_ROUTES.GROUP_CHAT}/link-preview?url=${encodeURIComponent(url)}`);
      if (data?.title) linkPreviews = { ...linkPreviews, [url]: data };
    } catch (_) {}
  }
  function triggerLinkPreviews(msgs) {
    for (const msg of msgs) {
      if (!msg.message || msg.isDeleted) continue;
      const url = extractFirstUrl(msg.message);
      if (url && !(url in linkPreviews)) loadLinkPreview(url);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function formatTime(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString())     return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  $: groupedMessages = (() => {
    const result = []; let lastDate = "";
    for (const msg of messages) {
      const d = formatDate(msg.createdAt);
      if (d !== lastDate) { result.push({ type: "divider", label: d }); lastDate = d; }
      result.push({ type: "message", data: msg });
    }
    return result;
  })();

  $: canManageMembers = currentUser?.role === "master" || currentUser?.role === "admin" || myMemberRole === "owner" || myMemberRole === "admin";
  $: canPost = group?.type !== "announcement" || canManageMembers;
</script>

<!-- Full-height chat shell -->
<div class="chat-shell">

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div class="chat-header">
      <a href="/admin/group-chat" class="chat-back-btn" title="Back">
        <i class="ti ti-arrow-left"></i>
      </a>

      {#if group}
        <div class="chat-header-avatar" style="background:{group.avatarColor ?? '#3b5bdb'};">
          {(group.name ?? "G")[0].toUpperCase()}
        </div>
        <div class="chat-header-info">
          <div class="chat-header-name">{group.name}</div>
          <div class="chat-header-sub">
            {members.length} member{members.length !== 1 ? "s" : ""}
            {#if group.type === "announcement"}&nbsp;·&nbsp;<i class="ti ti-speakerphone" style="font-size:10px;"></i> Announcement{/if}
          </div>
        </div>
      {:else}
        <div class="chat-header-info"><div class="chat-header-name">Loading…</div></div>
      {/if}

      <div class="chat-header-actions">
        <button class="chat-hdr-btn {searchOpen ? 'active' : ''}" on:click={() => searchOpen ? closeSearch() : openSearch()} title="Search messages">
          <i class="ti ti-search"></i>
        </button>
        {#if currentUser?.role === "master" || currentUser?.role === "admin"}
          <button class="chat-hdr-btn {showMembers ? 'active' : ''}" on:click={() => (showMembers = !showMembers)} title="Members">
            <i class="ti ti-users"></i>
          </button>
        {/if}
        {#if canManageMembers}
          <button class="chat-hdr-btn" on:click={openEditModal} title="Edit group">
            <i class="ti ti-pencil"></i>
          </button>
        {/if}
        {#if currentUser?.role === "master" || currentUser?.role === "admin"}
          <button class="chat-hdr-btn chat-hdr-btn--danger" on:click={archiveGroup} title="Archive group">
            <i class="ti ti-archive"></i>
          </button>
        {/if}
        {#if myMemberRole !== "owner"}
          <button class="chat-hdr-btn chat-hdr-btn--danger" on:click={leaveGroup} title="Leave group">
            <i class="ti ti-door-exit"></i>
          </button>
        {/if}
      </div>
    </div>

    <!-- ── Main body ───────────────────────────────────────────────────────── -->
    <div class="chat-body">

      <!-- Messages pane -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="chat-messages-pane" on:dragover={handleDragOver} on:dragleave={handleDragLeave} on:drop={handleDrop}>

        <!-- Drop overlay -->
        {#if isDragOver}
          <div class="chat-drop-overlay">
            <i class="ti ti-upload" style="font-size:2.5rem;margin-bottom:8px;"></i>
            <div>Drop files to attach</div>
          </div>
        {/if}

        {#if loading}
          <div class="chat-loading">
            <div class="spinner-border" style="color:#3b5bdb;"></div>
          </div>

        {:else if searchOpen}
          <!-- Search panel -->
          <div class="chat-search-bar">
            <i class="ti ti-search" style="color:#868e96;font-size:15px;flex-shrink:0;"></i>
            <input
              class="chat-search-input"
              type="text"
              placeholder="Search messages…"
              bind:value={searchQuery}
              on:input={onSearchInput}
              autofocus
            />
            {#if searchLoading}
              <span class="spinner-border spinner-border-sm" style="color:#3b5bdb;flex-shrink:0;"></span>
            {/if}
            <button class="chat-search-close" on:click={closeSearch}><i class="ti ti-x"></i></button>
          </div>
          <div class="chat-scroll">
            {#if searchResults === null}
              <div class="chat-search-hint">Type to search messages in this group</div>
            {:else if searchResults.length === 0}
              <div class="chat-search-hint">No messages found for "<strong>{searchQuery}</strong>"</div>
            {:else}
              <div class="chat-search-count">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</div>
              {#each searchResults as msg}
                {@const name = resolveName(msg)}
                <div class="chat-search-result">
                  <div class="chat-search-result-meta">
                    <span class="chat-search-sender" style="color:{senderColor(msg.senderId)};">{name}</span>
                    <span class="chat-search-time">{formatTime(msg.createdAt)} · {formatDate(msg.createdAt)}</span>
                  </div>
                  <div class="chat-search-text">{msg.message ?? "📎 Attachment"}</div>
                </div>
              {/each}
            {/if}
          </div>

        {:else}
          <!-- Scroll area -->
          <div class="chat-scroll" bind:this={chatContainer} on:scroll={checkBottom}>

            {#if hasMore}
              <div class="chat-load-more">
                <button class="chat-load-btn" on:click={loadMore} disabled={loadingMore}>
                  {#if loadingMore}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
                  Load older messages
                </button>
              </div>
            {/if}

            {#each groupedMessages as item}

              {#if item.type === "divider"}
                <div class="chat-date-divider">
                  <span class="chat-date-chip">{item.label}</span>
                </div>

              {:else}
                {@const msg   = item.data}
                {@const isOwn = msg.senderId === currentUser?.id}
                {@const name  = resolveName(msg)}

                <div class="chat-msg-row {isOwn ? 'chat-msg-row--own' : ''}">
                  <div class="chat-bubble-wrap">

                    <!-- Sender name (for others only) -->
                    {#if !isOwn && !msg.isDeleted}
                      <div class="chat-sender-name" style="color:{senderColor(msg.senderId)};">{name}</div>
                    {/if}

                    <!-- Bubble -->
                    <div class="chat-bubble {isOwn ? 'chat-bubble--own' : 'chat-bubble--other'}">

                      <!-- Reply quote -->
                      {#if msg.replyTo}
                        <div class="chat-reply-quote {isOwn ? 'chat-reply-quote--own' : ''}">
                          <div class="chat-reply-sender">{msg.replyTo.senderName}</div>
                          <div class="chat-reply-text">{msg.replyTo.message ?? "📎 Attachment"}</div>
                        </div>
                      {/if}

                      {#if msg.isDeleted}
                        <span class="chat-deleted">🚫 Message deleted</span>

                      {:else if editingId === msg.id}
                        <textarea
                          class="chat-edit-input"
                          rows="2"
                          bind:value={editingText}
                          on:keydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id); } }}
                        ></textarea>
                        <div class="chat-edit-actions">
                          <button class="chat-edit-save" on:click={() => saveEdit(msg.id)} disabled={savingEdit}>
                            {#if savingEdit}<span class="spinner-border spinner-border-sm"></span>{:else}Save{/if}
                          </button>
                          <button class="chat-edit-cancel" on:click={cancelEdit}>Cancel</button>
                        </div>

                      {:else}
                        <!-- Text -->
                        {#if msg.message}
                          {@const trimmed = msg.message.length > CHAR_LIMIT && !expandedMsgs.has(msg.id)}
                          <p class="chat-text">
                            {trimmed ? msg.message.slice(0, CHAR_LIMIT) + "…" : msg.message}
                          </p>
                          {#if msg.message.length > CHAR_LIMIT}
                            <button class="chat-read-more {isOwn ? 'chat-read-more--own' : ''}"
                              on:click={() => { if (expandedMsgs.has(msg.id)) expandedMsgs.delete(msg.id); else expandedMsgs.add(msg.id); expandedMsgs = expandedMsgs; }}>
                              {expandedMsgs.has(msg.id) ? "Show less" : "Read more"}
                            </button>
                          {/if}
                        {/if}

                        <!-- Attachments -->
                        {#if msg.attachments?.length}
                          <div class="chat-attachments">
                            {#each msg.attachments as att}
                              {#if isImage(att)}
                                <!-- svelte-ignore a11y-click-events-have-key-events -->
                                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                                <img
                                  src="{ATTACHMENT_BASE_URL}{att.url}"
                                  alt={att.name}
                                  class="chat-img-thumb"
                                  on:click={() => openLightbox(att)}
                                />
                              {:else}
                                <a href="{ATTACHMENT_BASE_URL}{att.url}" target="_blank" rel="noopener noreferrer"
                                  class="chat-att-link {isOwn ? 'chat-att-link--own' : ''}">
                                  <i class="ti ti-paperclip"></i> {att.name}
                                </a>
                              {/if}
                            {/each}
                          </div>
                        {/if}

                        <!-- Link preview -->
                        {#if msg.message && !msg.isDeleted}
                          {@const previewUrl = extractFirstUrl(msg.message)}
                          {#if previewUrl && linkPreviews[previewUrl]?.title}
                            {@const preview = linkPreviews[previewUrl]}
                            <a href={previewUrl} target="_blank" rel="noopener noreferrer" class="chat-link-preview {isOwn ? 'chat-link-preview--own' : ''}">
                              {#if preview.image}
                                <img src={preview.image} alt="" class="chat-preview-img" on:error={(e) => e.currentTarget.style.display='none'} />
                              {/if}
                              <div class="chat-preview-info">
                                <div class="chat-preview-title">{preview.title}</div>
                                {#if preview.description}
                                  <div class="chat-preview-desc">{preview.description.length > 100 ? preview.description.slice(0, 100) + '…' : preview.description}</div>
                                {/if}
                                <div class="chat-preview-domain">{new URL(previewUrl).hostname}</div>
                              </div>
                            </a>
                          {/if}
                        {/if}
                      {/if}

                      <!-- Footer: time + edited + actions -->
                      {#if !msg.isDeleted}
                        <div class="chat-meta">
                          <span class="chat-time {isOwn ? 'chat-time--own' : ''}">
                            {formatTime(msg.createdAt)}
                            {#if msg.editedAt}&nbsp;<em>edited</em>{/if}
                          </span>
                          <div class="chat-actions">
                            <button class="chat-act-btn" title="Reply"
                              on:click={() => (replyTo = { id: msg.id, senderName: name, message: msg.message })}>
                              <i class="ti ti-corner-up-left"></i>
                            </button>
                            {#if isOwn}
                              <button class="chat-act-btn" title="Edit" on:click={() => startEdit(msg)}>
                                <i class="ti ti-pencil"></i>
                              </button>
                            {/if}
                            {#if isOwn || canManageMembers}
                              <button class="chat-act-btn chat-act-btn--del" title="Delete" on:click={() => deleteMessage(msg.id)}>
                                <i class="ti ti-trash"></i>
                              </button>
                            {/if}
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}
            {/each}

            <!-- Typing indicator -->
            {#if typingText}
              <div class="chat-typing-row">
                <div class="chat-typing-bubble">
                  <span class="tdot"></span><span class="tdot"></span><span class="tdot"></span>
                  <span class="chat-typing-text">{typingText}</span>
                </div>
              </div>
            {/if}

            <!-- Spacer so last msg isn't hidden behind input bar -->
            <div style="height:8px;"></div>
          </div>

          <!-- ── Drop preview panel ───────────────────────────────────── -->
          {#if dropPreviews.length}
            <div class="drop-preview-backdrop" on:click|self={cancelDropPreview}>
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <!-- svelte-ignore a11y-click-events-have-key-events -->
            </div>
            <div class="drop-preview-panel">
              <div class="drop-preview-header">
                <div class="drop-preview-title">
                  <i class="ti ti-files me-2"></i>
                  Add {dropPreviews.length} file{dropPreviews.length !== 1 ? 's' : ''}?
                </div>
                <button class="drop-preview-close" on:click={cancelDropPreview}>
                  <i class="ti ti-x"></i>
                </button>
              </div>

              <div class="drop-preview-grid">
                {#each dropPreviews as item, idx}
                  <div class="drop-preview-item">
                    <!-- Remove button -->
                    <button class="drop-preview-remove" on:click={() => removeDropPreview(idx)} title="Remove">
                      <i class="ti ti-x"></i>
                    </button>
                    <!-- Thumbnail or file icon -->
                    {#if item.isImage}
                      <img src={item.objectUrl} alt={item.file.name} class="drop-preview-img" />
                    {:else}
                      <div class="drop-preview-icon">
                        <i class="ti ti-file-description"></i>
                      </div>
                    {/if}
                    <!-- File name + size -->
                    <div class="drop-preview-name" title={item.file.name}>{item.file.name}</div>
                    <div class="drop-preview-size">{(item.file.size / 1024).toFixed(0)} KB</div>
                  </div>
                {/each}
              </div>

              <div class="drop-preview-actions">
                <button class="drop-preview-confirm" on:click={confirmDropPreview}>
                  <i class="ti ti-check me-1"></i>
                  Add {dropPreviews.length} file{dropPreviews.length !== 1 ? 's' : ''}
                </button>
                <button class="drop-preview-cancel" on:click={cancelDropPreview}>Cancel</button>
              </div>
            </div>
          {/if}

          <!-- ── Unread jump button ────────────────────────────────────── -->
          {#if !isAtBottom}
            <button class="chat-jump-btn" on:click={jumpToBottom}>
              <i class="ti ti-arrow-down"></i>
              {#if unreadJump > 0}{unreadJump} new{:else}Back to bottom{/if}
            </button>
          {/if}

          <!-- ── Input bar ──────────────────────────────────────────────── -->
          <div class="chat-input-bar">

            <!-- Reply strip -->
            {#if replyTo}
              <div class="chat-reply-strip">
                <div class="chat-reply-strip-inner">
                  <div class="chat-reply-strip-name">{replyTo.senderName}</div>
                  <div class="chat-reply-strip-msg">{replyTo.message ?? "📎 Attachment"}</div>
                </div>
                <button class="chat-reply-close" on:click={() => (replyTo = null)}>
                  <i class="ti ti-x"></i>
                </button>
              </div>
            {/if}

            <!-- Attachment chips -->
            {#if attachedFiles.length}
              <div class="chat-file-chips">
                {#each attachedFiles as f, i}
                  <span class="chat-file-chip">
                    <i class="ti ti-paperclip"></i> {f.name}
                    <button on:click={() => removeFile(i)}><i class="ti ti-x"></i></button>
                  </span>
                {/each}
              </div>
            {/if}

            {#if canPost}
              <div class="chat-input-row">
                <!-- Attach -->
                <button class="chat-attach-btn" on:click={() => fileInputEl?.click()} title="Attach file">
                  <i class="ti ti-paperclip"></i>
                </button>
                <input type="file" class="d-none" bind:this={fileInputEl} multiple accept="*/*" on:change={handleFileSelect} />

                <!-- Textarea -->
                <textarea
                  class="chat-textarea"
                  rows="1"
                  placeholder="Type a message…"
                  bind:value={chatMessage}
                  on:keydown={handleKeydown}
                ></textarea>

                <!-- Send -->
                <button
                  class="chat-send-btn"
                  on:click={sendMessage}
                  disabled={sendingChat || (!chatMessage.trim() && !attachedFiles.length)}
                >
                  {#if sendingChat}
                    <span class="spinner-border spinner-border-sm"></span>
                  {:else}
                    <i class="ti ti-send"></i>
                  {/if}
                </button>
              </div>
            {:else}
              <div class="chat-readonly-bar">
                <i class="ti ti-speakerphone me-2"></i>
                Only group admins can post in this announcement group
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- ── Members panel ──────────────────────────────────────────────── -->
      {#if showMembers}
        <div class="chat-members-panel">
          <div class="chat-members-header">
            <span>Members ({members.length})</span>
            <button class="chat-members-close" on:click={() => (showMembers = false)}>
              <i class="ti ti-x"></i>
            </button>
          </div>

          <div class="chat-members-list">
            {#if currentUser?.role === "master" || currentUser?.role === "admin"}
              <!-- ── Master / Admin: flat list with real names ── -->
              {#each members as m}
                <div class="chat-member-row">
                  <div class="chat-member-avatar" style="background:{group?.avatarColor ?? '#3b5bdb'};">
                    {(m.name ?? "?")[0].toUpperCase()}
                  </div>
                  <div class="chat-member-info">
                    <div class="chat-member-name">
                      {m.name}{#if m.isYou}<span class="chat-you-tag">You</span>{/if}
                    </div>
                    <div class="chat-member-role">
                      {#if m.memberRole === "owner"}👑 Owner
                      {:else if m.memberRole === "admin"}⭐ Admin
                      {:else}Member{/if}
                    </div>
                  </div>
                  {#if canManageMembers && !m.isYou && m.memberRole !== "owner"}
                    <button class="chat-member-remove" title="Remove" on:click={() => removeMember(m.id)}>
                      <i class="ti ti-user-minus"></i>
                    </button>
                  {/if}
                </div>
              {/each}

            {:else}
              <!-- ── Regular users: grouped view with masked names ── -->
              {@const adminMembers = members.filter(m => m.role === "master" || m.role === "admin")}
              {@const teamMembers  = members.filter(m => m.subRole === "telecaller" || m.subRole === "tech" || m.subRole === "tech_helper")}

              <!-- Admin group -->
              {#if adminMembers.length}
                <div class="chat-member-group-label">
                  <i class="ti ti-shield-check me-1"></i> Admin
                  <span class="chat-member-group-count">{adminMembers.length}</span>
                </div>
                {#each adminMembers as m}
                  <div class="chat-member-row">
                    <div class="chat-member-avatar chat-member-avatar--admin" style="background:{group?.avatarColor ?? '#3b5bdb'};">
                      {m.isYou ? (m.name ?? "?")[0].toUpperCase() : (m.role === "master" ? "M" : "A")}
                    </div>
                    <div class="chat-member-info">
                      <div class="chat-member-name">
                        {m.isYou ? m.name : (m.role === "master" ? "Master" : "Admin")}
                        {#if m.isYou}<span class="chat-you-tag">You</span>{/if}
                      </div>
                      <div class="chat-member-role">
                        {#if m.memberRole === "owner"}👑 Owner
                        {:else if m.memberRole === "admin"}⭐ Admin
                        {:else}Member{/if}
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}

              <!-- Team group -->
              {#if teamMembers.length}
                <div class="chat-member-group-label">
                  <i class="ti ti-users me-1"></i> Team
                  <span class="chat-member-group-count">{teamMembers.length}</span>
                </div>
                {#each teamMembers as m}
                  {@const roleLabel = m.subRole === "telecaller" ? "Telecaller" : m.subRole === "tech" ? "Technician" : "Senior Tech"}
                  <div class="chat-member-row">
                    <div class="chat-member-avatar" style="background:{group?.avatarColor ?? '#3b5bdb'};">
                      {m.isYou ? (m.name ?? "?")[0].toUpperCase() : roleLabel[0]}
                    </div>
                    <div class="chat-member-info">
                      <div class="chat-member-name">
                        {m.isYou ? m.name : roleLabel}
                        {#if m.isYou}<span class="chat-you-tag">You</span>{/if}
                      </div>
                      <div class="chat-member-role">
                        {#if m.memberRole === "owner"}👑 Owner
                        {:else if m.memberRole === "admin"}⭐ Admin
                        {:else}Member{/if}
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}
            {/if}
          </div>

          {#if canManageMembers}
            <div class="chat-members-add">
              <button class="chat-add-member-btn" on:click={openAddMembers}>
                <i class="ti ti-user-plus me-1"></i> Add Members
              </button>
            </div>
          {/if}
        </div>
      {/if}

    </div>
  </div>

<!-- ── Edit Group Modal ──────────────────────────────────────────────────────── -->
{#if showEditModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="gc-edit-backdrop" on:click|self={closeEditModal}>
    <div class="gc-edit-card">

      <!-- Header -->
      <div class="gc-edit-header">
        <div>
          <div class="gc-edit-title">Edit Group</div>
          <div class="gc-edit-sub">Update name, description or color</div>
        </div>
        <button class="gc-edit-close" on:click={closeEditModal}>
          <i class="ti ti-x"></i>
        </button>
      </div>

      <div class="gc-edit-body">

        <!-- Name -->
        <div class="mb-3">
          <label class="form-label fw-semibold">Group Name <span class="text-danger">*</span></label>
          <input type="text" class="form-control" bind:value={editName} maxlength="80" placeholder="Group name" />
        </div>

        <!-- Description -->
        <div class="mb-3">
          <label class="form-label fw-semibold">Description <span class="text-muted small">(optional)</span></label>
          <textarea class="form-control" rows="2" bind:value={editDesc} maxlength="300" placeholder="What is this group about?"></textarea>
        </div>

        <!-- Color -->
        <div class="mb-4">
          <label class="form-label fw-semibold">Avatar Color</label>
          <div class="d-flex gap-2 flex-wrap mb-2">
            {#each AVATAR_COLORS as color}
              <button type="button" class="border-0 rounded"
                style="width:28px;height:28px;background:{color};outline:{editColor === color ? '3px solid #000' : 'none'};outline-offset:2px;cursor:pointer;"
                on:click={() => (editColor = color)}></button>
            {/each}
          </div>
          <!-- Preview -->
          <div class="d-flex align-items-center gap-2">
            <div class="d-flex align-items-center justify-content-center fw-bold text-white rounded"
              style="width:38px;height:38px;font-size:16px;background:{editColor};">
              {editName ? editName[0].toUpperCase() : "G"}
            </div>
            <span class="text-muted small">Preview</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-primary px-4" on:click={saveGroupEdit} disabled={savingGroup}>
            {#if savingGroup}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
            Save Changes
          </button>
          <button type="button" class="btn btn-outline-secondary" on:click={closeEditModal}>Cancel</button>
        </div>

      </div>
    </div>
  </div>
{/if}

<!-- ── Lightbox ────────────────────────────────────────────────────────────── -->
{#if lightboxSrc}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="chat-lightbox" on:click={() => (lightboxSrc = "")}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <img src={lightboxSrc} alt={lightboxName} on:click|stopPropagation />
    <div class="chat-lightbox-actions">
      <a href={lightboxSrc} download={lightboxName} class="chat-lightbox-btn" title="Download" on:click|stopPropagation>
        <i class="ti ti-download"></i>
      </a>
      <button class="chat-lightbox-btn" title="Close" on:click={() => (lightboxSrc = "")}>
        <i class="ti ti-x"></i>
      </button>
    </div>
  </div>
{/if}

<!-- ── Add Members Modal ─────────────────────────────────────────────────────── -->
{#if showAddMembers}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="am-backdrop" on:click|self={closeAddMembers}>
    <div class="am-card">

      <!-- Header -->
      <div class="am-header">
        <div class="am-header-left">
          <div class="am-avatar" style="background:{group?.avatarColor ?? '#3b5bdb'};">
            {(group?.name ?? "G")[0].toUpperCase()}
          </div>
          <div>
            <div class="am-title">Add Members</div>
            <div class="am-sub">{group?.name}</div>
          </div>
        </div>
        <button class="am-close" on:click={closeAddMembers}><i class="ti ti-x"></i></button>
      </div>

      <div class="am-body">

        <!-- Selected chips -->
        {#if addMemberSelIds.length > 0}
          <div class="am-chips">
            {#each addMemberUsers.filter((u) => addMemberSelIds.includes(u.id)) as u}
              <span class="am-chip">
                {u.name}
                <button on:click={() => toggleAddMember(u.id)}><i class="ti ti-x"></i></button>
              </span>
            {/each}
          </div>
        {/if}

        <!-- Search -->
        <div class="am-search-wrap">
          <i class="ti ti-search am-search-icon"></i>
          <input class="am-search" type="text" placeholder="Search users…" bind:value={addMemberSearch} />
        </div>

        <!-- User list -->
        <div class="am-list">
          {#if addMemberLoading}
            <div class="am-empty"><span class="spinner-border spinner-border-sm text-primary"></span></div>
          {:else if addMemberUsers.length === 0}
            <div class="am-empty"><i class="ti ti-users-off" style="font-size:1.6rem;opacity:0.3;display:block;margin-bottom:6px;"></i>All active users are already in this group</div>
          {:else if addMemberFiltered.length === 0}
            <div class="am-empty">No users match "<strong>{addMemberSearch}</strong>"</div>
          {:else}
            {#each addMemberFiltered as u}
              {@const selected = addMemberSelIds.includes(u.id)}
              <button class="am-user-row {selected ? 'am-user-row--sel' : ''}" on:click={() => toggleAddMember(u.id)}>
                <div class="am-user-avatar" style="background:{group?.avatarColor ?? '#3b5bdb'};">
                  {u.name[0].toUpperCase()}
                </div>
                <div class="am-user-info">
                  <div class="am-user-name">{u.name}</div>
                  <div class="am-user-role">{userLabel(u)}</div>
                </div>
                <div class="am-user-check {selected ? 'am-user-check--on' : ''}">
                  {#if selected}<i class="ti ti-check"></i>{/if}
                </div>
              </button>
            {/each}
          {/if}
        </div>

        <div class="am-count">{addMemberSelIds.length} user{addMemberSelIds.length !== 1 ? 's' : ''} selected</div>
      </div>

      <!-- Footer -->
      <div class="am-footer">
        <button class="am-btn-add" on:click={submitAddMembers} disabled={addMemberSubmit || addMemberSelIds.length === 0}>
          {#if addMemberSubmit}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
          <i class="ti ti-user-plus me-1"></i>
          Add {addMemberSelIds.length > 0 ? addMemberSelIds.length : ''} Member{addMemberSelIds.length !== 1 ? 's' : ''}
        </button>
        <button class="am-btn-cancel" on:click={closeAddMembers}>Cancel</button>
      </div>

    </div>
  </div>
{/if}

<style>
  /* ── Shell ──────────────────────────────────────────────────────────────── */
  .chat-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: linear-gradient(135deg, #3b5bdb 0%, #2546b8 100%);
    flex-shrink: 0;
    min-height: 58px;
  }
  .chat-back-btn {
    display: flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; border-radius: 50%;
    background: rgba(255,255,255,0.15); border: none;
    color: #fff; font-size: 16px; text-decoration: none;
    transition: background 0.15s; flex-shrink: 0;
  }
  .chat-back-btn:hover { background: rgba(255,255,255,0.28); color: #fff; }

  .chat-header-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700; color: #fff;
    flex-shrink: 0; border: 2px solid rgba(255,255,255,0.3);
  }
  .chat-header-info { flex: 1; min-width: 0; }
  .chat-header-name {
    font-weight: 700; color: #fff; font-size: 0.95rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .chat-header-sub { font-size: 0.72rem; color: rgba(255,255,255,0.7); }

  .chat-header-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .chat-hdr-btn {
    width: 34px; height: 34px; border-radius: 50%;
    background: rgba(255,255,255,0.15); border: none;
    color: #fff; font-size: 15px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.15s;
  }
  .chat-hdr-btn:hover, .chat-hdr-btn.active { background: rgba(255,255,255,0.28); }
  .chat-hdr-btn--danger:hover { background: rgba(220,53,69,0.5); }

  /* ── Body ───────────────────────────────────────────────────────────────── */
  .chat-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Messages pane ──────────────────────────────────────────────────────── */
  .chat-messages-pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    background: #f0f2f5;
    position: relative;
  }
  .chat-loading {
    display: flex; align-items: center; justify-content: center;
    flex: 1;
  }

  /* Scroll area */
  .chat-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px 4px;
    scroll-behavior: smooth;
  }

  /* Load more */
  .chat-load-more { text-align: center; margin-bottom: 12px; }
  .chat-load-btn {
    background: rgba(255,255,255,0.9); border: 1px solid #d0d7f5;
    border-radius: 16px; padding: 5px 16px; font-size: 0.78rem;
    color: #3b5bdb; cursor: pointer; font-weight: 500;
    display: inline-flex; align-items: center; gap: 4px;
    transition: background 0.12s;
  }
  .chat-load-btn:hover { background: #fff; }

  /* Date divider */
  .chat-date-divider { display: flex; justify-content: center; margin: 14px 0 10px; }
  .chat-date-chip {
    background: rgba(255,255,255,0.88);
    border: 1px solid #e0e7ff;
    border-radius: 12px;
    padding: 3px 12px;
    font-size: 0.7rem;
    color: #6c757d;
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }

  /* Message row */
  .chat-msg-row {
    display: flex;
    justify-content: flex-start;
    margin-bottom: 6px;
  }
  .chat-msg-row--own { justify-content: flex-end; }

  .chat-bubble-wrap { max-width: 68%; }

  .chat-sender-name {
    font-size: 0.72rem; font-weight: 600;
    margin-bottom: 2px; padding-left: 2px;
  }

  /* Bubble */
  .chat-bubble {
    position: relative;
    border-radius: 8px;
    padding: 7px 11px 4px;
    word-break: break-word;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }
  .chat-bubble--other {
    background: #fff;
    border-radius: 0 8px 8px 8px;
  }
  .chat-bubble--other::before {
    content: '';
    position: absolute;
    top: 0; left: -7px;
    border-right: 8px solid #fff;
    border-bottom: 8px solid transparent;
  }
  .chat-bubble--own {
    background: #dde3ff;
    border-radius: 8px 0 8px 8px;
  }
  .chat-bubble--own::before {
    content: '';
    position: absolute;
    top: 0; right: -7px;
    border-left: 8px solid #dde3ff;
    border-bottom: 8px solid transparent;
  }

  /* Reply quote inside bubble */
  .chat-reply-quote {
    background: rgba(0,0,0,0.06);
    border-left: 3px solid #3b5bdb;
    border-radius: 4px;
    padding: 4px 8px;
    margin-bottom: 5px;
    font-size: 0.75rem;
  }
  .chat-reply-quote--own { border-left-color: #3b5bdb; }
  .chat-reply-sender { font-weight: 600; color: #3b5bdb; font-size: 0.7rem; }
  .chat-reply-text { color: #495057; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }

  /* Text & content */
  .chat-deleted { font-style: italic; color: #adb5bd; font-size: 0.83rem; }
  .chat-text {
    font-size: 0.875rem; line-height: 1.45; margin-bottom: 2px;
    white-space: pre-wrap; color: #1a1a2e;
  }
  .chat-read-more {
    background: none; border: none; padding: 0; font-size: 0.7rem;
    color: #3b5bdb; cursor: pointer; margin-bottom: 2px;
  }
  .chat-read-more--own { color: #2546b8; }

  /* Attachments */
  .chat-attachments { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .chat-att-link {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 0.72rem; padding: 3px 8px; border-radius: 12px;
    background: rgba(0,0,0,0.07); color: #333; text-decoration: none;
    border: none; transition: background 0.12s;
  }
  .chat-att-link:hover { background: rgba(0,0,0,0.13); }
  .chat-att-link--own { background: rgba(59,91,219,0.15); color: #2546b8; }

  /* Meta footer */
  .chat-meta {
    display: flex; align-items: center; justify-content: flex-end;
    gap: 6px; margin-top: 3px;
  }
  .chat-time { font-size: 0.65rem; color: #868e96; }
  .chat-time--own { color: #4a6199; }
  .chat-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s; }
  .chat-bubble:hover .chat-actions { opacity: 1; }
  .chat-act-btn {
    background: none; border: none; padding: 2px 4px;
    font-size: 12px; color: #adb5bd; cursor: pointer; border-radius: 4px;
    transition: color 0.12s, background 0.12s;
  }
  .chat-act-btn:hover { color: #3b5bdb; background: rgba(59,91,219,0.08); }
  .chat-act-btn--del:hover { color: #dc3545; background: rgba(220,53,69,0.08); }

  /* Edit mode */
  .chat-edit-input {
    width: 100%; font-size: 0.85rem; border: 1px solid #c5cff9;
    border-radius: 6px; padding: 5px 8px; resize: none; outline: none;
    background: rgba(255,255,255,0.8); margin-bottom: 5px;
  }
  .chat-edit-input:focus { border-color: #3b5bdb; }
  .chat-edit-actions { display: flex; gap: 4px; }
  .chat-edit-save {
    background: #3b5bdb; color: #fff; border: none; border-radius: 5px;
    padding: 3px 10px; font-size: 0.75rem; cursor: pointer;
  }
  .chat-edit-cancel {
    background: transparent; color: #6c757d; border: 1px solid #dee2e6;
    border-radius: 5px; padding: 3px 10px; font-size: 0.75rem; cursor: pointer;
  }

  /* Typing indicator */
  .chat-typing-row { display: flex; justify-content: flex-start; margin-bottom: 8px; }
  .chat-typing-bubble {
    display: inline-flex; align-items: center; gap: 4px;
    background: #fff; border-radius: 0 12px 12px 12px;
    padding: 7px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }
  .chat-typing-text { font-size: 0.72rem; color: #868e96; margin-left: 4px; }
  .tdot {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    background: #3b5bdb; animation: td-bounce 1.1s ease-in-out infinite;
  }
  .tdot:nth-child(2) { animation-delay: 0.18s; }
  .tdot:nth-child(3) { animation-delay: 0.36s; }
  @keyframes td-bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30%           { transform: translateY(-5px); }
  }

  /* ── Input bar ───────────────────────────────────────────────────────────── */
  .chat-input-bar {
    background: #f0f2f5;
    padding: 8px 12px 10px;
    flex-shrink: 0;
    border-top: 1px solid #e2e6f0;
  }

  /* Reply strip */
  .chat-reply-strip {
    display: flex; align-items: center; gap: 8px;
    background: #fff; border-left: 3px solid #3b5bdb;
    border-radius: 6px; padding: 6px 10px; margin-bottom: 6px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.07);
  }
  .chat-reply-strip-inner { flex: 1; min-width: 0; }
  .chat-reply-strip-name { font-size: 0.72rem; font-weight: 600; color: #3b5bdb; }
  .chat-reply-strip-msg { font-size: 0.75rem; color: #6c757d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chat-reply-close { background: none; border: none; color: #adb5bd; font-size: 14px; cursor: pointer; padding: 2px; flex-shrink: 0; }

  /* File chips */
  .chat-file-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
  .chat-file-chip {
    display: inline-flex; align-items: center; gap: 4px;
    background: #eef2ff; border: 1px solid #c5cff9; border-radius: 12px;
    padding: 3px 10px; font-size: 0.75rem; color: #3b5bdb;
  }
  .chat-file-chip button { background: none; border: none; color: #3b5bdb; cursor: pointer; padding: 0; font-size: 11px; line-height: 1; }

  /* Input row */
  .chat-input-row {
    display: flex; align-items: flex-end; gap: 8px;
  }
  .chat-attach-btn {
    width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
    background: #fff; border: 1px solid #dee2e6;
    color: #6c757d; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: color 0.12s, border-color 0.12s;
  }
  .chat-attach-btn:hover { color: #3b5bdb; border-color: #c5cff9; }

  .chat-textarea {
    flex: 1; background: #fff; border: 1px solid #dee2e6;
    border-radius: 20px; padding: 9px 16px; font-size: 0.88rem;
    resize: none; max-height: 120px; overflow-y: auto; outline: none;
    transition: border-color 0.15s; line-height: 1.4;
  }
  .chat-textarea:focus { border-color: #3b5bdb; }

  .chat-send-btn {
    width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
    background: #3b5bdb; border: none; color: #fff; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.15s; box-shadow: 0 2px 8px rgba(59,91,219,0.3);
  }
  .chat-send-btn:hover:not(:disabled) { background: #2546b8; }
  .chat-send-btn:disabled { background: #c5cff9; box-shadow: none; cursor: not-allowed; }

  .chat-readonly-bar {
    text-align: center; color: #868e96; font-size: 0.8rem; padding: 10px 0 4px;
    display: flex; align-items: center; justify-content: center;
  }

  /* ── Members panel ───────────────────────────────────────────────────────── */
  .chat-members-panel {
    width: 260px; flex-shrink: 0;
    background: #fff; border-left: 1px solid #e0e7ff;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .chat-members-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid #e0e7ff;
    font-weight: 600; font-size: 0.88rem; color: #1a1a2e;
    background: #f7f8ff;
  }
  .chat-members-close {
    background: none; border: none; color: #adb5bd; cursor: pointer; font-size: 15px; padding: 2px;
    border-radius: 4px; transition: color 0.12s;
  }
  .chat-members-close:hover { color: #dc3545; }

  .chat-members-list { flex: 1; overflow-y: auto; }

  /* Group section label */
  .chat-member-group-label {
    display: flex; align-items: center; gap: 4px;
    padding: 8px 14px 5px;
    font-size: 0.68rem; font-weight: 700; letter-spacing: 0.5px;
    text-transform: uppercase; color: #868e96;
    background: #f7f8ff;
    border-bottom: 1px solid #e0e7ff;
    position: sticky; top: 0; z-index: 1;
  }
  .chat-member-group-count {
    margin-left: auto;
    background: #e0e7ff; color: #3b5bdb;
    border-radius: 10px; padding: 1px 7px;
    font-size: 0.65rem; font-weight: 700;
  }
  .chat-member-avatar--admin {
    border: 2px solid rgba(255,255,255,0.5);
    box-shadow: 0 0 0 2px #3b5bdb44;
  }
  .chat-member-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 14px; border-bottom: 1px solid #f3f4f6;
    transition: background 0.12s;
  }
  .chat-member-row:hover { background: #f7f8ff; }
  .chat-member-avatar {
    width: 34px; height: 34px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0;
  }
  .chat-member-info { flex: 1; min-width: 0; }
  .chat-member-name {
    font-size: 0.82rem; font-weight: 600; color: #1a1a2e;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: flex; align-items: center; gap: 5px;
  }
  .chat-you-tag {
    font-size: 0.65rem; background: #eef2ff; color: #3b5bdb;
    border-radius: 8px; padding: 1px 6px; font-weight: 500;
  }
  .chat-member-role { font-size: 0.7rem; color: #868e96; }
  .chat-member-remove {
    background: none; border: none; padding: 4px; color: #adb5bd;
    font-size: 14px; cursor: pointer; border-radius: 4px;
    transition: color 0.12s, background 0.12s; flex-shrink: 0;
  }
  .chat-member-remove:hover { color: #dc3545; background: #fff5f5; }

  .chat-members-add {
    padding: 12px 14px; border-top: 1px solid #e0e7ff; background: #f7f8ff;
  }
  .chat-add-member-btn {
    display: flex; align-items: center; justify-content: center;
    width: 100%; padding: 7px; border-radius: 8px;
    background: #eef2ff; border: 1.5px solid #c5cff9;
    color: #3b5bdb; font-size: 0.82rem; font-weight: 600;
    text-decoration: none; transition: background 0.12s;
  }
  .chat-add-member-btn:hover { background: #dde3ff; color: #2546b8; }

  /* ── Edit Group Modal ─────────────────────────────────────────────────────── */
  .gc-edit-backdrop {
    position: fixed; inset: 0; z-index: 1060;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .gc-edit-card {
    background: #fff; border-radius: 14px;
    width: 100%; max-width: 480px; max-height: 90vh;
    display: flex; flex-direction: column;
    box-shadow: 0 8px 40px rgba(0,0,0,0.18);
    overflow: hidden;
  }
  .gc-edit-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 15px 20px 13px;
    background: linear-gradient(135deg, #3b5bdb 0%, #2546b8 100%);
    flex-shrink: 0;
  }
  .gc-edit-title { font-weight: 700; color: #fff; font-size: 1rem; }
  .gc-edit-sub   { font-size: 0.72rem; color: rgba(255,255,255,0.65); }
  .gc-edit-close {
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(255,255,255,0.15); border: none; color: #fff;
    font-size: 15px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.15s; flex-shrink: 0;
  }
  .gc-edit-close:hover { background: rgba(255,255,255,0.28); }
  .gc-edit-body { padding: 20px 24px; overflow-y: auto; flex: 1; }

  /* ── Lightbox modal ────────────────────────────────────────────────────────── */
  .chat-lightbox {
    position: fixed; inset: 0; z-index: 2000;
    background: rgba(0,0,0,0.88);
    display: flex; align-items: center; justify-content: center;
    cursor: zoom-out;
  }
  .chat-lightbox img {
    max-width: 92vw; max-height: 88vh; border-radius: 8px;
    object-fit: contain; cursor: default;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
  }
  .chat-lightbox-actions {
    position: absolute; top: 16px; right: 16px;
    display: flex; gap: 8px;
  }
  .chat-lightbox-btn {
    width: 38px; height: 38px; border-radius: 50%;
    background: rgba(255,255,255,0.15); border: none; color: #fff;
    font-size: 16px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.15s; text-decoration: none;
  }
  .chat-lightbox-btn:hover { background: rgba(255,255,255,0.3); color: #fff; }

  /* ── Drop overlay ─────────────────────────────────────────────────────────── */
  .chat-drop-overlay {
    position: absolute; inset: 0; z-index: 50;
    background: rgba(59,91,219,0.18);
    border: 3px dashed #3b5bdb;
    border-radius: 8px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #3b5bdb; font-weight: 700; font-size: 1rem;
    pointer-events: none;
  }

  /* ── Jump button ──────────────────────────────────────────────────────────── */
  .chat-jump-btn {
    position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%);
    z-index: 20;
    background: #3b5bdb; color: #fff; border: none;
    border-radius: 20px; padding: 6px 16px;
    font-size: 0.78rem; font-weight: 600;
    display: inline-flex; align-items: center; gap: 6px;
    cursor: pointer; box-shadow: 0 2px 10px rgba(59,91,219,0.4);
    transition: background 0.15s;
    white-space: nowrap;
  }
  .chat-jump-btn:hover { background: #2546b8; }

  /* ── Search bar + results ──────────────────────────────────────────────────── */
  .chat-search-bar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px;
    background: #fff; border-bottom: 1px solid #e0e7ff;
    flex-shrink: 0;
  }
  .chat-search-input {
    flex: 1; border: none; outline: none; font-size: 0.88rem; background: transparent; color: #1a1a2e;
  }
  .chat-search-close {
    background: none; border: none; color: #adb5bd; cursor: pointer; font-size: 14px; padding: 2px;
    border-radius: 4px; transition: color 0.12s;
  }
  .chat-search-close:hover { color: #dc3545; }
  .chat-search-hint {
    text-align: center; color: #adb5bd; font-size: 0.82rem; padding: 32px 16px;
  }
  .chat-search-count {
    font-size: 0.72rem; color: #868e96; padding: 8px 14px 4px; font-weight: 500;
  }
  .chat-search-result {
    padding: 10px 14px; border-bottom: 1px solid #f0f2f5; cursor: default;
    transition: background 0.12s;
  }
  .chat-search-result:hover { background: #f7f8ff; }
  .chat-search-result-meta {
    display: flex; align-items: center; gap: 8px; margin-bottom: 3px;
  }
  .chat-search-sender { font-size: 0.72rem; font-weight: 600; }
  .chat-search-time   { font-size: 0.67rem; color: #adb5bd; }
  .chat-search-text   { font-size: 0.82rem; color: #1a1a2e; white-space: pre-wrap; word-break: break-word; }

  /* ── Image thumbnail + lightbox ────────────────────────────────────────────── */
  .chat-img-thumb {
    display: block; max-width: 220px; max-height: 180px;
    border-radius: 8px; cursor: zoom-in; margin-top: 4px;
    object-fit: cover; border: 1px solid rgba(0,0,0,0.08);
    transition: opacity 0.15s;
  }
  .chat-img-thumb:hover { opacity: 0.88; }

  /* ── Link preview card ─────────────────────────────────────────────────────── */
  .chat-link-preview {
    display: flex; gap: 8px; margin-top: 6px;
    background: rgba(255,255,255,0.7); border: 1px solid #e0e7ff;
    border-left: 3px solid #3b5bdb; border-radius: 6px;
    padding: 6px 8px; text-decoration: none; color: inherit;
    overflow: hidden; transition: background 0.12s;
  }
  .chat-link-preview:hover { background: rgba(238,242,255,0.9); }
  .chat-link-preview--own { border-left-color: #3b5bdb; background: rgba(59,91,219,0.07); }
  .chat-preview-img {
    width: 56px; height: 56px; object-fit: cover; border-radius: 5px; flex-shrink: 0;
  }
  .chat-preview-info { flex: 1; min-width: 0; }
  .chat-preview-title {
    font-size: 0.75rem; font-weight: 600; color: #1a1a2e;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .chat-preview-desc {
    font-size: 0.7rem; color: #6c757d; margin-top: 2px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .chat-preview-domain { font-size: 0.65rem; color: #3b5bdb; margin-top: 3px; }

  /* ── Drop preview panel ────────────────────────────────────────────────────── */
  .drop-preview-backdrop {
    position: absolute; inset: 0; z-index: 30;
    background: rgba(0,0,0,0.25);
  }
  .drop-preview-panel {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 31;
    background: #fff;
    border-top: 2px solid #3b5bdb;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 24px rgba(59,91,219,0.15);
    padding: 0 0 12px;
    animation: slide-up 0.22s ease;
  }
  @keyframes slide-up {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  /* Header */
  .drop-preview-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px 10px;
    border-bottom: 1px solid #e0e7ff;
  }
  .drop-preview-title {
    font-size: 0.88rem; font-weight: 700; color: #1a1a2e;
    display: flex; align-items: center;
  }
  .drop-preview-close {
    width: 28px; height: 28px; border-radius: 50%;
    border: none; background: #f3f4f6; color: #6c757d;
    font-size: 13px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.12s;
  }
  .drop-preview-close:hover { background: #fee2e2; color: #dc3545; }

  /* Grid of file previews */
  .drop-preview-grid {
    display: flex; gap: 10px; overflow-x: auto;
    padding: 12px 16px 10px;
    scrollbar-width: thin;
  }
  .drop-preview-item {
    position: relative; flex-shrink: 0;
    width: 96px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .drop-preview-remove {
    position: absolute; top: -4px; right: -4px; z-index: 2;
    width: 20px; height: 20px; border-radius: 50%;
    border: none; background: #dc3545; color: #fff;
    font-size: 10px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.12s;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  }
  .drop-preview-remove:hover { background: #b02a37; }
  .drop-preview-img {
    width: 96px; height: 80px; object-fit: cover;
    border-radius: 8px; border: 1px solid #e0e7ff;
  }
  .drop-preview-icon {
    width: 96px; height: 80px; border-radius: 8px;
    background: #eef2ff; border: 1px solid #c5cff9;
    display: flex; align-items: center; justify-content: center;
    color: #3b5bdb; font-size: 2rem;
  }
  .drop-preview-name {
    font-size: 0.7rem; color: #1a1a2e; font-weight: 500;
    width: 96px; text-align: center;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .drop-preview-size { font-size: 0.65rem; color: #adb5bd; }

  /* Action buttons */
  .drop-preview-actions {
    display: flex; gap: 8px; padding: 4px 16px 0;
  }
  .drop-preview-confirm {
    flex: 1; background: #3b5bdb; color: #fff;
    border: none; border-radius: 10px; padding: 9px 16px;
    font-size: 0.83rem; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.15s;
    box-shadow: 0 2px 8px rgba(59,91,219,0.3);
  }
  .drop-preview-confirm:hover { background: #2546b8; }
  .drop-preview-cancel {
    background: #f3f4f6; color: #6c757d;
    border: none; border-radius: 10px; padding: 9px 16px;
    font-size: 0.83rem; font-weight: 600; cursor: pointer;
    transition: background 0.12s;
  }
  .drop-preview-cancel:hover { background: #e9ecef; }

  /* ── Add Members Modal ─────────────────────────────────────────────────────── */
  .am-backdrop {
    position: fixed; inset: 0; z-index: 1070;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .am-card {
    background: #fff; border-radius: 16px;
    width: 100%; max-width: 460px;
    display: flex; flex-direction: column;
    max-height: 88vh;
    box-shadow: 0 10px 48px rgba(0,0,0,0.2);
    overflow: hidden;
  }

  /* Header */
  .am-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px;
    background: linear-gradient(135deg, #3b5bdb 0%, #2546b8 100%);
    flex-shrink: 0;
  }
  .am-header-left { display: flex; align-items: center; gap: 12px; }
  .am-avatar {
    width: 38px; height: 38px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 700; color: #fff;
    border: 2px solid rgba(255,255,255,0.3); flex-shrink: 0;
  }
  .am-title { font-weight: 700; color: #fff; font-size: 0.95rem; }
  .am-sub   { font-size: 0.72rem; color: rgba(255,255,255,0.65); }
  .am-close {
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(255,255,255,0.15); border: none; color: #fff;
    font-size: 14px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.15s;
  }
  .am-close:hover { background: rgba(255,255,255,0.28); }

  /* Body */
  .am-body { display: flex; flex-direction: column; flex: 1; overflow: hidden; padding: 14px 16px 0; }

  /* Chips */
  .am-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
  .am-chip {
    display: inline-flex; align-items: center; gap: 5px;
    background: #eef2ff; border: 1px solid #c5cff9;
    border-radius: 20px; padding: 3px 10px 3px 12px;
    font-size: 0.78rem; color: #3b5bdb; font-weight: 500;
  }
  .am-chip button { background: none; border: none; color: #3b5bdb; cursor: pointer; font-size: 10px; padding: 0; line-height: 1; }

  /* Search */
  .am-search-wrap { position: relative; margin-bottom: 10px; }
  .am-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: #adb5bd; font-size: 14px; }
  .am-search {
    width: 100%; border: 1px solid #dee2e6; border-radius: 10px;
    padding: 8px 12px 8px 34px; font-size: 0.85rem; outline: none;
    transition: border-color 0.15s;
  }
  .am-search:focus { border-color: #3b5bdb; }

  /* User list */
  .am-list {
    flex: 1; overflow-y: auto; border: 1px solid #e0e7ff;
    border-radius: 10px; margin-bottom: 8px;
  }
  .am-empty {
    text-align: center; color: #adb5bd; font-size: 0.82rem;
    padding: 28px 16px; display: flex; flex-direction: column; align-items: center;
  }
  .am-user-row {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 9px 12px; border: none; background: #fff;
    text-align: left; cursor: pointer; border-bottom: 1px solid #f3f4f6;
    transition: background 0.1s;
  }
  .am-user-row:last-child { border-bottom: none; }
  .am-user-row:hover { background: #f7f8ff; }
  .am-user-row--sel { background: #eef2ff; }
  .am-user-row--sel:hover { background: #e5ebff; }
  .am-user-avatar {
    width: 34px; height: 34px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0;
  }
  .am-user-info { flex: 1; min-width: 0; }
  .am-user-name { font-size: 0.84rem; font-weight: 600; color: #1a1a2e; }
  .am-user-role { font-size: 0.72rem; color: #868e96; }
  .am-user-check {
    width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid #dee2e6; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: #fff; transition: all 0.15s;
  }
  .am-user-check--on { background: #3b5bdb; border-color: #3b5bdb; }

  /* Count */
  .am-count { font-size: 0.75rem; color: #868e96; margin-bottom: 4px; }

  /* Footer */
  .am-footer {
    display: flex; gap: 8px; padding: 12px 16px;
    border-top: 1px solid #e0e7ff; background: #f7f8ff; flex-shrink: 0;
  }
  .am-btn-add {
    flex: 1; background: #3b5bdb; color: #fff;
    border: none; border-radius: 10px; padding: 10px;
    font-size: 0.85rem; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s; box-shadow: 0 2px 8px rgba(59,91,219,0.3);
  }
  .am-btn-add:hover:not(:disabled) { background: #2546b8; }
  .am-btn-add:disabled { background: #c5cff9; box-shadow: none; cursor: not-allowed; }
  .am-btn-cancel {
    background: #fff; color: #6c757d;
    border: 1px solid #dee2e6; border-radius: 10px; padding: 10px 18px;
    font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: background 0.12s;
  }
  .am-btn-cancel:hover { background: #f3f4f6; }
</style>
