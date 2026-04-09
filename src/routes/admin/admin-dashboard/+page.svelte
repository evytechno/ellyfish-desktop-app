<script>
  import { setUser } from "../../../stores/userStore";
  import { onMount } from "svelte";
  import { checkAuth } from "$lib/utils/auth";
  import SummaryCards from "$lib/components/SummaryCards.svelte";
  import OrdersByStatusChart from "$lib/components/OrdersByStatusChart.svelte";
  import OrdersOverTimeChart from "$lib/components/OrdersOverTimeChart.svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import OrdersUsersStatusBarChart from "$lib/components/OrdersUsersStatusBarChart.svelte";
  import OrdersUsersOverTimeLineChart from "$lib/components/OrdersUsersOverTimeLineChart.svelte";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { usersAllStore } from "$lib/stores/dataStores";

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
    } catch (error) {
      console.error("Fetch error:", error);
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
      console.error("No dashboard sections found!");
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
    "Follow Up",
    "Qualified",
    "Unqualified",
    "Needs Assessment",
    "Quotation Sent",
    "Negotiation In Progress",
    "Deal Won",
    "Deal Lost",
    "Dispatched",
    "Completed",
  ];
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
                      <th class="text-left align-middle"><div>Name</div></th>
                      <th class="align-middle text-center">
                        Total
                        {#if dashboardData?.userStats?.length}
                          <div class="text-[10px] text-primary">
                            [All Total - {dashboardData.userStats.reduce(
                              (sum, user) =>
                                sum +
                                user.statusBreakdown.reduce(
                                  (s, sb) => s + sb.count,
                                  0,
                                ),
                              0,
                            )}]
                          </div>
                        {/if}
                      </th>
                      {#each statuses as status}
                        <th>
                          {status}
                          {#if dashboardData?.userStats?.length}
                            <div class="text-[10px] text-primary">
                              [Total - {dashboardData.userStats.reduce(
                                (sum, user) => {
                                  const found = user.statusBreakdown.find(
                                    (s) => s.status === status,
                                  );
                                  return sum + (found ? found.count : 0);
                                },
                                0,
                              )}]
                            </div>
                          {/if}
                        </th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody class="text-center">
                    {#if dashboardData?.userStats?.length}
                      {#each dashboardData?.userStats as user}
                        {#if userId === null || userId === user.userId}
                          <tr>
                            <td class="text-left font-medium text-black"
                              >{user?.userName}</td
                            >
                            <td class="font-bold text-black">
                              {statuses.reduce((total, status) => {
                                const found = user?.statusBreakdown.find(
                                  (s) => s.status === status,
                                );
                                return total + (found ? found.count : 0);
                              }, 0)}
                            </td>
                            {#each statuses as status}
                              <td>
                                {#if user?.statusBreakdown.find((s) => s.status === status)}
                                  {#if status === "Deal Won"}
                                    <span
                                      class="font-bold text-success border-1 border-green-500 px-1 py-0.5 rounded-full"
                                    >
                                      {user.statusBreakdown.find(
                                        (s) => s.status === status,
                                      ).count}
                                    </span>
                                  {:else if status === "Qualified"}
                                    <span
                                      class="font-bold text-success border-1 border-green-500 px-1 py-0.5 rounded-full"
                                    >
                                      {user.statusBreakdown.find(
                                        (s) => s.status === status,
                                      ).count}
                                    </span>
                                  {:else}
                                    <span class="font-bold text-primary">
                                      {user.statusBreakdown.find(
                                        (s) => s.status === status,
                                      ).count}
                                    </span>
                                  {/if}
                                {:else}
                                  0
                                {/if}
                              </td>
                            {/each}
                          </tr>
                        {/if}
                      {/each}
                    {:else}
                      <tr>
                        <td colspan={statuses.length + 2} class="text-center"
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
      <div class="printDashboard">
        <div class="card flex-fill">
          <div
            class="card-header flex items-center justify-between flex-wrap row-gap-3"
          >
            <h6 class="mb-0 py-2">Orders Count by Over Time per User</h6>
          </div>
          <div class="card-body">
            {#if !loading && dashboardData}
              <OrdersUsersOverTimeLineChart
                dashboardData={dashboardData?.userStats}
                chartMetric="count"
              />
            {/if}
          </div>
          <!-- end card body -->
        </div>
        <!-- end card -->
      </div>
      <div class="printDashboard">
        <div class="card flex-fill">
          <div
            class="card-header flex items-center justify-between flex-wrap row-gap-3"
          >
            <h6 class="mb-0 py-2">Orders Count by Status per User</h6>
          </div>
          <div class="card-body">
            {#if !loading && dashboardData}
              <OrdersUsersStatusBarChart users={dashboardData?.userStats} />
            {/if}
          </div>
          <!-- end card body -->
        </div>
        <!-- end card -->
      </div>
      <div class="printDashboard">
        <div class="card flex-fill">
          <div
            class="card-header flex items-center justify-between flex-wrap row-gap-3"
          >
            <h6 class="mb-0 py-2">Orders Price by Over Time per User</h6>
          </div>
          <div class="card-body">
            {#if !loading && dashboardData}
              <OrdersUsersOverTimeLineChart
                dashboardData={dashboardData?.userStats}
                chartMetric="totalValue"
              />
            {/if}
          </div>
          <!-- end card body -->
        </div>
        <!-- end card -->
      </div>
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
