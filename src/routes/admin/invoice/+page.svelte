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
    settingStore,
    ordersAllStore,
    companiesAllStore,
    usersAllStore,
    getFromLocalStorage,
    saveToLocalStorage,
  } from "$lib/stores/dataStores";
  import Loader from "$lib/components/Loader.svelte";
  let loadingData = true;

  import { checkAuth } from "$lib/utils/auth";
  let currentUser = null;
  onMount(() => {
    currentUser = checkAuth();
  });

  let invoices = [];
  let orders = [];
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
  let searchString = "";

  // Form state
  let invoiceType = "order";
  let title = null;
  let orderId = null;
  let companyId = null;
  let invoiceDate = null;
  let poDate = null;
  let poNumber = "";
  let discount = 0;
  let totalAmountTitle = "Total Amount";
  let totalAmountValue = 0;
  let items = [];
  let extraItems = [];
  let taxItems = [
    { item: "CGST", percentage: 9, total: 0 },
    { item: "SGST", percentage: 9, total: 0 },
    { item: "IGST", percentage: 18, total: 0 },
  ];
  let priceTerms = "";
  let swiftCode = "";
  let currency = "INR";
  let paymentMethod = "Other";
  let status = "Unpaid";
  let termsConditions = "";
  let remarks = "";
  let shipToSameAsBillTo = false;

  let billToName = "";
  let billToAddress = "";
  let billToGSTNumber = "";
  let billToMobile = "";
  let billToEmail = "";

  let shipToName = "";
  let shipToAddress = "";
  let shipToGSTNumber = "";
  let shipToMobile = "";
  let shipToEmail = "";

  let loading = false;
  let errorMessage = "";

  let formErrors = {};

  import { invoiceFilterStore } from "$lib/stores/filterStore";
  import { get } from "svelte/store";
  let firstLoad = false;
  onMount(() => {
    const filterState = $invoiceFilterStore;

    userId = filterState.userId || null;
    byCompanyId = filterState.byCompanyId || null;
    searchTerm = filterState.searchTerm || "";
    currentPage = filterState.currentPage || 1;
    rowsPerPage = filterState.rowsPerPage || 10;
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;

    fetchOrderPayments();

    setTimeout(() => {
      firstLoad = true;
    }, 500);
  });

  let refresh = false;
  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      try {
        await Promise.all([
          fetchOrderPayments(),
          fetchSetting(),
          fetchAllCompanies(),
          fetchAllOrders(),
          fetchAllUsers(),
        ]);
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        refresh = false;
      }
    }, 200);
  }

  const updateFilterStore = (newValues) => {
    invoiceFilterStore.update((currentState) => {
      return { ...currentState, ...newValues };
    });
  };

  function closeOffcanvas() {
    const $ = jQuery;
    $("#offcanvas_add").removeClass("show");
    $(".offcanvas-backdrop").remove();
    $("body").css({ overflow: "", paddingRight: "" });
  }
  async function shipToChange(e) {
    if (e.target.checked) {
      shipToName = billToName;
      shipToAddress = billToAddress;
      shipToGSTNumber = billToGSTNumber;
      shipToMobile = billToMobile;
      shipToEmail = billToEmail;
    }
  }
  async function orderValueChange(e) {
    const id = Number(e.target.value); // or parseInt(e.target.value, 10)
    if (!isNaN(id)) {
      const newOrder = orders.find((order) => order.id === id);
      if (newOrder) {
        console.log("newOrder:", newOrder);
        title = newOrder.title;
        billToName = newOrder.company;
        billToGSTNumber = newOrder.gstNumber;
      } else {
        console.log("Order not found for id:", id);
      }
    } else {
      console.warn("Invalid ID: Not a number");
    }
  }

  function resetForm() {
    invoiceType = "order";
    title = "";
    items = [];
    extraItems = [];
    taxItems = [
      { item: "CGST", percentage: 9, total: 0 },
      { item: "SGST", percentage: 9, total: 0 },
      { item: "IGST", percentage: 18, total: 0 },
    ];
    orderId = null;
    companyId = null;
    invoiceDate = null;
    poDate = null;
    poNumber = "";
    discount = 0;
    totalAmountTitle = "Total Amount";
    totalAmountValue = 0;
    termsConditions = "";
    priceTerms = "";
    swiftCode = "";
    currency = "INR";
    paymentMethod = "Other";
    status = "Unpaid";
    remarks = "";

    shipToSameAsBillTo = null;

    billToName = "";
    billToAddress = "";
    billToGSTNumber = "";
    billToMobile = "";
    billToEmail = "";

    shipToName = "";
    shipToAddress = "";
    shipToGSTNumber = "";
    shipToMobile = "";
    shipToEmail = "";
  }

  $: taxItems.forEach((item) => {
    item.total = (item.percentage / 100) * subtotal;
  });

  $: subtotal = items.reduce((sum, item) => sum + item.total, 0) - discount;
  $: recalculateTaxes(), [subtotal];
  $: extratotal = extraItems.reduce((sum, item) => sum + item.total, 0);
  $: subplustotal = subtotal + extratotal;
  $: taxtotal = taxItems.reduce((sum, item) => sum + item.total, 0);
  $: total = Math.round(subplustotal + taxtotal);

  function recalculateTaxes() {
    taxItems = taxItems.map((item) => ({
      ...item,
      total: (item.percentage / 100) * subtotal,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors

    const newOrderPayment = {
      title,
      items,
      extraItems,
      taxItems,
      priceTerms,
      swiftCode,
      currency,
      paymentMethod,
      status,
      termsConditions,
      remarks,
      poNumber,
      discount,
      totalAmountTitle,
      totalAmountValue,

      billToName,
      billToAddress,
      billToGSTNumber,
      billToMobile,
      billToEmail,

      shipToName,
      shipToAddress,
      shipToGSTNumber,
      shipToMobile,
      shipToEmail,
    };
    if (invoiceDate) {
      newOrderPayment.invoiceDate = invoiceDate;
    }
    if (poDate) {
      newOrderPayment.poDate = poDate;
    }
    if (totalAmountValue == 0) {
      newOrderPayment.totalAmountValue = total;
    }
    newOrderPayment.companyId = companyId;
    if (invoiceType == "order") {
      newOrderPayment.orderId = orderId;
      if (orderId == null) {
        formErrors.orderId = ["Order is required."];
        loading = false;
        return;
      }
    }
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
      const data = await authApiFetch(API_ROUTES.ORDER_PAYMENT, {
        method: "POST",
        data: JSON.stringify(newOrderPayment),
      });

      // Reset Form
      resetForm();

      invoices = [data.data, ...invoices];
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

    const newOrderPayment = {
      title,
      items,
      extraItems,
      taxItems,
      priceTerms,
      swiftCode,
      currency,
      paymentMethod,
      status,
      termsConditions,
      remarks,
      poNumber,
      discount,
      totalAmountTitle,
      totalAmountValue,

      billToName,
      billToAddress,
      billToGSTNumber,
      billToMobile,
      billToEmail,

      shipToName,
      shipToAddress,
      shipToGSTNumber,
      shipToMobile,
      shipToEmail,
    };
    if (invoiceDate) {
      newOrderPayment.invoiceDate = invoiceDate;
    }
    if (poDate) {
      newOrderPayment.poDate = poDate;
    }
    if (totalAmountValue == 0) {
      newOrderPayment.totalAmountValue = total;
    }
    newOrderPayment.companyId = companyId;
    if (invoiceType == "order") {
      newOrderPayment.orderId = orderId;
      if (orderId == null) {
        formErrors.orderId = ["Order is required."];
        loading = false;
        return;
      }
    }
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
        API_ROUTES.ORDER_PAYMENT + "/" + updateInvoice.id,
        {
          method: "PUT",
          data: JSON.stringify(newOrderPayment),
        }
      );

      // Reset Form
      resetForm();

      invoices = invoices.map((invoice) =>
        invoice.id === updateInvoice.id ? data.data : invoice
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

  async function fetchAllOrders() {
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

  async function fetchAllCompanies() {
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

  onMount(() => {
    fetchSetting();
    fetchAllCompanies();
    fetchAllOrders();
    fetchAllUsers();
  });

  async function fetchAllUsers() {
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

  async function fetchOrderPayments() {
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
        const cachedData = getFromLocalStorage("invoices_" + query.toString());
        if (cachedData) {
          invoices = cachedData.invoices;
          totalItems = cachedData.totalItems;
          return;
        }
      }

      const data = await authApiFetch(
        `${API_ROUTES.ORDER_PAYMENT}?${query.toString()}`,
        {
          method: "GET",
        }
      );

      invoices = data.data;
      totalItems = data.total;

      saveToLocalStorage("invoices_" + query.toString(), {
        invoices,
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
      fetchOrderPayments();
    }
  }

  function addItem() {
    items = [
      ...items,
      { item: "", quantity: "0", price: 0, hsCode: "", total: 0 },
    ];
  }

  function removeItem(index) {
    items = items.filter((_, i) => i !== index);
  }

  function addExtraItem() {
    extraItems = [...extraItems, { item: "", total: 0 }];
  }

  function removeExtraItem(index) {
    extraItems = extraItems.filter((_, i) => i !== index);
  }

  function addTaxItem() {
    taxItems = [...taxItems, { item: "", percentage: 0, total: 0 }];
  }

  function removeTaxItem(index) {
    taxItems = taxItems.filter((_, i) => i !== index);
  }

  $: columns = [
    {
      key: "invoiceNo",
      label: "Invoice No",
      render: (val, row) => {
        return `<a href="/admin/invoice/${row.id}" class="flex items-center gap-1 text-danger">#${row?.invoiceNo?.toString().padStart(6, "0")}</a>`;
      },
    },
    {
      key: "order",
      label: "Order",
      render: (val, row) => {
        return `<div class="max-w-[300px] truncate">${row?.order ? row?.order?.title : row?.title ? row?.title : "-"}</div>`;
      },
    },
    { key: "status", label: "Status" },
    // { key: "paymentMethod", label: "Payment Method" },
    {
      key: "invoiceDate",
      label: "Invoice Date",
      render: (val, row) => {
        const d = new Date(row.invoiceDate);
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
      label: "Invoice",
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
    let newInvoice = invoices.find((invoice) => invoice.id === id);
    if (newInvoice) {
      console.log("newInvoice  : ", newInvoice);

      if (newInvoice?.order) {
        invoiceType = "order";
      } else {
        invoiceType = "self";
      }
      updateInvoice = newInvoice;
      title = newInvoice?.title;
      orderId = newInvoice?.order ? newInvoice?.order?.id : null;
      companyId = newInvoice?.company?.id;
      if (newInvoice?.invoiceDate) {
        invoiceDate = formatDateForInput(newInvoice?.invoiceDate);
      }
      if (newInvoice?.poDate) {
        poDate = formatDateForInput(newInvoice?.poDate);
      }
      poNumber = newInvoice?.poNumber;
      discount = newInvoice?.discount;
      totalAmountTitle = newInvoice?.totalAmountTitle || "Total Amount";
      totalAmountValue = newInvoice?.totalAmountValue || 0;
      items = newInvoice?.items || [];
      extraItems = newInvoice?.extraItems || [];
      taxItems = newInvoice?.taxItems || [];
      priceTerms = newInvoice?.priceTerms;
      swiftCode = newInvoice?.swiftCode;
      currency = newInvoice?.currency || "INR";
      paymentMethod = newInvoice?.paymentMethod;
      status = newInvoice?.status;
      termsConditions = newInvoice?.termsConditions;
      remarks = newInvoice?.remarks;

      billToName = newInvoice?.billToName;
      billToAddress = newInvoice?.billToAddress;
      billToGSTNumber = newInvoice?.billToGSTNumber;
      billToMobile = newInvoice?.billToMobile;
      billToEmail = newInvoice?.billToEmail;

      shipToName = newInvoice?.shipToName;
      shipToAddress = newInvoice?.shipToAddress;
      shipToGSTNumber = newInvoice?.shipToGSTNumber;
      shipToMobile = newInvoice?.shipToMobile;
      shipToEmail = newInvoice?.shipToEmail;
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

  const viewRecord = async (id) => {
    goto("/admin/invoice/" + id);
  };

  async function deleteRecord(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.ORDER_PAYMENT}/${id}`, {
            method: "DELETE",
          });
          invoices = invoices.filter((invoice) => invoice.id !== id); // Remove from local list
          Swal.fire("Deleted!", data.message, "success");
          refreshPage();
        } catch (err) {
          const validationErrors = errorHandle(err);
        }
      }
    });
  }

  async function fetchSetting() {
    const cached = get(settingStore);
    if (cached) {
      if (cached?.taxItems) {
        taxItems = cached?.taxItems;
      }
      loadingData = false;
      return;
    }
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.SETTING}`);
      if (data?.taxItems) {
        taxItems = data?.taxItems;
      }
      settingStore.set(data);
    } catch (error) {
      errorMessage = "Failed to load setting data.";
      console.error("Fetch error:", error);
      const validationErrors = errorHandle(error);
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
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
          Invoices
          <span class="text-xs font-normal">
            {searchString ? `(${searchString})` : ""}
          </span>
        </h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Invoices</li>
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
            {#if currentUser?.role != "user"}
              <div class="flex items-center gap-2 flex-wrap">
                <select bind:value={byCompanyId} class="form-select">
                  <option value={null}>Select Company</option>
                  {#each companies as company}
                    <option value={company?.id}>{company?.name}</option>
                  {/each}
                </select>
              </div>
            {/if}
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
            <i class="ti ti-square-rounded-plus-filled me-1"></i>Add New Invoice
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
          data={[...invoices]}
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
    <h5 class="mb-0">{formType == "Create" ? "Add New" : "Update"} Invoice</h5>
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
          <label class="form-label" for="invoiceType">
            Invoice Type <span class="text-danger">*</span>
          </label>
          <div class="flex items-center gap-2">
            <input
              type="radio"
              id="order"
              name="invoiceType"
              value="order"
              bind:group={invoiceType}
            />
            <label for="order">Order</label>

            <input
              type="radio"
              id="self"
              name="invoiceType"
              value="self"
              bind:group={invoiceType}
            />
            <label for="self">Self</label>
          </div>
        </div>

        {#if invoiceType == "order"}
          <div class="col-span-1">
            <label class="form-label" for="orderId">
              Order <span class="text-danger">*</span>
            </label>
            <select
              name="orderId"
              id="orderId"
              class="select form-control"
              class:is-invalid={formErrors.orderId}
              on:change={(e) => orderValueChange(e)}
              bind:value={orderId}
              required
            >
              <option value={null}>Select Order</option>
              {#each orders as order}
                <option value={order?.id}>{order?.title}</option>
              {/each}
            </select>
            {#if formErrors.orderId}
              <ul class="text-danger mt-1 text-xs capitalize">
                <li>{formErrors.orderId[0]}</li>
              </ul>
            {/if}
          </div>
        {:else}
          <div class="col-span-1">
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
        {/if}

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
          <label class="form-label" for="invoiceDate">Invoice Date</label>
          <input
            type="date"
            name="invoiceDate"
            class="form-control"
            class:is-invalid={formErrors.invoiceDate}
            bind:value={invoiceDate}
            id="invoiceDate"
            placeholder="Invoice Date"
          />
          {#if formErrors.invoiceDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.invoiceDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="paymentMethod">Payment Method</label>
          <select
            name="paymentMethod"
            id="paymentMethod"
            class="select form-control"
            class:is-invalid={formErrors.paymentMethod}
            bind:value={paymentMethod}
            required
          >
            <option value="">Select Payment Method</option>
            <option value="Credit Card">Credit Card</option>
            <option value="Debit Card">Debit Card</option>
            <option value="Cash">Cash</option>
            <option value="RTGS">RTGS</option>
            <option value="NEFT">NEFT</option>
            <option value="UPI">UPI</option>
            <option value="IMPS">IMPS</option>
            <option value="Other">Other</option>
          </select>
          {#if formErrors.paymentMethod}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.paymentMethod[0]}</li>
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
        <div>
          <label class="form-label" for="priceTerms">Price Terms</label>
          <input
            type="text"
            name="priceTerms"
            class="form-control"
            class:is-invalid={formErrors.priceTerms}
            bind:value={priceTerms}
            id="priceTerms"
            placeholder="Price Terms"
          />
          {#if formErrors.priceTerms}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.priceTerms[0]}</li>
            </ul>
          {/if}
        </div>

        <div>
          <label class="form-label" for="currency">Currency</label>
          <select
            name="currency"
            id="currency"
            class="select form-control"
            class:is-invalid={formErrors.currency}
            bind:value={currency}
            required
          >
            {#each currencies as currency}
              <option value={currency.code}>{currency.code}</option>
            {/each}
          </select>
          {#if formErrors.currency}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.currency[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="swiftCode">Swift Code</label>
          <input
            type="text"
            name="swiftCode"
            class="form-control"
            class:is-invalid={formErrors.swiftCode}
            bind:value={swiftCode}
            id="swiftCode"
            placeholder="Swift Code"
          />
          {#if formErrors.swiftCode}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.swiftCode[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="poNumber">PO Number</label>
          <input
            type="text"
            name="poNumber"
            class="form-control"
            class:is-invalid={formErrors.poNumber}
            bind:value={poNumber}
            id="poNumber"
            placeholder="PO Number"
          />
          {#if formErrors.poNumber}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.poNumber[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="poDate">PO Date</label>
          <input
            type="date"
            name="poDate"
            class="form-control"
            class:is-invalid={formErrors.poDate}
            bind:value={poDate}
            id="poDate"
            placeholder="PO Date"
          />
          {#if formErrors.poDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.poDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div class="col-span-2 border-top pt-2">
          <h6 class="m-0">Bill To</h6>
        </div>
        <div>
          <label class="form-label" for="billToName">Name</label>
          <input
            type="text"
            name="billToName"
            class="form-control"
            class:is-invalid={formErrors.billToName}
            bind:value={billToName}
            id="billToName"
            placeholder="Name"
          />
          {#if formErrors.billToName}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.billToName[0]}</li>
            </ul>
          {/if}
        </div>

        <div>
          <label class="form-label" for="billToEmail">Email</label>
          <input
            type="text"
            name="billToEmail"
            class="form-control"
            class:is-invalid={formErrors.billToEmail}
            bind:value={billToEmail}
            id="billToEmail"
            placeholder="Email"
          />
          {#if formErrors.billToEmail}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.billToEmail[0]}</li>
            </ul>
          {/if}
        </div>

        <div>
          <label class="form-label" for="billToMobile">Mobile</label>
          <input
            type="text"
            name="billToMobile"
            class="form-control"
            class:is-invalid={formErrors.billToMobile}
            bind:value={billToMobile}
            id="billToMobile"
            placeholder="Mobile"
          />
          {#if formErrors.billToMobile}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.billToMobile[0]}</li>
            </ul>
          {/if}
        </div>

        <div>
          <label class="form-label" for="billToGSTNumber">GST Number</label>
          <input
            type="text"
            name="billToGSTNumber"
            class="form-control"
            class:is-invalid={formErrors.billToGSTNumber}
            bind:value={billToGSTNumber}
            id="billToGSTNumber"
            placeholder="GST Number"
          />
          {#if formErrors.billToGSTNumber}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.billToGSTNumber[0]}</li>
            </ul>
          {/if}
        </div>
        <div class="col-span-2">
          <label class="form-label" for="billToAddress">Address</label>
          <textarea
            name="billToAddress"
            id="billToAddress"
            class="form-control"
            class:is-invalid={formErrors.billToAddress}
            bind:value={billToAddress}
            required
            placeholder="Address"
          ></textarea>

          {#if formErrors.billToAddress}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.billToAddress[0]}</li>
            </ul>
          {/if}
        </div>
        <div class="col-span-2">
          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              name="shipToSameAsBillTo"
              bind:checked={shipToSameAsBillTo}
              id="shipToSameAsBillTo"
              placeholder="shipToSameAsBillTo"
              on:change={(e) => shipToChange(e)}
            />
            <label class="form-label" for="shipToSameAsBillTo">
              Ship To same as Bill To
            </label>
          </div>
        </div>
        <div class="col-span-2 border-top pt-2">
          <h6 class="m-0">Ship To</h6>
        </div>
        <div>
          <label class="form-label" for="shipToName">Name</label>
          <input
            type="text"
            name="shipToName"
            class="form-control"
            class:is-invalid={formErrors.shipToName}
            bind:value={shipToName}
            id="shipToName"
            placeholder="Name"
          />
          {#if formErrors.shipToName}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.shipToName[0]}</li>
            </ul>
          {/if}
        </div>

        <div>
          <label class="form-label" for="shipToEmail">Email</label>
          <input
            type="text"
            name="shipToEmail"
            class="form-control"
            class:is-invalid={formErrors.shipToEmail}
            bind:value={shipToEmail}
            id="shipToEmail"
            placeholder="Email"
          />
          {#if formErrors.shipToEmail}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.shipToEmail[0]}</li>
            </ul>
          {/if}
        </div>

        <div>
          <label class="form-label" for="shipToMobile">Mobile</label>
          <input
            type="text"
            name="shipToMobile"
            class="form-control"
            class:is-invalid={formErrors.shipToMobile}
            bind:value={shipToMobile}
            id="shipToMobile"
            placeholder="Mobile"
          />
          {#if formErrors.shipToMobile}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.shipToMobile[0]}</li>
            </ul>
          {/if}
        </div>

        <div>
          <label class="form-label" for="shipToGSTNumber">GST Number</label>
          <input
            type="text"
            name="shipToGSTNumber"
            class="form-control"
            class:is-invalid={formErrors.shipToGSTNumber}
            bind:value={shipToGSTNumber}
            id="shipToGSTNumber"
            placeholder="GST Number"
          />
          {#if formErrors.shipToGSTNumber}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.shipToGSTNumber[0]}</li>
            </ul>
          {/if}
        </div>
        <div class="col-span-2">
          <label class="form-label" for="shipToAddress">Address</label>
          <textarea
            name="shipToAddress"
            id="shipToAddress"
            class="form-control"
            class:is-invalid={formErrors.shipToAddress}
            bind:value={shipToAddress}
            required
            placeholder="Address"
          ></textarea>

          {#if formErrors.shipToAddress}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.shipToAddress[0]}</li>
            </ul>
          {/if}
        </div>

        <div class="col-span-2 border-top"></div>

        <div class="col-span-2">
          <div class="font-semibold text-black mb-2">Items :</div>
          <div>
            <div class="table-responsive mb-3">
              <table class="w-full border table-nowrap">
                <thead class="table-light border-bottom bg-gray-100">
                  <tr>
                    <th class="p-2">Item</th>
                    <th class="p-2">Quantity</th>
                    <th class="p-2">Unit Price</th>
                    <th class="p-2">HS Code</th>
                    <th class="p-2">Total</th>
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
                            type="text"
                            class="form-control"
                            bind:value={item.quantity}
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
                        <div>
                          <input
                            type="text"
                            class="form-control"
                            bind:value={item.hsCode}
                          />
                        </div>
                      </td>
                      <td class="p-2">
                        <div>
                          <input
                            type="number"
                            class="form-control"
                            bind:value={item.total}
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
          <div class="font-semibold text-black mb-2">Extra Items :</div>
          <div>
            <div class="table-responsive mb-3">
              <table class="w-full border table-nowrap">
                <thead class="table-light border-bottom bg-gray-100">
                  <tr>
                    <th class="p-2">Name</th>
                    <th class="p-2">Total Price</th>
                    <th class="p-2"></th>
                  </tr>
                </thead>
                <tbody class="invoices-list-two">
                  {#each extraItems as item1, index1}
                    <tr>
                      <td class="p-2">
                        <div class="input-table input-table-descripition">
                          <input
                            type="text"
                            class="form-control"
                            bind:value={item1.item}
                          />
                        </div>
                      </td>
                      <td class="p-2">
                        <div>
                          <input
                            type="number"
                            class="form-control"
                            bind:value={item1.total}
                          />
                        </div>
                      </td>
                      <td class="p-2">
                        <button
                          type="button"
                          on:click={() => removeExtraItem(index1)}
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
              on:click={() => addExtraItem()}
              class="text-primary"
              style="cursor: pointer;"
            >
              <i class="ti ti-plus me-1"></i>Add New
            </button>
          </div>
        </div>

        <div class="col-span-2">
          <div class="font-semibold text-black mb-2">Tax Items :</div>
          <div>
            <div class="table-responsive mb-3">
              <table class="w-full border table-nowrap">
                <thead class="table-light border-bottom bg-gray-100">
                  <tr>
                    <th class="p-2">Name</th>
                    <th class="p-2">Percentage (%)</th>
                    <th class="p-2">Total Price</th>
                    <th class="p-2"></th>
                  </tr>
                </thead>
                <tbody class="invoices-list-two">
                  {#each taxItems as item2, index2}
                    <tr>
                      <td class="p-2">
                        <div class="input-table input-table-descripition">
                          <input
                            type="text"
                            class="form-control"
                            bind:value={item2.item}
                          />
                        </div>
                      </td>
                      <td class="p-2">
                        <div>
                          <input
                            type="number"
                            disabled
                            class="form-control"
                            on:change={(taxItems[index2].total =
                              (item2.percentage / 100) * subtotal)}
                            bind:value={item2.percentage}
                          />
                        </div>
                      </td>
                      <td class="p-2">
                        <div>
                          <input
                            type="number"
                            class="form-control"
                            disabled
                            value={item2?.total.toFixed(2)}
                          />
                        </div>
                      </td>
                      <td class="p-2">
                        <button
                          type="button"
                          on:click={() => removeTaxItem(index2)}
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
              on:click={() => addTaxItem()}
              class="text-primary"
              style="cursor: pointer;"
            >
              <i class="ti ti-plus me-1"></i>Add New
            </button>
          </div>
        </div>

        <div class="col-span-2">
          <label class="form-label" for="discount">Discount</label>
          <input
            type="number"
            min="0"
            max={subtotal}
            name="discount"
            class="form-control"
            class:is-invalid={formErrors.discount}
            bind:value={discount}
            id="discount"
            placeholder="Discount"
          />
          {#if formErrors.discount}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.discount[0]}</li>
            </ul>
          {/if}
        </div>

        <div>
          <label class="form-label" for="totalAmountTitle"
            >Total Amount Title</label
          >
          <input
            type="text"
            name="totalAmountTitle"
            class="form-control"
            class:is-invalid={formErrors.totalAmountTitle}
            bind:value={totalAmountTitle}
            id="totalAmountTitle"
            placeholder="Total Amount Title"
          />
          {#if formErrors.totalAmountTitle}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.totalAmountTitle[0]}</li>
            </ul>
          {/if}
        </div>

        <div>
          <label class="form-label" for="totalAmountValue"
            >Total Amount Value</label
          >
          <input
            type="number"
            name="totalAmountValue"
            class="form-control"
            min="0"
            class:is-invalid={formErrors.totalAmountValue}
            bind:value={totalAmountValue}
            id="totalAmountValue"
            placeholder="Total Amount Value"
          />
          {#if formErrors.totalAmountValue}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.totalAmountValue[0]}</li>
            </ul>
          {/if}
        </div>
        <div class="col-span-2">
          <div class="border rounded p-3">
            <div class="d-flex align-items-center justify-content-between mb-3">
              <h6 class="fs-14 fw-semibold mb-0">Subtotal</h6>
              <h6 class="fs-14 fw-semibold mb-0">
                {currencies.find((c) => c.code === currency)?.symbol}
                {subplustotal.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </h6>
            </div>
            {#if typeof discount === "number" && !isNaN(discount) && discount !== 0}
              <div
                class="d-flex align-items-center justify-content-between mb-3"
              >
                <h6 class="fs-14 fw-semibold mb-0">Discount</h6>
                <h6 class="fs-14 fw-semibold mb-0">
                  {currencies.find((c) => c.code === currency)?.symbol}
                  {discount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </h6>
              </div>
            {/if}
            {#each taxItems as item, index}
              {#if item.item}
                <div
                  class="d-flex align-items-center justify-content-between mb-3"
                >
                  <h6 class="fs-14 fw-semibold mb-0">
                    {item.item}
                    {#if item.percentage != 0}
                      ({item.percentage}%)
                    {/if}
                  </h6>
                  <h6 class="fs-14 fw-semibold mb-0">
                    {currencies.find((c) => c.code === currency)?.symbol}
                    {item.total.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </h6>
                </div>
              {/if}
            {/each}
            <div class="d-flex align-items-center justify-content-between">
              <h6 class="fs-14 fw-semibold mb-0">Total</h6>
              <h6 class="fs-14 fw-semibold mb-0">
                {currencies.find((c) => c.code === currency)?.symbol}
                {total.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </h6>
            </div>
          </div>
        </div>

        <div class="col-span-2">
          <label class="form-label" for="termsConditions">
            Terms & Conditions
          </label>
          <textarea
            name="termsConditions"
            id="termsConditions"
            class="form-control"
            class:is-invalid={formErrors.termsConditions}
            bind:value={termsConditions}
            required
            placeholder="Terms & Conditions"
          ></textarea>

          {#if formErrors.termsConditions}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.termsConditions[0]}</li>
            </ul>
          {/if}
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
