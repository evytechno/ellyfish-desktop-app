<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Pagination from "$lib/components/Pagination.svelte";
  import { queryUnreadCounts } from "$lib/stores/queryUnreadCounts";
  import { queryAssignedFilterStore } from "$lib/stores/filterStore";

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
  let filterStatus = "";
  let filterType = "";
  let filterPriority = "";
  let filterQuick = "";
  let selectedFilter = "last7days";
  let customStartDate = "";
  let customEndDate = "";
  let searchTimeout;

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

  // For assigned queries, "open" doesn't apply (those are in the open queue)
  const STATUSES = [
    { value: "", label: "All Statuses" },
    { value: "in_progress", label: "In Progress" },
    { value: "resolved", label: "Resolved" },
    { value: "reopened", label: "Reopened" },
    { value: "closed", label: "Closed" },
  ];

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

  function saveFilterStore() {
    queryAssignedFilterStore.set({ search, filterStatus, filterType, filterPriority, filterQuick, selectedFilter, customStartDate, customEndDate, rowsPerPage, currentPage });
  }

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.subRole !== "tech" && currentUser.subRole !== "tech_helper") { goto("/admin/query"); return; }

    const saved = $queryAssignedFilterStore;
    if (saved && Object.keys(saved).length > 0) {
      if (saved.search          !== undefined) search          = saved.search;
      if (saved.filterStatus    !== undefined) filterStatus    = saved.filterStatus;
      if (saved.filterType      !== undefined) filterType      = saved.filterType;
      if (saved.filterPriority  !== undefined) filterPriority  = saved.filterPriority;
      if (saved.filterQuick     !== undefined) filterQuick     = saved.filterQuick;
      if (saved.selectedFilter  !== undefined) selectedFilter  = saved.selectedFilter;
      if (saved.customStartDate !== undefined) customStartDate = saved.customStartDate;
      if (saved.customEndDate   !== undefined) customEndDate   = saved.customEndDate;
      if (saved.rowsPerPage     !== undefined) rowsPerPage     = saved.rowsPerPage;
      if (saved.currentPage     !== undefined) currentPage     = saved.currentPage;
    }

    await Promise.all([loadData(), loadStats()]);
  });

  async function loadData() {
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) return;
    loading = true;
    try {
      const dateParams = buildDateParams();
      const q = new URLSearchParams({ page: currentPage, limit: rowsPerPage });
      if (search) q.set("search", search);
      if (filterStatus) q.set("status", filterStatus);
      if (filterType) q.set("type", filterType);
      if (filterPriority) q.set("priority", filterPriority);
      if (filterQuick === "dealWon") q.set("dealWon", "true");
      if (dateParams.dateFrom) q.set("dateFrom", dateParams.dateFrom);
      if (dateParams.dateTo) q.set("dateTo", dateParams.dateTo);

      const res = await authApiFetch(`${API_ROUTES.QUERY}/assigned?${q}`);
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
    } catch (_) {}
  }

  function onSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { currentPage = 1; saveFilterStore(); loadData(); }, 400);
  }

  function onFilterChange() { currentPage = 1; saveFilterStore(); loadData(); }

  function clearFilters() {
    search = ""; filterStatus = ""; filterType = ""; filterPriority = ""; filterQuick = "";
    selectedFilter = "today"; customStartDate = ""; customEndDate = "";
    currentPage = 1; saveFilterStore(); loadData();
  }

  $: hasFilters = search || filterStatus || filterType || filterPriority || filterQuick || selectedFilter !== "today";

  // Unread-first sort: queries with unread messages bubble to top of the current page.
  // Ties keep the backend's lastActivityAt order (already applied by the API).
  $: sortedQueries = [...queries].sort((a, b) => {
    const ua = $queryUnreadCounts[a.id] ?? 0;
    const ub = $queryUnreadCounts[b.id] ?? 0;
    return ub - ua;
  });

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }
</script>

<div class="page-wrapper">
  <div class="content">
    <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <h4 class="fw-bold mb-0">My Assigned</h4>
        <p class="text-muted small mb-0">Queries currently assigned to you</p>
      </div>
      <a href="/admin/query/open" class="btn btn-sm btn-outline-primary">
        <i class="ti ti-inbox me-1"></i> Open Queue
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
        <select class="form-select" bind:value={filterStatus} on:change={onFilterChange}>
          {#each STATUSES as s}
            <option value={s.value}>{s.label}</option>
          {/each}
        </select>
      </div>
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
      <div>
        <select class="form-select" bind:value={filterQuick} on:change={onFilterChange}>
          <option value="">All</option>
          <option value="dealWon">🏆 Deal Won</option>
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
        <i class="ti ti-clipboard-off fs-1 d-block mb-2"></i>
        No queries found.
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
                <th>Last Activity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedQueries as q, i}
                {@const unread = $queryUnreadCounts[q.id] ?? 0}
                <tr>
                  <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>
                  <td style="max-width:260px;">
                    {#if q.ticketCode}
                      <div class="text-muted" style="font-size:10.5px;font-weight:600;letter-spacing:0.3px;margin-bottom:2px;">{q.ticketCode}</div>
                    {/if}
                    <div class="d-flex align-items-center gap-1 flex-wrap" style="min-width:0;">
                      <a href="/admin/query/{q.id}" class="text-primary fw-semibold" title={q.subject} style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{q.subject}</a>
                      {#if unread > 0}
                        <span class="badge bg-danger rounded-pill" style="font-size:10px;flex-shrink:0;">{unread > 99 ? "99+" : unread}</span>
                      {/if}
                      {#if ['Deal Won', 'Dispatched', 'Completed'].includes(q.order?.status)}<span class="badge bg-success" style="font-size:10px;flex-shrink:0;">🏆 Deal Won</span>{/if}
                    </div>
                  </td>
                  <td>
                    <span class="badge bg-light text-dark border">
                      {QUERY_TYPES.find(t => t.value === q.type)?.label ?? q.type ?? "-"}
                    </span>
                  </td>
                  <td>
                    <span class={PRIORITY_COLORS[q.priority] ?? "badge bg-secondary"}>
                      {q.priority ?? "-"}
                    </span>
                  </td>
                  <td>
                    <span class={STATUS_COLORS[q.status] ?? "badge bg-secondary"}>
                      {q.status?.replace("_", " ")}
                    </span>
                  </td>
                  <td>{formatDate(q.createdAt)}</td>
                  <td>
                    {#if q.lastActivityAt}
                      <span class="text-muted small">{formatDate(q.lastActivityAt)}</span>
                    {:else}
                      <span class="text-muted small">—</span>
                    {/if}
                  </td>
                  <td>
                    <a href="/admin/query/{q.id}" class="btn btn-sm btn-outline-primary">
                      <i class="ti ti-eye"></i>
                    </a>
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

