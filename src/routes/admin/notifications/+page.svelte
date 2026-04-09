<script>
  import { createEventDispatcher, onDestroy, onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { formatDistanceToNow } from "date-fns";
  import { API_BASE_URL } from "$lib/constants/constants";
  import { goto } from "$app/navigation";
  import { notificationFilterStore } from "$lib/stores/filterStore";
  import Pagination from "$lib/components/Pagination.svelte";
  import { usersAllStore } from "$lib/stores/dataStores";
  import Loader from "$lib/components/Loader.svelte";
  let loadingData = true;

  import { checkAuth } from "$lib/utils/auth";
  import { get } from "svelte/store";
  let currentUser = null;
  onMount(() => {
    currentUser = checkAuth();
  });

  let notifications = [];
  let orders = [];
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

  let loading = true;
  let errorMessage = "";
  let formErrors = {};

  let firstLoad = false;
  onMount(() => {
    fetchNotifications();

    setTimeout(() => {
      firstLoad = true;
    }, 500);
  });

  let eventSource;
  onMount(() => {
    eventSource = new EventSource(
      `${API_BASE_URL}/${API_ROUTES.NOTIFICATION}/sse`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data?.data?.user?.id === currentUser?.id) {
        notifications = [data.data, ...notifications];
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE error:", err);
      eventSource.close();
    };
  });

  onDestroy(() => {
    eventSource?.close();
  });

  const updateFilterStore = (newValues) => {
    notificationFilterStore.update((currentState) => {
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
        await Promise.all([fetchNotifications()]);
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        refresh = false;
      }
    }, 200);
  }

  async function fetchNotifications() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        page: currentPage.toString(),
        limit: rowsPerPage.toString(),
        search: searchTerm || "",
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

      updateFilterStore({
        userId,
        searchTerm,
        currentPage,
        rowsPerPage,
        selectedFilter,
        customStartDate,
        customEndDate,
      });

      const data = await authApiFetch(
        `${API_ROUTES.NOTIFICATION}?${query.toString()}`,
        { method: "GET" }
      );

      notifications = data.data;
      totalItems = data.total;
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
      currentPage = 1; // Reset to first page
      fetchNotifications();
    }, 300);
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
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
        return;
      }
      fetchNotifications();
    }
  }

  async function readNotification(id) {
    errorMessage = "";
    loading = true;
    formErrors = {};

    const updateNotification = {
      read: true,
    };

    try {
      const data = await authApiFetch(API_ROUTES.NOTIFICATION + "/" + id, {
        method: "PUT",
        data: JSON.stringify(updateNotification),
      });

      notifications.map((notification) =>
        notification.id === data.data.id
          ? { ...notification, read: data.data.read }
          : notification
      );
      notifications = [...notifications];
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      console.log("formErrors : ", formErrors);
      loading = false;
    }
  }
  $: totalPages = Math.ceil(totalItems / rowsPerPage);

  function goToPage(page) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
      fetchNotifications();
    }
  }

  function handleRowsPerPageChange(value) {
    rowsPerPage = value;
    currentPage = 1; // Reset to first page
    fetchNotifications();
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
        <h4 class="mb-1">Notifications</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">
              Notifications
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
        {/if}
      </div>
    </div>
    <!-- table header -->

    <!-- card start -->
    <div class="card mb-0">
      <div
        class="card-header d-flex align-items-center flex-wrap gap-2 justify-content-between"
      >
        <h6 class="d-inline-flex align-items-center mb-0">
          Total Notifications <span class="badge bg-danger ms-2"
            >{totalItems}</span
          >
        </h6>
        <!-- <div class="d-flex align-items-center gap-2 flex-wrap">
          <a href="#read" class="btn btn-light">
            <i class="ti ti-checks me-1"></i>Mark all as read
          </a>
          <a href="#DeleteAll" class="btn btn-danger">
            <i class="ti ti-trash me-1"></i>Delete All
          </a>
        </div> -->
      </div>

      <div class="card-body">
        {#if notifications.length}
          {#each notifications as notification}
            <div class="card notication-card">
              <div class="card-body">
                <div
                  class="d-flex align-items-center justify-content-between flex-wrap gap-2"
                >
                  <div class="d-flex align-items-center">
                    <a
                      href="employee-details.html"
                      class="avatar flex-shrink-0"
                    >
                      <img
                        src="/assets/img/profiles/user.png"
                        alt="img"
                        class="rounded-circle"
                      />
                    </a>
                    <div class="ms-2">
                      <div>
                        {#if notification?.type === "OrderReminder"}
                          <p class="mb-1 text-wrap">
                            Hey, <span class="text-dark fw-medium"
                              >{notification?.user?.name}</span
                            >
                            – Check order '<button
                              on:click={goto(
                                "/admin/order/" + notification?.order?.id
                              )}
                              class="text-dark fw-medium cursor-pointer"
                              >{notification?.order?.title}</button
                            >' for “<span class="text-dark"
                              >{notification?.message}</span
                            >”
                          </p>
                        {:else}
                          <p class="mb-1 text-wrap">
                            Hey, <span class="text-dark fw-medium"
                              >{notification?.user?.name}</span
                            >
                            – “<span class="text-dark"
                              >{notification?.message}</span
                            >”
                          </p>
                        {/if}
                        <!-- <p class="mb-1">
                        <a href="#user" class="fw-medium">
                          {notification?.user?.name}
                        </a>
                      </p>
                      <p class="mb-0">{notification?.message}</p> -->
                        <p class="fs-12 mb-0 d-inline-flex align-items-center">
                          <i class="ti ti-clock me-1"> </i>
                          {notification?.createdAt &&
                            formatDistanceToNow(
                              new Date(notification.createdAt),
                              { addSuffix: true, includeSeconds: false }
                            ).replace("about ", "")}
                          {#if notification?.read === false}
                            <button
                              type="button"
                              on:click={() =>
                                readNotification(notification?.id)}
                              class="ms-2"
                            >
                              <i
                                class="ti ti-point-filled text-danger fs-16 lh-sm"
                              ></i>
                            </button>
                          {/if}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        {:else}
          <div class="card notication-card">
            <div class="card-body">
              <div
                class="d-flex align-items-center justify-content-between flex-wrap gap-2"
              >
                <div class="d-flex align-items-center">
                  <div class="ms-2">
                    <div>
                      <p class="mb-0">
                        {loading ? "Loading..." : "No Records Found."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}
        <!-- Pagination & Rows Per Page -->
        <Pagination
          {currentPage}
          {totalPages}
          {rowsPerPage}
          on:pageChange={(e) => goToPage(e.detail)}
          on:rowsPerPageChange={(e) => handleRowsPerPageChange(e.detail)}
        />
      </div>
    </div>
    <!-- card start -->
  </div>
  <!-- End Content -->
</div>
