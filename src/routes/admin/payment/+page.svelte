<script>
  import { onMount } from "svelte";
  import jQuery from "jquery";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { goto } from "$app/navigation";
  import {
    companiesAllStore,
    usersAllStore,
    getFromLocalStorage,
    saveToLocalStorage,
  } from "$lib/stores/dataStores";
  import Loader from "$lib/components/Loader.svelte";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  let loadingData = true;

  import { checkAuth } from "$lib/utils/auth";
  let currentUser = null;

  let payments = [];
  let companies = [];
  let users = [];

  let trashBin = false;

  let formType = "Create";
  let updateInvoice = null;

  let userId = null;
  let byCompanyId = null;
  let searchTerm = "";
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;

  // Form state
  let title = null;
  let companyId = null;
  let paymentDate = null;
  let files = null;
  let images = null;
  let items = [];
  let status = "Unpaid";
  let remarks = "";
  let adminStatus = false;

  let loading = false;
  let errorMessage = "";

  let formErrors = {};

  import { paymentFilterStore } from "$lib/stores/filterStore";
  import { get } from "svelte/store";
  let firstLoad = false;
  onMount(() => {
    currentUser = checkAuth();

    const filterState = $paymentFilterStore;

    userId = filterState.userId || null;
    byCompanyId = filterState.byCompanyId || null;
    searchTerm = filterState.searchTerm || "";
    currentPage = filterState.currentPage || 1;
    rowsPerPage = filterState.rowsPerPage || 10;
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;

    fetchUserPayments();
    getAllUsers();
    getAllCompanies();

    setTimeout(() => {
      firstLoad = true;
    }, 500);
  });

  const updateFilterStore = (newValues) => {
    paymentFilterStore.update((currentState) => {
      return { ...currentState, ...newValues };
    });
  };

  function handleFilesChange(event) {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length > 0) {
      files = selectedFiles;
    }
  }

  let isDragging = false;

  function handleDragOver(event) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleDrop(event) {
    event.preventDefault();
    isDragging = false;
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) {
      files = dropped;
    }
  }

  function closeOffcanvas() {
    const $ = jQuery;
    $("#offcanvas_add").removeClass("show");
    $(".offcanvas-backdrop").remove();
    $("body").css({ overflow: "", paddingRight: "" });
  }

  function resetForm() {
    title = "";
    companyId = null;
    items = [];
    paymentDate = null;
    files = null;
    status = "Unpaid";
    remarks = "";
    adminStatus = false;
  }

  $: subtotal = items.reduce((sum, item) => sum + item.price, 0);
  $: total = Math.round(subtotal);

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors

    const userPaymentPayload = new FormData();
    if (files) {
      files.forEach((file) => userPaymentPayload.append("files", file));
    }
    if (paymentDate) {
      userPaymentPayload.append("paymentDate", paymentDate);
    }
    if (title && title !== "") {
      userPaymentPayload.append("title", title);
    }
    userPaymentPayload.append("companyId", companyId);
    userPaymentPayload.append("status", status);
    userPaymentPayload.append("remarks", remarks);
    userPaymentPayload.append("items", JSON.stringify(items));
    userPaymentPayload.append("adminStatus", adminStatus);

    if (companyId == null) {
      formErrors.companyId = ["Company is required."];
      loading = false;
      return;
    }

    if (items.length == 0) {
      Swal.fire("Warning!", "Please atleast one item add in items.", "warning");
      loading = false;
      return;
    }

    if (total == 0) {
      Swal.fire(
        "Warning!",
        "Invoice total amount zero(0) not acceptable.",
        "warning"
      );
      loading = false;
      return;
    }
    try {
      const data = await authApiFetch(API_ROUTES.USER_PAYMENT, {
        method: "POST",
        data: userPaymentPayload,
      });

      // Reset Form
      resetForm();

      payments = [data.data, ...payments];
      Swal.fire("Success!", data.message, "success");
      refreshPage();
      closeOffcanvas();
    } catch (error) {
      loading = false;
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

  async function handleUpdateSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors

    const userPaymentPayload = new FormData();
    if (files) {
      files.forEach((file) => userPaymentPayload.append("files", file));
    }
    if (paymentDate) {
      userPaymentPayload.append("paymentDate", paymentDate);
    }
    if (title && title !== "") {
      userPaymentPayload.append("title", title);
    }
    userPaymentPayload.append("companyId", companyId);
    userPaymentPayload.append("status", status);
    userPaymentPayload.append("remarks", remarks);
    userPaymentPayload.append("items", JSON.stringify(items));
    userPaymentPayload.append("adminStatus", adminStatus);

    if (companyId == null) {
      formErrors.companyId = ["Company is required."];
      loading = false;
      return;
    }
    if (items.length == 0) {
      Swal.fire("Warning!", "Please atleast one item add in items.", "warning");
      loading = false;
      return;
    }
    if (total == 0) {
      Swal.fire(
        "Warning!",
        "Invoice total amount zero(0) not acceptable.",
        "warning"
      );
      loading = false;
      return;
    }
    try {
      const data = await authApiFetch(
        API_ROUTES.USER_PAYMENT + "/" + updateInvoice.id,
        {
          method: "PUT",
          data: userPaymentPayload,
        }
      );

      // Reset Form
      resetForm();

      payments = payments.map((payment) =>
        payment.id === updateInvoice.id ? data.data : payment
      );

      formType = "Create";
      updateInvoice = null;

      Swal.fire("Success!", data.message, "success");
      refreshPage();
      closeOffcanvas();
    } catch (error) {
      loading = false;
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

  let refresh = false;
  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      try {
        await Promise.all([
          fetchUserPayments(),
          getAllUsers(),
          getAllCompanies(),
        ]);
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        refresh = false;
      }
    }, 200);
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

  async function fetchUserPayments() {
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
        const cachedData = getFromLocalStorage("payments_" + query.toString());
        if (cachedData) {
          payments = cachedData.payments;
          totalItems = cachedData.totalItems;
          return;
        }
      }
      const data = await authApiFetch(
        `${API_ROUTES.USER_PAYMENT}?${query.toString()}`,
        {
          method: "GET",
        }
      );

      payments = data.data;
      totalItems = data.total;
      saveToLocalStorage("payments_" + query.toString(), {
        payments,
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
      fetchUserPayments();
    }
  }

  function addItem() {
    items = [...items, { item: "", price: 0 }];
  }

  function removeItem(index) {
    items = items.filter((_, i) => i !== index);
  }

  $: columns = [
    {
      key: "invoiceNo",
      label: "Payment No",
      render: (val, row) => {
        return `<a href="/admin/payment/${row.id}"  class="flex items-center gap-1 text-danger">#${row?.invoiceNo?.toString().padStart(6, "0")}</a>`;
      },
    },
    {
      key: "title",
      label: "Title",
      render: (val, row) => {
        return `<div class="max-w-[300px] truncate">${val}</div>`;
      },
    },
    { key: "status", label: "Status" },
    {
      key: "paymentDate",
      label: "Payment Date",
      render: (val, row) => {
        const d = new Date(row.paymentDate);
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
            key: "user",
            label: "User",
            render: (val, row) => {
              if (!row?.user) return "-";
              const badge =
                row.user.status === "banned"
                  ? `<span class="badge bg-danger ms-1" style="font-size:10px;">Banned</span>`
                  : row.user.status === "inactive"
                  ? `<span class="badge bg-secondary ms-1" style="font-size:10px;">Inactive</span>`
                  : "";
              return `${row.user.name}${badge}`;
            },
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
  ];

  function formatDateForInput(date) {
    if (!date) return "";
    const d = new Date(date);
    return d.toISOString().split("T")[0]; // Returns YYYY-MM-DD
  }

  async function fillDataOnForm(id) {
    let newInvoice = payments.find((payment) => payment.id === id);
    if (newInvoice) {
      updateInvoice = newInvoice;
      title = newInvoice?.title;
      companyId = newInvoice?.company?.id || null;
      if (newInvoice?.paymentDate) {
        paymentDate = formatDateForInput(newInvoice?.paymentDate);
      }
      items = newInvoice?.items || [];
      images = newInvoice?.images || [];
      status = newInvoice?.status;
      remarks = newInvoice?.remarks;
      adminStatus = newInvoice?.adminStatus || false;
    }
  }

  const editRecord = async (id) => {
    const $ = jQuery;

    // Open offcanvas
    $(".offcanvas-backdrop").remove();

    // Create and insert a new backdrop
    const overlay = $('<div class="offcanvas-backdrop fade show"></div>');
    overlay.insertBefore(".main-wrapper");

    $("#offcanvas_add").addClass("show");
    $("body").css({ overflow: "hidden", paddingRight: "15px" });
    formType = "Edit";
    fillDataOnForm(id);
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
          const data = await authApiFetch(`${API_ROUTES.USER_PAYMENT}/${id}`, {
            method: "DELETE",
          });
          payments = payments.filter((payment) => payment.id !== id); // Remove from local list
          Swal.fire("Deleted!", data.message, "success");
          refreshPage();
        } catch (err) {
          const validationErrors = errorHandle(err);
        }
      }
    });
  }

  function shortenFileName(name, keepStart = 8, keepEnd = 12) {
    if (name.length <= keepStart + keepEnd) return name;
    return name.slice(0, keepStart) + "..." + name.slice(-keepEnd);
  }

  $: totalAmount = payments
    .filter((payment) => payment.deletedAt == null)
    .reduce((sum, payment) => {
      return (
        sum + payment.items.reduce((itemSum, item) => itemSum + item.price, 0)
      );
    }, 0);

  $: totalPaidAmount = payments
    .filter((payment) => payment.deletedAt == null)
    .reduce((sum, payment) => {
      return (
        sum +
        payment.items.reduce(
          (itemSum, item) =>
            payment.status == "Paid" ? itemSum + item.price : 0,
          0
        )
      );
    }, 0);

  $: totalUnpaidAmount = payments
    .filter((payment) => payment.deletedAt == null)
    .reduce((sum, payment) => {
      return (
        sum +
        payment.items.reduce(
          (itemSum, item) =>
            payment.status == "Unpaid" ? itemSum + item.price : 0,
          0
        )
      );
    }, 0);
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
        <h4 class="mb-1">Employee Expenses</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">
              Employee Expenses
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
    {#if !trashBin}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div class="flex">
          <div class="card flex-fill mb-0 relative overflow-hidden">
            <div class="card-body relative z-1">
              <div class="flex items-start justify-between">
                <div>
                  <p class="fs-14 mb-1">Total Amount</p>
                  <h2 class="mb-1 fs-16">
                    ₹ {totalAmount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </h2>
                </div>
                <span
                  class="avatar avatar-md rounded-circle bg-soft-primary border border-primary"
                >
                  <i class="ti ti-wallet fs-16 text-primary"></i>
                </span>
              </div>
            </div>
            <img
              src="/assets/img/icons/elemnt-03.svg"
              alt="element-01"
              class="img-fluid position-absolute top-0 Start-0"
            />
          </div>
        </div>
        <div class="flex">
          <div class="card flex-fill mb-0 relative overflow-hidden">
            <div class="card-body relative z-1">
              <div class="flex items-start justify-between">
                <div>
                  <p class="fs-14 mb-1">Total Unpaid Amount</p>
                  <h2 class="mb-1 fs-16">
                    ₹ {totalUnpaidAmount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </h2>
                </div>
                <span
                  class="avatar avatar-md rounded-circle bg-soft-primary border border-primary"
                >
                  <i class="ti ti-wallet fs-16 text-primary"></i>
                </span>
              </div>
            </div>
            <img
              src="/assets/img/icons/elemnt-01.svg"
              alt="element-01"
              class="img-fluid position-absolute top-0 Start-0"
            />
          </div>
        </div>
        <div class="flex">
          <div class="card flex-fill mb-0 relative overflow-hidden">
            <div class="card-body relative z-1">
              <div class="flex items-start justify-between">
                <div>
                  <p class="fs-14 mb-1">Total Paid Amount</p>
                  <h2 class="mb-1 fs-16">
                    ₹ {totalPaidAmount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </h2>
                </div>
                <span
                  class="avatar avatar-md rounded-circle bg-soft-primary border border-primary"
                >
                  <i class="ti ti-wallet fs-16 text-primary"></i>
                </span>
              </div>
            </div>
            <img
              src="/assets/img/icons/elemnt-02.svg"
              alt="element-01"
              class="img-fluid position-absolute top-0 Start-0"
            />
          </div>
        </div>
      </div>
    {/if}

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
                {#each users.filter(u => u.status !== 'banned') as user}
                  <option value={user?.id}>
                    {user?.name}{user?.status === 'inactive' ? ' (Inactive)' : ''}
                  </option>
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
          <a
            href="#offcanvas_add"
            class="btn btn-primary"
            data-bs-toggle="offcanvas"
            data-bs-target="#offcanvas_add"
          >
            <i class="ti ti-square-rounded-plus-filled me-1"></i>Add New Payment
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
          data={[...payments]}
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

<!-- Add Canvas -->
<div
  class="offcanvas offcanvas-end offcanvas-large"
  tabindex="-1"
  id="offcanvas_add"
>
  <div class="offcanvas-header border-bottom">
    <h5 class="mb-0">{formType == "Create" ? "Add New" : "Update"} Payment</h5>
    <button
      type="button"
      class="btn-close custom-btn-close border p-1 me-0 d-flex align-items-center justify-content-center rounded-circle"
      data-bs-dismiss="offcanvas"
      aria-label="Close"
    >
    </button>
  </div>
  <div class="offcanvas-body">
    <form
      on:submit={formType == "Create" ? handleSubmit : handleUpdateSubmit}
      class="needs-validation space-y-4"
      novalidate
    >
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">
          <label class="form-label" for="title"
            >Title <span class="text-danger">*</span></label
          >
          <input
            type="text"
            name="title"
            class="form-control"
            class:is-invalid={formErrors.title}
            bind:value={title}
            id="title"
            placeholder="Title"
          />
          {#if formErrors.title}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.title[0]}</li>
            </ul>
          {/if}
        </div>

        <div>
          <label class="form-label" for="companyId">
            Company <span class="text-danger">*</span>
          </label>
          <select
            name="companyId"
            id="companyId"
            class="select form-control"
            class:is-invalid={formErrors.companyId}
            bind:value={companyId}
            required
          >
            <option value={null}>Select Company</option>
            {#each companies as order}
              <option value={order?.id}>{order?.name}</option>
            {/each}
          </select>
          {#if formErrors.companyId}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.companyId[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="paymentDate">Payment Date</label>
          <input
            type="date"
            name="paymentDate"
            class="form-control"
            class:is-invalid={formErrors.paymentDate}
            bind:value={paymentDate}
            id="paymentDate"
            placeholder="Payment Date"
          />
          {#if formErrors.paymentDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.paymentDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="status">Status</label>
          <select
            name="status"
            id="status"
            class="select form-control"
            class:is-invalid={formErrors.status}
            bind:value={status}
            required
          >
            <option value="">Select Status</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
          {#if formErrors.status}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.status[0]}</li>
            </ul>
          {/if}
        </div>
        {#if status === "Paid" && currentUser?.role === "master"}
          <div>
            <label class="form-label" for="adminStatus">Admin Status</label>
            <div class="flex items-center justify-start gap-2">
              <input
                type="checkbox"
                name="adminStatus"
                id="adminStatus"
                bind:checked={adminStatus}
              />
              <div>Paid</div>
            </div>
          </div>
        {/if}

        <div class="col-span-2">
          <div class="font-semibold text-black mb-2">Items :</div>
          <div>
            <div class="table-responsive mb-3">
              <table class="w-full border table-nowrap">
                <thead class="table-light border-bottom bg-gray-100">
                  <tr>
                    <th class="p-2">Name</th>
                    <th class="p-2">Price</th>
                    <th class="p-2"></th>
                  </tr>
                </thead>
                <tbody class="invoices-list-two">
                  {#each items as item, index}
                    <tr>
                      <td class="p-2">
                        <div class="input-table input-table-descripition">
                          <input
                            type="text"
                            class="form-control"
                            bind:value={item.item}
                          />
                        </div>
                      </td>
                      <td class="p-2">
                        <div>
                          <input
                            type="number"
                            class="form-control"
                            bind:value={item.price}
                          />
                        </div>
                      </td>
                      <td class="p-2">
                        <button
                          type="button"
                          on:click={() => removeItem(index)}
                          class="btn btn-icon btn-sm text-danger"
                        >
                          <i class="ti ti-xbox-x"></i>
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <!-- Add New -->
            <button
              type="button"
              on:click={() => addItem()}
              class="text-primary"
              style="cursor: pointer;"
            >
              <i class="ti ti-plus me-1"></i>Add New
            </button>
          </div>
        </div>

        <div class="col-span-2">
          <div class="border rounded p-3">
            <div class="d-flex align-items-center justify-content-between mb-3">
              <h6 class="fs-14 fw-semibold mb-0">Subtotal</h6>
              <h6 class="fs-14 fw-semibold mb-0">
                ₹ {subtotal.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </h6>
            </div>
            <div class="d-flex align-items-center justify-content-between">
              <h6 class="fs-14 fw-semibold mb-0">Total</h6>
              <h6 class="fs-14 fw-semibold mb-0">
                ₹ {total.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </h6>
            </div>
          </div>
        </div>

        <div class="col-span-2">
          <label class="form-label" for="remarks">Remarks</label>
          <textarea
            name="remarks"
            id="remarks"
            class="form-control"
            class:is-invalid={formErrors.remarks}
            bind:value={remarks}
            required
            placeholder="Remarks"
          ></textarea>

          {#if formErrors.remarks}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.remarks[0]}</li>
            </ul>
          {/if}
        </div>

        <div class="col-span-2">
          <label class="form-label" for="attachment">
            Images <span class="text-danger">*</span>
          </label>
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="file-upload drag-file w-100 d-flex border shadow align-items-center justify-content-center flex-column p-3 transition-all"
            class:bg-primary={isDragging}
            class:bg-light={!isDragging}
            style="border-style: dashed !important; border-color: {isDragging ? '#4f46e5' : '#dee2e6'} !important;"
            on:dragover={handleDragOver}
            on:dragleave={handleDragLeave}
            on:drop={handleDrop}
          >
            <span class="upload-img d-block mb-1">
              <i class="ti ti-folder-open fs-16 {isDragging ? 'text-white' : 'text-primary'}"></i>
            </span>

            {#if files && files.length > 0}
              <ul class="mb-1 fs-14 text-success flex gap-2">
                {#each files as file}
                  <li>
                    <i class="ti ti-paperclip"></i>
                    {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="mb-0 fs-14 {isDragging ? 'text-white' : 'text-dark'}">
                {#if isDragging}
                  Release to upload files
                {:else}
                  Drop your files here or
                  <a href="#browse" class="text-decoration-underline text-primary">browse</a>
                {/if}
              </p>
            {/if}

            <input
              type="file"
              name="file"
              id="attachmentFile"
              accept="application/pdf,image/*"
              multiple
              on:change={handleFilesChange}
            />
            <p class="fs-13 mb-0 {isDragging ? 'text-white' : ''}">Maximum size: 50 MB each</p>
          </div>
          <div class="row mt-4">
            {#if images && images?.length}
              {#each images as image}
                <div class="col-xxl-4 col-lg-5 mb-3">
                  <a href={ATTACHMENT_BASE_URL + image?.url} target="_blank">
                    <div class="card mb-0 hover:border-red-400">
                      <div class="card-body p-2">
                        <div
                          class="d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                        >
                          <div class="d-flex align-items-center me-3">
                            {#if image.mimeType && image.mimeType.startsWith("image")}
                              <span class="avatar border me-2">
                                <img
                                  src={ATTACHMENT_BASE_URL + image?.url}
                                  alt={image?.url}
                                  class="object-contain"
                                />
                              </span>
                            {:else}
                              <span class="avatar bg-success me-2">
                                <i class="ti ti-file-spreadsheet fs-20"></i>
                              </span>
                            {/if}
                            <div>
                              <h6
                                class="fw-medium fs-14 mb-1 trank"
                                title={image?.originalName}
                              >
                                <a
                                  href={ATTACHMENT_BASE_URL + image?.url}
                                  target="_blank"
                                >
                                  {shortenFileName(image?.originalName)}
                                </a>
                              </h6>
                              <p class="mb-0">
                                {(image.size / 1024).toFixed(2)} KB
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </a>
                </div>
              {/each}
            {/if}
          </div>

          {#if formErrors.file}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.file[0]}</li>
            </ul>
          {/if}
        </div>
      </div>
      <div class="d-flex align-items-center justify-content-end mt-4">
        <button
          type="button"
          data-bs-dismiss="offcanvas"
          class="btn btn-light me-2">Cancel</button
        >

        <button class="btn btn-primary" type="submit" disabled={loading}>
          {formType == "Create"
            ? loading
              ? "Creating..."
              : "Create New"
            : loading
              ? "Updating..."
              : "Update"}
        </button>
      </div>
    </form>
  </div>
</div>
<!-- /Add Canvas -->
