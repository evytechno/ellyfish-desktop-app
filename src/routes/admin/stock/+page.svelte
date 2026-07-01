<script>
  import { onMount } from "svelte";
  import { authApiFetch, apiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { STORE_BASE_URL } from "$lib/constants/constants";
  import Loader from "$lib/components/Loader.svelte";
  import { companiesAllStore, usersAllStore } from "$lib/stores/dataStores";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { checkAuth } from "$lib/utils/auth";
  let currentUser = null;

  let loadingData = true;

  let components = [];
  let users = [];
  let companies = [];

  let trashBin = false;

  let userId = null;
  let companyId = null;
  let searchTerm = "";
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 1000;
  let totalPages = 30;
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;
  let orderBy = "createdAt";
  let searchString = "";

  let viewType = "grid";

  let loading = false;
  let errorMessage = "";

  let componentName = "";
  let componentId = "";
  let availableStock = "";
  let requestStock = "";
  let packingType = "";

  let formErrors = {};

  import { orderActivityFilterStore } from "$lib/stores/filterStore";
  import { get } from "svelte/store";
  let firstLoad = false;
  onMount(async () => {
    currentUser = checkAuth();
    if (currentUser?.role != "user") {
      viewType = "list";
    }

    const filterState = $orderActivityFilterStore;

    userId = filterState.userId || null;
    companyId = filterState.companyId || null;
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;
    orderBy = filterState.orderBy || "createdAt";

    fetchComponents();

    setTimeout(() => {
      firstLoad = true;
    }, 500);

    {
      const cachedUsers = get(usersAllStore);
      if (cachedUsers && cachedUsers.length > 0) {
        users = cachedUsers;
      } else {
        try {
          const data = await authApiFetch(API_ROUTES.USER + "/all");
          users = data;
          usersAllStore.set(data);
        } catch (err) {
          errorMessage = "Failed to load user data.";
        }
      }
    }

    {
      const cachedCompanies = get(companiesAllStore);
      if (cachedCompanies && cachedCompanies.length > 0) {
        companies = cachedCompanies;
      } else {
        try {
          const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
          companies = data;
          companiesAllStore.set(data);
        } catch (err) {
          errorMessage = "Failed to load company data.";
        }
      }
    }
  });

  let refresh = false;
  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      try {
        await Promise.all([fetchComponents()]);
      } catch (error) {
      } finally {
        refresh = false;
      }
    }, 200);
  }

  async function fetchComponents() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        page: (currentPage - 1).toString(),
        size: rowsPerPage.toString(),
        keyword: searchTerm || "",
      });

      const response = await fetch(
        `${STORE_BASE_URL}/component/for-sales?${query.toString()}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      components = data?.content || [];
      totalPages = data?.totalPages || 0;
      totalItems = data?.totalElements || 0;
    } catch (error) {
      errorHandle(error);
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

  $: [searchTerm, rowsPerPage, currentPage], checkFetchRecord();

  function checkFetchRecord() {
    if (firstLoad) {
      fetchComponents();
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
      key: "componentName",
      label: "Title",
    },
    {
      key: "availableQuantity",
      label: "Available Stock",
    },
    {
      key: "status",
      label: "Status",
    },
  ];

  let actions = [
    {
      label: "Request",
      icon: "ti ti-square-plus-2",
      onClick: (id) => requestStockUpdate(id),
      color: "btn-soft-success",
    },
  ];

  function showModalMenual(id) {
    const $ = jQuery;

    if (!$(".modal-backdrop").length) {
      $("body").append('<div class="modal-backdrop fade show"></div>');
    }
    $(id).addClass("show d-block");
    $("body")
      .addClass("modal-open")
      .css({ overflow: "hidden", paddingRight: "0px" });
  }

  async function addRequest(e) {
    e.preventDefault();
    loading = false;
    return;
    errorMessage = "";
    loading = true;
    formErrors = {};

    const clientPayload = {
      componentName,
      componentId,
      availableStock,
      requestStock,
      packingType,
    };

    try {
      const data = await authApiFetch(API_ROUTES.ORDER_CLIENT, {
        method: "POST",
        data: JSON.stringify(clientPayload),
      });

      // Reset Form
      componentName = "";
      componentId = "";
      availableStock = "";
      requestStock = "";
      packingType = "";

      formErrors = {};

      if (data) {
        Swal.fire("Success!", data.message, "success");
        closeModalMenual("#create_request");
      }
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
  async function requestStockUpdate(id) {
    let component = components.find((order) => order.id == id);

    componentName = component?.displayName;
    componentId = component?.id;
    availableStock = component?.availableStock;

    showModalMenual("#create_request");
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
          Stock
          <span class="text-xs font-normal">
            {searchString ? `(${searchString})` : ""}
          </span>
        </h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Stock</li>
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

    <!-- card start -->
    <div class="card border-0 rounded-0">
      <div class="card-body">
        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...components]}
          {currentPage}
          {rowsPerPage}
          {totalItems}
          {totalPages}
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
  </div>
  <!-- End Content -->
</div>

<!-- Create Request -->
<div class="modal fade" id="create_request" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Create Request</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
        </button>
      </div>
      <form
        on:submit={addRequest}
        class="needs-validation space-y-4"
        novalidate
      >
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="componentName">
                Name <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="componentName"
                class="form-control"
                class:is-invalid={formErrors.componentName}
                bind:value={componentName}
                required
                id="componentName"
                placeholder="Name"
              />
              {#if formErrors.componentName}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.componentName[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="availableStock">
                Available Quantity <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="availableStock"
                class="form-control"
                class:is-invalid={formErrors.availableStock}
                bind:value={availableStock}
                required
                id="availableStock"
                placeholder="Available Quantity"
              />
              {#if formErrors.availableStock}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.availableStock[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="requestStock">
                Request Quantity <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="requestStock"
                class="form-control"
                class:is-invalid={formErrors.requestStock}
                bind:value={requestStock}
                required
                id="requestStock"
                placeholder="Request Quantity"
              />
              {#if formErrors.requestStock}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.requestStock[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="packingType">
                Packing Type <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="packingType"
                class="form-control"
                class:is-invalid={formErrors.packingType}
                bind:value={packingType}
                required
                id="packingType"
                placeholder="Packing Type"
              />
              {#if formErrors.packingType}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.packingType[0]}</li>
                </ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">
            Cancel
          </button>
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create New"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
<!-- /Create Client -->
