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

  async function changeStatusFromList(id) {
    const row = workorders.find((w) => w.id === Number(id));
    if (!row) return;
    const companyIdVal = row.company?.id ?? row.companyId;
    if (!companyIdVal) {
      Swal.fire("Error", "Company is missing on this work order.", "error");
      return;
    }

    const current = row.status || "Pending";
    const isDispatch =
      row.orderType === "Abrasive" || row.orderType === "SpareParts";
    const options = [
      { value: "Pending", label: "Pending", bg: "#eab308", color: "#1f2937" },
      ...(isDispatch
        ? [
            { value: "Dispatched", label: "Dispatched", bg: "#2563eb", color: "#fff" },
            { value: "Hold", label: "Hold", bg: "#f59e0b", color: "#1f2937" },
          ]
        : []),
      { value: "Completed", label: "Completed", bg: "#16a34a", color: "#fff" },
    ];

    const optsHtml = options
      .map(
        (o) => `
        <button type="button" class="wo-st-opt" data-value="${o.value}" style="
          display:flex;align-items:center;gap:12px;width:100%;text-align:left;
          border:1.5px solid ${o.value === current ? "#2563eb" : "#e5e7eb"};
          border-radius:12px;padding:11px 14px;margin:0 0 8px;
          background:${o.value === current ? "#f8fafc" : "#fff"};cursor:pointer;outline:none;
          box-shadow:${o.value === current ? "0 0 0 3px rgba(37,99,235,0.12)" : "none"};
        ">
          <span style="
            flex-shrink:0;min-width:88px;text-align:center;padding:5px 10px;border-radius:999px;
            font-size:11px;font-weight:700;background:${o.bg};color:${o.color};
          ">${o.label}</span>
          <span style="flex:1;font-size:13px;font-weight:600;color:#111827;">${o.label}</span>
          <span class="wo-st-check" style="
            flex-shrink:0;width:20px;height:20px;border-radius:50%;border:2px solid ${o.value === current ? "#2563eb" : "#d1d5db"};
            background:${o.value === current ? "#2563eb" : "transparent"};color:${o.value === current ? "#fff" : "transparent"};
            display:inline-flex;align-items:center;justify-content:center;font-size:12px;
          ">✓</span>
        </button>`,
      )
      .join("");

    const { value: result, isConfirmed } = await Swal.fire({
      title: "Change status",
      html: `
        <div style="text-align:left;margin:0 0 12px;">
          <div style="font-size:12px;color:#6b7280;">Work order</div>
          <div style="font-size:15px;font-weight:700;color:#111827;font-family:ui-monospace,monospace;">${row.workOrderNo || `WO #${row.id}`}</div>
        </div>
        <div id="wo-st-opts" style="text-align:left;">${optsHtml}</div>
        <div id="wo-st-hold-wrap" style="display:${current === "Hold" ? "block" : "none"};text-align:left;margin-top:4px;">
          <label style="font-size:12px;font-weight:600;color:#374151;">Hold remark</label>
          <input id="wo-st-hold-remark" class="swal2-input" style="width:100%;margin:6px 0 0;" placeholder="Required for Hold" value="${(row.remarks || "").replace(/"/g, "&quot;")}" />
        </div>
        <input type="hidden" id="wo-st-value" value="${current}" />
      `,
      width: 420,
      showCancelButton: true,
      confirmButtonText: "Update status",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#9ca3af",
      focusConfirm: false,
      preConfirm: () => {
        const status = document.getElementById("wo-st-value")?.value;
        if (!status) {
          Swal.showValidationMessage("Please choose a status.");
          return false;
        }
        let remarks = undefined;
        if (status === "Hold") {
          remarks = String(document.getElementById("wo-st-hold-remark")?.value || "").trim();
          if (!remarks) {
            Swal.showValidationMessage('Status "Hold" requires a remark.');
            return false;
          }
        }
        return { status, remarks };
      },
      didOpen: () => {
        const wrap = document.getElementById("wo-st-opts");
        const hidden = document.getElementById("wo-st-value");
        const holdWrap = document.getElementById("wo-st-hold-wrap");
        if (!wrap || !hidden) return;

        const select = (btn) => {
          wrap.querySelectorAll(".wo-st-opt").forEach((el) => {
            el.style.borderColor = "#e5e7eb";
            el.style.boxShadow = "none";
            el.style.background = "#fff";
            const check = el.querySelector(".wo-st-check");
            if (check) {
              check.style.borderColor = "#d1d5db";
              check.style.background = "transparent";
              check.style.color = "transparent";
            }
          });
          btn.style.borderColor = "#2563eb";
          btn.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.15)";
          btn.style.background = "#f8fafc";
          const check = btn.querySelector(".wo-st-check");
          if (check) {
            check.style.borderColor = "#2563eb";
            check.style.background = "#2563eb";
            check.style.color = "#fff";
          }
          const val = btn.getAttribute("data-value") || "";
          hidden.value = val;
          if (holdWrap) holdWrap.style.display = val === "Hold" ? "block" : "none";
        };

        wrap.querySelectorAll(".wo-st-opt").forEach((btn) => {
          btn.addEventListener("click", () => select(btn));
        });
      },
    });

    if (!isConfirmed || !result?.status) return;
    if (result.status === current && result.status !== "Hold") {
      Swal.fire("No change", "Status is already set to that value.", "info");
      return;
    }

    try {
      Swal.showLoading();
      const payload = {
        companyId: companyIdVal,
        status: result.status,
      };
      if (result.status === "Hold") {
        payload.remarks = result.remarks;
      }
      await authApiFetch(`${API_ROUTES.WORK_ORDER}/${row.id}`, {
        method: "PUT",
        data: JSON.stringify(payload),
      });
      workorders = workorders.map((w) =>
        w.id === row.id
          ? {
              ...w,
              status: result.status,
              ...(result.status === "Hold" ? { remarks: result.remarks } : {}),
            }
          : w,
      );
      Swal.fire("Updated", `Status set to ${result.status}.`, "success");
    } catch (err) {
      Swal.fire("Error", err?.message || "Failed to update status.", "error");
    }
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
