<script>
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";

  let previousOverflow;

  onMount(() => {
    if (typeof window !== "undefined") {
      previousOverflow = document.body.style.overflow;
      // document.body.style.overflow = "hidden";
    }
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      document.body.style.overflow = previousOverflow || "";
    }
  });
</script>

<div
  class="main-loader"
  role="status"
  aria-live="polite"
  aria-busy="true"
  in:fade={{ duration: 100 }}
  out:fade={{ duration: 300 }}
>
  <div class="loader">
    <!-- SVG Spinner -->
    <svg
      width="50"
      height="50"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      <circle
        cx="20"
        cy="20"
        r="18"
        stroke="#555"
        stroke-width="4"
        stroke-linecap="round"
        stroke-dasharray="100"
        stroke-dashoffset="60"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          dur="1s"
          repeatCount="indefinite"
          from="0 20 20"
          to="360 20 20"
        />
      </circle>
    </svg>
  </div>
</div>

<style>
  .main-loader {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.2);
    z-index: 9999;
    height: 100vh;
    width: 100vw;
    animation: fadeIn 0.3s ease-in-out;
  }

  .loader {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
