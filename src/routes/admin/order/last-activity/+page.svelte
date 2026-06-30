<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Loader from "$lib/components/Loader.svelte";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import { maskAssignedName } from '$lib/utils/maskUser';
  import {
    companiesAllStore,
    usersAllStore,
    getFromLocalStorage,
    saveToLocalStorage,
  } from "$lib/stores/dataStores";
  import { statusNamesStore } from "$lib/stores/statusNames";
  let currentUser = null;

  let loadingData = true;

  let orders = [];
  let users = [];
  let companies = [];

  let trashBin = false;

  let userId = null;
  let companyId = null;
  let searchTerm = "";
  let listCurrentPage = 1;
  let listRowsPerPage = 10;
  let totalItems = 0;
  let totalPages = 0;
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;
  let orderBy = "createdAt";
  let searchString = "";

  let viewType = "grid";

  let loading = false;
  let errorMessage = "";

  import { orderActivityFilterStore } from "$lib/stores/filterStore";
  import { get } from "svelte/store";
  let firstLoad = false;
  onMount(() => {
    currentUser = checkAuth();
    if (currentUser?.role != "user") {
      viewType = "list";
    }

    const filterState = $orderActivityFilterStore;

    userId = filterState.userId || null;
    companyId = filterState.companyId || null;
    searchTerm = filterState.searchTerm || "";
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;
    orderBy = filterState.orderBy || "createdAt";

    fetchOrders();
    getAllCompanies();
    getAllUsers();

    setTimeout(() => {
      firstLoad = true;
    }, 500);
  });

  const updateFilterStore = (newValues) => {
    orderActivityFilterStore.update((currentState) => {
      return { ...currentState, ...newValues };
    });
  };

  let refresh = false;
  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      try {
        await Promise.all([fetchOrders(), getAllCompanies(), getAllUsers()]);
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        refresh = false;
      }
    }, 200);
  }

  async function fetchOrders() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        search: searchTerm || "",
        orderBy: orderBy,
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
      } else if (selectedFilter === "last45days") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 45);
        startDateFilter = thirtyDaysAgo;
        searchString = `${formatDisplayDate(thirtyDaysAgo)} to ${formatDisplayDate(new Date())}`;
      } else if (selectedFilter === "last60days") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60);
        startDateFilter = thirtyDaysAgo;
        searchString = `${formatDisplayDate(thirtyDaysAgo)} to ${formatDisplayDate(new Date())}`;
      } else if (selectedFilter === "last90days") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);
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
      if (companyId) {
        query.append("byCompanyId", companyId);
      }
      if (trashBin) {
        query.append("withDeleted", trashBin);
      }
      query.append("page", String(listCurrentPage));
      query.append("limit", String(listRowsPerPage));

      updateFilterStore({
        userId,
        companyId,
        searchTerm,
        selectedFilter,
        customStartDate,
        customEndDate,
        orderBy,
      });

      if (!refresh) {
        const cachedData = getFromLocalStorage(
          "orders_last_activity_" + query.toString(),
        );
        if (cachedData) {
          orders = cachedData.orders;
          totalItems = cachedData.totalItems ?? orders.length;
          totalPages = cachedData.totalPages ?? 1;
          return;
        }
      }
      const data = await authApiFetch(
        `${API_ROUTES.ORDER + "/last-activity"}?${query.toString()}`,
        { method: "GET" },
      );
      orders = data.data ?? data;
      totalItems = data.total ?? orders.length;
      totalPages = data.totalPages ?? 1;
      saveToLocalStorage("orders_last_activity_" + query.toString(), {
        orders, totalItems, totalPages,
      });
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
    } catch (err) {
      errorMessage = "Failed to load user data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

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
    } catch (err) {
      errorMessage = "Failed to load company data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  let debounceTimeout;
  function handleSearchChange(value) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      searchTerm = value;
    }, 300);
  }

  $: [
    searchTerm,
    selectedFilter,
    customStartDate,
    customEndDate,
    orderBy,
    userId,
    companyId,
    trashBin,
  ],
    checkFetchRecord();

  function checkFetchRecord() {
    if (firstLoad) {
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
        return;
      }
      listCurrentPage = 1;
      fetchOrders();
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
  };

  $: columns = [
    {
      key: "title",
      label: "Title",
      render: (val, row) => {
        const label = row?.pId ? `#${row.pId} - ${row?.title || ""}` : (row?.title || "");
        return `<a href="/admin/order/${row.id}" class="flex items-center gap-1"><div class="max-w-[300px] truncate">${label}</div></a>`;
      },
    },
    {
      key: "status",
      label: "Status",
      render: (val, row) => {
        return `<span class="badge ${statusesColors[row?.status] || "bg-gray"}">${
          $statusNamesStore[row?.status]?.name
            ? $statusNamesStore[row?.status]?.name
            : row?.status
        }</span>`;
      },
    },
    {
      key: "workOrderNumber",
      label: "Work Order Number",
    },
    {
      key: "orderInfo",
      label: "Order Info",
      render: (_, row) => {
        const orderDate = row?.orderDate
          ? new Date(row.orderDate).toLocaleDateString("en-GB")
          : "-";

        const createdDate = row?.createdAt
          ? new Date(row.createdAt).toLocaleString("en-GB")
          : "-";

        return `
      <div class="flex flex-col text-sm">
        <span>Order: ${orderDate}</span>
        <span class="text-xs text-gray-500">
          Created: ${createdDate}
        </span>
      </div>
    `;
      },
    },
    {
      key: "recentActivity",
      label: "Recent Activity",
      render: (_, row) => {
        const lastMessage = row?.orderChats?.[0];
        const lastActivity = row?.orderActivities?.[0];

        const messageText = lastMessage?.message || "-";
        const messageDate = lastMessage?.createdAt
          ? new Date(lastMessage.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "-";

        const activityDate = lastActivity?.createdAt
          ? new Date(lastActivity.createdAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "-";

        // Build chat type badges
        const chatTypeBadges = (row?.orderChats ?? []).reduce((acc, c) => {
          const t = (c.type || "").toLowerCase();
          if (t.includes("whatsapp") || t.includes("whats app") || t === "wa") acc.add("WhatsApp");
          else if (t.includes("call")) acc.add("Call");
          else if (t.includes("email") || t.includes("mail")) acc.add("Email");
          return acc;
        }, new Set());

        const badgeMap = {
          WhatsApp: `<span style="display:inline-flex;align-items:center;gap:3px;background:#25D366;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:600;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp</span>`,
          Call: `<span style="display:inline-flex;align-items:center;gap:3px;background:#e74c3c;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:600;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
            Call</span>`,
          Email: `<span style="display:inline-flex;align-items:center;gap:3px;background:#f39c12;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:600;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
            Email</span>`,
        };

        const badgesHtml = [...chatTypeBadges].map(t => badgeMap[t] || "").join(" ");

        return `
      <div class="flex flex-col gap-1 text-sm">
        ${badgesHtml ? `<div class="flex gap-1 flex-wrap">${badgesHtml}</div>` : ""}
        <div class="truncate max-w-[250px]">${messageText}</div>
        <div class="text-xs text-gray-500">
          Chat: ${messageDate} | Activity: ${activityDate}
        </div>
      </div>
    `;
      },
    },
    ...(currentUser?.role != "user"
      ? [
          {
            key: "user",
            label: "User",
            render: (val, row) =>
              (row?.assignedUsers || [])
                .map((user) => maskAssignedName(user, currentUser))
                .join(", "),
          },
        ]
      : []),
  ];

  let actions = [];
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <!-- Start Content -->
  <div class="content">
    <!-- Page Header -->
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">
          Orders Activity
          <span class="text-xs font-normal">
            {searchString ? `(${searchString})` : ""}
          </span>
        </h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">
              Orders Activity
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

    <!-- table header -->
    <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-2 flex-wrap">
          <div>
            <div class="input-icon input-icon-start position-relative">
              <span class="input-icon-addon text-dark">
                <i class="ti ti-search"></i>
              </span>
              <input
                type="text"
                value={searchTerm}
                on:input={(e) => handleSearchChange(e.target.value)}
                class="form-control"
                placeholder="Search.."
              />
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <select bind:value={selectedFilter} class="form-select">
            <option value="last7days">Last 7 Days</option>
            <option value="last30days">Last 30 Days</option>
            <option value="last45days">Last 45 Days</option>
            <option value="last60days">Last 60 Days</option>
            <option value="last90days">Last 90 Days</option>
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
        {#if currentUser?.role != "user"}
          <div class="flex items-center gap-2 flex-wrap">
            <select bind:value={userId} class="form-select">
              <option value={null}>Select User</option>
              {#each users.filter(u => {
                if (['master','admin','manager'].includes(currentUser?.role)) return true;
                return u.subRole === currentUser?.subRole;
              }) as user}
                <option value={user?.id}>{user?.name}</option>
              {/each}
            </select>
          </div>
        {/if}
        {#if currentUser?.role != "user"}
          <div class="flex items-center gap-2 flex-wrap">
            <select bind:value={companyId} class="form-select">
              <option value={null}>Select Company</option>
              {#each companies as company}
                <option value={company?.id}>{company?.name}</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>
    </div>
    <!-- table header -->

    <!-- card start -->
    <div class="card border-0 rounded-0">
      <div class="card-body">
        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={orders}
          serverMode={true}
          currentPage={listCurrentPage}
          rowsPerPage={listRowsPerPage}
          {totalItems}
          {totalPages}
          on:pageChange={(e) => { listCurrentPage = e.detail; fetchOrders(); }}
          on:rowsPerPageChange={(e) => { listRowsPerPage = e.detail; listCurrentPage = 1; fetchOrders(); }}
          on:search={(e) => { searchTerm = e.detail; listCurrentPage = 1; }}
        />
      </div>
    </div>
  </div>
  <!-- End Content -->
</div>
