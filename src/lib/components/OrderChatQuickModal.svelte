<script>
  import { createEventDispatcher, tick } from "svelte";
  import Swal from "sweetalert2";

  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";

  import { convertDate, normalizeTypes } from "$lib/features/orders/detail/utils/index.js";
  import { maskAuthorName } from "$lib/utils/maskUser";

  export let open = false;
  export let order = null; // excel page passes an order object
  export let currentUser = null;
  export let preselectedTypes = []; // API compatibility (not used in this sidebar)

  const dispatch = createEventDispatcher();

  let _openWas = false;
  let tab = "chat";

  /** @type {number|null} */
  $: orderId = order?.id ? Number(order.id) : null;
  $: if (!open) reset();
  $: if (open && !_openWas) {
    _openWas = true;
    (async () => {
      await tick();
      await tick();
      scrollToBottom();
    })();
  }
  $: if (!open) _openWas = false;

  let chats = [];
  let chatLoading = false;
  let chatLoadedFor = null;
  let chatToken = 0;
  let chatScrollEl = null;

  let reminders = [];
  let remindersLoading = false;
  let remindersLoadedFor = null;
  let remindersToken = 0;

  let reminderTime = "";
  let reminderMessage = "";
  let reminderSaving = false;
  let reminderFormErrors = {};

  let selectedTypes = [];
  let message = "";
  let saving = false;
  let formErrors = {};

  const CHAT_TYPES = [
    { label: "Call", value: "Call" },
    { label: "WA", value: "WhatsApp" },
    { label: "Email", value: "Email" },
  ];

  function chatTypeClass(nt) {
    if (nt === "Call") return "bg-primary text-white";
    if (nt === "WhatsApp") return "bg-success text-white";
    if (nt === "Email") return "bg-warning text-dark";
    return "bg-light text-dark border";
  }

  function orderCode(o) {
    if (!o) return "";
    if (o.financialYear && o.pId != null) return `${o.financialYear}/${String(o.pId).padStart(6, "0")}`;
    if (o.pId != null) return `#${o.pId}`;
    return `#${o.id}`;
  }

  function close() {
    open = false;
    reset();
    dispatch("close");
  }

  function scrollToBottom() {
    if (!chatScrollEl) return;
    chatScrollEl.scrollTop = chatScrollEl.scrollHeight;
    requestAnimationFrame(() => {
      if (!chatScrollEl) return;
      chatScrollEl.scrollTop = chatScrollEl.scrollHeight;
    });
  }

  function reset() {
    chats = [];
    chatLoading = false;
    chatLoadedFor = null;
    chatToken += 1;
    selectedTypes = [];
    message = "";
    saving = false;
    formErrors = {};

    reminders = [];
    remindersLoading = false;
    remindersLoadedFor = null;
    remindersToken += 1;
    reminderTime = "";
    reminderMessage = "";
    reminderSaving = false;
    reminderFormErrors = {};

    tab = "chat";
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
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      chatLoadedFor = oid;

      // Keep latest (bottom) visible
      await tick();
      await tick();
      if (token === chatToken) scrollToBottom();
    } catch (err) {
      if (token !== chatToken) return;
      errorHandle(err);
    } finally {
      if (token === chatToken) chatLoading = false;
    }
  }

  $: if (open && orderId != null) loadChats(orderId);

  async function loadReminders(id) {
    const oid = Number(id);
    if (!oid || remindersLoadedFor === oid || remindersLoading) return;
    const token = ++remindersToken;
    remindersLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.ORDER_REMINDER}?orderId=${oid}`);
      if (token !== remindersToken) return;
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      reminders = (list || []).filter((r) => !r?.deletedAt).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      remindersLoadedFor = oid;
    } catch (err) {
      if (token !== remindersToken) return;
      errorHandle(err);
    } finally {
      if (token === remindersToken) remindersLoading = false;
    }
  }

  async function submitReminder(e) {
    e?.preventDefault?.();
    if (!orderId || reminderSaving) return;

    reminderFormErrors = {};
    const msg = (reminderMessage || "").trim();
    if (!msg) {
      reminderFormErrors.message = ["Message is required."];
      return;
    }

    // datetime-local string => ISO
    const iso = reminderTime ? new Date(reminderTime).toISOString() : null;
    if (!iso) {
      reminderFormErrors.time = ["Reminder time is required."];
      return;
    }

    reminderSaving = true;
    try {
      const res = await authApiFetch(API_ROUTES.ORDER_REMINDER, {
        method: "POST",
        data: JSON.stringify({
          orderId: Number(orderId),
          reminderTime: iso,
          message: msg,
        }),
      });

      const created = res?.data ?? res;
      reminders = [...(reminders || []), created]
        .filter((r) => r && !r?.deletedAt)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      Swal.fire("Success!", res?.message ?? "Reminder created.", "success");
      reminderTime = "";
      reminderMessage = "";
      reminderFormErrors = {};
    } catch (err) {
      errorHandle(err);
    } finally {
      reminderSaving = false;
    }
  }

  $: if (open && tab === "reminders" && orderId != null) loadReminders(orderId);

  function toggleType(t) {
    selectedTypes = selectedTypes.includes(t)
      ? selectedTypes.filter((x) => x !== t)
      : [...selectedTypes, t];
  }

  $: allSelected = selectedTypes.length === CHAT_TYPES.length;
  function toggleAll() {
    selectedTypes = allSelected ? [] : CHAT_TYPES.map((t) => t.value);
  }

  async function submitChat(e) {
    e?.preventDefault?.();
    if (!orderId || saving) return;

    formErrors = {};
    if (!selectedTypes.length) {
      formErrors.type = ["Please select at least one type."];
      return;
    }
    if (!message.trim()) {
      formErrors.message = ["Message is required."];
      return;
    }

    saving = true;
    try {
      const res = await authApiFetch(API_ROUTES.ORDER_CHAT, {
        method: "POST",
        data: JSON.stringify({
          orderId: Number(orderId),
          type: selectedTypes.join(","),
          message: message.trim(),
        }),
      });

      const createdChat = res?.data ?? res;
      if (createdChat) {
        chats = [...(chats || []), createdChat]
          .filter((c) => !c?.deletedAt)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      }

      dispatch("chatAdded", { orderId: Number(orderId), chat: createdChat });
      Swal.fire("Success!", res?.message ?? "Chat created.", "success");

      selectedTypes = [];
      message = "";

      await tick();
      await tick();
      scrollToBottom();
    } catch (err) {
      errorHandle(err);
    } finally {
      saving = false;
    }
  }
</script>

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
        {order?.title || "Order"}
      </h5>
    </div>
    <button type="button" class="btn-close" on:click={close} aria-label="Close"></button>
  </div>

  <div class="oq-body">
    <div class="oq-chat-bar">
      <div class="oq-tabs" role="tablist" aria-label="Quick chat tabs">
        <button
          type="button"
          class="oq-tab-btn"
          class:oq-tab-btn--active={tab === "chat"}
          on:click={() => (tab = "chat")}
          role="tab"
          aria-selected={tab === "chat"}
        >
          Chats
          {#if chatLoadedFor === orderId}
            <span class="oq-tab-count">{chats.length}</span>
          {/if}
        </button>
        <button
          type="button"
          class="oq-tab-btn"
          class:oq-tab-btn--active={tab === "reminders"}
          on:click={() => (tab = "reminders")}
          role="tab"
          aria-selected={tab === "reminders"}
        >
          Reminders
          {#if remindersLoadedFor === orderId}
            <span class="oq-tab-count">{reminders.length}</span>
          {/if}
        </button>
      </div>
    </div>

    {#if tab === "chat"}
      <div class="oq-chat-content" bind:this={chatScrollEl}>
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
      </div>

      <div class="oq-chat-compose">
          <div class="oq-chat-compose-types">
            {#each CHAT_TYPES as opt}
              <button
                type="button"
                class="btn btn-xs oq-type-btn {selectedTypes.includes(opt.value) ? 'oq-type-btn--selected' : 'oq-type-btn--unselected'}"
                on:click={() => toggleType(opt.value)}
                disabled={saving}
              >
                {opt.label}
              </button>
            {/each}
            <button
              type="button"
              class="btn btn-xs oq-type-btn {allSelected ? 'oq-type-btn--selected' : 'oq-type-btn--unselected'}"
              on:click={toggleAll}
              disabled={saving}
            >
              All
            </button>
          </div>

          <form class="oq-chat-compose-row" on:submit={submitChat}>
            <input
              type="text"
              class="form-control form-control-sm oq-chat-compose-input"
              placeholder="Message..."
              bind:value={message}
              disabled={saving}
            />
            <button
              type="submit"
              class="btn btn-danger btn-sm oq-chat-send"
              disabled={saving || !message.trim() || !selectedTypes.length}
              title="Send chat"
            >
              <i class="ti ti-send"></i>
            </button>
          </form>

          {#if formErrors.type}
            <ul class="text-danger mt-1 text-xs capitalize" style="margin-bottom:0;">
              <li>{formErrors.type[0]}</li>
            </ul>
          {/if}
          {#if formErrors.message}
            <ul class="text-danger mt-1 text-xs capitalize" style="margin-bottom:0;">
              <li>{formErrors.message[0]}</li>
            </ul>
          {/if}
          {#if formErrors.readOnly}
            <div class="alert alert-danger mt-2" style="font-size:12px; padding:8px 10px;">
              {formErrors.readOnly[0]}
            </div>
          {/if}
        </div>
    {:else}
      <div class="oq-chat-content">
        {#if remindersLoading}
          <div class="oq-loading text-muted">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            Loading reminders…
          </div>
        {:else if reminders.length}
          <ul class="oq-chat">
            {#each reminders as r}
              <li class="oq-msg">
                <div class="oq-msg-body">{r?.message || "—"}</div>
                <div class="oq-msg-time mt-1">
                  {#if r?.reminderTime}
                    {convertDate(r.reminderTime, {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  {:else if r?.createdAt}
                    {convertDate(r.createdAt, {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-muted mb-0 oq-empty">No reminders yet</p>
        {/if}
      </div>

      <div class="oq-reminder-compose">
          <form on:submit={submitReminder} class="space-y-3">
            <div>
              <label class="form-label" style="font-size:12px; font-weight:600;">Reminder Time</label>
              <input
                type="datetime-local"
                class="form-control form-control-sm"
                bind:value={reminderTime}
                required
                disabled={reminderSaving}
              />
              {#if reminderFormErrors.time}
                <ul class="text-danger mt-1 text-xs capitalize" style="margin-bottom:0;">
                  <li>{reminderFormErrors.time[0]}</li>
                </ul>
              {/if}
            </div>

            <div>
              <label class="form-label" style="font-size:12px; font-weight:600;">Message</label>
              <textarea
                class="form-control form-control-sm"
                rows="3"
                placeholder="Reminder message..."
                bind:value={reminderMessage}
                required
                disabled={reminderSaving}
              />
              {#if reminderFormErrors.message}
                <ul class="text-danger mt-1 text-xs capitalize" style="margin-bottom:0;">
                  <li>{reminderFormErrors.message[0]}</li>
                </ul>
              {/if}
            </div>

            <div class="d-flex gap-2 justify-content-end">
              <button
                type="submit"
                class="btn btn-primary btn-sm"
                disabled={reminderSaving}
              >
                {reminderSaving ? "Creating..." : "Add Reminder"}
              </button>
            </div>
          </form>
        </div>
    {/if}
  </div>
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

  .oq-body {
    flex: 1;
    overflow: hidden;
    padding: 12px 16px 20px;
    display: flex;
    flex-direction: column;
  }

  .oq-chat-content {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 10px;
  }

  .oq-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 0;
  }

  .oq-chat-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .oq-tabs {
    display: flex;
    gap: 8px;
    width: 100%;
  }

  .oq-tab-btn {
    flex: 1;
    border: none;
    background: #f1f3f5;
    color: #868e96;
    font-size: 11.5px;
    font-weight: 700;
    padding: 7px 8px;
    border-radius: 8px;
    cursor: pointer;
  }

  .oq-tab-btn--active {
    background: #fff;
    color: #212529;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  }

  .oq-reminder-compose {
    padding-top: 10px;
    margin-top: 10px;
    border-top: 1px solid #e9ecef;
  }

  .oq-chat-bar-title {
    white-space: nowrap;
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

  .oq-chat {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .oq-msg {
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid #e6ebf2;
    border-radius: 10px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
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
    color: #8b95a7;
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
    color: #3b4454;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.45;
  }

  .oq-empty {
    font-size: 11.5px;
  }

  .oq-chat-compose {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.86) 0%, #ffffff 24%);
    border-top: 1px solid #e8edf5;
    padding-top: 10px;
    padding-bottom: 6px;
    backdrop-filter: blur(2px);
  }

  .oq-chat-compose-types {
    display: flex;
    gap: 6px;
    margin-bottom: 9px;
    flex-wrap: wrap;
  }

  .oq-type-btn {
    font-weight: 600;
    border-radius: 7px;
    min-height: 26px;
    padding: 2px 10px;
  }

  .oq-type-btn--unselected {
    background: #ffffff;
    border: 1px solid #dfe5ef;
    color: #6b7280;
  }

  .oq-type-btn--selected {
    background: #fff4e6;
    border: 1px solid #ffb020;
    color: #d9480f;
  }

  .oq-chat-compose-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .oq-chat-compose-input {
    min-width: 0;
    height: 30px;
    border-radius: 7px;
    border-color: #dfe5ef;
    box-shadow: none;
  }

  .oq-chat-compose-input:focus {
    border-color: #93c5fd;
    box-shadow: 0 0 0 0.15rem rgba(59, 130, 246, 0.18);
  }

  .oq-chat-send {
    min-width: 34px;
    height: 30px;
    padding: 4px 8px;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.25);
  }

  .oq-chat-send:disabled {
    box-shadow: none;
  }
</style>

