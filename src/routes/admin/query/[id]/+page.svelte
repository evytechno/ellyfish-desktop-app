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
  import Swal from "sweetalert2";
  import LightBox from "$lib/components/LightBox.svelte";

  let lightboxData = [];

  function openAttachment(url, mime, name) {
    const isImg = mime
      ? mime.startsWith("image/")
      : /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name ?? "");
    if (isImg) {
      lightboxData = [url];
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  let queryId;
  let currentUser;
  let query = null;
  let chats = [];
  let loading = true;
  let chatMessage = "";
  let attachedFiles = [];
  let fileInputEl;
  let sendingChat = false;
  let actionLoading = false;

  // socket state
  let socket = null;
  let otherTyping = false;
  let typingTimer = null;
  let isTyping = false;

  $: queryId = $page.params.id;

  const isTelecaller = (u) => u?.subRole === "telecaller";
  const isTech = (u) => u?.subRole === "tech";
  const isMasterView = (u) => u?.role !== "user";

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

  $: if (chats || otherTyping) shouldScroll = true;

  afterUpdate(() => {
    if (shouldScroll && chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
      shouldScroll = false;
    }
  });

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.role === "user" && !currentUser.subRole) { goto("/admin/dashboard"); return; }
    await loadQuery();
    await loadChats();
    connectSocket();
    // mark any existing notifications for this query as read
    authApiFetch(`${API_ROUTES.QUERY}/${queryId}/read-notifications`, { method: "PATCH" }).catch(() => {});
  });

  onDestroy(() => {
    disconnectSocket();
  });

  function connectSocket() {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    socket = io(`${API_BASE_URL}/query-chat`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit("join-query", Number(queryId));
    });

    socket.on("new-message", (msg) => {
      // skip if already added locally (own message added immediately after send)
      if (chats.find((c) => c.id === msg.id)) return;

      const isOwn = msg.senderId === currentUser?.id;
      let senderLabel;

      if (isMasterView(currentUser)) {
        senderLabel = isOwn ? "You" : (msg.senderName || "Unknown");
      } else if (isOwn) {
        senderLabel = "You";
      } else if (isTelecaller(currentUser)) {
        senderLabel = "Support Team";
      } else {
        senderLabel = "Requester";
      }

      chats = [
        ...chats,
        {
          id: msg.id,
          message: msg.message,
          attachments: msg.attachments ?? [],
          createdAt: msg.createdAt,
          isOwn,
          senderLabel,
        },
      ];
    });

    socket.on("user-typing", () => { otherTyping = true; });
    socket.on("typing-stopped", () => { otherTyping = false; });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });
  }

  function disconnectSocket() {
    if (typingTimer) clearTimeout(typingTimer);
    if (socket) { socket.disconnect(); socket = null; }
  }

  function handleTyping() {
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

  async function loadQuery() {
    loading = true;
    try {
      query = await authApiFetch(`${API_ROUTES.QUERY}/${queryId}`);
    } catch (e) {
      errorHandle(e);
    } finally {
      loading = false;
    }
  }

  async function loadChats() {
    try {
      chats = await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/chat`);
      if (!Array.isArray(chats)) chats = [];
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
    chatMessage = "";
    attachedFiles = [];

    try {
      const fd = new FormData();
      if (msgText) fd.append("message", msgText);
      for (const f of msgFiles) fd.append("files", f);

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
          },
        ];
      }
      await tick();
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (e) {
      chatMessage = msgText;
      attachedFiles = msgFiles;
      Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
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
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
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
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: errorHandle(e) });
    } finally { actionLoading = false; }
  }

  function canSendChat() {
    if (!query) return false;
    if (isTelecaller(currentUser)) return query.status !== "closed" && query.status !== "resolved";
    if (isTech(currentUser)) return query.status === "in_progress" && query.assignedToId === currentUser?.id;
    return false;
  }

  function typingLabel() {
    if (isTelecaller(currentUser)) return "Support Team is typing…";
    if (isTech(currentUser)) return "Requester is typing…";
    return "Someone is typing…";
  }

  const ALLOWED_TYPES = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar";

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
      <LightBox data={lightboxData} />
      <div class="row g-4">
        <!-- Left: query info + actions -->
        <div class="col-lg-4">
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
          <div class="card border-0 shadow-sm p-4 mb-3">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <h5 class="fw-bold mb-0">{query.subject}</h5>
              <span class="badge {STATUS_COLORS[query.status] ?? 'bg-secondary'} ms-2">
                {query.status?.replace("_", " ")}
              </span>
            </div>
            <p class="text-muted mb-3" style="white-space:pre-line">{query.description}</p>

            <div class="d-flex flex-wrap gap-2 mb-3">
              <span class="badge bg-light text-dark border">
                <i class="ti ti-tag me-1"></i>{QUERY_TYPES.find(t => t.value === query.type)?.label ?? query.type ?? "Other"}
              </span>
              <span class="badge {PRIORITY_COLORS[query.priority] ?? 'bg-secondary'}">
                <i class="ti ti-alert-triangle me-1"></i>{query.priority ?? "medium"} priority
              </span>
            </div>

            {#if isTelecaller(currentUser) && query.status === "reopened"}
              <div class="alert alert-warning d-flex align-items-center gap-2 py-2 px-3 mb-3 small">
                <i class="ti ti-clock-pause fs-5"></i>
                <span>Your query has been reopened. Waiting for the support team to pick it up.</span>
              </div>
            {/if}

            <hr />
            <div class="small text-muted">
              <div class="mb-1"><i class="ti ti-calendar me-1"></i> Raised: {formatDate(query.createdAt)}</div>
              {#if query.orderId && isMasterView(currentUser)}
                <div class="mb-1"><i class="ti ti-receipt me-1"></i> Order ID: #{query.orderId}</div>
              {/if}
              {#if isMasterView(currentUser)}
                <div class="mb-1"><i class="ti ti-user me-1"></i> Raised by: {query.raisedBy?.name ?? "-"}</div>
                <div class="mb-1"><i class="ti ti-user-check me-1"></i> Assigned to: {query.assignedTo?.name ?? "Unassigned"}</div>
              {/if}
              {#if query.resolvedAt}
                <div class="mb-1"><i class="ti ti-check me-1"></i> Resolved: {formatDate(query.resolvedAt)}</div>
              {/if}
            </div>

            <div class="d-flex flex-column gap-2 mt-3">
              {#if isTech(currentUser)}
                {#if query.status === "open" || query.status === "reopened"}
                  <button class="btn btn-warning btn-sm" on:click={pickUp} disabled={actionLoading}>Pick Up Query</button>
                {/if}
                {#if query.status === "in_progress" && query.assignedToId === currentUser?.id}
                  <button class="btn btn-success btn-sm" on:click={markResolved} disabled={actionLoading}>Mark as Resolved</button>
                {/if}
              {/if}
              {#if isTelecaller(currentUser)}
                {#if query.status === "resolved"}
                  <button class="btn btn-danger btn-sm" on:click={reopen} disabled={actionLoading}>Reopen Query</button>
                  <button class="btn btn-success btn-sm" on:click={acceptSolution} disabled={actionLoading}>
                    <i class="ti ti-circle-check me-1"></i>Accept Solution
                  </button>
                {/if}
              {/if}
              {#if isMasterView(currentUser) && query.status !== "closed"}
                <button class="btn btn-outline-danger btn-sm" on:click={closeQuery} disabled={actionLoading}>Close Query</button>
              {/if}
            </div>
          </div>
        </div>

        <!-- Right: chat -->
        <div class="col-lg-8">
          <div class="chat-card d-flex flex-column">
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

            <!-- Messages -->
            <div bind:this={chatContainer} class="chat-messages flex-grow-1 overflow-auto px-4 py-3">
              {#if chats.length === 0}
                <div class="chat-empty">
                  <i class="ti ti-messages-off"></i>
                  <p>No messages yet. Start the discussion.</p>
                </div>
              {/if}
              {#each chats as chat}
                <div class="chat-row" class:chat-row--own={chat.isOwn}>
                  {#if !chat.isOwn}
                    <div class="chat-avatar chat-avatar--sm chat-avatar--other">
                      {chat.senderLabel.charAt(0).toUpperCase()}
                    </div>
                  {/if}
                  <div class="chat-bubble {chat.isOwn ? 'chat-bubble--own' : 'chat-bubble--other'}">
                    <div class="chat-sender">{chat.senderLabel}</div>
                    {#if chat.message}
                      <div class="chat-text">{chat.message}</div>
                    {/if}
                    {#if chat.attachments?.length}
                      <div class="chat-attachments">
                        {#each chat.attachments as att}
                          {#if isImage(att.mime)}
                            <button
                              class="chat-attachment-img-btn"
                              on:click={() => openAttachment(ATTACHMENT_BASE_URL + att.url, att.mime, att.name)}
                              title="View {att.name}"
                            >
                              <img src="{ATTACHMENT_BASE_URL}{att.url}" alt={att.name} class="chat-attachment-img" />
                            </button>
                          {:else}
                            <button
                              class="chat-attachment-file {chat.isOwn ? 'chat-attachment-file--own' : ''}"
                              on:click={() => openAttachment(ATTACHMENT_BASE_URL + att.url, att.mime, att.name)}
                            >
                              <i class="ti ti-file-download me-1"></i>{att.name}
                            </button>
                          {/if}
                        {/each}
                      </div>
                    {/if}
                    <div class="chat-time">{formatDate(chat.createdAt)}</div>
                  </div>
                  {#if chat.isOwn}
                    <div class="chat-avatar chat-avatar--sm chat-avatar--own">
                      {chat.senderLabel.charAt(0).toUpperCase()}
                    </div>
                  {/if}
                </div>
              {/each}
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
                {#if attachedFiles.length > 0}
                  <div class="chat-file-preview-row">
                    {#each attachedFiles as file, i}
                      <div class="chat-file-chip">
                        <i class="ti ti-{file.type.startsWith('image/') ? 'photo' : 'file-text'}"></i>
                        <span class="chip-name">{file.name}</span>
                        <button type="button" class="chip-remove" on:click={() => clearAttachment(i)} title="Remove">
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
                  <textarea
                    class="chat-input"
                    rows="1"
                    placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                    bind:value={chatMessage}
                    on:input={handleTyping}
                    on:keydown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
                    }}
                  ></textarea>
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
                  <i class="ti ti-lock me-1"></i> This query is closed.
                {:else if query.status === "resolved"}
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
    height: calc(100vh - 180px);
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
  .chat-avatar--support { background: #e8f0fe; color: #3b5bdb; font-size: 18px; }
  .chat-avatar--own { background: #3b5bdb; color: #fff; }
  .chat-avatar--other { background: #f1f3f5; color: #495057; }
  .chat-messages {
    display: flex; flex-direction: column; gap: 16px;
    padding: 20px; background: #f8f9fa;
  }
  .chat-empty { text-align: center; color: #adb5bd; margin-top: 40px; font-size: 14px; }
  .chat-empty i { font-size: 2.5rem; display: block; margin-bottom: 8px; }
  .chat-row { display: flex; align-items: flex-end; gap: 8px; }
  .chat-row--own { flex-direction: row-reverse; }
  .chat-bubble {
    max-width: 68%; padding: 10px 14px; border-radius: 16px;
    line-height: 1.5; position: relative; word-break: break-word;
  }
  .chat-bubble--own { background: #3b5bdb; color: #fff; border-bottom-right-radius: 4px; }
  .chat-bubble--other {
    background: #fff; color: #212529; border-bottom-left-radius: 4px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  }
  .chat-sender { font-size: 11px; font-weight: 600; margin-bottom: 3px; opacity: 0.75; letter-spacing: 0.3px; }
  .chat-text { white-space: pre-line; font-size: 14px; }
  .chat-time { font-size: 10px; margin-top: 5px; opacity: 0.6; text-align: right; }
  .chat-input-bar {
    display: flex; align-items: flex-end; gap: 10px;
    padding: 10px 16px 12px; background: transparent;
  }
  .chat-input {
    flex: 1; border: 1px solid #dee2e6; border-radius: 20px;
    padding: 10px 16px; font-size: 14px; resize: none; outline: none;
    line-height: 1.4; max-height: 100px; overflow-y: auto; transition: border-color 0.2s;
  }
  .chat-input:focus { border-color: #3b5bdb; }
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
  }
  .chip-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
  .chip-remove {
    background: none; border: none; padding: 0; line-height: 1;
    color: #3b5bdb; cursor: pointer; opacity: 0.7; font-size: 13px;
    display: flex; align-items: center; flex-shrink: 0;
  }
  .chip-remove:hover { opacity: 1; }
  .chat-attach-btn {
    width: 36px; height: 36px; border-radius: 50%; background: #f1f3f5;
    color: #6c757d; display: flex; align-items: center; justify-content: center;
    font-size: 18px; cursor: pointer; flex-shrink: 0; border: none;
    transition: background 0.2s, color 0.2s;
  }
  .chat-attach-btn:hover:not(:disabled) { background: #e8ecf8; color: #3b5bdb; }
  .chat-attach-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .chat-attachments { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .chat-attachment-img-btn {
    background: none; border: none; padding: 0; cursor: pointer; display: block;
  }
  .chat-attachment-img-btn:hover .chat-attachment-img { opacity: 0.85; }
  .chat-attachment-img {
    max-width: 200px; max-height: 200px; border-radius: 8px; display: block;
    cursor: pointer; object-fit: cover; border: 1px solid rgba(0,0,0,0.06);
    transition: opacity 0.15s;
  }
  .chat-attachment-file {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 500;
    background: rgba(0,0,0,0.07); color: inherit; text-decoration: none;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .chat-attachment-file:hover { background: rgba(0,0,0,0.13); text-decoration: none; }
  .chat-attachment-file--own { background: rgba(255,255,255,0.2); color: #fff; }
  .chat-attachment-file--own:hover { background: rgba(255,255,255,0.3); }

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
