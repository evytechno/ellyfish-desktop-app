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
  let loadingData = true;

  let currentUser;
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
  let firstLoad = false;
  onMount(() => {
    const filterState = $dashboardFilterStore;

    userId = filterState.userId || null;
    searchTerm = filterState.searchTerm || "";
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;

    fetchOrders(), fetchActivity(), fetchOrdersStats();

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
      let newData = data.filter((order) => order.deletedAt == null);
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
    if (firstLoad) {
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
  <!-- Start Content -->
  <div class="content pb-0">
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
          <!-- end card body -->
        </div>
        <!-- end card -->
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
          <!-- end card body -->
        </div>
        <!-- end card -->
      </div>
      <div>
        <div class="card flex-fill">
          <div
            class="card-header flex items-center justify-between flex-wrap row-gap-3"
          >
            <h6 class="mb-0 py-2">Recently Orders</h6>
          </div>
          <div class="card-body">
            <div class="table-responsive custom-table">
              <div class="dataTables_wrapper dt-bootstrap5 no-footer">
                <table class="table dataTable table-nowrap no-footer">
                  <thead class="table-light">
                    <tr>
                      <th>Name</th>
                      <th>Price (₹)</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#if orders?.length}
                      {#each orders as order, index}
                        {#if index < 7}
                          <tr id={index}>
                            <td>
                              <a
                                href={`/admin/order/${order?.id}`}
                                class="fw-medium"
                              >
                                {order?.title}
                              </a>
                            </td>
                            <td>
                              {new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: order?.currency || "INR",
                              })
                                .format(order?.price || 0)
                                .replace("₹", "₹ ")}
                            </td>
                            <td>
                              <span
                                class={`badge badge-pill text-white ${statusesColors[order?.status] || "bg-gray"}`}
                                >{order?.status}</span
                              >
                            </td>
                          </tr>
                        {/if}
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
      <div>
        <div class="card flex-fill">
          <div
            class="card-header flex items-center justify-between flex-wrap row-gap-3"
          >
            <h6 class="mb-0 py-2">Recently Activity</h6>
          </div>
          <div class="card-body">
            <div class="table-responsive custom-table">
              <div class="dataTables_wrapper dt-bootstrap5 no-footer">
                <table class="table dataTable table-nowrap no-footer">
                  <thead class="table-light">
                    <tr>
                      <th>Order</th>
                      <th>Title</th>
                      <!-- <th>Description</th> -->
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#if activities?.length}
                      {#each activities as activity}
                        <tr>
                          <td>
                            <a
                              href={`/admin/order/${activity?.order?.id}`}
                              class="fw-medium"
                            >
                              {activity?.order?.title}
                            </a>
                          </td>
                          <td>{activity?.title}</td>
                          <!-- <td>{activity?.description}</td> -->
                          <td
                            >{activity?.createdAt &&
                              new Date(activity.createdAt).toLocaleString(
                                "en-GB",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                },
                              )}</td
                          >
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
