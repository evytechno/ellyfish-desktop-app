<script>
  import { fade } from "svelte/transition";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { AUTH_EVENT_CHIPS, DATE_PRESETS } from "../constants.js";
  import AttentionBanner from "./AttentionBanner.svelte";
  import InsightsStrip from "./InsightsStrip.svelte";

  /** @type {any} */
  export let authStats = { total: 0, login: 0, failed: 0, blocked: 0, logout: 0 };
  /** @type {any[]} */
  export let authAttention = [];
  export let authCriticalCount = 0;
  /** @type {any[]} */
  export let authInsights = [];
  export let authFlagFilter = "";
  export let authEventFilter = "";
  /** @type {(id: string) => string} */
  export let flagFilterLabel = (id) => id;
  /** @type {(insight: any) => void} */
  export let applyAuthInsight = () => {};
  /** @type {() => void} */
  export let clearAuthFlagFilter = () => {};

  export let authSelectedFilter = "last7days";
  export let authCustomStartDate = null;
  export let authCustomEndDate = null;
  export let authUserEmail = "";
  export let authIpFilter = "";
  /** @type {'DESC' | 'ASC'} */
  export let authSortOrder = "DESC";

  export let loadingData = false;
  /** @type {any[]} */
  export let columns = [];
  /** @type {any[]} */
  export let actions = [];
  /** @type {any[]} */
  export let filteredAuthActivities = [];
  export let authCurrentPage = 1;
  export let authRowsPerPage = 10;
  export let authTotalItems = 0;

  /** @type {(value: string) => void} */
  export let setAuthDatePreset = () => {};
  /** @type {(value: string) => void} */
  export let setAuthEvent = () => {};
  /** @type {(value: string) => void} */
  export let handleAuthEmailChange = () => {};
  /** @type {(value: string) => void} */
  export let setAuthSortOrder = () => {};
  /** @type {(page: number) => void} */
  export let onPageChange = () => {};
  /** @type {(rows: number) => void} */
  export let onRowsPerPageChange = () => {};
</script>

{#if authAttention.length}
  <AttentionBanner
    items={authAttention}
    variant={authCriticalCount > 0 ? "critical" : "warn"}
    title={authCriticalCount > 0 ? "Security attention" : "Watch list"}
    hint="Use signals below to investigate."
    icon={authCriticalCount > 0 ? "ti-shield-x" : "ti-shield-exclamation"}
  />
{/if}

<div class="hx-stats" transition:fade={{ duration: 150 }}>
  <div class="hx-stat">
    <span class="hx-stat-label">Total</span>
    <span class="hx-stat-value">{authStats.total}</span>
  </div>
  <div class="hx-stat hx-stat--green">
    <span class="hx-stat-label">Logins (page)</span>
    <span class="hx-stat-value">{authStats.login}</span>
  </div>
  <div class="hx-stat hx-stat--danger">
    <span class="hx-stat-label">Failed</span>
    <span class="hx-stat-value">{authStats.failed}</span>
  </div>
  <div class="hx-stat hx-stat--amber">
    <span class="hx-stat-label">Blocked</span>
    <span class="hx-stat-value">{authStats.blocked}</span>
  </div>
  <div class="hx-stat hx-stat--muted">
    <span class="hx-stat-label">Logouts</span>
    <span class="hx-stat-value">{authStats.logout}</span>
  </div>
</div>

<InsightsStrip
  insights={authInsights}
  label="Security signals"
  icon="ti-shield-exclamation"
  flagFilter={authFlagFilter}
  eventFilter={authEventFilter}
  matchEvent={true}
  {flagFilterLabel}
  onApply={applyAuthInsight}
  onClear={clearAuthFlagFilter}
/>

<div class="hx-toolbar hx-toolbar--chips">
  <div class="hx-presets hx-presets--wrap">
    {#each AUTH_EVENT_CHIPS as chip}
      <button
        type="button"
        class="hx-chip"
        class:active={authEventFilter === chip.value}
        class:hx-chip--danger={chip.value === "failed_login" || chip.value === "account_blocked"}
        on:click={() => setAuthEvent(chip.value)}
      >
        <i class="ti {chip.icon}"></i>
        {chip.label}
      </button>
    {/each}
  </div>
</div>

<div class="hx-toolbar hx-toolbar--row">
  <div class="hx-presets">
    {#each DATE_PRESETS as p}
      <button
        type="button"
        class="hx-chip"
        class:active={authSelectedFilter === p.value}
        on:click={() => setAuthDatePreset(p.value)}
      >
        {p.label}
      </button>
    {/each}
  </div>
  {#if authSelectedFilter === "custom"}
    <input
      type="date"
      bind:value={authCustomStartDate}
      class="form-control form-control-sm hx-date"
    />
    <input
      type="date"
      bind:value={authCustomEndDate}
      class="form-control form-control-sm hx-date"
    />
  {/if}
  <div class="input-icon input-icon-start position-relative hx-search">
    <span class="input-icon-addon"><i class="ti ti-mail"></i></span>
    <input
      type="text"
      value={authUserEmail}
      on:input={(e) => handleAuthEmailChange(e.target.value)}
      class="form-control form-control-sm"
      placeholder="Email…"
    />
  </div>
  <div class="input-icon input-icon-start position-relative hx-search hx-search--sm">
    <span class="input-icon-addon"><i class="ti ti-network"></i></span>
    <input
      type="text"
      bind:value={authIpFilter}
      class="form-control form-control-sm"
      placeholder="IP…"
    />
  </div>
  <div class="hx-sort" role="group" aria-label="Sort by date">
    <button
      type="button"
      class="hx-sort-opt"
      class:active={authSortOrder === "DESC"}
      on:click={() => setAuthSortOrder("DESC")}
      title="Newest first"
    >
      <i class="ti ti-arrow-down"></i>
      Newest
    </button>
    <button
      type="button"
      class="hx-sort-opt"
      class:active={authSortOrder === "ASC"}
      on:click={() => setAuthSortOrder("ASC")}
      title="Oldest first"
    >
      <i class="ti ti-arrow-up"></i>
      Oldest
    </button>
  </div>
</div>

<div class="hx-table-card">
  {#if !loadingData && filteredAuthActivities.length === 0}
    <div class="hx-empty">
      <i class="ti ti-shield-off"></i>
      <strong>No auth events</strong>
      <span>Widen the date range or clear email / IP / event filters.</span>
    </div>
  {:else}
    <DynamicDataTable
      loading={loadingData}
      {columns}
      {actions}
      data={[...filteredAuthActivities]}
      search={null}
      headersItemShow={false}
      currentPage={authCurrentPage}
      rowsPerPage={authRowsPerPage}
      totalItems={authFlagFilter ? filteredAuthActivities.length : authTotalItems}
      totalPages={authFlagFilter
        ? Math.ceil(filteredAuthActivities.length / authRowsPerPage) || 1
        : Math.ceil(authTotalItems / authRowsPerPage) || 1}
      serverMode={true}
      on:pageChange={(e) => onPageChange(e.detail)}
      on:rowsPerPageChange={(e) => onRowsPerPageChange(e.detail)}
    />
  {/if}
</div>
