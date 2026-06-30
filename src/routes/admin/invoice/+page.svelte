<script>
  import { onMount, tick } from "svelte";
  import jQuery from "jquery";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import OrderSearchSelect from "$lib/components/OrderSearchSelect.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import {
    settingStore,
    companiesAllStore,
    usersAllStore,
    getFromLocalStorage,
    saveToLocalStorage,
  } from "$lib/stores/dataStores";
  import Loader from "$lib/components/Loader.svelte";
  let loadingData = true;

  import { checkAuth } from "$lib/utils/auth";
  let currentUser = null;
  onMount(async () => {
    currentUser = checkAuth();

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

    fetchSetting();
    fetchAllCompanies();
    fetchAllUsers();

    const fromOrderId = $page.url.searchParams.get("fromOrder");
    if (fromOrderId) {
      goto(`/admin/invoice/add?fromOrder=${fromOrderId}`);
    }
  });

  let invoices = [];
  let companies = [];
  // Order search select state
  let selectedOrderTitle = "";
  let orderSelectKey = 0;
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

  let selectedBankAccount = null;

  let loading = false;
  let errorMessage = "";
  let piWarning = null;

  let formErrors = {};

  import { invoiceFilterStore } from "$lib/stores/filterStore";
  import { get } from "svelte/store";
  let firstLoad = false;

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
  async function scrollToFirstError() {
    await tick();
    const body = document.querySelector("#offcanvas_add .offcanvas-body");
    const firstError = body?.querySelector(".is-invalid");
    if (firstError) {
      firstError.scrollIntoView({ behavior: "smooth", block: "center" });
      firstError.focus?.();
    }
  }

  async function orderValueChange(id) {
    piWarning = null;
    if (!id || isNaN(id) || id <= 0) return;
    if (formType === "Create") {
      try {
        const check = await authApiFetch(`${API_ROUTES.ORDER_PAYMENT}/check/${id}`);
        if (check.count > 0) {
          const labels = check.items
            .map((p) => `PI ${p.financialYear}/${String(p.invoiceNo).padStart(6, "0")}`)
            .join(", ");
          piWarning = `This order already has ${check.count} PI(s): ${labels}`;
        }
      } catch (err) {
        console.error("PI duplicate check failed", err);
      }
    }
    try {
      const order = await authApiFetch(API_ROUTES.ORDER + "/" + id);
      if (!order) return;

      const client = order.orderClients?.[0];

      // Order-level fields
      if (order.title)          title           = order.title;
      if (order.currency)       currency        = order.currency;
      if (order.priceTerms)     priceTerms      = order.priceTerms;
      if (order.termsCondition) termsConditions = order.termsCondition;

      // Derive bill-to values (first client preferred, fallback to order fields)
      const bName    = client?.name    || order.company  || "";
      const bEmail   = client?.email   || "";
      const bMobile  = client?.mobile  || "";
      const bAddress = client?.address || "";
      const bGST     = order.gstNumber || "";

      if (bName)    billToName      = bName;
      if (bEmail)   billToEmail     = bEmail;
      if (bMobile)  billToMobile    = bMobile;
      if (bAddress) billToAddress   = bAddress;
      if (bGST)     billToGSTNumber = bGST;

      // Ship-to mirrors bill-to from order data
      if (bName)    shipToName      = bName;
      if (bEmail)   shipToEmail     = bEmail;
      if (bMobile)  shipToMobile    = bMobile;
      if (bAddress) shipToAddress   = bAddress;
      if (bGST)     shipToGSTNumber = bGST;
    } catch (err) {
      console.error("Failed to fetch order details for auto-fill:", err);
    }
  }

  function resetForm() {
    piWarning = null;
    selectedOrderTitle = "";
    orderSelectKey++;
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

    shipToSameAsBillTo = false;

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

    selectedBankAccount = null;
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
      selectedBankAccount,

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
        await scrollToFirstError();
        return;
      }
    }
    if (companyId == null) {
      formErrors.companyId = ["Company is required."];
      loading = false;
      await scrollToFirstError();
      return;
    }
    if (items.length == 0) {
      Swal.fire("Warning!", "Please add at least one line item.", "warning");
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
      selectedBankAccount,

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
        await scrollToFirstError();
        return;
      }
    }
    if (companyId == null) {
      formErrors.companyId = ["Company is required."];
      loading = false;
      await scrollToFirstError();
      return;
    }
    if (items.length == 0) {
      Swal.fire("Warning!", "Please add at least one line item.", "warning");
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
        if (row?.order?.id) {
          const label = row.order.pId ? `#${row.order.pId} - ${row.order.title || ""}` : (row.order.title || `Order #${row.order.id}`);
          return `<a href="/admin/order/${row.order.id}" class="text-primary text-truncate d-block" style="max-width:280px" title="${label}">${label}</a>`;
        }
        return `<span class="text-muted">${row?.title || "-"}</span>`;
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
      selectedOrderTitle = newInvoice?.order ? (newInvoice.order.pId ? `#${newInvoice.order.pId} - ${newInvoice.order.title || ""}` : (newInvoice.order.title ?? "")) : "";
      orderSelectKey++;
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

      // Resolve selectedBankAccount to the exact object reference inside
      // availableBankAccounts so that Svelte's bind:value (=== comparison) matches.
      // Done here synchronously so the reactive below (which fires when companyId
      // changes) sees a non-null value and does not override with the first account.
      const stored = newInvoice?.selectedBankAccount ?? null;
      const cd = companies.find((c) => c.id === newInvoice?.company?.id);
      const bankList = (() => {
        if (!cd) return [];
        if (Array.isArray(cd.bankAccounts) && cd.bankAccounts.length > 0) return cd.bankAccounts;
        if (cd.bankName || cd.accountNumber) return [{ label: "Primary", bankName: cd.bankName || "", accountHolderName: cd.accountHolderName || "", accountNumber: cd.accountNumber || "", ifscCode: cd.ifscCode || "", branchAddress: cd.branchAddress || "" }];
        return [];
      })();
      if (stored?.accountNumber || stored?.bankName || stored?.ifscCode) {
        // Stored value exists — find the live reference by key fields
        const match = bankList.find((b) =>
          b.accountNumber === stored.accountNumber &&
          b.bankName === stored.bankName &&
          b.ifscCode === stored.ifscCode
        );
        // If match found use it; otherwise fall back to first available
        selectedBankAccount = match ?? bankList[0] ?? null;
      } else {
        // No bank account stored (null in DB) — auto-select first available
        selectedBankAccount = bankList[0] ?? null;
      }
    }
  }

  const editRecord = async (id) => {
    goto("/admin/invoice/edit/" + id);
  };

  const viewRecord = async (id) => {
    goto("/admin/invoice/" + id);
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

  $: currencySymbol = currencies.find((c) => c.code === currency)?.symbol ?? "₹";
  $: itemsGrossTotal = items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);

  function fieldError(name) {
    return formErrors[name]?.[0] ?? null;
  }

  // Derive available bank accounts from selected company (companies/all now returns bankAccounts)
  $: selectedCompanyData = companies.find((c) => c.id === companyId) ?? null;
  $: availableBankAccounts = (() => {
    if (!selectedCompanyData) return [];
    if (Array.isArray(selectedCompanyData.bankAccounts) && selectedCompanyData.bankAccounts.length > 0) {
      return selectedCompanyData.bankAccounts;
    }
    // Fall back to old single-bank fields for legacy companies
    if (selectedCompanyData.bankName || selectedCompanyData.accountNumber) {
      return [{
        label: "Primary",
        bankName: selectedCompanyData.bankName || "",
        accountHolderName: selectedCompanyData.accountHolderName || "",
        accountNumber: selectedCompanyData.accountNumber || "",
        ifscCode: selectedCompanyData.ifscCode || "",
        branchAddress: selectedCompanyData.branchAddress || "",
      }];
    }
    return [];
  })();

  // Auto-select first bank account on create (or when company changes during create).
  // Edit mode is handled entirely inside fillDataOnForm so this reactive never
  // interferes with a stored bank account selection.
  $: if (availableBankAccounts.length > 0 && !updateInvoice) {
    selectedBankAccount = availableBankAccounts[0];
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
          {#if currentUser?.role === "master" || currentUser?.role === "admin"}
            <a href="/admin/invoice/add" class="btn btn-primary">
              <i class="ti ti-square-rounded-plus-filled me-1"></i>Add New Invoice
            </a>
          {:else}
            <button class="btn btn-primary" disabled title="Only Admin can create invoices">
              <i class="ti ti-square-rounded-plus-filled me-1"></i>Add New Invoice
            </button>
          {/if}
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
    <h5 class="mb-0">
      {formType === "Create" ? "Create Proforma Invoice" : "Update Proforma Invoice"}
    </h5>
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
      on:submit={formType === "Create" ? handleSubmit : handleUpdateSubmit}
      class="needs-validation"
      novalidate
    >
      <!-- Invoice setup -->
      <div class="invoice-form-section">
        <h6 class="invoice-form-section-title">
          <i class="ti ti-settings me-2"></i>Invoice Setup
        </h6>
        <div class="row g-3">
          <div class="col-12">
            <label class="form-label d-block" for="invoiceTypeOrder">
              Invoice Type <span class="text-danger">*</span>
            </label>
            <div class="d-flex flex-wrap gap-3">
              <div class="form-check">
                <input
                  type="radio"
                  class="form-check-input"
                  id="invoiceTypeOrder"
                  name="invoiceType"
                  value="order"
                  bind:group={invoiceType}
                />
                <label class="form-check-label" for="invoiceTypeOrder">Linked to Order</label>
              </div>
              <div class="form-check">
                <input
                  type="radio"
                  class="form-check-input"
                  id="invoiceTypeSelf"
                  name="invoiceType"
                  value="self"
                  bind:group={invoiceType}
                />
                <label class="form-check-label" for="invoiceTypeSelf">Standalone</label>
              </div>
            </div>
          </div>

          {#if invoiceType === "order"}
            <div class="col-md-6">
              <label class="form-label" for="orderId">
                Order <span class="text-danger">*</span>
              </label>
              {#key orderSelectKey}
                <OrderSearchSelect
                  id="orderId"
                  initialValue={orderId}
                  initialTitle={selectedOrderTitle}
                  isInvalid={!!formErrors.orderId}
                  on:change={(e) => {
                    orderId = e.detail.id;
                    if (e.detail.id) orderValueChange(e.detail.id);
                  }}
                />
              {/key}
              {#if fieldError("orderId")}
                <div class="text-danger mt-1 small">{fieldError("orderId")}</div>
              {/if}
              {#if piWarning}
                <div class="alert alert-warning py-2 px-2 mt-2 mb-0 small">
                  <i class="ti ti-alert-triangle me-1"></i>{piWarning}
                </div>
              {/if}
            </div>
          {:else}
            <div class="col-md-6">
              <label class="form-label" for="title">
                Title <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                name="title"
                class="form-control"
                class:is-invalid={fieldError("title")}
                bind:value={title}
                id="title"
                placeholder="Invoice title"
              />
              {#if fieldError("title")}
                <div class="invalid-feedback d-block">{fieldError("title")}</div>
              {/if}
            </div>
          {/if}

          <div class="col-md-6">
            <label class="form-label" for="companyId">
              Company <span class="text-danger">*</span>
            </label>
            <select
              name="companyId"
              id="companyId"
              class="select form-control"
              class:is-invalid={fieldError("companyId")}
              bind:value={companyId}
              required
            >
              <option value={null}>Select company</option>
              {#each companies as co}
                <option value={co?.id}>{co?.name}</option>
              {/each}
            </select>
            {#if fieldError("companyId")}
              <div class="invalid-feedback d-block">{fieldError("companyId")}</div>
            {/if}
          </div>

          {#if availableBankAccounts.length > 0}
            <div class="col-md-6">
              <label class="form-label" for="bankAccountSelect">Bank Account</label>
              <select
                id="bankAccountSelect"
                class="select form-control"
                bind:value={selectedBankAccount}
              >
                <option value={null}>Select bank account</option>
                {#each availableBankAccounts as bank, i}
                  <option value={bank}>
                    {bank.label ? bank.label + " — " : ""}{bank.bankName || "Bank " + (i + 1)}{bank.accountNumber ? " (" + bank.accountNumber + ")" : ""}
                  </option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
      </div>

      <!-- Invoice information -->
      <div class="invoice-form-section">
        <h6 class="invoice-form-section-title">
          <i class="ti ti-file-invoice me-2"></i>Invoice Information
        </h6>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label" for="invoiceDate">Invoice Date</label>
            <input
              type="date"
              name="invoiceDate"
              class="form-control"
              class:is-invalid={fieldError("invoiceDate")}
              bind:value={invoiceDate}
              id="invoiceDate"
            />
            {#if fieldError("invoiceDate")}
              <div class="invalid-feedback d-block">{fieldError("invoiceDate")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="poDate">PO Date</label>
            <input
              type="date"
              name="poDate"
              class="form-control"
              class:is-invalid={fieldError("poDate")}
              bind:value={poDate}
              id="poDate"
            />
            {#if fieldError("poDate")}
              <div class="invalid-feedback d-block">{fieldError("poDate")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="poNumber">PO Number</label>
            <input
              type="text"
              name="poNumber"
              class="form-control"
              class:is-invalid={fieldError("poNumber")}
              bind:value={poNumber}
              id="poNumber"
              placeholder="Purchase order number"
            />
            {#if fieldError("poNumber")}
              <div class="invalid-feedback d-block">{fieldError("poNumber")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="currency">Currency</label>
            <select
              name="currency"
              id="currency"
              class="select form-control"
              class:is-invalid={fieldError("currency")}
              bind:value={currency}
              required
            >
              {#each currencies as c}
                <option value={c.code}>{c.code}</option>
              {/each}
            </select>
            {#if fieldError("currency")}
              <div class="invalid-feedback d-block">{fieldError("currency")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="paymentMethod">Payment Method</label>
            <select
              name="paymentMethod"
              id="paymentMethod"
              class="select form-control"
              class:is-invalid={fieldError("paymentMethod")}
              bind:value={paymentMethod}
              required
            >
              <option value="">Select payment method</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Debit Card">Debit Card</option>
              <option value="Cash">Cash</option>
              <option value="RTGS">RTGS</option>
              <option value="NEFT">NEFT</option>
              <option value="UPI">UPI</option>
              <option value="IMPS">IMPS</option>
              <option value="Other">Other</option>
            </select>
            {#if fieldError("paymentMethod")}
              <div class="invalid-feedback d-block">{fieldError("paymentMethod")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="status">Payment Status</label>
            <select
              name="status"
              id="status"
              class="select form-control"
              class:is-invalid={fieldError("status")}
              bind:value={status}
              required
            >
              <option value="">Select status</option>
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
            </select>
            {#if fieldError("status")}
              <div class="invalid-feedback d-block">{fieldError("status")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="priceTerms">Price Terms</label>
            <input
              type="text"
              name="priceTerms"
              class="form-control"
              class:is-invalid={fieldError("priceTerms")}
              bind:value={priceTerms}
              id="priceTerms"
              placeholder="e.g. FOB, CIF"
            />
            {#if fieldError("priceTerms")}
              <div class="invalid-feedback d-block">{fieldError("priceTerms")}</div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Bill To -->
      <div class="invoice-form-section">
        <h6 class="invoice-form-section-title">
          <i class="ti ti-receipt me-2"></i>Bill To
        </h6>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label" for="billToName">Name</label>
            <input
              type="text"
              name="billToName"
              class="form-control"
              class:is-invalid={fieldError("billToName")}
              bind:value={billToName}
              id="billToName"
              placeholder="Name"
            />
            {#if fieldError("billToName")}
              <div class="invalid-feedback d-block">{fieldError("billToName")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="billToEmail">Email</label>
            <input
              type="email"
              name="billToEmail"
              class="form-control"
              class:is-invalid={fieldError("billToEmail")}
              bind:value={billToEmail}
              id="billToEmail"
              placeholder="Email"
            />
            {#if fieldError("billToEmail")}
              <div class="invalid-feedback d-block">{fieldError("billToEmail")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="billToMobile">Mobile</label>
            <input
              type="text"
              name="billToMobile"
              class="form-control"
              class:is-invalid={fieldError("billToMobile")}
              bind:value={billToMobile}
              id="billToMobile"
              placeholder="Mobile"
            />
            {#if fieldError("billToMobile")}
              <div class="invalid-feedback d-block">{fieldError("billToMobile")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="billToGSTNumber">GST Number</label>
            <input
              type="text"
              name="billToGSTNumber"
              class="form-control"
              class:is-invalid={fieldError("billToGSTNumber")}
              bind:value={billToGSTNumber}
              id="billToGSTNumber"
              placeholder="GSTIN"
            />
            {#if fieldError("billToGSTNumber")}
              <div class="invalid-feedback d-block">{fieldError("billToGSTNumber")}</div>
            {/if}
          </div>
          <div class="col-12">
            <label class="form-label" for="billToAddress">Address</label>
            <textarea
              name="billToAddress"
              id="billToAddress"
              class="form-control"
              class:is-invalid={fieldError("billToAddress")}
              bind:value={billToAddress}
              required
              rows="2"
              placeholder="Billing address"
            ></textarea>
            {#if fieldError("billToAddress")}
              <div class="invalid-feedback d-block">{fieldError("billToAddress")}</div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Ship To -->
      <div class="invoice-form-section">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <h6 class="invoice-form-section-title mb-0">
            <i class="ti ti-truck-delivery me-2"></i>Ship To
          </h6>
          <div class="form-check mb-0">
            <input
              type="checkbox"
              class="form-check-input"
              name="shipToSameAsBillTo"
              bind:checked={shipToSameAsBillTo}
              id="shipToSameAsBillTo"
              on:change={shipToChange}
            />
            <label class="form-check-label" for="shipToSameAsBillTo">
              Same as Bill To
            </label>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label" for="shipToName">Name</label>
            <input
              type="text"
              name="shipToName"
              class="form-control"
              class:is-invalid={fieldError("shipToName")}
              bind:value={shipToName}
              id="shipToName"
              placeholder="Name"
              disabled={shipToSameAsBillTo}
            />
            {#if fieldError("shipToName")}
              <div class="invalid-feedback d-block">{fieldError("shipToName")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="shipToEmail">Email</label>
            <input
              type="email"
              name="shipToEmail"
              class="form-control"
              class:is-invalid={fieldError("shipToEmail")}
              bind:value={shipToEmail}
              id="shipToEmail"
              placeholder="Email"
              disabled={shipToSameAsBillTo}
            />
            {#if fieldError("shipToEmail")}
              <div class="invalid-feedback d-block">{fieldError("shipToEmail")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="shipToMobile">Mobile</label>
            <input
              type="text"
              name="shipToMobile"
              class="form-control"
              class:is-invalid={fieldError("shipToMobile")}
              bind:value={shipToMobile}
              id="shipToMobile"
              placeholder="Mobile"
              disabled={shipToSameAsBillTo}
            />
            {#if fieldError("shipToMobile")}
              <div class="invalid-feedback d-block">{fieldError("shipToMobile")}</div>
            {/if}
          </div>
          <div class="col-md-6">
            <label class="form-label" for="shipToGSTNumber">GST Number</label>
            <input
              type="text"
              name="shipToGSTNumber"
              class="form-control"
              class:is-invalid={fieldError("shipToGSTNumber")}
              bind:value={shipToGSTNumber}
              id="shipToGSTNumber"
              placeholder="GSTIN"
              disabled={shipToSameAsBillTo}
            />
            {#if fieldError("shipToGSTNumber")}
              <div class="invalid-feedback d-block">{fieldError("shipToGSTNumber")}</div>
            {/if}
          </div>
          <div class="col-12">
            <label class="form-label" for="shipToAddress">Address</label>
            <textarea
              name="shipToAddress"
              id="shipToAddress"
              class="form-control"
              class:is-invalid={fieldError("shipToAddress")}
              bind:value={shipToAddress}
              required
              rows="2"
              placeholder="Shipping address"
              disabled={shipToSameAsBillTo}
            ></textarea>
            {#if fieldError("shipToAddress")}
              <div class="invalid-feedback d-block">{fieldError("shipToAddress")}</div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Line Items -->
      <div class="invoice-form-section">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h6 class="invoice-form-section-title mb-0">
            <i class="ti ti-list-details me-2"></i>Line Items
          </h6>
          <span class="badge bg-light text-dark border">{items.length} item(s)</span>
        </div>
        <div class="table-responsive">
          <table class="table table-bordered table-nowrap align-middle mb-2">
            <thead class="table-light">
              <tr>
                <th>Item</th>
                <th style="width:90px">Qty</th>
                <th style="width:110px">Unit Price</th>
                <th style="width:100px">HS Code</th>
                <th style="width:110px">Total</th>
                <th style="width:44px"></th>
              </tr>
            </thead>
            <tbody>
              {#each items as item, index}
                <tr>
                  <td>
                    <input type="text" class="form-control form-control-sm" bind:value={item.item} />
                  </td>
                  <td>
                    <input type="text" class="form-control form-control-sm" bind:value={item.quantity} />
                  </td>
                  <td>
                    <input type="number" step="any" class="form-control form-control-sm" bind:value={item.price} />
                  </td>
                  <td>
                    <input type="text" class="form-control form-control-sm" bind:value={item.hsCode} />
                  </td>
                  <td>
                    <input type="number" step="any" class="form-control form-control-sm" bind:value={item.total} />
                  </td>
                  <td>
                    <button type="button" on:click={() => removeItem(index)} class="btn btn-icon btn-sm text-danger" title="Remove">
                      <i class="ti ti-x"></i>
                    </button>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td colspan="6" class="text-center text-muted py-3">No line items</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <button type="button" on:click={addItem} class="btn btn-sm btn-outline-primary">
          <i class="ti ti-plus me-1"></i>Add Item
        </button>
      </div>

      <!-- Extra Items -->
      <div class="invoice-form-section">
        <h6 class="invoice-form-section-title">
          <i class="ti ti-square-rounded-plus me-2"></i>Extra Items
        </h6>
        <div class="table-responsive">
          <table class="table table-bordered table-nowrap align-middle mb-2">
            <thead class="table-light">
              <tr>
                <th>Name</th>
                <th style="width:140px">Amount</th>
                <th style="width:44px"></th>
              </tr>
            </thead>
            <tbody>
              {#each extraItems as item1, index1}
                <tr>
                  <td>
                    <input type="text" class="form-control form-control-sm" bind:value={item1.item} />
                  </td>
                  <td>
                    <input type="number" step="any" class="form-control form-control-sm" bind:value={item1.total} />
                  </td>
                  <td>
                    <button type="button" on:click={() => removeExtraItem(index1)} class="btn btn-icon btn-sm text-danger" title="Remove">
                      <i class="ti ti-x"></i>
                    </button>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td colspan="3" class="text-center text-muted py-3">No extra items</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <button type="button" on:click={addExtraItem} class="btn btn-sm btn-outline-primary">
          <i class="ti ti-plus me-1"></i>Add Extra Item
        </button>
      </div>

      <!-- Tax -->
      <div class="invoice-form-section">
        <h6 class="invoice-form-section-title">
          <i class="ti ti-receipt-tax me-2"></i>Tax
        </h6>
        <div class="table-responsive">
          <table class="table table-bordered table-nowrap align-middle mb-2">
            <thead class="table-light">
              <tr>
                <th>Name</th>
                <th style="width:120px">Percentage (%)</th>
                <th style="width:120px" class="text-end">Amount</th>
                <th style="width:44px"></th>
              </tr>
            </thead>
            <tbody>
              {#each taxItems as item2, index2}
                <tr>
                  <td>
                    <input type="text" class="form-control form-control-sm" bind:value={item2.item} />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      class="form-control form-control-sm"
                      bind:value={item2.percentage}
                    />
                  </td>
                  <td class="text-end fw-medium">
                    {currencySymbol} {(item2?.total ?? 0).toFixed(2)}
                  </td>
                  <td>
                    <button type="button" on:click={() => removeTaxItem(index2)} class="btn btn-icon btn-sm text-danger" title="Remove">
                      <i class="ti ti-x"></i>
                    </button>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td colspan="4" class="text-center text-muted py-3">No tax rows</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <button type="button" on:click={addTaxItem} class="btn btn-sm btn-outline-primary">
          <i class="ti ti-plus me-1"></i>Add Tax
        </button>
      </div>

      <!-- Amount & summary -->
      <div class="invoice-form-section">
        <h6 class="invoice-form-section-title">
          <i class="ti ti-calculator me-2"></i>Amount &amp; Summary
        </h6>
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label" for="discount">Discount</label>
            <input
              type="number"
              min="0"
              name="discount"
              class="form-control"
              class:is-invalid={fieldError("discount")}
              bind:value={discount}
              id="discount"
              placeholder="0"
            />
            {#if fieldError("discount")}
              <div class="invalid-feedback d-block">{fieldError("discount")}</div>
            {/if}
          </div>
          <div class="col-md-4">
            <label class="form-label" for="totalAmountTitle">Total Label</label>
            <input
              type="text"
              name="totalAmountTitle"
              class="form-control"
              class:is-invalid={fieldError("totalAmountTitle")}
              bind:value={totalAmountTitle}
              id="totalAmountTitle"
              placeholder="Total Amount"
            />
            {#if fieldError("totalAmountTitle")}
              <div class="invalid-feedback d-block">{fieldError("totalAmountTitle")}</div>
            {/if}
          </div>
          <div class="col-md-4">
            <label class="form-label" for="totalAmountValue">Total Override</label>
            <input
              type="number"
              name="totalAmountValue"
              class="form-control"
              min="0"
              class:is-invalid={fieldError("totalAmountValue")}
              bind:value={totalAmountValue}
              id="totalAmountValue"
              placeholder="Leave 0 to use calculated"
            />
            {#if fieldError("totalAmountValue")}
              <div class="invalid-feedback d-block">{fieldError("totalAmountValue")}</div>
            {/if}
          </div>
          <div class="col-12">
            <div class="border rounded p-3 bg-light">
              <div class="d-flex justify-content-between mb-2">
                <span class="text-muted">Line items</span>
                <span class="fw-medium">
                  {currencySymbol}
                  {itemsGrossTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {#if extratotal > 0}
                <div class="d-flex justify-content-between mb-2">
                  <span class="text-muted">Extra items</span>
                  <span>
                    {currencySymbol}
                    {extratotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              {/if}
              {#if typeof discount === "number" && !isNaN(discount) && discount !== 0}
                <div class="d-flex justify-content-between mb-2">
                  <span class="text-muted">Discount</span>
                  <span>
                    − {currencySymbol}
                    {Number(discount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              {/if}
              {#each taxItems as item}
                {#if item.item}
                  <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">
                      {item.item}{item.percentage ? ` (${item.percentage}%)` : ""}
                    </span>
                    <span>
                      {currencySymbol}
                      {(item.total ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                {/if}
              {/each}
              <div class="d-flex justify-content-between border-top pt-2 mt-2">
                <span class="fw-semibold">{totalAmountTitle || "Total"}</span>
                <span class="fw-semibold fs-16 text-primary">
                  {currencySymbol}
                  {total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Terms & remarks -->
      <div class="invoice-form-section">
        <h6 class="invoice-form-section-title">
          <i class="ti ti-notes me-2"></i>Terms &amp; Remarks
        </h6>
        <div class="row g-3">
          <div class="col-12">
            <label class="form-label" for="termsConditions">Terms &amp; Conditions</label>
            <textarea
              name="termsConditions"
              id="termsConditions"
              class="form-control"
              class:is-invalid={fieldError("termsConditions")}
              bind:value={termsConditions}
              required
              rows="3"
              placeholder="Terms and conditions"
            ></textarea>
            {#if fieldError("termsConditions")}
              <div class="invalid-feedback d-block">{fieldError("termsConditions")}</div>
            {/if}
          </div>
          <div class="col-12">
            <label class="form-label" for="remarks">Remarks</label>
            <textarea
              name="remarks"
              id="remarks"
              class="form-control"
              class:is-invalid={fieldError("remarks")}
              bind:value={remarks}
              required
              rows="2"
              placeholder="Additional remarks"
            ></textarea>
            {#if fieldError("remarks")}
              <div class="invalid-feedback d-block">{fieldError("remarks")}</div>
            {/if}
          </div>
        </div>
      </div>

      <div class="d-flex align-items-center justify-content-end gap-2 mt-4 pt-3 border-top">
        <button type="button" data-bs-dismiss="offcanvas" class="btn btn-outline-secondary">
          Cancel
        </button>
        <button class="btn btn-primary" type="submit" disabled={loading}>
          {#if loading}
            <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            {formType === "Create" ? "Creating…" : "Saving…"}
          {:else}
            <i class="ti ti-check me-1"></i>
            {formType === "Create" ? "Create Invoice" : "Save Changes"}
          {/if}
        </button>
      </div>
    </form>
  </div>
</div>
<!-- /Add Canvas -->

<style>
  .invoice-form-section {
    margin-bottom: 1.25rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid #eef1f4;
  }

  .invoice-form-section:last-of-type {
    border-bottom: none;
    padding-bottom: 0;
  }

  .invoice-form-section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: #344767;
    margin-bottom: 0;
    display: flex;
    align-items: center;
  }

  .invoice-form-section-title i {
    color: var(--bs-primary, #3554d1);
  }
</style>
