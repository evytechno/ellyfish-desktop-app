<script>
  import { onMount } from "svelte";
  import Swal from "sweetalert2";
  import { dispatchedDetailsStore } from "$lib/stores/dataStores";
  import { API_BASE_URL } from "$lib/constants/constants";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { authApiFetch } from "$lib/api/client";
  import { fetchWorkshopSalesEmployees } from "$lib/api/workshopSales";

  // ── Props ────────────────────────────────────────────────
  export let order = { workOrderNumber: "" };

  // ── Work-order status helpers ────────────────────────────
  // Statuses in progression order
  const STATUS_ORDER = [
    "open",
    "inProgress",
    "completed",
    "dispatchInProgress",
    "dispatched",
    "inTransit",
    "delivered",
    "installationInProgress",
    "installed",
  ];
  function getNextStatus(a) {
    const index = STATUS_ORDER.indexOf(a);
    return index >= 0 && index < STATUS_ORDER.length - 1
      ? STATUS_ORDER[index + 1]
      : null;
  }

  function statusGte(a, b) {
    return STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b);
  }
  function statusLte(a, b) {
    return STATUS_ORDER.indexOf(a) <= STATUS_ORDER.indexOf(b);
  }

  // Tab visibility
  // Dispatch tab: show from completed onwards
  $: showDispatch = statusGte(workOrderStatus, "completed");
  // Installation tab: show from delivered onwards
  $: showInstallation = statusGte(workOrderStatus, "delivered");
  // Visit tab: show from installationInProgress onwards
  $: showVisit = statusGte(workOrderStatus, "installationInProgress");

  // Edit permissions — CRM has full manage access
  // Dispatch: editable while dispatchInProgress → inTransit
  $: canEditDispatch =
    statusGte(workOrderStatus, "dispatchInProgress") &&
    statusLte(workOrderStatus, "inTransit");
  // Installation: editable while delivered → installationInProgress
  $: canEditInstallation =
    statusGte(workOrderStatus, "delivered") &&
    statusLte(workOrderStatus, "installationInProgress");
  $: canEditAssignees = canEditInstallation;
  // Visits: add/edit while installationInProgress only
  $: canEditVisits = workOrderStatus === "installationInProgress";
  $: canEditVisitAssignees = false; // kept for template branches; CRM uses full visit edit

  // Derived current status label for the status badge
  const WO_STATUS_LABELS = {
    open: "Open",
    inProgress: "In Progress",
    completed: "Completed",
    dispatchInProgress: "Dispatching",
    dispatched: "Dispatched",
    inTransit: "In Transit",
    delivered: "Delivered",
    installationInProgress: "Installation",
    installed: "Installed",
  };

  $: workOrderStatusLabel =
    WO_STATUS_LABELS[workOrderStatus] ?? workOrderStatus;

  // Status badge colour
  const WO_STATUS_CLS = {
    open: "bg-gray-100 text-gray-600",
    inProgress: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    dispatchInProgress: "bg-yellow-100 text-yellow-800",
    dispatched: "bg-orange-100 text-orange-700",
    inTransit: "bg-purple-100 text-purple-700",
    delivered: "bg-teal-100 text-teal-700",
    installationInProgress: "bg-indigo-100 text-indigo-700",
    installed: "bg-green-100 text-green-800",
  };
  $: workOrderStatusCls =
    WO_STATUS_CLS[workOrderStatus] ?? "bg-gray-100 text-gray-600";

  // ── Constants ────────────────────────────────────────────
  const TABS = [
    { id: "dispatch", label: "Dispatch", icon: "📦" },
    { id: "installation", label: "Installation", icon: "🔧" },
    { id: "visit", label: "Service Visit", icon: "🚗" },
  ];

  let currentTab = "dispatch";

  function sectionUnlocked(id) {
    if (id === "dispatch") return showDispatch;
    if (id === "installation") return showInstallation;
    if (id === "visit") return showVisit;
    return false;
  }

  function sectionLockHint(id) {
    if (id === "dispatch") return "Unlocks when work order is Completed";
    if (id === "installation") return "Unlocks after Delivered";
    if (id === "visit") return "Unlocks when Installation begins";
    return "";
  }

  function focusSection(id) {
    if (sectionUnlocked(id)) currentTab = id;
  }

  // Keep active tab on an unlocked section when status changes
  $: {
    if (!sectionUnlocked(currentTab)) {
      if (showVisit) currentTab = "visit";
      else if (showInstallation) currentTab = "installation";
      else if (showDispatch) currentTab = "dispatch";
    }
  }

  const VISIT_STATUS_MAP = {
    pending: { cls: "bg-gray-100 text-gray-600", label: "Pending" },
    notVisited: { cls: "bg-gray-200 text-gray-700", label: "Unvisited" },
    visitedButNoprogress: {
      cls: "bg-yellow-100 text-yellow-800",
      label: "Visited-No Progress",
    },
    partiallyInstalled: {
      cls: "bg-blue-100 text-blue-800",
      label: "In Progress on Site",
    },
    Installed: {
      cls: "bg-green-100 text-green-800",
      label: "Successfully Done",
    },
  };

  const VISIT_STATUS_OPTIONS = [
    { label: "Pending", value: "pending" },
    { label: "Unvisited", value: "notVisited" },
    { label: "Visited-No Progress", value: "visitedButNoprogress" },
    { label: "In Progress on Site", value: "partiallyInstalled" },
    { label: "Successfully Done", value: "Installed" },
  ];

  const AVAILABLE_OPTIONS = [
    { label: "Not Available", value: "notAvailable" },
    { label: "Available", value: "available" },
    { label: "Not Required", value: "notRequired" },
  ];

  const INSTALL_TYPE_OPTIONS = [
    { label: "Offline", value: "offline" },
    { label: "Online", value: "online" },
  ];

  const REQUIREMENTS = [
    { label: "Abrasive", field: "abrasive" },
    { label: "Electric", field: "electric" },
    { label: "Compressor", field: "compressor" },
    { label: "Welding", field: "welding" },
    { label: "Compressor Line", field: "compressorLine" },
  ];

  const ic =
    "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition";
  const lc = "block mb-1 text-xs font-semibold text-gray-600";
  const sectionCard = "pt-1";
  const formGrid =
    "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3";

  // ── Multi-select dropdown state ──────────────────────────
  let dropdownOpen = {};
  function toggleDropdown(id) {
    dropdownOpen = { ...dropdownOpen, [id]: !dropdownOpen[id] };
  }
  function closeDropdown(id) {
    dropdownOpen = { ...dropdownOpen, [id]: false };
  }
  function toggleEmployee(arr, id) {
    const sid = String(id);
    const has = (arr || []).some((x) => String(x) === sid);
    return has
      ? (arr || []).filter((x) => String(x) !== sid)
      : [...(arr || []), id];
  }
  function selectedLabels(ids) {
    const pool = [
      ...(dispatchData?.employeesDetails ?? []),
      ...users,
    ];
    return (ids || [])
      .map((id) => pool.find((u) => String(u._id) === String(id)))
      .filter(Boolean);
  }

  /** Visit assignees = Installation team only (not full warehouse list). */
  function installationAssigneeOptions() {
    const details = dispatchData?.employeesDetails ?? [];
    if (details.length) return details;
    const ids = dispatchData?.employees ?? installForm?.employees ?? [];
    return selectedLabels(ids);
  }

  // ── API helpers (Nest CRM for dispatch; warehouse only for assignees) ──
  async function crmFetch(path, method = "GET", data = null) {
    const resp = await authApiFetch(path, {
      method,
      data: data && method !== "GET" ? data : undefined,
    });
    if (resp && resp.success === false) throw resp;
    return resp;
  }

  async function crmFetchForm(path, method, formData) {
    // Multipart updates must use Nest /form (multer). Paths are like "dispatch/12" (no leading /).
    const normalized = String(path || "").replace(/^\//, "");
    const isDispatchPut =
      method === "PUT" &&
      /^dispatch\/\d+$/.test(normalized);
    const url = isDispatchPut ? `${normalized}/form` : path;
    const resp = await authApiFetch(url, {
      method,
      data: formData,
    });
    if (resp && resp.success === false) throw resp;
    return resp;
  }

  function parseValidationErrors(error) {
    if (!error?.errors && !error?.data?.errors) return null;
    const list = error.errors || error.data?.errors || [];
    const fmt = {};
    list.forEach((e) => (fmt[e.field] = e.errors));
    return Object.keys(fmt).length ? fmt : null;
  }

  // ── Global data ──────────────────────────────────────────
  let dispatchData = null;
  let projectDetails = {};
  let workOrderStatus = "open"; // tracks the work order status from the API
  let loadingData = false;
  let formErrors = {};
  let users = [];

  function syncForms(d) {
    if (!d) return;
    // workOrderStatus = d.status ?? "open";
    dispatchForm = {
      medium: d.medium ?? "",
      dispatchDate: d.dispatchDate ?? "",
      packaging: d.packaging ?? "",
      description: d.description ?? "",
      city: d.city ?? "",
      state: d.state ?? "",
    };
    installForm = {
      deliveryDate: d.deliveryDate ?? "",
      installationType: d.installationType ?? "offline",
      abrasive: d.abrasive ?? "notAvailable",
      electric: d.electric ?? "notAvailable",
      compressor: d.compressor ?? "notAvailable",
      welding: d.welding ?? "notAvailable",
      compressorLine: d.compressorLine ?? "notAvailable",
      employees: d.employees ?? [],
    };
    visits = structuredClone(d.lastInstallationDetails ?? []);
    editingIdx = null;
    snapshots = {};
    syncImages(d);
    syncInstallImages(d);
  }

  async function fetchEmployees() {
    try {
      users = await fetchWorkshopSalesEmployees();
    } catch (e) {
      users = [];
    }
  }

  async function fetchDispatch() {
    try {
      loadingData = true;
      const wo = encodeURIComponent(order.workOrderNumber);
      const resp = await crmFetch(
        `${API_ROUTES.DISPATCH_BY_WO}/${wo}`,
        "GET",
      );
      projectDetails = resp?.data?.projectDetails ?? { status: "completed" };
      workOrderStatus = projectDetails?.status ?? "open";

      const raw = { ...(resp?.data ?? {}) };
      delete raw.projectDetails;
      // Prefer id — stub rows still have id even when fields are empty
      dispatchData = raw.id != null ? raw : Object.keys(raw).length > 0 ? raw : null;
      if (
        dispatchData &&
        (dispatchData.employees ?? []).length > 0 &&
        !(dispatchData.employeesDetails ?? []).length
      ) {
        dispatchData = {
          ...dispatchData,
          employeesDetails: selectedLabels(dispatchData.employees),
        };
      }
      if (dispatchData) syncForms(dispatchData);
      else {
        dispatchForm = {
          medium: "",
          dispatchDate: "",
          packaging: "",
          description: "",
          city: "",
          state: "",
        };
        existingImages = [];
      }
      dispatchedDetailsStore.set(dispatchData);
    } catch (e) {
    } finally {
      loadingData = false;
    }
  }

  onMount(async () => {
    fetchEmployees();
    if (order?.workOrderNumber) fetchDispatch();
    // orderUpdate();
  });

  // ── Dispatch state ───────────────────────────────────────
  let dispatchEditing = false;
  let dispatchLoading = false;
  let dispatchForm = {
    medium: "",
    dispatchDate: "",
    packaging: "",
    description: "",
    city: "",
    state: "",
  };

  let newImageFiles = [],
    newImagePreviews = [],
    existingImages = [];
  const imgUrl = (img) => {
    if (!img?.path) return "";
    if (String(img.path).startsWith("http")) return img.path;
    const base = String(API_BASE_URL || "").replace(/\/$/, "");
    return `${base}/uploads/${String(img.path).replace(/^\//, "")}`;
  };

  function syncImages(d) {
    existingImages = d?.dispatchImages ? structuredClone(d.dispatchImages) : [];
    newImageFiles = [];
    newImagePreviews = [];
  }
  function onDispatchImagesChange(e) {
    const files = Array.from(e.target.files);
    newImageFiles = [...newImageFiles, ...files];
    newImagePreviews = [
      ...newImagePreviews,
      ...files.map((f) => URL.createObjectURL(f)),
    ];
    e.target.value = "";
  }
  function removeNewImage(idx) {
    URL.revokeObjectURL(newImagePreviews[idx]);
    newImageFiles = newImageFiles.filter((_, i) => i !== idx);
    newImagePreviews = newImagePreviews.filter((_, i) => i !== idx);
  }
  function removeExistingImage(fn) {
    existingImages = existingImages.filter((img) => img.fileName !== fn);
  }
  async function saveDispatch() {
    try {
      formErrors = {};
      if (!String(dispatchForm.medium || "").trim()) {
        formErrors = { ...formErrors, medium: "Transport medium is required" };
      }
      if (!String(dispatchForm.dispatchDate || "").trim()) {
        formErrors = {
          ...formErrors,
          dispatchDate: "Dispatch date is required",
        };
      }
      if (Object.keys(formErrors).length) {
        Swal.fire(
          "Missing fields",
          "Please fill transport medium and dispatch date.",
          "warning",
        );
        return;
      }

      dispatchLoading = true;
      const fd = new FormData();
      [
        "medium",
        "dispatchDate",
        "packaging",
        "description",
        "city",
        "state",
      ].forEach((k) => fd.append(k, dispatchForm[k] ?? ""));
      // Kept image list (so removals persist); new files use same field for multer
      fd.append("keptDispatchImages", JSON.stringify(existingImages));
      newImageFiles.forEach((f) => fd.append("dispatchImages", f));

      let resp;
      if (dispatchData?.id) {
        resp = await crmFetchForm(
          `${API_ROUTES.DISPATCH}/${dispatchData.id}`,
          "PUT",
          fd,
        );
      } else {
        fd.append("workOrder", order.workOrderNumber);
        resp = await crmFetchForm(`${API_ROUTES.DISPATCH}`, "POST", fd);
        workOrderStatus = "dispatchInProgress";
        focusSection("dispatch");
      }

      dispatchData = resp?.data ?? resp;
      if (dispatchData?.projectDetails) {
        projectDetails = dispatchData.projectDetails;
        workOrderStatus = projectDetails.status ?? workOrderStatus;
        const { projectDetails: _pd, ...rest } = dispatchData;
        dispatchData = rest;
      } else if (resp?.data?.projectDetails) {
        projectDetails = resp.data.projectDetails;
        workOrderStatus = projectDetails.status ?? workOrderStatus;
      }
      syncForms(dispatchData);
      dispatchedDetailsStore.set(dispatchData);
      newImageFiles = [];
      newImagePreviews.forEach((u) => URL.revokeObjectURL(u));
      newImagePreviews = [];

      dispatchEditing = false;

      Swal.fire(
        "Success",
        resp?.message || "Dispatch saved",
        "success",
      );
    } catch (error) {
      const ve = parseValidationErrors(error);
      if (ve) formErrors = ve;
      else Swal.fire("Error", error.message || "Something went wrong", "error");
    } finally {
      dispatchLoading = false;
    }
  }

  // ── Installation state ───────────────────────────────────
  let installEditing = false;
  let installLoading = false;
  let installForm = {
    deliveryDate: "",
    installationType: "offline",
    abrasive: "notAvailable",
    electric: "notAvailable",
    compressor: "notAvailable",
    welding: "notAvailable",
    compressorLine: "notAvailable",
    employees: [],
  };

  let installNewFiles = [],
    installNewPreviews = [],
    installExisting = [];
  const installImgUrl = (img) => imgUrl(img);

  function syncInstallImages(d) {
    installExisting = d?.images ? structuredClone(d.images) : [];
    installNewFiles = [];
    installNewPreviews = [];
  }
  function onInstallImagesChange(e) {
    const files = Array.from(e.target.files);
    installNewFiles = [...installNewFiles, ...files];
    installNewPreviews = [
      ...installNewPreviews,
      ...files.map((f) => URL.createObjectURL(f)),
    ];
    e.target.value = "";
  }
  function removeInstallNewImage(idx) {
    URL.revokeObjectURL(installNewPreviews[idx]);
    installNewFiles = installNewFiles.filter((_, i) => i !== idx);
    installNewPreviews = installNewPreviews.filter((_, i) => i !== idx);
  }
  function removeInstallExistingImage(fn) {
    installExisting = installExisting.filter((img) => img.fileName !== fn);
  }

  async function saveInstall() {
    try {
      installLoading = true;
      formErrors = {};
      const fd = new FormData();
      [
        "deliveryDate",
        "installationType",
        "abrasive",
        "electric",
        "compressor",
        "welding",
        "compressorLine",
      ].forEach((k) => fd.append(k, installForm[k]));
      installForm.employees.forEach((id) => fd.append("employees", id));
      fd.append(
        "employeesDetails",
        JSON.stringify(
          selectedLabels(installForm.employees).map((e) => ({
            _id: e._id,
            username: e.username,
            email: e.email,
          })),
        ),
      );
      fd.append("keptImages", JSON.stringify(installExisting));
      installNewFiles.forEach((f) => fd.append("images", f));

      const resp = await crmFetchForm(
        `${API_ROUTES.DISPATCH}/${dispatchData.id}`,
        "PUT",
        fd,
      );
      dispatchData = resp?.data ?? resp;
      if (dispatchData?.projectDetails) {
        projectDetails = dispatchData.projectDetails;
        workOrderStatus =
          projectDetails.status ?? workOrderStatus;
        const { projectDetails: _pd, ...rest } = dispatchData;
        dispatchData = rest;
      }
      // Ensure chips show even if API omits employeesDetails
      if (
        (dispatchData?.employees ?? []).length > 0 &&
        !(dispatchData.employeesDetails ?? []).length
      ) {
        dispatchData = {
          ...dispatchData,
          employeesDetails: selectedLabels(dispatchData.employees),
        };
      }
      syncForms(dispatchData);
      dispatchedDetailsStore.set(dispatchData);

      // When status is delivered and installation form is saved,
      // advance to installationInProgress
      if (workOrderStatus === "delivered" && dispatchData?.id) {
        const st = await crmFetch(
          `${API_ROUTES.DISPATCH}/${dispatchData.id}/status`,
          "PUT",
          { status: "installationInProgress" },
        );
        projectDetails = st.data?.projectDetails ?? projectDetails;
        workOrderStatus = "installationInProgress";
        focusSection("visit");
      }

      installEditing = false;
      Swal.fire("Success", resp.message || "Installation Updated", "success");
    } catch (error) {
      const ve = parseValidationErrors(error);
      if (ve) formErrors = ve;
      else Swal.fire("Error", error.message || "Something went wrong", "error");
    } finally {
      installLoading = false;
    }
  }

  async function saveInstallAssignees() {
    if (!dispatchData?.id) {
      Swal.fire(
        "Warning",
        "No dispatch record yet. Create dispatch first.",
        "warning",
      );
      return;
    }
    try {
      installLoading = true;
      formErrors = {};
      const fd = new FormData();
      installForm.employees.forEach((id) => fd.append("employees", id));
      fd.append(
        "employeesDetails",
        JSON.stringify(
          selectedLabels(installForm.employees).map((e) => ({
            _id: e._id,
            username: e.username,
            email: e.email,
          })),
        ),
      );
      const resp = await crmFetchForm(
        `${API_ROUTES.DISPATCH}/${dispatchData.id}`,
        "PUT",
        fd,
      );
      dispatchData = resp?.data ?? resp;
      if (
        (dispatchData?.employees ?? []).length > 0 &&
        !(dispatchData.employeesDetails ?? []).length
      ) {
        dispatchData = {
          ...dispatchData,
          employeesDetails: selectedLabels(dispatchData.employees),
        };
      }
      syncForms(dispatchData);
      dispatchedDetailsStore.set(dispatchData);
      Swal.fire("Success", resp.message || "Assignees updated", "success");
    } catch (error) {
      const ve = parseValidationErrors(error);
      if (ve) formErrors = ve;
      else Swal.fire("Error", error.message || "Something went wrong", "error");
    } finally {
      installLoading = false;
    }
  }

  async function saveVisitAssignees(idx) {
    if (!dispatchData?.id) return;
    try {
      isSaving = true;
      const payload = { lastInstallationDetails: visits };
      const resp = await crmFetch(
        `${API_ROUTES.DISPATCH}/${dispatchData.id}`,
        "PUT",
        payload,
      );
      dispatchData = resp.data;
      syncForms(dispatchData);
      dispatchedDetailsStore.set(dispatchData);
      editingIdx = null;
      Swal.fire("Success", resp.message || "Visit assignees updated", "success");
    } catch (e) {
      Swal.fire("Error", e.message || "Something went wrong", "error");
    } finally {
      isSaving = false;
    }
  }

  // ── Service Visit state ──────────────────────────────────
  let visits = [],
    editingIdx = null,
    visitStep = 1,
    snapshots = {},
    isSaving = false;

  $: lastVisit = visits[visits.length - 1];
  $: lastIsInstalled = lastVisit?.status === "Installed";
  $: canAddNew =
    canEditVisits &&
    (visits.length === 0 || lastIsInstalled) &&
    editingIdx === null;
  $: completedCount = visits.filter((v) => v.status === "Installed").length;
  $: if (workOrderStatus === "completed") {
    focusSection("dispatch");
  }

  function visitEdit(idx) {
    snapshots = { ...snapshots, [idx]: structuredClone(visits[idx]) };
    editingIdx = idx;
    const s = visits[idx]?.status ?? "";
    visitStep = s === "" || s === "pending" ? 1 : 2;
  }
  function visitCancel(idx) {
    const snap = snapshots[idx];
    const isNew =
      snap &&
      !snap.installationDate &&
      snap.installationCost === 0 &&
      !snap.remark;
    visits = isNew
      ? visits.filter((_, i) => i !== idx)
      : visits.map((v, i) => (i === idx ? snap : v));
    editingIdx = null;
    visitStep = 1;
  }
  async function visitSave(idx) {
    try {
      isSaving = true;
      // Persist names with IDs so view mode can show chips without re-fetching users
      visits = visits.map((v, vi) =>
        vi === idx
          ? {
              ...v,
              employeesDetails: selectedLabels(v.employees || []).map((e) => ({
                _id: e._id,
                username: e.username,
                email: e.email,
              })),
            }
          : v,
      );
      const s = visits[idx]?.status;
      const payload = { lastInstallationDetails: visits };
      if (s === "partiallyInstalled") payload.status = "installationInProgress";
      if (s === "Installed") payload.status = "installed";

      const resp = await crmFetch(
        `${API_ROUTES.DISPATCH}/${dispatchData.id}`,
        "PUT",
        payload,
      );
      dispatchData = resp?.data ?? resp;
      if (resp?.data?.projectDetails?.status || dispatchData?.projectDetails?.status) {
        projectDetails =
          resp?.data?.projectDetails ??
          dispatchData.projectDetails ??
          projectDetails;
        workOrderStatus = projectDetails.status ?? workOrderStatus;
        if (dispatchData?.projectDetails) {
          const { projectDetails: _pd, ...rest } = dispatchData;
          dispatchData = rest;
        }
      }
      syncForms(dispatchData);
      dispatchedDetailsStore.set(dispatchData);
      editingIdx = null;
      visitStep = 1;
      const { [idx]: _, ...rest } = snapshots;
      snapshots = rest;
      Swal.fire("Success", resp?.message || "Visit Saved", "success");
    } catch (e) {
      Swal.fire("Error", e.message || "Something went wrong", "error");
    } finally {
      isSaving = false;
    }
  }
  function addVisit() {
    const blank = {
      installationDate: "",
      installationCost: 0,
      installDate: null,
      status: "pending",
      remark: "",
      finalDesc: "",
      employees: [],
      employeesDetails: [],
    };
    snapshots = { ...snapshots, [visits.length]: { ...blank } };
    visits = [...visits, blank];
    editingIdx = visits.length - 1;
    visitStep = 1;
  }
  async function moveToNextStatus() {
    try {
      const nextStatus = getNextStatus(workOrderStatus);

      if (!nextStatus) {
        Swal.fire("Info", "Already at final stage", "info");
        return;
      }

      // ── VALIDATIONS ─────────────────────────────
      // 🚫 Block moving forward without dispatch AFTER entering dispatch stage
      if (
        ["dispatched", "inTransit", "delivered"].includes(nextStatus) &&
        !dispatchData
      ) {
        Swal.fire(
          "Warning",
          "Please create dispatch before moving forward",
          "warning",
        );
        focusSection("dispatch");
        dispatchEditing = true;
        return;
      }

      // 2. Basic dispatch fields check
      if (
        ["dispatched", "inTransit", "delivered"].includes(nextStatus) &&
        (!dispatchData?.medium || !dispatchData?.dispatchDate)
      ) {
        Swal.fire(
          "Warning",
          "Complete dispatch details before proceeding",
          "warning",
        );
        focusSection("dispatch");
        return;
      }

      // 3. Installation required
      // 🚫 At least 1 employee required
      if (
        ["installationInProgress", "installed"].includes(nextStatus) &&
        (!dispatchData?.employees || dispatchData.employees.length === 0)
      ) {
        Swal.fire(
          "Warning",
          "Please assign at least one employee for installation",
          "warning",
        );
        focusSection("installation");
        return;
      }
      // 🚫 Installation fields incomplete
      if (
        ["installationInProgress", "installed"].includes(nextStatus) &&
        (dispatchData?.abrasive === "notAvailable" ||
          dispatchData?.electric === "notAvailable" ||
          dispatchData?.compressor === "notAvailable" ||
          dispatchData?.welding === "notAvailable" ||
          dispatchData?.compressorLine === "notAvailable" ||
          !dispatchData?.installationType)
      ) {
        Swal.fire(
          "Warning",
          "Complete installation details before proceeding",
          "warning",
        );
        focusSection("installation");
        return;
      }

      // 4. Final installation validation
      if (nextStatus === "installed") {
        const lastVisit = visits[visits.length - 1];

        if (!lastVisit || lastVisit.status !== "Installed") {
          Swal.fire(
            "Warning",
            "Complete final service visit before marking Installed",
            "warning",
          );
          focusSection("visit");
          return;
        }
      }

      // ── CONFIRMATION ────────────────────────────
      const confirm = await Swal.fire({
        title: "Are you sure?",
        text: `Move status to "${WO_STATUS_LABELS[nextStatus]}"?`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Yes, move",
      });

      if (!confirm.isConfirmed) return;

      // ── API CALL (Nest CRM) ──────────────────────
      let resp;
      if (dispatchData?.id || projectDetails?.id) {
        const id = dispatchData?.id || projectDetails.id;
        resp = await crmFetch(
          `${API_ROUTES.DISPATCH}/${id}/status`,
          "PUT",
          { status: nextStatus },
        );
      } else {
        const wo = encodeURIComponent(order.workOrderNumber);
        resp = await crmFetch(
          `${API_ROUTES.DISPATCH_BY_WO}/${wo}/status`,
          "PUT",
          { status: nextStatus },
        );
      }

      projectDetails = resp.data?.projectDetails ?? {
        id: resp.data?.id,
        status: nextStatus,
      };
      workOrderStatus = projectDetails.status || nextStatus;
      if (resp.data?.id) {
        dispatchData = { ...(dispatchData || {}), ...resp.data };
        delete dispatchData.projectDetails;
        syncForms(dispatchData);
      }

      // Auto switch tab for better UX
      if (nextStatus === "dispatchInProgress") focusSection("dispatch");
      if (nextStatus === "delivered") focusSection("installation");
      if (nextStatus === "installationInProgress") focusSection("visit");

      Swal.fire("Success", resp.message || "Status updated", "success");
    } catch (error) {
      const ve = parseValidationErrors(error);
      if (ve) formErrors = ve;
      else Swal.fire("Error", error.message || "Something went wrong", "error");
    }
  }

  function getNextStatusBlockReason() {
    const nextStatus = getNextStatus(workOrderStatus);

    if (!nextStatus) return "Already at final stage";

    // 🚫 Dispatch required
    if (
      ["dispatched", "inTransit", "delivered"].includes(nextStatus) &&
      !dispatchData
    ) {
      return "Please create dispatch first";
    }

    // 🚫 Dispatch fields incomplete
    if (
      ["dispatched", "inTransit", "delivered"].includes(nextStatus) &&
      (!dispatchData?.medium || !dispatchData?.dispatchDate)
    ) {
      return "Complete dispatch details";
    }

    // 🚫 Installation required
    if (
      ["installationInProgress", "installed"].includes(nextStatus) &&
      !dispatchData?.deliveryDate
    ) {
      return "Fill installation details";
    }

    // 🚫 At least 1 employee required
    if (
      ["installationInProgress", "installed"].includes(nextStatus) &&
      (!dispatchData?.employees || dispatchData.employees.length === 0)
    ) {
      return "Assign at least one employee";
    }
    // 🚫 Installation fields incomplete
    if (
      ["installationInProgress", "installed"].includes(nextStatus) &&
      (dispatchData?.abrasive === "notAvailable" ||
        dispatchData?.electric === "notAvailable" ||
        dispatchData?.compressor === "notAvailable" ||
        dispatchData?.welding === "notAvailable" ||
        dispatchData?.compressorLine === "notAvailable" ||
        !dispatchData?.installationType)
    ) {
      return "Complete installation details";
    }

    // 🚫 Final visit required
    if (nextStatus === "installed") {
      const lastVisit = visits[visits.length - 1];

      if (!lastVisit || lastVisit.status !== "Installed") {
        return "Complete final service visit";
      }
    }

    return null; // ✅ allowed
  }
  $: nextBlockedReason = getNextStatusBlockReason();
  $: isNextDisabled = !!nextBlockedReason;
  // async function orderUpdate() {
  //   try {
  //     const resp = await apiFetch1(`/import/orders/status/61`, "PUT", {
  //       status: "completed",
  //     });
  //     console.log("resp : ", resp);
  //   } catch (e) {
  //     console.error("orderUpdate:", e);
  //   }
  // }

</script>

<!-- ── Loading ───────────────────────────────────────────── -->
{#if loadingData}
  <div class="flex items-center justify-center py-20">
    <div class="flex flex-col items-center gap-3">
      <div
        class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"
      />
      <p class="text-sm text-gray-400">Loading dispatch details...</p>
    </div>
  </div>
{:else if workOrderStatus === "open" || workOrderStatus === "inProgress"}
  <!-- ── Work order not yet completed ──────────────────── -->
  <div
    class="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-100 shadow-sm text-gray-400"
  >
    <span class="text-4xl mb-3">🔒</span>
    <p class="text-sm font-semibold text-gray-600">
      Dispatch not available yet
    </p>
    <p class="text-xs mt-1">
      Work order must be <span class="font-medium text-green-600"
        >Completed</span
      > before dispatch can begin.
    </p>
    <span
      class="mt-4 px-3 py-1 rounded-full text-xs font-semibold {workOrderStatusCls}"
      >{workOrderStatusLabel}</span
    >
  </div>
{:else}
  <div>
    <!-- ── Status badge + Tab bar ─────────────────────────── -->
    <div class="flex items-center justify-between mb-3">
      <!-- Process step pills -->
      <div class="flex items-center gap-1.5 flex-wrap">
        {#each STATUS_ORDER.slice(2) as s}
          {@const active = workOrderStatus === s}
          {@const done = statusGte(workOrderStatus, s) && !active}
          {@const future = !statusGte(workOrderStatus, s)}
          <span
            class="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all
          {active
              ? WO_STATUS_CLS[s] + ' ring-1 ring-offset-1 ring-current'
              : done
                ? 'bg-green-50 text-green-600'
                : 'bg-gray-50 text-gray-300'}"
          >
            {#if done}<svg
                class="w-3 h-3"
                fill="none"
                viewBox="0 0 12 12"
                stroke="currentColor"
                stroke-width="2.5"><path d="M1 6l3.5 3.5L11 2" /></svg
              >{/if}
            {WO_STATUS_LABELS[s]}
          </span>
          {#if s !== "installed"}<span class="text-gray-200 text-xs">›</span
            >{/if}
        {/each}
      </div>
      <div>
        <div class="flex flex-col items-end">
          <button
            class="btn btn-sm"
            class:btn-primary={!isNextDisabled}
            class:btn-secondary={isNextDisabled}
            disabled={isNextDisabled}
            title={nextBlockedReason || "Move to next stage"}
            on:click={moveToNextStatus}
          >
            Move to Next Stage
          </button>

          {#if isNextDisabled && nextBlockedReason}
            <p class="text-xs text-red-500 mt-1">
              ⚠ {nextBlockedReason}
            </p>
          {/if}
        </div>
      </div>
    </div>

    <!-- Tabs — show only the active section -->
    <div
      class="rounded-xl border border-gray-200 bg-gray-50 p-1 mb-3 flex gap-1"
    >
      {#each TABS as tab}
        {@const unlocked = sectionUnlocked(tab.id)}
        <button
          type="button"
          on:click={() => unlocked && (currentTab = tab.id)}
          disabled={!unlocked}
          title={unlocked ? tab.label : sectionLockHint(tab.id)}
          class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
          class:bg-indigo-600={currentTab === tab.id && unlocked}
          class:text-white={currentTab === tab.id && unlocked}
          class:shadow-sm={currentTab === tab.id && unlocked}
          class:text-gray-500={currentTab !== tab.id && unlocked}
          class:hover:bg-gray-50={currentTab !== tab.id && unlocked}
          class:text-gray-300={!unlocked}
          class:cursor-not-allowed={!unlocked}
        >
          <span>{tab.icon}</span><span>{tab.label}</span>
          {#if !unlocked}<span class="text-[10px]">🔒</span>{/if}
        </button>
      {/each}
    </div>

    <!-- ── DISPATCH TAB ─────────────────────────────────── -->
    {#if currentTab === "dispatch"}
    <section id="dp-section-dispatch" class={sectionCard}>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span>📦</span>
            <span>
              {dispatchEditing
                ? dispatchData
                  ? "Edit Dispatch"
                  : "Create Dispatch"
                : "Dispatch Details"}
            </span>
            {#if !showDispatch || (!canEditDispatch && !dispatchData)}
              <span class="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">Locked</span>
            {/if}
          </h3>
          {#if !dispatchEditing && canEditDispatch}
            <button
              on:click={() => (dispatchEditing = true)}
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              {dispatchData ? "✏️ Edit" : "＋ Create"}
            </button>
          {:else if !dispatchEditing && !canEditDispatch && dispatchData}
            <span class="text-xs text-gray-400 flex items-center gap-1"
              >🔒 Read-only</span
            >
          {/if}
        </div>

        {#if dispatchEditing && canEditDispatch}
          <p class="text-[11px] text-gray-500 mb-2.5">
            <span class="text-red-500 font-semibold">*</span> Required to move stages
          </p>
          <div class={formGrid}>
              <div>
                <label class={lc}
                  >Transport medium <span class="text-red-500">*</span></label
                >
                <input
                  class={ic}
                  bind:value={dispatchForm.medium}
                  placeholder="e.g. Road, Courier, Air, Sea"
                  title="How the goods will be transported"
                  autocomplete="off"
                />
                {#if formErrors.medium}<p class="mt-0.5 text-xs text-red-500">
                    {formErrors.medium}
                  </p>{/if}
              </div>
              <div>
                <label class={lc}
                  >Dispatch date <span class="text-red-500">*</span></label
                >
                <input
                  type="date"
                  class={ic}
                  bind:value={dispatchForm.dispatchDate}
                  title="Planned or actual ship-out date"
                />
                {#if formErrors.dispatchDate}<p class="mt-0.5 text-xs text-red-500">
                    {formErrors.dispatchDate}
                  </p>{/if}
              </div>
              <div>
                <label class={lc}>Packaging</label>
                <input
                  class={ic}
                  bind:value={dispatchForm.packaging}
                  placeholder="e.g. Wooden crate, Carton"
                  title="Packing type or notes for warehouse"
                  autocomplete="off"
                />
                {#if formErrors.packaging}<p class="mt-0.5 text-xs text-red-500">
                    {formErrors.packaging}
                  </p>{/if}
              </div>
              <div>
                <label class={lc}>City</label>
                <input
                  class={ic}
                  bind:value={dispatchForm.city}
                  placeholder="e.g. Ahmedabad"
                  autocomplete="address-level2"
                />
              </div>
              <div>
                <label class={lc}>State</label>
                <input
                  class={ic}
                  bind:value={dispatchForm.state}
                  placeholder="e.g. Gujarat"
                  autocomplete="address-level1"
                />
              </div>
              <div class="sm:col-span-2 lg:col-span-3">
                <label class={lc}>Description</label>
                <textarea
                  class="{ic} min-h-[64px] resize-y"
                  bind:value={dispatchForm.description}
                  placeholder="Transporter, AWB / LR, special handling…"
                  rows="2"
                />
              </div>
              <div class="sm:col-span-2 lg:col-span-3">
                <label class={lc}>Dispatch images</label>
                <label
                  class="flex items-center justify-center gap-3 w-full h-16 px-3 border border-dashed border-gray-200 rounded-lg bg-gray-50 hover:bg-indigo-50/50 hover:border-indigo-200 cursor-pointer transition"
                >
                  <span class="text-lg text-indigo-400">📷</span>
                  <span class="text-xs text-gray-600"
                    >Upload images <span class="text-gray-400">(PNG, JPG, WEBP)</span></span
                  >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    class="hidden"
                    on:change={onDispatchImagesChange}
                  />
                </label>
                {#if existingImages.length > 0}
                  <p class="mt-2 mb-1.5 text-[11px] font-semibold text-gray-500">
                    Saved ({existingImages.length})
                  </p>
                  <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {#each existingImages as img}
                      <div
                        class="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-50"
                      >
                        <img
                          src={imgUrl(img)}
                          alt={img.originalName}
                          class="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          on:click={() => removeExistingImage(img.fileName)}
                          class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition"
                          >✕</button
                        >
                      </div>
                    {/each}
                  </div>
                {/if}
                {#if newImageFiles.length > 0}
                  <p class="mt-2 mb-1.5 text-[11px] font-semibold text-indigo-600">
                    New ({newImageFiles.length})
                  </p>
                  <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {#each newImagePreviews as src, idx}
                      <div
                        class="relative group rounded-lg overflow-hidden border border-indigo-200 aspect-square"
                      >
                        <img
                          {src}
                          alt="new {idx + 1}"
                          class="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          on:click={() => removeNewImage(idx)}
                          class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition"
                          >✕</button
                        >
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
          </div>
          <div class="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              on:click={() => {
                dispatchEditing = false;
                formErrors = {};
                syncForms(dispatchData);
                syncImages(dispatchData);
              }}
              class="px-3.5 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >Cancel</button
            >
            <button
              type="button"
              on:click={saveDispatch}
              disabled={dispatchLoading}
              class="px-4 py-2 text-xs font-semibold text-white rounded-lg transition"
              class:bg-indigo-300={dispatchLoading}
              class:cursor-not-allowed={dispatchLoading}
              class:bg-indigo-600={!dispatchLoading}
              class:hover:bg-indigo-700={!dispatchLoading}
            >
              {dispatchLoading
                ? "Saving…"
                : dispatchData?.id
                  ? "Save dispatch"
                  : "Create dispatch"}
            </button>
          </div>
        {:else if !dispatchData}
          <!-- No dispatch yet -->
          {#if canEditDispatch}
            <div class="flex flex-col items-center justify-center py-8 text-gray-400">
              <span class="text-3xl mb-2">📦</span>
              <p class="text-sm font-medium">No dispatch created yet</p>
              <p class="text-xs mt-0.5">Click "+ Create" to get started</p>
            </div>
          {:else if workOrderStatus === "completed"}
            <div class="flex flex-col items-center justify-center py-8 text-gray-400">
              <span class="text-3xl mb-2">📦</span>
              <p class="text-sm font-medium">Dispatch not started</p>
              <p class="text-xs mt-0.5 text-indigo-500">
                Move to next stage to start dispatch
              </p>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center py-8 text-gray-400">
              <span class="text-3xl mb-2">📦</span>
              <p class="text-sm font-medium">No dispatch data available</p>
            </div>
          {/if}
        {:else}
          <!-- View mode -->
          <div class={formGrid}>
              {#each [{ label: "Transport medium", value: dispatchData.medium }, { label: "Dispatch date", value: dispatchData.dispatchDate }, { label: "Packaging", value: dispatchData.packaging }, { label: "City", value: dispatchData.city }, { label: "State", value: dispatchData.state }] as f}
                <div>
                  <p class="mb-0.5 text-[11px] font-semibold text-gray-500">{f.label}</p>
                  <p class="text-sm text-gray-900 font-medium">{f.value || "—"}</p>
                </div>
              {/each}
              <div class="sm:col-span-2 lg:col-span-3">
                <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Description</p>
                <p class="text-sm text-gray-800 whitespace-pre-line leading-snug">
                  {dispatchData.description || "—"}
                </p>
              </div>
              {#if (dispatchData.dispatchImages ?? []).length > 0}
                <div class="sm:col-span-2 lg:col-span-3">
                  <p class="mb-1.5 text-[11px] font-semibold text-gray-500">
                    Images ({dispatchData.dispatchImages.length})
                  </p>
                  <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {#each dispatchData.dispatchImages as img}
                      <a
                        href={imgUrl(img)}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="relative group block rounded-lg overflow-hidden border border-gray-200 aspect-square hover:opacity-90 transition"
                        title={img.originalName}
                      >
                        <img
                          src={imgUrl(img)}
                          alt={img.originalName}
                          class="w-full h-full object-cover"
                        />
                      </a>
                    {/each}
                  </div>
                </div>
              {:else}
                <div class="sm:col-span-2 lg:col-span-3">
                  <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Images</p>
                  <p class="text-sm text-gray-400">No images uploaded</p>
                </div>
              {/if}
          </div>
        {/if}
    </section>
    {/if}

    <!-- ── INSTALLATION TAB ─────────────────────────────── -->
    {#if currentTab === "installation"}
    <section
      id="dp-section-installation"
      class={sectionCard}
      class:opacity-90={!showInstallation}
    >
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span>🔧</span>
            <span>{installEditing ? "Edit Installation" : "Installation Details"}</span>
            {#if !showInstallation}
              <span class="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">Unlocks after Delivered</span>
            {/if}
          </h3>
          {#if !installEditing && canEditInstallation}
            <button
              on:click={() => (installEditing = true)}
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >✏️ Edit</button
            >
          {:else if !installEditing && !canEditInstallation}
            <span class="text-xs text-gray-400 flex items-center gap-1"
              >🔒 Read-only</span
            >
          {/if}
        </div>

        {#if !showInstallation}
          <div class="flex flex-col items-center justify-center py-8 text-gray-400">
            <span class="text-3xl mb-2">🔧</span>
            <p class="text-sm font-medium">Available after delivery</p>
          </div>
        {:else if installEditing && canEditInstallation}
          <div class={formGrid}>
            <div>
              <label class={lc}>Delivery Date</label>
              <input
                type="date"
                class={ic}
                bind:value={installForm.deliveryDate}
              />
            </div>
            <div>
              <label class={lc}>Installation Type</label>
              <select class={ic} bind:value={installForm.installationType}>
                {#each INSTALL_TYPE_OPTIONS as opt}<option value={opt.value}
                    >{opt.label}</option
                  >{/each}
              </select>
            </div>
            {#each REQUIREMENTS as req}
              <div>
                <label class={lc}>{req.label}</label>
                <select class={ic} bind:value={installForm[req.field]}>
                  {#each AVAILABLE_OPTIONS as opt}<option value={opt.value}
                      >{opt.label}</option
                    >{/each}
                </select>
              </div>
            {/each}

            <div class="sm:col-span-2 lg:col-span-3">
              <label class={lc}>Assign Employees</label>
              {#if installForm.employees.length > 0}
                <div class="flex flex-wrap gap-1.5 mb-2">
                  {#each selectedLabels(installForm.employees) as emp}
                    <span
                      class="flex items-center gap-1.5 pl-1.5 pr-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full text-xs font-medium"
                    >
                      <span
                        class="w-4 h-4 rounded-full bg-indigo-200 flex items-center justify-center text-[9px] font-bold text-indigo-700 shrink-0"
                        >{emp.username.charAt(0)}</span
                      >
                      {emp.username}
                      <button
                        type="button"
                        on:click={() =>
                          (installForm.employees = toggleEmployee(
                            installForm.employees,
                            emp._id,
                          ))}
                        class="ml-0.5 text-indigo-400 hover:text-indigo-700 leading-none"
                        >×</button
                      >
                    </span>
                  {/each}
                </div>
              {/if}
              <div class="relative">
                <button
                  type="button"
                  on:click={() => toggleDropdown("install")}
                  class="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 hover:bg-white transition text-left"
                >
                  <span class="text-gray-400"
                    >{installForm.employees.length
                      ? `${installForm.employees.length} selected`
                      : "Select employees..."}</span
                  >
                  <svg
                    class="w-4 h-4 text-gray-400 transition-transform"
                    class:rotate-180={dropdownOpen["install"]}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {#if dropdownOpen["install"]}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div
                    class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto"
                    on:click|stopPropagation
                  >
                    {#each users as emp}
                      {@const checked = installForm.employees.includes(emp._id)}
                      <button
                        type="button"
                        on:click={() => {
                          installForm.employees = toggleEmployee(
                            installForm.employees,
                            emp._id,
                          );
                        }}
                        class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition text-left"
                        class:bg-indigo-50={checked}
                      >
                        <span
                          class="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition"
                          class:bg-indigo-600={checked}
                          class:border-indigo-600={checked}
                          class:border-gray-300={!checked}
                        >
                          {#if checked}<svg
                              class="w-2.5 h-2.5 text-white"
                              fill="none"
                              viewBox="0 0 12 12"
                              stroke="currentColor"
                              stroke-width="2.5"
                              ><path d="M1 6l3.5 3.5L11 2" /></svg
                            >{/if}
                        </span>
                        <span
                          class="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0"
                          >{emp.username.charAt(0)}</span
                        >
                        <div class="min-w-0">
                          <p
                            class="text-sm font-medium text-gray-800 truncate mb-0"
                          >
                            {emp.username}
                          </p>
                          <p class="text-xs text-gray-400 truncate mb-0">
                            {emp.email}
                          </p>
                        </div>
                      </button>
                    {/each}
                    {#if users.length === 0}<p
                        class="px-4 py-3 text-sm text-gray-400"
                      >
                        No employees found
                      </p>{/if}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Image upload -->
            <div class="sm:col-span-2 lg:col-span-3">
              <label class={lc}>Images</label>
              <label
                class="flex items-center justify-center gap-3 w-full h-16 px-3 border border-dashed border-gray-200 rounded-lg bg-gray-50 hover:bg-indigo-50/50 hover:border-indigo-200 cursor-pointer transition"
              >
                <span class="text-lg text-indigo-400">📎</span>
                <span class="text-xs text-gray-600"
                  >Upload images <span class="text-gray-400">(PNG, JPG, WEBP)</span></span
                >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  class="hidden"
                  on:change={onInstallImagesChange}
                />
              </label>
              {#if installExisting.length > 0}
                <p class="mt-2 mb-1.5 text-[11px] font-semibold text-gray-500">
                  Saved ({installExisting.length})
                </p>
                <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {#each installExisting as img}
                    <div
                      class="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square"
                    >
                      <img
                        src={installImgUrl(img)}
                        alt={img.originalName}
                        class="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        on:click={() =>
                          removeInstallExistingImage(img.fileName)}
                        class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition"
                        >✕</button
                      >
                    </div>
                  {/each}
                </div>
              {/if}
              {#if installNewFiles.length > 0}
                <p class="mt-2 mb-1.5 text-[11px] font-semibold text-indigo-600">
                  New ({installNewFiles.length})
                </p>
                <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {#each installNewPreviews as src, idx}
                    <div
                      class="relative group rounded-lg overflow-hidden border border-indigo-200 aspect-square"
                    >
                      <img
                        {src}
                        alt="new {idx + 1}"
                        class="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        on:click={() => removeInstallNewImage(idx)}
                        class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition"
                        >✕</button
                      >
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
            <button
              on:click={() => {
                installEditing = false;
                formErrors = {};
                syncInstallImages(dispatchData);
              }}
              class="px-3.5 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >Cancel</button
            >
            <button
              on:click={saveInstall}
              disabled={installLoading || installForm.employees.length === 0}
              class="px-4 py-2 text-xs font-semibold text-white rounded-lg transition"
              class:bg-indigo-300={installLoading ||
                installForm.employees.length === 0}
              class:cursor-not-allowed={installLoading ||
                installForm.employees.length === 0}
              class:bg-indigo-600={!installLoading &&
                installForm.employees.length > 0}
              class:hover:bg-indigo-700={!installLoading &&
                installForm.employees.length > 0}
            >
              {installLoading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        {:else}
          <!-- View mode -->
          <div class="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3 mb-3">
            <div>
              <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Delivery Date</p>
              <p class="text-sm text-gray-800">{dispatchData?.deliveryDate || "—"}</p>
            </div>
            <div>
              <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Installation Type</p>
              <p class="text-sm text-gray-800">{dispatchData?.installationType || "—"}</p>
            </div>
          </div>
          <p class="mb-1.5 text-[11px] font-semibold text-gray-500">Equipment Requirements</p>
          <div class="bg-gray-50 rounded-lg divide-y divide-gray-100 px-3 mb-3">
            {#each REQUIREMENTS as req}
              {@const val = installForm[req.field]}
              {@const on = val === "available"}
              {@const nr = val === "notRequired"}
              <div class="flex items-center justify-between py-2">
                <span class="text-sm text-gray-700">{req.label}</span>
                <span
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
                  class:bg-green-100={on}
                  class:text-green-800={on}
                  class:bg-gray-100={nr}
                  class:text-gray-500={nr}
                  class:bg-red-100={!on && !nr}
                  class:text-red-700={!on && !nr}
                >
                  <span
                    class="w-1.5 h-1.5 rounded-full"
                    class:bg-green-500={on}
                    class:bg-gray-400={nr}
                    class:bg-red-400={!on && !nr}
                  />
                  {on ? "Available" : nr ? "Not Required" : "Not Available"}
                </span>
              </div>
            {/each}
          </div>
          {#if (dispatchData?.employees ?? []).length > 0}
            <div class="mb-3">
              <p class="mb-1.5 text-[11px] font-semibold text-gray-500">Assigned Employees</p>
              <div class="flex flex-wrap gap-1.5">
                {#each (dispatchData.employeesDetails?.length
                  ? dispatchData.employeesDetails
                  : selectedLabels(dispatchData.employees)) as emp}
                  <span
                    class="flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 bg-indigo-50 text-indigo-800 rounded-full text-xs font-medium"
                  >
                    <span
                      class="w-4 h-4 rounded-full bg-indigo-200 flex items-center justify-center text-[9px] font-bold text-indigo-700"
                      >{(emp.username || emp.name || "?").charAt(0)}</span
                    >
                    {emp.username || emp.name || emp._id}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
          {#if (dispatchData?.images ?? []).length > 0}
            <div>
              <p class="mb-1.5 text-[11px] font-semibold text-gray-500">
                Images ({dispatchData.images.length})
              </p>
              <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {#each dispatchData.images as img}
                  <a
                    href={installImgUrl(img)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="relative group block rounded-lg overflow-hidden border border-gray-200 aspect-square hover:opacity-90 transition"
                    title={img.originalName}
                  >
                    <img
                      src={installImgUrl(img)}
                      alt={img.originalName}
                      class="w-full h-full object-cover"
                    />
                  </a>
                {/each}
              </div>
            </div>
          {:else}
            <div>
              <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Images</p>
              <p class="text-sm text-gray-400">No images uploaded</p>
            </div>
          {/if}
        {/if}
    </section>
    {/if}

    <!-- ── SERVICE VISIT TAB ────────────────────────────── -->
    {#if currentTab === "visit"}
    <section id="dp-section-visit" class="mb-3">
        {#if !showVisit}
          <div class={sectionCard}>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <span>🚗</span>
                <span>Service Visits</span>
                <span class="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">Unlocks at Installation</span>
              </h3>
            </div>
            <div class="flex flex-col items-center justify-center py-8 text-gray-400">
              <span class="text-3xl mb-2">🚗</span>
              <p class="text-sm font-medium">Available after installation begins</p>
              <p class="text-xs mt-0.5 text-gray-400">Move stages forward to unlock this section.</p>
            </div>
          </div>
        {:else}
          <div class={sectionCard}>
          <!-- Visit header -->
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <span>🚗</span>
                <span>Service Visits</span>
              </h3>
              <div class="flex gap-3 mt-0.5">
                <span class="text-xs text-gray-400"
                  >Total: <strong class="text-gray-700">{visits.length}</strong
                  ></span
                >
                {#if completedCount > 0}<span
                    class="text-xs text-green-600 font-medium"
                    >✓ {completedCount} completed</span
                  >{/if}
              </div>
            </div>
            <div class="flex flex-col items-end gap-1">
              {#if canEditVisits}
                <button
                  on:click={addVisit}
                  disabled={!canAddNew}
                  title={editingIdx !== null
                    ? "Finish editing current visit first"
                    : !lastIsInstalled && visits.length > 0
                      ? "Mark last visit as Successfully Done first"
                      : "Add new service visit"}
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition"
                  class:bg-green-50={canAddNew}
                  class:text-green-700={canAddNew}
                  class:border-green-200={canAddNew}
                  class:hover:bg-green-100={canAddNew}
                  class:cursor-pointer={canAddNew}
                  class:bg-gray-50={!canAddNew}
                  class:text-gray-300={!canAddNew}
                  class:border-gray-100={!canAddNew}
                  class:cursor-not-allowed={!canAddNew}>+ New Visit</button
                >
                {#if visits.length > 0 && !lastIsInstalled && editingIdx === null}
                  <p class="text-[11px] text-amber-500">
                    Mark Visit #{visits.length} as Successfully Done to add a new one
                  </p>
                {/if}
                {#if editingIdx !== null}
                  <p class="text-[11px] text-indigo-500">
                    Editing Visit #{editingIdx + 1} — save or cancel first
                  </p>
                {/if}
              {:else}
                <span class="text-xs text-gray-400 flex items-center gap-1"
                  >🔒 Read-only</span
                >
              {/if}
            </div>
          </div>

          {#if visits.length === 0}
            <div
              class="flex flex-col items-center justify-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200"
            >
              <span class="text-3xl mb-2">🚗</span>
              <p class="text-sm font-medium text-gray-500">No service visits yet</p>
              {#if canEditVisits}
                <p class="text-xs text-gray-400 mt-0.5">
                  Click "+ New Visit" to record the first visit
                </p>
              {/if}
            </div>
          {:else}
            <div class="flex flex-col gap-2.5">
              {#each visits as visit, i (i)}
                {@const isEditing = editingIdx === i}
                {@const isCompleted = visit.status === "Installed"}
                {@const canEdit = canEditVisits && editingIdx === null}
                {@const canAssign =
                  canEditVisitAssignees && editingIdx === null && !isCompleted}
                {@const statusCfg = VISIT_STATUS_MAP[visit.status] ?? null}

                <div
                  class="bg-white rounded-lg border transition-all duration-200"
                  class:border-indigo-300={isEditing}
                  class:ring-2={isEditing}
                  class:ring-indigo-100={isEditing}
                  class:border-green-200={isCompleted && !isEditing}
                  class:border-gray-100={!isCompleted && !isEditing}
                >
                  <!-- Visit card header -->
                  <div class="flex items-center justify-between px-3 py-2.5">
                    <div class="flex items-center gap-2.5">
                      <div
                        class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        class:bg-green-100={isCompleted}
                        class:text-green-700={isCompleted}
                        class:bg-indigo-100={isEditing && !isCompleted}
                        class:text-indigo-700={isEditing && !isCompleted}
                        class:bg-gray-100={!isEditing && !isCompleted}
                        class:text-gray-500={!isEditing && !isCompleted}
                      >
                        {isCompleted ? "✓" : i + 1}
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-semibold text-gray-800"
                          >Visit #{i + 1}</span
                        >
                        {#if visit.installationDate && !isEditing}
                          <span class="text-xs text-gray-400"
                            >{visit.installationDate}</span
                          >
                        {/if}
                        {#if isEditing}
                          <span
                            class="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700"
                            >Editing</span
                          >
                        {:else if statusCfg}
                          <span
                            class="px-2.5 py-0.5 rounded-full text-xs font-semibold {statusCfg.cls}"
                            >{statusCfg.label}</span
                          >
                        {/if}
                      </div>
                    </div>
                    {#if isEditing && canEditVisits}
                      <span class="text-xs text-gray-400"
                        >Step {visitStep} of 2</span
                      >
                    {:else if isEditing && canEditVisitAssignees}
                      <span class="text-xs text-indigo-500">Assigning…</span>
                    {:else if canEdit}
                      <button
                        on:click={() => visitEdit(i)}
                        class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer transition"
                        >✏️ Edit</button
                      >
                    {:else if canAssign}
                      <button
                        on:click={() => visitEdit(i)}
                        class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 cursor-pointer transition"
                        >👤 Assignees</button
                      >
                    {:else if !canEditVisits && !canEditVisitAssignees}
                      <span class="text-xs text-gray-300">🔒</span>
                    {:else}
                      <button
                        disabled
                        title="Finish editing the current visit first"
                        class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-100 text-gray-300 rounded-lg cursor-not-allowed"
                        >✏️ Edit</button
                      >
                    {/if}
                  </div>

                  <!-- Visit card body -->
                  <div class="px-3 pb-3">
                    {#if isEditing && canEditVisitAssignees}
                      <div class="pt-2 border-t border-gray-100">
                        <label class={lc}>Assign Employees</label>
                        {#if (visit.employees || []).length > 0}
                          <div class="flex flex-wrap gap-1.5 mb-2">
                            {#each selectedLabels(visit.employees) as emp}
                              <span
                                class="flex items-center gap-1.5 pl-1.5 pr-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full text-xs font-medium"
                              >
                                <span
                                  class="w-4 h-4 rounded-full bg-indigo-200 flex items-center justify-center text-[9px] font-bold text-indigo-700 shrink-0"
                                  >{emp.username.charAt(0)}</span
                                >
                                {emp.username}
                                <button
                                  type="button"
                                  on:click={() =>
                                    (visits[i].employees = toggleEmployee(
                                      visit.employees || [],
                                      emp._id,
                                    ))}
                                  class="ml-0.5 text-indigo-400 hover:text-indigo-700 leading-none"
                                  >×</button
                                >
                              </span>
                            {/each}
                          </div>
                        {/if}
                        <div class="relative mb-3">
                          <button
                            type="button"
                            on:click={() => toggleDropdown(`visit-${i}`)}
                            class="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 hover:bg-white transition text-left"
                          >
                            <span class="text-gray-400"
                              >{(visit.employees || []).length
                                ? `${visit.employees.length} selected`
                                : "Select employees..."}</span
                            >
                          </button>
                          {#if dropdownOpen[`visit-${i}`]}
                            <div
                              class="absolute z-20 mt-1 w-full max-h-48 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg"
                            >
                              {#each installationAssigneeOptions() as u}
                                {@const checked = (visit.employees || []).some(
                                  (id) => String(id) === String(u._id),
                                )}
                                <button
                                  type="button"
                                  class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-indigo-50"
                                  on:click={() => {
                                    visits[i].employees = toggleEmployee(
                                      visit.employees || [],
                                      u._id,
                                    );
                                    visits = visits;
                                  }}
                                >
                                  <span
                                    class="w-4 h-4 rounded border flex items-center justify-center text-[10px]"
                                    class:bg-indigo-600={checked}
                                    class:text-white={checked}
                                    >{checked ? "✓" : ""}</span
                                  >
                                  {u.username || u.name || u._id}
                                </button>
                              {:else}
                                <p class="px-3 py-2 text-xs text-gray-400">
                                  Assign employees on Installation first
                                </p>
                              {/each}
                            </div>
                          {/if}
                        </div>
                        <div class="flex justify-end gap-2">
                          <button
                            on:click={() => visitCancel(i)}
                            class="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                            >Cancel</button
                          >
                          <button
                            on:click={() => saveVisitAssignees(i)}
                            disabled={isSaving}
                            class="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {isSaving ? "Saving..." : "Save assignees"}
                          </button>
                        </div>
                      </div>
                    {:else if isEditing}
                      <!-- Step indicator -->
                      <div
                        class="flex items-center gap-2 pt-2 pb-3 border-t border-gray-100 mb-1"
                      >
                        <div class="flex items-center gap-1.5">
                          <span
                            class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            class:bg-indigo-600={visitStep >= 1}
                            class:text-white={visitStep >= 1}
                            class:bg-gray-100={visitStep < 1}
                            class:text-gray-400={visitStep < 1}>1</span
                          >
                          <span
                            class="text-xs font-medium"
                            class:text-indigo-600={visitStep >= 1}
                            class:text-gray-400={visitStep < 1}>Visit Info</span
                          >
                        </div>
                        <div
                          class="flex-1 h-px"
                          class:bg-indigo-400={visitStep >= 2}
                          class:bg-gray-200={visitStep < 2}
                        />
                        <div class="flex items-center gap-1.5">
                          <span
                            class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            class:bg-indigo-600={visitStep >= 2}
                            class:text-white={visitStep >= 2}
                            class:bg-gray-100={visitStep < 2}
                            class:text-gray-400={visitStep < 2}>2</span
                          >
                          <span
                            class="text-xs font-medium"
                            class:text-indigo-600={visitStep >= 2}
                            class:text-gray-400={visitStep < 2}
                            >Cost & Status</span
                          >
                        </div>
                      </div>

                      <!-- Step 1 -->
                      {#if visitStep === 1}
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                          <div>
                            <label class={lc}>Visit Date</label>
                            <input
                              type="date"
                              class={ic}
                              bind:value={visit.installationDate}
                            />
                          </div>
                          <div>
                            <label class={lc}>Install Date</label>
                            <input
                              type="date"
                              class={ic}
                              bind:value={visit.installDate}
                            />
                          </div>
                          <div class="sm:col-span-2">
                            <label class={lc}>Final Notes</label>
                            <textarea
                              class="{ic} min-h-[56px] resize-y"
                              bind:value={visit.finalDesc}
                              placeholder="Finalization notes..."
                              rows="2"
                            />
                          </div>
                          <!-- Employee multi-select -->
                          <div class="sm:col-span-2">
                            <label class={lc}>Assign Employees</label>
                            {#if visit.employees.length > 0}
                              <div class="flex flex-wrap gap-1.5 mb-2">
                                {#each selectedLabels(visit.employees) as emp}
                                  <span
                                    class="flex items-center gap-1.5 pl-1.5 pr-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full text-xs font-medium"
                                  >
                                    <span
                                      class="w-4 h-4 rounded-full bg-indigo-200 flex items-center justify-center text-[9px] font-bold text-indigo-700 shrink-0"
                                      >{emp.username.charAt(0)}</span
                                    >
                                    {emp.username}
                                    <button
                                      type="button"
                                      on:click={() => {
                                        visits = visits.map((v, vi) =>
                                          vi === i
                                            ? {
                                                ...v,
                                                employees: toggleEmployee(
                                                  v.employees,
                                                  emp._id,
                                                ),
                                              }
                                            : v,
                                        );
                                      }}
                                      class="ml-0.5 text-indigo-400 hover:text-indigo-700 leading-none"
                                      >×</button
                                    >
                                  </span>
                                {/each}
                              </div>
                            {/if}
                            <div class="relative">
                              <button
                                type="button"
                                on:click={() => toggleDropdown(`visit-${i}`)}
                                class="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 hover:bg-white transition text-left"
                              >
                                <span class="text-gray-400"
                                  >{visit.employees.length
                                    ? `${visit.employees.length} selected`
                                    : "Select employees..."}</span
                                >
                                <svg
                                  class="w-4 h-4 text-gray-400 transition-transform"
                                  class:rotate-180={dropdownOpen[`visit-${i}`]}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </button>
                              {#if dropdownOpen[`visit-${i}`]}
                                <!-- svelte-ignore a11y-click-events-have-key-events -->
                                <!-- svelte-ignore a11y-no-static-element-interactions -->
                                <div
                                  class="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto"
                                  on:click|stopPropagation
                                >
                                  {#each installationAssigneeOptions() as emp}
                                    {@const checked = (visit.employees || []).some(
                                      (id) => String(id) === String(emp._id),
                                    )}
                                    <button
                                      type="button"
                                      on:click={() => {
                                        visits = visits.map((v, vi) =>
                                          vi === i
                                            ? {
                                                ...v,
                                                employees: toggleEmployee(
                                                  v.employees || [],
                                                  emp._id,
                                                ),
                                              }
                                            : v,
                                        );
                                      }}
                                      class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition text-left"
                                      class:bg-indigo-50={checked}
                                    >
                                      <span
                                        class="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition"
                                        class:bg-indigo-600={checked}
                                        class:border-indigo-600={checked}
                                        class:border-gray-300={!checked}
                                      >
                                        {#if checked}<svg
                                            class="w-2.5 h-2.5 text-white"
                                            fill="none"
                                            viewBox="0 0 12 12"
                                            stroke="currentColor"
                                            stroke-width="2.5"
                                            ><path d="M1 6l3.5 3.5L11 2" /></svg
                                          >{/if}
                                      </span>
                                      <span
                                        class="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0"
                                        >{(emp.username || emp.name || "?").charAt(0)}</span
                                      >
                                      <div class="min-w-0">
                                        <p
                                          class="text-sm font-medium text-gray-800 truncate mb-0"
                                        >
                                          {emp.username || emp.name || emp._id}
                                        </p>
                                        {#if emp.email}
                                          <p
                                            class="text-xs text-gray-400 truncate mb-0"
                                          >
                                            {emp.email}
                                          </p>
                                        {/if}
                                      </div>
                                    </button>
                                  {:else}
                                    <p class="px-4 py-3 text-sm text-gray-400">
                                      Assign employees on Installation first
                                    </p>
                                  {/each}
                                </div>
                              {/if}
                            </div>
                          </div>
                        </div>
                        <div
                          class="flex justify-between mt-3 pt-3 border-t border-gray-100"
                        >
                          <button
                            on:click={() => visitCancel(i)}
                            class="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                            >Cancel</button
                          >
                          <button
                            on:click={() => {
                              closeDropdown(`visit-${i}`);
                              visitStep = 2;
                            }}
                            class="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
                            >Next →</button
                          >
                        </div>

                        <!-- Step 2 -->
                      {:else}
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                          <div>
                            <label class={lc}>Visit Cost (₹)</label>
                            <input
                              type="number"
                              class={ic}
                              bind:value={visit.installationCost}
                            />
                          </div>
                          <div>
                            <label class={lc}>Status</label>
                            <select class={ic} bind:value={visit.status}>
                              {#each VISIT_STATUS_OPTIONS as opt}
                                <option value={opt.value}>{opt.label}</option>
                              {/each}
                            </select>
                          </div>
                          <div class="sm:col-span-2">
                            <label class={lc}>Remark</label>
                            <textarea
                              class="{ic} min-h-[56px] resize-y"
                              bind:value={visit.remark}
                              rows="2"
                            />
                          </div>
                        </div>
                        <div
                          class="flex justify-between mt-3 pt-3 border-t border-gray-100"
                        >
                          <div></div>
                          <div class="flex gap-2">
                            <button
                              on:click={() => visitCancel(i)}
                              class="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                              >Cancel</button
                            >
                            <button
                              on:click={() => visitSave(i)}
                              disabled={isSaving}
                              class="px-4 py-1.5 text-xs font-medium text-white rounded-lg transition"
                              class:bg-indigo-300={isSaving}
                              class:cursor-not-allowed={isSaving}
                              class:bg-indigo-600={!isSaving}
                              class:hover:bg-indigo-700={!isSaving}
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      {/if}
                    {:else}
                      <!-- View mode -->
                      <div
                        class="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2.5 pt-2 border-t border-gray-100"
                      >
                        <div>
                          <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Visit Date</p>
                          <p class="text-sm text-gray-800">{visit.installationDate || "—"}</p>
                        </div>
                        <div>
                          <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Cost</p>
                          <p class="text-sm text-gray-800">₹{visit.installationCost ?? 0}</p>
                        </div>
                        <div>
                          <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Install Date</p>
                          <p class="text-sm text-gray-800">{visit.installDate || "—"}</p>
                        </div>
                        <div>
                          <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Status</p>
                          {#if statusCfg}
                            <span
                              class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold {statusCfg.cls}"
                              >{statusCfg.label}</span
                            >
                          {:else}
                            <span class="text-gray-300 text-sm">—</span>
                          {/if}
                        </div>
                        {#if visit.remark}
                          <div class="col-span-2 lg:col-span-4">
                            <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Remark</p>
                            <p class="text-sm text-gray-800">{visit.remark}</p>
                          </div>
                        {/if}
                        {#if visit.finalDesc}
                          <div class="col-span-2 lg:col-span-4">
                            <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Final Notes</p>
                            <p class="text-sm text-gray-800">{visit.finalDesc}</p>
                          </div>
                        {/if}
                        <div class="col-span-2 lg:col-span-4">
                          <p class="mb-1.5 text-[11px] font-semibold text-gray-500">Employees</p>
                          <div class="flex flex-wrap gap-1.5">
                            {#each ((visit.employeesDetails ?? []).length
                              ? visit.employeesDetails
                              : selectedLabels(visit.employees || [])) as emp}
                              <span
                                class="flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 bg-indigo-50 text-indigo-800 rounded-full text-xs font-medium"
                              >
                                <span
                                  class="w-4 h-4 rounded-full bg-indigo-200 flex items-center justify-center text-[9px] font-bold text-indigo-700"
                                  >{(emp.username || emp.name || "?").charAt(0)}</span
                                >
                                {emp.username || emp.name || emp._id}
                              </span>
                            {:else}
                              <span class="text-xs text-gray-400"
                                >No employees assigned</span
                              >
                            {/each}
                          </div>
                        </div>
                        {#if visit.latitude != null && visit.longitude != null}
                          <div class="col-span-2 lg:col-span-4">
                            <p class="mb-0.5 text-[11px] font-semibold text-gray-500">Location</p>
                            <p class="text-sm text-gray-800">
                              {Number(visit.latitude).toFixed(5)}, {Number(visit.longitude).toFixed(5)}
                              {#if visit.locationCapturedAt}
                                <span class="text-xs text-gray-400 ml-2"
                                  >{String(visit.locationCapturedAt).replace("T", " ").slice(0, 19)}</span
                                >
                              {/if}
                            </p>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          </div>
        {/if}
    </section>
    {/if}
  </div>
{/if}
