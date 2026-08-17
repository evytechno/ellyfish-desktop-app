<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import { checkAuth, canUseMediaLibrary } from "$lib/utils/auth";
  import Loader from "$lib/components/Loader.svelte";
  import LightBox from "$lib/components/LightBox.svelte";
  import { mediaFilterStore } from "$lib/stores/filterStore";
  import { get } from "svelte/store";
  import Swal from "sweetalert2";

  let loadingData = true;
  let loading = false;
  let firstLoad = false;
  let currentUser = null;

  let mediaItems = [];
  let sources = [];
  let totalItems = 0;

  let searchTerm = "";
  let currentPage = 1;
  let rowsPerPage = 24;
  let selectedFilter = "all";
  let customStartDate = null;
  let customEndDate = null;
  let typeFilter = "all";
  let sizeRange = "all";
  let sourceFilter = "";
  let sortBy = "createdAt";
  let sortDir = "desc";

  let lightboxImages = [];
  let lightboxStartIndex = 0;

  let refresh = false;
  let debounceRefreshTimeout;
  let debounceTimeout;

  // Share to Query
  let shareItem = null;
  let showShareModal = false;
  let querySearch = "";
  let queryResults = [];
  let queryLoading = false;
  let sharing = false;
  let querySearchTimeout;

  onMount(() => {
    currentUser = checkAuth();
    if (!currentUser) {
      loadingData = false;
      goto("/login");
      return;
    }
    if (!canUseMediaLibrary(currentUser)) {
      loadingData = false;
      goto("/admin/dashboard");
      return;
    }

    const filterState = get(mediaFilterStore) || {};
    searchTerm = filterState.searchTerm || "";
    currentPage = filterState.currentPage || 1;
    rowsPerPage = filterState.rowsPerPage || 24;
    selectedFilter = filterState.selectedFilter || "all";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
      selectedFilter = "all";
      customStartDate = null;
      customEndDate = null;
    }
    typeFilter = filterState.typeFilter || "all";
    sizeRange = filterState.sizeRange || "all";
    sourceFilter = filterState.sourceFilter || "";
    sortBy = filterState.sortBy || "createdAt";
    sortDir = filterState.sortDir || "desc";

    fetchMedia();
    setTimeout(() => {
      firstLoad = true;
    }, 500);
  });

  const updateFilterStore = (newValues) => {
    mediaFilterStore.update((currentState) => {
      return { ...currentState, ...newValues };
    });
  };

  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      try {
        await fetchMedia();
      } catch (error) {
      } finally {
        refresh = false;
      }
    }, 200);
  }

  function handleSearchChange(value) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      searchTerm = value;
      currentPage = 1;
    }, 300);
  }

  async function fetchMedia() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        page: currentPage.toString(),
        limit: rowsPerPage.toString(),
        search: searchTerm || "",
        type: typeFilter || "all",
        sort: sortBy || "createdAt",
        sortDir: sortDir || "desc",
      });

      if (sourceFilter) {
        query.append("source", sourceFilter);
      }

      if (sizeRange && sizeRange !== "all") {
        query.append("sizeRange", sizeRange);
      }

      let startDateFilter;
      let endDateFilter = new Date();

      if (selectedFilter === "last7days") {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        startDateFilter = sevenDaysAgo;
      } else if (selectedFilter === "last30days") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        startDateFilter = thirtyDaysAgo;
      } else if (selectedFilter === "today") {
        startDateFilter = new Date();
        startDateFilter.setHours(0, 0, 0, 0);
        endDateFilter.setHours(23, 59, 59, 999);
      } else if (
        selectedFilter === "custom" &&
        customStartDate &&
        customEndDate
      ) {
        query.append("startDate", customStartDate);
        query.append("endDate", customEndDate);
      }

      if (startDateFilter && selectedFilter !== "custom") {
        const formatLocalDate = (date) => date.toLocaleDateString("en-CA");
        query.append("startDate", formatLocalDate(startDateFilter));
        query.append("endDate", formatLocalDate(endDateFilter));
      }

      updateFilterStore({
        searchTerm,
        currentPage,
        rowsPerPage,
        selectedFilter,
        customStartDate,
        customEndDate,
        typeFilter,
        sizeRange,
        sourceFilter,
        sortBy,
        sortDir,
      });

      const data = await authApiFetch(
        `${API_ROUTES.MEDIA}?${query.toString()}`,
        { method: "GET" },
      );

      mediaItems = data.data || [];
      totalItems = data.total || 0;
      if (Array.isArray(data.sources)) {
        sources = data.sources;
      }
    } catch (error) {
      loading = false;
      errorHandle(error);
    } finally {
      loading = false;
      setTimeout(() => {
        loadingData = false;
      }, 300);
    }
  }

  $: [
    searchTerm,
    selectedFilter,
    customStartDate,
    customEndDate,
    currentPage,
    rowsPerPage,
    typeFilter,
    sizeRange,
    sourceFilter,
    sortBy,
    sortDir,
  ],
    checkFetchRecord();

  function checkFetchRecord() {
    if (firstLoad) {
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
        loadingData = false;
        return;
      }
      fetchMedia();
    }
  }

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
  }

  function shortenFileName(name, keepStart = 10, keepEnd = 10) {
    if (!name) return "";
    if (name.length <= keepStart + keepEnd) return name;
    return name.slice(0, keepStart) + "..." + name.slice(-keepEnd);
  }

  function getFileUrl(item) {
    if (!item?.url) return "";
    if (item.url.startsWith("http")) return item.url;
    return `${ATTACHMENT_BASE_URL}${item.url}`;
  }

  function openPreview(item) {
    const index = mediaItems.findIndex((m) => m.id === item.id);
    lightboxImages = mediaItems.map((m) => getFileUrl(m));
    lightboxStartIndex = index >= 0 ? index : 0;
  }

  function openShareToQuery(item, e) {
    e?.stopPropagation?.();
    shareItem = item;
    showShareModal = true;
    querySearch = "";
    queryResults = [];
    searchQueries("");
  }

  function closeShareModal() {
    showShareModal = false;
    shareItem = null;
    querySearch = "";
    queryResults = [];
    sharing = false;
  }

  function onQuerySearchInput(e) {
    clearTimeout(querySearchTimeout);
    const v = e.target.value;
    querySearchTimeout = setTimeout(() => {
      querySearch = v;
      searchQueries(v);
    }, 300);
  }

  async function searchQueries(term) {
    queryLoading = true;
    try {
      const q = new URLSearchParams({
        page: "1",
        limit: "12",
        search: term || "",
      });
      const sub = currentUser?.subRole;
      let lists = [];
      if (sub === "telecaller") {
        const res = await authApiFetch(`${API_ROUTES.QUERY}/my?${q}`).catch(() => ({ data: [] }));
        lists = [res?.data];
      } else if (sub === "tech" || sub === "tech_helper") {
        const res = await authApiFetch(`${API_ROUTES.QUERY}/assigned?${q}`).catch(() => ({ data: [] }));
        lists = [res?.data];
      } else {
        const [openRes, ipRes, reRes] = await Promise.all([
          authApiFetch(`${API_ROUTES.QUERY}?${q}&status=open`).catch(() => ({ data: [] })),
          authApiFetch(`${API_ROUTES.QUERY}?${q}&status=in_progress`).catch(() => ({ data: [] })),
          authApiFetch(`${API_ROUTES.QUERY}?${q}&status=reopened`).catch(() => ({ data: [] })),
        ]);
        lists = [openRes?.data, ipRes?.data, reRes?.data];
      }
      const map = new Map();
      for (const list of lists) {
        for (const row of list ?? []) {
          if (row?.id != null) map.set(row.id, row);
        }
      }
      queryResults = Array.from(map.values()).slice(0, 20);
    } catch (_) {
      queryResults = [];
    } finally {
      queryLoading = false;
    }
  }

  async function shareToQuery(query) {
    if (!shareItem || !query?.id || sharing) return;
    sharing = true;
    try {
      const fd = new FormData();
      fd.append("message", `Shared from Media: ${shareItem.name}`);
      fd.append("references", JSON.stringify([{
        url: shareItem.url,
        name: shareItem.name,
        mime: shareItem.mimeType || (shareItem.type === "pdf" ? "application/pdf" : "image/jpeg"),
      }]));
      await authApiFetch(`${API_ROUTES.QUERY}/${query.id}/chat`, {
        method: "POST",
        data: fd,
      });
      closeShareModal();
      const result = await Swal.fire({
        icon: "success",
        title: "Shared to query",
        text: query.ticketCode ? `${query.ticketCode} — ${query.subject ?? ""}` : (query.subject ?? `Query #${query.id}`),
        showCancelButton: true,
        confirmButtonText: "Open query",
        cancelButtonText: "Close",
        timer: 8000,
      });
      if (result.isConfirmed) goto(`/admin/query/${query.id}`);
    } catch (e) {
      const msg = typeof e?.data?.message === "string"
        ? e.data.message
        : "Could not share to this query. You may need to pick it up first, or it may be closed.";
      Swal.fire({ icon: "error", title: "Share failed", text: msg });
    } finally {
      sharing = false;
    }
  }

  function clearFilters() {
    searchTerm = "";
    selectedFilter = "all";
    customStartDate = null;
    customEndDate = null;
    typeFilter = "all";
    sizeRange = "all";
    sourceFilter = "";
    sortBy = "createdAt";
    sortDir = "desc";
    currentPage = 1;
  }

  $: totalPages = Math.max(1, Math.ceil(totalItems / rowsPerPage));

  function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
  }
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper">
  <div class="content">
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">Media</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Media</li>
          </ol>
        </nav>
      </div>
      <div class="gap-2 d-flex align-items-center flex-wrap">
        <a
          href="#refresh"
          on:click|preventDefault={refreshPage}
          class="btn btn-icon btn-outline-light shadow"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          aria-label="Refresh"
          data-bs-original-title="Refresh"
        >
          <i class="ti ti-refresh" class:spin={refresh}></i>
        </a>
        <a
          href="#collapse-header"
          class="btn btn-icon btn-outline-light shadow"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          aria-label="Collapse"
          data-bs-original-title="Collapse"
          id="collapse-header"><i class="ti ti-transition-top"></i></a
        >
      </div>
    </div>

    <div class="row row-gap-2 mb-3 align-items-center">
      <div class="col-auto">
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark">
            <i class="ti ti-search"></i>
          </span>
          <input
            type="text"
            value={searchTerm}
            on:input={(e) => handleSearchChange(e.target.value)}
            class="form-control"
            placeholder="Search files.."
            style="min-width:160px;"
          />
        </div>
      </div>

      <div class="col-auto">
        <select
          bind:value={typeFilter}
          on:change={() => (currentPage = 1)}
          class="form-select w-auto"
        >
          <option value="all">All Types</option>
          <option value="image">Images</option>
          <option value="pdf">PDFs</option>
        </select>
      </div>

      <div class="col-auto">
        <select
          bind:value={selectedFilter}
          on:change={() => (currentPage = 1)}
          class="form-select w-auto"
        >
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="last7days">Last 7 Days</option>
          <option value="last30days">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>

      {#if selectedFilter === "custom"}
        <div class="col-auto">
          <input
            type="date"
            bind:value={customStartDate}
            class="form-control"
            style="min-width:140px;"
          />
        </div>
        <div class="col-auto">
          <input
            type="date"
            bind:value={customEndDate}
            class="form-control"
            style="min-width:140px;"
          />
        </div>
      {/if}

      <div class="col-auto">
        <select
          bind:value={sizeRange}
          on:change={() => (currentPage = 1)}
          class="form-select w-auto"
        >
          <option value="all">All Sizes</option>
          <option value="small">Small (&lt; 100 KB)</option>
          <option value="medium">Medium (100 KB – 1 MB)</option>
          <option value="large">Large (&gt; 1 MB)</option>
        </select>
      </div>

      <div class="col-auto">
        <select
          bind:value={sourceFilter}
          on:change={() => (currentPage = 1)}
          class="form-select w-auto"
        >
          <option value="">All Sources</option>
          {#each sources as source}
            <option value={source}>{source}</option>
          {/each}
        </select>
      </div>

      <div class="col-auto">
        <select
          bind:value={sortBy}
          on:change={() => (currentPage = 1)}
          class="form-select w-auto"
        >
          <option value="createdAt">Sort by Date</option>
          <option value="name">Sort by Name</option>
          <option value="size">Sort by Size</option>
          <option value="type">Sort by Type</option>
        </select>
      </div>

      <div class="col-auto">
        <select
          bind:value={sortDir}
          on:change={() => (currentPage = 1)}
          class="form-select w-auto"
        >
          <option value="desc">Newest / High first</option>
          <option value="asc">Oldest / Low first</option>
        </select>
      </div>

      <div class="col"></div>

      <div class="col-auto">
        <button
          type="button"
          class="btn btn-outline-light shadow"
          on:click={clearFilters}
        >
          <i class="ti ti-filter-off me-1"></i>Clear
        </button>
      </div>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header flex items-center justify-between gap-2 flex-wrap">
        <h5 class="mb-0">Media Library</h5>
        <span class="text-muted">{totalItems} file{totalItems === 1 ? "" : "s"}</span>
      </div>
      <div class="card-body">
        {#if !loadingData && mediaItems.length === 0}
          <div class="text-center py-5 text-muted">
            <i class="ti ti-photo-off fs-1 d-block mb-2"></i>
            <p class="mb-0">No images or PDFs found for the selected filters.</p>
          </div>
        {:else}
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {#each mediaItems as item (item.id)}
              <div class="media-tile-wrap">
                <button
                  type="button"
                  class="media-tile text-start border rounded overflow-hidden bg-white hover:shadow transition-shadow"
                  on:click={() => openPreview(item)}
                >
                  <div
                    class="media-thumb flex items-center justify-center bg-light"
                  >
                    {#if item.type === "image"}
                      <img
                        src={getFileUrl(item)}
                        alt={item.name}
                        loading="lazy"
                        class="w-full h-full object-cover"
                      />
                    {:else}
                      <div class="flex flex-col items-center text-danger p-3">
                        <i class="ti ti-file-type-pdf fs-1"></i>
                        <span class="mt-1">PDF</span>
                      </div>
                    {/if}
                  </div>
                  <div class="p-2">
                    <div class="fw-medium text-dark truncate" title={item.name}>
                      {shortenFileName(item.name)}
                    </div>
                    <div class="text-muted mt-1 flex justify-between gap-1">
                      <span class="truncate capitalize">{item.source}</span>
                      <span class="flex-shrink-0">{formatFileSize(item.size)}</span>
                    </div>
                    <div class="text-muted mt-1">{formatDate(item.createdAt)}</div>
                  </div>
                </button>
                <button
                  type="button"
                  class="media-share-btn"
                  title="Share to Query"
                  on:click={(e) => openShareToQuery(item, e)}
                >
                  <i class="ti ti-share"></i>
                  <span>Share to Query</span>
                </button>
              </div>
            {/each}
          </div>

          <div
            class="flex items-center justify-between gap-2 flex-wrap mt-4 pt-3 border-top"
          >
            <div class="flex items-center gap-2">
              <span class="text-muted">Rows per page</span>
              <select
                class="form-select form-select-sm w-auto"
                bind:value={rowsPerPage}
                on:change={() => (currentPage = 1)}
              >
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={48}>48</option>
                <option value={96}>96</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-muted">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                class="btn btn-sm btn-outline-light"
                disabled={currentPage <= 1}
                on:click={() => goToPage(currentPage - 1)}
              >
                <i class="ti ti-chevron-left"></i>
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-light"
                disabled={currentPage >= totalPages}
                on:click={() => goToPage(currentPage + 1)}
              >
                <i class="ti ti-chevron-right"></i>
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

{#if lightboxImages.length}
  <LightBox bind:data={lightboxImages} startIndex={lightboxStartIndex} />
{/if}

{#if showShareModal && shareItem}
  <div class="share-backdrop" on:click|self={closeShareModal} role="presentation">
    <div class="share-modal" role="dialog" aria-modal="true" aria-label="Share to Query">
      <div class="share-head">
        <div>
          <div class="share-title">Share to Query</div>
          <div class="share-sub truncate" title={shareItem.name}>{shortenFileName(shareItem.name, 16, 12)}</div>
        </div>
        <button type="button" class="share-close" on:click={closeShareModal}><i class="ti ti-x"></i></button>
      </div>
      <div class="share-tools">
        <div class="input-icon input-icon-start position-relative flex-grow-1">
          <span class="input-icon-addon"><i class="ti ti-search"></i></span>
          <input
            type="text"
            class="form-control form-control-sm"
            placeholder="Search open / in-progress queries…"
            value={querySearch}
            on:input={onQuerySearchInput}
          />
        </div>
      </div>
      <div class="share-body">
        {#if queryLoading}
          <div class="share-empty"><span class="spinner-border spinner-border-sm text-primary"></span></div>
        {:else if queryResults.length === 0}
          <div class="share-empty"><i class="ti ti-search-off"></i><span>No matching queries</span></div>
        {:else}
          {#each queryResults as q (q.id)}
            <button
              type="button"
              class="share-row"
              disabled={sharing}
              on:click={() => shareToQuery(q)}
            >
              <div class="min-w-0 flex-grow-1 text-start">
                {#if q.ticketCode}
                  <div class="share-ticket">{q.ticketCode}</div>
                {/if}
                <div class="share-subject truncate">{q.subject ?? `Query #${q.id}`}</div>
              </div>
              <span class="badge share-status share-status--{q.status ?? 'open'}">
                {(q.status ?? "open").replace("_", " ")}
              </span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .media-tile-wrap {
    position: relative;
  }
  .media-tile {
    width: 100%;
    cursor: pointer;
    padding: 0;
    font-size: var(--app-font-size, 0.75rem);
    line-height: 1.45;
  }
  .media-thumb {
    height: 120px;
    overflow: hidden;
  }
  .media-share-btn {
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: 6px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: rgba(33, 37, 41, 0.88);
    color: #fff;
    font-size: 11px;
    font-weight: 400;
    display: none;
    align-items: center;
    justify-content: center;
    gap: 5px;
    cursor: pointer;
    z-index: 2;
  }
  .media-tile-wrap:hover .media-share-btn {
    display: inline-flex;
  }
  .media-share-btn:hover {
    background: #212529;
  }

  .share-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1080;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .share-modal {
    width: min(480px, 100%);
    max-height: min(76vh, 560px);
    background: #fff;
    border-radius: 10px;
    border: 1px solid #e9ecef;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: 12px;
  }
  .share-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid #f1f3f5;
  }
  .share-title { font-size: 14px; font-weight: 600; color: #212529; }
  .share-sub { font-size: 11px; color: #868e96; margin-top: 2px; max-width: 320px; }
  .share-close {
    width: 28px; height: 28px; padding: 0;
    border: 1px solid #dee2e6; border-radius: 6px; background: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    color: #868e96; cursor: pointer;
  }
  .share-tools {
    padding: 10px 14px;
    border-bottom: 1px solid #f1f3f5;
  }
  .share-tools :global(.form-control) {
    height: 28px !important;
    min-height: 28px !important;
    font-size: 11.5px !important;
    padding-left: 30px !important;
  }
  .share-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px;
  }
  .share-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 36px 12px;
    color: #adb5bd;
  }
  .share-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    background: #fff;
    margin-bottom: 6px;
    cursor: pointer;
    text-align: left;
  }
  .share-row:hover:not(:disabled) {
    background: #f8f9fa;
    border-color: #dee2e6;
  }
  .share-row:disabled { opacity: 0.6; cursor: wait; }
  .share-ticket {
    font-size: 10px;
    font-weight: 500;
    color: #868e96;
    letter-spacing: 0.2px;
  }
  .share-subject {
    font-size: 12px;
    font-weight: 500;
    color: #212529;
  }
  .share-status {
    font-size: 10px !important;
    font-weight: 500 !important;
    text-transform: lowercase;
    flex-shrink: 0;
  }
  .share-status--open { background: #e7f5ff; color: #1971c2; }
  .share-status--in_progress { background: #fff9db; color: #e67700; }
  .share-status--reopened { background: #fff5f5; color: #c92a2a; }

  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
