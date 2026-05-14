<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Swal from "sweetalert2";
  import Pagination from "$lib/components/Pagination.svelte";

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
  let raisedById = "";
  let assignedToId = "";
  let allUsers = [];

  let searchTimeout;

  const isTelecaller = (u) => u?.subRole === "telecaller";
  const isTech = (u) => u?.subRole === "tech";
  const isMasterView = (u) => u?.role !== "user";

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

  // raise query form
  let showRaiseForm = false;
  let raising = false;
  let raiseSubject = "";
  let raiseDescription = "";
  let raiseType = "other";
  let raisePriority = "medium";
  let raiseOrderId = null;
  let raiseOrderText = "";
  let raiseError = "";

  // order search dropdown
  let orderSearch = "";
  let orderResults = [];
  let orderLoading = false;
  let showOrderDropdown = false;
  let orderSearchTimeout;

  function onOrderInput() {
    raiseOrderId = null;
    raiseOrderText = orderSearch;
    clearTimeout(orderSearchTimeout);
    if (!orderSearch.trim()) {
      orderResults = [];
      showOrderDropdown = false;
      return;
    }
    orderSearchTimeout = setTimeout(async () => {
      orderLoading = true;
      showOrderDropdown = true;
      try {
        const res = await authApiFetch(
          `${API_ROUTES.ORDER}?search=${encodeURIComponent(orderSearch)}&limit=10`,
        );
        orderResults = res.data ?? [];
      } catch (_) {
        orderResults = [];
      } finally {
        orderLoading = false;
      }
    }, 300);
  }

  function selectOrder(order) {
    raiseOrderId = order.id;
    raiseOrderText = order.title
      ? `#${order.pId} — ${order.title}`
      : `#${order.pId}`;
    orderSearch = raiseOrderText;
    orderResults = [];
    showOrderDropdown = false;
  }

  function clearOrder() {
    raiseOrderId = null;
    raiseOrderText = "";
    orderSearch = "";
    orderResults = [];
    showOrderDropdown = false;
  }

  // ── date helpers ──────────────────────────────────────────────────────────
  function buildDateParams() {
    const params = {};
    const today = new Date();
    const fmt = (d) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD

    if (selectedFilter === "today") {
      params.dateFrom = fmt(today);
      params.dateTo = fmt(today);
    } else if (selectedFilter === "yesterday") {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      params.dateFrom = fmt(y);
      params.dateTo = fmt(y);
    } else if (selectedFilter === "last7days") {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      params.dateFrom = fmt(d);
      params.dateTo = fmt(today);
    } else if (selectedFilter === "last30days") {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      params.dateFrom = fmt(d);
      params.dateTo = fmt(today);
    } else if (
      selectedFilter === "custom" &&
      customStartDate &&
      customEndDate
    ) {
      params.dateFrom = customStartDate;
      params.dateTo = customEndDate;
    }
    return params;
  }

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) {
      goto("/login");
      return;
    }
    if (currentUser.role === "user" && !currentUser.subRole) {
      goto("/admin/dashboard");
      return;
    }
    if (isTech(currentUser)) {
      goto("/admin/query/open");
      return;
    }
    if (isMasterView(currentUser)) {
      await Promise.all([loadData(), loadStats(), loadUsers()]);
    } else {
      await loadData();
    }
  });

  async function loadUsers() {
    try {
      const data = await authApiFetch(`${API_ROUTES.USER}/all`);
      allUsers = data ?? [];
    } catch (_) {}
  }

  async function loadData() {
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate))
      return;
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

      let res;
      if (isTelecaller(currentUser)) {
        res = await authApiFetch(`${API_ROUTES.QUERY}/my?${q}`);
      } else {
        if (raisedById) q.set("raisedById", raisedById);
        if (assignedToId) q.set("assignedToId", assignedToId);
        res = await authApiFetch(`${API_ROUTES.QUERY}?${q}`);
      }
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
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      loadData();
    }, 400);
  }

  function onFilterChange() {
    currentPage = 1;
    loadData();
  }

  function clearFilters() {
    search = "";
    filterStatus = "";
    filterType = "";
    filterPriority = "";
    selectedFilter = "today";
    customStartDate = "";
    customEndDate = "";
    raisedById = "";
    assignedToId = "";
    currentPage = 1;
    loadData();
  }

  $: hasFilters =
    search ||
    filterStatus ||
    filterType ||
    filterPriority ||
    selectedFilter !== "today" ||
    raisedById ||
    assignedToId;

  async function submitRaiseQuery() {
    raiseError = "";
    if (!raiseSubject.trim() || !raiseDescription.trim()) {
      raiseError = "Subject and description are required.";
      return;
    }
    raising = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}`, {
        method: "POST",
        data: JSON.stringify({
          subject: raiseSubject,
          description: raiseDescription,
          type: raiseType,
          priority: raisePriority,
          orderId: raiseOrderId ?? null,
        }),
      });
      showRaiseForm = false;
      raiseSubject = "";
      raiseDescription = "";
      raiseType = "other";
      raisePriority = "medium";
      clearOrder();
      Swal.fire({
        icon: "success",
        title: "Query raised successfully",
        timer: 1500,
        showConfirmButton: false,
      });
      await loadData();
    } catch (e) {
      const msg = e?.data?.message;
      if (typeof msg === "string") raiseError = msg;
      else if (Array.isArray(msg))
        raiseError = msg
          .flatMap((m) => Object.values(m.constraints ?? {}))
          .join(" • ");
      else raiseError = "Failed to raise query.";
    } finally {
      raising = false;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
</script>

<div class="page-wrapper">
  <div class="content">
    <!-- Header -->
    <div
      class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2"
    >
      <div>
        <h4 class="fw-bold mb-0">
          {#if isTelecaller(currentUser)}
            My Queries
          {:else}
            All Queries
          {/if}
        </h4>
      </div>
      {#if isTelecaller(currentUser)}
        <button
          class="btn btn-primary btn-sm"
          on:click={() => (showRaiseForm = true)}
        >
          <i class="ti ti-plus me-1"></i> Raise New Query
        </button>
      {/if}
    </div>

    <!-- Stats bar — master/admin/manager -->
    {#if isMasterView(currentUser)}
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
            <div class="text-muted small">In Progress</div>
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
    {/if}

    <!-- ── Filter Bar ──────────────────────────────────────────────────────── -->
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <div>
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark"
            ><i class="ti ti-search"></i></span
          >
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
        <select
          class="form-select"
          bind:value={selectedFilter}
          on:change={onFilterChange}
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7days">Last 7 Days</option>
          <option value="last30days">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>
      {#if selectedFilter === "custom"}
        <div>
          <input
            type="date"
            class="form-control"
            bind:value={customStartDate}
            on:change={onFilterChange}
          />
        </div>
        <div>
          <input
            type="date"
            class="form-control"
            bind:value={customEndDate}
            on:change={onFilterChange}
          />
        </div>
      {/if}
      <div>
        <select
          class="form-select"
          bind:value={filterType}
          on:change={onFilterChange}
        >
          {#each QUERY_TYPES as t}
            <option value={t.value}>{t.label}</option>
          {/each}
        </select>
      </div>
      <div>
        <select
          class="form-select"
          bind:value={filterPriority}
          on:change={onFilterChange}
        >
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div>
        <select
          class="form-select"
          bind:value={filterStatus}
          on:change={onFilterChange}
        >
          {#each STATUSES as s}
            <option value={s.value}>{s.label}</option>
          {/each}
        </select>
      </div>
      {#if isMasterView(currentUser)}
        <div>
          <select
            class="form-select"
            bind:value={raisedById}
            on:change={onFilterChange}
          >
            <option value="">Raised By</option>
            {#each allUsers as u}
              <option value={u.id}>{u.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <select
            class="form-select"
            bind:value={assignedToId}
            on:change={onFilterChange}
          >
            <option value="">Assigned To</option>
            {#each allUsers as u}
              <option value={u.id}>{u.name}</option>
            {/each}
          </select>
        </div>
      {/if}
      {#if hasFilters}
        <div>
          <button class="btn btn-outline-secondary" on:click={clearFilters}>
            <i class="ti ti-x me-1"></i>Clear
          </button>
        </div>
      {/if}
    </div>

    <!-- Raise Query Modal -->
    {#if showRaiseForm}
      <div
        class="modal-backdrop-custom"
        on:click|self={() => (showRaiseForm = false)}
      >
        <div
          class="card shadow-lg p-4"
          style="max-width:540px;width:100%;margin:auto;margin-top:80px;"
        >
          <h5 class="fw-bold mb-3">Raise New Query</h5>
          {#if raiseError}
            <div class="alert alert-danger py-2">{raiseError}</div>
          {/if}
          <div class="mb-3">
            <label class="form-label"
              >Subject <span class="text-danger">*</span></label
            >
            <input
              type="text"
              class="form-control"
              bind:value={raiseSubject}
              placeholder="Brief subject..."
              maxlength="150"
            />
          </div>
          <div class="mb-3">
            <label class="form-label"
              >Description <span class="text-danger">*</span></label
            >
            <textarea
              class="form-control"
              rows="4"
              bind:value={raiseDescription}
              placeholder="Describe the issue in detail..."
            ></textarea>
          </div>
          <div class="row g-2 mb-3">
            <div class="col-6">
              <label class="form-label">Type</label>
              <select class="form-select" bind:value={raiseType}>
                {#each QUERY_TYPES.slice(1) as t}
                  <option value={t.value}>{t.label}</option>
                {/each}
              </select>
            </div>
            <div class="col-6">
              <label class="form-label">Priority</label>
              <select class="form-select" bind:value={raisePriority}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label"
              >Link to Order <span class="text-muted">(optional)</span></label
            >
            <div class="order-search-wrap">
              <div class="input-group">
                <input
                  type="text"
                  class="form-control"
                  placeholder="Search by order title or ID..."
                  bind:value={orderSearch}
                  on:input={onOrderInput}
                  on:focus={() => {
                    if (orderResults.length) showOrderDropdown = true;
                  }}
                  autocomplete="off"
                />
                {#if raiseOrderId}
                  <button
                    class="btn btn-outline-secondary"
                    type="button"
                    on:click={clearOrder}
                  >
                    <i class="ti ti-x"></i>
                  </button>
                {/if}
              </div>
              {#if raiseOrderId}
                <div class="mt-1 small text-success">
                  <i class="ti ti-circle-check me-1"></i>Linked: {raiseOrderText}
                </div>
              {/if}
              {#if showOrderDropdown}
                <div class="order-dropdown shadow-sm border rounded bg-white">
                  {#if orderLoading}
                    <div class="px-3 py-2 text-muted small">
                      <span class="spinner-border spinner-border-sm me-1"
                      ></span>Searching...
                    </div>
                  {:else if orderResults.length === 0}
                    <div class="px-3 py-2 text-muted small">
                      No orders found.
                    </div>
                  {:else}
                    {#each orderResults as o}
                      <button
                        type="button"
                        class="order-dropdown-item"
                        on:click={() => selectOrder(o)}
                      >
                        <span class="fw-semibold text-primary">#{o.pId}</span>
                        {#if o.title}<span class="ms-1">{o.title}</span>{/if}
                        {#if o.company}<span class="text-muted ms-1 small"
                            >· {o.company}</span
                          >{/if}
                        <span
                          class="badge bg-secondary ms-auto"
                          style="font-size:10px;">{o.status}</span
                        >
                      </button>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          </div>
          <div class="d-flex gap-2 justify-content-end">
            <button
              class="btn btn-secondary btn-sm"
              on:click={() => (showRaiseForm = false)}>Cancel</button
            >
            <button
              class="btn btn-primary btn-sm"
              on:click={submitRaiseQuery}
              disabled={raising}
            >
              {raising ? "Submitting..." : "Submit Query"}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Query Table -->
    {#if loading}
      <div class="text-center py-5">
        <span class="spinner-border text-primary"></span>
      </div>
    {:else if queries.length === 0}
      <div class="text-center py-5 text-muted">
        <i class="ti ti-help-circle fs-1 d-block mb-2"></i>
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
                  {#if isMasterView(currentUser)}
                    <th>Raised By</th>
                    <th>Assigned To</th>
                  {/if}
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>Raised At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {#each queries as q, i}
                  <tr>
                    <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>
                    <td>
                      <a
                        href="/admin/query/{q.id}"
                        class="text-primary fw-semibold">{q.subject}</a
                      >
                    </td>
                    {#if isMasterView(currentUser)}
                      <td>{q.raisedBy?.name ?? "-"}</td>
                      <td>{q.assignedTo?.name ?? "Unassigned"}</td>
                    {/if}
                    <td>
                      <span
                        class="badge bg-light text-dark border"
                        style="font-size:11px;"
                      >
                        {QUERY_TYPES.find((t) => t.value === q.type)?.label ??
                          q.type ??
                          "-"}
                      </span>
                    </td>
                    <td>
                      <span
                        class={PRIORITY_COLORS[q.priority] ??
                          "badge bg-secondary"}
                        style="font-size:11px;"
                      >
                        {q.priority ?? "-"}
                      </span>
                    </td>
                    <td>
                      <span
                        class={STATUS_COLORS[q.status] ?? "badge bg-secondary"}
                      >
                        {q.status?.replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      {#if q.order}
                        <a
                          href="/admin/order/{q.order.id}"
                          class="text-primary small"
                        >
                          #{q.order.pId}{q.order.title
                            ? ` — ${q.order.title}`
                            : ""}
                        </a>
                      {:else}
                        <span class="text-muted">-</span>
                      {/if}
                    </td>
                    <td>{formatDate(q.createdAt)}</td>
                    <td>
                      <a
                        href="/admin/query/{q.id}"
                        class="btn btn-sm btn-outline-primary"
                      >
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
            on:pageChange={(e) => {
              currentPage = e.detail;
              loadData();
            }}
            on:rowsPerPageChange={(e) => {
              rowsPerPage = e.detail;
              currentPage = 1;
              loadData();
            }}
          />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop-custom {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1050;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1rem;
  }

  .order-search-wrap {
    position: relative;
  }
  .order-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 200;
    max-height: 220px;
    overflow-y: auto;
  }
  .order-dropdown-item {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: none;
    text-align: left;
    font-size: 13px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
  }
  .order-dropdown-item:hover {
    background: #f8f9fa;
  }
  .order-dropdown-item:last-child {
    border-bottom: none;
  }
</style>
