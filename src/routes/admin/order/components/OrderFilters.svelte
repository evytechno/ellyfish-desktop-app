<script>
  import { createEventDispatcher } from "svelte";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";

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

  function changeViewType(type) {
    dispatch("viewTypeChange", type);
  }
</script>

<!-- Filter bar -->
{#if trashBin}
  <div class="mb-3">
    <button class="btn btn-outline-secondary btn-sm" on:click={() => dispatch("trashToggle")}>
      <i class="ti ti-arrow-narrow-left me-1"></i>Back
    </button>
  </div>
{:else}
  <div class="row g-2 align-items-center mb-3">
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
{/if}
