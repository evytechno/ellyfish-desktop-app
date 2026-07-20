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
  import { missedReminderCount } from "$lib/stores/reminderStore";
  let loadingData = true;

  let todayReminders = [];
  async function fetchTodayReminders() {
    try {
      const data = await authApiFetch(`${API_ROUTES.ORDER_REMINDER}/today`, { method: "GET" });
      todayReminders = Array.isArray(data) ? data : (data?.data ?? []);
    } catch (_) {}
  }

  let upcomingVisits = [];
  async function fetchUpcomingVisits() {
    try {
      const data = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/upcoming?days=30`, { method: "GET" });
      upcomingVisits = Array.isArray(data) ? data : (data?.data ?? []);
    } catch (_) {}
  }

  async function dismissTodayReminder(id) {
    todayReminders = todayReminders.filter((r) => r.id !== id);
    try {
      await authApiFetch(`${API_ROUTES.ORDER_REMINDER}/${id}`, { method: "DELETE" });
    } catch (_) {
      // silently ignore — UI already updated optimistically
    }
  }

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
    try {
      const [stats, assigned] = await Promise.all([
        authApiFetch(`${API_ROUTES.QUERY}/stats`),
        authApiFetch(`${API_ROUTES.QUERY}/assigned?page=1&limit=8`),
      ]);
      techStats = stats;
      techQueries = assigned.data ?? [];
    } catch (_) {}
  }

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

  onMount(async () => {
    // ── 1. Auth + filter state (sync, no network) ──────────────────────────
    currentUser = checkAuth();
    if (currentUser) setUser(currentUser);

    const filterState = $dashboardFilterStore;
    userId         = filterState.userId         || null;
    searchTerm     = filterState.searchTerm     || "";
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate   = filterState.customEndDate   || null;

    // ── 2. Users dropdown — use store cache if available ───────────────────
    const cachedUsers = get(usersAllStore);
    const usersPromise = cachedUsers?.length > 0
      ? Promise.resolve(cachedUsers)
      : authApiFetch(API_ROUTES.USER + "/all").then(data => {
          usersAllStore.set(data);
          return data;
        }).catch(() => []);

    // ── 3. Fire all data calls in parallel ────────────────────────────────
    loadingData = true;
    try {
      const isTech = currentUser?.subRole === "tech" || currentUser?.subRole === "tech_helper";
      const hasOrderAccess = currentUser?.orderAccess;
      const isMaster = currentUser?.role === "master";

      const calls = [];

      if (isTech) {
        calls.push(loadTechDashboard());
        if (hasOrderAccess) {
          calls.push(fetchOrders(), fetchActivity(), fetchOrdersStats());
        }
      } else {
        calls.push(fetchOrders(), fetchActivity(), fetchOrdersStats());
      }

      if (isMaster) calls.push(loadHighlights());
      calls.push(fetchTodayReminders());
      calls.push(fetchUpcomingVisits());
      calls.push(usersPromise.then(data => { users = data; }));

      await Promise.all(calls);
    } catch (_) {
    } finally {
      loadingData = false;
      setTimeout(() => { firstLoad = true; }, 500);
    }
  });

  const updateFilterStore = (newValues) => {
    dashboardFilterStore.update((currentState) => {
      return { ...currentState, ...newValues };
    });
  };

  async function fetchOrdersStats() {
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
      errorHandle(error);
    } finally {
      loading = false;
    }
  }

  async function fetchOrders() {
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
      errorHandle(error);
    }
  }

  async function fetchActivity() {
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
      errorHandle(error);
    }
  }


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
      loadingData = true;
      Promise.all([fetchOrders(), fetchActivity(), fetchOrdersStats()])
        .finally(() => { loadingData = false; });
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

    <!-- ── Missed reminder banner ── -->
    {#if $missedReminderCount > 0}
      <div class="alert alert-warning d-flex align-items-center gap-2 mb-3 py-2 px-3" style="border-left:4px solid #fd7e14;">
        <i class="ti ti-clock fs-18" style="color:#fd7e14;"></i>
        <span class="fw-semibold">You have {$missedReminderCount} unread order reminder{$missedReminderCount > 1 ? 's' : ''}</span>
        <a href="/admin/notifications?read=false&type=OrderReminder" class="ms-auto btn btn-sm btn-outline-warning py-0">View</a>
      </div>
    {/if}

    <!-- ── Upcoming Visits Widget ── -->
    {#if upcomingVisits.length > 0}
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-header d-flex align-items-center gap-2 py-2" style="background:#f0f7ff;border-bottom:2px solid #1971c2;">
          <i class="ti ti-map-pin fs-18" style="color:#1971c2;"></i>
          <h6 class="mb-0 fw-semibold">Upcoming Visits ({upcomingVisits.length})</h6>
          <a href="/admin/client-visit" class="ms-auto btn btn-sm btn-outline-primary py-0">View All</a>
        </div>
        <div class="card-body p-0">
          {#each upcomingVisits as v}
            <div class="d-flex align-items-center gap-3 px-3 py-2 border-bottom">
              <span class="badge bg-primary flex-shrink-0" style="font-size:11px;min-width:70px;text-align:center;">
                {new Date(v.visitDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}
              </span>
              <span class="badge bg-light text-dark border flex-shrink-0" style="font-size:10px;">
                {v.visitType === 'outgoing' ? 'We Visit' : v.visitType === 'incoming' ? 'They Come' : v.visitType === 'joint' ? 'Joint' : v.visitType}
              </span>
              <a href="/admin/client-visit/{v.id}" class="flex-grow-1 text-dark fw-medium fs-13 text-decoration-none text-truncate">
                {v.client?.name ?? '—'}
                {#if v.purpose} — <span class="text-muted fw-normal">{v.purpose}</span>{/if}
              </a>
              {#if v.attendees?.length}
                <span class="text-muted fs-12 flex-shrink-0 d-none d-md-inline">
                  <i class="ti ti-users me-1"></i>{currentUser?.role === 'user'
                    ? v.attendees.map(a => a.user?.name === currentUser?.name ? currentUser.name : 'Team Member').join(', ')
                    : v.attendees.map(a => a.user?.name ?? '').filter(Boolean).join(', ')}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ── Due Today Widget ── -->
    {#if todayReminders.length > 0}
      <div class="card mb-3 border-0 shadow-sm">
        <div class="card-header d-flex align-items-center gap-2 py-2" style="background:#fff8f0;border-bottom:2px solid #fd7e14;">
          <i class="ti ti-clock-hour-4 fs-18" style="color:#fd7e14;"></i>
          <h6 class="mb-0 fw-semibold">Due Today ({todayReminders.length})</h6>
        </div>
        <div class="card-body p-0">
          {#each todayReminders as r}
            <div class="d-flex align-items-center gap-3 px-3 py-2 border-bottom">
              <span class="badge bg-warning text-dark flex-shrink-0" style="font-size:11px;min-width:54px;text-align:center;">
                {new Date(r.reminderTime).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}
              </span>
              <a href="/admin/order/{r.order?.id}" class="flex-grow-1 text-dark fw-medium fs-13 text-decoration-none text-truncate">
                {r.message || "Reminder"}
              </a>
              {#if r.order}
                <span class="text-muted fs-12 flex-shrink-0 d-none d-md-inline">#{r.order.pId ?? r.order.id} – {r.order.title ?? ""}</span>
              {/if}
              <button
                class="btn btn-sm btn-light flex-shrink-0 p-0"
                style="width:26px;height:26px;line-height:1;border-radius:50%;"
                title="Dismiss reminder"
                on:click={() => dismissTodayReminder(r.id)}
              >&#x2715;</button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

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
