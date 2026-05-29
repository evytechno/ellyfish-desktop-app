<script>
  import { fly } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { gcToasts, removeGcToast } from "$lib/stores/groupChatToastStore";

  function handleClick(toast) {
    removeGcToast(toast.id);
    goto(`/admin/group-chat/${toast.groupId}`);
  }

  function avatarLetter(name) {
    return (name ?? "G")[0].toUpperCase();
  }

  function formatTime(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
</script>

<div class="gc-toast-stack">
  {#each $gcToasts as toast (toast.id)}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="gc-toast-card"
      style="--accent: {toast.avatarColor ?? '#3b5bdb'}"
      in:fly={{ x: 380, duration: 360, opacity: 0 }}
      out:fly={{ x: 380, duration: 260, opacity: 0 }}
      on:click={() => handleClick(toast)}
    >
      <!-- Close -->
      <button
        class="gc-toast-close"
        on:click|stopPropagation={() => removeGcToast(toast.id)}
        aria-label="Dismiss"
      >&#x2715;</button>

      <!-- Body -->
      <div class="gc-toast-body">

        <!-- Group avatar -->
        <div class="gc-toast-avatar" style="background: {toast.avatarColor ?? '#3b5bdb'};">
          {avatarLetter(toast.groupName)}
        </div>

        <!-- Text content -->
        <div class="gc-toast-content">
          <div class="gc-toast-top">
            <span class="gc-toast-group">{toast.groupName ?? "Group Chat"}</span>
            <span class="gc-toast-badge">Group</span>
          </div>
          <p class="gc-toast-msg">
            <span class="gc-toast-sender">{toast.senderLabel}:</span>
            {toast.preview}
          </p>
          <span class="gc-toast-time">{formatTime(toast.createdAt)}</span>
        </div>
      </div>

      <!-- Auto-dismiss progress shimmer -->
      <div class="gc-toast-line"></div>
    </div>
  {/each}
</div>

<style>
  /* ── Stack ───────────────────────────────────────────────────────────────── */
  .gc-toast-stack {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99998;
    display: flex;
    flex-direction: column-reverse;
    gap: 12px;
    pointer-events: none;
  }

  /* ── Card ────────────────────────────────────────────────────────────────── */
  .gc-toast-card {
    pointer-events: all;
    position: relative;
    width: 340px;
    background: rgba(10, 16, 35, 0.85);
    backdrop-filter: blur(22px) saturate(180%);
    -webkit-backdrop-filter: blur(22px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-left: 3px solid var(--accent);
    border-radius: 14px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.35),
      0 2px 8px rgba(0, 0, 0, 0.20),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .gc-toast-card:hover {
    transform: translateY(-2px) scale(1.01);
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.45),
      0 4px 12px rgba(0, 0, 0, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  /* ── Close ───────────────────────────────────────────────────────────────── */
  .gc-toast-close {
    position: absolute;
    top: 10px; right: 12px;
    width: 22px; height: 22px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.55);
    font-size: 11px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    padding: 0;
  }
  .gc-toast-close:hover { background: rgba(220, 53, 69, 0.6); color: #fff; border-color: transparent; }

  /* ── Body ────────────────────────────────────────────────────────────────── */
  .gc-toast-body {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 40px 12px 14px;
  }

  /* ── Avatar ──────────────────────────────────────────────────────────────── */
  .gc-toast-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700; color: #fff;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }

  /* ── Content ─────────────────────────────────────────────────────────────── */
  .gc-toast-content { flex: 1; min-width: 0; }

  .gc-toast-top {
    display: flex; align-items: center; gap: 7px;
    margin-bottom: 4px;
  }

  .gc-toast-group {
    font-size: 13px; font-weight: 700;
    color: #fff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    flex: 1; min-width: 0;
  }

  .gc-toast-badge {
    font-size: 9px; font-weight: 700;
    letter-spacing: 0.5px; text-transform: uppercase;
    padding: 2px 7px; border-radius: 20px;
    background: rgba(var(--accent-rgb, 59,91,219), 0.25);
    background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.65);
    flex-shrink: 0;
  }

  .gc-toast-msg {
    margin: 0 0 4px;
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.80);
    line-height: 1.45;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .gc-toast-sender {
    font-weight: 600;
    color: var(--accent);
  }

  .gc-toast-time {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.38);
    letter-spacing: 0.3px;
  }

  /* ── Shimmer progress line ───────────────────────────────────────────────── */
  .gc-toast-line {
    height: 2px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--accent) 40%,
      rgba(255, 255, 255, 0.7) 50%,
      var(--accent) 60%,
      transparent 100%
    );
    background-size: 250% 100%;
    animation: gc-shimmer 2.2s ease-in-out infinite;
  }

  @keyframes gc-shimmer {
    0%   { background-position: 150% center; }
    100% { background-position: -150% center; }
  }
</style>
