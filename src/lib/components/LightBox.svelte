<script>
  import { portal } from "$lib/utils/portal";

  /** @type {Array<string | { url: string, label?: string, status?: string, note?: string, date?: string }>} */
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

  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "jfif", "avif", "heic", "heif"];

  function itemUrl(item) {
    if (!item) return "";
    if (typeof item === "string") return item;
    return item.url || "";
  }

  function itemMeta(item) {
    if (!item || typeof item === "string") return null;
    const label = item.label || item.type || "";
    const status = item.status || "";
    const note = item.note || "";
    const date = item.date || item.createdAt || "";
    if (!label && !status && !note && !date) return null;
    return { label, status, note, date };
  }

  function extOf(url) {
    if (!url || typeof url !== "string") return "";
    try {
      const path = url.split(/[?#]/)[0] || "";
      return path.split(".").pop()?.toLowerCase() || "";
    } catch {
      return "";
    }
  }

  function isPdf(url) {
    return extOf(url) === "pdf" || /\.pdf([?#]|$)/i.test(String(url || ""));
  }

  function isExcel(url) {
    const ext = extOf(url);
    return ["xlsx", "xls", "csv"].includes(ext);
  }

  /** Prefer <img> for uploads / unknown binary; only use iframe for docs. */
  function isImage(url) {
    if (!url || typeof url !== "string") return false;
    if (url.startsWith("blob:") || url.startsWith("data:image/")) return true;
    if (isPdf(url) || isExcel(url)) return false;
    const ext = extOf(url);
    if (imageExtensions.includes(ext)) return true;
    if (/\/uploads\//i.test(url)) return true;
    if (/\/(image|images|photo|photos|media|img)\b/i.test(url)) return true;
    return !ext || imageExtensions.includes(ext);
  }

  $: currentItem = displayImages[selectedIndex];
  $: currentUrl = itemUrl(currentItem);
  $: currentMeta = itemMeta(currentItem);
  $: showAsImage = isImage(currentUrl);
  $: showAsPdf = !showAsImage && isPdf(currentUrl);
  $: showAsExcel = !showAsImage && isExcel(currentUrl);

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
      {#if showAsImage}
        <img
          src={currentUrl}
          alt={currentMeta?.label || "Gallery item"}
          class="lightbox-img"
        />
      {:else if showAsPdf}
        <iframe
          src={currentUrl}
          title="Gallery item"
          class="lightbox-frame"
        ></iframe>
      {:else if showAsExcel}
        <div class="lightbox-download-card">
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="lightbox-download-btn"
          >
            Download Excel
          </a>
        </div>
      {:else}
        <img
          src={currentUrl}
          alt={currentMeta?.label || "Gallery item"}
          class="lightbox-img"
        />
      {/if}

      {#if currentMeta}
        <div class="lightbox-caption" on:click|stopPropagation role="presentation">
          <div class="lightbox-caption-row">
            {#if currentMeta.label}
              <span class="lightbox-badge lightbox-badge--label">{currentMeta.label}</span>
            {/if}
            {#if currentMeta.status}
              <span class="lightbox-badge lightbox-badge--status">{currentMeta.status}</span>
            {/if}
            {#if currentMeta.date}
              <span class="lightbox-caption-date">{currentMeta.date}</span>
            {/if}
          </div>
          {#if currentMeta.note}
            <div class="lightbox-caption-note">{currentMeta.note}</div>
          {/if}
        </div>
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
    background: rgba(0, 0, 0, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3.5rem 4.5rem;
    box-sizing: border-box;
  }

  .lightbox-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    color: #fff;
    background: rgba(0, 0, 0, 0.35);
    border: none;
    padding: 0.5rem;
    border-radius: 9999px;
    cursor: pointer;
    z-index: 2;
    transition: background 0.15s, color 0.15s;
  }
  .lightbox-close:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.2);
  }

  .lightbox-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    color: #212529;
    background: rgba(255, 255, 255, 0.95);
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
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    max-width: min(72rem, 92vw);
    max-height: 90vh;
    gap: 0.75rem;
  }

  .lightbox-img {
    display: block;
    max-width: min(72rem, 92vw);
    max-height: 72vh;
    width: auto;
    height: auto;
    object-fit: contain;
    margin: 0 auto;
    border-radius: 0.5rem;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
    background: transparent;
  }

  .lightbox-frame {
    width: min(80vw, 72rem);
    height: min(70vh, 800px);
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

  .lightbox-caption {
    width: min(36rem, 92vw);
    max-width: 100%;
    background: rgba(15, 23, 42, 0.88);
    color: #f8fafc;
    border-radius: 0.65rem;
    padding: 0.65rem 0.85rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  }

  .lightbox-caption-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.55rem;
  }

  .lightbox-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .lightbox-badge--label {
    background: #f59e0b;
    color: #fff;
  }

  .lightbox-badge--status {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: #e2e8f0;
  }

  .lightbox-caption-date {
    font-size: 0.75rem;
    color: #cbd5e1;
    margin-left: auto;
  }

  .lightbox-caption-note {
    margin-top: 0.4rem;
    font-size: 0.85rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    color: #f1f5f9;
  }

  .lightbox-counter {
    position: absolute;
    bottom: -2.25rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    padding: 0.35rem 1rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    pointer-events: none;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .animate-fade-in {
    animation: fade-in 0.2s ease-in-out;
  }
</style>
