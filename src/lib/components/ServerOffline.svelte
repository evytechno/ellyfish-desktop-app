<script>
  import { isOnline, isServerReachable, isSlowNetwork, checkServer, startNetworkMonitor, stopNetworkMonitor } from '$lib/stores/network';
  import { onMount, onDestroy } from 'svelte';

  let retrying = false;

  onMount(() => startNetworkMonitor());
  onDestroy(() => stopNetworkMonitor());

  async function retry() {
    retrying = true;
    await checkServer();          // actually re-checks the server now
    retrying = false;
  }

  $: showModal  = !$isOnline || !$isServerReachable;
  $: showBanner = $isSlowNetwork && $isOnline && $isServerReachable;
</script>

<!-- ── Slow network top banner (non-blocking) ──────────────────────────────── -->
{#if showBanner}
  <div class="slow-banner">
    <i class="ti ti-wifi-2"></i>
    <span>Slow connection detected — some actions may take longer than usual.</span>
  </div>
{/if}

<!-- ── Full blocking modal (server unreachable / offline) ─────────────────── -->
{#if showModal}
  <div class="modal-backdrop">
    <div class="modal-card">

      <!-- Icon -->
      <div class="modal-icon-wrap">
        {#if !$isOnline}
          <i class="ti ti-wifi-off modal-icon modal-icon--red"></i>
        {:else}
          <i class="ti ti-server-off modal-icon modal-icon--red"></i>
        {/if}
      </div>

      <!-- Title -->
      <h2 class="modal-title">
        {#if !$isOnline}No Internet Connection{:else}Server Unreachable{/if}
      </h2>

      <!-- Message -->
      <p class="modal-msg">
        {#if !$isOnline}
          Please check your network connection and try again.
        {:else}
          Cannot connect to the server. Please ensure the server is running.
        {/if}
      </p>

      <!-- Retry button -->
      <button class="retry-btn" on:click={retry} disabled={retrying}>
        {#if retrying}
          <i class="ti ti-loader-2 spin"></i> Checking…
        {:else}
          <i class="ti ti-refresh"></i> Retry Connection
        {/if}
      </button>

    </div>
  </div>
{/if}

<style>
  /* ── Slow network banner ──────────────────────────────────────────────────── */
  .slow-banner {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 9998;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 18px;
    background: #fff3cd;
    border-bottom: 1px solid #ffc107;
    color: #856404;
    font-size: 13px;
    font-weight: 500;
    animation: slide-down 0.25s ease;
  }
  .slow-banner i { font-size: 15px; flex-shrink: 0; }
  @keyframes slide-down {
    from { transform: translateY(-100%); opacity: 0; }
    to   { transform: translateY(0);     opacity: 1; }
  }

  /* ── Blocking modal ───────────────────────────────────────────────────────── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.60);
    backdrop-filter: blur(4px);
  }
  .modal-card {
    background: #fff;
    border-radius: 18px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    padding: 36px 32px 28px;
    max-width: 360px;
    width: calc(100% - 32px);
    text-align: center;
    animation: pop-in 0.2s ease;
  }
  @keyframes pop-in {
    from { transform: scale(0.92); opacity: 0; }
    to   { transform: scale(1);    opacity: 1; }
  }
  .modal-icon-wrap {
    width: 64px; height: 64px; border-radius: 50%;
    background: #fee2e2;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 18px;
  }
  .modal-icon { font-size: 28px; }
  .modal-icon--red { color: #ef4444; }
  .modal-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 8px;
  }
  .modal-msg {
    font-size: 13.5px;
    color: #6b7280;
    margin: 0 0 24px;
    line-height: 1.5;
  }
  .retry-btn {
    width: 100%;
    padding: 11px 16px;
    background: #ef4444;
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 0.15s, transform 0.1s;
  }
  .retry-btn:hover:not(:disabled) { background: #dc2626; transform: scale(1.01); }
  .retry-btn:disabled { background: #fca5a5; cursor: not-allowed; }
  .retry-btn i { font-size: 16px; }
  .spin { animation: spin 0.9s linear infinite; }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
