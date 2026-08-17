<script>
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Swal from "sweetalert2";
  import Pagination from "$lib/components/Pagination.svelte";
  import { openQueryCount } from "$lib/stores/queryStore";
  import { queryOpenFilterStore } from "$lib/stores/filterStore";

  let currentUser;
  let queries = [];
  let stats = { open: 0, inProgress: 0, resolvedToday: 0, totalResolved: 0 };
  let loading = true;
  let currentPage = 1;
  let totalItems = 0;
  let totalPages = 0;
  let rowsPerPage = 10;

  // ── filters ──────────────────────────────────────────────────────────────
  let search = "";
  let filterType = "";
  let filterPriority = "";
  let selectedFilter = "last7days";
  let customStartDate = "";
  let customEndDate = "";
  let searchTimeout;

  // ── auto-refresh ──────────────────────────────────────────────────────────
  let refreshInterval;
  let isFiltering = false; // true while user is actively changing filters

  const STATUS_COLORS = {
    open: "badge bg-primary text-white",
    in_progress: "badge bg-warning text-dark",
    resolved: "badge bg-success text-white",
    reopened: "badge bg-danger text-white",
    closed: "badge bg-secondary text-white",
  };

  const PRIORITY_COLORS = {
    high: "badge bg-danger text-white",
    medium: "badge bg-warning text-dark",
    low: "badge bg-success text-white",
  };

  const QUERY_TYPES = [
    { value: "", label: "All Types" },
    { value: "order_issue", label: "Order Issue" },
    { value: "payment_issue", label: "Payment Issue" },
    { value: "invoice_issue", label: "Invoice Issue" },
    { value: "stock_issue", label: "Stock Issue" },
    { value: "technical", label: "Technical" },
    { value: "customer_complaint", label: "Customer Complaint" },
    { value: "access_issue", label: "Access Issue" },
    { value: "other", label: "Other" },
  ];

  function buildDateParams() {
    const params = {};
    const today = new Date();
    const fmt = (d) => d.toLocaleDateString("en-CA");

    if (selectedFilter === "today") {
      params.dateFrom = fmt(today); params.dateTo = fmt(today);
    } else if (selectedFilter === "yesterday") {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      params.dateFrom = fmt(y); params.dateTo = fmt(y);
    } else if (selectedFilter === "last7days") {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      params.dateFrom = fmt(d); params.dateTo = fmt(today);
    } else if (selectedFilter === "last30days") {
      const d = new Date(today); d.setDate(d.getDate() - 29);
      params.dateFrom = fmt(d); params.dateTo = fmt(today);
    } else if (selectedFilter === "custom" && customStartDate && customEndDate) {
      params.dateFrom = customStartDate; params.dateTo = customEndDate;
    }
    return params;
  }

  // Silent background refresh — no spinner, skipped when tab hidden or user is filtering
  async function silentRefresh() {
    if (isFiltering || document.hidden) return;
    try {
      const dateParams = buildDateParams();
      const q = new URLSearchParams({ page: currentPage, limit: rowsPerPage });
      if (search)        q.set("search",   search);
      if (filterType)    q.set("type",     filterType);
      if (filterPriority)q.set("priority", filterPriority);
      if (dateParams.dateFrom) q.set("dateFrom", dateParams.dateFrom);
      if (dateParams.dateTo)   q.set("dateTo",   dateParams.dateTo);
      const [res, statsRes] = await Promise.all([
        authApiFetch(`${API_ROUTES.QUERY}/open?${q}`),
        authApiFetch(`${API_ROUTES.QUERY}/stats`),
      ]);
      queries    = res.data ?? [];
      totalItems = res.total ?? 0;
      totalPages = res.totalPages ?? 0;
      stats      = statsRes;
      openQueryCount.set(statsRes.open ?? 0);
    } catch (_) {} // silent — never show an error toast on background refresh
  }

  function handleVisibilityChange() {
    // Immediately re-sync when the user switches back to this tab
    if (!document.hidden) silentRefresh();
  }

  function saveFilterStore() {
    queryOpenFilterStore.set({ search, filterType, filterPriority, selectedFilter, customStartDate, customEndDate, rowsPerPage, currentPage });
  }

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.subRole !== "tech") { goto("/admin/query"); return; }

    const saved = $queryOpenFilterStore;
    if (saved && Object.keys(saved).length > 0) {
      if (saved.search          !== undefined) search          = saved.search;
      if (saved.filterType      !== undefined) filterType      = saved.filterType;
      if (saved.filterPriority  !== undefined) filterPriority  = saved.filterPriority;
      if (saved.selectedFilter  !== undefined) selectedFilter  = saved.selectedFilter;
      if (saved.customStartDate !== undefined) customStartDate = saved.customStartDate;
      if (saved.customEndDate   !== undefined) customEndDate   = saved.customEndDate;
      if (saved.rowsPerPage     !== undefined) rowsPerPage     = saved.rowsPerPage;
      if (saved.currentPage     !== undefined) currentPage     = saved.currentPage;
    }
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
      selectedFilter = "last7days";
      customStartDate = "";
      customEndDate = "";
      saveFilterStore();
    }

    await Promise.all([loadData(), loadStats()]);

    refreshInterval = setInterval(silentRefresh, 10000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onDestroy(() => {
    clearInterval(refreshInterval);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  async function loadData() {
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
      loading = false;
      return;
    }
    loading = true;
    try {
      const dateParams = buildDateParams();
      const q = new URLSearchParams({ page: currentPage, limit: rowsPerPage });
      if (search) q.set("search", search);
      if (filterType) q.set("type", filterType);
      if (filterPriority) q.set("priority", filterPriority);
      if (dateParams.dateFrom) q.set("dateFrom", dateParams.dateFrom);
      if (dateParams.dateTo) q.set("dateTo", dateParams.dateTo);

      const res = await authApiFetch(`${API_ROUTES.QUERY}/open?${q}`);
      queries = res.data ?? [];
      totalItems = res.total ?? 0;
      totalPages = res.totalPages ?? 0;
    } catch (e) {
      if (!e?.isNetworkError && e?.status !== 0) errorHandle(e);
    } finally {
      loading = false;
    }
  }

  async function loadStats() {
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/stats`);
      stats = res;
      // Keep sidebar badge in sync whenever stats are refreshed
      openQueryCount.set(res.open ?? 0);
    } catch (_) {}
  }

  function onSearchInput() {
    isFiltering = true;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      saveFilterStore();
      loadData().finally(() => { isFiltering = false; });
    }, 400);
  }

  function onFilterChange() {
    isFiltering = true;
    currentPage = 1;
    saveFilterStore();
    loadData().finally(() => { isFiltering = false; });
  }

  function clearFilters() {
    isFiltering = true;
    search = ""; filterType = ""; filterPriority = "";
    selectedFilter = "today"; customStartDate = ""; customEndDate = "";
    currentPage = 1;
    loadData().finally(() => { isFiltering = false; });
  }

  $: hasFilters = search || filterType || filterPriority || selectedFilter !== "today";

  async function pickUp(queryId) {
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/${queryId}/assign`, { method: "PATCH" });
      // Optimistic decrement — sidebar badge drops immediately before navigation
      openQueryCount.update((n) => Math.max(0, n - 1));
      await Swal.fire({ icon: "success", title: "Query assigned to you", timer: 1500, showConfirmButton: false });
      goto(`/admin/query/${queryId}`);
    } catch (e) {
      const status = e?.status ?? e?.response?.status;
      if (status === 409) {
        Swal.fire({
          icon: "warning",
          title: "Already picked up",
          text: "This query was just picked up by another team member.",
          timer: 2500,
          showConfirmButton: false,
        });
        await Promise.all([loadData(), loadStats()]);
      } else if (status === 403) {
        Swal.fire({
          icon: "error",
          title: "Not Allowed",
          text: e?.data?.message ?? "This query was reassigned to a different support member.",
          confirmButtonColor: "#dc3545",
        });
        await Promise.all([loadData(), loadStats()]);
      } else {
        errorHandle(e);
      }
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  function getWaitingMins(createdAt) {
    if (!createdAt) return 0;
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  }

  function urgencyBadge(mins) {
    if (mins >= 30) return { label: "Critical", cls: "od-badge od-badge--critical" };
    if (mins >= 5)  return { label: "Overdue",  cls: "od-badge od-badge--overdue"  };
    return null;
  }
</script>

<div class="page-wrapper">
  <div class="content">
    <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <h4 class="fw-bold mb-0">Open Queue</h4>
        <p class="text-muted small mb-0">Unassigned queries waiting to be picked up</p>
      </div>
      <a href="/admin/query/assigned" class="btn btn-sm btn-outline-warning">
        <i class="ti ti-clipboard-list me-1"></i> My Assigned
      </a>
    </div>

    <!-- Stats -->
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm text-center py-3">
          <div class="fs-4 fw-bold text-primary">{stats.open}</div>
          <div class="text-muted small">Open</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm text-center py-3">
          <div class="fs-4 fw-bold text-warning">{stats.inProgress}</div>
          <div class="text-muted small">In Progress (mine)</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm text-center py-3">
          <div class="fs-4 fw-bold text-success">{stats.resolvedToday}</div>
          <div class="text-muted small">Resolved Today</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm text-center py-3">
          <div class="fs-4 fw-bold text-secondary">{stats.totalResolved}</div>
          <div class="text-muted small">Total Resolved</div>
        </div>
      </div>
    </div>

    <!-- ── Filter Bar ──────────────────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <div>
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
          <input
            type="text"
            class="form-control"
            placeholder="Search.."
            bind:value={search}
            on:input={onSearchInput}
          />
        </div>
      </div>
      <div>
        <select class="form-select" bind:value={selectedFilter} on:change={onFilterChange}>
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7days">Last 7 Days</option>
          <option value="last30days">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>
      {#if selectedFilter === "custom"}
        <div><input type="date" class="form-control" bind:value={customStartDate} on:change={onFilterChange} /></div>
        <div><input type="date" class="form-control" bind:value={customEndDate} on:change={onFilterChange} /></div>
      {/if}
      <div>
        <select class="form-select" bind:value={filterType} on:change={onFilterChange}>
          {#each QUERY_TYPES as t}
            <option value={t.value}>{t.label}</option>
          {/each}
        </select>
      </div>
      <div>
        <select class="form-select" bind:value={filterPriority} on:change={onFilterChange}>
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      {#if hasFilters}
        <div>
          <button class="btn btn-outline-secondary" on:click={clearFilters}>
            <i class="ti ti-x me-1"></i>Clear
          </button>
        </div>
      {/if}
    </div>

    {#if loading}
      <div class="text-center py-5"><span class="spinner-border text-primary"></span></div>
    {:else if queries.length === 0}
      <div class="text-center py-5 text-muted">
        <i class="ti ti-inbox fs-1 d-block mb-2"></i>
        No open queries found.
      </div>
    {:else}
      <div class="card border-0 rounded-0 mb-0">
        <div class="card-body p-3">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>#</th>
                <th>Subject</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Raised At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {#each queries as q, i}
                {@const waitMins = getWaitingMins(q.createdAt)}
                {@const badge    = urgencyBadge(waitMins)}
                <tr style="{badge?.cls?.includes('critical') ? 'background:#fff5f5;' : badge ? 'background:#fff9f0;' : ''}">
                  <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>
                  <td style="max-width:260px;">
                    {#if q.ticketCode}
                      <div class="text-muted" style="font-size:10.5px;font-weight:600;letter-spacing:0.3px;margin-bottom:2px;">{q.ticketCode}</div>
                    {/if}
                    <div class="d-flex align-items-center gap-1 flex-wrap" style="min-width:0;">
                      <a href="/admin/query/{q.id}" class="text-primary fw-semibold" title={q.subject} style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{q.subject}</a>
                      {#if badge}
                        <span class="{badge.cls} ms-1" style="flex-shrink:0;">{badge.label}</span>
                      {/if}
                      {#if ['Deal Won', 'Dispatched', 'Completed'].includes(q.order?.status)}<span class="badge bg-success query-deal-badge">🏆 Deal Won</span>{/if}
                    </div>
                  </td>
                  <td>
                    <span class="badge bg-light text-dark border" style="font-size:11px;">
                      {QUERY_TYPES.find(t => t.value === q.type)?.label ?? q.type ?? "-"}
                    </span>
                  </td>
                  <td>
                    <span class={PRIORITY_COLORS[q.priority] ?? "badge bg-secondary"} style="font-size:11px;">
                      {q.priority ?? "-"}
                    </span>
                  </td>
                  <td>
                    <span class={STATUS_COLORS[q.status] ?? "badge bg-secondary"}>
                      {q.status?.replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    {formatDate(q.createdAt)}
                    {#if waitMins >= 5}
                      <div class="od-wait" style="color:{waitMins >= 30 ? '#c92a2a' : '#d9480f'};">
                        <i class="ti ti-clock" style="font-size:10px;"></i> {waitMins}m waiting
                      </div>
                    {/if}
                  </td>
                  <td>
                    <a href="/admin/query/{q.id}" class="btn btn-sm btn-outline-primary me-1">
                      <i class="ti ti-eye"></i>
                    </a>
                    {#if q.status === "open" || q.status === "reopened"}
                      <button class="btn btn-sm btn-warning" on:click={() => pickUp(q.id)}>Pick Up</button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <Pagination
          {currentPage}
          {totalPages}
          {rowsPerPage}
          on:pageChange={(e) => { currentPage = e.detail; saveFilterStore(); loadData(); }}
          on:rowsPerPageChange={(e) => { rowsPerPage = e.detail; currentPage = 1; saveFilterStore(); loadData(); }}
        />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .od-badge {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    vertical-align: middle;
  }
  .od-badge--overdue  { background: #fd7e14; color: #fff; }
  .od-badge--critical { background: #dc3545; color: #fff; animation: od-pulse 1s ease-in-out infinite; }
  @keyframes od-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.5; }
  }
  .od-wait {
    font-size: 0.7rem;
    font-weight: 600;
    margin-top: 2px;
  }
</style>

