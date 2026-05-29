<script>
  import { setUser } from "../../../stores/userStore";
  import { onMount } from "svelte";
  import { checkAuth } from "$lib/utils/auth";
  import SummaryCards from "$lib/components/SummaryCards.svelte";
  import OrdersByStatusChart from "$lib/components/OrdersByStatusChart.svelte";
  import OrdersOverTimeChart from "$lib/components/OrdersOverTimeChart.svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { usersAllStore } from "$lib/stores/dataStores";
  import html2canvas from "html2canvas";
  import pdfMake from "pdfmake/build/pdfmake";
  import * as pdfFonts from "pdfmake/build/vfs_fonts";

  import Loader from "$lib/components/Loader.svelte";
  import QueryHighlights from "$lib/components/QueryHighlights.svelte";
  let loadingData = true;

  let highlights = { telecallers: [], techs: [], techHelpers: [], overdueQueries: [] };
  let highlightsLoading = false;

  async function loadHighlights() {
    highlightsLoading = true;
    try {
      highlights = await authApiFetch(`${API_ROUTES.QUERY}/highlights`);
    } catch (_) {}
    finally { highlightsLoading = false; }
  }

  let currentUser;
  let techStats = {
    open: 0,
    inProgress: 0,
    resolvedToday: 0,
    totalResolved: 0,
  };
  let techQueries = [];

  async function loadTechDashboard() {
    loadingData = true;
    try {
      const [stats, assigned] = await Promise.all([
        authApiFetch(`${API_ROUTES.QUERY}/stats`),
        authApiFetch(`${API_ROUTES.QUERY}/assigned?page=1&limit=8`),
      ]);
      techStats = stats;
      techQueries = assigned.data ?? [];
    } catch (_) {
    } finally {
      loadingData = false;
    }
  }

  onMount(() => {
    currentUser = checkAuth();
    if (currentUser) {
      setUser(currentUser);
    }
  });
  let errorMessage = "";

  let loading;
  let orders = [];
  let activities = [];
  let users = [];
  let dashboardData = null;
  let userId = null;
  let searchTerm = "";
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;
  let searchString = "";

  import { dashboardFilterStore } from "$lib/stores/filterStore";
  import { get } from "svelte/store";
  import UpdateNotification from "../../../lib/components/UpdateNotification.svelte";
  let firstLoad = false;
  onMount(() => {
    const filterState = $dashboardFilterStore;

    userId = filterState.userId || null;
    searchTerm = filterState.searchTerm || "";
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;

    if (currentUser?.subRole === "tech" || currentUser?.subRole === "tech_helper") {
      loadTechDashboard();
      if (currentUser?.orderAccess) {
        fetchOrders();
        fetchActivity();
        fetchOrdersStats();
      }
    } else {
      fetchOrders(), fetchActivity(), fetchOrdersStats();
    }

    if (currentUser?.role === "master") {
      loadHighlights();
    }

    setTimeout(() => {
      firstLoad = true;
    }, 500);
  });

  const updateFilterStore = (newValues) => {
    dashboardFilterStore.update((currentState) => {
      return { ...currentState, ...newValues };
    });
  };

  async function fetchOrdersStats() {
    loadingData = true;
    try {
      loading = true;
      const query = new URLSearchParams({
        search: searchTerm || "",
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

      if (userId) {
        query.append("byUserId", userId);
      }

      updateFilterStore({
        userId,
        searchTerm,
        selectedFilter,
        customStartDate,
        customEndDate,
      });

      const data = await authApiFetch(
        `${API_ROUTES.ORDER}/stats?${query.toString()}`,
        {
          method: "GET",
        },
      );
      loading = false;

      dashboardData = { ...data };
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

  async function fetchOrders() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        search: searchTerm || "",
        limit: 7,
      });

      let startDateFilter;
      let endDateFilter = new Date();

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
        query.append("startDate", customStartDate);
        query.append("endDate", customEndDate);
      }

      if (startDateFilter && selectedFilter !== "custom") {
        const formatLocalDate = (date) => date.toLocaleDateString("en-CA"); // Local YYYY-MM-DD
        query.append("startDate", formatLocalDate(startDateFilter));
        query.append("endDate", formatLocalDate(endDateFilter));
      }

      if (userId) {
        query.append("byUserId", userId);
      }

      const data = await authApiFetch(
        `${API_ROUTES.ORDER}?${query.toString()}`,
        {
          method: "GET",
        },
      );
      let newData = data
        ? data?.data.filter((order) => order.deletedAt == null)
        : [];
      orders = [...newData];
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

  async function fetchActivity() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        search: searchTerm || "",
        limit: 7,
        page: 1,
      });

      let startDateFilter;
      let endDateFilter = new Date();

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
        query.append("startDate", customStartDate);
        query.append("endDate", customEndDate);
      }

      if (startDateFilter && selectedFilter !== "custom") {
        const formatLocalDate = (date) => date.toLocaleDateString("en-CA"); // Local YYYY-MM-DD
        query.append("startDate", formatLocalDate(startDateFilter));
        query.append("endDate", formatLocalDate(endDateFilter));
      }

      if (userId) {
        query.append("byUserId", userId);
      }

      const data = await authApiFetch(
        `${API_ROUTES.ORDER_ACTIVITY}?${query.toString()}`,
        {
          method: "GET",
        },
      );

      activities = [...data.data];
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

  onMount(async () => {
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
  });

  $: [searchTerm, selectedFilter, customStartDate, customEndDate, userId],
    checkFetchRecord();

  function checkFetchRecord() {
    if (
      firstLoad &&
      ((currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper") || currentUser?.orderAccess)
    ) {
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
        return;
      }
      fetchOrders(), fetchActivity(), fetchOrdersStats();
    }
  }

  let statusesColors = {
    "New Lead": "bg-blue",
    Contacted: "bg-purple",
    "Follow Up": "bg-yellow",
    Qualified: "bg-[#2ecc71]",
    Unqualified: "bg-[#e74c3c]",
    "Needs Assessment": "bg-orange",
    "Quotation Sent": "bg-teal",
    "Negotiation In Progress": "bg-[#FFBF00]",
    "Deal Won": "bg-green",
    "Deal Lost": "bg-red",
    Dispatched: "bg-gray",
    Completed: "bg-green",
  };

  async function exportDashboardToPDF() {
    const dashboardElements = document.getElementsByClassName("printDashboard");

    if (!dashboardElements.length) {
      console.error("No dashboard sections found!");
      return;
    }

    const content = [];
    content.push({ text: "Dashboard Report", style: "header" });

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
    let fileName = "dashboard";

    if (searchTerm) {
      fileName += `_search_${searchTerm.replace(/\s+/g, "_")}`;
    }

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
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <div class="content pb-0">
    {#if currentUser?.subRole === "tech" || currentUser?.subRole === "tech_helper"}
      <!-- ── Tech / Tech Helper Dashboard ── -->
      <div>
        <div
          class="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2"
        >
          <div>
            <h4 class="fw-bold mb-1">My Dashboard</h4>
            <p class="text-muted mb-0 small">
              Welcome back! Here's your query overview.
            </p>
          </div>
          
        </div>

        <!-- Stats -->
        <div class="row g-3 mb-4">
          <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm text-center py-4">
              <div class="fs-2 fw-bold text-primary">{techStats.open}</div>
              <div class="text-muted small mt-1">
                {currentUser?.subRole === "tech_helper" ? "Open Sub-Queries" : "Open Queries"}
              </div>
              <a
                href={currentUser?.subRole === "tech_helper" ? "/admin/query/sub-queue" : "/admin/query/open"}
                class="stretched-link"
              ></a>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm text-center py-4">
              <div class="fs-2 fw-bold text-warning">
                {techStats.inProgress}
              </div>
              <div class="text-muted small mt-1">
                {currentUser?.subRole === "tech_helper" ? "In Progress (sub-queries)" : "In Progress (mine)"}
              </div>
              <a href="/admin/query/assigned" class="stretched-link"></a>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm text-center py-4">
              <div class="fs-2 fw-bold text-success">
                {techStats.resolvedToday}
              </div>
              <div class="text-muted small mt-1">
                {currentUser?.subRole === "tech_helper" ? "Sub-Queries Resolved Today" : "Resolved Today"}
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm text-center py-4">
              <div class="fs-2 fw-bold text-secondary">
                {techStats.totalResolved}
              </div>
              <div class="text-muted small mt-1">
                {currentUser?.subRole === "tech_helper" ? "Total Sub-Queries Resolved" : "Total Resolved"}
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="row g-3 mb-4">
          <div class="col-md-6">
            <a
              href={currentUser?.subRole === "tech_helper" ? "/admin/query/sub-queue" : "/admin/query/open"}
              class="card border-0 shadow-sm p-3 d-flex flex-row align-items-center gap-3 text-decoration-none"
            >
              <div class="rounded-circle bg-primary bg-opacity-10 p-3">
                <i class="ti ti-inbox fs-4 text-primary"></i>
              </div>
              <div>
                <div class="fw-semibold">Open Queue</div>
                <div class="text-muted small">Pick up unassigned queries</div>
              </div>
              <i class="ti ti-chevron-right ms-auto text-muted"></i>
            </a>
          </div>
          <div class="col-md-6">
            <a
              href="/admin/query/assigned"
              class="card border-0 shadow-sm p-3 d-flex flex-row align-items-center gap-3 text-decoration-none"
            >
              <div class="rounded-circle bg-warning bg-opacity-10 p-3">
                <i class="ti ti-clipboard-list fs-4 text-warning"></i>
              </div>
              <div>
                <div class="fw-semibold">My Assigned</div>
                <div class="text-muted small">
                  Continue working on your queries
                </div>
              </div>
              <i class="ti ti-chevron-right ms-auto text-muted"></i>
            </a>
          </div>
        </div>
      </div>
    {/if}
    {#if (currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper") || currentUser?.orderAccess}
      <div>
        <!-- ── Order Dashboard ── -->
        <!-- Page Header -->
        <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div>
            <h4 class="mb-0">
              Dashboard
              <span class="text-xs font-normal">
                {searchString ? `(${searchString})` : ""}
              </span>
            </h4>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center gap-2 flex-wrap">
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
            </div>

            {#if currentUser?.role != "user"}
              <div class="flex items-center gap-2 flex-wrap">
                <select bind:value={userId} class="form-select">
                  <option value={null}>Select User</option>
                  {#each users as user}
                    <option value={user?.id}>{user?.name}</option>
                  {/each}
                </select>
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
        <!-- End Page Header -->
        {#if dashboardData}
          <SummaryCards {dashboardData} />
        {/if}

        {#if currentUser?.role === "master"}
          {#if (highlights.overdueQueries?.length ?? 0) > 0}
            {@const overdueCount = highlights.overdueQueries.length}
            {@const criticalCount = highlights.overdueQueries.filter(q => q.waitingMins >= 30).length}
            <div
              class="d-flex align-items-center justify-content-between flex-wrap gap-2 px-3 py-2 mb-3 rounded"
              style="background:{criticalCount > 0 ? '#fff5f5' : '#fff9f0'}; border:1.5px solid {criticalCount > 0 ? '#ffa8a8' : '#ffcc88'};"
              role="alert"
            >
              <div class="d-flex align-items-center gap-2">
                <i class="ti ti-alert-triangle fs-5" style="color:{criticalCount > 0 ? '#c92a2a' : '#d9480f'};"></i>
                <span class="fw-semibold" style="font-size:0.9rem; color:{criticalCount > 0 ? '#c92a2a' : '#d9480f'};">
                  {overdueCount} {overdueCount === 1 ? 'query' : 'queries'} waiting &gt; 5 min without being picked up
                  {#if criticalCount > 0}
                    &nbsp;·&nbsp; {criticalCount} critical (&gt;30 min)
                  {/if}
                </span>
              </div>
              <div class="d-flex gap-2">
                <a href="/admin/query/open" class="btn btn-sm" style="font-size:0.78rem; background:{criticalCount > 0 ? '#c92a2a' : '#d9480f'}; color:#fff; border:none;">
                  <i class="ti ti-inbox me-1"></i>Open Queue
                </a>
                <a href="/admin/query/sub-queue" class="btn btn-sm btn-outline-secondary" style="font-size:0.78rem;">
                  <i class="ti ti-subtask me-1"></i>Sub Queue
                </a>
              </div>
            </div>
          {/if}
          <QueryHighlights {highlights} loading={highlightsLoading} />
        {/if}

        <!-- start row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="printDashboard">
            <div class="card flex-fill">
              <div
                class="card-header flex items-center justify-between flex-wrap row-gap-3"
              >
                <h6 class="mb-0 py-2">Orders Over Time</h6>
              </div>
              <div class="card-body">
                {#if !loading && dashboardData}
                  <OrdersOverTimeChart {dashboardData} />
                {/if}
              </div>
            </div>
          </div>
          <div class="printDashboard">
            <div class="card flex-fill">
              <div
                class="card-header flex items-center justify-between flex-wrap row-gap-3"
              >
                <h6 class="mb-0 py-2">Orders By Status</h6>
              </div>
              <div class="card-body">
                {#if !loading && dashboardData}
                  <OrdersByStatusChart {dashboardData} />
                {/if}
              </div>
            </div>
          </div>
        </div>
        <!-- end row -->
      </div>
    {/if}
  </div>
</div>
