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
  import { page } from "$app/stores";
  import Loader from "$lib/components/Loader.svelte";
  let loadingData = true;

  import { checkAuth } from "$lib/utils/auth";
  let currentUser = null;

  let workorders = [];
  let orders = [];
  let companies = [];
  let users = [];

  let trashBin = false;

  let formType = "Create";
  let updateWorkOrder = null;
  let userId = null;
  let byCompanyId = null;
  let orderTypeFilter = "";
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
    currentUser = checkAuth();
    window.__addWorkOrderType = (id) => addOrderTypeFromList(id);
    window.__changeWorkOrderStatus = (id) => changeStatusFromList(id);

    const filterState = $workOrderFilterStore;

    userId = filterState.userId || null;
    byCompanyId = filterState.byCompanyId || null;
    orderTypeFilter = filterState.orderTypeFilter || "";
    searchTerm = filterState.searchTerm || "";
    currentPage = filterState.currentPage || 1;
    rowsPerPage = filterState.rowsPerPage || 10;
    selectedFilter = filterState.selectedFilter || "last7days";
    customStartDate = filterState.customStartDate || null;
    customEndDate = filterState.customEndDate || null;
    if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
      selectedFilter = "last7days";
      customStartDate = null;
      customEndDate = null;
    }

    if ($page.url.searchParams.get("refresh") === "1") {
      refresh = true;
      goto("/admin/workorder", { replaceState: true });
    }

    fetchWorkOrders();
    getAllUsers();
    getAllCompanies();
    getAllOrders();

    setTimeout(() => {
      firstLoad = true;
    }, 500);

    return () => {
      try {
        delete window.__addWorkOrderType;
        delete window.__changeWorkOrderStatus;
      } catch (_) {}
    };
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
      if (orderTypeFilter) {
        query.append("orderType", orderTypeFilter);
      }
      if (trashBin) {
        query.append("withDeleted", trashBin);
      }

      updateFilterStore({
        userId,
        byCompanyId,
        orderTypeFilter,
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
    orderTypeFilter,
    trashBin,
  ],
    checkFetchRecord();

  function checkFetchRecord() {
    if (firstLoad) {
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) {
        loadingData = false;
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
          <span>${row?.workOrderNo ? row.workOrderNo : "—"}</span>
          ${row?.orderNo ? `<span class="text-muted fw-normal" style="font-size:11px;">${row.orderNo}</span>` : ""}
        </a>`;
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
    {
      key: "orderType",
      label: "Order Type",
      render: (val, row) => {
        const t = row?.orderType;
        const map = {
          Machine: { label: "Machine", bg: "#0ea5e9", color: "#fff" },
          Abrasive: { label: "Abrasive", bg: "#f59e0b", color: "#1f2937" },
          SpareParts: { label: "Spare Parts", bg: "#64748b", color: "#fff" },
        };
        if (t && map[t]) {
          const m = map[t];
          return `<span class="badge" style="font-size:10px;background:${m.bg};color:${m.color};">${m.label}</span>`;
        }
        if (t) {
          return `<span class="badge" style="font-size:10px;background:#e5e7eb;color:#374151;">${t}</span>`;
        }
        return `<button type="button" class="btn btn-outline-primary btn-sm py-0 px-2" style="font-size:11px;" onclick="window.__addWorkOrderType && window.__addWorkOrderType(${row.id})">Add type</button>`;
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
      key: "status",
      label: "Status",
      render: (val, row) => {
        const st = row?.status || "Pending";
        const style =
          st === "Completed"
            ? "background:#16a34a;color:#fff;"
            : st === "Dispatched"
              ? "background:#2563eb;color:#fff;"
              : st === "Hold"
                ? "background:#f59e0b;color:#1f2937;"
                : "background:#eab308;color:#1f2937;";
        return `<button type="button" class="badge border-0" style="font-size:10px;cursor:pointer;${style}" title="Click to change status" onclick="event.stopPropagation();window.__changeWorkOrderStatus&&window.__changeWorkOrderStatus(${row.id})">${st}</button>`;
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

  async function addOrderTypeFromList(id) {
    const row = workorders.find((w) => w.id === Number(id));
    if (!row) return;
    if (row.orderType) {
      Swal.fire("Already set", `Order type is already "${row.orderType}".`, "info");
      return;
    }
    const companyIdVal = row.company?.id ?? row.companyId;
    if (!companyIdVal) {
      Swal.fire("Error", "Company is missing on this work order.", "error");
      return;
    }

    const badges = [
      { value: "Machine", label: "Machine", bg: "#0ea5e9", color: "#fff" },
      { value: "Abrasive", label: "Abrasive", bg: "#f59e0b", color: "#1f2937" },
      { value: "SpareParts", label: "Spare Parts", bg: "#64748b", color: "#fff" },
    ];
    const badgeHtml = badges
      .map(
        (b) => `
        <button type="button" class="wo-type-opt" data-value="${b.value}" style="
          display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;
          border:1.5px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:0 0 10px;
          background:#fff;cursor:pointer;outline:none;
        ">
          <span style="
            display:inline-flex;align-items:center;justify-content:center;
            min-width:110px;padding:8px 16px;border-radius:999px;font-size:13px;font-weight:700;
            background:${b.bg};color:${b.color};
          ">${b.label}</span>
          <span class="wo-type-check" style="
            flex-shrink:0;width:22px;height:22px;border-radius:50%;border:2px solid #d1d5db;
            display:inline-flex;align-items:center;justify-content:center;color:transparent;font-size:12px;
          ">✓</span>
        </button>`,
      )
      .join("");

    const { value: selectedType, isConfirmed } = await Swal.fire({
      title: "Set order type",
      html: `
        <div style="text-align:left;margin:0 0 14px;">
          <div style="font-size:12px;color:#6b7280;">Work order</div>
          <div style="font-size:15px;font-weight:700;color:#111827;font-family:ui-monospace,monospace;">${row.workOrderNo || `WO #${row.id}`}</div>
        </div>
        <div id="wo-type-badges" style="text-align:left;">${badgeHtml}</div>
        <input type="hidden" id="wo-type-value" value="" />
      `,
      width: 420,
      showCancelButton: true,
      confirmButtonText: "Save type",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#9ca3af",
      focusConfirm: false,
      customClass: {
        popup: "rounded-3",
        title: "fs-5",
        actions: "gap-2",
      },
      preConfirm: () => {
        const v = document.getElementById("wo-type-value")?.value;
        if (!v) {
          Swal.showValidationMessage("Please choose an order type.");
          return false;
        }
        return v;
      },
      didOpen: () => {
        const wrap = document.getElementById("wo-type-badges");
        const hidden = document.getElementById("wo-type-value");
        if (!wrap || !hidden) return;

        const select = (btn) => {
          wrap.querySelectorAll(".wo-type-opt").forEach((el) => {
            el.style.borderColor = "#e5e7eb";
            el.style.boxShadow = "none";
            el.style.background = "#fff";
            const check = el.querySelector(".wo-type-check");
            if (check) {
              check.style.borderColor = "#d1d5db";
              check.style.background = "transparent";
              check.style.color = "transparent";
            }
          });
          btn.style.borderColor = "#2563eb";
          btn.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.15)";
          btn.style.background = "#f8fafc";
          const check = btn.querySelector(".wo-type-check");
          if (check) {
            check.style.borderColor = "#2563eb";
            check.style.background = "#2563eb";
            check.style.color = "#fff";
          }
          hidden.value = btn.getAttribute("data-value") || "";
        };

        wrap.querySelectorAll(".wo-type-opt").forEach((btn) => {
          btn.addEventListener("click", () => select(btn));
          btn.addEventListener("mouseenter", () => {
            if (hidden.value !== btn.getAttribute("data-value")) {
              btn.style.borderColor = "#cbd5e1";
            }
          });
          btn.addEventListener("mouseleave", () => {
            if (hidden.value !== btn.getAttribute("data-value")) {
              btn.style.borderColor = "#e5e7eb";
            }
          });
        });
      },
    });
    if (!isConfirmed || !selectedType) return;

    try {
      Swal.showLoading();
      await authApiFetch(`${API_ROUTES.WORK_ORDER}/${row.id}`, {
        method: "PUT",
        data: JSON.stringify({
          companyId: companyIdVal,
          orderType: selectedType,
        }),
      });
      workorders = workorders.map((w) =>
        w.id === row.id ? { ...w, orderType: selectedType } : w,
      );
      Swal.fire(
        "Saved",
        `Order type set to ${selectedType === "SpareParts" ? "Spare Parts" : selectedType}.`,
        "success",
      );
    } catch (err) {
      Swal.fire("Error", err?.message || "Failed to set order type.", "error");
    }
  }

  let showListStatusModal = false;
  let listStatusRow = null;
  let listStatusDraft = "Pending";
  let listStatusRemark = "";
  let listStatusError = "";
  let listStatusUpdating = false;
  let listStatusPhotoFiles = [];
  let listStatusPhotoPreviews = [];

  function listStatusOptions(row) {
    const isDispatch =
      row?.orderType === "Abrasive" || row?.orderType === "SpareParts";
    return [
      { value: "Pending", label: "Pending", bg: "#eab308", color: "#1f2937" },
      ...(isDispatch
        ? [
            { value: "Dispatched", label: "Dispatched", bg: "#2563eb", color: "#fff" },
            { value: "Hold", label: "Hold", bg: "#f59e0b", color: "#1f2937" },
          ]
        : []),
      { value: "Completed", label: "Completed", bg: "#16a34a", color: "#fff" },
    ];
  }

  function clearListStatusPhotos() {
    for (const p of listStatusPhotoPreviews) {
      if (p?.url) URL.revokeObjectURL(p.url);
    }
    listStatusPhotoFiles = [];
    listStatusPhotoPreviews = [];
  }

  function openListStatusModal(id) {
    const row = workorders.find((w) => w.id === Number(id));
    if (!row) return;
    listStatusRow = row;
    listStatusDraft = row.status || "Pending";
    listStatusRemark = row.status === "Hold" ? row.remarks || "" : "";
    listStatusError = "";
    clearListStatusPhotos();
    showListStatusModal = true;
  }

  function closeListStatusModal() {
    if (listStatusUpdating) return;
    showListStatusModal = false;
    listStatusError = "";
    clearListStatusPhotos();
    listStatusRow = null;
  }

  function onListStatusPhotosPick(e) {
    const picked = Array.from(e?.target?.files || []);
    e.target.value = "";
    if (!picked.length) return;
    const room = Math.max(0, 5 - listStatusPhotoFiles.length);
    const next = picked.slice(0, room);
    listStatusError = picked.length > room ? "Maximum 5 photos." : "";
    const previews = next.map((file) => ({
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    listStatusPhotoFiles = [...listStatusPhotoFiles, ...next];
    listStatusPhotoPreviews = [...listStatusPhotoPreviews, ...previews];
  }

  function removeListStatusPhoto(idx) {
    const prev = listStatusPhotoPreviews[idx];
    if (prev?.url) URL.revokeObjectURL(prev.url);
    listStatusPhotoFiles = listStatusPhotoFiles.filter((_, i) => i !== idx);
    listStatusPhotoPreviews = listStatusPhotoPreviews.filter((_, i) => i !== idx);
  }

  async function submitListStatusModal() {
    const row = listStatusRow;
    if (!row?.id || listStatusUpdating) return;
    listStatusError = "";
    const current = row.status || "Pending";
    const isDispatch =
      row.orderType === "Abrasive" || row.orderType === "SpareParts";
    if (listStatusDraft === "Hold" && !String(listStatusRemark || "").trim()) {
      listStatusError = 'Status "Hold" requires a remark.';
      return;
    }
    if (
      listStatusDraft === current &&
      listStatusDraft !== "Hold" &&
      !listStatusPhotoFiles.length
    ) {
      listStatusError = "Status is already set to that value.";
      return;
    }
    if (!isDispatch && listStatusPhotoFiles.length) {
      listStatusError =
        "Photos are only allowed for Abrasive or Spare Parts work orders.";
      return;
    }

    listStatusUpdating = true;
    try {
      let data;
      if (listStatusPhotoFiles.length) {
        const form = new FormData();
        form.append("status", listStatusDraft);
        if (listStatusDraft === "Hold" || listStatusRemark) {
          form.append("remarks", String(listStatusRemark || "").trim());
        }
        for (const file of listStatusPhotoFiles.slice(0, 5)) {
          form.append("images", file);
        }
        data = await authApiFetch(`${API_ROUTES.WORK_ORDER}/${row.id}/status`, {
          method: "PUT",
          data: form,
        });
      } else {
        const payload = { status: listStatusDraft };
        if (listStatusDraft === "Hold" || listStatusRemark) {
          payload.remarks = String(listStatusRemark || "").trim() || null;
        }
        data = await authApiFetch(`${API_ROUTES.WORK_ORDER}/${row.id}/status`, {
          method: "PUT",
          data: JSON.stringify(payload),
        });
      }
      const next = data?.data || {};
      workorders = workorders.map((w) =>
        w.id === row.id
          ? {
              ...w,
              status: next.status ?? listStatusDraft,
              remarks:
                next.remarks !== undefined
                  ? next.remarks
                  : listStatusDraft === "Hold"
                    ? listStatusRemark
                    : w.remarks,
              sentDelay: next.sentDelay ?? w.sentDelay,
            }
          : w,
      );
      showListStatusModal = false;
      clearListStatusPhotos();
      listStatusRow = null;
    } catch (err) {
      listStatusError = err?.message || "Failed to update status.";
    } finally {
      listStatusUpdating = false;
    }
  }

  function changeStatusFromList(id) {
    openListStatusModal(id);
  }

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
    <div class="row g-2 align-items-center mb-3">
      {#if trashBin}
        <div class="col-auto pb-2.5">
          <button on:click={() => (trashBin = false)}>
            <i class="ti ti-arrow-narrow-left me-1"></i>Back
          </button>
        </div>
      {:else}
        <div class="col-auto">
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
              style="min-width:160px;"
            />
          </div>
        </div>
        <div class="col-auto">
          <select bind:value={selectedFilter} class="form-select w-auto">
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="last7days">Last 7 Days</option>
            <option value="last30days">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
        {#if selectedFilter === "custom"}
          <div class="col-auto">
            <input
              type="date"
              bind:value={customStartDate}
              class="form-control"
              style="min-width:140px;"
            />
          </div>
          <div class="col-auto">
            <input
              type="date"
              bind:value={customEndDate}
              class="form-control"
              style="min-width:140px;"
            />
          </div>
        {/if}

        {#if currentUser?.role != "user"}
          <div class="col-auto">
            <select bind:value={userId} class="form-select w-auto">
              <option value={null}>Select User</option>
              {#each users as user}
                <option value={user?.id}>{user?.name}</option>
              {/each}
            </select>
          </div>
          <div class="col-auto">
            <select bind:value={byCompanyId} class="form-select w-auto">
              <option value={null}>Select Company</option>
              {#each companies as company}
                <option value={company?.id}>{company?.name}</option>
              {/each}
            </select>
          </div>
        {/if}
        <div class="col-auto">
          <select bind:value={orderTypeFilter} class="form-select w-auto">
            <option value="">All Order Types</option>
            <option value="Machine">Machine</option>
            <option value="Abrasive">Abrasive</option>
            <option value="SpareParts">Spare Parts</option>
          </select>
        </div>
        <div class="col"></div>
        {#if currentUser?.role != "user"}
          <div class="col-auto">
            <div class="d-flex align-items-center shadow p-1 rounded border view-icons bg-white">
              <button
                on:click={() => (trashBin = true)}
                class="flex-shrink-0 btn btn-sm p-1 border-0 fs-14 bg-primary text-white"
              >
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </div>
        {/if}
        <div class="col-auto">
          {#if currentUser?.role === "master" || currentUser?.role === "admin"}
            <a href="/admin/workorder/add" class="btn btn-primary">
              <i class="ti ti-square-rounded-plus-filled me-1"></i>Add New Work Order
            </a>
          {:else}
            <button class="btn btn-primary" disabled title="Only Admin can create work orders">
              <i class="ti ti-square-rounded-plus-filled me-1"></i>Add New Work Order
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

{#if showListStatusModal && listStatusRow}
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.5);z-index:1060;"
    on:click|self={closeListStatusModal}
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title mb-0 fw-semibold">
            <i class="ti ti-refresh me-2 text-primary"></i>Change status
          </h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            disabled={listStatusUpdating}
            on:click={closeListStatusModal}
          ></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <div class="text-muted" style="font-size:12px;">Work order</div>
            <div class="fw-semibold font-monospace">
              {listStatusRow.workOrderNo || `WO #${listStatusRow.id}`}
            </div>
          </div>

          <label class="form-label">Status <span class="text-danger">*</span></label>
          <div class="wo-list-st-opts mb-3">
            {#each listStatusOptions(listStatusRow) as opt}
              <button
                type="button"
                class="wo-list-st-chip"
                class:is-active={listStatusDraft === opt.value}
                style="--st-bg:{opt.bg};--st-fg:{opt.color};"
                on:click={() => (listStatusDraft = opt.value)}
              >
                {#if listStatusDraft === opt.value}<i class="ti ti-check"></i>{/if}
                {opt.label}
              </button>
            {/each}
          </div>

          {#if listStatusDraft === "Hold"}
            <div class="mb-3">
              <label class="form-label">Hold remark <span class="text-danger">*</span></label>
              <textarea
                class="form-control"
                rows="2"
                bind:value={listStatusRemark}
                placeholder="Why is this on hold?"
              ></textarea>
            </div>
          {/if}

          {#if listStatusRow.orderType === "Abrasive" || listStatusRow.orderType === "SpareParts"}
            <div class="mb-1">
              <label class="form-label">
                Photos <span class="text-muted fw-normal">(optional, max 5)</span>
              </label>
              <div class="d-flex flex-wrap gap-2 align-items-start mb-2">
                {#each listStatusPhotoPreviews as preview, idx}
                  <div class="wo-list-st-preview">
                    <img src={preview.url} alt={preview.name || "photo"} />
                    <button
                      type="button"
                      class="wo-list-st-preview__rm"
                      title="Remove"
                      on:click={() => removeListStatusPhoto(idx)}
                    ><i class="ti ti-x"></i></button>
                  </div>
                {/each}
                {#if listStatusPhotoFiles.length < 5}
                  <label class="wo-list-st-add">
                    <i class="ti ti-photo-plus"></i>
                    <span>Add</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      hidden
                      on:change={onListStatusPhotosPick}
                    />
                  </label>
                {/if}
              </div>
              <div class="text-muted" style="font-size:11px;">
                Shown in status history (CRM + app).
              </div>
            </div>
          {/if}

          {#if listStatusError}
            <div class="alert alert-danger py-2 mb-0 mt-3" style="font-size:13px;">
              {listStatusError}
            </div>
          {/if}
        </div>
        <div class="modal-footer py-2">
          <button
            type="button"
            class="btn btn-light btn-sm"
            disabled={listStatusUpdating}
            on:click={closeListStatusModal}
          >Cancel</button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={listStatusUpdating}
            on:click={submitListStatusModal}
          >
            {listStatusUpdating ? "Updating…" : "Update status"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .wo-list-st-opts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .wo-list-st-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1.5px solid #e2e8f0;
    border-radius: 999px;
    padding: 7px 14px;
    background: #fff;
    color: #475569;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    outline: none;
  }
  .wo-list-st-chip.is-active {
    background: var(--st-bg, #2563eb);
    border-color: var(--st-bg, #2563eb);
    color: var(--st-fg, #fff);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--st-bg, #2563eb) 22%, transparent);
  }
  .wo-list-st-preview {
    position: relative;
    width: 72px;
    height: 72px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
  }
  .wo-list-st-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .wo-list-st-preview__rm {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 50%;
    background: rgba(15, 23, 42, 0.7);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    padding: 0;
    cursor: pointer;
  }
  .wo-list-st-add {
    width: 72px;
    height: 72px;
    border: 1.5px dashed #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
    color: #64748b;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    margin: 0;
  }
</style>
