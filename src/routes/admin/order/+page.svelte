<script>
  import { onMount } from "svelte";
  import jQuery from "jquery";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import OrderDragula from "$lib/components/OrderDragula.svelte";
  import Loader from "$lib/components/Loader.svelte";
  import pdfMake from "pdfmake/build/pdfmake";
  import * as pdfFonts from "pdfmake/build/vfs_fonts";
  import * as XLSX from "xlsx";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { goto } from "$app/navigation";
  import { checkAuth } from "$lib/utils/auth";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import {
    companiesAllStore,
    categoriesAllStore,
    usersAllStore,
    getFromLocalStorage,
    saveToLocalStorage,
  } from "$lib/stores/dataStores";
  import ChangeListVisiableStatus from "$lib/components/ChangeListVisiableStatus.svelte";
  let currentUser = null;
  onMount(() => {
    currentUser = checkAuth();
    if (currentUser?.role != "user") {
      viewType = "list";
    }
  });

  let loadingData = true;

  let orders = [];
  let users = [];
  let companies = [];
  let categories = [];
  let accordingToStatusOrders = {
    NewLead: [],
    Contacted: [],
    FollowUp: [],
    Qualified: [],
    Unqualified: [],
    NeedsAssessment: [],
    QuotationSent: [],
    NegotiationInProgress: [],
    DealWon: [],
    DealLost: [],
  };

  async function updateOrderStatus(orderId, newStatus) {
    let n_order = orders.find((order) => order.id == orderId);

    n_order.status = newStatus;
    let updateStatus = await statusUpdate(n_order);
    return updateStatus;
  }

  let trashBin = false;

  let userId = null;
  let companyId = null;
  let filterStatus = null;
  let filterCategory = null;
  let searchTerm = "";
  let currentPage = 1;
  let rowsPerPage = 10;
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;
  let orderBy = "createdAt";
  let searchString = "";

  let viewType = "grid";

  // Form state
  let title = "";
  let category = "";
  let orderDate = null;
  let startDate = null;
  let deadlineDate = null;
  let price = null;
  let currency = "INR";
  let priceTerms = null;
  let source = null;
  let description = "";
  let company = "";
  let gstNumber = "";

  let name = "";
  let email = "";
  let mobile = "";
  let whatsapp = "";
  let address = "";
  let alternateMobile = "";
  let designation = "";
  let remark = "";

  let loading = false;
  let errorMessage = "";

  async function setInOrder() {
    const statuses = [
      "New Lead",
      "Contacted",
      "Follow Up",
      "Qualified",
      "Unqualified",
      "Needs Assessment",
      "Quotation Sent",
      "Negotiation In Progress",
      "Deal Won",
      "Deal Lost",
    ];

    statuses.forEach((status) => {
      const statusKey = status.replace(/\s+/g, "");
      const filteredOrders = orders.filter((order) => order.status === status);

      const pinnedOrders = filteredOrders.filter(
        (order) => order.pinStatus === "true",
      );
      const unpinnedOrders = filteredOrders.filter(
        (order) => order.pinStatus !== "true",
      );

      accordingToStatusOrders[statusKey] = [...pinnedOrders, ...unpinnedOrders];
    });
  }

  let formErrors = {};

  import { orderFilterStore } from "$lib/stores/filterStore";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";
  import { get } from "svelte/store";
  let firstLoad = false;
  onMount(() => {
    const filterState = $orderFilterStore;

    userId = filterState.userId || null;
    companyId = filterState.companyId || null;
    filterStatus = filterState.filterStatus || null;
    filterCategory = filterState.filterCategory || null;
    searchTerm = filterState.searchTerm || "";
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;
    orderBy = filterState.orderBy || "createdAt";

    fetchOrders();
    getAllUsers();
    getAllCompanies();
    getAllCategories();

    setTimeout(() => {
      firstLoad = true;
    }, 500);
  });

  const updateFilterStore = (newValues) => {
    orderFilterStore.update((currentState) => {
      return { ...currentState, ...newValues };
    });
  };

  function closeOffcanvas() {
    const $ = jQuery;
    $("#offcanvas_add").removeClass("show");
    $(".offcanvas-backdrop").remove();
    $("body").css({ overflow: "", paddingRight: "" });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors

    const newOrder = {
      title,
      price,
      currency,
      priceTerms,
      source,
      description,
      company,
      gstNumber,
    };
    if (category) {
      newOrder.category = category;
    } else {
      newOrder.category = "";
    }
    if (orderDate) {
      newOrder.orderDate = orderDate;
    }
    if (startDate) {
      newOrder.startDate = startDate;
    }
    if (deadlineDate) {
      newOrder.deadlineDate = deadlineDate;
    }
    if (price) {
      newOrder.price = Number(price);
    }

    const newClient = {
      name,
      mobile,
      email,
      whatsapp,
      address,
      alternateMobile,
      designation,
      remark,
    };
    email ? (newClient.email = email) : "";
    newOrder.orderClients = [newClient];
    let newActivity = {
      title: "Order Created",
      description: "A new order has been created.",
    };
    newOrder.orderActivity = newActivity;
    if (title == "") {
      formErrors.title = ["Title is required."];
      loading = false;
      return;
    }
    if (name == "") {
      formErrors.name = ["Name is required."];
      loading = false;
      return;
    }

    try {
      const data = await authApiFetch(API_ROUTES.ORDER, {
        method: "POST",
        data: JSON.stringify(newOrder),
      });

      // Reset Form
      title = "";
      category = "";
      orderDate = null;
      startDate = null;
      deadlineDate = null;
      price = null;
      currency = "INR";
      priceTerms = null;
      source = null;
      description = "";
      company = "";
      gstNumber = "";

      name = "";
      email = "";
      mobile = "";
      alternateMobile = "";
      whatsapp = "";
      address = "";
      designation = "";
      remark = "";

      orders = [data.data, ...orders];
      setInOrder();
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

  function generatePdf() {
    function formatDate(date) {
      return new Date(date).toLocaleString("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    }

    const headers = [
      "Order ID",
      "Unique ID",
      "Title",
      "Category",
      "Status",
      "Assigned Users",
      "Description",
      "Price",
      "Price Terms",
      "Terms & Conditions",
      "Source",
      "Company",
      "GST Number",
      "Order Date",
      "Order Clients",
      "Created At",
      "Updated At",
    ];

    const body = [
      headers,
      ...orders.map((order) => {
        const assignedUsers = (order?.assignedUsers || [])
          .map((user) => `${user.name} (${user.email})`)
          .join(", ");
        const orderClients = (order?.orderClients || [])
          .map((user) => `${user.name} (${user.email})`)
          .join(", ");

        return [
          order?.id || "",
          order?.financialYear + "/" + order?.pId || "",
          order?.title || "",
          order?.category || "",
          order?.status || "",
          assignedUsers || "",
          order?.description || "",
          order?.price || "",
          order?.currency || "INR",
          order?.priceTerms || "",
          order?.termsCondition || "",
          order?.source || "",
          order?.company || "",
          order?.gstNumber || "",
          formatDate(order?.orderDate),
          orderClients || "",
          formatDate(order?.createdAt),
          formatDate(order?.updatedAt),
        ];
      }),
    ];

    const docDefinition = {
      content: [
        { text: "Orders Report", style: "header" },
        {
          table: {
            headerRows: 1,
            body: body,
          },
          layout: "lightHorizontalLines",
        },
      ],
      styles: {
        header: {
          fontSize: 10,
          bold: true,
          margin: [0, 0, 0, 10],
        },
      },
    };

    // Filename
    let fileName = "orders";

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

  function generateExcel() {
    const headers = [
      "OrderID",
      "UniqueId",
      "Title",
      "Category",
      "Status",
      "AssignedUsers",
      "Description",
      "Price",
      "PriceTerms",
      "TermsCondition",
      "Source",
      "Company",
      "GSTNumber",
      "OrderDate",
      "OrderClients",
      "CreatedAt",
      "UpdatedAt",
    ];
    // orders
    const newList = orders.map((order) => {
      const assignedUsers = (order?.assignedUsers || [])
        .map((user) => `${user.name} (${user.email})`)
        .join(", ");
      const orderClients = (order?.orderClients || [])
        .map(
          (user) =>
            `${user.name} (${user.email}, ${user.mobile}, ${user.whatsapp})`,
        )
        .join(", ");

      function formatDate(date) {
        return new Date(date).toLocaleString("en-GB", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });
      }

      return {
        OrderID: order?.id,
        UniqueId: order?.financialYear + "/" + order?.pId,
        Title: order?.title,
        Category: order?.category,
        Status: order?.status,
        AssignedUsers: assignedUsers,
        Description: order?.description,
        Price: order?.price,
        PriceTerms: order?.priceTerms,
        Currency: order?.currency,
        TermsCondition: order?.termsCondition,
        Source: order?.source,
        Company: order?.company,
        GSTNumber: order?.gstNumber,
        OrderDate: formatDate(order?.orderDate),
        OrderClients: orderClients,
        CreatedAt: formatDate(order?.createdAt),
        UpdatedAt: formatDate(order?.updatedAt),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(newList, { header: headers });
    XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: "A1" });

    const columnWidths = headers.map((header) => {
      const maxContentWidth = Math.max(
        header.length,
        ...newList.map((row) => String(row[header] ?? "").length),
      );
      return { wch: maxContentWidth };
    });

    worksheet["!cols"] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // Filename
    let fileName = "orders";

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
    fileName += `_exported_${timestamp}.xlsx`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();

    window.URL.revokeObjectURL(url);
    a.remove();
  }

  let refresh = false;
  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      try {
        await Promise.all([
          fetchOrders(),
          getAllUsers(),
          getAllCompanies(),
          getAllCategories(),
        ]);
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        refresh = false;
      }
    }, 200);
  }

  async function filterQuery() {
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
    } else if (selectedFilter === "today") {
      startDateFilter = new Date();
      startDateFilter.setHours(0, 0, 0, 0);
      endDateFilter.setHours(23, 59, 59, 999);
      searchString = "Today";
    } else if (selectedFilter === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      startDateFilter = yesterday;
      startDateFilter.setHours(0, 0, 0, 0);
      endDateFilter.setHours(23, 59, 59, 999);
      searchString = "Yesterday";
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
    if (filterStatus) {
      query.append("status", filterStatus);
    }
    if (filterCategory) {
      query.append("category", filterCategory);
    }
    if (trashBin) {
      query.append("withDeleted", trashBin);
    }

    updateFilterStore({
      userId,
      companyId,
      filterStatus,
      filterCategory,
      searchTerm,
      selectedFilter,
      customStartDate,
      customEndDate,
      orderBy,
    });
    return { query };
  }

  async function fetchOrders() {
    loadingData = true;
    let { query } = await filterQuery();
    try {
      if (!refresh) {
        const cachedData = getFromLocalStorage("orders_" + query.toString());
        if (cachedData) {
          orders = cachedData.orders;
          setInOrder();
          return;
        }
      }
      const data = await authApiFetch(
        `${API_ROUTES.ORDER}?${query.toString()}`,
        { method: "GET" },
      );
      orders = data;

      setInOrder();
      saveToLocalStorage("orders_" + query.toString(), { orders });
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

  async function getAllCategories() {
    if (!refresh) {
      const cached = get(categoriesAllStore);
      // validate cached format is grouped (array of objects with label)
      if (
        cached &&
        cached.length > 0 &&
        typeof cached[0] === "object" &&
        cached[0].label
      ) {
        categories = cached;
        loadingData = false;
        return;
      }
    }
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.CATEGORY + "/all");
      // data = [{id, name, children:[{id,name}]}] — root categories with children
      categories = data.map((parent) => ({
        label: parent.name,
        options:
          parent.children && parent.children.length > 0
            ? parent.children.map((c) => c.name)
            : [parent.name],
      }));
      categoriesAllStore.set(categories);
    } catch (err) {
      errorMessage = "Failed to load category data.";
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
  let debounce1Timeout;
  function handleCategoryChange(value) {
    clearTimeout(debounce1Timeout);
    debounce1Timeout = setTimeout(() => {
      filterCategory = value;
    }, 300);
  }

  $: [
    searchTerm,
    filterStatus,
    filterCategory,
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
      fetchOrders();
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
      const cachedData = getFromLocalStorage("orders_" + query.toString());
      let orders = [];
      if (cachedData) {
        orders = cachedData.orders;
        let u_order = orders.find((n_order) => n_order.id == order.id);
        if (u_order) {
          u_order.status = order.status;
        }
        saveToLocalStorage("orders_" + query.toString(), { orders });
      }
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
      console.log("formErrors : ", formErrors);
    }
  }

  function changeViewType(type) {
    viewType = type;
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
  let allStatuses = [
    "New Lead",
    "Contacted",
    "Follow Up",
    "Qualified",
    "Unqualified",
    "Needs Assessment",
    "Quotation Sent",
    "Negotiation In Progress",
    "Deal Won",
    "Deal Lost",
    "Dispatched",
    "Completed",
  ];

  $: columns = [
    {
      key: "title",
      label: "Title",
      render: (val, row) => {
        return `<a href="/admin/order/${row.id}" class="flex items-center gap-1"><div class="max-w-[300px] truncate">${row?.title}</div></a>`;
      },
    },
    {
      key: "workOrderNumber",
      label: "Work Order No.",
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
      key: "orderDate",
      label: "Order Date",
      render: (val, row) => {
        const d = new Date(row.orderDate);
        return `${
          row?.orderDate &&
          new Date(row.orderDate).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        }`;
      },
    },
    {
      key: "createdAt",
      label: "Created Date",
      render: (val, row) => {
        const d = new Date(row.createdAt);
        return `${
          row?.createdAt &&
          new Date(row.createdAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        }`;
      },
    },
    ...(currentUser?.role != "user"
      ? [
          {
            key: "user",
            label: "User",
            render: (val, row) =>
              (row?.assignedUsers || [])
                .map((user) => `${user.name}`)
                .join(", "),
          },
        ]
      : []),
  ];

  let actions = [
    {
      label: "Invoice",
      icon: "ti ti-eye",
      onClick: (id) => viewRecord(id),
      color: "btn-soft-success",
    },
    // {
    //   label: "Delete",
    //   icon: "ti ti-trash",
    //   onClick: (id) => deleteRecord(id),
    //   color: "btn-soft-danger",
    // },
  ];

  const viewRecord = async (id) => {
    goto("/admin/order/" + id);
  };

  async function deleteRecord(id) {
    try {
      Swal.fire({
        title: "Delete Confirmation",
        text: "Are you sure you want to delete this record.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, delete it!",
      }).then(async (result) => {
        if (result.isConfirmed) {
          const data = await authApiFetch(API_ROUTES.ORDER + "/" + id, {
            method: "DELETE",
          });
          Swal.fire("Deleted!", data.message, "success");
          refreshPage();
          goto("/admin/order");
        }
      });
    } catch (error) {
      const validationErrors = errorHandle(error);

      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      console.log("formErrors : ", formErrors);
    }
  }

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];
  const sources = ["Whatsapp", "Website", "Mail"];
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
          Orders
          <span class="text-xs font-normal">
            {searchString ? `(${searchString})` : ""}
          </span>
        </h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Orders</li>
          </ol>
        </nav>
      </div>
      {#if !trashBin}
        <div class="gap-2 flex items-center flex-wrap">
          {#if viewType == "grid"}
            <a
              href="#order_lists_status"
              class="btn btn-outline-light"
              data-bs-toggle="modal"
              data-bs-target="#order_lists_status"
            >
              Lists Title
            </a>
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
                    on:click={() => generatePdf()}
                    class="dropdown-item"
                  >
                    <i class="ti ti-file-type-pdf me-1"></i>Export as PDF
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    on:click={() => generateExcel()}
                    class="dropdown-item"
                  >
                    <i class="ti ti-file-type-xls me-1"></i>Export as Excel
                  </button>
                </li>
              </ul>
            </div>
          </div>
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
      {/if}
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
            <select bind:value={orderBy} class="form-select">
              <option value="createdAt">Created At</option>
              <option value="orderDate">Order Date</option>
            </select>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <select bind:value={selectedFilter} class="form-select">
              <option value="all">All Orders</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
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
          {#if currentUser?.role != "user"}
            <div class="flex items-center gap-2 flex-wrap">
              <select bind:value={filterStatus} class="form-select">
                <option value={null}>Select Status</option>
                {#each allStatuses as status}
                  <option value={status}>{status}</option>
                {/each}
              </select>
            </div>
          {/if}
          {#if currentUser?.role != "user"}
            <div class="flex items-center gap-2 flex-wrap">
              <div>
                <div class=" position-relative">
                  <input
                    type="text"
                    value={filterCategory}
                    on:input={(e) => handleCategoryChange(e.target.value)}
                    class="form-control"
                    placeholder="Category.."
                  />
                </div>
              </div>
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
          <div
            class="d-flex align-items-center shadow p-1 rounded border view-icons bg-white"
          >
            <button
              on:click={() => changeViewType("list")}
              class="btn btn-sm p-1 border-0 fs-14"
              class:active={viewType == "list"}
            >
              <i class="ti ti-list-tree"></i>
            </button>
            <button
              on:click={() => changeViewType("grid")}
              class="flex-shrink-0 btn btn-sm p-1 border-0 ms-1 fs-14"
              class:active={viewType == "grid"}
            >
              <i class="ti ti-grid-dots"></i>
            </button>
          </div>
          <a
            href="#offcanvas_add"
            class="btn btn-primary"
            data-bs-toggle="offcanvas"
            data-bs-target="#offcanvas_add"
          >
            <i class="ti ti-square-rounded-plus-filled me-1"></i>Add Order
          </a>
        </div>
      {/if}
    </div>
    <!-- table header -->
    {#if viewType == "grid"}
      <OrderDragula {accordingToStatusOrders} {updateOrderStatus} />
    {:else}
      <!-- card start -->
      <div class="card border-0 rounded-0">
        <div class="card-body">
          <DynamicDataTable
            loading={loadingData}
            {columns}
            {actions}
            data={[...orders]}
            {currentPage}
            {rowsPerPage}
            totalItems={orders?.length}
            totalPages={Math.ceil(orders?.length / rowsPerPage)}
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
    <h5 class="mb-0">Add New Order</h5>
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
      on:submit={handleSubmit}
      class="needs-validation space-y-4"
      novalidate
    >
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="form-label" for="title">
            Title <span class="text-danger">*</span>
          </label>
          <input
            type="text"
            name="title"
            class="form-control"
            class:is-invalid={formErrors.title}
            bind:value={title}
            required
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
          <label class="form-label" for="category">Category</label>
          {#key categories.length}
            <TypeableSelect
              id="category"
              options={categories}
              grouped={true}
              value={category != "" ? category : null}
              placeholder="Select Category"
              on:change={(e) => (category = e.detail)}
            />
          {/key}
          <!-- <input
            type="text"
            name="category"
            class="form-control"
            class:is-invalid={formErrors.category}
            bind:value={category}
            id="category"
            placeholder="Category"
          /> -->
          {#if formErrors.category}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.category[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="orderDate">Order Date</label>
          <input
            type="date"
            name="orderDate"
            class="form-control"
            class:is-invalid={formErrors.orderDate}
            bind:value={orderDate}
            id="orderDate"
            placeholder="Order Date"
          />
          {#if formErrors.orderDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.orderDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="startDate">Start Date</label>
          <input
            type="date"
            name="startDate"
            class="form-control"
            class:is-invalid={formErrors.startDate}
            bind:value={startDate}
            id="startDate"
            placeholder="Start Date"
          />
          {#if formErrors.startDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.startDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="deadlineDate">Deadline Date</label>
          <input
            type="date"
            name="deadlineDate"
            class="form-control"
            class:is-invalid={formErrors.deadlineDate}
            bind:value={deadlineDate}
            id="deadlineDate"
            placeholder="Deadline Date"
          />
          {#if formErrors.deadlineDate}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.deadlineDate[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="price">Price</label>
          <div
            class="!flex items-center rounded-md bg-white !p-0 !pl-3 outline-1 -outline-offset-1 outline-gray-300 has-[input:focus-within]:outline-2 has-[input:focus-within]:-outline-offset-2 has-[input:focus-within]:outline-indigo-600 form-control"
            class:is-invalid={formErrors.price}
            class:border={!formErrors.price}
          >
            <div
              class="shrink-0 text-base text-gray-500 select-none sm:text-sm/6"
            >
              {currencies.find((c) => c.code === currency)?.symbol}
            </div>
            <input
              id="price"
              type="number"
              name="price"
              bind:value={price}
              placeholder="0.00"
              class="block min-w-0 grow py-1.5 pr-3 pl-1 text-base placeholder:text-gray-400 focus:outline-none sm:text-sm/6"
            />
            <div class="grid shrink-0 grid-cols-1 focus-within:relative">
              <select
                id="currency"
                name="currency"
                bind:value={currency}
                aria-label="Currency"
                class="col-start-1 row-start-1 w-full border-l appearance-none rounded-md rounded-l-[0px] py-1.5 pr-7 pl-3 text-base text-gray-500 placeholder:text-gray-400 focus:outline-0 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              >
                {#each currencies as currency}
                  <option value={currency.code}>{currency.code}</option>
                {/each}
              </select>
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                data-slot="icon"
                aria-hidden="true"
                class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
              >
                <path
                  d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                  clip-rule="evenodd"
                  fill-rule="evenodd"
                />
              </svg>
            </div>
          </div>
          {#if formErrors.price}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.price[0]}</li>
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
          <label class="form-label" for="source">Source</label>
          <TypeableSelect
            id="source"
            options={sources}
            value={source}
            placeholder="Select Source"
            on:change={(e) => (source = e.detail)}
          />
          {#if formErrors.source}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.source[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="company">Company</label>
          <input
            type="text"
            name="company"
            class="form-control"
            class:is-invalid={formErrors.company}
            bind:value={company}
            id="company"
            placeholder="Company"
          />
          {#if formErrors.company}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.company[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="gstNumber">GST Number</label>
          <input
            type="text"
            name="gstNumber"
            class="form-control"
            class:is-invalid={formErrors.gstNumber}
            bind:value={gstNumber}
            id="gstNumber"
            placeholder="GST Number"
          />
          {#if formErrors.gstNumber}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.gstNumber[0]}</li>
            </ul>
          {/if}
        </div>
      </div>
      <div class="col-span-2">
        <label class="form-label" for="description"> Description </label>
        <textarea
          name="description"
          id="description"
          class="form-control"
          class:is-invalid={formErrors.description}
          bind:value={description}
          required
          placeholder="Description"
        ></textarea>

        {#if formErrors.description}
          <ul class="text-danger mt-1 text-xs capitalize">
            <li>{formErrors.description[0]}</li>
          </ul>
        {/if}
      </div>
      <hr />
      <h6>Client Details</h6>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="form-label" for="name">
            Name <span class="text-danger">*</span>
          </label>
          <input
            type="text"
            name="name"
            class="form-control"
            class:is-invalid={formErrors.name}
            bind:value={name}
            required
            id="name"
            placeholder="Name"
          />
          {#if formErrors.name}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.name[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="designation"> Designation </label>
          <input
            type="text"
            name="designation"
            class="form-control"
            class:is-invalid={formErrors.designation}
            bind:value={designation}
            id="designation"
            placeholder="Designation"
          />
          {#if formErrors.designation}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.designation[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="email"> Email </label>
          <input
            type="email"
            name="email"
            class="form-control"
            class:is-invalid={formErrors.email}
            bind:value={email}
            id="email"
            placeholder="Email"
          />
          {#if formErrors.email}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.email[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="mobile"> Mobile </label>
          <input
            type="text"
            name="mobile"
            class="form-control"
            class:is-invalid={formErrors.mobile}
            bind:value={mobile}
            id="mobile"
            placeholder="Mobile"
          />
          {#if formErrors.mobile}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.mobile[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="alternateMobile">
            Alternate Mobile
          </label>
          <input
            type="text"
            name="alternateMobile"
            class="form-control"
            class:is-invalid={formErrors.alternateMobile}
            bind:value={alternateMobile}
            id="alternateMobile"
            placeholder="Alternate Mobile"
          />
          {#if formErrors.alternateMobile}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.alternateMobile[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="whatsapp"> Whatsapp </label>
          <input
            type="text"
            name="whatsapp"
            class="form-control"
            class:is-invalid={formErrors.whatsapp}
            bind:value={whatsapp}
            id="whatsapp"
            placeholder="Whatsapp"
          />
          {#if formErrors.whatsapp}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.whatsapp[0]}</li>
            </ul>
          {/if}
        </div>
        <div>
          <label class="form-label" for="address"> Address </label>
          <input
            type="text"
            name="address"
            class="form-control"
            class:is-invalid={formErrors.address}
            bind:value={address}
            id="address"
            placeholder="Address"
          />
          {#if formErrors.address}
            <ul class="text-danger mt-1 text-xs capitalize">
              <li>{formErrors.address[0]}</li>
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
          {loading ? "Creating..." : "Create New"}
        </button>
      </div>
    </form>
  </div>
</div>
<!-- /Add Canvas -->

<!-- Order Lists -->
<div class="modal custom-modal fade" id="order_lists_status" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Order Lists</h5>
        <button
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        >
          <i class="ti ti-x"></i>
        </button>
      </div>
      <div class="modal-body">
        <ChangeListVisiableStatus />
      </div>
    </div>
  </div>
</div>
<!-- /Order Lists -->
