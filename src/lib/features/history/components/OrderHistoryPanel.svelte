<script>
  import { fade } from "svelte/transition";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { DATE_PRESETS } from "../constants.js";
  import AttentionBanner from "./AttentionBanner.svelte";
  import InsightsStrip from "./InsightsStrip.svelte";

  /** @type {any} */
  export let orderStats = { total: 0, chats: 0, files: 0, reminders: 0, actors: 0 };
  /** @type {any[]} */
  export let orderAttention = [];
  /** @type {any[]} */
  export let orderInsights = [];
  export let orderFlagFilter = "";
  /** @type {(id: string) => string} */
  export let flagFilterLabel = (id) => id;
  /** @type {(insight: any) => void} */
  export let applyOrderInsight = () => {};
  /** @type {() => void} */
  export let clearOrderFlagFilter = () => {};

  export let selectedFilter = "last7days";
  export let customStartDate = null;
  export let customEndDate = null;
  export let searchTerm = "";
  export let userId = null;
  /** @type {any[]} */
  export let users = [];
  /** @type {any} */
  export let currentUser = null;
  export let chatTypeFilter = "";
  /** @type {'DESC' | 'ASC'} */
  export let sortOrder = "DESC";

  export let loadingData = false;
  /** @type {any[]} */
  export let columns = [];
  /** @type {any[]} */
  export let actions = [];
  /** @type {any[]} */
  export let filteredActivities = [];
  export let currentPage = 1;
  export let rowsPerPage = 10;
  export let totalItems = 0;

  /** @type {(value: string) => void} */
  export let setOrderDatePreset = () => {};
  /** @type {(value: string) => void} */
  export let handleSearchChange = () => {};
  /** @type {(value: string) => void} */
  export let setSortOrder = () => {};
  /** @type {() => void} */
  export let clearChatTypeFilter = () => {};
  /** @type {(page: number) => void} */
  export let onPageChange = () => {};
  /** @type {(rows: number) => void} */
  export let onRowsPerPageChange = () => {};
</script>

{#if orderAttention.length}
  <AttentionBanner
    items={orderAttention}
    variant="warn"
    title="Review recommended"
    hint="Click a flag below to focus the list."
    icon="ti-alert-triangle"
  />
{/if}

<div class="hx-stats" transition:fade={{ duration: 150 }}>
  <div class="hx-stat">
    <span class="hx-stat-label">Total</span>
    <span class="hx-stat-value">{orderStats.total}</span>
  </div>
  <div class="hx-stat hx-stat--blue">
    <span class="hx-stat-label">Chats (page)</span>
    <span class="hx-stat-value">{orderStats.chats}</span>
  </div>
  <div class="hx-stat hx-stat--green">
    <span class="hx-stat-label">Files (page)</span>
    <span class="hx-stat-value">{orderStats.files}</span>
  </div>
  <div class="hx-stat hx-stat--amber">
    <span class="hx-stat-label">Reminders</span>
    <span class="hx-stat-value">{orderStats.reminders}</span>
  </div>
  <div class="hx-stat hx-stat--purple">
    <span class="hx-stat-label">Actors</span>
    <span class="hx-stat-value">{orderStats.actors}</span>
  </div>
</div>

<InsightsStrip
  insights={orderInsights}
  label="Decision flags"
  icon="ti-flag"
  flagFilter={orderFlagFilter}
  {flagFilterLabel}
  onApply={applyOrderInsight}
  onClear={clearOrderFlagFilter}
/>

<div class="hx-toolbar hx-toolbar--row">
  <div class="hx-presets">
    {#each DATE_PRESETS as p}
      <button
        type="button"
        class="hx-chip"
        class:active={selectedFilter === p.value}
        on:click={() => setOrderDatePreset(p.value)}
      >
        {p.label}
      </button>
    {/each}
  </div>
  {#if selectedFilter === "custom"}
    <input type="date" bind:value={customStartDate} class="form-control form-control-sm hx-date" />
    <input type="date" bind:value={customEndDate} class="form-control form-control-sm hx-date" />
  {/if}
  <div class="input-icon input-icon-start position-relative hx-search">
    <span class="input-icon-addon"><i class="ti ti-search"></i></span>
    <input
      type="text"
      value={searchTerm}
      on:input={(e) => handleSearchChange(e.target.value)}
      class="form-control form-control-sm"
      placeholder="Search activities…"
    />
  </div>
  {#if currentUser?.role !== "user"}
    <select bind:value={userId} class="form-select form-select-sm hx-select">
      <option value={null}>All users</option>
      {#each users as user}
        <option value={user?.id}>{user?.name}</option>
      {/each}
    </select>
  {/if}
  {#if chatTypeFilter}
    <span class="hx-active-filter">
      {chatTypeFilter}
      <button type="button" class="hx-x" on:click={clearChatTypeFilter}>×</button>
    </span>
  {/if}
  <div class="hx-sort" role="group" aria-label="Sort by date">
    <button
      type="button"
      class="hx-sort-opt"
      class:active={sortOrder === "DESC"}
      on:click={() => setSortOrder("DESC")}
      title="Newest first"
    >
      <i class="ti ti-arrow-down"></i>
      Newest
    </button>
    <button
      type="button"
      class="hx-sort-opt"
      class:active={sortOrder === "ASC"}
      on:click={() => setSortOrder("ASC")}
      title="Oldest first"
    >
      <i class="ti ti-arrow-up"></i>
      Oldest
    </button>
  </div>
</div>

<div class="hx-table-card">
  {#if !loadingData && filteredActivities.length === 0}
    <div class="hx-empty">
      <i class="ti ti-activity-heartbeat"></i>
      <strong>No order activities</strong>
      <span>Try another date range, user, or clear decision flags.</span>
    </div>
  {:else}
    <DynamicDataTable
      loading={loadingData}
      {columns}
      {actions}
      data={[...filteredActivities]}
      search={null}
      headersItemShow={false}
      {currentPage}
      {rowsPerPage}
      totalItems={orderFlagFilter ? filteredActivities.length : totalItems}
      totalPages={orderFlagFilter
        ? Math.ceil(filteredActivities.length / rowsPerPage) || 1
        : Math.ceil(totalItems / rowsPerPage) || 1}
      serverMode={true}
      on:pageChange={(e) => onPageChange(e.detail)}
      on:rowsPerPageChange={(e) => onRowsPerPageChange(e.detail)}
    />
  {/if}
</div>
