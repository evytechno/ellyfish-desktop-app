<script>
  import { createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { queryPrivacy } from "$lib/stores/queryPrivacy";

  /** @type {boolean} */
  export let open = false;
  /** @type {number|string|null} */
  export let queryId = null;
  export let currentUser = null;
  /** @type {(q: any) => boolean} */
  export let canEdit = (q) => {
    if (!q || !currentUser) return false;
    if (currentUser.role !== "user") return true;
    return currentUser.subRole === "telecaller";
  };
  /** Hide order link when already viewing from an order page */
  export let hideOrderLink = false;

  const dispatch = createEventDispatcher();

  let loading = false;
  let query = null;
  let chats = [];
  /** @type {{ url: string, name: string, mime: string, createdAt?: string }[]} */
  let files = [];
  let tab = "chat"; // chat | files
  /** @type {{ url: string, name: string, mime: string } | null} */
  let filePreview = null;
  let loadToken = 0;

  const STATUS_COLORS = {
    open: "badge bg-primary text-white",
    in_progress: "badge bg-warning text-dark",
    resolved: "badge bg-success text-white",
    reopened: "badge bg-danger text-white",
    closed: "badge bg-secondary text-white",
  };

  const PRIORITY_COLORS = {
    high: "badge bg-danger text-white",
    medium: "badge bg-warning text-dark",
    low: "badge bg-success text-white",
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

  const isMasterView = (u) => u?.role !== "user";

  $: isRoleUser = currentUser?.role === "user";
  $: isTechSubRole = currentUser?.subRole === "tech" || currentUser?.subRole === "tech_helper";
  $: isTCSubRole = currentUser?.subRole === "telecaller";

  function maskTC(name) {
    if (isRoleUser && name && name !== currentUser?.name) return "Telecaller";
    if (!isRoleUser && (isTechSubRole || (currentUser?.role === "master" && $queryPrivacy.telecaller)) && name)
      return "Telecaller";
    return name ?? "—";
  }
  function maskTech(name) {
    if (isRoleUser && name && name !== currentUser?.name) return "Tech";
    if (!isRoleUser && (isTCSubRole || (currentUser?.role === "master" && $queryPrivacy.tech)) && name)
      return "Tech";
    return name ?? "—";
  }
  function maskHelper(name) {
    if (isRoleUser && name && name !== currentUser?.name) return "Senior Tech";
    if (!isRoleUser && (isTCSubRole || (currentUser?.role === "master" && $queryPrivacy.techHelper)) && name)
      return "Senior Tech";
    return name ?? "—";
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDuration(fromStr, toStr = null) {
    if (!fromStr) return "";
    const start = new Date(fromStr).getTime();
    const end = toStr ? new Date(toStr).getTime() : Date.now();
    const ms = end - start;
    if (Number.isNaN(ms) || ms < 0) return "0m";
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    return `${Math.floor(months / 12)}y`;
  }

  function isClosedOrResolved(status) {
    return status === "closed" || status === "resolved";
  }

  function formatChatTime(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function chatPreviewText(c) {
    if (c?.isDeleted) return "[Deleted message]";
    if (c?.subQueryEvent) {
      return c.subQueryEvent.message || c.subQueryEvent.type || "Sub-query event";
    }
    if (c?.systemEvent) {
      return c.systemEvent.message || String(c.systemEvent.type || "System event").replace(/_/g, " ");
    }
    if (c?.message?.trim()) return c.message.trim();
    if (c?.attachments?.length) {
      return `${c.attachments.length} file${c.attachments.length === 1 ? "" : "s"}`;
    }
    return "—";
  }

  function isImageAtt(mime, name = "") {
    if (typeof mime === "string" && mime.startsWith("image/")) return true;
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name ?? "");
  }

  function isPdfAtt(mime, name = "") {
    if (mime === "application/pdf") return true;
    return /\.pdf$/i.test(name ?? "");
  }

  function attUrl(url) {
    if (!url) return "#";
    if (/^https?:\/\//i.test(url)) return url;
    return `${ATTACHMENT_BASE_URL || ""}${url}`;
  }

  async function downloadFile(url, name) {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name || 'attachment';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // fallback: open in new tab
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function load(id) {
    const token = ++loadToken;
    loading = true;
    query = null;
    chats = [];
    files = [];
    tab = "chat";
    filePreview = null;
    try {
      const [q, chatRes] = await Promise.all([
        authApiFetch(`${API_ROUTES.QUERY}/${id}`),
        authApiFetch(`${API_ROUTES.QUERY}/${id}/chat?limit=10`),
      ]);
      if (token !== loadToken) return;
      query = q;
      const list = Array.isArray(chatRes?.data) ? chatRes.data : [];
      chats = [...list].reverse();
      files = chats.flatMap((c) =>
        (c.attachments || []).map((a) => ({
          ...a,
          createdAt: c.createdAt,
        })),
      );
    } catch (err) {
      if (token !== loadToken) return;
      errorHandle(err);
      close();
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  function close() {
    open = false;
    query = null;
    chats = [];
    files = [];
    tab = "chat";
    filePreview = null;
    dispatch("close");
  }

  function openFilePreview(file) {
    if (!file?.url) return;
    filePreview = {
      url: attUrl(file.url),
      name: file.name || "Attachment",
      mime: file.mime || "",
    };
  }

  function closeFilePreview() {
    filePreview = null;
  }

  function onKeydown(e) {
    if (e.key !== "Escape") return;
    if (filePreview) {
      closeFilePreview();
      return;
    }
    if (open) close();
  }

  function handleEdit() {
    if (!query) return;
    const q = query;
    close();
    dispatch("edit", q);
  }

  $: if (open && queryId != null) {
    load(queryId);
  }

  $: if (!open) {
    filePreview = null;
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <div
    class="qp-qv-backdrop"
    on:click={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="button"
    tabindex="-1"
  ></div>
{/if}

<aside class="qp-qv-drawer" class:qp-qv-drawer--open={open} aria-hidden={!open}>
  <div class="qp-qv-header">
    <div class="qp-qv-header-text">
      <div class="qp-qv-eyebrow">Quick View</div>
      {#if query?.ticketCode}
        <div class="qp-qv-ticket">{query.ticketCode}</div>
      {/if}
      <h5 class="mb-0 qp-qv-title text-truncate" title={query?.subject || ""}>
        {query?.subject || (loading ? "Loading…" : "Query")}
      </h5>
    </div>
    <button type="button" class="btn-close" on:click={close} aria-label="Close"></button>
  </div>

  <div class="qp-qv-body">
    {#if loading}
      <div class="qp-qv-loading text-muted">
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
        Loading query…
      </div>
    {:else if query}
      <div class="qp-qv-section">
        <div class="qp-qv-section-title">Details</div>
        <div class="qp-qv-badges">
          <span class="{STATUS_COLORS[query.status] ?? 'badge bg-secondary'} qp-badge">
            {query.status?.replace("_", " ") ?? "—"}
          </span>
          <span class="{PRIORITY_COLORS[query.priority] ?? 'badge bg-secondary'} qp-badge">
            {query.priority ?? "—"}
          </span>
          <span class="badge bg-light text-dark border qp-badge">
            {QUERY_TYPES.find((t) => t.value === query.type)?.label ?? query.type ?? "—"}
          </span>
        </div>
        <dl class="qp-qv-dl">
          {#if isMasterView(currentUser)}
            <div class="qp-qv-row">
              <dt>Raised by</dt>
              <dd>{query.raisedBy ? maskTC(query.raisedBy.name) : "—"}</dd>
            </div>
            <div class="qp-qv-row">
              <dt>Assigned</dt>
              <dd>
                {#if query.assignedTo}
                  {query.parentQueryId
                    ? maskHelper(query.assignedTo.name)
                    : maskTech(query.assignedTo.name)}
                {:else}
                  <span class="text-muted">Unassigned</span>
                {/if}
              </dd>
            </div>
          {/if}
          {#if !hideOrderLink}
            <div class="qp-qv-row">
              <dt>Order</dt>
              <dd>
                {#if query.order}
                  <a href="/admin/order/{query.order.id}" class="text-primary">
                    #{query.order.pId}{query.order.title ? ` — ${query.order.title}` : ""}
                  </a>
                {:else}
                  —
                {/if}
              </dd>
            </div>
          {/if}
          <div class="qp-qv-row">
            <dt>Raised</dt>
            <dd>
              {formatDate(query.createdAt)}
              {#if !isClosedOrResolved(query.status)}
                <span class="qp-raised-meta qp-raised-meta--progress d-inline ms-1">
                  · {formatDuration(query.createdAt)}
                </span>
              {/if}
            </dd>
          </div>
          {#if query.resolvedAt && isClosedOrResolved(query.status)}
            <div class="qp-qv-row">
              <dt>{query.status === "closed" ? "Closed" : "Resolved"}</dt>
              <dd>
                {formatDate(query.resolvedAt)}
                <span class="qp-raised-dur">
                  · {formatDuration(query.createdAt, query.resolvedAt)}</span
                >
              </dd>
            </div>
          {/if}
          {#if query.description}
            <div class="qp-qv-row qp-qv-row--block">
              <dt>Description</dt>
              <dd class="text-break qp-qv-desc">{query.description}</dd>
            </div>
          {/if}
        </dl>
      </div>

      <div class="qp-qv-section qp-qv-section--tabs">
        <div class="qp-qv-tabs" role="tablist">
          <button
            type="button"
            class="qp-qv-tab"
            class:qp-qv-tab--active={tab === "chat"}
            role="tab"
            aria-selected={tab === "chat"}
            on:click={() => (tab = "chat")}
          >
            Chat
            <span class="qp-qv-tab-count">{chats.length}</span>
          </button>
          <button
            type="button"
            class="qp-qv-tab"
            class:qp-qv-tab--active={tab === "files"}
            role="tab"
            aria-selected={tab === "files"}
            on:click={() => (tab = "files")}
          >
            Files
            <span class="qp-qv-tab-count">{files.length}</span>
          </button>
        </div>

        {#if tab === "chat"}
          {#if chats.length}
            <ul class="qp-qv-chat">
              {#each chats as c}
                <li
                  class="qp-qv-msg"
                  class:qp-qv-msg--own={c.isOwn}
                  class:qp-qv-msg--sys={!!(c.systemEvent || c.subQueryEvent)}
                >
                  <div class="qp-qv-msg-meta">
                    <span class="qp-qv-msg-sender"
                      >{c.systemEvent || c.subQueryEvent
                        ? "System"
                        : c.senderLabel || "User"}</span
                    >
                    <span class="qp-qv-msg-time">{formatChatTime(c.createdAt)}</span>
                  </div>
                  <div class="qp-qv-msg-body">{chatPreviewText(c)}</div>
                  {#if c.attachments?.length}
                    <div class="qp-qv-msg-atts">
                      {#each c.attachments as att}
                        <button
                          type="button"
                          class="qp-qv-att-chip"
                          title="Preview {att.name}"
                          on:click={() => openFilePreview(att)}
                        >
                          {#if isImageAtt(att.mime, att.name)}
                            <img src={attUrl(att.url)} alt={att.name} class="qp-qv-att-thumb" />
                          {:else}
                            <i class="ti ti-paperclip"></i>
                          {/if}
                          <span class="text-truncate">{att.name || "File"}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-muted mb-0 qp-qv-empty">No chat messages yet</p>
          {/if}
        {:else if files.length}
          <ul class="qp-qv-files">
            {#each files as f}
              <li>
                <button
                  type="button"
                  class="qp-qv-file"
                  title="Preview {f.name}"
                  on:click={() => openFilePreview(f)}
                >
                  {#if isImageAtt(f.mime, f.name)}
                    <img src={attUrl(f.url)} alt="" class="qp-qv-file-thumb" />
                  {:else if isPdfAtt(f.mime, f.name)}
                    <span class="qp-qv-file-icon"><i class="ti ti-file-type-pdf"></i></span>
                  {:else}
                    <span class="qp-qv-file-icon"><i class="ti ti-file"></i></span>
                  {/if}
                  <span class="qp-qv-file-meta">
                    <span class="qp-qv-file-name text-truncate">{f.name || "Attachment"}</span>
                    {#if f.createdAt}
                      <span class="qp-qv-file-time">{formatChatTime(f.createdAt)}</span>
                    {/if}
                  </span>
                  <i class="ti ti-eye qp-qv-file-eye"></i>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-muted mb-0 qp-qv-empty">No files in recent chat</p>
        {/if}
      </div>
    {/if}
  </div>

  {#if query && !loading}
    <div class="qp-qv-footer">
      <a href="/admin/query/{query.id}" class="btn btn-sm btn-primary flex-fill">
        <i class="ti ti-external-link me-1"></i>Open Full
      </a>
      {#if canEdit(query)}
        <button type="button" class="btn btn-sm btn-outline-secondary flex-fill" on:click={handleEdit}>
          <i class="ti ti-edit me-1"></i>Edit
        </button>
      {/if}
    </div>
  {/if}
</aside>

{#if filePreview}
  <div
    class="qp-fp-backdrop"
    on:click={closeFilePreview}
    on:keydown={(e) => e.key === "Escape" && closeFilePreview()}
    role="button"
    tabindex="-1"
  ></div>
  <div class="qp-fp-modal" role="dialog" aria-modal="true" aria-label="File preview">
    <div class="qp-fp-header">
      <div class="qp-fp-title text-truncate" title={filePreview.name}>{filePreview.name}</div>
      <div class="qp-fp-actions">
        <button
          type="button"
          class="btn btn-sm btn-outline-light"
          title="Download"
          on:click={() => downloadFile(filePreview.url, filePreview.name)}
        >
          <i class="ti ti-download"></i>
        </button>
        <a
          href={filePreview.url}
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-sm btn-outline-light"
          title="Open in new tab"
        >
          <i class="ti ti-external-link"></i>
        </a>
        <button
          type="button"
          class="btn btn-sm btn-outline-light"
          on:click={closeFilePreview}
          aria-label="Close"
        >
          <i class="ti ti-x"></i>
        </button>
      </div>
    </div>
    <div class="qp-fp-body">
      {#if isImageAtt(filePreview.mime, filePreview.name)}
        <img src={filePreview.url} alt={filePreview.name} class="qp-fp-img" />
      {:else if isPdfAtt(filePreview.mime, filePreview.name)}
        <object data={filePreview.url} type="application/pdf" class="qp-fp-iframe">
          <div class="qp-fp-fallback">
            <i class="ti ti-file-type-pdf qp-fp-fallback-icon"></i>
            <p class="mb-1 fw-semibold">{filePreview.name}</p>
            <p class="text-muted small mb-3">PDF preview not supported in this browser</p>
            <a href={filePreview.url} download={filePreview.name} class="btn btn-sm btn-primary me-2">
              <i class="ti ti-download me-1"></i>Download
            </a>
            <a href={filePreview.url} target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-secondary">
              <i class="ti ti-external-link me-1"></i>Open
            </a>
          </div>
        </object>
      {:else}
        <div class="qp-fp-fallback">
          <i class="ti ti-file qp-fp-fallback-icon"></i>
          <p class="mb-1 fw-semibold">{filePreview.name}</p>
          <p class="text-muted small mb-3">{filePreview.mime || "File"}</p>
          <a
            href={filePreview.url}
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-primary"
          >
            Open / Download
          </a>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .qp-qv-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1040;
    background: rgba(15, 23, 42, 0.28);
  }
  .qp-qv-drawer {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 1050;
    width: min(420px, 100vw);
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #fff;
    box-shadow: -8px 0 28px rgba(15, 23, 42, 0.12);
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
    font-size: 12px;
    line-height: 1.45;
  }
  .qp-qv-drawer--open {
    transform: translateX(0);
    pointer-events: auto;
  }
  .qp-qv-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid #e9ecef;
    flex-shrink: 0;
  }
  .qp-qv-header-text {
    min-width: 0;
    flex: 1;
  }
  .qp-qv-eyebrow {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #868e96;
    font-weight: 600;
    margin-bottom: 2px;
  }
  .qp-qv-ticket {
    font-size: 10.5px;
    font-weight: 600;
    color: #364fc7;
    margin-bottom: 2px;
  }
  .qp-qv-title {
    font-size: 14px !important;
    font-weight: 600 !important;
    color: #212529;
    line-height: 1.3;
  }
  .qp-qv-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px 20px;
  }
  .qp-qv-loading {
    display: flex;
    align-items: center;
    padding: 24px 0;
  }
  .qp-qv-section {
    margin-bottom: 18px;
  }
  .qp-qv-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #868e96;
    padding-bottom: 6px;
    margin-bottom: 10px;
    border-bottom: 1px solid #f1f3f5;
  }
  .qp-qv-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .qp-qv-dl {
    margin: 0;
  }
  .qp-qv-row {
    display: grid;
    grid-template-columns: 78px 1fr;
    gap: 8px;
    padding: 5px 0;
    align-items: start;
  }
  .qp-qv-row--block {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .qp-qv-row dt {
    margin: 0;
    color: #868e96;
    font-weight: 500;
  }
  .qp-qv-row dd {
    margin: 0;
    font-weight: 500;
    color: #343a40;
  }
  .qp-qv-desc {
    font-weight: 400 !important;
    color: #495057 !important;
    white-space: pre-wrap;
    max-height: 96px;
    overflow-y: auto;
  }
  .qp-qv-empty {
    font-size: 11px;
  }
  .qp-qv-section--tabs {
    margin-bottom: 0;
  }
  .qp-qv-tabs {
    display: flex;
    gap: 4px;
    padding: 3px;
    margin-bottom: 12px;
    background: #f1f3f5;
    border-radius: 8px;
  }
  .qp-qv-tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: none;
    background: transparent;
    color: #868e96;
    font-size: 11.5px;
    font-weight: 600;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .qp-qv-tab:hover {
    color: #495057;
  }
  .qp-qv-tab--active {
    background: #fff;
    color: #212529;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  }
  .qp-qv-tab-count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: #e9ecef;
    color: #495057;
    font-size: 10px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .qp-qv-tab--active .qp-qv-tab-count {
    background: #edf2ff;
    color: #364fc7;
  }
  .qp-qv-chat {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .qp-qv-msg {
    padding: 8px 10px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
  }
  .qp-qv-msg--own {
    background: #edf2ff;
    border-color: #bac8ff;
  }
  .qp-qv-msg--sys {
    background: #fff9db;
    border-color: #ffe066;
  }
  .qp-qv-msg-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 3px;
  }
  .qp-qv-msg-sender {
    font-size: 10.5px;
    font-weight: 600;
    color: #495057;
  }
  .qp-qv-msg-time {
    font-size: 10px;
    color: #adb5bd;
  }
  .qp-qv-msg-body {
    font-size: 12px;
    color: #343a40;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .qp-qv-msg-atts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .qp-qv-att-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 160px;
    padding: 3px 8px;
    font-size: 11px;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    background: #fff;
    color: #495057;
    cursor: pointer;
  }
  .qp-qv-att-chip:hover {
    border-color: #91a7ff;
  }
  .qp-qv-att-thumb {
    width: 18px;
    height: 18px;
    object-fit: cover;
    border-radius: 3px;
  }
  .qp-qv-files {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .qp-qv-file {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    background: #f8f9fa;
    text-align: left;
    cursor: pointer;
  }
  .qp-qv-file:hover {
    border-color: #91a7ff;
    background: #edf2ff;
  }
  .qp-qv-file-eye {
    margin-left: auto;
    color: #adb5bd;
    flex-shrink: 0;
  }
  .qp-qv-file:hover .qp-qv-file-eye {
    color: #364fc7;
  }
  .qp-qv-file-thumb {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .qp-qv-file-icon {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #e9ecef;
    border-radius: 4px;
    color: #495057;
    flex-shrink: 0;
  }
  .qp-qv-file-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .qp-qv-file-name {
    font-size: 12px;
    font-weight: 500;
    color: #343a40;
  }
  .qp-qv-file-time {
    font-size: 10px;
    color: #adb5bd;
  }
  .qp-qv-footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e9ecef;
    flex-shrink: 0;
    background: #fff;
  }
  .qp-raised-meta--progress {
    color: #e67700;
    font-size: 11px;
  }
  .qp-raised-dur {
    color: #868e96;
    font-size: 11px;
    font-weight: 400;
  }

  .qp-fp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1060;
    background: rgba(10, 14, 28, 0.72);
  }
  .qp-fp-modal {
    position: fixed;
    z-index: 1070;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(860px, calc(100vw - 32px));
    max-height: min(88vh, 720px);
    display: flex;
    flex-direction: column;
    background: #111827;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
  }
  .qp-fp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    background: #1f2937;
    flex-shrink: 0;
  }
  .qp-fp-title {
    color: #f8f9fa;
    font-size: 12.5px;
    font-weight: 600;
    min-width: 0;
  }
  .qp-fp-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .qp-fp-body {
    flex: 1;
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 12px;
    background: #0b1220;
  }
  .qp-fp-img {
    max-width: 100%;
    max-height: min(72vh, 620px);
    object-fit: contain;
    border-radius: 6px;
  }
  .qp-fp-iframe {
    width: 100%;
    height: min(72vh, 620px);
    border: none;
    border-radius: 6px;
    background: #fff;
  }
  .qp-fp-fallback {
    text-align: center;
    color: #e9ecef;
    padding: 24px 16px;
  }
  .qp-fp-fallback-icon {
    font-size: 42px;
    display: block;
    margin-bottom: 10px;
    color: #91a7ff;
  }
</style>
