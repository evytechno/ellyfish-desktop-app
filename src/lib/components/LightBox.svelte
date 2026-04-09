<script>
  export let data = [];

  $: displayImages = data.length > 0 ? data : [];

  let selectedIndex = 0;

  function openModal(index) {
    selectedIndex = index;
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
    if (selectedIndex === null) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "ArrowLeft") goToPrevious(e);
    if (e.key === "ArrowRight") goToNext(e);
  }

  $: if (typeof document !== "undefined") {
    if (data.length > 0) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
  const isImage = (url) => {
    const ext = url.split(".").pop()?.toLowerCase();
    return imageExtensions.includes(ext);
  };

  $: if (data.length > 0 && selectedIndex === null) {
    selectedIndex = 0;
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div>
  <!-- Modal -->
  {#if data.length}
    <div
      class="fixed inset-0 bg-[#00000070] z-[999999] flex items-center justify-center p-4 animate-fade-in"
      role="button"
      tabindex="0"
      aria-label="Close modal"
      on:click={closeModal}
      on:keydown={(e) => {
        if (e.key === "Enter" || e.key === " ") closeModal();
      }}
    >
      <!-- Close Button -->
      <button
        on:click={closeModal}
        class="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors p-2 rounded-full hover:bg-white hover:bg-opacity-10 z-10"
        aria-label="Close"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      <!-- Previous Button -->
      <!-- <button
        on:click={goToPrevious}
        class="absolute left-4 text-white hover:text-gray-300 transition-colors p-3 rounded-full hover:bg-white hover:bg-opacity-10 z-10"
        aria-label="Previous"
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button> -->

      <!-- Image Container -->
      <div
        class="relative max-w-6xl max-h-screen flex items-center justify-center"
        on:click={(e) => e.stopPropagation()}
        role="presentation"
      >
        <!-- {#if isImage(displayImages[selectedIndex])}
          <img
            src={displayImages[selectedIndex]}
            alt="Gallery item"
            class="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        {:else}
          <iframe
            src={displayImages[selectedIndex]}
            title="Gallery item"
            class="w-[80vw] h-[90vh] bg-white rounded-lg shadow-2xl"
          ></iframe>
        {/if} -->
        {#if isImage(displayImages[selectedIndex])}
          <img
            src={displayImages[selectedIndex]}
            alt="Gallery item"
            class="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        {:else if displayImages[selectedIndex].toLowerCase().endsWith(".pdf")}
          <iframe
            src={displayImages[selectedIndex]}
            title="Gallery item"
            class="w-[80vw] h-[90vh] bg-white rounded-lg shadow-2xl"
          ></iframe>
        {:else if displayImages[selectedIndex].toLowerCase().endsWith(".xlsx")}
          <div class="card w-sm p-5">
            <a
              href={displayImages[selectedIndex]}
              target="_blank"
              class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            >
              Download Excel
            </a>
          </div>
        {:else}
          <iframe
            src={displayImages[selectedIndex]}
            title="Gallery item"
            class="w-[80vw] h-[90vh] bg-white rounded-lg shadow-2xl"
          ></iframe>
        {/if}

        <!-- Image Counter -->
        <!-- <div
          class="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-full text-sm"
        >
          {selectedIndex + 1} / {displayImages.length}
        </div> -->
      </div>

      <!-- Next Button -->
      <!-- <button
        on:click={goToNext}
        class="absolute right-4 text-white hover:text-gray-300 transition-colors p-3 rounded-full hover:bg-white hover:bg-opacity-10 z-10"
        aria-label="Next"
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button> -->
    </div>
  {/if}
</div>

<style>
  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .animate-fade-in {
    animation: fade-in 0.2s ease-in-out;
  }
</style>
