<script>
  import { setUser } from "../../../stores/userStore";
  import { onMount } from "svelte";
  import { checkAuth } from "$lib/utils/auth";
  import SummaryCards from "$lib/components/SummaryCards.svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { usersAllStore } from "$lib/stores/dataStores";
  import { orderFilterStore } from "$lib/stores/filterStore";
  import { goto } from "$app/navigation";

  import html2canvas from "html2canvas";
  import pdfMake from "pdfmake/build/pdfmake";
  import * as pdfFonts from "pdfmake/build/vfs_fonts";
  import * as XLSX from "xlsx";

  import Loader from "$lib/components/Loader.svelte";
  let loadingData = true;

  let loading;
  let users = [];
  let dashboardData = null;
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;
  let orderBy = "createdAt";
  let userId = null;
  let searchString = "";

  import { adminDashboardFilterStore } from "$lib/stores/filterStore";
  import Swal from "sweetalert2";
  import { get } from "svelte/store";
  let firstLoad = false;
  let currentUser;
  onMount(() => {
    currentUser = checkAuth();
    if (currentUser) {
      setUser(currentUser);
      if (currentUser?.role === "user") {
        loadingData = false;
        loading = false;
        Swal.fire({
          icon: "warning",
          title: "Access Denied",
          text: "You are not authorized to view this page.",
          confirmButtonText: "Go Back",
        }).then(() => {
          window.history.back();
        });
        return;
      }
    }

    getAllUsers();

    const filterState = $adminDashboardFilterStore;

    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;

    fetchOrdersStats();

    setTimeout(() => {
      firstLoad = true;
    }, 500);
  });

  const updateFilterStore = (newValues) => {
    adminDashboardFilterStore.update((currentState) => {
      return { ...currentState, ...newValues };
    });
  };

  async function fetchOrdersStats() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        search: "",
      });

      let startDateFilter;
      let endDateFilter = new Date();

      const formatDisplayDate = (date) =>
        date.toLocaleDateString("en-CA", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      searchString = "All";

      if (selectedFilter === "last7days") {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        startDateFilter = sevenDaysAgo;
        searchString = `${formatDisplayDate(sevenDaysAgo)} to ${formatDisplayDate(new Date())}`;
      } else if (selectedFilter === "last30days") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        startDateFilter = thirtyDaysAgo;
        searchString = `${formatDisplayDate(thirtyDaysAgo)} to ${formatDisplayDate(new Date())}`;
      } else if (selectedFilter === "today") {
        startDateFilter = new Date();
        startDateFilter.setHours(0, 0, 0, 0);
        endDateFilter.setHours(23, 59, 59, 999);
        searchString = "Today";
      } else if (selectedFilter === "yesterday") {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        startDateFilter = yesterday;
        startDateFilter.setHours(0, 0, 0, 0);
        endDateFilter.setHours(23, 59, 59, 999);
        searchString = "Yesterday";
      } else if (
        selectedFilter === "custom" &&
        customStartDate &&
        customEndDate
      ) {
        query.append("startDate", customStartDate);
        query.append("endDate", customEndDate);
        searchString = `${formatDisplayDate(new Date(customStartDate))} to ${formatDisplayDate(new Date(customEndDate))}`;
      }

      if (startDateFilter && selectedFilter !== "custom") {
        const formatLocalDate = (date) => date.toLocaleDateString("en-CA"); // Local YYYY-MM-DD
        query.append("startDate", formatLocalDate(startDateFilter));
        query.append("endDate", formatLocalDate(endDateFilter));
      }

      updateFilterStore({
        selectedFilter,
        customStartDate,
        customEndDate,
      });

      const data = await authApiFetch(
        `${API_ROUTES.ORDER}/user-stats?${query.toString()}`,
        {
          method: "GET",
        },
      );
      loading = false;

      dashboardData = { ...data };
      fetchCategoryStats();
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
    } finally {
      loading = false;
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  async function getAllUsers() {
    const cached = get(usersAllStore);
    if (cached && cached.length > 0) {
      users = cached;
      loadingData = false;
      return;
    }
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.USER + "/all");
      users = data;
      usersAllStore.set(data);
    } catch (err) {
      errorMessage = "Failed to load user data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  $: [selectedFilter, customStartDate, customEndDate, orderBy],
    checkFetchRecord();

  function checkFetchRecord() {
    if (firstLoad) {
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
        return;
      }
      fetchOrdersStats();
    }
  }

  async function exportDashboardToPDF() {
    const dashboardElements = document.getElementsByClassName("printDashboard");

    if (!dashboardElements.length) {
      return;
    }

    const content = [];
    content.push({ text: "Admin Dashboard Report", style: "header" });

    for (let i = 0; i < dashboardElements.length; i++) {
      const element = dashboardElements[i];

      // Ensure element is fully visible (optional, for hidden parts)
      element.scrollIntoView();

      const canvas = await html2canvas(element);
      const imgData = canvas.toDataURL("image/png");

      content.push({
        image: imgData,
        width: 500,
        margin: [0, 0, 0, 20],
      });
    }

    const docDefinition = {
      content,
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 10, 0, 10],
        },
      },
    };

    // Filename
    let fileName = "admin_dashboard";

    if (selectedFilter) {
      fileName += `_${selectedFilter}`;
    }

    if (selectedFilter === "custom" && customStartDate && customEndDate) {
      fileName += `_from_${customStartDate}_to_${customEndDate}`;
    }

    const now = new Date();
    const timestamp = now.toISOString().split("T")[0];
    fileName += `_exported_${timestamp}.pdf`;

    pdfMake.vfs = pdfFonts.vfs;
    pdfMake.createPdf(docDefinition).download(fileName);
  }

  async function exportDashboardToExcel() {
    const dashboardElements = document.getElementsByClassName(
      "generateExcelDashboard",
    );

    if (!dashboardElements.length) {
      alert("No dashboard found to export!");
      return;
    }

    const table = dashboardElements[0].querySelector("table");

    if (!table) {
      alert("No table found in the dashboard!");
      return;
    }

    const worksheet = XLSX.utils.table_to_sheet(table);

    const cols = [];
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      let maxWidth = 8;
      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cellAddress = { c: C, r: R };
        const cellRef = XLSX.utils.encode_cell(cellAddress);
        const cell = worksheet[cellRef];

        if (cell && cell.v) {
          const cellValue = cell.v.toString();
          maxWidth = Math.max(maxWidth, cellValue.length);
        }
      }
      if (maxWidth > 10) {
        maxWidth = maxWidth - 3;
      } else {
        maxWidth = maxWidth;
      }
      cols.push({ wch: maxWidth });
    }
    worksheet["!cols"] = cols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dashboard");

    let fileName = "admin_dashboard";

    let startDateFilter;
    let endDateFilter = new Date();

    const formatLocalDate = (date) => date.toISOString().split("T")[0]; // YYYY-MM-DD

    if (selectedFilter === "last7days") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      startDateFilter = sevenDaysAgo;
    } else if (selectedFilter === "last30days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      startDateFilter = thirtyDaysAgo;
    } else if (selectedFilter === "today") {
      startDateFilter = new Date();
      startDateFilter.setHours(0, 0, 0, 0);
      endDateFilter.setHours(23, 59, 59, 999);
    } else if (
      selectedFilter === "custom" &&
      customStartDate &&
      customEndDate
    ) {
      startDateFilter = new Date(customStartDate);
      endDateFilter = new Date(customEndDate);
    }

    if (startDateFilter && endDateFilter) {
      fileName += `_from_${formatLocalDate(startDateFilter)}_to_${formatLocalDate(endDateFilter)}`;
    }

    const now = new Date();
    const timestamp = now.toISOString().split("T")[0];
    fileName += `_exported_${timestamp}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  }

  const statuses = [
    "New Lead",
    "Contacted",
    "Quotation Sent",
    "Follow Up",
    "Needs Assessment",
    "Qualified",
    "Negotiation In Progress",
    "Deal Won",
    "Unqualified",
    "Deal Lost",
    "Dispatched",
    "Completed",
  ];

  const statusConfig = {
    "New Lead":                { abbr: "New Lead",    cls: "bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25" },
    "Contacted":               { abbr: "Contacted",   cls: "bg-info bg-opacity-10 text-info border border-info border-opacity-25" },
    "Follow Up":               { abbr: "FU Fast",     cls: "bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25" },
    "Qualified":               { abbr: "Qualified",   cls: "bg-success bg-opacity-10 text-success border border-success border-opacity-25" },
    "Unqualified":             { abbr: "Unqualified", cls: "bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25" },
    "Needs Assessment":        { abbr: "FU Slow",     cls: "bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25" },
    "Quotation Sent":          { abbr: "Quot. Sent",  cls: "bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25" },
    "Negotiation In Progress": { abbr: "Negotiation", cls: "bg-secondary bg-opacity-10 text-dark border border-secondary border-opacity-25" },
    "Deal Won":                { abbr: "Deal Won",    cls: "bg-success bg-opacity-10 text-success border border-success border-opacity-25" },
    "Deal Lost":               { abbr: "Deal Lost",   cls: "bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25" },
    "Dispatched":              { abbr: "Dispatched",  cls: "bg-info bg-opacity-10 text-info border border-info border-opacity-25" },
    "Completed":               { abbr: "Completed",   cls: "bg-success bg-opacity-10 text-success border border-success border-opacity-25" },
  };

  function getUserTotal(user) {
    return statuses.reduce((t, s) => {
      const found = user.statusBreakdown.find((sb) => sb.status === s);
      return t + (found ? found.count : 0);
    }, 0);
  }

  function getColumnTotal(status) {
    return (dashboardData?.userStats ?? []).reduce((sum, user) => {
      const found = user.statusBreakdown.find((sb) => sb.status === status);
      return sum + (found ? found.count : 0);
    }, 0);
  }

  $: grandTotal =
    dashboardData?.userStats?.reduce((sum, user) => sum + getUserTotal(user), 0) ?? 0;

  function navigateToOrders({ byUserId = null, status = null, category = null } = {}) {
    orderFilterStore.update((s) => ({
      ...s,
      userId: byUserId,
      filterStatus: status,
      filterCategory: category,
      selectedFilter,
      customStartDate,
      customEndDate,
    }));
    goto("/admin/order");
  }

  let categoryStats = [];

  async function fetchCategoryStats() {
    try {
      const query = new URLSearchParams();
      if (selectedFilter === "last7days") {
        const d = new Date(); d.setDate(d.getDate() - 7);
        query.append("startDate", d.toLocaleDateString("en-CA"));
        query.append("endDate", new Date().toLocaleDateString("en-CA"));
      } else if (selectedFilter === "last30days") {
        const d = new Date(); d.setDate(d.getDate() - 30);
        query.append("startDate", d.toLocaleDateString("en-CA"));
        query.append("endDate", new Date().toLocaleDateString("en-CA"));
      } else if (selectedFilter === "today") {
        query.append("startDate", new Date().toLocaleDateString("en-CA"));
        query.append("endDate", new Date().toLocaleDateString("en-CA"));
      } else if (selectedFilter === "custom" && customStartDate && customEndDate) {
        query.append("startDate", customStartDate);
        query.append("endDate", customEndDate);
      }
      const data = await authApiFetch(`${API_ROUTES.ORDER}/category-stats?${query.toString()}`, { method: "GET" });
      categoryStats = Array.isArray(data) ? data : [];
    } catch (e) {
      categoryStats = [];
    }
  }

  $: catGrandTotal = categoryStats.reduce((s, c) => s + c.total, 0);

  function getCatColumnTotal(status) {
    return categoryStats.reduce((sum, c) => {
      const f = c.statusBreakdown.find((s) => s.status === status);
      return sum + (f ? f.count : 0);
    }, 0);
  }
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <!-- Start Content -->
  <div class="content pb-0">
    <!-- Page Header -->
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-0">Admin Dashboard</h4>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <div class="dropdown">
          <a
            href="#Export"
            class="dropdown-toggle btn btn-outline-light px-2 shadow"
            data-bs-toggle="dropdown"
          >
            <i class="ti ti-package-export me-2"></i>Export
          </a>
          <div class="dropdown-menu dropdown-menu-end">
            <ul>
              <li>
                <button
                  type="button"
                  on:click={() => exportDashboardToPDF()}
                  class="dropdown-item"
                >
                  <i class="ti ti-file-type-pdf me-1"></i>Export as PDF
                </button>
                <button
                  type="button"
                  on:click={() => exportDashboardToExcel()}
                  class="dropdown-item"
                >
                  <i class="ti ti-file-type-xls me-1"></i>Export Table as Excel
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
    <!-- End Page Header -->
    {#if dashboardData}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <!-- Total Orders -->
        <div class="flex">
          <div class="card flex-fill mb-0 relative overflow-hidden">
            <div class="card-body relative z-1">
              <div class="flex items-start justify-between">
                <div>
                  <p class="fs-14 mb-1">Total Orders</p>
                  <h2 class="mb-1 fs-16">{dashboardData?.totalOrders}</h2>
                </div>
                <span
                  class="avatar avatar-md rounded-circle bg-soft-primary border border-primary"
                >
                  <i class="ti ti-building fs-16 text-primary"></i>
                </span>
              </div>
            </div>
            <img
              src="/assets/img/icons/elemnt-01.svg"
              alt="element-01"
              class="img-fluid position-absolute top-0 Start-0"
            />
          </div>
        </div>

        <!-- Total Users -->
        <div class="flex">
          <div class="card flex-fill mb-0 relative overflow-hidden">
            <div class="card-body relative z-1">
              <div class="flex items-start justify-between">
                <div>
                  <p class="fs-14 mb-1">Total Users</p>
                  <h2 class="mb-1 fs-16">{dashboardData?.totalUsers}</h2>
                </div>
                <span
                  class="avatar avatar-md rounded-circle bg-soft-success border border-success"
                >
                  <i class="ti ti-carousel-vertical fs-16 text-success"></i>
                </span>
              </div>
            </div>
            <img
              src="/assets/img/icons/elemnt-02.svg"
              alt="element-02"
              class="img-fluid position-absolute top-0 Start-0"
            />
          </div>
        </div>
      </div>
    {/if}

    <!-- start row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="col-span-2 generateExcelDashboard">
        <div class="card flex-fill">
          <div
            class="card-header flex items-center justify-between flex-wrap row-gap-3"
          >
            <h6 class="mb-0 py-2">
              Users Inquiry Count
              <span class="text-xs font-normal">
                {searchString ? `(${searchString})` : ""}
              </span>
            </h6>

            <div class="flex items-center gap-2 flex-wrap">
              <div class="flex items-center gap-2 flex-wrap">
                <select bind:value={orderBy} class="form-select">
                  <option value="createdAt">Created At</option>
                  <option value="orderDate">Inquiry Date</option>
                </select>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <select bind:value={selectedFilter} class="form-select">
                  <option value="all">All</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last7days">Last 7 Days</option>
                  <option value="last30days">Last 30 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {#if selectedFilter === "custom"}
                <div class="flex items-center gap-2">
                  <input
                    type="date"
                    bind:value={customStartDate}
                    class="form-control"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="date"
                    bind:value={customEndDate}
                    class="form-control"
                  />
                </div>
              {/if}
              <div class="flex items-center gap-2 flex-wrap">
                <select bind:value={userId} class="form-select">
                  <option value={null}>Select User</option>
                  {#each users as user}
                    <option value={user?.id}>{user?.name}</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>
          <div class="card-body">
            <div class="table-responsive custom-table">
              <div class="dataTables_wrapper dt-bootstrap5 no-footer">
                <table class="table dataTable table-nowrap no-footer">
                  <thead class="table-light text-center">
                    <tr>
                      <th class="text-left align-middle" style="position:sticky;left:0;z-index:2;background:#f8f9fa;">
                        Name
                      </th>
                      <th class="align-middle text-center">
                        Total
                        {#if grandTotal > 0}
                          <div class="mt-1">
                            <span
                              class="badge bg-primary rounded-pill dash-link"
                              style="font-size:10px;"
                              title="View all orders"
                              on:click={() => navigateToOrders()}
                            >{grandTotal}</span>
                          </div>
                        {/if}
                      </th>
                      {#each statuses as status}
                        {@const cfg = statusConfig[status]}
                        {@const colTotal = getColumnTotal(status)}
                        <th class="align-middle text-center" title={status}>
                          <div>{cfg.abbr}</div>
                          {#if colTotal > 0}
                            <div class="mt-1">
                              <span
                                class="badge rounded-pill fw-semibold dash-link {cfg.cls}"
                                style="font-size:10px;"
                                title="View all {status} orders"
                                on:click={() => navigateToOrders({ status })}
                              >{colTotal}</span>
                            </div>
                          {:else}
                            <div class="text-muted mt-1" style="font-size:10px;">—</div>
                          {/if}
                        </th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody class="text-center">
                    {#if dashboardData?.userStats?.length}
                      {#each dashboardData?.userStats as user}
                        {#if userId === null || userId === user.userId}
                          {@const uTotal = getUserTotal(user)}
                          {@const barPct = grandTotal > 0 ? Math.round((uTotal / grandTotal) * 100) : 0}
                          <tr>
                            <td class="text-left font-medium" style="position:sticky;left:0;z-index:1;background:#fff;">
                              <span
                                class="text-primary fw-semibold dash-link"
                                title="View {user?.userName}'s orders"
                                on:click={() => navigateToOrders({ byUserId: user.userId })}
                              >{user?.userName}</span>
                            </td>
                            <td class="font-bold text-black">
                              <span
                                class="dash-count"
                                title="View all {user?.userName}'s orders"
                                on:click={() => navigateToOrders({ byUserId: user.userId })}
                              >{uTotal}</span>
                              <div class="progress mt-1" style="height:3px;">
                                <div class="progress-bar bg-primary" role="progressbar" style="width:{barPct}%;"></div>
                              </div>
                            </td>
                            {#each statuses as status}
                              {@const cfg = statusConfig[status]}
                              {@const found = user?.statusBreakdown.find((s) => s.status === status)}
                              {@const count = found ? found.count : 0}
                              <td>
                                {#if count > 0}
                                  <span
                                    class="badge rounded-pill fw-semibold dash-link {cfg.cls}"
                                    title="View {user?.userName}'s {status} orders"
                                    on:click={() => navigateToOrders({ byUserId: user.userId, status })}
                                  >{count}</span>
                                {:else}
                                  <span class="text-muted">—</span>
                                {/if}
                              </td>
                            {/each}
                          </tr>
                        {/if}
                      {/each}
                      <!-- Grand total row -->
                      <tr class="table-light fw-bold">
                        <td class="text-left" style="position:sticky;left:0;z-index:1;background:#f8f9fa;">
                          Grand Total
                        </td>
                        <td>
                          <span
                            class="dash-count"
                            title="View all orders"
                            on:click={() => navigateToOrders()}
                          >{grandTotal}</span>
                        </td>
                        {#each statuses as status}
                          {@const cfg = statusConfig[status]}
                          {@const colTotal = getColumnTotal(status)}
                          <td>
                            {#if colTotal > 0}
                              <span
                                class="badge rounded-pill fw-bold dash-link {cfg.cls}"
                                title="View all {status} orders"
                                on:click={() => navigateToOrders({ status })}
                              >{colTotal}</span>
                            {:else}
                              <span class="text-muted">—</span>
                            {/if}
                          </td>
                        {/each}
                      </tr>
                    {:else}
                      <tr>
                        <td colspan={statuses.length + 2} class="text-center">No Records Found.</td>
                      </tr>
                    {/if}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <!-- end card body -->
        </div>
        <!-- end card -->
      </div>
      <!-- Category Inquiry Count -->
      <div class="col-span-2">
        <div class="card flex-fill">
          <div class="card-header flex items-center justify-between flex-wrap row-gap-3">
            <h6 class="mb-0 py-2">
              Category Inquiry Count
              <span class="text-xs font-normal">
                {searchString ? `(${searchString})` : ""}
              </span>
            </h6>
          </div>
          <div class="card-body">
            <div class="table-responsive custom-table">
              <div class="dataTables_wrapper dt-bootstrap5 no-footer">
                <table class="table dataTable table-nowrap no-footer">
                  <thead class="table-light text-center">
                    <tr>
                      <th class="text-left align-middle" style="position:sticky;left:0;z-index:2;background:#f8f9fa;">
                        Category
                      </th>
                      <th class="align-middle text-center">
                        Total
                        {#if catGrandTotal > 0}
                          <div class="mt-1">
                            <span
                              class="badge bg-primary rounded-pill dash-link"
                              style="font-size:10px;"
                              title="View all orders"
                              on:click={() => navigateToOrders()}
                            >{catGrandTotal}</span>
                          </div>
                        {/if}
                      </th>
                      {#each statuses as status}
                        {@const cfg = statusConfig[status]}
                        {@const colTotal = getCatColumnTotal(status)}
                        <th class="align-middle text-center" title={status}>
                          <div>{cfg.abbr}</div>
                          {#if colTotal > 0}
                            <div class="mt-1">
                              <span
                                class="badge rounded-pill fw-semibold dash-link {cfg.cls}"
                                style="font-size:10px;"
                                title="View all {status} orders"
                                on:click={() => navigateToOrders({ status })}
                              >{colTotal}</span>
                            </div>
                          {:else}
                            <div class="text-muted mt-1" style="font-size:10px;">—</div>
                          {/if}
                        </th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody class="text-center">
                    {#if categoryStats.length}
                      {#each categoryStats as cat}
                        {@const barPct = catGrandTotal > 0 ? Math.round((cat.total / catGrandTotal) * 100) : 0}
                        <tr>
                          <td class="text-left font-medium" style="position:sticky;left:0;z-index:1;background:#fff;">
                            <span
                              class="text-primary fw-semibold dash-link"
                              title="View {cat.category} orders"
                              on:click={() => navigateToOrders({ category: cat.category })}
                            >{cat.category}</span>
                          </td>
                          <td class="font-bold text-black">
                            <span
                              class="dash-count"
                              title="View all {cat.category} orders"
                              on:click={() => navigateToOrders({ category: cat.category })}
                            >{cat.total}</span>
                            <div class="progress mt-1" style="height:3px;">
                              <div class="progress-bar bg-primary" role="progressbar" style="width:{barPct}%;"></div>
                            </div>
                          </td>
                          {#each statuses as status}
                            {@const cfg = statusConfig[status]}
                            {@const found = cat.statusBreakdown.find((s) => s.status === status)}
                            {@const count = found ? found.count : 0}
                            <td>
                              {#if count > 0}
                                <span
                                  class="badge rounded-pill fw-semibold dash-link {cfg.cls}"
                                  title="View {cat.category} {status} orders"
                                  on:click={() => navigateToOrders({ category: cat.category, status })}
                                >{count}</span>
                              {:else}
                                <span class="text-muted">—</span>
                              {/if}
                            </td>
                          {/each}
                        </tr>
                      {/each}
                      <!-- Grand total row -->
                      <tr class="table-light fw-bold">
                        <td class="text-left" style="position:sticky;left:0;z-index:1;background:#f8f9fa;">
                          Grand Total
                        </td>
                        <td>
                          <span
                            class="dash-count"
                            title="View all orders"
                            on:click={() => navigateToOrders()}
                          >{catGrandTotal}</span>
                        </td>
                        {#each statuses as status}
                          {@const cfg = statusConfig[status]}
                          {@const colTotal = getCatColumnTotal(status)}
                          <td>
                            {#if colTotal > 0}
                              <span
                                class="badge rounded-pill fw-bold dash-link {cfg.cls}"
                                title="View all {status} orders"
                                on:click={() => navigateToOrders({ status })}
                              >{colTotal}</span>
                            {:else}
                              <span class="text-muted">—</span>
                            {/if}
                          </td>
                        {/each}
                      </tr>
                    {:else}
                      <tr>
                        <td colspan={statuses.length + 2} class="text-center">No Records Found.</td>
                      </tr>
                    {/if}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- end category stats -->

      <!-- <div class="col-span-2">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div><h6 class="mb-0">All Stats</h6></div>
          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center gap-2 flex-wrap">
              <select bind:value={orderBy} class="form-select">
                <option value="createdAt">Created At</option>
                <option value="orderDate">Inquiry Date</option>
              </select>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <select bind:value={selectedFilter} class="form-select">
                <option value="all">All</option>
                <option value="today">Today</option>
                <option value="last7days">Last 7 Days</option>
                <option value="last30days">Last 30 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            {#if selectedFilter === "custom"}
              <div class="flex items-center gap-2">
                <input
                  type="date"
                  bind:value={customStartDate}
                  class="form-control"
                />
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="date"
                  bind:value={customEndDate}
                  class="form-control"
                />
              </div>
            {/if}
            <div class="dropdown">
              <a
                href="#Export"
                class="dropdown-toggle btn btn-outline-light px-2 shadow"
                data-bs-toggle="dropdown"
              >
                <i class="ti ti-package-export me-2"></i>Export
              </a>
              <div class="dropdown-menu dropdown-menu-end">
                <ul>
                  <li>
                    <button
                      type="button"
                      on:click={() => exportDashboardToPDF()}
                      class="dropdown-item"
                    >
                      <i class="ti ti-file-type-pdf me-1"></i>Export as PDF
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div> -->
      <div>
        <div class="card flex-fill">
          <div
            class="card-header flex items-center justify-between flex-wrap row-gap-3"
          >
            <h6 class="mb-0 py-2">Users</h6>
          </div>
          <div class="card-body">
            <div class="table-responsive custom-table">
              <div class="dataTables_wrapper dt-bootstrap5 no-footer">
                <table class="table dataTable table-nowrap no-footer">
                  <thead class="table-light text-center">
                    <tr>
                      <th class="text-left">Name</th>
                      <th>Total Orders</th>
                      <th>Active Deals</th>
                      <th>
                        Avg Orders
                        <div style="font-size: 10px;">(Per Day)</div>
                      </th>
                      <th>
                        Completion
                        <div style="font-size: 10px;">Rate (%)</div>
                      </th>
                      <th>
                        Success
                        <div style="font-size: 10px;">Rate (%)</div>
                      </th>
                      <th>
                        Failure
                        <div style="font-size: 10px;">Rate (%)</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody class=" text-center">
                    {#if dashboardData?.userStats?.length}
                      {#each dashboardData?.userStats as user}
                        <tr>
                          <td class="text-left font-medium text-black"
                            >{user?.userName}</td
                          >
                          <td>{user?.totalOrders}</td>
                          <td>{user?.activeDeals}</td>
                          <td>{user?.avgOrdersPerDay}</td>
                          <td>{user?.completionRate}%</td>
                          <td>{user?.successRate}%</td>
                          <td>{user?.failureRate}%</td>
                        </tr>
                      {/each}
                    {:else}
                      <tr>
                        <td colspan="4" class="text-center"
                          >No Records Found.
                        </td>
                      </tr>
                    {/if}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <!-- end card body -->
        </div>
        <!-- end card -->
      </div>
      <!-- end col -->
    </div>
    <!-- end row -->
  </div>
  <!-- End Content -->
</div>

<style>
  :global(.dash-link) {
    background-color: transparent;
    cursor: pointer;
    display: inline-block;
    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease, opacity 0.15s ease;
  }
  :global(.dash-link:hover) {
    background-color: transparent;
    transform: translateY(-1px) scale(1.06);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
    filter: brightness(1.06);
    opacity: 0.92;
  }
  :global(.dash-link:active) {
    transform: translateY(0) scale(0.97);
    box-shadow: none;
    filter: brightness(0.95);
  }
  :global(span.text-primary.dash-link:hover) {
    text-decoration: none;
    text-underline-offset: 2px;
  }
  :global(.dash-count) {
    cursor: pointer;
    display: inline-block;
    transition: color 0.15s ease, transform 0.15s ease;
    font-weight: 600;
  }
  :global(.dash-count:hover) {
    color: #0d6efd !important;
    transform: scale(1.1);
    text-decoration: none;
    text-underline-offset: 2px;
  }
  :global(.dash-count:active) {
    transform: scale(0.95);
  }
</style>
