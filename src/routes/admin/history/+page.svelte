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
  let chatTypeFilter = "";

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

    // read params from dashboard navigation
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("chatType"))  chatTypeFilter = urlParams.get("chatType");
    if (urlParams.get("byUserId"))  userId = Number(urlParams.get("byUserId"));
    if (urlParams.get("filter"))    selectedFilter = urlParams.get("filter");
    if (urlParams.get("start"))     customStartDate = urlParams.get("start");
    if (urlParams.get("end"))       customEndDate = urlParams.get("end");
    if (urlParams.get("tab"))       activeTab = urlParams.get("tab");

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
      if (chatTypeFilter) query.append("chatType", chatTypeFilter);

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
      case "login":           return "badge bg-success";
      case "logout":          return "badge bg-secondary";
      case "failed_login":    return "badge bg-danger";
      case "token_refresh":   return "badge bg-info text-dark";
      case "location_blocked":return "badge bg-warning text-dark";
      case "time_blocked":    return "badge bg-warning text-dark";
      case "account_blocked": return "badge bg-danger";
      case "password_changed":return "badge bg-primary";
      case "profile_updated": return "badge bg-primary bg-opacity-75";
      case "user_created":    return "badge bg-success bg-opacity-75";
      case "user_deleted":    return "badge bg-danger bg-opacity-75";
      default:                return "badge bg-light text-dark";
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
        if (row.title === "Order Chat Added") {
          const msg = row?.data?.message ?? "-";
          const typeStr = row?.data?.type || "";
          const badgeMap = {
            whatsapp: `<span style="display:inline-flex;align-items:center;gap:3px;background:#25D366;color:#fff;border-radius:4px;padding:0px 4px;font-size:10px;font-weight:600;white-space:nowrap;"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>@WhatsApp</span>`,
            call: `<span style="display:inline-flex;align-items:center;gap:3px;background:#e74c3c;color:#fff;border-radius:4px;padding:0px 4px;font-size:10px;font-weight:600;white-space:nowrap;"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>@Call</span>`,
            email: `<span style="display:inline-flex;align-items:center;gap:3px;background:#f39c12;color:#fff;border-radius:4px;padding:0px 4px;font-size:10px;font-weight:600;white-space:nowrap;"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>@Email</span>`,
          };
          const badges = typeStr.split(",").map(t => {
            const key = t.trim().toLowerCase();
            if (key.includes("whatsapp") || key === "wa") return badgeMap.whatsapp;
            if (key.includes("call")) return badgeMap.call;
            if (key.includes("email") || key.includes("mail")) return badgeMap.email;
            return "";
          }).filter(Boolean);
          const badgesHtml = badges.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:3px;">${badges.join("")}</div>` : "";
          return `<div>${badgesHtml}<span>${msg}</span></div>`;
        }
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
      label: "Actor",
      render: (val, row) =>
        row?.user?.name
          ? `<div>${row.user.name}</div><div class="text-muted small">${val ?? ""}</div>`
          : (val ?? "-"),
    },
    {
      key: "metadata",
      label: "Details",
      render: (val, row) => {
        // Parse metadata JSON
        let meta = null;
        try { meta = val ? JSON.parse(val) : null; } catch { meta = null; }

        const parts = [];

        // Target user (for admin actions)
        if (meta?.targetUserName) {
          parts.push(`<div class="fw-semibold text-dark small">→ ${meta.targetUserName}</div>`);
        }

        // Changed fields (profile_updated)
        if (Array.isArray(meta?.changedFields) && meta.changedFields.length) {
          parts.push(`<div class="text-muted small">Fields: ${meta.changedFields.join(', ')}</div>`);
        }

        // changedBy (password_changed)
        if (meta?.changedBy) {
          parts.push(`<div class="text-muted small">By: ${meta.changedBy}</div>`);
        }

        // role/email for user_created or user_deleted
        if (meta?.role) {
          parts.push(`<div class="text-muted small">Role: ${meta.role}${meta.subRole ? ' / ' + meta.subRole : ''}</div>`);
        }
        if (meta?.permanent !== undefined) {
          parts.push(`<div class="text-muted small">${meta.permanent ? 'Permanent delete' : 'Soft delete'}</div>`);
        }

        return parts.length ? parts.join('') : `<span class="text-muted">-</span>`;
      },
    },
    {
      key: "ipAddress",
      label: "IP / City",
      render: (val, row) => {
        const ip = val ?? "-";
        const city = row?.city ? `<div class="text-muted small">${row.city}</div>` : "";
        return `<div>${ip}</div>${city}`;
      },
    },
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
          {#if chatTypeFilter}
            <span class="badge bg-primary d-flex align-items-center gap-1">
              {chatTypeFilter}
              <button class="btn-close btn-close-white" style="font-size:9px;" on:click={() => { chatTypeFilter = ""; fetchActivities(); }}></button>
            </span>
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
            <option value="password_changed">Password Changed</option>
            <option value="profile_updated">Profile Updated</option>
            <option value="user_created">User Created</option>
            <option value="user_deleted">User Deleted</option>
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
