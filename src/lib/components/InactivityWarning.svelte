<script>
  import { onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { logoutUser } from "$lib/utils/auth";
  import { keepAlive } from "$lib/utils/inactivityTimer";

  export let show = false;       // controlled by parent
  export let secondsLeft = 120;  // countdown start

  let countdown = secondsLeft;
  let interval  = null;

  // Start countdown when shown
  $: if (show) {
    countdown = secondsLeft;
    clearInterval(interval);
    interval = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        clearInterval(interval);
      }
    }, 1000);
  } else {
    clearInterval(interval);
  }

  onDestroy(() => clearInterval(interval));

  function stayLoggedIn() {
    show = false;
    keepAlive();
  }

  async function logoutNow() {
    show = false;
    await logoutUser();
    goto("/login");
  }

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
</script>

{#if show}
  <!-- Backdrop -->
  <div class="inactivity-backdrop">
    <div class="inactivity-modal">
      <!-- Icon -->
      <div class="icon-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" stroke="#f59e0b" stroke-width="2"/>
          <path d="M12 7v5l3 3" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>

      <h3>Session Expiring Soon</h3>
      <p>You've been inactive. You'll be logged out in</p>

      <div class="countdown">{formatTime(countdown)}</div>

      <p class="sub">Move your mouse or click <strong>Stay Logged In</strong> to continue.</p>

      <div class="btn-row">
        <button class="btn-logout" on:click={logoutNow}>Logout Now</button>
        <button class="btn-stay"   on:click={stayLoggedIn}>Stay Logged In</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .inactivity-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .inactivity-modal {
    background: #fff;
    border-radius: 12px;
    padding: 2rem 2.5rem;
    max-width: 380px;
    width: 90%;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }

  .icon-wrap {
    margin-bottom: 1rem;
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 0.5rem;
  }

  p {
    color: #6b7280;
    font-size: 0.9rem;
    margin: 0;
  }

  .countdown {
    font-size: 2.5rem;
    font-weight: 800;
    color: #f59e0b;
    margin: 1rem 0;
    font-variant-numeric: tabular-nums;
  }

  .sub {
    margin-bottom: 1.5rem;
    font-size: 0.85rem;
  }

  .btn-row {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }

  .btn-logout {
    padding: 0.6rem 1.25rem;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: #fff;
    color: #374151;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .btn-logout:hover { background: #f3f4f6; }

  .btn-stay {
    padding: 0.6rem 1.5rem;
    border-radius: 8px;
    border: none;
    background: #ef4444;
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-stay:hover { background: #dc2626; }
</style>
