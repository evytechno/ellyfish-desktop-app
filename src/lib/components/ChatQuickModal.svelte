<script>
  import { createEventDispatcher, tick } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";

  export let open             = false;
  export let order            = null;
  export let preselectedTypes = [];   // e.g. ['Call'] when opened via phone icon

  const dispatch = createEventDispatcher();

  const CHAT_TYPES = ["Call", "WA", "Email"];

  let selectedTypes = [];
  let message       = "";
  let sending       = false;
  let error         = "";
  let textareaEl;

  // Local chats for recent display — seeded once per open, prepended on send
  let localChats = [];

  // Reset only when open transitions false→true
  let _prevOpen = false;
  $: if (open && !_prevOpen) {
    _prevOpen = true;
    selectedTypes = [...preselectedTypes];
    message = "";
    error = "";
    // Seed local chats once from order (newest first)
    localChats = order?.orderChats ? [...order.orderChats].reverse() : [];
    tick().then(() => textareaEl?.focus());
  } else if (!open) {
    _prevOpen = false;
  }

  // Recent 3 for display
  $: recentChats = localChats.slice(0, 3);

  // All selected?
  $: allSelected = CHAT_TYPES.every(t => selectedTypes.includes(t));

  function toggleType(t) {
    selectedTypes = selectedTypes.includes(t)
      ? selectedTypes.filter(x => x !== t)
      : [...selectedTypes, t];
  }

  function toggleAll() {
    selectedTypes = allSelected ? [] : [...CHAT_TYPES];
  }

  // Solid filled styles for selected state
  function selectedStyle(type) {
    if (type === "Call")  return "background:#1d4ed8;color:#fff;border-color:#1d4ed8;";
    if (type === "WA")    return "background:#15803d;color:#fff;border-color:#15803d;";
    if (type === "Email") return "background:#a16207;color:#fff;border-color:#a16207;";
    return "background:#374151;color:#fff;border-color:#374151;";
  }

  // Light pastel for recent chat badge display only
  function badgeStyle(type) {
    if (type === "Call")    return "background:#dbeafe;color:#1d4ed8;";
    if (type === "WA" || type === "WhatsApp") return "background:#dcfce7;color:#15803d;";
    if (type === "Email")   return "background:#fef9c3;color:#a16207;";
    return "background:#f3f4f6;color:#6b7280;";
  }

  function normalizeSingleType(raw) {
    if (!raw) return null;
    const t = raw.trim().toLowerCase();
    if (t.includes("call"))    return "Call";
    if (t.includes("whatsapp") || t === "wa") return "WA";
    if (t.includes("email"))   return "Email";
    return null;
  }

  function normalizeTypes(typeStr) {
    if (!typeStr) return [];
    return typeStr.split(",").map(normalizeSingleType).filter(Boolean);
  }

  function formatDateTime(d) {
    if (!d) return "";
    let s = String(d);
    if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
    return new Date(s).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: true,
      timeZone: "Asia/Kolkata",
    });
  }

  async function sendChat() {
    if (!message.trim() || sending) return;
    error = "";
    sending = true;
    try {
      const sentMessage = message.trim();
      const sentType    = selectedTypes.map(t => t === "WA" ? "WhatsApp" : t).join(",");
      await authApiFetch(API_ROUTES.ORDER_CHAT, {
        method: "POST",
        data: JSON.stringify({
          orderId: order.id,
          message: sentMessage,
          type: sentType,
        }),
      });
      const newChat = { message: sentMessage, type: sentType, createdAt: new Date().toISOString() };
      // Prepend to local list immediately for display
      localChats = [newChat, ...localChats];
      // Notify parent to update its order object so next open also shows this chat
      dispatch("chatAdded", { orderId: order.id, chat: newChat });
      message = "";
      selectedTypes = [];
    } catch (e) {
      error =
        e?.data?.message ||
        e?.message ||
        "Failed to send. Please try again.";
    } finally {
      sending = false;
    }
  }

  function onKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
    if (e.key === "Escape") dispatch("close");
  }

  function onBackdropClick(e) {
    if (e.target === e.currentTarget) dispatch("close");
  }


</script>

{#if open && order}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-[1060] flex items-center justify-center"
    style="background:rgba(0,0,0,0.35);"
    on:click={onBackdropClick}
  >
    <!-- Modal box -->
    <div
      class="bg-white rounded-lg shadow-xl w-[340px] max-w-[95vw] flex flex-col overflow-hidden"
    >

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3" style="border-bottom:2px solid #e5e7eb;">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-gray-800 truncate">Add Chat</div>
          <div class="text-[11px] text-gray-400 truncate">{order?.pId ? `#${order.pId} - ${order.title || ""}` : (order.title || "")}</div>
        </div>
        <button
          class="text-gray-400 hover:text-gray-600 ms-2 flex-shrink-0"
          on:click={() => dispatch("close")}
        >
          <i class="ti ti-x text-base"></i>
        </button>
      </div>

      <!-- Recent chats -->
      {#if recentChats.length > 0}
        <div class="px-4 pt-3 pb-1">
          <div class="text-[10px] font-semibold uppercase text-gray-400 tracking-wide mb-1.5">Recent</div>
          <div class="flex flex-col gap-1 max-h-[110px] overflow-y-auto">
            {#each recentChats as c}
              <div class="text-[11px] border border-gray-100 rounded px-2 py-1 bg-gray-50">
                <div class="flex items-center gap-1 flex-wrap mb-0.5">
                  {#each normalizeTypes(c.type) as nt}
                    <span class="rounded px-1 text-[9px] font-semibold" style={badgeStyle(nt)}>{nt}</span>
                  {/each}
                  <span class="text-gray-600 truncate">{c.message || ""}</span>
                </div>
                <div class="text-[10px] text-gray-400">{formatDateTime(c.createdAt)}</div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Input area -->
      <div class="px-4 pt-3 pb-4">

        <!-- Type selector -->
        <div class="flex gap-1.5 mb-3 flex-wrap">
          <!-- All button -->
          <button
            type="button"
            class="btn btn-xs px-2 py-1 text-[11px] font-semibold"
            style={allSelected
              ? "background:#374151;color:#fff;border-color:#374151;"
              : "background:#f3f4f6;color:#374151;border:1px solid #d1d5db;"}
            on:click={toggleAll}
          >
            {#if allSelected}<i class="ti ti-check me-1" style="font-size:10px;"></i>{/if}
            All
          </button>

          <!-- Individual type buttons -->
          {#each CHAT_TYPES as t}
            {@const isSelected = selectedTypes.includes(t)}
            <button
              type="button"
              class="btn btn-xs px-2 py-1 text-[11px] font-semibold"
              style={isSelected ? selectedStyle(t) : "background:#f9fafb;color:#6b7280;border:1px solid #d1d5db;"}
              on:click={() => toggleType(t)}
            >
              {#if isSelected}<i class="ti ti-check me-1" style="font-size:10px;"></i>{/if}
              {t}
            </button>
          {/each}
        </div>

        <!-- Message input -->
        <textarea
          bind:this={textareaEl}
          class="form-control form-control-sm text-xs resize-none"
          rows="2"
          placeholder="Type message... (Enter to send)"
          style="pointer-events:auto;"
          bind:value={message}
          on:keydown={onKeydown}
        ></textarea>

        {#if error}
          <div class="text-[11px] text-red-500 mt-1">{error}</div>
        {/if}

        <!-- Actions -->
        <div class="flex justify-end gap-2 mt-2">
          <button class="btn btn-sm btn-light" on:click={() => dispatch("close")}>Cancel</button>
          <button
            class="btn btn-sm btn-primary"
            on:click={sendChat}
            disabled={sending || !message.trim()}
          >
            {#if sending}
              <span class="spinner-border spinner-border-sm me-1" style="width:10px;height:10px;border-width:1.5px;"></span>
            {/if}
            Send
          </button>
        </div>
      </div>

    </div>
  </div>
{/if}

