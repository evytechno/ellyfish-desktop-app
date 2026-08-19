<script>
  import { createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import { queryPrivacy } from "$lib/stores/queryPrivacy";
  import {
    maskMobile,
    maskEmail,
    maskQueryPersonName,
    isMaskedRoleLabel,
    maskAuthorName,
  } from "$lib/utils/maskUser";
  import { convertDate, normalizeTypes } from "$lib/features/orders/detail/utils/index.js";

  /** @type {boolean} */
  export let open = false;
  /** @type {number|string|null} */
  export let orderId = null;
  export let currentUser = null;

  const dispatch = createEventDispatcher();

  let loading = false;
  let order = null;
  let loadToken = 0;
  let revealed = {};
  let tab = "details";
  let chats = [];
  let chatLoading = false;
  let chatLoadedFor = null;
  let chatToken = 0;

  function isRevealed(key) {
    return !!revealed[key];
  }
  function toggleReveal(key) {
    revealed = { ...revealed, [key]: !revealed[key] };
  }
  function displaySensitive(key, value, kind) {
    if (!value) return "—";
    if (isRevealed(key)) return value;
    return kind === "email" ? maskEmail(value) : maskMobile(value);
  }

  const STATUS_COLORS = {
    "New Lead": "bg-primary text-white",
    Contacted: "bg-info text-white",
    "Follow Up": "bg-warning text-dark",
    Qualified: "bg-success text-white",
    Unqualified: "bg-danger text-white",
    "Needs Assessment": "bg-warning text-dark",
    "Quotation Sent": "bg-info text-white",
    "Negotiation In Progress": "bg-warning text-dark",
    "Deal Won": "bg-success text-white",
    "Deal Lost": "bg-danger text-white",
    Reference: "bg-secondary text-white",
    Dispatched: "bg-primary text-white",
    Completed: "bg-success text-white",
    Cancelled: "bg-danger text-white",
  };

  $: statusLabel = order
    ? ($statusNamesStore[order.status]?.name ?? order.status ?? "—")
    : "—";
  $: statusCls = order ? (STATUS_COLORS[order.status] ?? "bg-secondary") : "bg-secondary";
  $: clientName =
    order?.client?.name ||
    order?.orderClients?.[0]?.name ||
    order?.company ||
    "—";
  $: primaryContact =
    order?.client?.contacts?.find((c) => c.isPrimary) ||
    order?.client?.contacts?.[0] ||
    order?.orderClients?.[0] ||
    null;
  $: piCount = order?.orderPayments?.length ?? 0;
  $: woCount = order?.workOrders?.length ?? 0;
  $: latestWo = order?.workOrders?.length
    ? [...order.workOrders].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]
    : null;

  function fmtDate(d, withTime = false) {
    if (!d) return "—";
    const opts = {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
    };
    return new Date(d).toLocaleString("en-IN", opts);
  }

  function fmtMoney(amount, currency = "INR") {
    if (amount == null || amount === "") return "—";
    const n = Number(amount);
    if (Number.isNaN(n)) return String(amount);
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency || "INR",
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `₹${n.toLocaleString("en-IN")}`;
    }
  }

  function orderCode(o) {
    if (!o) return "";
    if (o.financialYear && o.pId != null) {
      return `${o.financialYear}/${String(o.pId).padStart(6, "0")}`;
    }
    if (o.pId != null) return `#${o.pId}`;
    return `#${o.id}`;
  }

  function displayOrderNo(o) {
    if (!o) return "";
    return o.pId != null ? `#${o.pId}` : `#${o.id}`;
  }

  function stripHtml(html) {
    if (!html) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").trim();
  }

  function resetChatState() {
    chats = [];
    chatLoadedFor = null;
    chatLoading = false;
    chatToken += 1;
  }

  function chatTypeClass(nt) {
    if (nt === "Call") return "bg-primary text-white";
    if (nt === "WhatsApp") return "bg-success text-white";
    if (nt === "Email") return "bg-warning text-dark";
    return "bg-light text-dark border";
  }

  function selectTab(next) {
    tab = next;
    if (next === "chat" && order?.id) loadChats(order.id);
  }

  async function loadChats(id) {
    const oid = Number(id);
    if (!oid || chatLoadedFor === oid || chatLoading) return;
    const token = ++chatToken;
    chatLoading = true;
    try {
      const res = await authApiFetch(
        `${API_ROUTES.ORDER_CHAT}?orderId=${oid}&limit=50&offset=0`,
      );
      if (token !== chatToken) return;
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      chats = (list || [])
        .filter((c) => !c?.deletedAt)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      chatLoadedFor = oid;
    } catch (err) {
      if (token !== chatToken) return;
      errorHandle(err);
    } finally {
      if (token === chatToken) chatLoading = false;
    }
  }

  async function load(id) {
    const token = ++loadToken;
    loading = true;
    order = null;
    revealed = {};
    tab = "details";
    resetChatState();
    try {
      const data = await authApiFetch(`${API_ROUTES.ORDER}/${id}/basic`);
      if (token !== loadToken) return;
      order = data;
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
    order = null;
    revealed = {};
    tab = "details";
    resetChatState();
    dispatch("close");
  }

  function onKeydown(e) {
    if (e.key === "Escape" && open) close();
  }

  $: if (open && orderId != null) {
    load(orderId);
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <div
    class="oq-backdrop"
    on:click={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="button"
    tabindex="-1"
  ></div>
{/if}

<aside class="oq-drawer" class:oq-drawer--open={open} aria-hidden={!open}>
  <div class="oq-header">
    <div class="oq-header-text">
      <div class="oq-eyebrow">Order Quick View</div>
      {#if order}
        <div class="oq-code">{orderCode(order)}</div>
      {/if}
      <h5 class="mb-0 oq-title text-truncate" title={order?.title || ""}>
        {order?.title || (loading ? "Loading…" : "Order")}
      </h5>
      {#if order}
        <div class="oq-sub text-truncate">{displayOrderNo(order)} · {clientName}</div>
      {/if}
    </div>
    <button type="button" class="btn-close" on:click={close} aria-label="Close"></button>
  </div>

  <div class="oq-body">
    {#if loading}
      <div class="oq-loading text-muted">
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
        Loading order…
      </div>
    {:else if order}
      <div class="oq-tabs" role="tablist">
        <button
          type="button"
          class="oq-tab"
          class:oq-tab--active={tab === "details"}
          role="tab"
          aria-selected={tab === "details"}
          on:click={() => selectTab("details")}
        >
          Details
        </button>
        <button
          type="button"
          class="oq-tab"
          class:oq-tab--active={tab === "chat"}
          role="tab"
          aria-selected={tab === "chat"}
          on:click={() => selectTab("chat")}
        >
          Chat
          {#if chatLoadedFor === order.id}
            <span class="oq-tab-count">{chats.length}</span>
          {/if}
        </button>
      </div>

      {#if tab === "chat"}
        {#if chatLoading}
          <div class="oq-loading text-muted">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            Loading chats…
          </div>
        {:else if chats.length}
          <ul class="oq-chat">
            {#each chats as chat}
              <li class="oq-msg">
                <div class="oq-msg-meta">
                  <span class="oq-msg-sender">{maskAuthorName(chat?.user, currentUser) || "User"}</span>
                  <span class="oq-msg-time">
                    {chat?.createdAt &&
                      convertDate(chat.createdAt, {
                        timeZone: "Asia/Kolkata",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                  </span>
                </div>
                {#if normalizeTypes(chat?.type).length}
                  <div class="oq-msg-types">
                    {#each normalizeTypes(chat?.type) as nt}
                      <span class="badge {chatTypeClass(nt)}">{nt}</span>
                    {/each}
                  </div>
                {/if}
                <div class="oq-msg-body">{chat?.message || "—"}</div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-muted mb-0 oq-empty">No chats yet</p>
        {/if}
      {:else}
      <div class="oq-section">
        <div class="oq-badges">
          <span class="badge {statusCls}">{statusLabel}</span>
          {#if order.category}
            <span class="badge bg-light text-dark border">{order.category}</span>
          {/if}
          {#if order.source}
            <span class="badge bg-light text-dark border">{order.source === "old_import" ? "Old Import" : order.source}</span>
          {/if}
        </div>
      </div>

      <div class="oq-section">
        <div class="oq-section-title">Order Snapshot</div>
        <dl class="oq-dl">
          <div class="oq-row">
            <dt>Order No.</dt>
            <dd class="font-mono">{orderCode(order)}</dd>
          </div>
          {#if order.inqCode}
            <div class="oq-row">
              <dt>Inquiry Code</dt>
              <dd class="font-mono">{order.inqCode}</dd>
            </div>
          {/if}
          {#if order.workOrderNumber || latestWo}
            <div class="oq-row">
              <dt>Work Order</dt>
              <dd>{order.workOrderNumber || latestWo?.workOrderNo || "—"}</dd>
            </div>
          {/if}
          <div class="oq-row">
            <dt>Order Date</dt>
            <dd>{fmtDate(order.orderDate)}</dd>
          </div>
          <div class="oq-row">
            <dt>Created</dt>
            <dd>{fmtDate(order.createdAt, true)}</dd>
          </div>
          {#if order.startDate || order.deadlineDate}
            <div class="oq-row">
              <dt>Timeline</dt>
              <dd>
                {fmtDate(order.startDate)}
                <span class="oq-meta">→</span>
                {fmtDate(order.deadlineDate)}
              </dd>
            </div>
          {/if}
          <div class="oq-row">
            <dt>Value</dt>
            <dd>
              {fmtMoney(order.price, order.currency)}
              {#if order.priceTerms}
                <span class="oq-meta">· {order.priceTerms}</span>
              {/if}
            </dd>
          </div>
        </dl>
      </div>

      <div class="oq-section">
        <div class="oq-section-title">Client</div>
        <dl class="oq-dl">
          <div class="oq-row">
            <dt>Name</dt>
            <dd>
              {#if order.client?.id}
                <a href="/admin/client/{order.client.id}" class="text-primary">{clientName}</a>
              {:else}
                {clientName}
              {/if}
            </dd>
          </div>
          {#if order.gstNumber || order.client?.gstNumber}
            <div class="oq-row">
              <dt>GST</dt>
              <dd class="font-mono">{order.gstNumber || order.client?.gstNumber}</dd>
            </div>
          {/if}
          {#if order.company}
            <div class="oq-row">
              <dt>Company (on order)</dt>
              <dd>{order.company}</dd>
            </div>
          {/if}
          {#if primaryContact}
            <div class="oq-row oq-row--block">
              <dt>Contact</dt>
              <dd>
                <div class="oq-chips">
                  <span class="oq-chip">
                    {primaryContact.name || "—"}
                    {#if primaryContact.designation}
                      <span class="oq-meta">· {primaryContact.designation}</span>
                    {/if}
                  </span>
                  {#if primaryContact.mobile}
                    <span class="oq-chip oq-chip--sensitive">
                      <span class:oq-masked={!isRevealed("mobile")}
                        >{displaySensitive("mobile", primaryContact.mobile, "mobile")}</span
                      >
                      <button
                        type="button"
                        class="oq-reveal"
                        title={isRevealed("mobile") ? "Hide" : "Show"}
                        on:click={() => toggleReveal("mobile")}
                      >
                        <i class="ti {isRevealed('mobile') ? 'ti-eye-off' : 'ti-eye'}"></i>
                      </button>
                    </span>
                  {/if}
                  {#if primaryContact.email}
                    <span class="oq-chip oq-chip--sensitive">
                      <span class:oq-masked={!isRevealed("email")}
                        >{displaySensitive("email", primaryContact.email, "email")}</span
                      >
                      <button
                        type="button"
                        class="oq-reveal"
                        title={isRevealed("email") ? "Hide" : "Show"}
                        on:click={() => toggleReveal("email")}
                      >
                        <i class="ti {isRevealed('email') ? 'ti-eye-off' : 'ti-eye'}"></i>
                      </button>
                    </span>
                  {/if}
                </div>
              </dd>
            </div>
          {/if}
        </dl>
      </div>

      <div class="oq-section">
        <div class="oq-section-title">Sales Team</div>
        {#if order.assignedUsers?.length}
          <div class="oq-chips">
            {#each order.assignedUsers as u}
              {@const name = maskQueryPersonName(u, currentUser, $queryPrivacy)}
              <span class="oq-chip oq-chip--team">
                {name}
                {#if u.subRole && !isMaskedRoleLabel(name)}
                  <span class="oq-meta">· {u.subRole}</span>
                {/if}
              </span>
            {/each}
          </div>
        {:else}
          <p class="text-muted mb-0 oq-empty">No sales user assigned</p>
        {/if}
      </div>

      {#if order.description}
        <div class="oq-section">
          <div class="oq-section-title">Description</div>
          <p class="oq-desc text-break">{stripHtml(order.description) || "—"}</p>
        </div>
      {/if}

      <div class="oq-section">
        <div class="oq-section-title">Documents</div>
        <div class="oq-docs">
          <div class="oq-doc">
            <span class="oq-doc-label">Proforma (PI)</span>
            <span class="oq-doc-val">{piCount}</span>
          </div>
          <div class="oq-doc">
            <span class="oq-doc-label">Work Orders</span>
            <span class="oq-doc-val">{woCount}</span>
          </div>
        </div>
      </div>
      {/if}
    {/if}
  </div>

  {#if order && !loading}
    <div class="oq-footer">
      <a href="/admin/order/{order.id}" class="btn btn-sm btn-primary flex-fill">
        <i class="ti ti-external-link me-1"></i>Open Full Order
      </a>
    </div>
  {/if}
</aside>

<style>
  .oq-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1040;
    background: rgba(15, 23, 42, 0.28);
  }
  .oq-drawer {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 1050;
    width: min(440px, 100vw);
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
  .oq-drawer--open {
    transform: translateX(0);
    pointer-events: auto;
  }
  .oq-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid #e9ecef;
    flex-shrink: 0;
  }
  .oq-header-text {
    min-width: 0;
    flex: 1;
  }
  .oq-eyebrow {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #868e96;
    margin-bottom: 2px;
  }
  .oq-code {
    font-size: 11px;
    color: #868e96;
    font-weight: 500;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .oq-title {
    font-size: 15px !important;
    font-weight: 600 !important;
    color: #212529;
    letter-spacing: -0.01em;
  }
  .oq-sub {
    font-size: 11px;
    color: #868e96;
    margin-top: 2px;
  }
  .oq-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px 20px;
  }
  .oq-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 0;
  }
  .oq-tabs {
    display: flex;
    gap: 4px;
    padding: 3px;
    margin-bottom: 14px;
    background: #f1f3f5;
    border-radius: 8px;
  }
  .oq-tab {
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
  .oq-tab:hover {
    color: #495057;
  }
  .oq-tab--active {
    background: #fff;
    color: #212529;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  }
  .oq-tab-count {
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
  .oq-tab--active .oq-tab-count {
    background: #edf2ff;
    color: #364fc7;
  }
  .oq-chat {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .oq-msg {
    padding: 8px 10px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
  }
  .oq-msg-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  .oq-msg-sender {
    font-size: 11.5px;
    font-weight: 600;
    color: #212529;
  }
  .oq-msg-time {
    font-size: 10px;
    color: #868e96;
    white-space: nowrap;
  }
  .oq-msg-types {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
  }
  .oq-msg-types :global(.badge) {
    font-size: 10px;
    font-weight: 500;
  }
  .oq-msg-body {
    font-size: 12px;
    color: #343a40;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .oq-section {
    margin-bottom: 16px;
  }
  .oq-section-title {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #868e96;
    margin-bottom: 8px;
  }
  .oq-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .oq-badges :global(.badge) {
    font-weight: 500;
    font-size: 11px;
  }
  /* Force white text on colored status badges (Bootstrap bg-info/warning often use dark text) */
  .oq-badges :global(.badge.bg-primary),
  .oq-badges :global(.badge.bg-success),
  .oq-badges :global(.badge.bg-danger),
  .oq-badges :global(.badge.bg-info),
  .oq-badges :global(.badge.bg-secondary),
  .oq-badges :global(.badge.text-white) {
    color: #fff !important;
  }
  .oq-dl {
    margin: 0;
  }
  .oq-row {
    display: grid;
    grid-template-columns: 118px 1fr;
    gap: 8px 12px;
    padding: 6px 0;
    border-bottom: 1px solid #f1f3f5;
  }
  .oq-row:last-child {
    border-bottom: none;
  }
  .oq-row--block {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .oq-row dt {
    margin: 0;
    font-size: 11px;
    font-weight: 500;
    color: #868e96;
  }
  .oq-row dd {
    margin: 0;
    color: #212529;
    font-size: 12px;
    font-weight: 500;
  }
  .oq-meta {
    color: #868e96;
    font-weight: 400;
  }
  .oq-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .oq-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 6px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    font-size: 11px;
    font-weight: 500;
    color: #343a40;
  }
  .oq-chip--team {
    background: #e6f1fb;
    border-color: #b5d4f4;
    color: #185fa5;
  }
  .oq-chip--sensitive {
    gap: 6px;
  }
  .oq-masked {
    letter-spacing: 0.04em;
  }
  .oq-reveal {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin: 0;
    border: none;
    background: none;
    color: #868e96;
    cursor: pointer;
    line-height: 1;
  }
  .oq-reveal:hover {
    color: #495057;
  }
  .oq-desc {
    margin: 0;
    font-size: 12px;
    color: #343a40;
    white-space: pre-wrap;
  }
  .oq-docs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .oq-doc {
    padding: 10px 12px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
  }
  .oq-doc-label {
    display: block;
    font-size: 10.5px;
    color: #868e96;
    font-weight: 500;
    margin-bottom: 2px;
  }
  .oq-doc-val {
    font-size: 16px;
    font-weight: 600;
    color: #212529;
  }
  .oq-empty {
    font-size: 11.5px;
  }
  .oq-footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e9ecef;
    flex-shrink: 0;
    background: #fff;
  }
  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
</style>
