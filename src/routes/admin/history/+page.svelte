<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import {
    companiesAllStore,
    usersAllStore,
    getFromLocalStorage,
    saveToLocalStorage,
  } from "$lib/stores/dataStores";
  import {
    activityFilterStore,
    authActivityFilterStore,
  } from "$lib/stores/filterStore";
  import Swal from "sweetalert2";
  import { get } from "svelte/store";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";

  // ── shared ──────────────────────────────────────────────────────────────────
  let loadingData = true;
  let currentUser;
  let activeTab = "order"; // 'order' | 'auth'

  // ── order activity state ─────────────────────────────────────────────────
  let activities = [];
  let companies = [];
  let users = [];

  let userId = null;
  let searchTerm = "";
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;
  let searchString = "";
  let loading = false;
  let errorMessage = "";
  let firstLoad = false;

  // ── auth activity state ───────────────────────────────────────────────────
  let authActivities = [];
  let authCurrentPage = 1;
  let authRowsPerPage = 10;
  let authTotalItems = 0;
  let authSelectedFilter = "last7days";
  let authCustomStartDate = null;
  let authCustomEndDate = null;
  let authSearchString = "";
  let authEventFilter = "";
  let authUserEmail = "";
  let authIpFilter = "";
  let authFirstLoad = false;

  onMount(async () => {
    currentUser = checkAuth();
    if (currentUser?.role === "user") {
      loadingData = false;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "You are not authorized to view this page.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return;
    }

    // restore order activity filter
    const filterState = $activityFilterStore;
    userId = filterState.userId || null;
    searchTerm = filterState.searchTerm || "";
    currentPage = filterState.currentPage || 1;
    rowsPerPage = filterState.rowsPerPage || 10;
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;

    // restore auth activity filter
    const authState = $authActivityFilterStore;
    authCurrentPage = authState.currentPage || 1;
    authRowsPerPage = authState.rowsPerPage || 10;
    authSelectedFilter = authState.selectedFilter || "last7days";
    authCustomStartDate = authState.customStartDate || null;
    authCustomEndDate = authState.customEndDate || null;
    authEventFilter = authState.eventFilter || "";
    authUserEmail = authState.userEmail || "";
    authIpFilter = authState.ipFilter || "";

    fetchActivities();
    getAllUsers();
    getAllCompanies();

    if (currentUser?.role === "master" || currentUser?.role === "admin") {
      fetchAuthActivities();
    }

    setTimeout(() => {
      firstLoad = true;
      authFirstLoad = true;
    }, 500);
  });

  // ── refresh ──────────────────────────────────────────────────────────────
  let refresh = false;
  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      try {
        if (activeTab === "order") {
          await Promise.all([
            getAllCompanies(),
            getAllUsers(),
            fetchActivities(),
          ]);
        } else {
          await fetchAuthActivities();
        }
      } finally {
        refresh = false;
      }
    }, 200);
  }

  // ── order activity helpers ────────────────────────────────────────────────
  const updateFilterStore = (newValues) => {
    activityFilterStore.update((s) => ({ ...s, ...newValues }));
  };

  async function getAllCompanies() {
    if (!refresh) {
      const cached = get(companiesAllStore);
      if (cached && cached.length > 0) {
        companies = cached;
        loadingData = false;
        return;
      }
    }
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = data;
      companiesAllStore.set(data);
    } catch {
      errorMessage = "Failed to load company data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  async function getAllUsers() {
    if (!refresh) {
      const cached = get(usersAllStore);
      if (cached && cached.length > 0) {
        users = cached;
        loadingData = false;
        return;
      }
    }
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.USER + "/all");
      users = data;
      usersAllStore.set(data);
    } catch {
      errorMessage = "Failed to load user data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  function buildDateParams(
    startFilter,
    endFilter,
    selFilter,
    custStart,
    custEnd,
    q,
  ) {
    let startDateFilter;
    let endDateFilter = new Date();
    const formatDisplayDate = (d) =>
      d.toLocaleDateString("en-CA", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    const formatLocalDate = (d) => d.toLocaleDateString("en-CA");
    let label = "All";

    if (selFilter === "last7days") {
      startDateFilter = new Date();
      startDateFilter.setDate(startDateFilter.getDate() - 7);
      label = `${formatDisplayDate(startDateFilter)} to ${formatDisplayDate(new Date())}`;
    } else if (selFilter === "last30days") {
      startDateFilter = new Date();
      startDateFilter.setDate(startDateFilter.getDate() - 30);
      label = `${formatDisplayDate(startDateFilter)} to ${formatDisplayDate(new Date())}`;
    } else if (selFilter === "today") {
      startDateFilter = new Date();
      startDateFilter.setHours(0, 0, 0, 0);
      endDateFilter.setHours(23, 59, 59, 999);
      label = "Today";
    } else if (selFilter === "custom" && custStart && custEnd) {
      q.append("startDate", custStart);
      q.append("endDate", custEnd);
      label = `${formatDisplayDate(new Date(custStart))} to ${formatDisplayDate(new Date(custEnd))}`;
    }

    if (startDateFilter && selFilter !== "custom") {
      q.append("startDate", formatLocalDate(startDateFilter));
      q.append("endDate", formatLocalDate(endDateFilter));
    }
    return label;
  }

  async function fetchActivities() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        page: currentPage.toString(),
        limit: rowsPerPage.toString(),
        search: searchTerm || "",
      });

      searchString = buildDateParams(
        null,
        null,
        selectedFilter,
        customStartDate,
        customEndDate,
        query,
      );

      if (userId) query.append("byUserId", userId);

      updateFilterStore({
        userId,
        searchTerm,
        currentPage,
        rowsPerPage,
        selectedFilter,
        customStartDate,
        customEndDate,
      });

      if (!refresh) {
        const cachedData = getFromLocalStorage(
          "activities_" + query.toString(),
        );
        if (cachedData) {
          activities = cachedData.activities;
          totalItems = cachedData.totalItems;
          return;
        }
      }

      const data = await authApiFetch(
        `${API_ROUTES.ORDER_ACTIVITY}?${query.toString()}`,
        { method: "GET" },
      );
      activities = data.data;
      totalItems = data.total;
      saveToLocalStorage("activities_" + query.toString(), {
        activities,
        totalItems,
      });
    } catch (error) {
      errorHandle(error);
    } finally {
      loading = false;
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  // ── auth activity helpers ─────────────────────────────────────────────────
  const updateAuthFilterStore = (newValues) => {
    authActivityFilterStore.update((s) => ({ ...s, ...newValues }));
  };

  async function fetchAuthActivities() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        page: authCurrentPage.toString(),
        limit: authRowsPerPage.toString(),
      });

      authSearchString = buildDateParams(
        null,
        null,
        authSelectedFilter,
        authCustomStartDate,
        authCustomEndDate,
        query,
      );

      if (authEventFilter) query.append("event", authEventFilter);
      if (authUserEmail) query.append("userEmail", authUserEmail);
      if (authIpFilter) query.append("ipAddress", authIpFilter);

      updateAuthFilterStore({
        currentPage: authCurrentPage,
        rowsPerPage: authRowsPerPage,
        selectedFilter: authSelectedFilter,
        customStartDate: authCustomStartDate,
        customEndDate: authCustomEndDate,
        eventFilter: authEventFilter,
        userEmail: authUserEmail,
        ipFilter: authIpFilter,
      });

      const data = await authApiFetch(
        `${API_ROUTES.AUTH_ACTIVITY}?${query.toString()}`,
        { method: "GET" },
      );
      authActivities = data.data;
      authTotalItems = data.total;
    } catch (error) {
      errorHandle(error);
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  // ── debounce / reactivity ─────────────────────────────────────────────────
  let debounceTimeout;
  function handleSearchChange(value) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      searchTerm = value;
    }, 300);
  }

  let authDebounceTimeout;
  function handleAuthEmailChange(value) {
    clearTimeout(authDebounceTimeout);
    authDebounceTimeout = setTimeout(() => {
      authUserEmail = value;
    }, 300);
  }

  $: [
    searchTerm,
    selectedFilter,
    customStartDate,
    customEndDate,
    currentPage,
    rowsPerPage,
    userId,
  ],
    checkFetchRecord();

  function checkFetchRecord() {
    if (firstLoad) {
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate))
        return;
      fetchActivities();
    }
  }

  $: [
    authEventFilter,
    authUserEmail,
    authIpFilter,
    authSelectedFilter,
    authCustomStartDate,
    authCustomEndDate,
    authCurrentPage,
    authRowsPerPage,
  ],
    checkAuthFetchRecord();

  function checkAuthFetchRecord() {
    if (authFirstLoad) {
      if (
        authSelectedFilter === "custom" &&
        (!authCustomStartDate || !authCustomEndDate)
      )
        return;
      fetchAuthActivities();
    }
  }

  // ── event badge colour ────────────────────────────────────────────────────
  function eventBadgeClass(event) {
    switch (event) {
      case "login":
        return "badge bg-success";
      case "logout":
        return "badge bg-secondary";
      case "failed_login":
        return "badge bg-danger";
      case "token_refresh":
        return "badge bg-info text-dark";
      case "location_blocked":
        return "badge bg-warning text-dark";
      case "time_blocked":
        return "badge bg-warning text-dark";
      case "account_blocked":
        return "badge bg-danger";
      default:
        return "badge bg-light text-dark";
    }
  }

  function eventLabel(event) {
    return (
      event?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "-"
    );
  }

  // ── order activity columns ────────────────────────────────────────────────
  $: orderColumns = [
    { key: "title", label: "Title" },
    {
      key: "order",
      label: "Order",
      render: (val, row) =>
        `<a href="/admin/order/${row?.order?.id}" class="flex items-center gap-1"><div class="max-w-[300px] truncate">${row?.order?.title ?? "-"}</div></a>`,
    },
    {
      key: "description",
      label: "Description",
      render: (val, row) => {
        if (row.title === "Order Chat Added") return row?.data?.message;
        if (row.title === "Order Attachment Added") {
          let d = "";
          const data = row.data;
          if (data?.title) d += ` Title: "${data.title}".`;
          (data?.files || []).forEach((f, i) => {
            if (f?.originalName)
              d += ` "${f.originalName}"${i < data.files.length - 1 ? "," : "."}`;
          });
          if (data?.link) d += ` Link: ${data.link}.`;
          return d;
        }
        if (row.title === "Order Reminder Added") {
          let d = "";
          const data = row.data;
          if (data?.reminderTime) {
            d += `Reminder Time: ${new Date(data.reminderTime).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}. `;
          }
          if (data?.message) d += ` Message: ${data.message}.`;
          return d;
        }
        return val;
      },
    },
    {
      key: "category",
      label: "Category",
      render: (val, row) => row?.order?.category ?? "-",
    },
    {
      key: "createdAt",
      label: "Created At",
      render: (val, row) => {
        const d = new Date(row.createdAt);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
      },
    },
    ...(currentUser?.role !== "user"
      ? [
          {
            key: "user",
            label: "User",
            render: (val, row) => row?.user?.name ?? "-",
          },
        ]
      : []),
  ];

  // ── auth activity columns ─────────────────────────────────────────────────
  const authColumns = [
    {
      key: "event",
      label: "Event",
      render: (val) =>
        `<span class="${eventBadgeClass(val)}">${eventLabel(val)}</span>`,
    },
    {
      key: "userEmail",
      label: "User",
      render: (val, row) =>
        row?.user?.name
          ? `<div>${row.user.name}</div><div class="text-muted small">${val ?? ""}</div>`
          : (val ?? "-"),
    },
    { key: "ipAddress", label: "IP Address", render: (val) => val ?? "-" },
    {
      key: "browser",
      label: "Device / Browser",
      render: (val, row) => {
        const name = row?.deviceName
          ? `<div class="fw-semibold text-dark">${row.deviceName}</div>`
          : `<div class="text-muted fst-italic text-xs">Unknown device</div>`;
        const type = row?.device
          ? `<span class="badge bg-light text-secondary border text-xs me-1"><i class="ti ti-device-${row.device === 'mobile' ? 'mobile' : row.device === 'tablet' ? 'ipad' : 'desktop'} me-1"></i>${row.device}</span>`
          : "";
        const browser = `<div class="text-muted small mt-1">${type}${val ?? ""} / ${row?.os ?? ""}</div>`;
        return name + browser;
      },
    },
    {
      key: "locationLabel",
      label: "Location",
      render: (val, row) => {
        const hasGps = row?.latitude && row?.longitude;
        const lat = hasGps ? Number(row.latitude).toFixed(5) : null;
        const lon = hasGps ? Number(row.longitude).toFixed(5) : null;
        const mapsUrl = hasGps
          ? `https://www.google.com/maps?q=${lat},${lon}`
          : null;

        if (!val && !hasGps) return `<span class="text-muted">-</span>`;

        return `<div class="d-flex flex-column gap-1">
          ${val ? `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 fw-semibold">
            <i class="ti ti-map-pin me-1"></i>${val}
          </span>` : ""}
          ${hasGps ? `<span class="text-muted small font-monospace">
            <i class="ti ti-gps fs-11 me-1"></i>${lat}, ${lon}
          </span>` : ""}
          ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
            class="text-primary small d-inline-flex align-items-center gap-1" style="width:fit-content;">
            <i class="ti ti-map-2 fs-12"></i> Open in Maps
          </a>` : ""}
        </div>`;
      },
    },
    {
      key: "failReason",
      label: "Reason",
      render: (val) =>
        val ? `<span class="text-danger small">${val}</span>` : "-",
    },
    {
      key: "createdAt",
      label: "Time",
      render: (val) => {
        if (!val) return "-";
        const d = new Date(val);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
      },
    },
  ];

  const authActions = [];
  let actions = [];
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper">
  <div class="content">
    <!-- Page Header -->
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">
          {activeTab === "order" ? "Activities" : "Auth History"}
          <span class="text-xs font-normal">
            {activeTab === "order"
              ? searchString
                ? `(${searchString})`
                : ""
              : authSearchString
                ? `(${authSearchString})`
                : ""}
          </span>
        </h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">
              {activeTab === "order" ? "Activities" : "Auth History"}
            </li>
          </ol>
        </nav>
      </div>
      <div class="gap-2 d-flex align-items-center flex-wrap">
        <a
          href="#refresh"
          on:click={refreshPage}
          class="btn btn-icon btn-outline-light shadow"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          aria-label="Refresh"
          data-bs-original-title="Refresh"><i class="ti ti-refresh"></i></a
        >
        <a
          href="#collapse-header"
          class="btn btn-icon btn-outline-light shadow"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          aria-label="Collapse"
          data-bs-original-title="Collapse"
          id="collapse-header"><i class="ti ti-transition-top"></i></a
        >
      </div>
    </div>
    <!-- End Page Header -->

    <!-- Tabs -->
    {#if currentUser?.role === "master" || currentUser?.role === "admin"}
      <ul class="nav nav-tabs mb-3">
        <li class="nav-item">
          <button
            class="nav-link {activeTab === 'order' ? 'active' : ''}"
            on:click={() => (activeTab = "order")}
          >
            <i class="ti ti-activity me-1"></i> Order Activities
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link {activeTab === 'auth' ? 'active' : ''}"
            on:click={() => (activeTab = "auth")}
          >
            <i class="ti ti-login me-1"></i> Auth History
          </button>
        </li>
      </ul>
    {/if}

    <!-- ══ ORDER ACTIVITIES TAB ══════════════════════════════════════════════ -->
    {#if activeTab === "order"}
      <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div class="flex items-center gap-2">
          <div
            class="input-icon input-icon-start position-relative min-w-[200px]"
          >
            <span class="input-icon-addon text-dark"
              ><i class="ti ti-search"></i></span
            >
            <input
              type="text"
              value={searchTerm}
              on:input={(e) => handleSearchChange(e.target.value)}
              class="form-control"
              placeholder="Search.."
            />
          </div>

          <select bind:value={selectedFilter} class="form-select">
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="last7days">Last 7 Days</option>
            <option value="last30days">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </select>

          {#if selectedFilter === "custom"}
            <input
              type="date"
              bind:value={customStartDate}
              class="form-control"
            />
            <input
              type="date"
              bind:value={customEndDate}
              class="form-control"
            />
          {/if}

          {#if currentUser?.role !== "user"}
            <select bind:value={userId} class="form-select">
              <option value={null}>Select User</option>
              {#each users as user}
                <option value={user?.id}>{user?.name}</option>
              {/each}
            </select>
          {/if}
        </div>
      </div>

      <div class="card border-0 rounded-0">
        <div class="card-body">
          <DynamicDataTable
            loading={loadingData}
            columns={orderColumns}
            {actions}
            data={[...activities]}
            {currentPage}
            {rowsPerPage}
            {totalItems}
            totalPages={Math.ceil(totalItems / rowsPerPage)}
            serverMode={true}
            on:pageChange={(e) => (currentPage = e.detail)}
            on:rowsPerPageChange={(e) => {
              rowsPerPage = e.detail;
              currentPage = 1;
            }}
            on:search={(e) => {
              searchTerm = e.detail;
              currentPage = 1;
            }}
          />
        </div>
      </div>
    {/if}

    <!-- ══ AUTH HISTORY TAB ══════════════════════════════════════════════════ -->
    {#if activeTab === "auth"}
      <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div class="flex items-center gap-2">
          <!-- Event filter -->
          <select bind:value={authEventFilter} class="form-select">
            <option value="">All Events</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="failed_login">Failed Login</option>
            <option value="token_refresh">Token Refresh</option>
            <option value="location_blocked">Location Blocked</option>
            <option value="time_blocked">Time Blocked</option>
            <option value="account_blocked">Account Blocked</option>
          </select>

          <!-- Date filter -->
          <select bind:value={authSelectedFilter} class="form-select">
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="last7days">Last 7 Days</option>
            <option value="last30days">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </select>

          {#if authSelectedFilter === "custom"}
            <input
              type="date"
              bind:value={authCustomStartDate}
              class="form-control"
            />
            <input
              type="date"
              bind:value={authCustomEndDate}
              class="form-control"
            />
          {/if}

          <!-- Email search -->
          <div
            class="input-icon input-icon-start position-relative min-w-[200px]"
          >
            <span class="input-icon-addon text-dark"
              ><i class="ti ti-mail"></i></span
            >
            <input
              type="text"
              value={authUserEmail}
              on:input={(e) => handleAuthEmailChange(e.target.value)}
              class="form-control"
              placeholder="Search by email.."
            />
          </div>

          <!-- IP filter -->
          <div
            class="input-icon input-icon-start position-relative min-w-[200px]"
          >
            <span class="input-icon-addon text-dark"
              ><i class="ti ti-network"></i></span
            >
            <input
              type="text"
              bind:value={authIpFilter}
              class="form-control"
              placeholder="Filter by IP.."
            />
          </div>
        </div>
      </div>

      <div class="card border-0 rounded-0">
        <div class="card-body">
          <DynamicDataTable
            loading={loadingData}
            columns={authColumns}
            actions={authActions}
            data={[...authActivities]}
            currentPage={authCurrentPage}
            rowsPerPage={authRowsPerPage}
            totalItems={authTotalItems}
            totalPages={Math.ceil(authTotalItems / authRowsPerPage)}
            serverMode={true}
            on:pageChange={(e) => (authCurrentPage = e.detail)}
            on:rowsPerPageChange={(e) => {
              authRowsPerPage = e.detail;
              authCurrentPage = 1;
            }}
          />
        </div>
      </div>
    {/if}
  </div>
</div>
