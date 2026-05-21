<script>
  import { onMount } from "svelte";
  import { checkAuth } from "$lib/utils/auth";
  import { queryPrivacy } from "$lib/stores/queryPrivacy";

  let isMaster = false;
  let drawerOpen = false;

  onMount(() => {
    const user = checkAuth();
    isMaster = user?.role === "master";
  });

  function toggleDrawer() {
    drawerOpen = !drawerOpen;
  }

  function handleWindowClick(e) {
    if (drawerOpen && !e.target.closest(".pq-drawer") && !e.target.closest(".pq-gear-btn")) {
      drawerOpen = false;
    }
  }
</script>

<svelte:window on:click={handleWindowClick} />

<slot />

{#if isMaster}
  <div class="pq-gear-wrap">
    <button
      class="pq-gear-btn"
      class:pq-gear-btn--active={$queryPrivacy.telecaller || $queryPrivacy.tech}
      on:click|stopPropagation={toggleDrawer}
      aria-label="Privacy settings"
    >
      <i class="ti ti-shield-lock"></i>
    </button>

    {#if !drawerOpen}
      <div class="pq-gear-tooltip">
        <div class="pq-tt-row">
          <i class="ti ti-headset pq-tt-icon pq-tt-icon--tc"></i>
          <span class="pq-tt-label">Telecaller</span>
          <span class="pq-tt-status" class:pq-tt-status--hidden={$queryPrivacy.telecaller}>
            {$queryPrivacy.telecaller ? "Hidden" : "Visible"}
          </span>
        </div>
        <div class="pq-tt-row">
          <i class="ti ti-tools pq-tt-icon pq-tt-icon--tech"></i>
          <span class="pq-tt-label">Tech</span>
          <span class="pq-tt-status" class:pq-tt-status--hidden={$queryPrivacy.tech}>
            {$queryPrivacy.tech ? "Hidden" : "Visible"}
          </span>
        </div>
      </div>
    {/if}
  </div>

  {#if drawerOpen}
    <div class="pq-drawer" on:click|stopPropagation={() => {}}>
      <div class="pq-drawer-header">
        <i class="ti ti-shield-lock" style="color:#3b5bdb;font-size:15px;"></i>
        <span>Privacy Settings</span>
        <button class="pq-drawer-close" on:click={() => (drawerOpen = false)} title="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="pq-drawer-body">
        <p class="pq-drawer-hint">
          Anonymise names on all query pages. Saved locally on this device.
        </p>

        <!-- Telecaller toggle -->
        <div class="pq-toggle-row">
          <div class="pq-toggle-info">
            <span class="pq-toggle-label">
              <i class="ti ti-headset" style="font-size:13px;margin-right:5px;color:#f59f00;"></i>
              Telecaller Names
            </span>
            <span class="pq-toggle-desc">Replace real names with "Telecaller"</span>
          </div>
          <button
            class="pq-toggle-btn"
            class:pq-toggle-btn--on={$queryPrivacy.telecaller}
            on:click={queryPrivacy.toggleTelecaller}
            aria-pressed={$queryPrivacy.telecaller}
            title="{$queryPrivacy.telecaller ? 'Showing: Telecaller' : 'Showing: Real name'}"
          >
            <span class="pq-toggle-knob"></span>
          </button>
        </div>

        <!-- Tech toggle -->
        <div class="pq-toggle-row">
          <div class="pq-toggle-info">
            <span class="pq-toggle-label">
              <i class="ti ti-tools" style="font-size:13px;margin-right:5px;color:#0ca678;"></i>
              Tech Names
            </span>
            <span class="pq-toggle-desc">Replace real names with "Tech"</span>
          </div>
          <button
            class="pq-toggle-btn"
            class:pq-toggle-btn--on={$queryPrivacy.tech}
            on:click={queryPrivacy.toggleTech}
            aria-pressed={$queryPrivacy.tech}
            title="{$queryPrivacy.tech ? 'Showing: Tech' : 'Showing: Real name'}"
          >
            <span class="pq-toggle-knob"></span>
          </button>
        </div>

        {#if $queryPrivacy.telecaller || $queryPrivacy.tech}
          <div class="pq-active-notice">
            <i class="ti ti-eye-off" style="font-size:12px;"></i>
            Names are currently hidden
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/if}

<style>
  /* ── Gear wrapper (holds button + tooltip) ──────────────────────────────── */
  .pq-gear-wrap {
    position: fixed;
    top: 68px;
    right: 18px;
    z-index: 1100;
  }

  /* ── Gear button ─────────────────────────────────────────────────────────── */
  .pq-gear-btn {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: #fff;
    border: 1.5px solid #dee2e6;
    color: #6c757d;
    font-size: 18px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0,0,0,0.10);
    transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
  }
  .pq-gear-btn:hover {
    background: #eef2ff; border-color: #748ffc; color: #3b5bdb;
    box-shadow: 0 4px 16px rgba(59,91,219,0.18);
  }
  .pq-gear-btn--active {
    background: #3b5bdb; border-color: #3b5bdb; color: #fff;
    box-shadow: 0 4px 16px rgba(59,91,219,0.30);
  }
  .pq-gear-btn--active:hover {
    background: #2f4ac2; border-color: #2f4ac2;
  }

  /* ── Hover tooltip ───────────────────────────────────────────────────────── */
  .pq-gear-tooltip {
    position: absolute;
    top: 50%;
    right: calc(100% + 10px);
    transform: translateY(-50%);
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 10px;
    padding: 9px 13px;
    box-shadow: 0 4px 18px rgba(0,0,0,0.11);
    white-space: nowrap;
    pointer-events: none;
    visibility: hidden;
    opacity: 0;
    transition: opacity 0.15s, visibility 0.15s;
  }
  .pq-gear-wrap:hover .pq-gear-tooltip { visibility: visible; opacity: 1; }

  .pq-tt-row {
    display: flex; align-items: center; gap: 7px;
    padding: 3px 0;
    font-size: 12px;
  }
  .pq-tt-row + .pq-tt-row { border-top: 1px solid #f1f3f5; margin-top: 4px; padding-top: 7px; }
  .pq-tt-icon { font-size: 13px; }
  .pq-tt-icon--tc   { color: #f59f00; }
  .pq-tt-icon--tech { color: #0ca678; }
  .pq-tt-label { flex: 1; color: #495057; font-weight: 500; }
  .pq-tt-status {
    font-size: 10.5px; font-weight: 700;
    padding: 2px 8px; border-radius: 20px;
    background: #edfaf3; color: #0ca678;
  }
  .pq-tt-status--hidden {
    background: #fff0f3; color: #c92a2a;
  }

  /* ── Drawer ──────────────────────────────────────────────────────────────── */
  .pq-drawer {
    position: fixed;
    top: 98px;
    right: 18px;
    z-index: 1099;
    width: 288px;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06);
    border: 1px solid #e9ecef;
    overflow: hidden;
    animation: pq-in 0.18s ease;
  }
  @keyframes pq-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .pq-drawer-header {
    display: flex; align-items: center; gap: 8px;
    padding: 13px 15px;
    border-bottom: 1px solid #f1f3f5;
    font-size: 13px; font-weight: 700; color: #212529;
  }
  .pq-drawer-close {
    background: none; border: none; padding: 0;
    margin-left: auto; font-size: 15px; color: #adb5bd;
    cursor: pointer; display: flex; align-items: center;
    border-radius: 4px; line-height: 1;
    transition: color 0.15s;
  }
  .pq-drawer-close:hover { color: #dc3545; }

  .pq-drawer-body { padding: 14px 15px; }

  .pq-drawer-hint {
    font-size: 11.5px; color: #868e96;
    margin: 0 0 14px; line-height: 1.55;
  }

  /* ── Toggle row ──────────────────────────────────────────────────────────── */
  .pq-toggle-row {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 0;
    border-bottom: 1px solid #f1f3f5;
  }
  .pq-toggle-row:last-of-type { border-bottom: none; }

  .pq-toggle-info {
    flex: 1; display: flex; flex-direction: column; gap: 3px;
  }
  .pq-toggle-label {
    font-size: 13px; font-weight: 600; color: #343a40;
    display: flex; align-items: center;
  }
  .pq-toggle-desc { font-size: 11px; color: #868e96; }

  /* pill switch */
  .pq-toggle-btn {
    position: relative;
    width: 44px; height: 24px;
    border-radius: 12px;
    background: #dee2e6;
    border: none; cursor: pointer;
    flex-shrink: 0;
    padding: 0;
    transition: background 0.22s;
  }
  .pq-toggle-btn--on { background: #3b5bdb; }
  .pq-toggle-knob {
    position: absolute;
    top: 3px; left: 3px;
    width: 18px; height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.22);
    transition: left 0.22s;
  }
  .pq-toggle-btn--on .pq-toggle-knob { left: 23px; }

  /* active notice badge */
  .pq-active-notice {
    display: flex; align-items: center; gap: 6px;
    margin-top: 12px;
    padding: 7px 11px;
    background: #fff8e6;
    border: 1px solid #ffc94d;
    border-radius: 8px;
    font-size: 11.5px; font-weight: 600; color: #7a4800;
  }
</style>
