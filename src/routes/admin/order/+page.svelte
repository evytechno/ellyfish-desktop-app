<script>
  import { onMount, onDestroy } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { goto } from "$app/navigation";
  import { checkAuth } from "$lib/utils/auth";
  import { get } from "svelte/store";
  import { orderFilterStore } from "$lib/stores/filterStore";
  import { companiesAllStore, categoriesAllStore, usersAllStore } from "$lib/stores/dataStores";
  import Loader from "$lib/components/Loader.svelte";
  import OrderDragula from "$lib/components/OrderDragula.svelte";
  import PIWOTIModal from "$lib/components/PIWOTIModal.svelte";
  import ChatQuickModal from "$lib/components/ChatQuickModal.svelte";
  import ChangeListVisiableStatus from "$lib/components/ChangeListVisiableStatus.svelte";

  import OrderFilters from "./components/OrderFilters.svelte";
  import OrderCreateForm from "./components/OrderCreateForm.svelte";
  import OrderBulkToolbar from "./components/OrderBulkToolbar.svelte";
  import OrderListTable from "./components/OrderListTable.svelte";
  import { generatePdfFromList, generateExcelFromList } from "./components/orderExport.js";

  let currentUser = null;
  let loadingData = true;
  let filterReady = false;
  let firstLoad = false;

  // List state
  let listOrders = [];
  let listTotalItems = 0;
  let listTotalPages = 1;
  let listCurrentPage = 1;
  let listRowsPerPage = 10;

  // Grid refresh
  let gridRefreshKey = 0;

  // Reference data
  let users = [];
  let companies = [];
  let categories = [];

  // Filter state
  let trashBin = false;
  let userId = null;
  let companyId = null;
  let filterStatus = null;
  let filterCategory = "";
  let filterSource = "";
  let searchTerm = "";
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;
  let orderBy = "createdAt";

  function getDefaultViewType() {
    try {
      const u = checkAuth();
      return u?.role === "master" || u?.role === "admin" ? "list" : "grid";
    } catch { return "grid"; }
  }
  let viewType =
    (typeof localStorage !== "undefined" && localStorage.getItem("orderViewType")) ||
    getDefaultViewType();

  // Bulk selection
  let selectedOrders = new Set();

  // Chat modal
  let chatModalOpen = false;
  let chatModalOrder = null;
  let chatModalPreselected = [];

  // PI/WO/TI modal
  let piwotiModalOpen = false;
  let piwotiModalType = "PI";
  let piwotiModalOrder = null;

  // ── Computed ──────────────────────────────────────────────────────────────
  $: searchString = (() => {
    const fd = (d) => new Date(d).toLocaleDateString("en-CA", { day: "2-digit", month: "short", year: "numeric" });
    if (selectedFilter === "last7days") {
      const s = new Date(); s.setDate(s.getDate() - 7);
      return `${fd(s)} to ${fd(new Date())}`;
    }
    if (selectedFilter === "last30days") {
      const s = new Date(); s.setDate(s.getDate() - 30);
      return `${fd(s)} to ${fd(new Date())}`;
    }
    if (selectedFilter === "today") return "Today";
    if (selectedFilter === "yesterday") return "Yesterday";
    if (selectedFilter === "custom" && customStartDate && customEndDate)
      return `${fd(customStartDate)} to ${fd(customEndDate)}`;
    return "All";
  })();

  $: filterParams = (() => {
    const fmt = (d) => d.toLocaleDateString("en-CA");
    let dates = {};
    if (selectedFilter === "last7days") {
      const s = new Date(); s.setDate(s.getDate() - 7);
      dates = { startDate: fmt(s), endDate: fmt(new Date()) };
    } else if (selectedFilter === "last30days") {
      const s = new Date(); s.setDate(s.getDate() - 30);
      dates = { startDate: fmt(s), endDate: fmt(new Date()) };
    } else if (selectedFilter === "today") {
      dates = { startDate: fmt(new Date()), endDate: fmt(new Date()) };
    } else if (selectedFilter === "yesterday") {
      const y = new Date(); y.setDate(y.getDate() - 1);
      dates = { startDate: fmt(y), endDate: fmt(y) };
    } else if (selectedFilter === "custom" && customStartDate && customEndDate) {
      dates = { startDate: customStartDate, endDate: customEndDate };
    }
    return {
      search: searchTerm || "",
      ...dates,
      byUserId: userId,
      byCompanyId: companyId,
      orderBy: orderBy || "createdAt",
      withDeleted: trashBin,
      filterStatus,
      filterCategory,
      filterSource,
      _refreshKey: gridRefreshKey,
    };
  })();

  const allStatuses = [
    "New Lead", "Contacted", "Quotation Sent", "Follow Up", "Needs Assessment",
    "Qualified", "Negotiation In Progress", "Deal Won", "Unqualified", "Deal Lost",
    "Reference", "Dispatched", "Completed",
  ];

  // ── Data fetching ─────────────────────────────────────────────────────────
  function computeDateRange() {
    const fmt = (d) => d.toLocaleDateString("en-CA");
    if (selectedFilter === "last7days") {
      const s = new Date(); s.setDate(s.getDate() - 7);
      return { startDate: fmt(s), endDate: fmt(new Date()) };
    }
    if (selectedFilter === "last30days") {
      const s = new Date(); s.setDate(s.getDate() - 30);
      return { startDate: fmt(s), endDate: fmt(new Date()) };
    }
    if (selectedFilter === "today") return { startDate: fmt(new Date()), endDate: fmt(new Date()) };
    if (selectedFilter === "yesterday") {
      const y = new Date(); y.setDate(y.getDate() - 1);
      return { startDate: fmt(y), endDate: fmt(y) };
    }
    if (selectedFilter === "custom" && customStartDate && customEndDate)
      return { startDate: customStartDate, endDate: customEndDate };
    return {};
  }

  function buildListQuery() {
    const dates = computeDateRange();
    const q = new URLSearchParams();
    if (searchTerm) q.set("search", searchTerm);
    if (dates.startDate) q.set("startDate", dates.startDate);
    if (dates.endDate) q.set("endDate", dates.endDate);
    if (userId) q.set("byUserId", String(userId));
    if (companyId) q.set("byCompanyId", String(companyId));
    if (orderBy) q.set("orderBy", orderBy);
    if (trashBin) q.set("withDeleted", "true");
    if (filterStatus) q.set("status", filterStatus);
    if (filterCategory) q.set("category", filterCategory);
    if (filterSource) q.set("source", filterSource);
    q.set("page", String(listCurrentPage));
    q.set("limit", String(listRowsPerPage));
    return q;
  }

  function syncFilterStore() {
    orderFilterStore.update((s) => ({
      ...s,
      userId, companyId, filterStatus, filterCategory,
      searchTerm, selectedFilter, customStartDate, customEndDate, orderBy,
    }));
  }

  async function fetchListOrders() {
    loadingData = true;
    syncFilterStore();
    try {
      const data = await authApiFetch(`${API_ROUTES.ORDER}?${buildListQuery()}`, { method: "GET" });
      listOrders = data.data;
      listTotalItems = data.total;
      listTotalPages = data.totalPages;
      selectedOrders = new Set();
    } catch (error) {
      errorHandle(error);
    } finally {
      loadingData = false;
    }
  }

  async function getAllUsers() {
    const cached = get(usersAllStore);
    if (cached?.length > 0) { users = cached; return; }
    try {
      const data = await authApiFetch(API_ROUTES.USER + "/all");
      users = data; usersAllStore.set(data);
    } catch {}
  }

  async function getAllCompanies() {
    const cached = get(companiesAllStore);
    if (cached?.length > 0) { companies = cached; return; }
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = data; companiesAllStore.set(data);
    } catch {}
  }

  async function getAllCategories() {
    const cached = get(categoriesAllStore);
    if (cached?.length > 0 && typeof cached[0] === "object" && cached[0].label) {
      categories = cached; return;
    }
    try {
      const data = await authApiFetch(API_ROUTES.CATEGORY + "/all");
      categories = data.map((parent) => ({
        label: parent.name,
        options: parent.children?.length > 0 ? parent.children.map((c) => c.name) : [parent.name],
      }));
      categoriesAllStore.set(categories);
    } catch {}
  }

  let debounceRefresh;
  async function refreshPage() {
    clearTimeout(debounceRefresh);
    debounceRefresh = setTimeout(async () => {
      if (viewType === "list") await fetchListOrders();
      else gridRefreshKey++;
      await Promise.all([getAllUsers(), getAllCompanies(), getAllCategories()]);
    }, 200);
  }

  // ── Filter change handler ─────────────────────────────────────────────────
  function onFilterChange() {
    if (!firstLoad) return;
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) return;
    if (viewType === "list") {
      listCurrentPage = 1;
      fetchListOrders();
    }
  }

  $: [searchTerm, filterStatus, filterCategory, selectedFilter, customStartDate, customEndDate, orderBy, userId, companyId, trashBin],
    onFilterChange();

  // ── View type ─────────────────────────────────────────────────────────────
  function changeViewType(type) {
    viewType = type;
    localStorage.setItem("orderViewType", type);
    if (type === "list") { listCurrentPage = 1; fetchListOrders(); }
  }

  // ── Export helpers ────────────────────────────────────────────────────────
  function getExportFilters() {
    return { searchTerm, selectedFilter, customStartDate, customEndDate };
  }

  function exportPdf(orders) {
    generatePdfFromList(orders, getExportFilters(), currentUser);
  }

  function exportExcel(orders) {
    generateExcelFromList(orders, getExportFilters(), currentUser);
  }

  function getExportOrders() {
    return selectedOrders.size > 0 ? listOrders.filter((o) => selectedOrders.has(o.id)) : listOrders;
  }

  // ── Bulk selection ────────────────────────────────────────────────────────
  function toggleSelectOrder(id) {
    const s = new Set(selectedOrders);
    s.has(id) ? s.delete(id) : s.add(id);
    selectedOrders = s;
  }

  function handleSelectAll(rows) {
    const allSelected = rows.every((r) => selectedOrders.has(r.id));
    if (allSelected) {
      rows.forEach((r) => selectedOrders.delete(r.id));
    } else {
      rows.forEach((r) => selectedOrders.add(r.id));
    }
    selectedOrders = new Set(selectedOrders);
  }

  // ── PI/WO/TI ─────────────────────────────────────────────────────────────
  function openPIWOTIModal(type, orderId) {
    const order = listOrders.find((o) => o.id === orderId);
    if (!order) return;
    piwotiModalType = type;
    piwotiModalOrder = order;
    piwotiModalOpen = true;
  }

  async function onPIWOTIRefresh() {
    if (!piwotiModalOrder) return;
    try {
      const updated = await authApiFetch(`${API_ROUTES.ORDER}/${piwotiModalOrder.id}`);
      listOrders = listOrders.map((o) => (o.id === updated.id ? updated : o));
      piwotiModalOrder = updated;
    } catch {}
  }

  if (typeof window !== "undefined") {
    window.__openPIWOTI = openPIWOTIModal;
  }

  // ── Chat modal ────────────────────────────────────────────────────────────
  function handleOpenChatModal(e) {
    const incoming = e.detail.order;
    if (
      chatModalOrder?.id === incoming.id &&
      (chatModalOrder.orderChats?.length || 0) > (incoming.orderChats?.length || 0)
    ) {
      chatModalOrder = { ...incoming, orderChats: chatModalOrder.orderChats };
    } else {
      chatModalOrder = incoming;
    }
    chatModalPreselected = e.detail.preselectedTypes || [];
    chatModalOpen = true;
  }

  async function updateOrderStatus(order, newStatus) {
    try {
      await authApiFetch(API_ROUTES.ORDER + "/" + order.id, {
        method: "PUT",
        data: JSON.stringify({
          title: order.title,
          status: newStatus,
          orderActivity: {
            title: "Order Status Changed",
            description: `The order status has been updated to '${newStatus}'.`,
          },
        }),
      });
      return true;
    } catch (error) {
      errorHandle(error);
      return false;
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    currentUser = checkAuth();
    if (!localStorage.getItem("orderViewType")) {
      viewType = currentUser?.role !== "user" ? "list" : "grid";
    }

    const fs = $orderFilterStore;
    userId = fs.userId || null;
    companyId = fs.companyId || null;
    filterStatus = fs.filterStatus || null;
    filterCategory = fs.filterCategory || "";
    searchTerm = fs.searchTerm || "";
    selectedFilter = fs.selectedFilter || "last7days";
    customStartDate = fs.customStartDate || null;
    customEndDate = fs.customEndDate || null;
    orderBy = fs.orderBy || "createdAt";

    document.addEventListener("openChatModal", handleOpenChatModal);
    filterReady = true;
    loadingData = false;

    if (viewType === "list") fetchListOrders();
    getAllUsers();
    getAllCompanies();
    getAllCategories();

    setTimeout(() => { firstLoad = true; }, 500);
  });

  onDestroy(() => {
    document.removeEventListener("openChatModal", handleOpenChatModal);
  });
</script>

<div class="page-wrapper">
  <div class="content">
    <!-- Page Header -->
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">
          Orders
          <span class="text-xs font-normal">{searchString ? `(${searchString})` : ""}</span>
        </h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Orders</li>
          </ol>
        </nav>
      </div>
      {#if !trashBin}
        <div class="gap-2 flex items-center flex-wrap">
          {#if viewType === "grid"}
            <a href="#order_lists_status" class="btn btn-outline-light" data-bs-toggle="modal" data-bs-target="#order_lists_status">
              Lists Title
            </a>
          {/if}
          {#if !["telecaller", "tech", "tech_helper"].includes(currentUser?.subRole)}
            <div class="dropdown">
              <a href="#Export" class="dropdown-toggle btn btn-outline-light px-2 shadow" data-bs-toggle="dropdown">
                <i class="ti ti-package-export me-2"></i>Export
              </a>
              <div class="dropdown-menu dropdown-menu-end">
                <ul>
                  <li>
                    <button type="button" on:click={() => exportPdf(listOrders)} class="dropdown-item">
                      <i class="ti ti-file-type-pdf me-1"></i>Export as PDF
                    </button>
                  </li>
                  <li>
                    <button type="button" on:click={() => exportExcel(listOrders)} class="dropdown-item">
                      <i class="ti ti-file-type-xls me-1"></i>Export as Excel
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          {/if}
          <a href="#refresh" on:click={refreshPage} class="btn btn-icon btn-outline-light shadow"
            aria-label="Refresh"><i class="ti ti-refresh"></i></a>
          <a href="#collapse-header" id="collapse-header" class="btn btn-icon btn-outline-light shadow"
            aria-label="Collapse"><i class="ti ti-transition-top"></i></a>
        </div>
      {/if}
    </div>

    <!-- Filters -->
    <OrderFilters
      {users} {companies} {allStatuses} {currentUser} {viewType} {trashBin}
      bind:userId bind:companyId bind:filterStatus bind:filterCategory
      bind:searchTerm bind:selectedFilter bind:customStartDate bind:customEndDate bind:orderBy bind:filterSource
      on:filterChange={onFilterChange}
      on:viewTypeChange={(e) => changeViewType(e.detail)}
      on:trashToggle={() => { trashBin = !trashBin; }}
    />

    <!-- Grid view -->
    {#if viewType === "grid" && filterReady}
      <OrderDragula {filterParams} {updateOrderStatus} />

    {:else}
      <!-- Bulk toolbar -->
      <OrderBulkToolbar
        {selectedOrders} {users} {listOrders} {currentUser}
        on:transferred={() => { selectedOrders = new Set(); refreshPage(); }}
        on:clearSelection={() => { selectedOrders = new Set(); }}
        on:exportPdf={() => exportPdf(getExportOrders())}
        on:exportExcel={() => exportExcel(getExportOrders())}
      />

      <!-- List table -->
      <OrderListTable
        {listOrders} {loadingData} {currentUser}
        {listCurrentPage} {listRowsPerPage} {listTotalItems} {listTotalPages}
        {selectedOrders}
        on:selectRow={(e) => toggleSelectOrder(e.detail)}
        on:selectAll={(e) => handleSelectAll(e.detail.rows)}
        on:pageChange={(e) => { listCurrentPage = e.detail; fetchListOrders(); }}
        on:rowsPerPageChange={(e) => { listRowsPerPage = e.detail; listCurrentPage = 1; fetchListOrders(); }}
        on:viewRecord={(e) => goto("/admin/order/" + e.detail)}
      />
    {/if}
  </div>
</div>

<!-- Add Order offcanvas -->
<OrderCreateForm {categories} on:created={refreshPage} />

<!-- Order Lists status modal -->
<div class="modal custom-modal fade" id="order_lists_status" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Order Lists</h5>
        <button class="btn-close custom-btn-close border p-1 me-0 text-dark" data-bs-dismiss="modal" aria-label="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="modal-body">
        <ChangeListVisiableStatus />
      </div>
    </div>
  </div>
</div>

<!-- PI/WO/TI Modal -->
<PIWOTIModal
  bind:open={piwotiModalOpen}
  type={piwotiModalType}
  order={piwotiModalOrder}
  on:close={() => (piwotiModalOpen = false)}
  on:refresh={onPIWOTIRefresh}
/>

<!-- Chat Quick Modal -->
<ChatQuickModal
  bind:open={chatModalOpen}
  order={chatModalOrder}
  preselectedTypes={chatModalPreselected}
  on:close={() => (chatModalOpen = false)}
  on:chatAdded={(e) => {
    if (chatModalOrder?.id === e.detail.orderId) {
      chatModalOrder = {
        ...chatModalOrder,
        orderChats: [...(chatModalOrder.orderChats || []), e.detail.chat],
      };
    }
  }}
/>
