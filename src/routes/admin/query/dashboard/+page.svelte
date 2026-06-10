<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Pagination from "$lib/components/Pagination.svelte";
  import { queryPrivacy } from "$lib/stores/queryPrivacy";

  let currentUser;
  let dashboard = null;
  let dashLoading = true;
  let dashError = "";
  let statsOpen = false;

  // ── query list ──────────────────────────────────────────────────────────────
  let queries = [];
  let listLoading = true;
  let currentPage = 1;
  let totalPages = 0;
  let totalItems = 0;
  let rowsPerPage = 10;

  // filters
  let search = "";
  let filterStatus = "";
  let filterType = "";
  let filterPriority = "";
  let selectedFilter = "last7days";
  let customStartDate = "";
  let customEndDate = "";
  let raisedById = "";
  let assignedToId = "";
  let allUsers = [];
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

  const STATUSES = [
    { value: "", label: "All Statuses" },
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "resolved", label: "Resolved" },
    { value: "reopened", label: "Reopened" },
    { value: "closed", label: "Closed" },
  ];

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.role === "user") { goto("/admin/dashboard"); return; }
    await Promise.all([loadDashboard(), loadList(), loadUsers()]);
  });

  async function loadDashboard() {
    dashLoading = true;
    dashError = "";
    try {
      const dp = buildDateParams();
      const q = new URLSearchParams();
      if (search) q.set("search", search);
      if (filterStatus) q.set("status", filterStatus);
      if (filterType) q.set("type", filterType);
      if (filterPriority) q.set("priority", filterPriority);
      if (dp.dateFrom) q.set("dateFrom", dp.dateFrom);
      if (dp.dateTo) q.set("dateTo", dp.dateTo);
      if (raisedById) q.set("raisedById", raisedById);
      if (assignedToId) q.set("assignedToId", assignedToId);
      const qs = q.toString();
      dashboard = await authApiFetch(`${API_ROUTES.QUERY}/dashboard${qs ? `?${qs}` : ""}`);
    } catch (e) {
      dashError = "Failed to load dashboard stats.";
    } finally {
      dashLoading = false;
    }
  }

  function buildDateParams() {
    const p = {};
    const today = new Date();
    const fmt = (d) => d.toLocaleDateString("en-CA");
    if (selectedFilter === "today") {
      p.dateFrom = fmt(today); p.dateTo = fmt(today);
    } else if (selectedFilter === "yesterday") {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      p.dateFrom = fmt(y); p.dateTo = fmt(y);
    } else if (selectedFilter === "last7days") {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      p.dateFrom = fmt(d); p.dateTo = fmt(today);
    } else if (selectedFilter === "last30days") {
      const d = new Date(today); d.setDate(d.getDate() - 29);
      p.dateFrom = fmt(d); p.dateTo = fmt(today);
    } else if (selectedFilter === "custom" && customStartDate && customEndDate) {
      p.dateFrom = customStartDate; p.dateTo = customEndDate;
    }
    return p;
  }

  async function loadList() {
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) return;
    listLoading = true;
    try {
      const dp = buildDateParams();
      const q = new URLSearchParams({ page: currentPage, limit: rowsPerPage });
      if (search) q.set("search", search);
      if (filterStatus) q.set("status", filterStatus);
      if (filterType) q.set("type", filterType);
      if (filterPriority) q.set("priority", filterPriority);
      if (dp.dateFrom) q.set("dateFrom", dp.dateFrom);
      if (dp.dateTo) q.set("dateTo", dp.dateTo);
      if (raisedById) q.set("raisedById", raisedById);
      if (assignedToId) q.set("assignedToId", assignedToId);
      const res = await authApiFetch(`${API_ROUTES.QUERY}?${q}`);
      queries = res.data ?? [];
      totalItems = res.total ?? 0;
      totalPages = res.totalPages ?? 0;
    } catch (e) {
      if (!e?.isNetworkError && e?.status !== 0) errorHandle(e);
    } finally {
      listLoading = false;
    }
  }

  async function loadUsers() {
    try {
      const data = await authApiFetch(`${API_ROUTES.USER}/all`);
      allUsers = data ?? [];
    } catch (_) {}
  }

  function onSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { currentPage = 1; loadDashboard(); loadList(); }, 400);
  }

  function onFilterChange() { currentPage = 1; loadDashboard(); loadList(); }

  function clearFilters() {
    search = ""; filterStatus = ""; filterType = ""; filterPriority = "";
    selectedFilter = "last7days"; customStartDate = ""; customEndDate = "";
    raisedById = ""; assignedToId = "";
    currentPage = 1; loadDashboard(); loadList();
  }

  $: hasFilters = search || filterStatus || filterType || filterPriority ||
    selectedFilter !== "last7days" || raisedById || assignedToId;

  function fmtMins(mins) {
    if (mins === null || mins === undefined) return "-";
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    if (mins < 60) return `${Math.round(mins)}m`;
    return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  $: maskTC     = (name) => (currentUser?.role === "master" && $queryPrivacy.telecaller && name) ? "Telecaller" : (name ?? "-");
  $: maskTech   = (name) => (currentUser?.role === "master" && $queryPrivacy.tech       && name) ? "Tech"        : (name ?? "-");
  $: maskHelper = (name) => (currentUser?.role === "master" && $queryPrivacy.techHelper && name) ? "Senior Tech" : (name ?? "-");
</script>

<div class="page-wrapper">
  <div class="content">

    <!-- Header -->
    <div class="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
      <div>
        <h4 class="fw-bold mb-0">Query Dashboard</h4>
        <div class="text-muted small mt-1">Performance overview · SLA: {dashboard?.slaMinutes ?? 1} min</div>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm {statsOpen ? 'btn-primary' : 'btn-outline-primary'} position-relative" on:click={() => statsOpen = !statsOpen}>
          <i class="ti ti-chart-bar me-1"></i>Stats
          {#if dashboard && (dashboard.open > 0 || dashboard.slaBreachCount > 0)}
            <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style="font-size:9px;">
              {dashboard.open + (dashboard.slaBreachCount ?? 0)}
            </span>
          {/if}
        </button>
        <a href="/admin/query" class="btn btn-sm btn-outline-secondary">
          <i class="ti ti-list me-1"></i>All Queries
        </a>
        <button class="btn btn-sm btn-outline-primary" on:click={() => { loadDashboard(); loadList(); }} disabled={dashLoading}>
          <i class="ti ti-refresh me-1"></i>{dashLoading ? "Loading…" : "Refresh"}
        </button>
      </div>
    </div>

    <!-- ── Query List Section ─────────────────────────────────────────────── -->
    <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div class="section-label mb-0">Query List</div>
      <span class="text-muted small">{totalItems} total</span>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <div>
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
          <input type="text" class="form-control" placeholder="Search.."
            bind:value={search} on:input={onSearchInput} />
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
          {#each QUERY_TYPES as t}<option value={t.value}>{t.label}</option>{/each}
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
        <select class="form-select" bind:value={filterStatus} on:change={onFilterChange}>
          {#each STATUSES as s}<option value={s.value}>{s.label}</option>{/each}
        </select>
      </div>
      <div>
        <select class="form-select" bind:value={raisedById} on:change={onFilterChange}>
          <option value="">Raised By</option>
          {#each allUsers.filter(u => u.subRole === "telecaller" || u.subRole === "tech") as u}<option value={u.id}>{u.subRole === "telecaller" ? maskTC(u.name) : maskTech(u.name)}</option>{/each}
        </select>
      </div>
      <div>
        <select class="form-select" bind:value={assignedToId} on:change={onFilterChange}>
          <option value="">Assigned To</option>
          {#each allUsers.filter(u => u.subRole === "tech" || u.subRole === "tech_helper") as u}<option value={u.id}>{u.subRole === "tech_helper" ? maskHelper(u.name) : maskTech(u.name)}</option>{/each}
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

    {#if listLoading}
      <div class="text-center py-5">
        <span class="spinner-border text-primary"></span>
      </div>
    {:else if queries.length === 0}
      <div class="text-center py-5 text-muted">
        <i class="ti ti-help-circle fs-1 d-block mb-2"></i>No queries found.
      </div>
    {:else}
      <div class="card border-0 rounded-0 mb-0">
        <div class="card-body p-3">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th style="width:40px;">#</th>
                  <th style="min-width:200px; max-width:260px;">Subject</th>
                  <th style="width:120px;">Raised By</th>
                  <th style="width:120px;">Assigned To</th>
                  <th style="width:130px;">Type</th>
                  <th style="width:80px;">Priority</th>
                  <th style="width:100px;">Status</th>
                  <th style="min-width:120px; max-width:180px;">Order</th>
                  <th style="width:140px;">Raised At</th>
                  <th style="width:85px;" title="Final quotation flagged in chat">Final Quot.</th>
                  <th style="width:70px;" title="First response time vs SLA">Delay</th>
                  <th style="width:60px;">Action</th>
                </tr>
              </thead>
              <tbody>
                {#each queries as q, i}
                  <tr>
                    <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>
                    <td style="max-width:260px;">
                      <a href="/admin/query/{q.id}" class="text-primary fw-semibold col-truncate" title={q.subject}>{q.subject}</a>
                    </td>
                    <td>
                      {#if q.raisedBy}
                        <a href="/admin/query/user/{q.raisedBy.id}" class="text-body text-decoration-none user-link">
                          {maskTC(q.raisedBy.name)}
                        </a>
                      {:else}-{/if}
                    </td>
                    <td>
                      {#if q.assignedTo}
                        <a href="/admin/query/user/{q.assignedTo.id}" class="text-body text-decoration-none user-link">
                          {maskTech(q.assignedTo.name)}
                        </a>
                      {:else}<span class="text-muted">Unassigned</span>{/if}
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
                    <td style="max-width:180px;">
                      {#if q.order}
                        <a href="/admin/order/{q.order.id}" class="text-primary small col-truncate" title="#{q.order.pId}{q.order.title ? ` — ${q.order.title}` : ''}">
                          #{q.order.pId}{q.order.title ? ` — ${q.order.title}` : ""}
                        </a>
                      {:else}
                        <span class="text-muted">-</span>
                      {/if}
                    </td>
                    <td>{formatDate(q.createdAt)}</td>
                    <td>
                      {#if q.hasFinalQuotation}
                        <span class="badge bg-success" style="font-size:10px;"><i class="ti ti-flag-check me-1"></i>Sent</span>
                      {:else}
                        <span class="badge bg-light text-muted border" style="font-size:10px;">Pending</span>
                      {/if}
                    </td>
                    <td>
                      {#if q.slaBreached}
                        <span class="badge bg-danger text-white" style="font-size:10px;" title="{q.firstResponseMins}m">
                          <i class="ti ti-clock-exclamation me-1"></i>{fmtMins(q.firstResponseMins)}
                        </span>
                      {:else if q.firstResponseMins !== null}
                        <span class="badge bg-success text-white" style="font-size:10px;">{fmtMins(q.firstResponseMins)}</span>
                      {:else}
                        <span class="text-muted small">-</span>
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
            on:pageChange={(e) => { currentPage = e.detail; loadList(); }}
            on:rowsPerPageChange={(e) => { rowsPerPage = e.detail; currentPage = 1; loadList(); }}
          />
        </div>
      </div>
    {/if}

  </div>
</div>

<!-- ── Stats Drawer ───────────────────────────────────────────────────────── -->
{#if statsOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="stats-backdrop" on:click={() => statsOpen = false}></div>
{/if}

<div class="stats-drawer" class:stats-drawer--open={statsOpen}>
  <div class="stats-drawer-header">
    <span class="fw-bold">Dashboard Stats</span>
    <button class="btn-close" on:click={() => statsOpen = false}></button>
  </div>
  <div class="stats-drawer-body">
    {#if dashLoading}
      <div class="text-center py-5">
        <span class="spinner-border spinner-border-sm text-primary"></span>
        <span class="text-muted small ms-2">Loading…</span>
      </div>
    {:else if dashError}
      <div class="alert alert-danger py-2 mx-1">{dashError}</div>
    {:else if dashboard}

      <div class="section-label">Status Overview</div>
      <div class="summary-card mb-4">
        <div class="summary-row">
          <div class="summary-cell">
            <span class="summary-label">Open</span>
            <span class="summary-val text-primary">{dashboard.open}</span>
          </div>
          <div class="summary-cell">
            <span class="summary-label">In Progress</span>
            <span class="summary-val text-warning">{dashboard.inProgress}</span>
          </div>
        </div>
        <div class="summary-row">
          <div class="summary-cell">
            <span class="summary-label">Reopened</span>
            <span class="summary-val text-danger">{dashboard.reopened}</span>
          </div>
          <div class="summary-cell">
            <span class="summary-label">Resolved Today</span>
            <span class="summary-val text-success">{dashboard.resolvedToday}</span>
          </div>
        </div>
        <div class="summary-row summary-row--last">
          <div class="summary-cell">
            <span class="summary-label">Total Resolved</span>
            <span class="summary-val">{dashboard.totalResolved}</span>
          </div>
          <div class="summary-cell">
            <span class="summary-label">Final Quot. Sent</span>
            <span class="summary-val" style="color:#0ca678;">{dashboard.finalQuotationSent}</span>
          </div>
        </div>
      </div>

      <div class="section-label">Sub-Queries (Tech Helpers)</div>
      <div class="summary-card mb-4">
        <div class="summary-row">
          <div class="summary-cell">
            <span class="summary-label">Open</span>
            <span class="summary-val" style="color:#7950f2;">{dashboard.subOpen}</span>
          </div>
          <div class="summary-cell">
            <span class="summary-label">In Progress</span>
            <span class="summary-val text-warning">{dashboard.subInProgress}</span>
          </div>
        </div>
        <div class="summary-row summary-row--last">
          <div class="summary-cell">
            <span class="summary-label">Resolved Today</span>
            <span class="summary-val text-success">{dashboard.subResolvedToday}</span>
          </div>
          <div class="summary-cell">
            <span class="summary-label">Total Resolved</span>
            <span class="summary-val">{dashboard.subTotalResolved}</span>
          </div>
        </div>
      </div>

      <div class="section-label">Performance Metrics</div>
      <div class="d-flex flex-column gap-3 mb-3">
        <div class="perf-card perf-card--blue">
          <div class="perf-card-title"><i class="ti ti-clock-reply"></i> Reply Time</div>
          <div class="perf-row">
            <span class="perf-role perf-role--tech">Tech</span>
            <span class="perf-val">{fmtMins(dashboard.avgTechReplyMins)}</span>
          </div>
          <div class="perf-row">
            <span class="perf-role perf-role--telecaller">Telecaller</span>
            <span class="perf-val">{fmtMins(dashboard.avgTelecallerReplyMins)}</span>
          </div>
        </div>
        <div class="perf-card {dashboard.totalMistakes > 0 ? 'perf-card--red' : 'perf-card--green'}">
          <div class="perf-card-title">
            <i class="ti ti-alert-triangle"></i> Mistakes
            <span class="perf-badge {dashboard.totalMistakes > 0 ? 'perf-badge--red' : 'perf-badge--green'}">{dashboard.totalMistakes}</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">Missed replies</span>
            <span class="perf-val {dashboard.totalMissedReplies > 0 ? 'text-danger' : ''}">{dashboard.totalMissedReplies}</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">Slow replies</span>
            <span class="perf-val {dashboard.totalSlowReplies > 0 ? 'text-warning' : ''}">{dashboard.totalSlowReplies}</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">Reopened</span>
            <span class="perf-val {dashboard.totalReopenedQueries > 0 ? 'text-danger' : ''}">{dashboard.totalReopenedQueries}</span>
          </div>
        </div>
        <div class="perf-card {dashboard.slaBreachCount > 0 ? 'perf-card--orange' : 'perf-card--green'}">
          <div class="perf-card-title">
            <i class="ti ti-clock-exclamation"></i> Delay
            {#if dashboard.slaBreachCount > 0}
              <span class="perf-badge perf-badge--orange">{dashboard.slaBreachCount} breached</span>
            {/if}
          </div>
          <div class="perf-row">
            <span class="perf-label">Avg first response</span>
            <span class="perf-val">{fmtMins(dashboard.avgFirstResponseMins)}</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">Avg resolution</span>
            <span class="perf-val">{fmtMins(dashboard.avgResolutionMins)}</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">SLA threshold</span>
            <span class="perf-val">{dashboard.slaMinutes} min</span>
          </div>
        </div>
        <div class="perf-card perf-card--teal">
          <div class="perf-card-title"><i class="ti ti-flag-check"></i> Final Quotation</div>
          <div class="perf-row">
            <span class="perf-label">Sent</span>
            <span class="perf-val text-success fw-bold">{dashboard.finalQuotationSent}</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">Pending</span>
            <span class="perf-val {dashboard.finalQuotationPending > 0 ? 'text-warning' : 'text-success'}">{dashboard.finalQuotationPending}</span>
          </div>
          <div class="perf-row">
            <span class="perf-label">Coverage</span>
            <span class="perf-val">
              {(dashboard.finalQuotationSent + dashboard.finalQuotationPending) > 0
                ? Math.round(dashboard.finalQuotationSent / (dashboard.finalQuotationSent + dashboard.finalQuotationPending) * 100)
                : 0}%
            </span>
          </div>
        </div>
      </div>

    {/if}
  </div>
</div>

<style>
  .user-link:hover { text-decoration: underline !important; color: #3b5bdb !important; }

  .section-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.8px; color: #adb5bd; margin-bottom: 10px;
  }

  /* Table column truncation */
  .col-truncate {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* Status stat cards */
  .stat-card {
    background: #fff; border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    padding: 16px 14px 14px; text-align: center;
    border-top: 3px solid transparent;
  }
  .stat-icon { font-size: 20px; opacity: 0.5; margin-bottom: 4px; }
  .stat-value { font-size: 1.6rem; font-weight: 700; line-height: 1.1; }
  .stat-label { font-size: 11.5px; color: #868e96; margin-top: 3px; }
  .stat-card--primary   { border-top-color: #3b5bdb; }
  .stat-card--primary .stat-icon, .stat-card--primary .stat-value { color: #3b5bdb; }
  .stat-card--warning   { border-top-color: #ffc107; }
  .stat-card--warning .stat-icon, .stat-card--warning .stat-value { color: #d97706; }
  .stat-card--danger    { border-top-color: #dc3545; }
  .stat-card--danger .stat-icon, .stat-card--danger .stat-value { color: #dc3545; }
  .stat-card--success   { border-top-color: #198754; }
  .stat-card--success .stat-icon, .stat-card--success .stat-value { color: #198754; }
  .stat-card--secondary { border-top-color: #6c757d; }
  .stat-card--secondary .stat-icon, .stat-card--secondary .stat-value { color: #6c757d; }
  .stat-card--teal      { border-top-color: #0ca678; }
  .stat-card--teal .stat-icon, .stat-card--teal .stat-value { color: #0ca678; }
  .stat-card--purple    { border-top-color: #7950f2; }
  .stat-card--purple .stat-icon, .stat-card--purple .stat-value { color: #7950f2; }

  /* Performance detail cards */
  .perf-card {
    background: #fff; border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    padding: 16px; border-left: 4px solid transparent; height: 100%;
  }
  .perf-card--blue   { border-left-color: #3b5bdb; }
  .perf-card--red    { border-left-color: #dc3545; }
  .perf-card--green  { border-left-color: #198754; }
  .perf-card--orange { border-left-color: #fd7e14; }
  .perf-card--teal   { border-left-color: #0ca678; }
  .perf-card-title {
    font-size: 12px; font-weight: 700; color: #343a40;
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 12px; padding-bottom: 8px;
    border-bottom: 1px solid #f1f3f5;
  }
  .perf-card-title i { font-size: 14px; opacity: 0.7; }
  .perf-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; padding: 5px 0; border-bottom: 1px solid #f8f9fa; font-size: 12.5px;
  }
  .perf-row:last-child { border-bottom: none; }
  .perf-label { color: #868e96; }
  .perf-val { font-weight: 600; color: #343a40; }
  .perf-role {
    font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px;
  }
  .perf-role--tech       { background: #e6fcf5; color: #0b5e45; }
  .perf-role--telecaller { background: #fff9db; color: #7a4800; }
  .perf-badge {
    margin-left: auto; font-size: 10.5px; font-weight: 700;
    padding: 1px 7px; border-radius: 20px;
  }
  /* Summary single card */
  .summary-card {
    background: #fff; border: 1px solid #e9ecef; border-radius: 10px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.05); overflow: hidden;
  }
  .summary-row {
    display: grid; grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid #f1f3f5;
  }
  .summary-row--last { border-bottom: none; }
  .summary-cell {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 14px; gap: 8px;
  }
  .summary-cell:first-child { border-right: 1px solid #f1f3f5; }
  .summary-label { font-size: 11.5px; color: #868e96; }
  .summary-val { font-size: 15px; font-weight: 700; color: #343a40; }

  .perf-badge--red    { background: #fff0f0; color: #dc3545; border: 1px solid #f5c6cb; }
  .perf-badge--green  { background: #edfaf3; color: #198754; border: 1px solid #c3e6cb; }
  .perf-badge--orange { background: #fff3e6; color: #fd7e14; border: 1px solid #fcd3a5; }

  /* Stats drawer */
  .stats-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.35);
    z-index: 1040; animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .stats-drawer {
    position: fixed; top: 0; right: 0; height: 100vh;
    width: 420px; max-width: 95vw;
    background: #fff; z-index: 1050;
    box-shadow: -4px 0 24px rgba(0,0,0,0.13);
    display: flex; flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
  }
  .stats-drawer--open { transform: translateX(0); }

  .stats-drawer-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid #e9ecef;
    font-size: 14px; flex-shrink: 0;
  }
  .stats-drawer-body {
    flex: 1; overflow-y: auto; padding: 18px 16px;
  }
</style>
