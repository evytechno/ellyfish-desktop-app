<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import { errorHandle } from "$lib/utils/errorHandle";

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
  let selectedFilter = "today";
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

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.subRole !== "tech") { goto("/admin/query"); return; }
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
      if (dateParams.dateFrom) q.set("dateFrom", dateParams.dateFrom);
      if (dateParams.dateTo) q.set("dateTo", dateParams.dateTo);

      const res = await authApiFetch(`${API_ROUTES.QUERY}/assigned?${q}`);
      queries = res.data ?? [];
      totalItems = res.total ?? 0;
      totalPages = res.totalPages ?? 0;
    } catch (e) {
      errorHandle(e);
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
    searchTimeout = setTimeout(() => { currentPage = 1; loadData(); }, 400);
  }

  function onFilterChange() { currentPage = 1; loadData(); }

  function clearFilters() {
    search = ""; filterStatus = ""; filterType = ""; filterPriority = "";
    selectedFilter = "today"; customStartDate = ""; customEndDate = "";
    currentPage = 1; loadData();
  }

  $: hasFilters = search || filterStatus || filterType || filterPriority || selectedFilter !== "today";

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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {#each queries as q, i}
                <tr>
                  <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>
                  <td><a href="/admin/query/{q.id}" class="text-primary fw-semibold">{q.subject}</a></td>
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
                    <a href="/admin/query/{q.id}" class="btn btn-sm btn-outline-primary">
                      <i class="ti ti-eye"></i>
                    </a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        </div>
        <div class="d-flex justify-content-between align-items-center p-3 flex-wrap gap-2 border-top">
          <div class="d-flex align-items-center gap-2">
            <span class="text-muted small">
              Showing {(currentPage - 1) * rowsPerPage + 1}–{Math.min(currentPage * rowsPerPage, totalItems)} of {totalItems}
            </span>
            <select class="form-select form-select-sm w-auto" bind:value={rowsPerPage}
              on:change={() => { currentPage = 1; loadData(); }}>
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
          {#if totalPages > 1}
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-secondary" disabled={currentPage === 1}
                on:click={() => { currentPage--; loadData(); }}>Prev</button>
              {#each Array.from({ length: totalPages }, (_, i) => i + 1) as p}
                <button
                  class="btn btn-sm {currentPage === p ? 'btn-primary' : 'btn-outline-secondary'}"
                  on:click={() => { currentPage = p; loadData(); }}>{p}</button>
              {/each}
              <button class="btn btn-sm btn-outline-secondary" disabled={currentPage >= totalPages}
                on:click={() => { currentPage++; loadData(); }}>Next</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

