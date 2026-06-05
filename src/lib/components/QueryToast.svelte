<script>
  import { fly } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { queryToasts, removeQueryToast } from "$lib/stores/queryToastStore";

  const STATUS_ICON = {
    in_progress: "ti-player-play",
    reopened:    "ti-refresh",
    open:        "ti-circle-check",
    resolved:    "ti-circle-check",
    closed:      "ti-lock",
  };
  const STATUS_COLOR = {
    in_progress: "#f59f00",
    reopened:    "#dc3545",
    open:        "#3b5bdb",
    resolved:    "#198754",
    closed:      "#6c757d",
  };

  function handleClick(toast) {
    removeQueryToast(toast.id);
    if (toast.queryId) goto(`/admin/query/${toast.queryId}`);
  }

  function formatTime(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  function accentColor(toast) {
    if (toast.type === "status") return STATUS_COLOR[toast.status] ?? "#3b5bdb";
    return "#3b5bdb";
  }
</script>

<div class="qt-stack">
  {#each $queryToasts as toast (toast.id)}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="qt-card"
      style="--accent: {accentColor(toast)}"
      in:fly={{ x: 380, duration: 360, opacity: 0 }}
      out:fly={{ x: 380, duration: 260, opacity: 0 }}
      on:click={() => handleClick(toast)}
    >
      <button class="qt-close" on:click|stopPropagation={() => removeQueryToast(toast.id)} aria-label="Dismiss">&#x2715;</button>

      <div class="qt-body">
        <!-- Icon / Avatar -->
        <div class="qt-avatar" style="background: {accentColor(toast)};">
          {#if toast.type === "status"}
            <i class="ti {STATUS_ICON[toast.status] ?? 'ti-bell'}"></i>
          {:else}
            <i class="ti ti-message"></i>
          {/if}
        </div>

        <div class="qt-content">
          <div class="qt-top">
            <span class="qt-title">{toast.subject ?? "Query"}</span>
            <span class="qt-badge">{toast.type === "status" ? (toast.status?.replace("_"," ") ?? "Update") : "New Message"}</span>
          </div>
          <p class="qt-msg">
            {#if toast.type === "message"}
              <span class="qt-sender">{toast.senderLabel ?? ""}:</span>
              {toast.preview ?? ""}
            {:else}
              {toast.statusLabel ?? `Status changed to ${toast.status?.replace("_"," ")}`}
            {/if}
          </p>
          <span class="qt-time">{formatTime(toast.createdAt ?? new Date().toISOString())}</span>
        </div>
      </div>

      <div class="qt-line"></div>
    </div>
  {/each}
</div>

<style>
  .qt-stack {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99997;
    display: flex;
    flex-direction: column-reverse;
    gap: 10px;
    pointer-events: none;
  }
  .qt-card {
    pointer-events: all;
    position: relative;
    width: 330px;
    background: rgba(10, 16, 35, 0.88);
    backdrop-filter: blur(22px) saturate(180%);
    -webkit-backdrop-filter: blur(22px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.10);
    border-left: 3px solid var(--accent);
    border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.20);
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }
  .qt-card:hover { transform: translateY(-2px) scale(1.01); box-shadow: 0 12px 40px rgba(0,0,0,0.45); }
  .qt-close {
    position: absolute; top: 10px; right: 12px;
    width: 22px; height: 22px; border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.55);
    font-size: 11px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; padding: 0; transition: background 0.15s;
  }
  .qt-close:hover { background: rgba(220,53,69,0.6); color: #fff; border-color: transparent; }
  .qt-body { display: flex; align-items: flex-start; gap: 12px; padding: 14px 40px 12px 14px; }
  .qt-avatar {
    width: 38px; height: 38px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; color: #fff; flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .qt-content { flex: 1; min-width: 0; }
  .qt-top { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
  .qt-title { font-size: 12.5px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
  .qt-badge { font-size: 9px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; padding: 2px 7px; border-radius: 20px; background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.65); flex-shrink: 0; }
  .qt-msg { margin: 0 0 4px; font-size: 12px; color: rgba(255,255,255,0.80); line-height: 1.45; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qt-sender { font-weight: 600; color: var(--accent); }
  .qt-time { font-size: 11px; color: rgba(255,255,255,0.38); }
  .qt-line {
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, var(--accent) 40%, rgba(255,255,255,0.7) 50%, var(--accent) 60%, transparent 100%);
    background-size: 250% 100%;
    animation: qt-shimmer 2.2s ease-in-out infinite;
  }
  @keyframes qt-shimmer {
    0%   { background-position: 150% center; }
    100% { background-position: -150% center; }
  }
</style>
