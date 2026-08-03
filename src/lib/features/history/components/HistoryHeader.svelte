<script>
  /** @type {'order' | 'auth'} */
  export let activeTab = "order";
  export let searchString = "";
  export let authSearchString = "";
  export let resultSummary = "";
  export let refresh = false;
  export let hasActiveFilters = false;
  /** @type {() => void} */
  export let onRefresh = () => {};
  /** @type {() => void} */
  export let onExport = () => {};
  /** @type {() => void} */
  export let onCopyLink = () => {};
  /** @type {() => void} */
  export let onClearFilters = () => {};
</script>

<div class="hx-header">
  <div>
    <h4 class="hx-title">
      {activeTab === "order" ? "Activity History" : "Auth History"}
    </h4>
    <div class="hx-subtitle">
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item active" aria-current="page">History</li>
        </ol>
      </nav>
      <span class="hx-range">
        {activeTab === "order" ? searchString : authSearchString}
      </span>
      {#if resultSummary}
        <span class="hx-range hx-range--muted">{resultSummary}</span>
      {/if}
    </div>
  </div>
  <div class="hx-header-actions">
    {#if hasActiveFilters}
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        on:click={onClearFilters}
        title="Reset filters on this tab"
      >
        <i class="ti ti-filter-off"></i>
        Clear filters
      </button>
    {/if}
    <button
      type="button"
      class="btn btn-sm btn-outline-secondary"
      on:click={onCopyLink}
      title="Copy shareable investigation link"
    >
      <i class="ti ti-link"></i>
      Copy link
    </button>
    <button
      type="button"
      class="btn btn-sm btn-outline-secondary"
      on:click={onExport}
      title="Export current page rows as CSV"
    >
      <i class="ti ti-download"></i>
      Export CSV
    </button>
    <button
      type="button"
      class="btn btn-sm btn-outline-secondary"
      class:hx-spin={refresh}
      on:click={onRefresh}
      title="Refresh"
    >
      <i class="ti ti-refresh"></i>
      Refresh
    </button>
  </div>
</div>
