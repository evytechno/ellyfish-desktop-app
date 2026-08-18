<script>
  import { portal } from "$lib/utils/portal";

  export let data = [];
  export let startIndex = 0;

  $: displayImages = data.length > 0 ? data : [];

  let selectedIndex = 0;

  $: if (data.length > 0) {
    selectedIndex = startIndex ?? 0;
  }

  function closeModal() {
    selectedIndex = null;
    data = [];
  }

  function goToPrevious(e) {
    e.stopPropagation();
    selectedIndex =
      selectedIndex === 0 ? displayImages.length - 1 : selectedIndex - 1;
  }

  function goToNext(e) {
    e.stopPropagation();
    selectedIndex =
      selectedIndex === displayImages.length - 1 ? 0 : selectedIndex + 1;
  }

  function handleKeyDown(e) {
    if (!data.length || selectedIndex === null) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "ArrowLeft") goToPrevious(e);
    if (e.key === "ArrowRight") goToNext(e);
  }

  $: if (typeof document !== "undefined") {
    if (data.length > 0) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }

  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
  const isImage = (url) => {
    if (!url) return false;
    if (url.startsWith("blob:") || url.startsWith("data:image/")) return true;
    const ext = url.split(".").pop()?.split(/[?#]/)[0]?.toLowerCase();
    return imageExtensions.includes(ext);
  };

  $: if (data.length > 0 && selectedIndex === null) {
    selectedIndex = 0;
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

{#if data.length}
  <div
    use:portal
    class="lightbox-overlay animate-fade-in"
    role="button"
    tabindex="0"
    aria-label="Close modal"
    on:click={closeModal}
    on:keydown={(e) => {
      if (e.key === "Enter" || e.key === " ") closeModal();
    }}
  >
    <button
      type="button"
      on:click={closeModal}
      class="lightbox-close"
      aria-label="Close"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>

    {#if displayImages.length > 1}
      <button type="button" on:click={goToPrevious} class="lightbox-nav lightbox-nav--prev" aria-label="Previous">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
    {/if}

    <div class="lightbox-stage" on:click|stopPropagation role="presentation">
      {#if isImage(displayImages[selectedIndex])}
        <img
          src={displayImages[selectedIndex]}
          alt="Gallery item"
          class="lightbox-img"
        />
      {:else if displayImages[selectedIndex].toLowerCase().endsWith(".pdf")}
        <iframe
          src={displayImages[selectedIndex]}
          title="Gallery item"
          class="lightbox-frame"
        ></iframe>
      {:else if displayImages[selectedIndex].toLowerCase().endsWith(".xlsx")}
        <div class="lightbox-download-card">
          <a
            href={displayImages[selectedIndex]}
            target="_blank"
            rel="noopener noreferrer"
            class="lightbox-download-btn"
          >
            Download Excel
          </a>
        </div>
      {:else}
        <iframe
          src={displayImages[selectedIndex]}
          title="Gallery item"
          class="lightbox-frame"
        ></iframe>
      {/if}

      {#if displayImages.length > 1}
        <div class="lightbox-counter">
          {selectedIndex + 1} / {displayImages.length}
        </div>
      {/if}
    </div>

    {#if displayImages.length > 1}
      <button type="button" on:click={goToNext} class="lightbox-nav lightbox-nav--next" aria-label="Next">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    {/if}
  </div>
{/if}

<style>
  .lightbox-overlay {
    position: fixed;
    inset: 0;
    z-index: 100000;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .lightbox-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    color: #fff;
    background: none;
    border: none;
    padding: 0.5rem;
    border-radius: 9999px;
    cursor: pointer;
    z-index: 2;
    transition: background 0.15s, color 0.15s;
  }
  .lightbox-close:hover {
    color: #e9ecef;
    background: rgba(255, 255, 255, 0.1);
  }

  .lightbox-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    color: #fff;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid #dee2e6;
    padding: 0.75rem;
    border-radius: 9999px;
    cursor: pointer;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
    transition: background 0.15s, color 0.15s;
  }
  .lightbox-nav:hover {
    color: #3b5bdb;
    background: #fff;
  }
  .lightbox-nav--prev { left: 1rem; }
  .lightbox-nav--next { right: 1rem; }

  .lightbox-stage {
    position: relative;
    max-width: min(72rem, 96vw);
    max-height: 96vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .lightbox-img {
    max-width: 100%;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 0.5rem;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
  }

  .lightbox-frame {
    width: 80vw;
    height: 90vh;
    background: #fff;
    border-radius: 0.5rem;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
    border: none;
  }

  .lightbox-download-card {
    background: #fff;
    border-radius: 0.5rem;
    padding: 1.25rem;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
  }

  .lightbox-download-btn {
    display: inline-block;
    background: #2563eb;
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    text-decoration: none;
  }
  .lightbox-download-btn:hover { background: #1d4ed8; color: #fff; }

  .lightbox-counter {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    padding: 0.35rem 1rem;
    border-radius: 9999px;
    font-size: 0.875rem;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .animate-fade-in {
    animation: fade-in 0.2s ease-in-out;
  }
</style>
