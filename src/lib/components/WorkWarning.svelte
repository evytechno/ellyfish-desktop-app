<script>
  import { onDestroy } from "svelte";

  export let show     = false;
  export let message  = "Reminder: Mobile usage during work hours is not permitted. Please focus on your tasks.";
  export let duration = 10;
  export let sound    = true;

  let TOTAL = 10;
  let countdown = TOTAL;
  let timer = null;
  let soundTimer = null;

  // SVG ring
  const R = 28;
  const CIRC = +(2 * Math.PI * R).toFixed(2);
  $: dashOffset = +(CIRC * (1 - countdown / TOTAL)).toFixed(2);
  $: ringColor = countdown > 6 ? "#22c55e" : countdown > 3 ? "#f59e0b" : "#ef4444";

  function playAlertSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[880, 0, 0.15], [660, 0.2, 0.15], [880, 0.4, 0.15], [660, 0.6, 0.2]].forEach(
        ([freq, start, dur]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = "square";
          gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
          osc.start(ctx.currentTime + start);
          osc.stop(ctx.currentTime + start + dur + 0.05);
        }
      );
    } catch {}
  }

  function startTimer() {
    clearInterval(timer);
    clearInterval(soundTimer);
    TOTAL = duration;
    countdown = TOTAL;
    if (sound) {
      playAlertSound();
      soundTimer = setInterval(playAlertSound, 2000);
    }
    timer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) close();
    }, 1000);
  }

  // watch show — start timer when it becomes true
  $: if (show) startTimer();

  function close() {
    clearInterval(timer);
    clearInterval(soundTimer);
    timer = null;
    soundTimer = null;
    show = false;
  }

  onDestroy(() => {
    clearInterval(timer);
    clearInterval(soundTimer);
  });
</script>

{#if show}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="overlay" on:click|self={close}>
    <div class="modal-box">

      <!-- top accent bar -->
      <div class="accent-bar"></div>

      <!-- icon -->
      <div class="icon-wrap">
        <svg class="icon-svg" viewBox="0 0 80 80" width="80" height="80">
          <circle cx="40" cy="40" r="36" class="icon-bg-circle" />
          <text x="40" y="54" text-anchor="middle" font-size="36">⚠️</text>
        </svg>
        <div class="icon-glow"></div>
      </div>

      <!-- title -->
      <h2 class="title">Warning</h2>

      <!-- message -->
      <div class="msg-box">
        <p class="msg">{message}</p>
      </div>

      <!-- circular countdown -->
      <div class="ring-wrap">
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={R} class="ring-track" />
          <circle
            cx="36" cy="36" r={R}
            class="ring-progress"
            style="stroke:{ringColor}; stroke-dasharray:{CIRC}; stroke-dashoffset:{dashOffset};"
          />
        </svg>
        <span class="ring-num" style="color:{ringColor}">{countdown}</span>
      </div>

      <p class="hint">Auto closing in {countdown}s</p>

      <button class="ok-btn" on:click={close}>OK</button>
    </div>
  </div>
{/if}

<style>
  /* overlay */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(15, 10, 10, 0.78);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease;
  }

  /* card */
  .modal-box {
    background: #ffffff;
    border-radius: 18px;
    padding: 0 2.2rem 2.2rem;
    max-width: 420px;
    width: 92%;
    text-align: center;
    box-shadow: 0 8px 16px rgba(0,0,0,0.12), 0 32px 64px rgba(0,0,0,0.22);
    animation: bounceIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    overflow: hidden;
    position: relative;
  }

  /* red top accent */
  .accent-bar {
    height: 5px;
    background: linear-gradient(90deg, #ef4444, #f97316, #ef4444);
    background-size: 200% 100%;
    margin: 0 -2.2rem 2rem;
    animation: shimmer 2s linear infinite;
  }

  /* icon */
  .icon-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1rem;
  }
  .icon-svg {
    animation: iconPulse 1s ease infinite alternate;
    position: relative;
    z-index: 1;
  }
  .icon-bg-circle {
    fill: rgba(239, 68, 68, 0.08);
    stroke: rgba(239, 68, 68, 0.18);
    stroke-width: 2;
  }
  .icon-glow {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%);
    animation: glowPulse 1s ease infinite alternate;
  }

  /* title */
  .title {
    font-size: 1.6rem;
    font-weight: 800;
    background: linear-gradient(135deg, #dc2626, #ef4444);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0 0 1.1rem;
    letter-spacing: 0.03em;
  }

  /* message */
  .msg-box {
    background: #fff5f5;
    border-left: 4px solid #ef4444;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 1.4rem;
  }
  .msg {
    font-size: 1.05rem;
    font-weight: 600;
    color: #1a202c;
    margin: 0;
    line-height: 1.55;
  }

  /* ring */
  .ring-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.4rem;
  }
  .ring-track {
    fill: none;
    stroke: #f3f4f6;
    stroke-width: 5;
  }
  .ring-progress {
    fill: none;
    stroke-width: 5;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: 50% 50%;
    transition: stroke-dashoffset 0.85s linear, stroke 0.4s ease;
  }
  .ring-num {
    position: absolute;
    font-size: 1.15rem;
    font-weight: 800;
    transition: color 0.4s ease;
  }

  .hint {
    font-size: 0.8rem;
    color: #9ca3af;
    margin: 0.3rem 0 1.4rem;
  }

  /* button */
  .ok-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 0.78rem 1rem;
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    letter-spacing: 0.04em;
    box-shadow: 0 4px 14px rgba(239,68,68,0.4);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .ok-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(239,68,68,0.55);
  }
  .ok-btn:active {
    transform: scale(0.97);
  }

  /* animations */
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes bounceIn {
    from { transform: scale(0.75) translateY(-30px); opacity: 0; }
    to   { transform: scale(1)    translateY(0);     opacity: 1; }
  }
  @keyframes iconPulse {
    from { transform: scale(1);    }
    to   { transform: scale(1.08); }
  }
  @keyframes glowPulse {
    from { opacity: 0.5; transform: scale(0.9); }
    to   { opacity: 1;   transform: scale(1.1); }
  }
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
