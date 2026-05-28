<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Swal from "sweetalert2";
  import Pagination from "$lib/components/Pagination.svelte";
  import { queryPrivacy } from "$lib/stores/queryPrivacy";
  import { queryUnreadCounts } from "$lib/stores/queryUnreadCounts";

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
  let selectedFilter = "last7days";
  let customStartDate = "";
  let customEndDate = "";
  let dateField = "createdAt"; // createdAt | updatedAt | lastActivityAt
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

  let raiseType = "other";
  let raisePriority = "medium";
  let raiseOrderId = null;
  let raiseOrderText = "";
  let raiseError = "";

  // edit query form
  let showEditForm = false;
  let editingQuery = null;
  let editing = false;
  let editSubject = "";

  let editType = "other";
  let editPriority = "medium";
  let editOrderId = null;
  let editOrderText = "";
  let editError = "";

  // order search for edit form
  let editOrderSearch = "";
  let editOrderResults = [];
  let editOrderLoading = false;
  let showEditOrderDropdown = false;
  let editOrderSearchTimeout;

  function onEditOrderInput() {
    editOrderId = null;
    editOrderText = editOrderSearch;
    clearTimeout(editOrderSearchTimeout);
    if (!editOrderSearch.trim()) {
      editOrderResults = [];
      showEditOrderDropdown = false;
      return;
    }
    editOrderSearchTimeout = setTimeout(async () => {
      editOrderLoading = true;
      showEditOrderDropdown = true;
      try {
        const res = await authApiFetch(
          `${API_ROUTES.ORDER}?search=${encodeURIComponent(editOrderSearch)}&limit=10`,
        );
        editOrderResults = res.data ?? [];
      } catch (_) {
        editOrderResults = [];
      } finally {
        editOrderLoading = false;
      }
    }, 300);
  }

  function selectEditOrder(order) {
    editOrderId = order.id;
    editOrderText = order.title ? `#${order.pId} — ${order.title}` : `#${order.pId}`;
    editOrderSearch = editOrderText;
    editOrderResults = [];
    showEditOrderDropdown = false;
  }

  function clearEditOrder() {
    editOrderId = null;
    editOrderText = "";
    editOrderSearch = "";
    editOrderResults = [];
    showEditOrderDropdown = false;
  }

  function openEditForm(q) {
    editingQuery = q;
    editSubject = q.subject ?? "";

    editType = q.type ?? "other";
    editPriority = q.priority ?? "medium";
    // pre-fill linked order if any
    if (q.order) {
      editOrderId = q.order.id;
      editOrderText = q.order.title ? `#${q.order.pId} — ${q.order.title}` : `#${q.order.pId}`;
      editOrderSearch = editOrderText;
    } else {
      editOrderId = null;
      editOrderText = "";
      editOrderSearch = "";
    }
    editOrderResults = [];
    showEditOrderDropdown = false;
    editError = "";
    showEditForm = true;
  }

  async function submitEditQuery() {
    editError = "";
    if (!editSubject.trim()) {
      editError = "Subject is required.";
      return;
    }
    editing = true;
    try {
      const payload = {
        subject: editSubject,

        type: editType,
        priority: editPriority,
        orderId: editOrderId ?? null,
      };
      await authApiFetch(`${API_ROUTES.QUERY}/${editingQuery.id}`, {
        method: "PATCH",
        data: JSON.stringify(payload),
      });
      showEditForm = false;
      editingQuery = null;
      Swal.fire({ icon: "success", title: "Query updated", timer: 1200, showConfirmButton: false });
      await loadData();
      if (isMasterView(currentUser)) loadStats();
    } catch (e) {
      const msg = e?.data?.message;
      if (typeof msg === "string") editError = msg;
      else if (Array.isArray(msg))
        editError = msg.flatMap((m) => Object.values(m.constraints ?? {})).join(" • ");
      else editError = "Failed to update query.";
    } finally {
      editing = false;
    }
  }

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
    // Auto-fill subject/description with order title if the field is still empty
    if (!raiseSubject.trim())     raiseSubject     = order.title ?? "";

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
    if (currentUser?.subRole === "tech_helper") {
      goto("/admin/query/sub-queue");
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
      } else if (currentUser?.subRole === "tech_helper") {
        // tech_helper can only see assigned queries — master-only list endpoint is forbidden
        res = await authApiFetch(`${API_ROUTES.QUERY}/assigned?${q}`);
      } else {
        if (raisedById) q.set("raisedById", raisedById);
        if (assignedToId) q.set("assignedToId", assignedToId);
        if (dateField !== "createdAt") q.set("dateField", dateField);
        res = await authApiFetch(`${API_ROUTES.QUERY}?${q}`);
      }
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

  function fmtMins(mins) {
    if (mins === null || mins === undefined) return "-";
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    if (mins < 60) return `${Math.round(mins)}m`;
    return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
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
    selectedFilter = "last7days";
    customStartDate = "";
    customEndDate = "";
    dateField = "createdAt";
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
    dateField !== "createdAt" ||
    raisedById ||
    assignedToId;

  async function submitRaiseQuery() {
    raiseError = "";
    if (!raiseSubject.trim()) {
      raiseError = "Subject is required.";
      return;
    }
    raising = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}`, {
        method: "POST",
        data: JSON.stringify({
          subject: raiseSubject,

          type: raiseType,
          priority: raisePriority,
          orderId: raiseOrderId ?? null,
        }),
      });
      showRaiseForm = false;
      raiseSubject = "";

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

  $: maskTC     = (name) => (currentUser?.role === "master" && $queryPrivacy.telecaller && name) ? "Telecaller" : (name ?? "-");
  $: maskTech   = (name) => (currentUser?.role === "master" && $queryPrivacy.tech       && name) ? "Tech"        : (name ?? "-");
  $: maskHelper = (name) => (currentUser?.role === "master" && $queryPrivacy.techHelper && name) ? "Helper"      : (name ?? "-");
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
      {#if isMasterView(currentUser)}
        <div>
          <select
            class="form-select"
            style="width: auto"
            bind:value={dateField}
            on:change={onFilterChange}
          >
            <option value="createdAt">Sort: Raised</option>
            <option value="updatedAt">Sort: Updated</option>
            <option value="lastActivityAt">Sort: Activity</option>
          </select>
        </div>
      {/if}
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
              <option value={u.id}>{u.subRole === "telecaller" ? maskTC(u.name) : u.subRole === "tech_helper" ? maskHelper(u.name) : maskTech(u.name)}</option>
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
              <option value={u.id}>{u.subRole === "telecaller" ? maskTC(u.name) : u.subRole === "tech_helper" ? maskHelper(u.name) : maskTech(u.name)}</option>
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
      <div class="modal-backdrop-custom">
        <div
          class="card shadow-lg p-4 position-relative"
          style="max-width:540px;width:100%;margin:auto;margin-top:80px;"
        >
          <!-- close button -->
          <button
            class="modal-close-btn"
            on:click={() => (showRaiseForm = false)}
            aria-label="Close"
          ><i class="ti ti-x"></i></button>
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
            <label class="form-label">Type</label>
            <div class="d-flex flex-wrap gap-2">
              {#each QUERY_TYPES.slice(1) as t}
                <button type="button"
                  class="badge-tab {raiseType === t.value ? 'badge-tab--type-active' : ''}"
                  on:click={() => raiseType = t.value}
                >{t.label}</button>
              {/each}
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">Priority</label>
            <div class="d-flex flex-wrap gap-2">
              {#each ['low','medium','high'] as p}
                <button type="button"
                  class="badge-tab badge-tab--priority-{p} {raisePriority === p ? 'badge-tab--active' : ''}"
                  on:click={() => raisePriority = p}
                >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
              {/each}
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

    <!-- Edit Query Modal -->
    {#if showEditForm}
      <div class="modal-backdrop-custom">
        <div
          class="card shadow-lg p-4 position-relative"
          style="max-width:560px;width:100%;margin:auto;margin-top:60px;"
        >
          <button
            class="modal-close-btn"
            on:click={() => (showEditForm = false)}
            aria-label="Close"
          ><i class="ti ti-x"></i></button>
          <h5 class="fw-bold mb-3">Edit Query</h5>
          {#if editError}
            <div class="alert alert-danger py-2">{editError}</div>
          {/if}
          <div class="mb-3">
            <label class="form-label">Subject <span class="text-danger">*</span></label>
            <input
              type="text"
              class="form-control"
              bind:value={editSubject}
              placeholder="Brief subject..."
              maxlength="150"
            />
          </div>
          <div class="mb-3">
            <label class="form-label">Type</label>
            <div class="d-flex flex-wrap gap-2">
              {#each QUERY_TYPES.slice(1) as t}
                <button type="button"
                  class="badge-tab {editType === t.value ? 'badge-tab--type-active' : ''}"
                  on:click={() => editType = t.value}
                >{t.label}</button>
              {/each}
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">Priority</label>
            <div class="d-flex flex-wrap gap-2">
              {#each ['low','medium','high'] as p}
                <button type="button"
                  class="badge-tab badge-tab--priority-{p} {editPriority === p ? 'badge-tab--active' : ''}"
                  on:click={() => editPriority = p}
                >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
              {/each}
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">Link to Order <span class="text-muted">(optional)</span></label>
            <div class="order-search-wrap">
              <div class="input-group">
                <input
                  type="text"
                  class="form-control"
                  placeholder="Search by order title or ID..."
                  bind:value={editOrderSearch}
                  on:input={onEditOrderInput}
                  on:focus={() => { if (editOrderResults.length) showEditOrderDropdown = true; }}
                  autocomplete="off"
                />
                {#if editOrderId}
                  <button class="btn btn-outline-secondary" type="button" on:click={clearEditOrder}>
                    <i class="ti ti-x"></i>
                  </button>
                {/if}
              </div>
              {#if editOrderId}
                <div class="mt-1 small text-success">
                  <i class="ti ti-circle-check me-1"></i>Linked: {editOrderText}
                </div>
              {/if}
              {#if showEditOrderDropdown}
                <div class="order-dropdown shadow-sm border rounded bg-white">
                  {#if editOrderLoading}
                    <div class="px-3 py-2 text-muted small">
                      <span class="spinner-border spinner-border-sm me-1"></span>Searching...
                    </div>
                  {:else if editOrderResults.length === 0}
                    <div class="px-3 py-2 text-muted small">No orders found.</div>
                  {:else}
                    {#each editOrderResults as o}
                      <button type="button" class="order-dropdown-item" on:click={() => selectEditOrder(o)}>
                        <span class="fw-semibold text-primary">#{o.pId}</span>
                        {#if o.title}<span class="ms-1">{o.title}</span>{/if}
                        {#if o.company}<span class="text-muted ms-1 small">· {o.company}</span>{/if}
                        <span class="badge bg-secondary ms-auto" style="font-size:10px;">{o.status}</span>
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
              on:click={() => (showEditForm = false)}>Cancel</button
            >
            <button
              class="btn btn-primary btn-sm"
              on:click={submitEditQuery}
              disabled={editing}
            >
              {editing ? "Saving..." : "Save Changes"}
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
                  {#if isMasterView(currentUser)}
                    <th title="Final quotation flagged in chat">Final Quot.</th>
                    <th title="First response time vs SLA">Delay</th>
                  {/if}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {#each queries as q, i}
                  {@const unread = $queryUnreadCounts[q.id] ?? 0}
                  <tr>
                    <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>
                    <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      <a
                        href="/admin/query/{q.id}"
                        class="text-primary fw-semibold"
                        title={q.subject}>{q.subject}</a
                      >{#if unread > 0}<span class="badge bg-danger rounded-pill ms-1" style="font-size:10px;">{unread > 99 ? "99+" : unread}</span>{/if}
                    </td>
                    {#if isMasterView(currentUser)}
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
                            {q.parentQueryId ? maskHelper(q.assignedTo.name) : maskTech(q.assignedTo.name)}
                          </a>
                        {:else}<span class="text-muted">Unassigned</span>{/if}
                      </td>
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
                    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      {#if q.order}
                        <a
                          href="/admin/order/{q.order.id}"
                          class="text-primary small"
                          title={q.order.title ? `#${q.order.pId} — ${q.order.title}` : `#${q.order.pId}`}
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
                    {#if isMasterView(currentUser)}
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
                    {/if}
                    <td class="d-flex gap-1">
                      <a
                        href="/admin/query/{q.id}"
                        class="btn btn-sm btn-outline-primary"
                        title="View"
                      >
                        <i class="ti ti-eye"></i>
                      </a>
                      {#if isMasterView(currentUser) || isTelecaller(currentUser)}
                        <button
                          class="btn btn-sm btn-outline-secondary"
                          title="Edit"
                          on:click={() => openEditForm(q)}
                        >
                          <i class="ti ti-edit"></i>
                        </button>
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
  .user-link:hover { text-decoration: underline !important; color: #3b5bdb !important; }

  /* ── Badge tab selector ─────────────────────────────── */
  .badge-tab {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    border: 1.5px solid #dee2e6;
    background: transparent;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    color: #6c757d;
    transition: all 0.15s ease;
    line-height: 1.5;
    white-space: nowrap;
  }
  .badge-tab:hover {
    border-color: #adb5bd;
    background: #f8f9fa;
    color: #495057;
  }
  .badge-tab--type-active {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
  }
  .badge-tab--priority-low.badge-tab--active    { background: #198754; color: #fff; border-color: #198754; }
  .badge-tab--priority-medium.badge-tab--active { background: #ffc107; color: #000; border-color: #ffc107; }
  .badge-tab--priority-high.badge-tab--active   { background: #dc3545; color: #fff; border-color: #dc3545; }

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

  .modal-close-btn {
    position: absolute;
    top: 0.6rem;
    right: 0.75rem;
    background: none;
    border: none;
    font-size: 1.25rem;
    line-height: 1;
    color: #6c757d;
    cursor: pointer;
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
    z-index: 10;
  }
  .modal-close-btn:hover {
    color: #dc3545;
    background: rgba(220, 53, 69, 0.08);
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
