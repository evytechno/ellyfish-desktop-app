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
  let visitsLoading = false;
  async function fetchUpcomingVisits() {
    visitsLoading = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/upcoming?days=30`, { method: "GET" });
      upcomingVisits = Array.isArray(data) ? data : (data?.data ?? []);
    } catch (_) {
      upcomingVisits = [];
    } finally {
      visitsLoading = false;
    }
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

  function normalizeUserId(value) {
    // Persisted filter values can be the literal string "null"
    // (e.g. from a persisted `<option value={null}>`), so coerce safely.
    if (value === null || value === undefined) return null;
    if (value === "" || value === "null") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  let normalizedUserId = null;
  $: normalizedUserId = normalizeUserId(userId);

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
    userId         = filterState.userId ?? null;
    searchTerm     = filterState.searchTerm     || "";
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate   = filterState.customEndDate   || null;
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
      selectedFilter = "last7days";
      customStartDate = null;
      customEndDate = null;
    }

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

      if (normalizedUserId != null) {
        query.append("byUserId", normalizedUserId);
      }

      updateFilterStore({
        userId: normalizedUserId,
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

      if (normalizedUserId != null) {
        query.append("byUserId", normalizedUserId);
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

      if (normalizedUserId != null) {
        query.append("byUserId", normalizedUserId);
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


  $: [searchTerm, selectedFilter, customStartDate, customEndDate, normalizedUserId],
    checkFetchRecord();

  function checkFetchRecord() {
    if (
      firstLoad &&
      ((currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper") || currentUser?.orderAccess)
    ) {
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
        loadingData = false;
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
<div class="page-wrapper dash-page">
  <div class="content dash-layout pb-0">

    <div class="dash-main">
    <!-- ── Missed reminder banner ── -->
    {#if $missedReminderCount > 0}
      <div class="alert alert-warning d-flex align-items-center gap-2 mb-3 py-2 px-3 dash-banner dash-banner--warn">
        <i class="ti ti-clock dash-banner-icon"></i>
        <span class="dash-banner-text">You have {$missedReminderCount} unread order reminder{$missedReminderCount > 1 ? 's' : ''}</span>
        <a href="/admin/notifications?read=false&type=OrderReminder" class="ms-auto btn btn-sm btn-outline-warning py-0">View</a>
      </div>
    {/if}

    <!-- ── Due Today Widget ── -->
    {#if todayReminders.length > 0}
      <div class="card mb-3 border-0 shadow-sm dash-widget">
        <div class="card-header d-flex align-items-center gap-2 py-2 dash-widget-head dash-widget-head--orange">
          <i class="ti ti-clock-hour-4 dash-widget-icon" style="color:#fd7e14;"></i>
          <h6 class="mb-0">Due Today ({todayReminders.length})</h6>
        </div>
        <div class="card-body p-0">
          {#each todayReminders as r}
            <div class="d-flex align-items-center gap-2 px-3 py-2 border-bottom dash-row">
              <span class="badge bg-warning text-dark flex-shrink-0 dash-badge">
                {new Date(r.reminderTime).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}
              </span>
              <a href="/admin/order/{r.order?.id}" class="flex-grow-1 text-dark fw-medium text-decoration-none text-truncate dash-row-title">
                {r.message || "Reminder"}
              </a>
              {#if r.order}
                <span class="text-muted flex-shrink-0 d-none d-md-inline dash-row-meta">#{r.order.pId ?? r.order.id} – {r.order.title ?? ""}</span>
              {/if}
              <button
                class="btn btn-sm btn-light flex-shrink-0 p-0 dash-dismiss"
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
        <div class="dash-title-bar mb-3">
          <div>
            <h4 class="mb-0">My Dashboard</h4>
            <p class="dash-page-sub mb-0">Welcome back — query overview</p>
          </div>
        </div>

        <!-- Stats -->
        <div class="row g-3 mb-3">
          <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm text-center py-3 dash-stat-card">
              <div class="dash-stat-val text-primary">{techStats.open}</div>
              <div class="dash-stat-lbl">
                {currentUser?.subRole === "tech_helper" ? "Open Sub-Queries" : "Open Queries"}
              </div>
              <a
                href={currentUser?.subRole === "tech_helper" ? "/admin/query/sub-queue" : "/admin/query/open"}
                class="stretched-link"
              ></a>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm text-center py-3 dash-stat-card">
              <div class="dash-stat-val text-warning">{techStats.inProgress}</div>
              <div class="dash-stat-lbl">
                {currentUser?.subRole === "tech_helper" ? "In Progress (sub-queries)" : "In Progress (mine)"}
              </div>
              <a href="/admin/query/assigned" class="stretched-link"></a>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm text-center py-3 dash-stat-card">
              <div class="dash-stat-val text-success">{techStats.resolvedToday}</div>
              <div class="dash-stat-lbl">
                {currentUser?.subRole === "tech_helper" ? "Sub-Queries Resolved Today" : "Resolved Today"}
              </div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm text-center py-3 dash-stat-card">
              <div class="dash-stat-val text-secondary">{techStats.totalResolved}</div>
              <div class="dash-stat-lbl">
                {currentUser?.subRole === "tech_helper" ? "Total Sub-Queries Resolved" : "Total Resolved"}
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <a
              href={currentUser?.subRole === "tech_helper" ? "/admin/query/sub-queue" : "/admin/query/open"}
              class="card border-0 shadow-sm p-3 d-flex flex-row align-items-center gap-3 text-decoration-none dash-action"
            >
              <div class="rounded-circle bg-primary bg-opacity-10 p-2 dash-action-icon">
                <i class="ti ti-inbox text-primary"></i>
              </div>
              <div>
                <div class="dash-action-title">Open Queue</div>
                <div class="dash-action-sub">Pick up unassigned queries</div>
              </div>
              <i class="ti ti-chevron-right ms-auto text-muted"></i>
            </a>
          </div>
          <div class="col-md-6">
            <a
              href="/admin/query/assigned"
              class="card border-0 shadow-sm p-3 d-flex flex-row align-items-center gap-3 text-decoration-none dash-action"
            >
              <div class="rounded-circle bg-warning bg-opacity-10 p-2 dash-action-icon">
                <i class="ti ti-clipboard-list text-warning"></i>
              </div>
              <div>
                <div class="dash-action-title">My Assigned</div>
                <div class="dash-action-sub">Continue working on your queries</div>
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
        <div class="dash-toolbar mb-3">
          <div class="dash-toolbar-title">
            <h4 class="mb-0">
              Dashboard
              {#if searchString}
                <span class="dash-range">({searchString})</span>
              {/if}
            </h4>
            <p class="dash-page-sub mb-0">Orders overview</p>
          </div>
          <div class="dash-filters">
            <select bind:value={selectedFilter} class="form-select dash-select">
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>

            {#if selectedFilter === "custom"}
              <input type="date" bind:value={customStartDate} class="form-control dash-date" />
              <input type="date" bind:value={customEndDate} class="form-control dash-date" />
            {/if}

            {#if currentUser?.role != "user"}
              <select bind:value={userId} class="form-select dash-select">
                <option value="">Select User</option>
                {#each users as user}
                  <option value={user?.id}>{user?.name}</option>
                {/each}
              </select>
            {/if}

            <div class="dropdown">
              <a
                href="#Export"
                class="dropdown-toggle btn btn-outline-light px-2 shadow dash-export"
                data-bs-toggle="dropdown"
              >
                <i class="ti ti-package-export me-1"></i>Export
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

        {#if dashboardData}
          <SummaryCards {dashboardData} />
        {/if}

        {#if currentUser?.role === "master"}
          {#if (highlights.overdueQueries?.length ?? 0) > 0}
            {@const overdueCount = highlights.overdueQueries.length}
            {@const criticalCount = highlights.overdueQueries.filter(q => q.waitingMins >= 30).length}
            <div
              class="d-flex align-items-center justify-content-between flex-wrap gap-2 px-3 py-2 mb-3 rounded dash-alert"
              class:dash-alert--critical={criticalCount > 0}
              role="alert"
            >
              <div class="d-flex align-items-center gap-2">
                <i class="ti ti-alert-triangle dash-alert-icon"></i>
                <span class="dash-alert-text">
                  {overdueCount} {overdueCount === 1 ? 'query' : 'queries'} waiting &gt; 5 min without being picked up
                  {#if criticalCount > 0}
                    &nbsp;·&nbsp; {criticalCount} critical (&gt;30 min)
                  {/if}
                </span>
              </div>
              <div class="d-flex gap-2">
                <a href="/admin/query/open" class="btn btn-sm dash-alert-btn" class:dash-alert-btn--critical={criticalCount > 0}>
                  <i class="ti ti-inbox me-1"></i>Open Queue
                </a>
                <a href="/admin/query/sub-queue" class="btn btn-sm btn-outline-secondary">
                  <i class="ti ti-subtask me-1"></i>Sub Queue
                </a>
              </div>
            </div>
          {/if}
          <QueryHighlights {highlights} loading={highlightsLoading} />
        {/if}

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="printDashboard">
            <div class="card flex-fill">
              <div class="card-header d-flex align-items-center justify-content-between flex-wrap py-2">
                <h6 class="mb-0">Orders Over Time</h6>
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
              <div class="card-header d-flex align-items-center justify-content-between flex-wrap py-2">
                <h6 class="mb-0">Orders By Status</h6>
              </div>
              <div class="card-body">
                {#if !loading && dashboardData}
                  <OrdersByStatusChart {dashboardData} />
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
    </div><!-- /.dash-main -->

    <!-- ── Fixed rightbar: Upcoming Visits ───────────────────────────── -->
    <aside class="dash-rightbar" aria-label="Upcoming Visits">
      <div class="dash-rightbar-card">
        <div class="uv-head">
          <div class="uv-head-title">
            <span class="uv-icon">
              <i class="ti ti-map-pin"></i>
            </span>
            <div>
              <div class="uv-title">Upcoming Visits</div>
              <div class="uv-sub">Next 30 days</div>
            </div>
          </div>
          <a href="/admin/client-visit" class="uv-all">View all</a>
        </div>
        <div class="uv-body">
          {#if visitsLoading}
            <div class="uv-empty"><span class="spinner-border spinner-border-sm"></span></div>
          {:else if upcomingVisits.length === 0}
            <div class="uv-empty">
              <i class="ti ti-calendar-off"></i>
              <span>No upcoming visits</span>
            </div>
          {:else}
            {#each upcomingVisits as v}
              <a href="/admin/client-visit/{v.id}" class="uv-item text-decoration-none">
                <div class="uv-item-date">
                  <span class="uv-day">{new Date(v.visitDate).toLocaleDateString('en-GB',{day:'2-digit'})}</span>
                  <span class="uv-mon">{new Date(v.visitDate).toLocaleDateString('en-GB',{month:'short'})}</span>
                </div>
                <div class="uv-item-main">
                  <div class="uv-item-name">{v.client?.name ?? '—'}</div>
                  {#if v.purpose}
                    <div class="uv-item-purpose">{v.purpose}</div>
                  {/if}
                  <div class="uv-item-meta">
                    <span class="uv-type">
                      {v.visitType === 'outgoing' ? 'We Visit' : v.visitType === 'incoming' ? 'They Come' : v.visitType === 'joint' ? 'Joint' : v.visitType}
                    </span>
                    {#if v.attendees?.length}
                      <span class="uv-attendees">
                        <i class="ti ti-users"></i>
                        {currentUser?.role === 'user'
                          ? v.attendees.map(a => a.user?.name === currentUser?.name ? currentUser.name : 'Team Member').join(', ')
                          : v.attendees.map(a => a.user?.name ?? '').filter(Boolean).join(', ')}
                      </span>
                    {/if}
                  </div>
                </div>
              </a>
            {/each}
          {/if}
        </div>
      </div>
    </aside>

  </div>
</div>

<style>
  /* Small, clean, clear — 12px base */
  .dash-page,
  .dash-page :global(.content) {
    font-size: 12px !important;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Right sidebar layout ── */
  .dash-layout {
    --dash-rightbar-w: 300px;
    --dash-rightbar-gap: 16px;
    position: relative;
    padding-right: 0 !important;
  }
  .dash-main {
    min-width: 0;
    padding-right: calc(var(--dash-rightbar-w) + var(--dash-rightbar-gap));
  }
  .dash-rightbar {
    position: fixed;
    top: var(--crms-topbar-height, 56px);
    right: 0;
    bottom: 0;
    width: var(--dash-rightbar-w);
    height: calc(100vh - var(--crms-topbar-height, 56px));
    z-index: 40;
    display: flex;
    flex-direction: column;
  }
  .dash-rightbar-card {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #fff;
    border-left: 1px solid #e9ecef;
    border-radius: 0;
  }
  .uv-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid #f1f3f5;
    background: #fcfcfd;
    flex-shrink: 0;
  }
  .uv-head-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .uv-icon {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: #e7f5ff;
    color: #1971c2;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }
  .uv-title {
    font-size: 12.5px;
    font-weight: 650;
    color: #212529;
    line-height: 1.25;
  }
  .uv-sub {
    font-size: 10.5px;
    color: #868e96;
  }
  .uv-all {
    font-size: 11px;
    font-weight: 600;
    color: #1971c2;
    text-decoration: none;
    white-space: nowrap;
  }
  .uv-all:hover { text-decoration: underline; }
  .uv-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px;
  }
  .uv-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 40px 12px;
    color: #adb5bd;
    font-size: 12px;
    text-align: center;
  }
  .uv-empty i { font-size: 22px; opacity: 0.7; }
  .uv-item {
    display: flex;
    gap: 10px;
    padding: 10px;
    border-radius: 6px;
    border: 1px solid #f1f3f5;
    background: #fff;
    margin-bottom: 6px;
    color: inherit;
    transition: background 0.12s, border-color 0.12s;
  }
  .uv-item:hover {
    background: #f8f9fa;
    border-color: #dee2e6;
  }
  .uv-item-date {
    width: 40px;
    flex-shrink: 0;
    text-align: center;
    background: #e7f5ff;
    border-radius: 5px;
    padding: 6px 4px;
    line-height: 1.15;
  }
  .uv-day {
    display: block;
    font-size: 14px;
    font-weight: 700;
    color: #1971c2;
    font-variant-numeric: tabular-nums;
  }
  .uv-mon {
    display: block;
    font-size: 9.5px;
    font-weight: 600;
    color: #74c0fc;
    text-transform: uppercase;
    margin-top: 2px;
  }
  .uv-item-main { min-width: 0; flex: 1; }
  .uv-item-name {
    font-size: 12px;
    font-weight: 650;
    color: #212529;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .uv-item-purpose {
    font-size: 11px;
    color: #868e96;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .uv-item-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 5px;
  }
  .uv-type {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    background: #f1f3f5;
    color: #495057;
  }
  .uv-attendees {
    font-size: 10.5px;
    color: #868e96;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .uv-attendees i { font-size: 11px; margin-right: 2px; }

  @media (max-width: 1100px) {
    .dash-layout { padding-right: 1.25rem !important; }
    .dash-main { padding-right: 0; }
    .dash-rightbar {
      position: static;
      width: 100%;
      height: auto;
      margin-top: 14px;
    }
    .dash-rightbar-card {
      height: auto;
      max-height: 420px;
      border: 1px solid #e9ecef;
      border-radius: 0;
    }
  }

  .dash-page :global(h4) {
    font-size: 15px !important;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: #212529;
  }
  .dash-page :global(h6) {
    font-size: 12.5px !important;
    font-weight: 650;
    color: #212529;
  }
  .dash-page :global(.card-header),
  .dash-page :global(.card-body),
  .dash-page :global(.dropdown-item),
  .dash-page :global(.badge) {
    font-size: 12px;
    line-height: 1.45;
  }
  .dash-page :global(.text-muted),
  .dash-page :global(.small) {
    font-size: 11px !important;
  }

  .dash-title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .dash-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: nowrap;
  }
  .dash-toolbar-title {
    min-width: 0;
    flex-shrink: 1;
  }
  .dash-filters {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: nowrap;
    flex-shrink: 0;
  }
  .dash-page-sub {
    font-size: 11px;
    color: #868e96;
    margin-top: 2px;
  }
  .dash-range {
    font-size: 11px;
    font-weight: 500;
    color: #868e96;
  }

  .dash-select,
  .dash-date,
  .dash-page :global(.form-select),
  .dash-page :global(.form-control) {
    font-size: 11.5px !important;
    height: 28px !important;
    min-height: 28px !important;
    padding: 2px 8px !important;
    line-height: 1.35 !important;
  }
  .dash-select {
    min-width: 110px;
    max-width: 140px;
    width: auto;
  }
  .dash-date {
    width: 118px;
    min-width: 118px;
  }
  .dash-export {
    font-size: 11.5px !important;
    height: 28px;
    display: inline-flex;
    align-items: center;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    white-space: nowrap;
  }

  @media (max-width: 900px) {
    .dash-toolbar {
      flex-direction: column;
      align-items: stretch;
    }
    .dash-filters {
      overflow-x: auto;
      padding-bottom: 2px;
    }
  }

  .dash-banner {
    border-left: 4px solid #fd7e14;
    font-size: 12px;
  }
  .dash-banner-icon { font-size: 16px; color: #fd7e14; }
  .dash-banner-text { font-size: 12px; font-weight: 600; }

  .dash-widget-head { border-bottom-width: 2px; border-bottom-style: solid; }
  .dash-widget-head--orange { background: #fff8f0; border-bottom-color: #fd7e14; }
  .dash-widget-icon { font-size: 15px; }
  .dash-badge {
    font-size: 10.5px !important;
    font-weight: 600;
    min-width: 54px;
    text-align: center;
    padding: 3px 7px;
  }
  .dash-badge--muted { min-width: 0; }
  .dash-row-title { font-size: 12px !important; }
  .dash-row-meta { font-size: 11px !important; }
  .dash-dismiss {
    width: 24px;
    height: 24px;
    line-height: 1;
    border-radius: 50%;
    font-size: 11px;
  }

  .dash-stat-val {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
  }
  .dash-stat-lbl {
    font-size: 11px;
    color: #868e96;
    margin-top: 4px;
  }
  .dash-action-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }
  .dash-action-title {
    font-size: 12.5px;
    font-weight: 650;
    color: #212529;
  }
  .dash-action-sub {
    font-size: 11px;
    color: #868e96;
  }

  .dash-alert {
    background: #fff9f0;
    border: 1px solid #ffcc88;
  }
  .dash-alert--critical {
    background: #fff5f5;
    border-color: #ffa8a8;
  }
  .dash-alert-icon { font-size: 16px; color: #d9480f; }
  .dash-alert--critical .dash-alert-icon { color: #c92a2a; }
  .dash-alert-text {
    font-size: 12px;
    font-weight: 600;
    color: #d9480f;
  }
  .dash-alert--critical .dash-alert-text { color: #c92a2a; }
  .dash-alert-btn {
    font-size: 11.5px !important;
    background: #d9480f;
    color: #fff;
    border: none;
  }
  .dash-alert-btn--critical { background: #c92a2a; }

  /* Child components — keep rem inline sizes from ballooning */
  .dash-page :global(.fs-2) { font-size: 22px !important; }
  .dash-page :global(.fs-4),
  .dash-page :global(.fs-5) { font-size: 16px !important; }
  .dash-page :global(.fs-13),
  .dash-page :global(.fs-14) { font-size: 12px !important; }
  .dash-page :global(.fs-16) { font-size: 15px !important; }
  .dash-page :global(.fs-18) { font-size: 15px !important; }

  /* QueryHighlights — normalize rem-based inline text */
  .dash-page :global(.btn-sm) { font-size: 11.5px !important; }
</style>
