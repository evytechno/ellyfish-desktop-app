<script>
  import { portal } from "$lib/utils/portal";

  /** @type {Array<string | { url: string, label?: string, status?: string, note?: string, date?: string, fileName?: string }>} */
  export let data = [];
  export let startIndex = 0;

  $: displayImages = Array.isArray(data) ? data : [];
  $: hasMultiple = displayImages.length > 1;

  let selectedIndex = 0;
  let scale = 1;
  let rotate = 0;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;
  /** Sync index from parent only when gallery open payload changes. */
  let syncedData = null;
  let syncedStart = null;

  $: if (displayImages.length > 0) {
    const openedFresh = data !== syncedData || startIndex !== syncedStart;
    if (openedFresh) {
      syncedData = data;
      syncedStart = startIndex;
      selectedIndex = Math.min(
        Math.max(0, Number(startIndex) || 0),
        displayImages.length - 1,
      );
      resetView();
    } else if (selectedIndex >= displayImages.length) {
      selectedIndex = displayImages.length - 1;
    }
  } else {
    syncedData = null;
    syncedStart = null;
  }

  function resetView() {
    scale = 1;
    rotate = 0;
    panX = 0;
    panY = 0;
    dragging = false;
  }

  function closeModal() {
    selectedIndex = 0;
    resetView();
    data = [];
  }

  function goToPrevious(e) {
    e?.stopPropagation?.();
    if (!hasMultiple) return;
    selectedIndex =
      selectedIndex === 0 ? displayImages.length - 1 : selectedIndex - 1;
    resetView();
  }

  function goToNext(e) {
    e?.stopPropagation?.();
    if (!hasMultiple) return;
    selectedIndex =
      selectedIndex === displayImages.length - 1 ? 0 : selectedIndex + 1;
    resetView();
  }

  function goToIndex(i, e) {
    e?.stopPropagation?.();
    if (i < 0 || i >= displayImages.length) return;
    selectedIndex = i;
    resetView();
  }

  function zoomBy(delta, e) {
    e?.stopPropagation?.();
    scale = Math.min(5, Math.max(0.25, Math.round((scale + delta) * 100) / 100));
    if (scale <= 1) {
      panX = 0;
      panY = 0;
    }
  }

  function fitView(e) {
    e?.stopPropagation?.();
    resetView();
  }

  function rotateBy(deg, e) {
    e?.stopPropagation?.();
    rotate = (rotate + deg) % 360;
  }

  function toggleZoom(e) {
    e?.stopPropagation?.();
    if (scale > 1) {
      resetView();
    } else {
      scale = 2;
    }
  }

  function onWheel(e) {
    if (!showAsImage) return;
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -0.15 : 0.15);
  }

  function onPointerDown(e) {
    if (!showAsImage || scale <= 1) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX;
    panStartY = panY;
    e.currentTarget?.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    panX = panStartX + (e.clientX - dragStartX);
    panY = panStartY + (e.clientY - dragStartY);
  }

  function onPointerUp(e) {
    dragging = false;
    try {
      e.currentTarget?.releasePointerCapture?.(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  }

  function handleKeyDown(e) {
    if (!displayImages.length) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goToPrevious(e);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goToNext(e);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy(0.25);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomBy(-0.25);
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      rotateBy(90);
    } else if (e.key === "0") {
      e.preventDefault();
      fitView();
    }
  }

  $: if (typeof document !== "undefined") {
    if (displayImages.length > 0) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }

  const imageExtensions = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "bmp",
    "svg",
    "jfif",
    "avif",
    "heic",
    "heif",
  ];

  function itemUrl(item) {
    if (!item) return "";
    if (typeof item === "string") return item;
    return item.url || "";
  }

  function itemFileName(item) {
    if (!item) return "Image";
    if (typeof item === "string") {
      try {
        const path = item.split(/[?#]/)[0] || "";
        return path.split("/").pop() || "Image";
      } catch {
        return "Image";
      }
    }
    if (item.fileName) return item.fileName;
    const url = item.url || "";
    try {
      const path = url.split(/[?#]/)[0] || "";
      return path.split("/").pop() || item.label || "Image";
    } catch {
      return item.label || "Image";
    }
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
  $: currentName = itemFileName(currentItem);
  $: showAsImage = isImage(currentUrl);
  $: showAsPdf = !showAsImage && isPdf(currentUrl);
  $: showAsExcel = !showAsImage && isExcel(currentUrl);
  $: zoomPct = Math.round(scale * 100);
  $: imgTransform = `translate(${panX}px, ${panY}px) scale(${scale}) rotate(${rotate}deg)`;
</script>

<svelte:window on:keydown={handleKeyDown} />

{#if displayImages.length}
  <div
    use:portal
    class="lightbox-overlay animate-fade-in"
    role="dialog"
    aria-modal="true"
    aria-label="Image viewer"
    on:click={closeModal}
  >
    <header class="lightbox-header" on:click|stopPropagation role="presentation">
      <div class="lightbox-header-info">
        <div class="lightbox-title" title={currentName}>{currentName}</div>
        <div class="lightbox-subtitle">
          {#if hasMultiple}
            {selectedIndex + 1} / {displayImages.length}
          {:else}
            1 / 1
          {/if}
          · {zoomPct}%
        </div>
      </div>
      <div class="lightbox-toolbar">
        {#if showAsImage}
          <button type="button" class="lightbox-tool" title="Zoom in (+)" on:click={(e) => zoomBy(0.25, e)} aria-label="Zoom in">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>
          </button>
          <button type="button" class="lightbox-tool" title="Zoom out (-)" on:click={(e) => zoomBy(-0.25, e)} aria-label="Zoom out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg>
          </button>
          <button type="button" class="lightbox-tool" title="Fit / reset (0)" on:click={fitView} aria-label="Fit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>
          </button>
          <button type="button" class="lightbox-tool" title="Rotate left" on:click={(e) => rotateBy(-90, e)} aria-label="Rotate left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
          </button>
          <button type="button" class="lightbox-tool" title="Rotate right (R)" on:click={(e) => rotateBy(90, e)} aria-label="Rotate right">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>
          </button>
        {/if}
        <a
          class="lightbox-tool"
          href={currentUrl}
          download={currentName}
          target="_blank"
          rel="noopener noreferrer"
          title="Download"
          aria-label="Download"
          on:click|stopPropagation
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
        </a>
        <button type="button" class="lightbox-tool lightbox-tool--close" title="Close (Esc)" on:click={closeModal} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </header>

    {#if hasMultiple}
      <button type="button" on:click={goToPrevious} class="lightbox-nav lightbox-nav--prev" aria-label="Previous">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
    {/if}

    <div
      class="lightbox-stage"
      class:lightbox-stage--panning={dragging}
      class:lightbox-stage--zoomed={scale > 1}
      on:click|stopPropagation
      on:wheel={onWheel}
      role="presentation"
    >
      {#if showAsImage}
        <img
          src={currentUrl}
          alt={currentMeta?.label || currentName}
          class="lightbox-img"
          style="transform: {imgTransform}; cursor: {scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in'};"
          draggable="false"
          on:dblclick={toggleZoom}
          on:pointerdown={onPointerDown}
          on:pointermove={onPointerMove}
          on:pointerup={onPointerUp}
          on:pointercancel={onPointerUp}
        />
      {:else if showAsPdf}
        <iframe src={currentUrl} title={currentName} class="lightbox-frame"></iframe>
      {:else if showAsExcel}
        <div class="lightbox-download-card">
          <a href={currentUrl} target="_blank" rel="noopener noreferrer" class="lightbox-download-btn">
            Download Excel
          </a>
        </div>
      {:else}
        <img
          src={currentUrl}
          alt={currentMeta?.label || currentName}
          class="lightbox-img"
          style="transform: {imgTransform};"
          draggable="false"
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
    </div>

    {#if hasMultiple}
      <button type="button" on:click={goToNext} class="lightbox-nav lightbox-nav--next" aria-label="Next">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    {/if}

    {#if hasMultiple}
      <div class="lightbox-thumbs" on:click|stopPropagation role="presentation">
        {#each displayImages as item, i}
          <button
            type="button"
            class="lightbox-thumb"
            class:lightbox-thumb--active={i === selectedIndex}
            on:click={(e) => goToIndex(i, e)}
            aria-label="Go to image {i + 1}"
          >
            {#if isImage(itemUrl(item))}
              <img src={itemUrl(item)} alt="" />
            {:else}
              <span class="lightbox-thumb-fallback">{i + 1}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    <footer class="lightbox-footer" on:click|stopPropagation role="presentation">
      Scroll to zoom · drag to pan when zoomed · double-click to toggle 200%
      {#if hasMultiple}
        · ← → gallery
      {/if}
      · + − zoom · R rotate · 0 reset · Esc close
    </footer>
  </div>
{/if}

<style>
  .lightbox-overlay {
    position: fixed;
    inset: 0;
    z-index: 100000;
    background: rgba(12, 14, 18, 0.94);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: stretch;
    box-sizing: border-box;
  }

  .lightbox-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.65rem 0.85rem 0.65rem 1rem;
    background: rgba(0, 0, 0, 0.45);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    z-index: 3;
  }

  .lightbox-header-info {
    min-width: 0;
    flex: 1;
  }

  .lightbox-title {
    color: #f8fafc;
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lightbox-subtitle {
    color: #94a3b8;
    font-size: 0.75rem;
    margin-top: 0.1rem;
  }

  .lightbox-toolbar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .lightbox-tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.1rem;
    height: 2.1rem;
    border: none;
    border-radius: 0.4rem;
    background: transparent;
    color: #e2e8f0;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s, color 0.15s;
  }
  .lightbox-tool:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
  .lightbox-tool--close:hover {
    background: rgba(239, 68, 68, 0.35);
  }

  .lightbox-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.18);
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 9999px;
    cursor: pointer;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .lightbox-nav:hover {
    background: rgba(255, 255, 255, 0.22);
  }
  .lightbox-nav--prev { left: 0.75rem; }
  .lightbox-nav--next { right: 0.75rem; }

  .lightbox-stage {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 1rem 4rem 0.5rem;
    overflow: hidden;
    gap: 0.75rem;
  }

  .lightbox-img {
    display: block;
    max-width: min(72rem, 88vw);
    max-height: min(68vh, calc(100vh - 11rem));
    width: auto;
    height: auto;
    object-fit: contain;
    margin: 0 auto;
    border-radius: 0.25rem;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.55);
    background: transparent;
    transform-origin: center center;
    user-select: none;
    -webkit-user-drag: none;
    transition: transform 0.05s linear;
  }

  .lightbox-stage--panning .lightbox-img {
    transition: none;
  }

  .lightbox-frame {
    width: min(80vw, 72rem);
    height: min(65vh, 800px);
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
    z-index: 1;
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

  .lightbox-thumbs {
    flex: 0 0 auto;
    display: flex;
    gap: 0.4rem;
    justify-content: center;
    align-items: center;
    padding: 0.5rem 1rem;
    overflow-x: auto;
    max-width: 100%;
    z-index: 2;
  }

  .lightbox-thumb {
    flex: 0 0 auto;
    width: 3rem;
    height: 3rem;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 0.35rem;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
    cursor: pointer;
    opacity: 0.65;
    transition: opacity 0.15s, border-color 0.15s;
  }
  .lightbox-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .lightbox-thumb:hover { opacity: 1; }
  .lightbox-thumb--active {
    opacity: 1;
    border-color: #f8fafc;
  }
  .lightbox-thumb-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: #cbd5e1;
    font-size: 0.75rem;
  }

  .lightbox-footer {
    flex: 0 0 auto;
    text-align: center;
    padding: 0.45rem 1rem 0.65rem;
    color: #94a3b8;
    font-size: 0.72rem;
    background: rgba(0, 0, 0, 0.35);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    z-index: 2;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .animate-fade-in {
    animation: fade-in 0.2s ease-in-out;
  }

  @media (max-width: 640px) {
    .lightbox-stage { padding: 0.75rem 3rem 0.5rem; }
    .lightbox-nav--prev { left: 0.35rem; }
    .lightbox-nav--next { right: 0.35rem; }
    .lightbox-footer { font-size: 0.65rem; }
  }
</style>
