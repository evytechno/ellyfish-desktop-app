<script>
  import { createEventDispatcher } from "svelte";
  import { statusNamesStore } from "$lib/stores/statusNames";

  export let users = [];
  export let companies = [];
  export let allStatuses = [];
  export let currentUser = null;
  export let viewType = "list";
  export let trashBin = false;

  // Two-way bound filter values
  export let userId = null;
  export let companyId = null;
  export let filterStatus = null;
  export let filterCategory = "";
  export let searchTerm = "";
  export let selectedFilter = "last7days";
  export let customStartDate = null;
  export let customEndDate = null;
  export let orderBy = "createdAt";
  export let filterSource = "";
  export let filterQuick = "";
  export let attentionFilters = [];
  export let attentionGroups = [];

  const dispatch = createEventDispatcher();

  let debounceSearch;
  let debounceCategory;

  function handleSearchInput(e) {
    clearTimeout(debounceSearch);
    debounceSearch = setTimeout(() => {
      searchTerm = e.target.value;
      dispatch("filterChange");
    }, 300);
  }

  function handleCategoryInput(e) {
    clearTimeout(debounceCategory);
    debounceCategory = setTimeout(() => {
      filterCategory = e.target.value;
      dispatch("filterChange");
    }, 300);
  }

  function onSelectChange() {
    dispatch("filterChange");
  }

  function setQuick(value) {
    filterQuick = filterQuick === value ? "" : value;
    dispatch("filterChange");
  }

  function clearQuick() {
    if (!filterQuick) return;
    filterQuick = "";
    dispatch("filterChange");
  }

  function changeViewType(type) {
    dispatch("viewTypeChange", type);
  }

  $: activeAttention = attentionFilters.find((f) => f.value === filterQuick) || null;
</script>

<!-- Filter bar -->
{#if trashBin}
  <div class="mb-3">
    <button class="btn btn-outline-secondary btn-sm" on:click={() => dispatch("trashToggle")}>
      <i class="ti ti-arrow-narrow-left me-1"></i>Back
    </button>
  </div>
{:else}
  <div class="row g-2 align-items-center mb-2">
    <!-- Search -->
    <div class="col-auto">
      <div class="input-icon input-icon-start position-relative">
        <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
        <input
          type="text"
          value={searchTerm}
          on:input={handleSearchInput}
          class="form-control"
          placeholder="Search.."
          style="min-width:160px;"
        />
      </div>
    </div>

    <!-- Order By -->
    <div class="col-auto">
      <select bind:value={orderBy} on:change={onSelectChange} class="form-select w-auto">
        <option value="createdAt">Created At</option>
        <option value="orderDate">Order Date</option>
      </select>
    </div>

    <!-- Date Range -->
    <div class="col-auto">
      <select bind:value={selectedFilter} on:change={onSelectChange} class="form-select w-auto">
        <option value="all">All Orders</option>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="last7days">Last 7 Days</option>
        <option value="last30days">Last 30 Days</option>
        <option value="custom">Custom Range</option>
      </select>
    </div>

    {#if selectedFilter === "custom"}
      <div class="col-auto">
        <input type="date" bind:value={customStartDate} on:change={onSelectChange} class="form-control w-auto" />
      </div>
      <div class="col-auto">
        <input type="date" bind:value={customEndDate} on:change={onSelectChange} class="form-control w-auto" />
      </div>
    {/if}

    <!-- User filter -->
    {#if currentUser?.role !== "user"}
      <div class="col-auto">
        <select bind:value={userId} on:change={onSelectChange} class="form-select w-auto">
          <option value={null}>Select User</option>
          {#each users.filter((u) => {
            if (["master", "admin", "manager"].includes(currentUser?.role)) return true;
            return u.subRole === currentUser?.subRole;
          }) as user}
            <option value={user?.id}>{user?.name}</option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Company filter -->
    {#if currentUser?.role !== "user"}
      <div class="col-auto">
        <select bind:value={companyId} on:change={onSelectChange} class="form-select w-auto">
          <option value={null}>Select Company</option>
          {#each companies as company}
            <option value={company?.id}>{company?.name}</option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Status filter -->
    <div class="col-auto">
      <select bind:value={filterStatus} on:change={onSelectChange} class="form-select w-auto">
        <option value={null}>All Status</option>
        {#each allStatuses as status}
          <option value={status}>{$statusNamesStore[status]?.name ?? status}</option>
        {/each}
      </select>
    </div>

    <!-- Category filter -->
    <div class="col-auto">
      <input
        type="text"
        value={filterCategory}
        on:input={handleCategoryInput}
        class="form-control"
        placeholder="Category.."
        style="min-width:120px;"
      />
    </div>

    <!-- Source filter -->
    <div class="col-auto">
      <select bind:value={filterSource} on:change={onSelectChange} class="form-select w-auto">
        <option value="">All Sources</option>
        <option value="old_import">Old Import</option>
      </select>
    </div>

    <!-- Spacer -->
    <div class="col"></div>

    <!-- Trash bin -->
    {#if currentUser?.role !== "user"}
      <div class="col-auto">
        <div class="d-flex align-items-center shadow p-1 rounded border view-icons bg-white">
          <button
            on:click={() => dispatch("trashToggle")}
            class="flex-shrink-0 btn btn-sm p-1 border-0 fs-14 bg-primary text-white"
          >
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
    {/if}

    <!-- View type toggle -->
    <div class="col-auto">
      <div class="d-flex align-items-center shadow p-1 rounded border view-icons bg-white">
        <button
          on:click={() => changeViewType("list")}
          class="btn btn-sm p-1 border-0 fs-14"
          class:active={viewType === "list"}
        >
          <i class="ti ti-list-tree"></i>
        </button>
        <button
          on:click={() => changeViewType("grid")}
          class="flex-shrink-0 btn btn-sm p-1 border-0 ms-1 fs-14"
          class:active={viewType === "grid"}
        >
          <i class="ti ti-grid-dots"></i>
        </button>
      </div>
    </div>

    <!-- Add order -->
    <div class="col-auto">
      <a
        href="#offcanvas_add"
        class="btn btn-primary"
        data-bs-toggle="offcanvas"
        data-bs-target="#offcanvas_add"
      >
        <i class="ti ti-square-rounded-plus-filled me-1"></i>Add Order
      </a>
    </div>
  </div>

  {#if attentionFilters?.length}
    <div class="attn-bar mb-3" aria-label="Orders needing attention">
      <div class="attn-bar__head">
        <div class="attn-bar__title">
          <i class="ti ti-filter"></i>
          <span>Needs attention</span>
          {#if activeAttention}
            <span class="attn-bar__active-tag">{activeAttention.label}</span>
          {/if}
        </div>
        {#if filterQuick}
          <button type="button" class="attn-bar__clear" on:click={clearQuick}>
            <i class="ti ti-x"></i> Clear
          </button>
        {/if}
      </div>
      <div class="attn-bar__body">
        {#each attentionGroups as g}
          <div class="attn-bar__group">
            <span class="attn-bar__group-label">{g.label}</span>
            <div class="attn-bar__seg" role="group" aria-label={g.label}>
              {#each attentionFilters.filter((f) => f.group === g.key) as f}
                <button
                  type="button"
                  class="attn-bar__btn"
                  class:attn-bar__btn--on={filterQuick === f.value}
                  title={f.hint}
                  aria-pressed={filterQuick === f.value}
                  on:click={() => setQuick(f.value)}
                >
                  <i class="ti {f.icon}"></i>
                  <span>{f.label}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/if}

<style>
  .attn-bar {
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.45;
  }
  .attn-bar__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .attn-bar__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: #343a40;
  }
  .attn-bar__title :global(i) {
    color: #868e96;
    font-size: 13px;
  }
  .attn-bar__active-tag {
    font-size: 11px;
    font-weight: 400;
    color: #364fc7;
    background: #edf2ff;
    border: 1px solid #bac8ff;
    border-radius: 4px;
    padding: 1px 7px;
  }
  .attn-bar__clear {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border: none;
    background: transparent;
    color: #868e96;
    font-size: 11px;
    font-weight: 400;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
  }
  .attn-bar__clear:hover {
    color: #c92a2a;
    background: #fff5f5;
  }
  .attn-bar__body {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
  }
  .attn-bar__group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .attn-bar__group-label {
    font-size: 11px;
    font-weight: 400;
    color: #868e96;
    padding-left: 2px;
  }
  .attn-bar__seg {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0;
    background: #f1f3f5;
    border-radius: 6px;
    padding: 2px;
  }
  .attn-bar__btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: none;
    background: transparent;
    color: #495057;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.2;
    padding: 5px 9px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  }
  .attn-bar__btn :global(i) {
    font-size: 13px;
    opacity: 0.75;
  }
  .attn-bar__btn:hover {
    color: #212529;
    background: rgba(255, 255, 255, 0.7);
  }
  .attn-bar__btn--on {
    background: #fff !important;
    color: #212529 !important;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  }
  .attn-bar__btn--on :global(i) {
    color: #364fc7;
    opacity: 1;
  }

  /* Compact filter controls */
  :global(.order-page) .form-control,
  :global(.order-page) .form-select,
  .row :global(.form-control),
  .row :global(.form-select) {
    font-size: var(--app-font-size, 0.75rem) !important;
    height: 28px;
    min-height: 28px;
    padding: 2px 8px;
  }
  .row :global(.btn),
  .row :global(.btn-sm) {
    font-size: var(--app-font-size, 0.75rem) !important;
  }
</style>
