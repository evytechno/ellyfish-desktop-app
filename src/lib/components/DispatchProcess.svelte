<script>
  import { onMount } from "svelte";
  import crypto from "crypto-js";
  import Swal from "sweetalert2";
  import { dispatchedDetailsStore } from "$lib/stores/dataStores";
  import {
    HMAC_WEBAPP_SECRET,
    WORKSHOP_BASE_URL,
    WORKSHOP_IMAGE_BASE_URL,
  } from "$lib/constants/constants";

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

  // Edit permissions
  // Dispatch: editable while dispatchInProgress → delivered (not after installationInProgress)
  $: canEditDispatch =
    statusGte(workOrderStatus, "dispatchInProgress") &&
    statusLte(workOrderStatus, "inTransit");
  // Installation: editable only while installationInProgress
  $: canEditInstallation =
    statusGte(workOrderStatus, "delivered") &&
    statusLte(workOrderStatus, "installationInProgress");
  // Visits: add/edit while installationInProgress only
  $: canEditVisits = workOrderStatus === "installationInProgress";

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
    "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition";
  const lc =
    "block mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide";

  // ── Multi-select dropdown state ──────────────────────────
  let dropdownOpen = {};
  function toggleDropdown(id) {
    dropdownOpen = { ...dropdownOpen, [id]: !dropdownOpen[id] };
  }
  function closeDropdown(id) {
    dropdownOpen = { ...dropdownOpen, [id]: false };
  }
  function toggleEmployee(arr, id) {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  }
  function selectedLabels(ids) {
    return ids.map((id) => users.find((u) => u._id === id)).filter(Boolean);
  }

  // ── API helpers ──────────────────────────────────────────
  function generateHmacSignature({ method, path, timestamp }) {
    const secret = HMAC_WEBAPP_SECRET || "labourManagementAndBomProject";

    const payload = `${method.toUpperCase()}|${path}|${timestamp}`;
    return crypto.enc.Hex.stringify(crypto.HmacSHA256(payload, secret));
  }
  function generateHmacSignature1({ method, path, timestamp }) {
    const secret = "salesProject";

    const payload = `${method.toUpperCase()}|${path}|${timestamp}`;
    return crypto.enc.Hex.stringify(crypto.HmacSHA256(payload, secret));
  }

  async function apiFetch1(path, method = "GET", data = null) {
    const timestamp = Math.floor(Date.now() / 1000);
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "salesProject",
        "x-signature": generateHmacSignature1({ method, path, timestamp }),
        "x-timestamp": timestamp.toString(),
      },
    };
    if (data && method !== "GET") options.body = JSON.stringify(data);
    const resp = await (
      await fetch("http://localhost:3000" + path, options)
    ).json();
    if (!resp.success) throw resp;
    return resp;
  }
  async function apiFetch(path, method = "GET", data = null) {
    const timestamp = Math.floor(Date.now() / 1000);
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "BOM_PROJECT",
        "x-signature": generateHmacSignature({ method, path, timestamp }),
        "x-timestamp": timestamp.toString(),
      },
    };
    if (data && method !== "GET") options.body = JSON.stringify(data);
    const resp = await (await fetch(WORKSHOP_BASE_URL + path, options)).json();
    if (!resp.success) throw resp;
    return resp;
  }
  async function apiFetchForm(path, method, formData) {
    let isFormData = formData instanceof FormData;
    const timestamp = Math.floor(Date.now() / 1000);
    let options = {
      method,
      headers: {
        "x-api-key": "BOM_PROJECT",
        "x-signature": generateHmacSignature({ method, path, timestamp }),
        "x-timestamp": timestamp.toString(),
      },
    };
    if (isFormData) {
      options.body = formData;
    } else {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(formData);
    }

    const resp = await (await fetch(WORKSHOP_BASE_URL + path, options)).json();
    if (!resp.success) throw resp;
    return resp;
  }

  function parseValidationErrors(error) {
    if (!error?.errors) return null;
    const fmt = {};
    error.errors.forEach((e) => (fmt[e.field] = e.errors));
    return fmt;
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
      const resp = await apiFetch(`/user/sales/all`, "GET");
      users = resp?.data ?? [];
    } catch (e) {
    }
  }

  async function fetchDispatch() {
    try {
      loadingData = true;
      const resp = await apiFetch(
        `/dispatch/sales/${order.workOrderNumber}`,
        "GET",
      );
      projectDetails = resp?.data?.projectDetails ?? {};
      workOrderStatus = resp?.data?.projectDetails?.status ?? "open";
      delete resp.data.projectDetails;

      // if (projectDetails) {
      //   const resp = await apiFetchForm(
      //     `/project/sales/${projectDetails.uuid}`,
      //     "PUT",
      //     // { status: "installationInProgress" },
      //     { status: "completed" },
      //   );
      // }

      dispatchData = Object.keys(resp.data).length > 0 ? resp.data : null;
      syncForms(dispatchData);
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

  // ── Tab state ────────────────────────────────────────────
  let currentTab = "dispatch";

  // Auto-select the first available tab when status changes
  $: {
    if (showVisit && currentTab === "dispatch" && !showDispatch)
      currentTab = "visit";
    else if (showInstallation && currentTab === "dispatch" && !showDispatch)
      currentTab = "installation";
  }

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
  const imgUrl = (img) => `${WORKSHOP_IMAGE_BASE_URL}/${img.path}`;

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
      dispatchLoading = true;
      formErrors = {};
      const fd = new FormData();
      [
        "medium",
        "dispatchDate",
        "packaging",
        "description",
        "city",
        "state",
      ].forEach((k) => fd.append(k, dispatchForm[k]));
      newImageFiles.forEach((f) => fd.append("dispatchImages", f));

      let resp;
      if (dispatchData) {
        // UPDATE
        resp = await apiFetchForm(
          `/dispatch/sales/${dispatchData.uuid}`,
          "PUT",
          fd,
        );
      } else {
        // CREATE DISPATCH
        fd.append("workOrder", order.workOrderNumber);

        resp = await apiFetchForm(`/dispatch/sales`, "POST", fd);

        // 🚀 Move status ONLY after successful creation
        const fd2 = new FormData();
        fd2.append("status", "dispatchInProgress");

        await apiFetchForm(`/project/sales/${projectDetails.uuid}`, "PUT", fd2);

        workOrderStatus = "dispatchInProgress";
        currentTab = "dispatch";
      }

      dispatchData = resp.data;
      syncForms(dispatchData);
      dispatchedDetailsStore.set(dispatchData);

      dispatchEditing = false;

      Swal.fire(
        "Success",
        resp.message ||
          (dispatchData ? "Dispatch Updated" : "Dispatch Created"),
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
  const installImgUrl = (img) => `${WORKSHOP_IMAGE_BASE_URL}/${img.path}`;

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
      installNewFiles.forEach((f) => fd.append("images", f));

      const resp = await apiFetchForm(
        `/dispatch/sales/${dispatchData.uuid}`,
        "PUT",
        fd,
      );
      dispatchData = resp.data;
      syncForms(dispatchData);
      dispatchedDetailsStore.set(dispatchData);

      // 🚀 When status is delivered and installation form is saved,
      // advance the work-order status to installationInProgress
      if (workOrderStatus === "delivered" && projectDetails?.uuid) {
        await apiFetchForm(`/project/sales/${projectDetails.uuid}`, "PUT", {
          status: "installationInProgress",
        });
        workOrderStatus = "installationInProgress";
        currentTab = "visit";
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
    currentTab = "dispatch";
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
      const s = visits[idx]?.status;
      const payload = { lastInstallationDetails: visits };
      if (s === "partiallyInstalled") payload.status = "installationInProgress";
      if (s === "Installed") payload.status = "installed";

      const resp = await apiFetch(
        `/dispatch/sales/${dispatchData.uuid}`,
        "PUT",
        payload,
      );
      dispatchData = resp.data;
      syncForms(dispatchData);
      dispatchedDetailsStore.set(dispatchData);
      editingIdx = null;
      visitStep = 1;
      const { [idx]: _, ...rest } = snapshots;
      snapshots = rest;
      Swal.fire("Success", resp.message || "Visit Saved", "success");
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
        currentTab = "dispatch";
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
        currentTab = "dispatch";
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
        currentTab = "installation";
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
        currentTab = "installation";
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
          currentTab = "visit";
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

      // ── API CALL ────────────────────────────────
      const resp = await apiFetchForm(
        `/project/sales/${projectDetails.uuid}`,
        "PUT",
        { status: nextStatus },
      );

      projectDetails = resp.data;
      workOrderStatus = resp.data.status;

      // Auto switch tab for better UX
      if (nextStatus === "dispatchInProgress") currentTab = "dispatch";
      if (nextStatus === "delivered") currentTab = "installation";
      if (nextStatus === "installationInProgress") currentTab = "visit";

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

    <!-- Tab bar — only show tabs that are unlocked -->
    <div
      class="bg-white rounded-2xl border border-gray-100 shadow-sm p-1 mb-3 flex gap-1"
    >
      {#each TABS as tab}
        {@const unlocked =
          (tab.id === "dispatch" && showDispatch) ||
          (tab.id === "installation" && showInstallation) ||
          (tab.id === "visit" && showVisit)}
        <button
          on:click={() => unlocked && (currentTab = tab.id)}
          disabled={!unlocked}
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
          {#if !unlocked}<span class="text-gray-300 text-[10px]">🔒</span>{/if}
        </button>
      {/each}
    </div>

    <!-- ── DISPATCH TAB ───────────────────────────────────── -->
    {#if currentTab === "dispatch"}
      <div
        class="bg-white border border-gray-100 rounded-xl shadow-sm p-6 mb-3"
      >
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-800">
            {dispatchEditing
              ? dispatchData
                ? "Edit Dispatch"
                : "Create Dispatch"
              : "Dispatch Details"}
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
          <!-- Form -->
          <div class="grid grid-cols-2 gap-x-5 gap-y-4">
            <div>
              <label class={lc}>Transport Medium</label>
              <input class={ic} bind:value={dispatchForm.medium} />
              {#if formErrors.medium}<p class="mt-1 text-xs text-red-500">
                  {formErrors.medium}
                </p>{/if}
            </div>
            <div>
              <label class={lc}>Dispatch Date</label>
              <input
                type="date"
                class={ic}
                bind:value={dispatchForm.dispatchDate}
              />
              {#if formErrors.dispatchDate}<p class="mt-1 text-xs text-red-500">
                  {formErrors.dispatchDate}
                </p>{/if}
            </div>
            <div>
              <label class={lc}>Packaging</label>
              <input class={ic} bind:value={dispatchForm.packaging} />
              {#if formErrors.packaging}<p class="mt-1 text-xs text-red-500">
                  {formErrors.packaging}
                </p>{/if}
            </div>
            <div>
              <label class={lc}>City</label><input
                class={ic}
                bind:value={dispatchForm.city}
              />
            </div>
            <div>
              <label class={lc}>State</label><input
                class={ic}
                bind:value={dispatchForm.state}
              />
            </div>
            <div class="col-span-2">
              <label class={lc}>Description</label>
              <textarea
                class="{ic} min-h-[80px] resize-y"
                bind:value={dispatchForm.description}
              />
            </div>
            <!-- Image upload -->
            <div class="col-span-2">
              <label class={lc}>Images</label>
              <label
                class="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition"
              >
                <span class="text-2xl mb-1">📎</span>
                <span class="text-xs text-gray-500 font-medium"
                  >Click to upload images</span
                >
                <span class="text-xs text-gray-400 mt-0.5"
                  >PNG, JPG, WEBP supported</span
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
                <p
                  class="mt-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                >
                  Saved Images ({existingImages.length})
                </p>
                <div class="grid grid-cols-4 gap-2">
                  {#each existingImages as img}
                    <div
                      class="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square"
                    >
                      <img
                        src={imgUrl(img)}
                        alt={img.originalName}
                        class="w-full h-full object-cover"
                      />
                      <div
                        class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition"
                      />
                      <button
                        type="button"
                        on:click={() => removeExistingImage(img.fileName)}
                        class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition"
                        >✕</button
                      >
                      <p
                        class="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/40 text-white text-[9px] truncate opacity-0 group-hover:opacity-100 transition"
                      >
                        {img.originalName}
                      </p>
                    </div>
                  {/each}
                </div>
              {/if}
              {#if newImageFiles.length > 0}
                <p
                  class="mt-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                >
                  New Images ({newImageFiles.length})
                </p>
                <div class="grid grid-cols-4 gap-2">
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
                        class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition"
                        >✕</button
                      >
                      <span
                        class="absolute bottom-1 left-1 bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded"
                        >New</span
                      >
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
          <div
            class="flex justify-end gap-2 mt-3 pt-4 border-t border-gray-100"
          >
            <button
              on:click={() => {
                dispatchEditing = false;
                formErrors = {};
                syncImages(dispatchData);
              }}
              class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >Cancel</button
            >
            <button
              on:click={saveDispatch}
              disabled={dispatchLoading}
              class="px-5 py-2 text-sm font-medium text-white rounded-lg transition"
              class:bg-indigo-300={dispatchLoading}
              class:cursor-not-allowed={dispatchLoading}
              class:bg-indigo-600={!dispatchLoading}
              class:hover:bg-indigo-700={!dispatchLoading}
            >
              {dispatchLoading
                ? "Saving..."
                : dispatchData
                  ? "Update Dispatch"
                  : "Create Dispatch"}
            </button>
          </div>
        {:else if !dispatchData}
          <!-- No dispatch yet -->
          {#if canEditDispatch}
            <!-- ✅ Dispatch stage (editable) -->
            <div
              class="flex flex-col items-center justify-center py-12 text-gray-400"
            >
              <span class="text-4xl mb-3">📦</span>
              <p class="text-sm font-medium">No dispatch created yet</p>
              <p class="text-xs mt-1">Click "+ Create" to get started</p>
            </div>
          {:else if workOrderStatus === "completed"}
            <!-- 🔒 Completed stage (NO create allowed) -->
            <div
              class="flex flex-col items-center justify-center py-12 text-gray-400"
            >
              <span class="text-4xl mb-3">📦</span>
              <p class="text-sm font-medium">Dispatch not started</p>
              <p class="text-xs mt-1 text-indigo-500">
                👉 Move to next stage to start dispatch
              </p>
            </div>
          {:else}
            <!-- 📄 Other states -->
            <div
              class="flex flex-col items-center justify-center py-12 text-gray-400"
            >
              <span class="text-4xl mb-3">📦</span>
              <p class="text-sm font-medium">No dispatch data available</p>
            </div>
          {/if}
        {:else}
          <!-- View mode -->
          <div class="grid grid-cols-2 gap-x-8 gap-y-4">
            {#each [{ label: "Transport Medium", value: dispatchData.medium }, { label: "Dispatch Date", value: dispatchData.dispatchDate }, { label: "Packaging", value: dispatchData.packaging }, { label: "City", value: dispatchData.city }, { label: "State", value: dispatchData.state }] as f}
              <div>
                <p
                  class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                >
                  {f.label}
                </p>
                <p class="text-sm text-gray-800">{f.value || "—"}</p>
              </div>
            {/each}
            <div class="col-span-2">
              <p
                class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
              >
                Description
              </p>
              <p class="text-sm text-gray-800 whitespace-pre-line">
                {dispatchData.description || "—"}
              </p>
            </div>
            {#if (dispatchData.dispatchImages ?? []).length > 0}
              <div class="col-span-2">
                <p
                  class="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                >
                  Images ({dispatchData.dispatchImages.length})
                </p>
                <div class="grid grid-cols-4 gap-2">
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
                      <div
                        class="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition"
                      />
                      <p
                        class="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/40 text-white text-[9px] truncate opacity-0 group-hover:opacity-100 transition"
                      >
                        {img.originalName}
                      </p>
                      <p
                        class="absolute top-1 right-1 text-[9px] bg-black/40 text-white px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition"
                      >
                        {img.date}
                      </p>
                    </a>
                  {/each}
                </div>
              </div>
            {:else}
              <div class="col-span-2">
                <p
                  class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                >
                  Images
                </p>
                <p class="text-sm text-gray-300">No images uploaded</p>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- ── INSTALLATION TAB ───────────────────────────────── -->
    {:else if currentTab === "installation"}
      <div
        class="bg-white border border-gray-100 rounded-xl shadow-sm p-6 mb-3"
      >
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-800">
            {installEditing ? "Edit Installation" : "Installation Details"}
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
          <div
            class="flex flex-col items-center justify-center py-12 text-gray-400"
          >
            <span class="text-4xl mb-3">🔧</span>
            <p class="text-sm font-medium">Available after delivery</p>
          </div>
        {:else if installEditing && canEditInstallation}
          <!-- Form -->
          <div class="grid grid-cols-2 gap-x-5 gap-y-4">
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

            <!-- Employee multi-select -->
            <div class="col-span-2">
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
            <div class="col-span-2">
              <label class={lc}>Images</label>
              <label
                class="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition"
              >
                <span class="text-2xl mb-1">📎</span>
                <span class="text-xs text-gray-500 font-medium"
                  >Click to upload images</span
                >
                <span class="text-xs text-gray-400 mt-0.5"
                  >PNG, JPG, WEBP supported</span
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
                <p
                  class="mt-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                >
                  Saved Images ({installExisting.length})
                </p>
                <div class="grid grid-cols-4 gap-2">
                  {#each installExisting as img}
                    <div
                      class="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square"
                    >
                      <img
                        src={installImgUrl(img)}
                        alt={img.originalName}
                        class="w-full h-full object-cover"
                      />
                      <div
                        class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition"
                      />
                      <button
                        type="button"
                        on:click={() =>
                          removeInstallExistingImage(img.fileName)}
                        class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition"
                        >✕</button
                      >
                      <p
                        class="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/40 text-white text-[9px] truncate opacity-0 group-hover:opacity-100 transition"
                      >
                        {img.originalName}
                      </p>
                    </div>
                  {/each}
                </div>
              {/if}
              {#if installNewFiles.length > 0}
                <p
                  class="mt-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                >
                  New Images ({installNewFiles.length})
                </p>
                <div class="grid grid-cols-4 gap-2">
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
                        class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition"
                        >✕</button
                      >
                      <span
                        class="absolute bottom-1 left-1 bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded"
                        >New</span
                      >
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
          <div
            class="flex justify-end gap-2 mt-3 pt-4 border-t border-gray-100"
          >
            <button
              on:click={() => {
                installEditing = false;
                formErrors = {};
                syncInstallImages(dispatchData);
              }}
              class="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >Cancel</button
            >
            <button
              on:click={saveInstall}
              disabled={installLoading || installForm.employees.length === 0}
              class="px-5 py-2 text-sm font-medium text-white rounded-lg transition"
              class:bg-indigo-300={installLoading ||
                installForm.employees.length === 0}
              class:cursor-not-allowed={installLoading ||
                installForm.employees.length === 0}
              class:bg-indigo-600={!installLoading &&
                installForm.employees.length > 0}
              class:hover:bg-indigo-700={!installLoading &&
                installForm.employees.length > 0}
            >
              {installLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        {:else}
          <!-- View mode -->
          <div class="grid grid-cols-2 gap-x-8 gap-y-4 mb-3">
            <div>
              <p
                class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
              >
                Delivery Date
              </p>
              <p class="text-sm text-gray-800">
                {dispatchData?.deliveryDate || "—"}
              </p>
            </div>
            <div>
              <p
                class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
              >
                Installation Type
              </p>
              <p class="text-sm text-gray-800">
                {dispatchData?.installationType || "—"}
              </p>
            </div>
          </div>
          <p
            class="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide"
          >
            Equipment Requirements
          </p>
          <div class="bg-gray-50 rounded-lg divide-y divide-gray-100 px-4 mb-3">
            {#each REQUIREMENTS as req}
              {@const val = installForm[req.field]}
              {@const on = val === "available"}
              {@const nr = val === "notRequired"}
              <div class="flex items-center justify-between py-3">
                <span class="text-sm text-gray-700">{req.label}</span>
                <span
                  class="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-medium"
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
              <p
                class="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide"
              >
                Assigned Employees
              </p>
              <div class="flex flex-wrap gap-2">
                {#each dispatchData.employeesDetails ?? [] as emp}
                  <span
                    class="flex items-center gap-2 pl-1 pr-3 py-1 bg-indigo-50 text-indigo-800 rounded-full text-xs font-medium"
                  >
                    <span
                      class="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center text-[10px] font-bold text-indigo-700"
                      >{emp.username.charAt(0)}</span
                    >
                    {emp.username}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
          {#if (dispatchData?.images ?? []).length > 0}
            <div>
              <p
                class="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide"
              >
                Images ({dispatchData.images.length})
              </p>
              <div class="grid grid-cols-4 gap-2">
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
                    <div
                      class="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition"
                    />
                    <p
                      class="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/40 text-white text-[9px] truncate opacity-0 group-hover:opacity-100 transition"
                    >
                      {img.originalName}
                    </p>
                    <p
                      class="absolute top-1 right-1 text-[9px] bg-black/40 text-white px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition"
                    >
                      {img.date}
                    </p>
                  </a>
                {/each}
              </div>
            </div>
          {:else}
            <div>
              <p
                class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
              >
                Images
              </p>
              <p class="text-sm text-gray-300">No images uploaded</p>
            </div>
          {/if}
        {/if}
      </div>

      <!-- ── SERVICE VISIT TAB ──────────────────────────────── -->
    {:else if currentTab === "visit"}
      <div class="mb-3">
        {#if !showVisit}
          <div
            class="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-100 shadow-sm text-gray-400"
          >
            <span class="text-4xl mb-3">🚗</span>
            <p class="text-sm font-medium">
              Available after installation begins
            </p>
          </div>
        {:else}
          <!-- Visit header -->
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="text-sm font-semibold text-gray-800">
                Service Visits
              </h3>
              <div class="flex gap-3 mt-1">
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
            <div class="flex flex-col items-end gap-1.5">
              {#if canEditVisits}
                <button
                  on:click={addVisit}
                  disabled={!canAddNew}
                  title={editingIdx !== null
                    ? "Finish editing current visit first"
                    : !lastIsInstalled && visits.length > 0
                      ? "Mark last visit as Successfully Done first"
                      : "Add new service visit"}
                  class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition"
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
                  <p class="text-xs text-amber-500">
                    ⚠ Mark Visit #{visits.length} as Successfully Done to add a
                    new one
                  </p>
                {/if}
                {#if editingIdx !== null}
                  <p class="text-xs text-indigo-500">
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
              class="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200"
            >
              <span class="text-4xl mb-3">🚗</span>
              <p class="text-sm font-medium text-gray-500">
                No service visits yet
              </p>
              {#if canEditVisits}
                <p class="text-xs text-gray-400 mt-1">
                  Click "+ New Visit" to record the first visit
                </p>
              {/if}
            </div>
          {:else}
            <div class="flex flex-col gap-3">
              {#each visits as visit, i (i)}
                {@const isEditing = editingIdx === i}
                {@const isCompleted = visit.status === "Installed"}
                {@const canEdit = canEditVisits && editingIdx === null}
                {@const statusCfg = VISIT_STATUS_MAP[visit.status] ?? null}

                <div
                  class="bg-white rounded-xl border shadow-sm transition-all duration-200"
                  class:border-indigo-300={isEditing}
                  class:ring-2={isEditing}
                  class:ring-indigo-100={isEditing}
                  class:border-green-200={isCompleted && !isEditing}
                  class:border-gray-100={!isCompleted && !isEditing}
                >
                  <!-- Visit card header -->
                  <div class="flex items-center justify-between px-3 py-4">
                    <div class="flex items-center gap-3">
                      <div
                        class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
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
                            class="px-3 py-0.5 rounded-full text-xs font-semibold {statusCfg.cls}"
                            >{statusCfg.label}</span
                          >
                        {/if}
                      </div>
                    </div>
                    {#if isEditing}
                      <span class="text-xs text-gray-400"
                        >Step {visitStep} of 2</span
                      >
                    {:else if canEdit}
                      <button
                        on:click={() => visitEdit(i)}
                        class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer transition"
                        >✏️ Edit</button
                      >
                    {:else if !canEditVisits}
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
                  <div class="px-3 pb-5">
                    {#if isEditing}
                      <!-- Step indicator -->
                      <div
                        class="flex items-center gap-2 pt-3 pb-4 border-t border-gray-100 mb-2"
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
                        <div class="grid grid-cols-2 gap-x-5 gap-y-4">
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
                          <div class="col-span-2">
                            <label class={lc}>Final Notes</label>
                            <textarea
                              class="{ic} min-h-[60px] resize-y"
                              bind:value={visit.finalDesc}
                              placeholder="Finalization notes..."
                            />
                          </div>
                          <!-- Employee multi-select -->
                          <div class="col-span-2">
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
                                  class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto"
                                  on:click|stopPropagation
                                >
                                  {#each dispatchData?.employeesDetails as emp}
                                    {@const checked = visit.employees.includes(
                                      emp._id,
                                    )}
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
                                        <p
                                          class="text-xs text-gray-400 truncate mb-0"
                                        >
                                          {emp.email}
                                        </p>
                                      </div>
                                    </button>
                                  {/each}
                                  {#if dispatchData?.employees.length === 0}<p
                                      class="px-4 py-3 text-sm text-gray-400"
                                    >
                                      No employees found
                                    </p>{/if}
                                </div>
                              {/if}
                            </div>
                          </div>
                        </div>
                        <div
                          class="flex justify-between mt-4 pt-3 border-t border-gray-100"
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
                        <div class="grid grid-cols-2 gap-x-5 gap-y-4">
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
                          <div class="col-span-2">
                            <label class={lc}>Remark</label>
                            <textarea
                              class="{ic} min-h-[60px] resize-y"
                              bind:value={visit.remark}
                            />
                          </div>
                        </div>
                        <div
                          class="flex justify-between mt-4 pt-3 border-t border-gray-100"
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
                        class="grid grid-cols-2 gap-x-8 gap-y-3 pt-3 border-t border-gray-100"
                      >
                        <div>
                          <p
                            class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                          >
                            Visit Date
                          </p>
                          <p class="text-sm text-gray-800">
                            {visit.installationDate || "—"}
                          </p>
                        </div>
                        <div>
                          <p
                            class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                          >
                            Cost
                          </p>
                          <p class="text-sm text-gray-800">
                            ₹{visit.installationCost ?? 0}
                          </p>
                        </div>
                        <div>
                          <p
                            class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                          >
                            Install Date
                          </p>
                          <p class="text-sm text-gray-800">
                            {visit.installDate || "—"}
                          </p>
                        </div>
                        <div>
                          <p
                            class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                          >
                            Status
                          </p>
                          {#if statusCfg}
                            <span
                              class="inline-block px-3 py-0.5 rounded-full text-xs font-semibold {statusCfg.cls}"
                              >{statusCfg.label}</span
                            >
                          {:else}
                            <span class="text-gray-300 text-sm">—</span>
                          {/if}
                        </div>
                        {#if visit.remark}
                          <div class="col-span-2">
                            <p
                              class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                            >
                              Remark
                            </p>
                            <p class="text-sm text-gray-800">{visit.remark}</p>
                          </div>
                        {/if}
                        {#if visit.finalDesc}
                          <div class="col-span-2">
                            <p
                              class="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                            >
                              Final Notes
                            </p>
                            <p class="text-sm text-gray-800">
                              {visit.finalDesc}
                            </p>
                          </div>
                        {/if}
                        <div class="col-span-2">
                          <p
                            class="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide"
                          >
                            Employees
                          </p>
                          <div class="flex flex-wrap gap-2">
                            {#if (visit.employeesDetails ?? []).length > 0}
                              {#each visit.employeesDetails as emp}
                                <span
                                  class="flex items-center gap-2 pl-1 pr-3 py-1 bg-indigo-50 text-indigo-800 rounded-full text-xs font-medium"
                                >
                                  <span
                                    class="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center text-[10px] font-bold text-indigo-700"
                                    >{emp.username.charAt(0)}</span
                                  >
                                  {emp.username}
                                </span>
                              {/each}
                            {:else}
                              <span class="text-xs text-gray-300"
                                >No employees assigned</span
                              >
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
{/if}
