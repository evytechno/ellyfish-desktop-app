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

  let formErrors = {};

  import { orderActivityFilterStore } from "$lib/stores/filterStore";
  import { get } from "svelte/store";
  import Swal from "sweetalert2";
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
        status: "Completed",
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
          "orders_completed_" + query.toString(),
        );
        if (cachedData) {
          orders = cachedData.orders;
          totalItems = cachedData.totalItems ?? orders.length;
          totalPages = cachedData.totalPages ?? 1;
          return;
        }
      }
      const data = await authApiFetch(
        `${API_ROUTES.ORDER}?${query.toString()}`,
        { method: "GET" },
      );
      orders = data.data ?? data;
      totalItems = data.total ?? orders.length;
      totalPages = data.totalPages ?? 1;
      saveToLocalStorage("orders_completed_" + query.toString(), {
        orders, totalItems, totalPages,
      });
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

  async function filterQuery() {
    const query = new URLSearchParams({
      search: searchTerm || "",
      orderBy: orderBy,
      status: "Completed",
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
      const formatLocalDate = (date) => date.toLocaleDateString("en-CA");
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
    return { query };
  }

  async function statusUpdate1(order) {
    errorMessage = "";
    formErrors = {};

    const updateOrder = {
      title: order.title,
      status: order.status,
    };
    let newActivity = {
      title: "Order Status Changed",
      description: `The order status has been updated to '${
        $statusNamesStore[order?.status]?.name
          ? $statusNamesStore[order?.status]?.name
          : order?.status
      } (${order.status})'.`,
    };
    updateOrder.orderActivity = newActivity;
    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/" + order.id, {
        method: "PUT",
        data: JSON.stringify(updateOrder),
      });
      let { query } = await filterQuery();
      const cachedData = getFromLocalStorage(
        "orders_completed_" + query.toString(),
      );

      if (cachedData) {
        orders = orders.filter((o) => o.id !== order.id);
        orders = [...orders];
        saveToLocalStorage("orders_completed_" + query.toString(), { orders });
      }
      Swal.fire({
        icon: "success",
        title: "Status Updated",
        text: "The order status has been updated successfully.",
      });
      return true;
    } catch (error) {

      const validationErrors = errorHandle(error);

      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
      return false;
    } finally {
    }
  }
  async function statusUpdate(order) {
    errorMessage = "";
    formErrors = {};

    const updateOrder = {
      title: order.title,
      status: order.status,
    };
    let newActivity = {
      title: "Order Status Changed",
      description: `The order status has been updated to '${
        $statusNamesStore[order?.status]?.name
          ? $statusNamesStore[order?.status]?.name
          : order?.status
      } (${order.status})'.`,
    };
    updateOrder.orderActivity = newActivity;
    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/" + order.id, {
        method: "PUT",
        data: JSON.stringify(updateOrder),
      });
      let { query } = await filterQuery();
      const cachedData = getFromLocalStorage(
        "orders_completed_" + query.toString(),
      );
      if (cachedData) {
        orders = cachedData.orders;
        if (order.status !== "Completed") {
          orders = orders.filter((o) => o.id !== order.id);
        }
        saveToLocalStorage("orders_completed_" + query.toString(), { orders });
      }
      Swal.fire({
        icon: "success",
        title: "Status Updated",
        text: "The order status has been updated successfully.",
      });
      return true;
    } catch (error) {

      const validationErrors = errorHandle(error);

      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
      return false;
    } finally {
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

  async function changeStatus(orderId) {
    let n_order = orders.find((order) => order.id == orderId);
    if (!n_order) return;

    const { value: selectedStatus, isConfirmed } = await Swal.fire({
      title: "Change Order Status",
      text: `Select a new status for ${n_order?.title} (${n_order?.workOrderNumber}).`,
      icon: "question",
      input: "select",
      inputOptions: {
        "Deal Won": "Deal Won",
        Dispatched: "Dispatched",
        Completed: "Completed",
      },
      inputPlaceholder: "Choose status",
      inputValue: n_order.status,
      showCancelButton: true,
      confirmButtonText: "Update Status",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#28a745",
      customClass: {
        input: "form-select !w-auto",
      },
      inputValidator: (value) => {
        if (!value) return "Please select a status!";
      },
    });

    if (!isConfirmed) return;

    try {
      Swal.showLoading();

      n_order.status = selectedStatus;
      let updateStatus = await statusUpdate(n_order);
    } catch (err) {
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
      key: "workOrderNumber",
      label: "Work Order Number",
    },
    // {
    //   key: "status",
    //   label: "Status",
    //   render: (val, row) => {
    //     return `<span class="badge ${statusesColors[row?.status] || "bg-gray"}">${
    //       $statusNamesStore[row?.status]?.name
    //         ? $statusNamesStore[row?.status]?.name
    //         : row?.status
    //     }</span>`;
    //   },
    // },
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

        return `
      <div class="flex flex-col gap-1 text-sm">
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

  let actions = [
    {
      label: "Change Status",
      icon: "ti ti-status-change",
      onClick: (id) => changeStatus(id),
      color: "btn-soft-success",
    },
  ];
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
          Orders Completed
          <span class="text-xs font-normal">
            {searchString ? `(${searchString})` : ""}
          </span>
        </h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">
              Orders Completed
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
            <option value="all">All Orders</option>
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
