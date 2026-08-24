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
  import { statusNamesStore } from "$lib/stores/statusNames";
  import { queryUnreadCounts } from "$lib/stores/queryUnreadCounts";
  import { queryFilterStore } from "$lib/stores/filterStore";
  import { showToast } from "$lib/stores/uiToast";
  import QueryQuickView from "$lib/components/QueryQuickView.svelte";
  import OrderQuickView from "$lib/components/OrderQuickView.svelte";
  import RaiseQueryModal from "$lib/components/RaiseQueryModal.svelte";
  import QueryTrainingAssignModal from "$lib/components/QueryTrainingAssignModal.svelte";
  import { queryOrderColumn, maskQueryPersonName, queryNamePrivacy } from "$lib/utils/maskUser";

  let currentUser;
  let queries = [];
  let stats = { open: 0, inProgress: 0, resolvedToday: 0, totalResolved: 0 };
  let loading = true;
  let currentPage = 1;
  let totalItems = 0;
  let totalPages = 0;
  let rowsPerPage = 10;

  // ── filters ──────────────────────────────────────────────────────────────
  const DEFAULT_STATUS = "open,in_progress";

  let search = "";
  let filterStatus = DEFAULT_STATUS;
  let filterType = "";
  let filterPriority = "";
  let filterQuick = "";
  let selectedFilter = "last7days";
  let customStartDate = "";
  let customEndDate = "";
  let dateField = "createdAt"; // createdAt | updatedAt | lastActivityAt
  let raisedById = "";
  let assignedToId = "";
  let allUsers = [];

  let searchTimeout;

  // Bulk selection (master/admin/manager)
  let selectedIds = new Set();
  let bulkStatus = "";
  let bulkUpdating = false;
  $: selectedCount = selectedIds.size;
  $: allPageSelected = queries.length > 0 && queries.every((q) => selectedIds.has(q.id));
  $: selectedTrainable = queries.filter(
    (q) => selectedIds.has(q.id) && isClosedOrResolved(q.status) && !q.parentQueryId,
  );

  // Quick view drawers
  let drawerOpen = false;
  let drawerQueryId = null;
  let orderDrawerOpen = false;
  let drawerOrderId = null;
  let trainOpen = false;
  let trainQueryId = null;
  let trainQueryIds = [];
  let trainSubject = "";

  function openTrainingAssign(q) {
    trainQueryId = q.id;
    trainQueryIds = [q.id];
    trainSubject = q.subject ?? "";
    trainOpen = true;
  }

  function openBulkTraining() {
    if (!selectedTrainable.length) {
      showToast({
        type: "warning",
        message: "Select closed or resolved queries to assign for training.",
      });
      return;
    }
    trainQueryIds = selectedTrainable.map((q) => q.id);
    trainQueryId = selectedTrainable.length === 1 ? selectedTrainable[0].id : null;
    trainSubject =
      selectedTrainable.length === 1
        ? selectedTrainable[0].subject
        : `${selectedTrainable.length} closed or resolved queries`;
    trainOpen = true;
  }

  function openQuickView(id) {
    orderDrawerOpen = false;
    drawerOrderId = null;
    drawerQueryId = id;
    drawerOpen = true;
  }

  function closeQuickView() {
    drawerOpen = false;
    drawerQueryId = null;
  }

  function openOrderQuickView(id) {
    drawerOpen = false;
    drawerQueryId = null;
    drawerOrderId = id;
    orderDrawerOpen = true;
  }

  function closeOrderQuickView() {
    orderDrawerOpen = false;
    drawerOrderId = null;
  }

  function canEditQuickView(q) {
    if (!q || !currentUser) return false;
    return isMasterView(currentUser) || isTelecaller(currentUser);
  }

  const isTelecaller = (u) => u?.role === "user" && u?.subRole === "telecaller";
  const isTech = (u) => u?.role === "user" && u?.subRole === "tech";
  const isMasterView = (u) => u?.role !== "user";
  const canAssignTraining = (u) => u?.role === "master" || u?.role === "admin";

  const BULK_STATUSES = [
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "resolved", label: "Resolved" },
    { value: "reopened", label: "Reopened" },
    { value: "closed", label: "Closed" },
  ];

  function toggleRow(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    selectedIds = selectedIds;
  }

  function toggleAll() {
    if (allPageSelected) queries.forEach((q) => selectedIds.delete(q.id));
    else queries.forEach((q) => selectedIds.add(q.id));
    selectedIds = selectedIds;
  }

  function clearSelection() {
    selectedIds = new Set();
    bulkStatus = "";
  }

  async function applyBulkStatus() {
    if (!bulkStatus || !selectedIds.size || bulkUpdating) return;
    const ids = [...selectedIds];
    const label = BULK_STATUSES.find((s) => s.value === bulkStatus)?.label || bulkStatus;
    const result = await Swal.fire({
      title: "Update status",
      html: `
        <div class="qp-bulk-confirm">
          <p class="qp-bulk-confirm__text">
            Change status for
            <span class="qp-bulk-confirm__count">${ids.length}</span>
            selected quer${ids.length === 1 ? "y" : "ies"} to
          </p>
          <span class="qp-bulk-confirm__status">${label}</span>
        </div>
      `,
      showCancelButton: true,
      focusConfirm: false,
      reverseButtons: true,
      buttonsStyling: false,
      confirmButtonText: "Update status",
      cancelButtonText: "Cancel",
      heightAuto: false,
      scrollbarPadding: false,
      customClass: {
        popup: "qp-bulk-swal",
        title: "qp-bulk-swal__title",
        htmlContainer: "qp-bulk-swal__html",
        actions: "qp-bulk-swal__actions",
        confirmButton: "btn btn-primary btn-sm qp-bulk-swal__btn",
        cancelButton: "btn btn-outline-secondary btn-sm qp-bulk-swal__btn",
      },
    });
    if (!result.isConfirmed) return;
    bulkUpdating = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.QUERY}/bulk/status`, {
        method: "PATCH",
        data: { ids, status: bulkStatus },
      });
      const updated = res?.data?.updated?.length ?? res?.updated?.length ?? 0;
      const failed = res?.data?.failed ?? res?.failed ?? [];
      clearSelection();
      await loadData();
      if (isMasterView(currentUser)) loadStats();
      if (failed.length) {
        showToast({
          type: "warning",
          message: `${updated} updated, ${failed.length} failed`,
        });
      } else {
        showToast({
          type: "success",
          message: `${updated} quer${updated === 1 ? "y" : "ies"} set to ${label}`,
        });
      }
    } catch (e) {
      showToast({
        type: "error",
        message: e?.data?.message || e?.message || "Could not update status",
      });
    } finally {
      bulkUpdating = false;
    }
  }

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
    { value: "all", label: "All Statuses" },
    { value: "open,in_progress", label: "Open & In Progress" },
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "resolved", label: "Resolved" },
    { value: "reopened", label: "Reopened" },
    { value: "closed", label: "Closed" },
    { value: "closed,resolved", label: "Closed & Resolved" },
  ];

  const QUICK_FILTERS = [
    {
      value: "unpicked",
      label: "Unpicked",
      hint: "Raised but not assigned yet",
      icon: "ti-user-off",
    },
    {
      value: "noReply",
      label: "No reply",
      hint: "Active with no chat yet",
      icon: "ti-message-off",
    },
    {
      value: "slaBreached",
      label: "SLA delayed",
      hint: "First response past SLA",
      icon: "ti-clock-exclamation",
    },
    {
      value: "stale",
      label: "Stale 48h+",
      hint: "In progress, idle over 48 hours",
      icon: "ti-clock-pause",
    },
    {
      value: "noFinal",
      label: "No final quot.",
      hint: "Missing final quotation flag",
      icon: "ti-flag-off",
    },
    {
      value: "dealWon",
      label: "Deal Won",
      hint: "Linked order won / dispatched / completed",
      icon: "ti-trophy",
    },
  ];

  function setQuickFilter(value) {
    filterQuick = filterQuick === value ? "" : value;
    if (filterQuick === "unpicked") assignedToId = "";
    currentPage = 1;
    saveFilterStore();
    loadData();
  }

  $: activeQuick = QUICK_FILTERS.find((f) => f.value === filterQuick) || null;

  // raise query form
  let showRaiseForm = false;

  // edit query form
  let showEditForm = false;
  let editingQuery = null;
  let editing = false;
  let editSubject = "";

  let editType = "other";
  let editPriority = "medium";
  let editOrderId = null;
  let editOrderText = "";
  let editDescription = "";
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
    editDescription = q.description ?? "";
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
        description: editDescription.trim() || null,
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
    } else if (selectedFilter === "custom" && customStartDate && customEndDate) {
      params.dateFrom = customStartDate;
      params.dateTo = customEndDate;
    }
    return params;
  }

  function saveFilterStore() {
    queryFilterStore.set({
      search,
      filterStatus,
      filterType,
      filterPriority,
      filterQuick,
      selectedFilter,
      customStartDate,
      customEndDate,
      dateField,
      raisedById,
      assignedToId,
      rowsPerPage,
      currentPage,
    });
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

    const saved = $queryFilterStore;
    if (saved && Object.keys(saved).length > 0) {
      if (saved.search !== undefined) search = saved.search;
      if (saved.filterStatus === "all") filterStatus = "all";
      else if (saved.filterStatus) filterStatus = saved.filterStatus;
      if (saved.filterType !== undefined) filterType = saved.filterType;
      if (saved.filterPriority !== undefined) filterPriority = saved.filterPriority;
      if (saved.filterQuick !== undefined) filterQuick = saved.filterQuick;
      if (saved.selectedFilter !== undefined) selectedFilter = saved.selectedFilter;
      if (saved.customStartDate !== undefined) customStartDate = saved.customStartDate;
      if (saved.customEndDate !== undefined) customEndDate = saved.customEndDate;
      if (saved.dateField !== undefined) dateField = saved.dateField;
      if (saved.raisedById !== undefined) raisedById = saved.raisedById;
      if (saved.assignedToId !== undefined) assignedToId = saved.assignedToId;
      if (saved.rowsPerPage !== undefined) rowsPerPage = saved.rowsPerPage;
      if (saved.currentPage !== undefined) currentPage = saved.currentPage;
    }
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
      selectedFilter = "last7days";
      customStartDate = "";
      customEndDate = "";
      saveFilterStore();
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
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
      loading = false;
      return;
    }
    loading = true;
    try {
      const dateParams = buildDateParams();
      const q = new URLSearchParams({ page: currentPage, limit: rowsPerPage });
      if (search) q.set("search", search);
      if (filterStatus && filterStatus !== "all") q.set("status", filterStatus);
      if (filterType) q.set("type", filterType);
      if (filterPriority) q.set("priority", filterPriority);
      if (filterQuick) q.set("quick", filterQuick);
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
        if (assignedToId !== "") q.set("assignedToId", assignedToId);
        if (dateField !== "createdAt") q.set("dateField", dateField);
        res = await authApiFetch(`${API_ROUTES.QUERY}?${q}`);
      }
      let rows = res.data ?? [];
      // Client-side ownership guard for telecallers (raisedById present on /my payload)
      if (isTelecaller(currentUser)) {
        const uid = Number(currentUser.id);
        rows = rows.filter((row) => Number(row.raisedById) === uid);
      }
      queries = rows;
      totalItems = res.total ?? 0;
      totalPages = res.totalPages ?? 0;
      clearSelection();
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
      saveFilterStore();
      loadData();
    }, 400);
  }

  function onFilterChange() {
    if (filterQuick === "unpicked") assignedToId = "";
    currentPage = 1;
    saveFilterStore();
    loadData();
  }

  function clearFilters() {
    search = "";
    filterStatus = DEFAULT_STATUS;
    filterType = "";
    filterPriority = "";
    filterQuick = "";
    selectedFilter = "last7days";
    customStartDate = "";
    customEndDate = "";
    dateField = "createdAt";
    raisedById = "";
    assignedToId = "";
    currentPage = 1;
    saveFilterStore();
    loadData();
  }

  $: hasFilters =
    search ||
    (filterStatus && filterStatus !== DEFAULT_STATUS) ||
    filterType ||
    filterPriority ||
    filterQuick ||
    selectedFilter !== "today" ||
    dateField !== "createdAt" ||
    raisedById ||
    assignedToId;

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

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  /** Today → 2m ago / 2h ago; yesterday / older → compact date + time (no mixed year). */
  function formatLastActivity(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (dayDiff === 0) {
      const mins = Math.floor((Date.now() - d.getTime()) / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return `${mins}m ago`;
      return `${Math.floor(mins / 60)}h ago`;
    }
    const time = d.toLocaleString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    if (dayDiff === 1) return `Yesterday, ${time}`;
    const date = d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    });
    return `${date}, ${time}`;
  }

  /** Compact duration — e.g. 45m, 3h, 2d. Defaults end to now when omitted. */
  function formatDuration(fromStr, toStr = null) {
    if (!fromStr) return "";
    const start = new Date(fromStr).getTime();
    const end = toStr ? new Date(toStr).getTime() : Date.now();
    const ms = end - start;
    if (Number.isNaN(ms) || ms < 0) return "0m";
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    return `${Math.floor(months / 12)}y`;
  }

  function isClosedOrResolved(status) {
    return status === "closed" || status === "resolved";
  }

  $: isRoleUser = currentUser?.role === "user";
  $: qp = queryNamePrivacy(currentUser, $queryPrivacy);
  $: maskTC = (name, ownName) => {
    if (isRoleUser && name && name !== (ownName ?? currentUser?.name)) return "Telecaller";
    if (!isRoleUser && qp.telecaller && name) return "Telecaller";
    return name ?? "-";
  };
  $: maskTech = (name, ownName) => {
    if (isRoleUser && name && name !== (ownName ?? currentUser?.name)) return "Tech";
    if (!isRoleUser && qp.tech && name) return "Tech";
    return name ?? "-";
  };
  $: maskHelper = (name, ownName) => {
    if (isRoleUser && name && name !== (ownName ?? currentUser?.name)) return "Senior Tech";
    if (!isRoleUser && qp.techHelper && name) return "Senior Tech";
    return name ?? "-";
  };
</script>

<div class="page-wrapper query-page">
  <div class="content">
    <!-- Header -->
    <div class="qp-toolbar mb-3">
      <div>
        <h4 class="mb-0">
          {#if isTelecaller(currentUser)}
            My Queries
          {:else}
            All Queries
          {/if}
        </h4>
        <p class="qp-sub mb-0">Support query overview</p>
      </div>
      {#if isTelecaller(currentUser)}
        <button class="btn btn-primary btn-sm" on:click={() => (showRaiseForm = true)}>
          <i class="ti ti-plus me-1"></i> Raise New Query
        </button>
      {/if}
    </div>

    <!-- Stats bar — master/admin/manager -->
    {#if isMasterView(currentUser)}
      <div class="qp-stats mb-3" role="list">
        <div class="qp-stat qp-stat--blue" role="listitem">
          <span class="qp-stat-lbl">Open</span>
          <span class="qp-stat-val">{stats.open}</span>
        </div>
        <div class="qp-stat qp-stat--yellow" role="listitem">
          <span class="qp-stat-lbl">In Progress</span>
          <span class="qp-stat-val">{stats.inProgress}</span>
        </div>
        <div class="qp-stat qp-stat--green" role="listitem">
          <span class="qp-stat-lbl">Resolved Today</span>
          <span class="qp-stat-val">{stats.resolvedToday}</span>
        </div>
        <div class="qp-stat qp-stat--gray" role="listitem">
          <span class="qp-stat-lbl">Total Resolved</span>
          <span class="qp-stat-val">{stats.totalResolved}</span>
        </div>
      </div>
    {/if}

    <!-- ── Filter Bar ──────────────────────────────────────────────────────── -->
    <div class="qp-filters mb-3">
      <div class="input-icon input-icon-start position-relative" style="width:170px;flex-shrink:0;">
        <span class="input-icon-addon p-2 text-dark"><i class="ti ti-search"></i></span>
        <input
          type="text"
          bind:value={search}
          on:input={onSearchInput}
          class="form-control"
          placeholder="Search.."
          style="width:170px;height:32px;font-size:0.75rem;padding-left:25px !important;"
        />
      </div>
      {#if isMasterView(currentUser)}
        <select class="form-select" bind:value={dateField} on:change={onFilterChange}>
          <option value="createdAt">Sort: Raised</option>
          <option value="updatedAt">Sort: Updated</option>
          <option value="lastActivityAt">Sort: Activity</option>
        </select>
      {/if}
      <select class="form-select" bind:value={selectedFilter} on:change={onFilterChange}>
        <option value="all">All Time</option>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="last7days">Last 7 Days</option>
        <option value="last30days">Last 30 Days</option>
        <option value="custom">Custom Range</option>
      </select>
      {#if selectedFilter === "custom"}
        <input
          type="date"
          class="form-control qp-date"
          bind:value={customStartDate}
          on:change={onFilterChange}
        />
        <input
          type="date"
          class="form-control qp-date"
          bind:value={customEndDate}
          on:change={onFilterChange}
        />
      {/if}
      <select class="form-select" bind:value={filterType} on:change={onFilterChange}>
        {#each QUERY_TYPES as t}
          <option value={t.value}>{t.label}</option>
        {/each}
      </select>
      <select class="form-select" bind:value={filterPriority} on:change={onFilterChange}>
        <option value="">All Priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select class="form-select" bind:value={filterStatus} on:change={onFilterChange}>
        {#each STATUSES as s}
          <option value={s.value}>{s.label}</option>
        {/each}
      </select>
      <select
        class="form-select"
        bind:value={filterQuick}
        on:change={onFilterChange}
        title="Edge cases / quick filters"
      >
        <option value="">All queries</option>
        {#each QUICK_FILTERS as f}
          <option value={f.value}>{f.label}</option>
        {/each}
      </select>
      {#if isMasterView(currentUser)}
        <select class="form-select" bind:value={raisedById} on:change={onFilterChange}>
          <option value="">Raised By</option>
          {#each allUsers.filter((u) => u.subRole === "telecaller" || u.subRole === "tech") as u}
            <option value={u.id}>{maskQueryPersonName(u, currentUser, $queryPrivacy)}</option>
          {/each}
        </select>
        <select class="form-select" bind:value={assignedToId} on:change={onFilterChange}>
          <option value="">Assigned To</option>
          <option value="0">Unassigned</option>
          {#each allUsers.filter((u) => u.subRole === "tech" || u.subRole === "tech_helper") as u}
            <option value={u.id}>{maskQueryPersonName(u, currentUser, $queryPrivacy)}</option>
          {/each}
        </select>
      {/if}
      {#if hasFilters}
        <button class="btn btn-outline-secondary btn-sm qp-clear" on:click={clearFilters}>
          <i class="ti ti-x me-1"></i>Clear
        </button>
      {/if}
    </div>

    {#if isMasterView(currentUser) || isTelecaller(currentUser)}
      <div class="attn-bar mb-3" aria-label="Query attention filters">
        <div class="attn-bar__head">
          <div class="attn-bar__title">
            <i class="ti ti-filter"></i>
            <span>Needs attention</span>
            {#if activeQuick}
              <span class="attn-bar__active-tag">{activeQuick.label}</span>
            {/if}
          </div>
          {#if filterQuick}
            <button type="button" class="attn-bar__clear" on:click={() => setQuickFilter("")}>
              <i class="ti ti-x"></i> Clear
            </button>
          {/if}
        </div>
        <div class="attn-bar__seg" role="group">
          {#each QUICK_FILTERS as f}
            <button
              type="button"
              class="attn-bar__btn"
              class:attn-bar__btn--on={filterQuick === f.value}
              title={f.hint}
              aria-pressed={filterQuick === f.value}
              on:click={() => setQuickFilter(f.value)}
            >
              <i class="ti {f.icon}"></i>
              <span>{f.label}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Raise Query Modal -->
    <RaiseQueryModal
      bind:open={showRaiseForm}
      on:created={() => {
        loadData();
        if (isMasterView(currentUser)) loadStats();
      }}
    />

    <!-- Edit Query Modal -->
    {#if showEditForm}
      <div class="modal-backdrop-custom">
        <div
          class="card shadow-lg p-4 position-relative"
          style="max-width:560px;width:100%;margin:auto;margin-top:60px;"
        >
          <button class="modal-close-btn" on:click={() => (showEditForm = false)} aria-label="Close"
            ><i class="ti ti-x"></i></button
          >
          <h5 class="mb-3">Edit Query</h5>
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
            <label class="form-label">Requirement <span class="text-muted">(optional)</span></label>
            <textarea
              style="resize:vertical;"
              class="form-control qp-textarea"
              rows="3"
              bind:value={editDescription}
              placeholder="Describe your requirement in detail..."
            ></textarea>
          </div>
          <div class="mb-3">
            <label class="form-label">Type</label>
            <div class="d-flex flex-wrap gap-2">
              {#each QUERY_TYPES.slice(1) as t}
                <button
                  type="button"
                  class="badge-tab {editType === t.value ? 'badge-tab--type-active' : ''}"
                  on:click={() => (editType = t.value)}>{t.label}</button
                >
              {/each}
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label">Priority</label>
            <div class="d-flex flex-wrap gap-2">
              {#each ["low", "medium", "high"] as p}
                <button
                  type="button"
                  class="badge-tab badge-tab--priority-{p} {editPriority === p
                    ? 'badge-tab--active'
                    : ''}"
                  on:click={() => (editPriority = p)}
                  >{p.charAt(0).toUpperCase() + p.slice(1)}</button
                >
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
                  bind:value={editOrderSearch}
                  on:input={onEditOrderInput}
                  on:focus={() => {
                    if (editOrderResults.length) showEditOrderDropdown = true;
                  }}
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
                      <button
                        type="button"
                        class="order-dropdown-item"
                        on:click={() => selectEditOrder(o)}
                      >
                        <span class="text-primary">#{o.pId}</span>
                        {#if o.title}<span class="ms-1">{o.title}</span>{/if}
                        {#if o.company}<span class="text-muted ms-1 small">· {o.company}</span>{/if}
                        <span class="badge bg-secondary ms-auto qp-badge"
                          >{$statusNamesStore[o.status]?.name ?? o.status}</span
                        >
                      </button>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          </div>
          <div class="d-flex gap-2 justify-content-end">
            <button class="btn btn-secondary btn-sm" on:click={() => (showEditForm = false)}
              >Cancel</button
            >
            <button class="btn btn-primary btn-sm" on:click={submitEditQuery} disabled={editing}>
              {editing ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Bulk status bar — master/admin/manager -->
    {#if isMasterView(currentUser) && selectedCount > 0}
      <div
        class="d-flex align-items-center gap-2 mb-2 p-2 px-3 bg-primary-subtle border border-primary rounded flex-wrap"
      >
        <span class="fw-semibold text-primary">{selectedCount} selected</span>
        <select
          class="form-select form-select-sm"
          style="width:auto;min-width:140px;"
          bind:value={bulkStatus}
        >
          <option value="">Set status…</option>
          {#each BULK_STATUSES as s}
            <option value={s.value}>{s.label}</option>
          {/each}
        </select>
        <button
          class="btn btn-sm btn-primary"
          disabled={!bulkStatus || bulkUpdating}
          on:click={applyBulkStatus}
        >
          {#if bulkUpdating}
            <span class="spinner-border spinner-border-sm me-1"></span>Updating…
          {:else}
            <i class="ti ti-check me-1"></i>Apply
          {/if}
        </button>
        {#if canAssignTraining(currentUser) && selectedTrainable.length}
          <button
            type="button"
            class="btn btn-sm btn-outline-warning"
            on:click={openBulkTraining}
          >
            <i class="ti ti-school me-1"></i>Assign for training ({selectedTrainable.length})
          </button>
        {/if}
        <button class="btn btn-sm btn-outline-secondary ms-auto" on:click={clearSelection}>
          <i class="ti ti-x me-1"></i>Clear
        </button>
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
      <div class="card border-0 rounded-0 mb-0 qp-table-card">
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0 qp-table">
              <thead class="table-light">
                <tr>
                  {#if isMasterView(currentUser)}
                    <th style="width:36px;">
                      <input
                        type="checkbox"
                        class="form-check-input"
                        checked={allPageSelected}
                        on:change={toggleAll}
                        title="Select all on page"
                      />
                    </th>
                  {/if}
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
                  <tr class={selectedIds.has(q.id) ? "table-active" : ""}>
                    {#if isMasterView(currentUser)}
                      <td>
                        <input
                          type="checkbox"
                          class="form-check-input"
                          checked={selectedIds.has(q.id)}
                          on:change={() => toggleRow(q.id)}
                        />
                      </td>
                    {/if}
                    <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>
                    <td style="max-width:260px;">
                      {#if q.ticketCode}
                        {@const activityAt = q.lastActivityAt || q.updatedAt || q.createdAt}
                        <div class="qp-ticket">
                          <span class="qp-ticket-code">{q.ticketCode}</span>
                          {#if activityAt}
                            <span
                              class="qp-activity-badge"
                              title="Last activity {formatDate(activityAt)}"
                              >{formatLastActivity(activityAt)}</span
                            >
                          {/if}
                        </div>
                      {/if}
                      <div class="d-flex align-items-center gap-1 flex-wrap" style="min-width:0;">
                        <a
                          href="/admin/query/{q.id}"
                          class="qp-subject"
                          title="Open full — {q.subject}">{q.subject}</a
                        >
                        {#if unread > 0}<span class="badge bg-danger rounded-pill query-count-badge"
                            >{unread > 99 ? "99+" : unread}</span
                          >{/if}
                        {#if !q.assignedTo && ["open", "reopened"].includes(q.status)}
                          <span
                            class="badge bg-warning text-dark qp-badge"
                            title="Raised but not picked">Unpicked</span
                          >
                        {/if}
                        {#if q.slaBreached}
                          <span class="badge bg-danger text-white qp-badge" title="SLA delayed"
                            >SLA</span
                          >
                        {/if}
                        {#if ["Deal Won", "Dispatched", "Completed"].includes(q.order?.status)}<span
                            class="badge bg-success query-deal-badge">🏆 Deal Won</span
                          >{/if}
                      </div>
                    </td>
                    {#if isMasterView(currentUser)}
                      <td>
                        {#if q.raisedBy}
                          <a
                            href="/admin/query/user/{q.raisedBy.id}"
                            class="text-body text-decoration-none user-link"
                          >
                            {maskTC(q.raisedBy.name)}
                          </a>
                        {:else}-{/if}
                      </td>
                      <td>
                        {#if q.assignedTo}
                          <a
                            href="/admin/query/user/{q.assignedTo.id}"
                            class="text-body text-decoration-none user-link"
                          >
                            {q.parentQueryId
                              ? maskHelper(q.assignedTo.name)
                              : maskTech(q.assignedTo.name)}
                          </a>
                        {:else}<span class="text-muted">Unassigned</span>{/if}
                      </td>
                    {/if}
                    <td>
                      <span class="badge bg-light text-dark border qp-badge">
                        {QUERY_TYPES.find((t) => t.value === q.type)?.label ?? q.type ?? "-"}
                      </span>
                    </td>
                    <td>
                      <span class="{PRIORITY_COLORS[q.priority] ?? 'badge bg-secondary'} qp-badge">
                        {q.priority ?? "-"}
                      </span>
                    </td>
                    <td>
                      <span class="{STATUS_COLORS[q.status] ?? 'badge bg-secondary'} qp-badge">
                        {q.status?.replace("_", " ")}
                      </span>
                    </td>
                    <td class="qp-order-cell">
                      {#if q.order?.id}
                        {@const oc = queryOrderColumn(q.order)}
                        <button
                          type="button"
                          class="qp-order-qv"
                          title={oc?.title || `Order quick view — #${q.order.pId}`}
                          on:click={() => openOrderQuickView(q.order.id)}
                        >
                          <span class="qp-order-company">{oc?.heading || `#${q.order.pId}`}</span>
                          {#if oc?.client}
                            <span class="qp-order-client">{oc.client}</span>
                          {/if}
                        </button>
                      {:else}
                        <span class="text-muted">-</span>
                      {/if}
                    </td>
                    <td class="qp-raised-cell">
                      <div class="qp-raised-date">{formatDate(q.createdAt)}</div>
                      {#if q.status === "closed" && q.resolvedAt}
                        <div class="qp-raised-meta qp-raised-meta--closed" title="Closed on">
                          Closed {formatDate(q.resolvedAt)}
                          <span class="qp-raised-dur"
                            >· {formatDuration(q.createdAt, q.resolvedAt)}</span
                          >
                        </div>
                      {:else if q.status === "resolved" && q.resolvedAt}
                        <div class="qp-raised-meta qp-raised-meta--closed" title="Resolved on">
                          Resolved {formatDate(q.resolvedAt)}
                          <span class="qp-raised-dur"
                            >· {formatDuration(q.createdAt, q.resolvedAt)}</span
                          >
                        </div>
                      {:else if !isClosedOrResolved(q.status)}
                        <div
                          class="qp-raised-meta qp-raised-meta--progress"
                          title="Open duration till today"
                        >
                          {formatDuration(q.createdAt)} in progress
                        </div>
                      {/if}
                    </td>
                    {#if isMasterView(currentUser)}
                      <td>
                        {#if q.hasFinalQuotation}
                          <span class="badge bg-success qp-badge"
                            ><i class="ti ti-flag-check me-1"></i>Sent</span
                          >
                        {:else}
                          <span class="badge bg-light text-muted border qp-badge">Pending</span>
                        {/if}
                      </td>
                      <td>
                        {#if q.slaBreached}
                          <span
                            class="badge bg-danger text-white qp-badge"
                            title="{q.firstResponseMins}m"
                          >
                            <i class="ti ti-clock-exclamation me-1"></i>{fmtMins(
                              q.firstResponseMins,
                            )}
                          </span>
                        {:else if q.firstResponseMins !== null}
                          <span class="badge bg-success text-white qp-badge"
                            >{fmtMins(q.firstResponseMins)}</span
                          >
                        {:else}
                          <span class="text-muted small">-</span>
                        {/if}
                      </td>
                    {/if}
                    <td class="d-flex gap-1">
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-primary"
                        title="Quick view"
                        on:click={() => openQuickView(q.id)}
                      >
                        <i class="ti ti-eye"></i>
                      </button>
                      {#if isMasterView(currentUser) || isTelecaller(currentUser)}
                        <button
                          class="btn btn-sm btn-outline-secondary"
                          title="Edit"
                          on:click={() => openEditForm(q)}
                        >
                          <i class="ti ti-edit"></i>
                        </button>
                      {/if}
                      {#if canAssignTraining(currentUser) && isClosedOrResolved(q.status) && !q.parentQueryId}
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-warning"
                          title="Assign for training"
                          on:click={() => openTrainingAssign(q)}
                        >
                          <i class="ti ti-school"></i>
                        </button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <div class="qp-pager">
            <Pagination
              {currentPage}
              {totalPages}
              {rowsPerPage}
              on:pageChange={(e) => {
                currentPage = e.detail;
                saveFilterStore();
                loadData();
              }}
              on:rowsPerPageChange={(e) => {
                rowsPerPage = e.detail;
                currentPage = 1;
                saveFilterStore();
                loadData();
              }}
            />
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<QueryQuickView
  bind:open={drawerOpen}
  queryId={drawerQueryId}
  {currentUser}
  canEdit={canEditQuickView}
  on:edit={(e) => openEditForm(e.detail)}
  on:openOrder={(e) => openOrderQuickView(e.detail)}
  on:close={closeQuickView}
/>

<OrderQuickView
  bind:open={orderDrawerOpen}
  orderId={drawerOrderId}
  {currentUser}
  on:close={closeOrderQuickView}
/>

<QueryTrainingAssignModal
  bind:open={trainOpen}
  queryId={trainQueryId}
  queryIds={trainQueryIds}
  querySubject={trainSubject}
  on:assigned={() => {
    if (trainQueryIds.length > 1) clearSelection();
  }}
/>

<style>
  /* Small, clean, clear — Cursor-like 12px */
  .query-page,
  .query-page :global(.content) {
    font-size: 12px !important;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .query-page :global(h4) {
    font-size: 15px !important;
    font-weight: 600 !important;
    letter-spacing: -0.01em;
    color: #212529;
  }
  .query-page :global(h5) {
    font-size: 13px !important;
    font-weight: 600 !important;
    color: #212529;
  }
  .query-page :global(.fw-bold),
  .query-page :global(.fw-semibold) {
    font-weight: 500 !important;
  }
  .query-page :global(.form-label) {
    font-size: 11.5px !important;
    font-weight: 500 !important;
    color: #495057;
    margin-bottom: 4px;
  }
  .query-page :global(.form-control),
  .query-page :global(.form-select),
  .query-page :global(.btn),
  .query-page :global(.btn-sm) {
    font-size: 11.5px !important;
    line-height: 1.35 !important;
  }
  .query-page :global(.form-control),
  .query-page :global(.form-select) {
    height: 28px !important;
    min-height: 28px !important;
    padding: 2px 8px !important;
  }
  .query-page :global(textarea.form-control),
  .query-page :global(.qp-textarea) {
    height: auto !important;
    min-height: 72px !important;
    padding: 8px !important;
    font-size: 12px !important;
  }
  .query-page :global(.text-muted),
  .query-page :global(.small) {
    font-size: 11px !important;
    font-weight: 400 !important;
  }
  .query-page :global(.badge) {
    font-weight: 500 !important;
  }

  .qp-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .qp-sub {
    font-size: 11px;
    color: #868e96;
    margin-top: 2px;
    font-weight: 400;
  }

  .qp-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    overflow: hidden;
  }
  .qp-stat {
    padding: 10px 12px;
    border-right: 1px solid #f1f3f5;
  }
  .qp-stat:last-child {
    border-right: none;
  }
  .qp-stat-lbl {
    display: block;
    font-size: 10.5px;
    font-weight: 500;
    color: #868e96;
    margin-bottom: 3px;
  }
  .qp-stat-val {
    display: block;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .qp-stat--blue .qp-stat-val {
    color: #364fc7;
  }
  .qp-stat--yellow .qp-stat-val {
    color: #e67700;
  }
  .qp-stat--green .qp-stat-val {
    color: #2b8a3e;
  }
  .qp-stat--gray .qp-stat-val {
    color: #495057;
  }

  .qp-filters {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .qp-search {
    width: 160px;
    flex-shrink: 0;
  }
  .qp-filters :global(.form-select) {
    width: auto;
    min-width: 108px;
    max-width: 148px;
    height: 32px;
    font-size: 0.75rem;
  }
  .qp-date {
    width: 118px;
  }
  .qp-clear {
    height: 28px;
    display: inline-flex;
    align-items: center;
  }

  .qp-edge-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .qp-edge-chip {
    border: 1px solid #dee2e6;
    background: #fff;
    color: #495057;
    font-size: 11px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }
  .qp-edge-chip:hover {
    border-color: #91a7ff;
    color: #364fc7;
    background: #edf2ff;
  }
  .qp-edge-chip--active {
    border-color: #364fc7;
    background: #364fc7;
    color: #fff;
  }
  .qp-edge-chip--active:hover {
    background: #3b5bdb;
    border-color: #3b5bdb;
    color: #fff;
  }

  .attn-bar {
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 10px 12px;
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
    font-size: 11.5px;
    font-weight: 600;
    color: #343a40;
  }
  .attn-bar__title :global(i) {
    color: #868e96;
    font-size: 14px;
  }
  .attn-bar__active-tag {
    font-size: 10.5px;
    font-weight: 500;
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
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
  }
  .attn-bar__clear:hover {
    color: #c92a2a;
    background: #fff5f5;
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
    font-size: 11.5px;
    font-weight: 500;
    line-height: 1.2;
    padding: 5px 9px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
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

  .qp-table-card :global(.card-body) {
    padding: 0;
  }
  .qp-table {
    font-size: 12px !important;
  }
  .qp-table :global(th) {
    font-size: 10.5px !important;
    font-weight: 600 !important;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: #868e96 !important;
    padding: 8px 12px !important;
    white-space: nowrap;
    border-bottom: 1px solid #e9ecef !important;
  }
  .qp-raised-cell {
    white-space: nowrap;
    min-width: 118px;
  }
  .qp-raised-date {
    font-size: 11.5px;
    font-weight: 500;
    color: #343a40;
    line-height: 1.3;
  }
  .qp-raised-meta {
    margin-top: 2px;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.25;
  }
  .qp-raised-meta--progress {
    color: #e67700;
  }
  .qp-raised-meta--closed {
    color: #868e96;
  }
  .qp-raised-dur {
    font-weight: 600;
    color: #495057;
  }

  .qp-table :global(td) {
    font-size: 12px !important;
    font-weight: 400 !important;
    padding: 8px 12px !important;
    color: #343a40;
    vertical-align: middle;
  }
  .qp-ticket {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 3px;
    min-width: 0;
  }
  .qp-ticket-code {
    font-size: 11px !important;
    font-weight: 600;
    color: #868e96;
    letter-spacing: 0.2px;
    flex-shrink: 0;
  }
  .qp-subject {
    color: #364fc7;
    font-weight: 500;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 240px;
    display: inline-block;
  }
  .qp-subject:hover {
    text-decoration: underline;
  }
  .qp-order-cell {
    max-width: 200px;
    vertical-align: middle;
  }
  .qp-order-qv {
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: #c92a2a;
    font-size: 12px;
    font-weight: 500;
    max-width: 200px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    min-width: 0;
  }
  .qp-order-qv:hover {
    text-decoration: none;
  }
  .qp-order-qv:hover .qp-order-company {
    text-decoration: underline;
  }
  .qp-order-company,
  .qp-order-client {
    display: block;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .qp-order-client {
    color: #868e96;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .qp-badge {
    font-size: 10.5px !important;
    font-weight: 500 !important;
    padding: 2px 6px !important;
  }
  .qp-activity-badge {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    font-size: 8px !important;
    font-weight: 600 !important;
    padding: 0 6px !important;
    line-height: 1.4 !important;
    border-radius: 999px;
    border: 1px solid #e67700;
    background: transparent;
    color: #e67700;
    white-space: nowrap;
  }
  .qp-pager {
    padding: 8px 12px;
    border-top: 1px solid #f1f3f5;
  }

  .user-link:hover {
    text-decoration: underline !important;
    color: #3b5bdb !important;
  }

  /* ── Badge tab selector ─────────────────────────────── */
  .badge-tab {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 5px;
    border: 1px solid #dee2e6;
    background: transparent;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    color: #6c757d;
    transition: all 0.12s ease;
    line-height: 1.4;
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
  .badge-tab--priority-low.badge-tab--active {
    background: #198754;
    color: #fff;
    border-color: #198754;
  }
  .badge-tab--priority-medium.badge-tab--active {
    background: #ffc107;
    color: #000;
    border-color: #ffc107;
  }
  .badge-tab--priority-high.badge-tab--active {
    background: #dc3545;
    color: #fff;
    border-color: #dc3545;
  }

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
    font-size: 14px;
    line-height: 1;
    color: #6c757d;
    cursor: pointer;
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    transition:
      color 0.15s,
      background 0.15s;
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
    padding: 7px 10px;
    border: none;
    background: none;
    text-align: left;
    font-size: 12px;
    font-weight: 400;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
  }
  .order-dropdown-item:hover {
    background: #f8f9fa;
  }
  .order-dropdown-item:last-child {
    border-bottom: none;
  }

  @media (max-width: 700px) {
    .qp-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .qp-stat:nth-child(2n) {
      border-right: none;
    }
    .qp-stat:nth-child(n + 3) {
      border-top: 1px solid #f1f3f5;
    }
  }

  /* Swal mounts on body */
  :global(.qp-bulk-swal) {
    width: min(360px, calc(100vw - 32px)) !important;
    padding: 1.25rem 1.25rem 1rem !important;
    border-radius: 10px !important;
    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.14) !important;
  }
  :global(.qp-bulk-swal__title) {
    font-size: 15px !important;
    font-weight: 600 !important;
    color: #212529 !important;
    padding: 0 0 4px !important;
    margin: 0 !important;
  }
  :global(.qp-bulk-swal__html) {
    margin: 0 !important;
    padding: 0 !important;
  }
  :global(.qp-bulk-confirm) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 8px 0 4px;
  }
  :global(.qp-bulk-confirm__text) {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: #495057;
    text-align: center;
  }
  :global(.qp-bulk-confirm__count) {
    font-weight: 600;
    color: #212529;
    font-variant-numeric: tabular-nums;
  }
  :global(.qp-bulk-confirm__status) {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: #364fc7;
    background: #edf2ff;
    border: 1px solid #bac8ff;
  }
  :global(.qp-bulk-swal__actions) {
    margin: 1rem 0 0 !important;
    gap: 8px !important;
  }
  :global(.qp-bulk-swal__btn) {
    margin: 0 !important;
    min-width: 96px;
  }

</style>
