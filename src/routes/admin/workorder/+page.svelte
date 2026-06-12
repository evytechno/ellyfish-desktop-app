<script>
  import { onMount } from "svelte";
  import jQuery from "jquery";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import {
    companiesAllStore,
    usersAllStore,
    ordersAllStore,
    getFromLocalStorage,
    saveToLocalStorage,
  } from "$lib/stores/dataStores";
  import { goto } from "$app/navigation";
  import Loader from "$lib/components/Loader.svelte";
  let loadingData = true;

  import { checkAuth } from "$lib/utils/auth";
  let currentUser = null;
  onMount(() => {
    currentUser = checkAuth();
  });

  let workorders = [];
  let orders = [];
  let companies = [];
  let users = [];

  let trashBin = false;

  let formType = "Create";
  let updateWorkOrder = null;
  let userId = null;
  let byCompanyId = null;
  let searchTerm = "";
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;
  let searchString = "";

  // Form state
  let workOrderType = "order";
  let title = null;
  let orderId = null;
  let companyId = null;
  let workOrderDate = null;
  let poDate = null;
  let poNumber = "";
  let items = [];
  let remarks = "";

  let loading = false;
  let errorMessage = "";

  let formErrors = {};

  import { workOrderFilterStore } from "$lib/stores/filterStore";
  import { get } from "svelte/store";
  let firstLoad = false;
  onMount(() => {
    const filterState = $workOrderFilterStore;

    userId = filterState.userId || null;
    byCompanyId = filterState.byCompanyId || null;
    searchTerm = filterState.searchTerm || "";
    currentPage = filterState.currentPage || 1;
    rowsPerPage = filterState.rowsPerPage || 10;
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;

    fetchWorkOrders();
    getAllUsers();
    getAllCompanies();
    getAllOrders();

    setTimeout(() => {
      firstLoad = true;
    }, 500);
  });

  const updateFilterStore = (newValues) => {
    workOrderFilterStore.update((currentState) => {
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
        await Promise.all([
          fetchWorkOrders(),
          getAllCompanies(),
          getAllOrders(),
          getAllUsers(),
        ]);
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        refresh = false;
      }
    }, 200);
  }

  async function getAllOrders() {
    if (!refresh) {
      const cached = get(ordersAllStore);
      if (cached && cached.length > 0) {
        orders = cached;
        loadingData = false;
        return;
      }
    }
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.ORDER + "/all");
      orders = data;
      ordersAllStore.set(data);
    } catch (err) {
      errorMessage = "Failed to load order data.";
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

  async function fetchWorkOrders() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        page: currentPage.toString(),
        limit: rowsPerPage.toString(),
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
      if (byCompanyId) {
        query.append("byCompanyId", byCompanyId);
      }
      if (trashBin) {
        query.append("withDeleted", trashBin);
      }

      updateFilterStore({
        userId,
        byCompanyId,
        searchTerm,
        currentPage,
        rowsPerPage,
        selectedFilter,
        customStartDate,
        customEndDate,
      });

      if (!refresh) {
        const cachedData = getFromLocalStorage(
          "workorders_" + query.toString()
        );
        if (cachedData) {
          workorders = cachedData.workorders;
          totalItems = cachedData.totalItems;
          return;
        }
      }
      const data = await authApiFetch(
        `${API_ROUTES.WORK_ORDER}?${query.toString()}`,
        { method: "GET" }
      );

      workorders = data.data;
      totalItems = data.total;
      saveToLocalStorage("workorders_" + query.toString(), {
        workorders,
        totalItems,
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
    currentPage,
    rowsPerPage,
    userId,
    byCompanyId,
    trashBin,
  ],
    checkFetchRecord();

  function checkFetchRecord() {
    if (firstLoad) {
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
        return;
      }
      fetchWorkOrders();
    }
  }

  $: columns = [
    {
      key: "workOrderNo",
      label: "WO No.",
      render: (val, row) => {
        return `<a href="/admin/workorder/${row.id}" class="flex flex-col gap-0 text-danger">
          <span>${row?.workOrderNo ? `#${row.workOrderNo}` : "—"}</span>
          ${row?.orderNo ? `<span class="text-muted fw-normal" style="font-size:11px;">${row.orderNo}</span>` : ""}
        </a>`;
      },
    },

    {
      key: "order",
      label: "Order",
      render: (val, row) => {
        if (row?.order?.id) {
          const label = row.order.title || `Order #${row.order.id}`;
          return `<a href="/admin/order/${row.order.id}" class="text-primary text-truncate d-block" style="max-width:280px" title="${label}">${label}</a>`;
        }
        return `<span class="text-muted">${row?.title || "-"}</span>`;
      },
    },
    {
      key: "workOrderDate",
      label: "Work Order Date",
      render: (val, row) => {
        const d = new Date(row.workOrderDate);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
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
    ...(currentUser?.role != "user"
      ? [
          {
            key: "company",
            label: "Company",
            render: (val, row) => row?.company?.name ?? "-",
          },
          {
            key: "user",
            label: "User",
            render: (val, row) => (row?.user ? row.user.name : "-"),
          },
        ]
      : []),
  ];

  let actions = [
    {
      label: "Edit",
      icon: "ti ti-edit",
      onClick: (id) => editRecord(id),
      color: "btn-soft-info",
    },
    {
      label: "Delete",
      icon: "ti ti-trash",
      onClick: (id) => deleteRecord(id),
      color: "btn-soft-danger",
    },
    {
      label: "Work Order",
      icon: "ti ti-invoice",
      onClick: (id) => viewRecord(id),
      color: "btn-soft-success",
    },
  ];

  function formatDateForInput(date) {
    if (!date) return "";
    const d = new Date(date);
    return d.toISOString().split("T")[0]; // Returns YYYY-MM-DD
  }

  async function fillDataOnForm(id) {
    let newWorkOrder = workorders.find((workOrder) => workOrder.id === id);
    if (newWorkOrder) {
      if (newWorkOrder?.order) {
        workOrderType = "order";
      } else {
        workOrderType = "self";
      }
      updateWorkOrder = newWorkOrder;
      title = newWorkOrder?.title;
      orderId = newWorkOrder?.order ? newWorkOrder?.order?.id : null;
      companyId = newWorkOrder?.company?.id;
      if (newWorkOrder?.workOrderDate) {
        workOrderDate = formatDateForInput(newWorkOrder?.workOrderDate);
      }
      poNumber = newWorkOrder?.poNumber;
      items = newWorkOrder?.items || [];
      remarks = newWorkOrder?.remarks;
    }
  }

  const editRecord = async (id) => {
    goto("/admin/workorder/edit/" + id);
  };

  const viewRecord = async (id) => {
    goto("/admin/workorder/" + id);
  };

  async function deleteRecord(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.WORK_ORDER}/${id}`, {
            method: "DELETE",
          });
          workorders = workorders.filter((workOrder) => workOrder.id !== id);
          Swal.fire("Deleted!", data.message, "success");
          refreshPage();
        } catch (err) {
          const validationErrors = errorHandle(err);
        }
      }
    });
  }
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
          Work Orders
          <span class="text-xs font-normal">
            {searchString ? `(${searchString})` : ""}
          </span>
        </h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">
              Work Orders
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
      {#if trashBin}
        <div class="pb-2.5">
          <button on:click={() => (trashBin = false)}>
            <i class="ti ti-arrow-narrow-left me-1"></i>Back
          </button>
        </div>
      {:else}
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

          {#if currentUser?.role != "user"}
            <div class="flex items-center gap-2 flex-wrap">
              <select bind:value={userId} class="form-select">
                <option value={null}>Select User</option>
                {#each users as user}
                  <option value={user?.id}>{user?.name}</option>
                {/each}
              </select>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <select bind:value={byCompanyId} class="form-select">
                <option value={null}>Select Company</option>
                {#each companies as company}
                  <option value={company?.id}>{company?.name}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          {#if currentUser?.role != "user"}
            <div
              class="d-flex align-items-center shadow p-1 rounded border view-icons bg-white"
            >
              <button
                on:click={() => (trashBin = true)}
                class="flex-shrink-0 btn btn-sm p-1 border-0 fs-14 bg-primary text-white"
              >
                <i class="ti ti-trash"></i>
              </button>
            </div>
          {/if}
          <a href="/admin/workorder/add" class="btn btn-primary">
            <i class="ti ti-square-rounded-plus-filled me-1"></i>Add New Work
            Order
          </a>
        </div>
      {/if}
    </div>
    <!-- table header -->

    <!-- card start -->
    <div class="card border-0 rounded-0">
      <div class="card-body">
        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...workorders]}
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
    <!-- card end -->
  </div>
  <!-- End Content -->
</div>
