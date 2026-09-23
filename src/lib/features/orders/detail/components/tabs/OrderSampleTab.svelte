<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { API_BASE_URL } from "$lib/constants/constants";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { authApiFetch } from "$lib/api/client";
  import { companiesAllStore } from "$lib/stores/dataStores";
  import { checkAuth } from "$lib/utils/auth";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";
  import { loadOrderSampleStepImages } from "../../api/orderDetailApi.js";

  export let order;
  export let samples = [];
  export let loadingSamples = false;
  export let canMutateOrder = true;
  export let sampleSaving = false;
  export let setSampleFlag = async () => {};
  export let setSampleCompany = async () => {};
  export let addSampleMovement = async () => {};
  export let updateSampleMovement = async () => {};
  export let changeSampleStatus = async () => {};
  export let markSampleReceived = async () => {};
  export let deleteSampleMovement = async () => {};
  export let addSampleEvent = async () => {};
  export let approveDelayRemark = async () => {};
  export let approveSample = async () => {};
  export let rejectSample = async () => {};
  export let openImageLightbox = () => {};

  const UNIT_OPTIONS = ["Pcs", "Set", "Kg", "Nos", "Box"];
  const MOVEMENT_STATUS_OPTIONS = [
    "Pending",
    "Prepared",
    "Sent",
    "Dispatched",
    "In Transit",
    "Hold",
    "Received",
    "Returned",
    "Lost",
    "Damaged",
    "Cancelled",
  ];
  const MARK_RECEIVABLE_STATUSES = [
    "Pending",
    "Prepared",
    "Sent",
    "Dispatched",
    "In Transit",
    "Hold",
  ];
  const STATUSES_WITH_SENT = [
    "Sent",
    "Dispatched",
    "In Transit",
    "Received",
    "Returned",
    "Lost",
    "Damaged",
  ];
  /** Happy-path order for defaulting "New status" when opening Change status. */
  const STATUS_FORWARD_ORDER = [
    "Pending",
    "Prepared",
    "Sent",
    "Dispatched",
    "In Transit",
    "Received",
    "Returned",
  ];

  function nextMovementStatus(current) {
    const cur = String(current || "Pending");
    if (cur === "Hold") return "Received";
    if (cur === "Lost" || cur === "Damaged" || cur === "Cancelled") return cur;
    const idx = STATUS_FORWARD_ORDER.indexOf(cur);
    if (idx < 0) return STATUS_FORWARD_ORDER[0];
    if (idx >= STATUS_FORWARD_ORDER.length - 1) return cur;
    return STATUS_FORWARD_ORDER[idx + 1];
  }

  /** Default photo step when New status changes (user can still override). */
  function suggestedStepForStatus(status) {
    switch (String(status || "")) {
      case "Pending":
      case "Prepared":
        return "sample";
      case "Sent":
        return "before";
      case "Dispatched":
        return "dispatched";
      case "In Transit":
        return "packing";
      case "Hold":
        return "packing";
      case "Received":
        return "completed";
      case "Returned":
        return "after";
      case "Lost":
      case "Damaged":
      case "Cancelled":
        return "sample";
      default:
        return "sample";
    }
  }

  function onStatusChangeSelect() {
    statusChangeStep = suggestedStepForStatus(statusChangeStatus);
    statusShowMoreDates = false;
    statusChangeError = "";
  }

  function toggleStatusPhotos() {
    statusShowPhotos = !statusShowPhotos;
    if (!statusShowPhotos) clearStatusFiles();
  }

  /** Image pipeline steps (repeatable on timeline / movements). */
  const IMAGE_STEP_OPTIONS = [
    { value: "sample", label: "Sample" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "packing", label: "Packing" },
    { value: "completed", label: "Completed" },
    { value: "dispatched", label: "Dispatched" },
  ];
  const IMAGE_STEP_ORDER = IMAGE_STEP_OPTIONS.map((o) => o.value);

  /** Next pipeline step for this movement (after furthest step already logged). */
  function nextImageStepForSample(sampleId) {
    const sample = (samples || []).find((s) => s.id === sampleId);
    const events = Array.isArray(sample?.events) ? sample.events : [];
    let furthest = -1;
    for (const ev of events) {
      const idx = IMAGE_STEP_ORDER.indexOf(String(ev?.type || "").toLowerCase());
      if (idx > furthest) furthest = idx;
    }
    if (furthest < 0) return IMAGE_STEP_ORDER[0];
    if (furthest >= IMAGE_STEP_ORDER.length - 1) {
      return IMAGE_STEP_ORDER[IMAGE_STEP_ORDER.length - 1];
    }
    return IMAGE_STEP_ORDER[furthest + 1];
  }

  const currentUser = checkAuth();
  const canManageDelayRemarks =
    currentUser?.role === "admin" || currentUser?.role === "master";

  function isOverdueSample(s) {
    return !!s?.sentDelay?.delayed;
  }

  function hasPendingDelayRemark(s) {
    return String(s?.delayRemarkStatus || "").toLowerCase() === "pending";
  }

  function needsDelayRemarkInput(s) {
    if (!isOverdueSample(s)) return false;
    const st = String(s?.delayRemarkStatus || "").toLowerCase();
    return st !== "approved" && st !== "pending";
  }
  const defaultSampleCompanyId =
    currentUser?.companyId != null ? Number(currentUser.companyId) : null;

  let companies = [];
  let showCompanyModal = false;
  let editCompanyId = null;
  let companyModalError = "";
  /** After picking company, enable sample case then open Add sample. */
  let pendingEnableSample = false;

  onMount(async () => {
    const cached = get(companiesAllStore);
    if (cached?.length) {
      companies = cached;
      return;
    }
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = Array.isArray(data) ? data : data?.data || [];
      companiesAllStore.set(companies);
    } catch (_) {
      companies = [];
    }
  });

  /** Sample company name (from order when sample is on). */
  $: sampleCompany =
    order?.sampleCompany?.name ||
    companies.find((c) => Number(c.id) === Number(order?.sampleCompanyId))
      ?.name ||
    null;
  $: hasSampleCompany =
    order?.sampleCompanyId != null || !!sampleCompany;

  function openCompanyModal() {
    editCompanyId =
      order?.sampleCompanyId != null
        ? Number(order.sampleCompanyId)
        : defaultSampleCompanyId;
    companyModalError = "";
    showCompanyModal = true;
  }

  function closeCompanyModal() {
    showCompanyModal = false;
    editCompanyId = null;
    companyModalError = "";
    pendingEnableSample = false;
  }

  async function saveSampleCompany() {
    if (editCompanyId == null) {
      companyModalError = "Select a company.";
      return;
    }
    companyModalError = "";

    // Enable was waiting on company — set both, then open Add sample
    if (pendingEnableSample) {
      const ok = await setSampleFlag(true, editCompanyId);
      if (ok === false) return;
      pendingEnableSample = false;
      closeCompanyModal();
      openModal();
      return;
    }

    const ok = await setSampleCompany(editCompanyId);
    if (ok === false) return;
    closeCompanyModal();
    // Company just set and no movements yet → continue to first sample
    if (!samples?.length && !decided) openModal();
  }

  let showModal = false;
  let showEditModal = false;
  let showStatusModal = false;
  let showViewModal = false;
  let viewSample = null;
  let editSampleId = null;
  let editDirection = "Outbound";
  let editTracking = "";
  let editNotes = "";
  let editSentDate = "";
  let editReceivedDate = "";
  let editRequestedDate = "";
  let editExpectedDeliveryDate = "";
  let editExpectedReturnDate = "";
  let editReturnedDate = "";
  let editFollowUpDate = "";
  let editItems = [{ name: "", quantity: "1", unit: "Pcs", note: "" }];
  let statusSampleId = null;
  let statusChangeStatus = "Pending";
  let statusChangeNote = "";
  let statusChangeHoldRemark = "";
  let statusChangeDelayRemark = "";
  let statusChangeTracking = "";
  let statusChangeSentDate = "";
  let statusChangeReceivedDate = "";
  let statusChangeReturnedDate = "";
  let statusChangeExpectedDelivery = "";
  let statusChangeExpectedReturn = "";
  let statusChangeStep = "sample";
  /** @type {{ file: File, previewUrl: string }[]} */
  let statusChangeFiles = [];
  let statusFileInputEl = null;
  let statusShowPhotos = false;
  let statusShowMoreDates = false;
  let statusChangeError = "";
  let showDecisionModal = false;
  let showEventModal = false;
  let eventSampleId = null;
  let eventNote = "";
  let eventStep = "sample";
  let eventDelayRemark = "";
  /** @type {{ file: File, previewUrl: string }[]} */
  let eventFiles = [];
  let eventError = "";
  let eventFileInputEl = null;
  let decisionAction = "approve"; // approve | reject
  let direction = "Outbound";
  let status = "Pending";
  let tracking = "";
  let notes = "";
  let sentDate = new Date().toISOString().slice(0, 10);
  let requestedDate = "";
  let expectedDeliveryDate = "";
  let expectedReturnDate = "";
  let followUpDate = "";
  let decisionNote = "";
  let decisionError = "";
  let items = [{ name: "", quantity: "1", unit: "Pcs", note: "" }];
  let formError = "";

  $: decided =
    order?.sampleDecision === "Approved" || order?.sampleDecision === "Rejected";
  $: decisionCls =
    order?.sampleDecision === "Approved"
      ? "bg-success"
      : order?.sampleDecision === "Rejected"
        ? "bg-danger"
        : "bg-warning text-dark";
  $: decisionIsApprove = decisionAction === "approve";

  function blankItem() {
    return { name: "", quantity: "1", unit: "Pcs", note: "" };
  }

  function toDateInput(d) {
    if (!d) return "";
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }

  function openModal() {
    direction = "Outbound";
    status = "Pending";
    tracking = "";
    notes = "";
    sentDate = new Date().toISOString().slice(0, 10);
    requestedDate = "";
    expectedDeliveryDate = "";
    expectedReturnDate = "";
    followUpDate = "";
    items = [blankItem()];
    formError = "";
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    formError = "";
  }

  function openViewModal(s) {
    viewSample = s;
    showViewModal = true;
  }

  function closeViewModal() {
    showViewModal = false;
    viewSample = null;
  }

  function openEditFromView() {
    const s = viewSample;
    closeViewModal();
    if (s) {
      if (!hasSampleCompany) {
        openCompanyModal();
        return;
      }
      if (hasPendingDelayRemark(s)) return;
      openEditModal(s);
    }
  }

  function openStatusFromView() {
    const s = viewSample;
    closeViewModal();
    if (s) {
      if (!hasSampleCompany) {
        openCompanyModal();
        return;
      }
      if (hasPendingDelayRemark(s)) return;
      openStatusModal(s);
    }
  }

  function openEventFromView() {
    const id = viewSample?.id;
    const s = viewSample;
    closeViewModal();
    if (id) {
      if (!hasSampleCompany) {
        openCompanyModal();
        return;
      }
      if (hasPendingDelayRemark(s)) return;
      openEventModal(id);
    }
  }

  function openEditModal(s) {
    if (hasPendingDelayRemark(s)) return;
    editSampleId = s.id;
    editDirection = s.direction || "Outbound";
    editTracking = s.tracking || "";
    editNotes = s.notes || "";
    editSentDate = toDateInput(s.sentDate);
    editReceivedDate = toDateInput(s.receivedDate);
    editRequestedDate = toDateInput(s.requestedDate);
    editExpectedDeliveryDate = toDateInput(s.expectedDeliveryDate);
    editExpectedReturnDate = toDateInput(s.expectedReturnDate);
    editReturnedDate = toDateInput(s.returnedDate);
    editFollowUpDate = toDateInput(s.followUpDate);
    const existingItems = Array.isArray(s.items)
      ? s.items.filter((it) => it?.name).map((it) => ({
          name: it.name || "",
          quantity: it.quantity != null ? String(it.quantity) : "1",
          unit: it.unit || "Pcs",
          note: it.note || "",
        }))
      : [];
    editItems = existingItems.length ? existingItems : [blankItem()];
    formError = "";
    showEditModal = true;
  }

  function closeEditModal() {
    showEditModal = false;
    editSampleId = null;
    editItems = [blankItem()];
    formError = "";
  }

  function clearStatusFiles() {
    for (const item of statusChangeFiles) {
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    statusChangeFiles = [];
  }

  function openStatusModal(s, presetStatus = null) {
    if (!s || hasPendingDelayRemark(s)) return;
    statusSampleId = s.id;
    statusChangeStatus = presetStatus || nextMovementStatus(s.status);
    statusChangeNote = "";
    statusChangeHoldRemark = "";
    statusChangeDelayRemark = "";
    statusChangeTracking = s.tracking || "";
    statusChangeSentDate = toDateInput(s.sentDate) || new Date().toISOString().slice(0, 10);
    statusChangeReceivedDate =
      toDateInput(s.receivedDate) || new Date().toISOString().slice(0, 10);
    statusChangeReturnedDate =
      toDateInput(s.returnedDate) || new Date().toISOString().slice(0, 10);
    statusChangeExpectedDelivery = toDateInput(s.expectedDeliveryDate);
    statusChangeExpectedReturn = toDateInput(s.expectedReturnDate);
    statusChangeStep = suggestedStepForStatus(statusChangeStatus);
    clearStatusFiles();
    statusShowPhotos = false;
    statusShowMoreDates = false;
    statusChangeError = "";
    showStatusModal = true;
  }

  function closeStatusModal() {
    showStatusModal = false;
    statusSampleId = null;
    statusChangeNote = "";
    statusChangeHoldRemark = "";
    statusChangeDelayRemark = "";
    clearStatusFiles();
    statusShowPhotos = false;
    statusShowMoreDates = false;
    statusChangeError = "";
  }

  function openStatusFilePicker() {
    if (sampleSaving || statusChangeFiles.length >= 10) return;
    statusFileInputEl?.click();
  }

  function appendStatusFiles(fileList) {
    const picked = Array.from(fileList || []).filter(Boolean);
    if (!picked.length) return;
    const key = (f) => `${f.name}:${f.size}:${f.lastModified}`;
    const seen = new Set(statusChangeFiles.map((x) => key(x.file)));
    const next = [...statusChangeFiles];
    let dropped = 0;
    for (const f of picked) {
      if (seen.has(key(f))) continue;
      if (next.length >= 10) {
        dropped += 1;
        continue;
      }
      seen.add(key(f));
      next.push({
        file: f,
        previewUrl: f.type?.startsWith("image/")
          ? URL.createObjectURL(f)
          : "",
      });
    }
    statusChangeFiles = next;
    statusChangeError = dropped
      ? "Maximum 10 images. Extra files were skipped."
      : "";
  }

  function onStatusFilesChange(e) {
    appendStatusFiles(e.currentTarget?.files);
    e.currentTarget.value = "";
  }

  function onStatusImagesDrop(e) {
    e.preventDefault();
    if (sampleSaving) return;
    appendStatusFiles(e.dataTransfer?.files);
  }

  function removeStatusFile(index) {
    const item = statusChangeFiles[index];
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    statusChangeFiles = statusChangeFiles.filter((_, i) => i !== index);
    statusChangeError = "";
  }

  $: statusChangeSample = (samples || []).find((s) => s.id === statusSampleId) || null;
  $: statusNeedsHoldRemark = statusChangeStatus === "Hold";
  $: statusNeedsSentDate = STATUSES_WITH_SENT.includes(statusChangeStatus);
  $: statusNeedsReceivedDate = statusChangeStatus === "Received";
  $: statusNeedsReturnedDate = statusChangeStatus === "Returned";
  $: statusIsShipping = ["Sent", "Dispatched", "In Transit"].includes(
    statusChangeStatus,
  );
  /** Primary date field for this status (keeps modal short). */
  $: statusPrimaryDateLabel = statusNeedsReceivedDate
    ? "Received date"
    : statusNeedsReturnedDate
      ? "Returned date"
      : statusIsShipping ||
          statusChangeStatus === "Lost" ||
          statusChangeStatus === "Damaged"
        ? "Sent date"
        : null;
  $: statusShowPrimaryDate = !!statusPrimaryDateLabel;
  $: statusShowTrackingPrimary = statusIsShipping;
  $: statusHasMoreDates =
    statusNeedsSentDate ||
    statusNeedsReceivedDate ||
    statusNeedsReturnedDate ||
    statusIsShipping;
  $: statusNeedsDelayRemark = needsDelayRemarkInput(statusChangeSample);

  function addEditItemRow() {
    editItems = [...editItems, blankItem()];
  }

  function removeEditItemRow(index) {
    if (editItems.length <= 1) {
      editItems = [blankItem()];
      return;
    }
    editItems = editItems.filter((_, i) => i !== index);
  }

  function getValidEditItems() {
    return editItems
      .map((it) => ({
        name: (it.name || "").trim(),
        quantity: (it.quantity || "").trim() || null,
        unit: (it.unit || "").trim() || null,
        note: (it.note || "").trim() || null,
      }))
      .filter((it) => it.name);
  }

  async function submitEdit() {
    formError = "";
    const validItems = getValidEditItems();
    if (!validItems.length) {
      formError = "Add at least one item with a name.";
      return;
    }
    const first = validItems[0];
    const ok = await updateSampleMovement(editSampleId, {
      direction: editDirection,
      tracking: editTracking.trim() || null,
      notes: editNotes.trim() || null,
      items: validItems,
      description: validItems.map((it) => it.name).join(", "),
      quantity: first.quantity
        ? `${first.quantity}${first.unit ? ` ${first.unit}` : ""}`
        : null,
      sentDate: editSentDate ? new Date(editSentDate).toISOString() : undefined,
      receivedDate: editReceivedDate
        ? new Date(editReceivedDate).toISOString()
        : undefined,
      requestedDate: editRequestedDate
        ? new Date(editRequestedDate).toISOString()
        : null,
      expectedDeliveryDate: editExpectedDeliveryDate
        ? new Date(editExpectedDeliveryDate).toISOString()
        : null,
      expectedReturnDate: editExpectedReturnDate
        ? new Date(editExpectedReturnDate).toISOString()
        : null,
      returnedDate: editReturnedDate
        ? new Date(editReturnedDate).toISOString()
        : null,
      followUpDate: editFollowUpDate
        ? new Date(editFollowUpDate).toISOString()
        : null,
    });
    if (ok !== false) closeEditModal();
  }

  async function submitStatusChange() {
    const sample = statusChangeSample;
    if (!sample || !statusSampleId) return;
    if (hasPendingDelayRemark(sample)) {
      statusChangeError =
        "A delay remark is pending approval. Wait until it is approved before changing status.";
      return;
    }
    if (statusNeedsHoldRemark && !statusChangeHoldRemark.trim()) {
      statusChangeError = 'Status "Hold" requires a remark.';
      return;
    }
    if (statusNeedsDelayRemark && !statusChangeDelayRemark.trim()) {
      statusChangeError = "This movement is overdue — add a delay remark.";
      return;
    }
    if (
      statusChangeFiles.length &&
      !IMAGE_STEP_OPTIONS.some((o) => o.value === statusChangeStep)
    ) {
      statusChangeError =
        "Select an image step (sample, before, after, packing, completed, dispatched).";
      return;
    }
    statusChangeError = "";

    /** @type {Record<string, any>} */
    const payload = {
      status: statusChangeStatus,
      delayRemark: statusChangeDelayRemark.trim() || undefined,
    };
    if (statusNeedsHoldRemark) {
      payload.remark = statusChangeHoldRemark.trim();
      payload.notes = statusChangeHoldRemark.trim();
    } else if (statusChangeNote.trim() && !statusChangeFiles.length) {
      payload.notes = statusChangeNote.trim();
    }
    if (statusNeedsSentDate && statusChangeSentDate) {
      payload.sentDate = new Date(statusChangeSentDate).toISOString();
    }
    if (statusNeedsReceivedDate && statusChangeReceivedDate) {
      payload.receivedDate = new Date(statusChangeReceivedDate).toISOString();
    }
    if (statusNeedsReturnedDate && statusChangeReturnedDate) {
      payload.returnedDate = new Date(statusChangeReturnedDate).toISOString();
    }
    if (statusShowTrackingPrimary || statusShowMoreDates) {
      if (statusChangeTracking.trim() || statusShowTrackingPrimary) {
        payload.tracking = statusChangeTracking.trim() || "";
      }
    }
    if (statusIsShipping && statusShowMoreDates) {
      if (statusChangeExpectedDelivery) {
        payload.expectedDeliveryDate = new Date(
          statusChangeExpectedDelivery,
        ).toISOString();
      }
      if (statusChangeExpectedReturn) {
        payload.expectedReturnDate = new Date(
          statusChangeExpectedReturn,
        ).toISOString();
      }
    }

    if (statusChangeFiles.length > 0) {
      payload.eventType = statusChangeStep;
      const eventNote = statusChangeNote.trim();
      if (eventNote) payload.eventNote = eventNote;
    }

    const ok = await changeSampleStatus(
      statusSampleId,
      payload,
      statusChangeFiles.map((x) => x.file),
    );
    if (ok !== false) {
      invalidateStepImages(statusSampleId);
      closeStatusModal();
    }
  }

  function movementBadgeClass(st) {
    if (st === "Received") return "bg-success";
    if (st === "Cancelled") return "bg-dark";
    if (st === "Returned") return "bg-info text-dark";
    if (st === "Lost" || st === "Damaged") return "bg-danger";
    if (st === "In Transit" || st === "Dispatched") return "bg-primary";
    if (st === "Hold") return "bg-warning text-dark";
    if (st === "Prepared") return "bg-secondary";
    if (st === "Pending") return "bg-light text-dark border";
    return "bg-warning text-dark";
  }

  function openDecisionModal(action) {
    if (!hasSampleCompany) {
      openCompanyModal();
      return;
    }
    if (!samples?.length) {
      decisionError = "";
      formError = "Add at least one sample before approve or reject.";
      openModal();
      return;
    }
    decisionAction = action;
    decisionNote = "";
    decisionError = "";
    showDecisionModal = true;
  }

  function closeDecisionModal() {
    showDecisionModal = false;
    decisionNote = "";
    decisionError = "";
  }

  async function submitDecision() {
    const note = decisionNote.trim();
    if (!note) {
      decisionError = "Decision note is required.";
      return;
    }
    decisionError = "";
    const ok = decisionIsApprove
      ? await approveSample(note)
      : await rejectSample(note);
    if (ok !== false) closeDecisionModal();
  }

  function clearEventFiles() {
    for (const item of eventFiles) {
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    eventFiles = [];
  }

  function openEventModal(sampleId) {
    const sample = (samples || []).find((s) => s.id === sampleId);
    if (hasPendingDelayRemark(sample)) return;
    eventSampleId = sampleId;
    eventNote = "";
    eventStep = nextImageStepForSample(sampleId);
    eventDelayRemark = "";
    clearEventFiles();
    eventError = "";
    showEventModal = true;
  }

  function addEventBlockedTitle(s) {
    if (!hasSampleCompany) return "Select company first";
    if (hasPendingDelayRemark(s)) {
      return "Delay remark pending approval — wait until approved";
    }
    return "Add note / images";
  }

  function mutateBlockedTitle(s, actionLabel) {
    if (!hasSampleCompany) return "Select company first";
    if (hasPendingDelayRemark(s)) {
      return "Delay remark pending approval — wait until approved";
    }
    return actionLabel;
  }

  function closeEventModal() {
    showEventModal = false;
    eventSampleId = null;
    eventNote = "";
    eventStep = "sample";
    eventDelayRemark = "";
    clearEventFiles();
    eventError = "";
  }

  function openEventFilePicker() {
    if (sampleSaving || eventFiles.length >= 10) return;
    eventFileInputEl?.click();
  }

  function appendEventFiles(fileList) {
    const picked = Array.from(fileList || []).filter(Boolean);
    if (!picked.length) return;
    const key = (f) => `${f.name}:${f.size}:${f.lastModified}`;
    const seen = new Set(eventFiles.map((x) => key(x.file)));
    const next = [...eventFiles];
    let dropped = 0;
    for (const f of picked) {
      if (seen.has(key(f))) continue;
      if (next.length >= 10) {
        dropped += 1;
        continue;
      }
      seen.add(key(f));
      next.push({
        file: f,
        previewUrl: f.type?.startsWith("image/")
          ? URL.createObjectURL(f)
          : "",
      });
    }
    eventFiles = next;
    eventError = dropped
      ? "Maximum 10 images per event. Extra files were skipped."
      : "";
  }

  function onEventFilesChange(e) {
    appendEventFiles(e.currentTarget?.files);
    e.currentTarget.value = "";
  }

  function onEventImagesDrop(e) {
    e.preventDefault();
    if (sampleSaving) return;
    appendEventFiles(e.dataTransfer?.files);
  }

  function removeEventFile(index) {
    const item = eventFiles[index];
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    eventFiles = eventFiles.filter((_, i) => i !== index);
    eventError = "";
  }

  async function submitEvent() {
    const note = eventNote.trim();
    const sample = (samples || []).find((s) => s.id === eventSampleId);
    if (hasPendingDelayRemark(sample)) {
      eventError =
        "A delay remark is pending approval. Wait until it is approved before adding further updates.";
      return;
    }
    if (!note && !eventFiles.length) {
      eventError = "Add a note and/or at least one image.";
      return;
    }
    if (eventFiles.length && !IMAGE_STEP_OPTIONS.some((o) => o.value === eventStep)) {
      eventError = "Select an image step (sample, before, after, packing, completed, dispatched).";
      return;
    }
    if (needsDelayRemarkInput(sample) && !eventDelayRemark.trim()) {
      eventError = "This movement is overdue — add a delay remark.";
      return;
    }
    eventError = "";
    const type = eventFiles.length
      ? eventStep
      : note
        ? "note"
        : eventStep;
    const ok = await addSampleEvent(
      eventSampleId,
      {
        note: note || undefined,
        type,
        delayRemark: eventDelayRemark.trim() || undefined,
      },
      eventFiles.map((x) => x.file),
    );
    if (ok !== false) {
      invalidateStepImages(eventSampleId);
      closeEventModal();
    }
  }

  function mediaUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    const base = (API_BASE_URL || "").replace(/\/$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  function formatEventTime(d) {
    if (!d) return "";
    return new Date(d).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  /** Lightbox items with event label / status / date / note. */
  function eventLightboxItems(ev) {
    const images = Array.isArray(ev?.images) ? ev.images : [];
    const date = formatEventTime(ev?.createdAt);
    const label = ev?.type || "event";
    const status = ev?.status || "";
    const note = ev?.note || "";
    return images
      .filter((x) => x?.url)
      .map((x) => ({
        url: mediaUrl(x.url),
        label,
        status,
        note,
        date,
      }));
  }

  function openEventLightbox(ev, imgIdx = 0) {
    const items = eventLightboxItems(ev);
    if (!items.length) return;
    openImageLightbox(items, imgIdx);
  }

  function addItemRow() {
    items = [...items, blankItem()];
  }

  function removeItemRow(index) {
    if (items.length <= 1) {
      items = [blankItem()];
      return;
    }
    items = items.filter((_, i) => i !== index);
  }

  function getValidItems() {
    return items
      .map((it) => ({
        name: (it.name || "").trim(),
        quantity: (it.quantity || "").toString().trim() || null,
        unit: (it.unit || "").trim() || null,
        note: (it.note || "").trim() || null,
      }))
      .filter((it) => it.name);
  }

  function formatItemsSummary(s) {
    const list = Array.isArray(s?.items) ? s.items.filter((it) => it?.name) : [];
    if (list.length) {
      return list
        .map((it) => {
          const qty = [it.quantity, it.unit].filter(Boolean).join(" ");
          return qty ? `${it.name} (${qty})` : it.name;
        })
        .join(", ");
    }
    if (s?.description) {
      return s.quantity ? `${s.description} (${s.quantity})` : s.description;
    }
    return "—";
  }

  async function submitMovement() {
    formError = "";
    const validItems = getValidItems();
    if (!validItems.length) {
      formError = "Add at least one item with a name.";
      return;
    }
    if (status === "Hold" && !notes.trim()) {
      formError = 'Status "Hold" requires a remark in Notes.';
      return;
    }

    const first = validItems[0];
    const ok = await addSampleMovement({
      direction,
      items: validItems,
      description: validItems.map((it) => it.name).join(", "),
      quantity: first.quantity
        ? `${first.quantity}${first.unit ? ` ${first.unit}` : ""}`
        : null,
      tracking: tracking.trim() || null,
      notes: notes.trim() || null,
      sentDate: sentDate ? new Date(sentDate).toISOString() : undefined,
      requestedDate: requestedDate
        ? new Date(requestedDate).toISOString()
        : undefined,
      expectedDeliveryDate: expectedDeliveryDate
        ? new Date(expectedDeliveryDate).toISOString()
        : undefined,
      expectedReturnDate: expectedReturnDate
        ? new Date(expectedReturnDate).toISOString()
        : undefined,
      followUpDate: followUpDate
        ? new Date(followUpDate).toISOString()
        : undefined,
      status,
    });
    if (ok !== false) closeModal();
  }

  function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" });
  }

  const EVENTS_PREVIEW = 3;
  const EVENT_FILTER_OPTIONS = [
    { value: "all", label: "All" },
    ...IMAGE_STEP_OPTIONS,
    { value: "note", label: "Note" },
    { value: "delay_remark", label: "Delay" },
  ];

  /** @type {Record<number, string>} */
  let eventFilterById = {};
  /** @type {Record<number, boolean>} */
  let eventsShowAllById = {};
  let sampleActionMenuId = null;

  function getEventFilter(sampleId) {
    return eventFilterById[sampleId] || "all";
  }

  function setEventFilter(sampleId, value) {
    eventFilterById = { ...eventFilterById, [sampleId]: value };
    // Reset collapse when filter changes
    eventsShowAllById = { ...eventsShowAllById, [sampleId]: false };
  }

  function filteredEvents(s, filter = getEventFilter(s?.id)) {
    const list = Array.isArray(s?.events) ? s.events : [];
    if (filter === "all") return list;
    return list.filter(
      (ev) => String(ev?.type || "").toLowerCase() === String(filter).toLowerCase(),
    );
  }

  /** Pass showAll/filter from template so Svelte re-runs when those maps change. */
  function visibleEvents(s, showAll = !!eventsShowAllById[s?.id], filter = getEventFilter(s?.id)) {
    const list = filteredEvents(s, filter);
    if (showAll) return list;
    return list.slice(0, EVENTS_PREVIEW);
  }

  function hiddenEventCount(s, filter = getEventFilter(s?.id)) {
    return Math.max(0, filteredEvents(s, filter).length - EVENTS_PREVIEW);
  }

  function toggleEventsExpanded(sampleId) {
    eventsShowAllById = {
      ...eventsShowAllById,
      [sampleId]: !eventsShowAllById[sampleId],
    };
  }

  function toggleSampleActionMenu(sampleId) {
    sampleActionMenuId = sampleActionMenuId === sampleId ? null : sampleId;
  }

  function closeSampleActionMenu() {
    sampleActionMenuId = null;
  }

  /** @type {Record<number, any[]>} */
  let stepImagesCache = {};
  /** @type {Record<number, boolean>} */
  let stepImagesLoading = {};

  function galleryFromStepApiItems(apiItems, movementStatus) {
    const items = [];
    const seen = new Set();
    for (const it of Array.isArray(apiItems) ? apiItems : []) {
      for (const img of Array.isArray(it?.images) ? it.images : []) {
        if (!img?.url || seen.has(img.url)) continue;
        seen.add(img.url);
        items.push({
          url: mediaUrl(img.url),
          label: it.step || "event",
          status: it.status || movementStatus || "",
          note: it.note || "",
          date: formatEventTime(it.createdAt),
        });
      }
    }
    return items;
  }

  /** Photos from events (fallback) or step-images API cache. */
  function samplePhotoGallery(s) {
    const cached = stepImagesCache[s?.id];
    if (cached) return galleryFromStepApiItems(cached, s.status);

    const items = [];
    const seen = new Set();
    for (const ev of Array.isArray(s?.events) ? s.events : []) {
      for (const img of Array.isArray(ev?.images) ? ev.images : []) {
        if (!img?.url || seen.has(img.url)) continue;
        seen.add(img.url);
        items.push({
          url: mediaUrl(img.url),
          label: ev.type || "event",
          status: ev.status || s.status || "",
          note: ev.note || "",
          date: formatEventTime(ev.createdAt),
        });
      }
    }
    return items;
  }

  async function ensureStepImages(sampleId) {
    if (!sampleId) return [];
    if (stepImagesCache[sampleId]) return stepImagesCache[sampleId];
    if (stepImagesLoading[sampleId]) return [];
    stepImagesLoading = { ...stepImagesLoading, [sampleId]: true };
    try {
      const res = await loadOrderSampleStepImages(sampleId);
      const items = res?.data?.items || [];
      stepImagesCache = { ...stepImagesCache, [sampleId]: items };
      return items;
    } catch (_) {
      return [];
    } finally {
      stepImagesLoading = { ...stepImagesLoading, [sampleId]: false };
    }
  }

  function invalidateStepImages(sampleId) {
    if (sampleId == null) {
      stepImagesCache = {};
      return;
    }
    const next = { ...stepImagesCache };
    delete next[sampleId];
    stepImagesCache = next;
  }

  async function openSamplePhotoGallery(s, imgIdx = 0) {
    const raw = await ensureStepImages(s.id);
    const items = galleryFromStepApiItems(raw, s.status);
    if (!items.length) {
      // Rebuild fallback without using cache (empty API)
      const fallback = [];
      const seen = new Set();
      for (const ev of Array.isArray(s?.events) ? s.events : []) {
        for (const img of Array.isArray(ev?.images) ? ev.images : []) {
          if (!img?.url || seen.has(img.url)) continue;
          seen.add(img.url);
          fallback.push({
            url: mediaUrl(img.url),
            label: ev.type || "event",
            status: ev.status || s.status || "",
            note: ev.note || "",
            date: formatEventTime(ev.createdAt),
          });
        }
      }
      if (!fallback.length) return;
      openImageLightbox(fallback, imgIdx);
      return;
    }
    openImageLightbox(items, imgIdx);
  }

  function onEventRowClick(ev) {
    if (Array.isArray(ev?.images) && ev.images.length) {
      openEventLightbox(ev, 0);
    }
  }

  // Prefetch step-images when samples list is shown
  $: if (Array.isArray(samples) && samples.length) {
    for (const s of samples) {
      if (s?.id && !stepImagesCache[s.id] && !stepImagesLoading[s.id]) {
        ensureStepImages(s.id);
      }
    }
  }

  function nextStepHint(s) {
    if (!hasSampleCompany) return "Select company first.";
    if (hasPendingDelayRemark(s)) {
      return "Delay remark pending approval — wait until approved.";
    }
    if (needsDelayRemarkInput(s)) {
      return "Overdue — change status and add a delay remark.";
    }
    const next = nextMovementStatus(s.status);
    if (next && next !== s.status) {
      return `Next: Change status → ${next}`;
    }
    const step = suggestedStepForStatus(s.status);
    if (!(s.events || []).length) {
      return `Next: Add ${step} photos or a note.`;
    }
    return `Next: Add ${step} photos, or update status if needed.`;
  }

  $: anySamplePendingDelay = (samples || []).some((s) => hasPendingDelayRemark(s));
  $: anySampleOverdue = (samples || []).some((s) => needsDelayRemarkInput(s));
</script>

<svelte:window
  on:click={() => {
    if (sampleActionMenuId != null) closeSampleActionMenu();
  }}
/>

<div class="card">
  <div class="card-header d-flex align-items-center justify-content-between flex-wrap gap-2 py-2">
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <h6 class="mb-0">
        <i class="ti ti-package-export me-2 text-primary"></i>Samples
      </h6>
      {#if order?.isSample}
        <span class="badge {decisionCls}" style="font-size:10px;">
          {order.sampleDecision || "Pending"}
        </span>
        {#if order?.sampleCode}
          <span class="badge bg-light text-dark border" style="font-size:10px;">
            {order.sampleCode}
          </span>
        {/if}
        {#if sampleCompany}
          <span
            class="badge bg-primary-subtle text-primary border border-primary-subtle"
            style="font-size:10px;"
            title="Sample company"
          >
            <i class="ti ti-building me-1"></i>{sampleCompany}
          </span>
        {:else if canMutateOrder && !decided}
          <button
            type="button"
            class="btn btn-sm btn-outline-warning py-0 px-2"
            style="font-size:11px;"
            disabled={sampleSaving}
            on:click={openCompanyModal}
          >
            <i class="ti ti-building me-1"></i>Select company
          </button>
        {:else}
          <span class="badge bg-warning-subtle text-warning border" style="font-size:10px;">
            Select company
          </span>
        {/if}
        {#if canMutateOrder && !decided && hasSampleCompany}
          <button
            type="button"
            class="btn btn-link btn-sm p-0 text-decoration-none"
            title="Change sample company"
            disabled={sampleSaving}
            on:click={openCompanyModal}
          >
            <i class="ti ti-pencil" style="font-size:14px;"></i>
          </button>
        {/if}
      {/if}
    </div>
    {#if canMutateOrder}
      <div class="form-check form-switch mb-0">
        <input
          class="form-check-input"
          type="checkbox"
          id="isSampleToggle"
          checked={!!order?.isSample}
          disabled={sampleSaving || order?.sampleDecision === "Approved"}
          on:change={async (e) => {
            const next = e.currentTarget.checked;
            if (!next) {
              pendingEnableSample = false;
              const ok = await setSampleFlag(false);
              if (ok === false) e.currentTarget.checked = !!order?.isSample;
              return;
            }

            // Enable sample → company must be set, then Add sample
            const companyId =
              order?.sampleCompanyId != null
                ? Number(order.sampleCompanyId)
                : defaultSampleCompanyId;

            if (companyId == null) {
              // Don't enable yet — pick company first
              e.currentTarget.checked = false;
              pendingEnableSample = true;
              openCompanyModal();
              return;
            }

            const ok = await setSampleFlag(true, companyId);
            if (ok === false) {
              e.currentTarget.checked = !!order?.isSample;
              return;
            }
            openModal();
          }}
        />
        <label class="form-check-label" for="isSampleToggle" style="font-size:13px;">
          Sample case
        </label>
      </div>
    {/if}
  </div>

  <div class="card-body">
    {#if !order?.isSample}
      <div class="text-center py-4 text-muted">
        <i class="ti ti-package-off" style="font-size:2rem;"></i>
        <p class="mt-2 mb-0">
          Turn on <strong>Sample case</strong> to log send/receive and approve or reject.
        </p>
      </div>
    {:else}
      {#if order?.sampleDecision === "Approved"}
        <div class="alert alert-success py-2 mb-3" style="font-size:13px;">
          Sample approved — order status set to <strong>Qualified</strong>.
          {#if order.sampleDecisionNote}
            <div class="mt-1 text-muted">{order.sampleDecisionNote}</div>
          {/if}
        </div>
      {:else if order?.sampleDecision === "Rejected"}
        <div class="alert alert-danger py-2 mb-3" style="font-size:13px;">
          Sample rejected — order status set to <strong>Unqualified</strong>.
          {#if order.sampleDecisionNote}
            <div class="mt-1 text-muted">{order.sampleDecisionNote}</div>
          {/if}
        </div>
      {:else if canMutateOrder}
        <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3 p-2 border rounded bg-light">
          <div class="text-muted" style="font-size:12px;">
            {#if !hasSampleCompany}
              Select company before you can add a sample or approve / reject.
            {:else if anySamplePendingDelay}
              A delay remark is pending approval — status / photos stay locked until approved.
            {:else if anySampleOverdue}
              A sample is overdue — change status and add a delay remark before more updates.
            {:else if !samples?.length}
              Add at least one sample before you can approve or reject.
            {:else}
              Final sample decision — opens a form for a required review note.
            {/if}
          </div>
          <div class="d-flex flex-wrap gap-2">
            {#if !hasSampleCompany}
              <button
                class="btn btn-warning btn-sm"
                disabled={sampleSaving}
                on:click={openCompanyModal}
              >
                <i class="ti ti-building me-1"></i>Select company
              </button>
            {/if}
            <button
              class="btn btn-success btn-sm"
              disabled={sampleSaving || !hasSampleCompany || !samples?.length || anySamplePendingDelay}
              title={anySamplePendingDelay
                ? "Delay remark pending approval"
                : !hasSampleCompany
                  ? "Select company first"
                  : !samples?.length
                    ? "Add a sample first"
                    : "Approve sample"}
              on:click={() => openDecisionModal("approve")}
            >
              <i class="ti ti-check me-1"></i>Approve → Qualified
            </button>
            <button
              class="btn btn-outline-danger btn-sm"
              disabled={sampleSaving || !hasSampleCompany || !samples?.length || anySamplePendingDelay}
              title={anySamplePendingDelay
                ? "Delay remark pending approval"
                : !hasSampleCompany
                  ? "Select company first"
                  : !samples?.length
                    ? "Add a sample first"
                    : "Reject sample"}
              on:click={() => openDecisionModal("reject")}
            >
              <i class="ti ti-x me-1"></i>Reject → Unqualified
            </button>
          </div>
        </div>
      {/if}

      <div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
        <div class="d-flex flex-wrap align-items-center gap-1" style="font-size:12px;">
          {#if order?.sampleCode}
            <span class="badge bg-light text-dark border" style="font-size:10px;">{order.sampleCode}</span>
          {/if}
          {#if sampleCompany}
            <span
              class="badge bg-primary-subtle text-primary border border-primary-subtle"
              style="font-size:10px;"
            >
              <i class="ti ti-building me-1"></i>{sampleCompany}
            </span>
            {#if canMutateOrder && !decided}
              <button
                type="button"
                class="btn btn-link btn-sm p-0"
                title="Change company"
                disabled={sampleSaving}
                on:click={openCompanyModal}
              >
                <i class="ti ti-pencil" style="font-size:13px;"></i>
              </button>
            {/if}
          {:else}
            <button
              type="button"
              class="btn btn-sm btn-outline-warning py-0 px-2"
              style="font-size:11px;"
              disabled={!canMutateOrder || decided || sampleSaving}
              on:click={openCompanyModal}
            >
              <i class="ti ti-building me-1"></i>Select company
            </button>
          {/if}
          <span class="text-muted ms-1">Outbound = company → client · Inbound = client → company</span>
        </div>
        {#if canMutateOrder && !decided}
          <button
            class="btn btn-primary btn-sm"
            on:click={() => {
              if (!hasSampleCompany) {
                openCompanyModal();
                return;
              }
              openModal();
            }}
            disabled={sampleSaving || !hasSampleCompany}
            title={!hasSampleCompany ? "Select company first" : "Add sample"}
          >
            <i class="ti ti-plus me-1"></i>Add sample
          </button>
        {/if}
      </div>

      {#if loadingSamples}
        <div class="text-center py-4">
          <span class="spinner-border spinner-border-sm text-primary"></span>
        </div>
      {:else if samples.length === 0}
        <div class="text-center py-4 text-muted">
          <i class="ti ti-package" style="font-size:2rem;"></i>
          {#if !hasSampleCompany}
            <p class="mt-2 mb-2">Select company <span class="text-danger">*</span> first.</p>
            {#if canMutateOrder && !decided}
              <button
                class="btn btn-warning btn-sm"
                on:click={openCompanyModal}
                disabled={sampleSaving}
              >
                <i class="ti ti-building me-1"></i>Select company
              </button>
            {/if}
          {:else}
            <p class="mt-2 mb-2">Add at least one sample <span class="text-danger">*</span> (required).</p>
            {#if canMutateOrder && !decided && hasSampleCompany}
              <button
                class="btn btn-primary btn-sm"
                on:click={openModal}
                disabled={sampleSaving}
              >
                <i class="ti ti-plus me-1"></i>Add sample
              </button>
            {/if}
          {/if}
        </div>
      {:else}
        <div class="table-responsive">
          <table class="table table-hover table-sm mb-0">
            <thead class="table-light">
              <tr>
                <th>#</th>
                <th>Direction</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Received</th>
                <th>Items</th>
                <th>Tracking</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each samples as s, i}
                <tr>
                  <td>{i + 1}</td>
                  <td>
                    <span
                      class="badge {s.direction === 'Outbound' ? 'bg-info' : 'bg-secondary'}"
                      style="font-size:10px;"
                    >
                      {s.direction}
                    </span>
                  </td>
                  <td>
                    <div class="d-flex flex-wrap align-items-center gap-1">
                      {#if canMutateOrder && !decided}
                        <button
                          type="button"
                          class="badge {movementBadgeClass(s.status)} border-0"
                          style="font-size:10px; cursor:pointer;"
                          title={mutateBlockedTitle(s, "Change status")}
                          disabled={sampleSaving || !hasSampleCompany || hasPendingDelayRemark(s)}
                          on:click={() => {
                            if (!hasSampleCompany) {
                              openCompanyModal();
                              return;
                            }
                            openStatusModal(s);
                          }}
                        >
                          {s.status}
                        </button>
                      {:else}
                        <span
                          class="badge {movementBadgeClass(s.status)}"
                          style="font-size:10px;"
                        >
                          {s.status}
                        </span>
                      {/if}
                      {#if s.sentDelay?.delayed && s.sentDelay?.label}
                        <span
                          class="badge bg-danger"
                          style="font-size:9px;"
                          title="Still Pending more than 2 days after creation"
                        >
                          {s.sentDelay.label}
                        </span>
                      {/if}
                      {#if s.delayRemarkStatus}
                        <span
                          class="badge"
                          class:bg-warning={String(s.delayRemarkStatus).toLowerCase() === "pending"}
                          class:text-dark={String(s.delayRemarkStatus).toLowerCase() === "pending"}
                          class:bg-success={String(s.delayRemarkStatus).toLowerCase() === "approved"}
                          style="font-size:9px;"
                        >
                          delay {s.delayRemarkStatus}
                        </span>
                      {/if}
                    </div>
                  </td>
                  <td style="font-size:12px; white-space:nowrap;">{formatDate(s.sentDate)}</td>
                  <td style="font-size:12px; white-space:nowrap;">{formatDate(s.receivedDate)}</td>
                  <td style="font-size:12px; max-width:280px;">
                    {#if Array.isArray(s.items) && s.items.filter((it) => it?.name).length}
                      <ul class="mb-0 ps-3" style="font-size:12px;">
                        {#each s.items.filter((it) => it?.name) as it}
                          <li>
                            {it.name}
                            {#if it.quantity || it.unit}
                              <span class="text-muted">
                                ({[it.quantity, it.unit].filter(Boolean).join(" ")})
                              </span>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      {formatItemsSummary(s)}
                    {/if}
                  </td>
                  <td style="font-size:12px;">{s.tracking || "—"}</td>
                  <td class="text-end text-nowrap">
                    <button
                      class="btn btn-sm btn-outline-primary p-0 px-1 me-1"
                      title="View sample details"
                      on:click={() => openViewModal(s)}
                    >
                      <i class="ti ti-eye" style="font-size:13px;"></i>
                    </button>
                    {#if canMutateOrder && !decided}
                      <button
                        class="btn btn-sm btn-outline-warning p-0 px-1 me-1"
                        title={mutateBlockedTitle(s, "Change status")}
                        disabled={sampleSaving || !hasSampleCompany || hasPendingDelayRemark(s)}
                        on:click={() => {
                          if (!hasSampleCompany) {
                            openCompanyModal();
                            return;
                          }
                          openStatusModal(s);
                        }}
                      >
                        <i class="ti ti-arrows-exchange" style="font-size:13px;"></i>
                        <span class="d-none d-xl-inline ms-1" style="font-size:11px;">Status</span>
                      </button>
                    {/if}
                    {#if canMutateOrder}
                      <div class="dropdown d-inline-block" on:click|stopPropagation>
                        <button
                          class="btn btn-sm btn-outline-secondary p-0 px-1"
                          title="More actions"
                          disabled={sampleSaving}
                          on:click={() => toggleSampleActionMenu(s.id)}
                        >
                          <i class="ti ti-dots-vertical" style="font-size:13px;"></i>
                        </button>
                        {#if sampleActionMenuId === s.id}
                          <div class="sample-action-menu dropdown-menu show">
                            <button
                              type="button"
                              class="dropdown-item"
                              disabled={!hasSampleCompany || hasPendingDelayRemark(s)}
                              on:click={() => {
                                closeSampleActionMenu();
                                if (!hasSampleCompany) {
                                  openCompanyModal();
                                  return;
                                }
                                openEditModal(s);
                              }}
                            >
                              <i class="ti ti-pencil me-2"></i>Edit details
                            </button>
                            <button
                              type="button"
                              class="dropdown-item"
                              disabled={!hasSampleCompany || hasPendingDelayRemark(s)}
                              on:click={() => {
                                closeSampleActionMenu();
                                if (!hasSampleCompany) {
                                  openCompanyModal();
                                  return;
                                }
                                openEventModal(s.id);
                              }}
                            >
                              <i class="ti ti-photo-plus me-2"></i>Add note / images
                            </button>
                            {#if !decided}
                              <button
                                type="button"
                                class="dropdown-item text-danger"
                                on:click={() => {
                                  closeSampleActionMenu();
                                  deleteSampleMovement(s.id);
                                }}
                              >
                                <i class="ti ti-trash me-2"></i>Delete
                              </button>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </td>
                </tr>
                <tr class="sample-events-row">
                  <td colspan="8" class="bg-light">
                    <div class="sample-events-list">
                      {#if canMutateOrder && !decided}
                        <div class="sample-next-hint mb-2">
                          <i class="ti ti-arrow-right me-1"></i>{nextStepHint(s)}
                        </div>
                      {/if}

                      {#each [samplePhotoGallery(s)] as gallery}
                        {#if gallery.length}
                          <div class="mb-2">
                            <div class="d-flex align-items-center justify-content-between mb-1">
                              <div class="text-muted" style="font-size:11px; font-weight:600;">
                                Photos
                                <span class="badge bg-primary ms-1" style="font-size:9px;">{gallery.length}</span>
                              </div>
                            </div>
                            <div class="d-flex flex-wrap gap-2">
                              {#each gallery.slice(0, 8) as img, imgIdx}
                                <button
                                  type="button"
                                  class="sample-event-thumb-btn"
                                  title="{img.label}{img.note ? ` — ${img.note}` : ''}"
                                  on:click={() => openSamplePhotoGallery(s, imgIdx)}
                                >
                                  <img
                                    src={img.url}
                                    alt={img.label || "sample"}
                                    class="sample-event-thumb"
                                  />
                                </button>
                              {/each}
                              {#if gallery.length > 8}
                                <button
                                  type="button"
                                  class="sample-event-thumb-more"
                                  on:click={() => openSamplePhotoGallery(s, 8)}
                                >
                                  +{gallery.length - 8}
                                </button>
                              {/if}
                            </div>
                          </div>
                        {/if}
                      {/each}

                      <div class="d-flex align-items-center justify-content-between mb-1 flex-wrap gap-2">
                        <div class="d-flex flex-wrap align-items-center gap-2">
                          <span class="text-muted" style="font-size:11px; font-weight:600;">
                            Events
                            {#if Array.isArray(s.events) && s.events.length}
                              <span class="badge bg-secondary ms-1" style="font-size:9px;">
                                {filteredEvents(s).length}{getEventFilter(s.id) !== "all"
                                  ? ` / ${s.events.length}`
                                  : ""}
                              </span>
                            {/if}
                          </span>
                          {#if Array.isArray(s.events) && s.events.length}
                            <select
                              class="form-select form-select-sm sample-event-filter"
                              value={getEventFilter(s.id)}
                              on:change={(e) => setEventFilter(s.id, e.currentTarget.value)}
                            >
                              {#each EVENT_FILTER_OPTIONS as opt}
                                <option value={opt.value}>{opt.label}</option>
                              {/each}
                            </select>
                          {/if}
                        </div>
                        {#if canMutateOrder}
                          <button
                            type="button"
                            class="btn btn-sm btn-link p-0"
                            style="font-size:12px;"
                            disabled={sampleSaving || !hasSampleCompany || hasPendingDelayRemark(s)}
                            title={addEventBlockedTitle(s)}
                            on:click={() => {
                              if (!hasSampleCompany) {
                                openCompanyModal();
                                return;
                              }
                              openEventModal(s.id);
                            }}
                          >
                            + Add note / images
                          </button>
                        {/if}
                      </div>

                      {#if Array.isArray(s.events) && s.events.length}
                        {#if filteredEvents(s, eventFilterById[s.id] || "all").length}
                          {#each visibleEvents(s, !!eventsShowAllById[s.id], eventFilterById[s.id] || "all") as ev}
                            <div
                              class="sample-event-item"
                              class:sample-event-item--delay={String(ev.type || "").toLowerCase() === "delay_remark"}
                              class:sample-event-item--clickable={Array.isArray(ev.images) && ev.images.length}
                              role={Array.isArray(ev.images) && ev.images.length ? "button" : undefined}
                              tabindex={Array.isArray(ev.images) && ev.images.length ? 0 : undefined}
                              on:click={() => onEventRowClick(ev)}
                              on:keydown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onEventRowClick(ev);
                                }
                              }}
                            >
                              <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
                                <span
                                  class="badge"
                                  class:bg-warning={String(ev.type || "").toLowerCase() === "delay_remark"}
                                  class:text-dark={String(ev.type || "").toLowerCase() === "delay_remark"}
                                  class:bg-secondary={String(ev.type || "").toLowerCase() !== "delay_remark"}
                                  style="font-size:9px;"
                                >
                                  {ev.type || "update"}
                                </span>
                                {#if ev.status}
                                  <span
                                    class="badge border"
                                    class:bg-success={String(ev.status).toLowerCase() === "approved"}
                                    class:text-white={String(ev.status).toLowerCase() === "approved"}
                                    class:bg-light={String(ev.status).toLowerCase() !== "approved"}
                                    class:text-dark={String(ev.status).toLowerCase() !== "approved"}
                                    style="font-size:9px;"
                                  >
                                    {ev.status}
                                  </span>
                                {/if}
                                <span class="text-muted" style="font-size:11px;">{formatEventTime(ev.createdAt)}</span>
                                {#if canManageDelayRemarks &&
                                  String(ev.type || "").toLowerCase() === "delay_remark" &&
                                  String(ev.status || "").toLowerCase() === "pending"}
                                  <button
                                    type="button"
                                    class="btn btn-sm btn-outline-success py-0 px-2"
                                    style="font-size:11px;"
                                    disabled={sampleSaving}
                                    on:click|stopPropagation={() => approveDelayRemark(ev.id)}
                                  >
                                    Approve delay
                                  </button>
                                {/if}
                              </div>
                              {#if ev.note}
                                <div style="font-size:12px;">{ev.note}</div>
                              {/if}
                              {#if Array.isArray(ev.images) && ev.images.length}
                                <div class="d-flex flex-wrap gap-2 mt-1">
                                  {#each ev.images as img, imgIdx}
                                    <button
                                      type="button"
                                      class="sample-event-thumb-btn"
                                      title="View full image"
                                      on:click|stopPropagation={() => openEventLightbox(ev, imgIdx)}
                                    >
                                      <img
                                        src={mediaUrl(img.url)}
                                        alt={img.fileName || "sample"}
                                        class="sample-event-thumb"
                                      />
                                    </button>
                                  {/each}
                                </div>
                              {/if}
                            </div>
                          {/each}
                          {#if !eventsShowAllById[s.id] && hiddenEventCount(s, eventFilterById[s.id] || "all") > 0}
                            <button
                              type="button"
                              class="btn btn-sm btn-link p-0"
                              style="font-size:12px;"
                              on:click={() => toggleEventsExpanded(s.id)}
                            >
                              Show {hiddenEventCount(s, eventFilterById[s.id] || "all")} more
                            </button>
                          {:else if eventsShowAllById[s.id] && filteredEvents(s, eventFilterById[s.id] || "all").length > EVENTS_PREVIEW}
                            <button
                              type="button"
                              class="btn btn-sm btn-link p-0"
                              style="font-size:12px;"
                              on:click={() => toggleEventsExpanded(s.id)}
                            >
                              Show less
                            </button>
                          {/if}
                        {:else}
                          <div class="text-muted" style="font-size:12px;">
                            No events match this filter.
                          </div>
                        {/if}
                      {:else}
                        <div class="text-muted" style="font-size:12px;">
                          No events yet. Use <strong>Add note / images</strong> or Change status with photos.
                        </div>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if showCompanyModal}
  <div
    id="sampleCompanyModal"
    class="modal fade show d-block sample-company-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content sample-company-modal-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti ti-building text-primary"></i>
            <span>Change sample company</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={closeCompanyModal}
            aria-label="Close"
          ></button>
        </div>
        <div class="modal-body">
          {#if order?.sampleCode}
            <div class="text-muted mb-2" style="font-size:12px;">
              Current code: <strong class="text-dark">{order.sampleCode}</strong>
              <span class="text-muted"> — will update to match the new company</span>
            </div>
          {/if}
          <label class="form-label" for="editSampleCompany">Company</label>
          <TypeableSelect
            id="editSampleCompany"
            objectMode={true}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            value={editCompanyId}
            placeholder="Select company..."
            dropdownParent="#sampleCompanyModal"
            on:change={(e) => {
              editCompanyId = e.detail;
              companyModalError = "";
            }}
          />
          {#if companyModalError}
            <div class="text-danger mt-2" style="font-size:12px;">{companyModalError}</div>
          {/if}
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-secondary"
            disabled={sampleSaving}
            on:click={closeCompanyModal}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={sampleSaving || editCompanyId == null}
            on:click={saveSampleCompany}
          >
            {#if sampleSaving}
              <span class="spinner-border spinner-border-sm me-1"></span>
            {/if}
            Save company
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showModal}
  <div
    class="modal fade show d-block sample-add-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
      <div class="modal-content sample-add-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti ti-package text-danger"></i>
            <span>Add sample{#if !samples?.length} <span class="text-danger">*</span>{/if}</span>
          </h5>
          <button type="button" class="btn-close" on:click={closeModal} aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <div class="row g-3 mb-3">
            <div class="col-md-3">
              <label class="sample-label" for="sampleDirection">Direction</label>
              <select id="sampleDirection" class="form-select" bind:value={direction}>
                <option value="Outbound">Outbound (to client)</option>
                <option value="Inbound">Inbound (from client)</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleStatus">Status</label>
              <select id="sampleStatus" class="form-select" bind:value={status}>
                {#each MOVEMENT_STATUS_OPTIONS as st}
                  <option value={st}>{st}</option>
                {/each}
              </select>
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleSentDate">Sent date</label>
              <input id="sampleSentDate" type="date" class="form-control" bind:value={sentDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleTracking">Tracking</label>
              <input
                id="sampleTracking"
                type="text"
                class="form-control"
                bind:value={tracking}
                placeholder="Courier / AWB"
              />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleRequestedDate">Requested</label>
              <input id="sampleRequestedDate" type="date" class="form-control" bind:value={requestedDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleEtaDate">Expected delivery</label>
              <input id="sampleEtaDate" type="date" class="form-control" bind:value={expectedDeliveryDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleExpectedReturnDate">Expected return</label>
              <input id="sampleExpectedReturnDate" type="date" class="form-control" bind:value={expectedReturnDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="sampleFollowUpDate">Follow-up</label>
              <input id="sampleFollowUpDate" type="date" class="form-control" bind:value={followUpDate} />
            </div>
          </div>

          <div class="d-flex align-items-center justify-content-between mb-2">
            <label class="sample-label mb-0">Items</label>
            <button type="button" class="btn btn-sm btn-outline-primary sample-add-item-btn" on:click={addItemRow}>
              <i class="ti ti-plus me-1"></i>Add item
            </button>
          </div>

          <div class="sample-items-panel mb-3">
            <div class="sample-items-head d-none d-md-grid">
              <span>Item name</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Note</span>
              <span></span>
            </div>
            {#each items as item, idx}
              <div class="sample-items-row">
                <div>
                  <label class="sample-label d-md-none">Item name</label>
                  <input
                    class="form-control"
                    bind:value={item.name}
                    placeholder="e.g. Mushroom Valve"
                  />
                </div>
                <div>
                  <label class="sample-label d-md-none">Qty</label>
                  <input class="form-control" bind:value={item.quantity} placeholder="1" />
                </div>
                <div>
                  <label class="sample-label d-md-none">Unit</label>
                  <select class="form-select" bind:value={item.unit}>
                    {#each UNIT_OPTIONS as u}
                      <option value={u}>{u}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label class="sample-label d-md-none">Note</label>
                  <input class="form-control" bind:value={item.note} placeholder="Optional" />
                </div>
                <div class="sample-items-actions">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    title="Remove item"
                    on:click={() => removeItemRow(idx)}
                  >
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              </div>
            {/each}
          </div>

          <div class="mb-1">
            <label class="sample-label" for="sampleNotes">Notes / Hold remark</label>
            <input
              id="sampleNotes"
              type="text"
              class="form-control"
              bind:value={notes}
              placeholder="Shipment notes (required for Hold)"
            />
          </div>

          {#if formError}
            <div class="text-danger mt-2" style="font-size:12px;">{formError}</div>
          {/if}
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={closeModal} disabled={sampleSaving}>
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={sampleSaving}
            on:click={submitMovement}
          >
            {sampleSaving ? "Saving…" : "Save sample"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showDecisionModal}
  <div
    class="modal fade show d-block sample-add-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content sample-add-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti {decisionIsApprove ? 'ti-check text-success' : 'ti-x text-danger'}"></i>
            <span>{decisionIsApprove ? "Approve sample" : "Reject sample"}</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={closeDecisionModal}
            aria-label="Close"
            disabled={sampleSaving}
          ></button>
        </div>

        <div class="modal-body">
          <p class="text-muted mb-3" style="font-size:13px;">
            {#if decisionIsApprove}
              This will set sample decision to <strong>Approved</strong> and order status to
              <strong>Qualified</strong>.
            {:else}
              This will set sample decision to <strong>Rejected</strong> and order status to
              <strong>Unqualified</strong>.
            {/if}
          </p>
          <label class="sample-label" for="sampleDecisionNote">Decision note <span class="text-danger">*</span></label>
          <textarea
            id="sampleDecisionNote"
            class="form-control"
            rows="4"
            bind:value={decisionNote}
            placeholder="Review note…"
            disabled={sampleSaving}
            on:input={() => (decisionError = "")}
          ></textarea>
          {#if decisionError}
            <div class="text-danger mt-2" style="font-size:12px;">{decisionError}</div>
          {/if}
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-light"
            on:click={closeDecisionModal}
            disabled={sampleSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn {decisionIsApprove ? 'btn-success' : 'btn-danger'}"
            disabled={sampleSaving || !decisionNote.trim()}
            on:click={submitDecision}
          >
            {#if sampleSaving}
              Saving…
            {:else if decisionIsApprove}
              Confirm approve
            {:else}
              Confirm reject
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showEditModal}
  <div
    class="modal fade show d-block sample-add-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
      <div class="modal-content sample-add-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti ti-pencil text-secondary"></i>
            <span>Edit sample</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={closeEditModal}
            aria-label="Close"
            disabled={sampleSaving}
          ></button>
        </div>
        <div class="modal-body">
          <div class="row g-3 mb-3">
            <div class="col-md-3">
              <label class="sample-label" for="editDirection">Direction</label>
              <select id="editDirection" class="form-select" bind:value={editDirection}>
                <option value="Outbound">Outbound</option>
                <option value="Inbound">Inbound</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="editSentDate">Sent date</label>
              <input id="editSentDate" type="date" class="form-control" bind:value={editSentDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="editReceivedDate">Received date</label>
              <input id="editReceivedDate" type="date" class="form-control" bind:value={editReceivedDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="editRequestedDate">Requested date</label>
              <input id="editRequestedDate" type="date" class="form-control" bind:value={editRequestedDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="editExpectedDeliveryDate">Expected delivery</label>
              <input id="editExpectedDeliveryDate" type="date" class="form-control" bind:value={editExpectedDeliveryDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="editExpectedReturnDate">Expected return</label>
              <input id="editExpectedReturnDate" type="date" class="form-control" bind:value={editExpectedReturnDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="editReturnedDate">Returned date</label>
              <input id="editReturnedDate" type="date" class="form-control" bind:value={editReturnedDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="editFollowUpDate">Follow-up date</label>
              <input id="editFollowUpDate" type="date" class="form-control" bind:value={editFollowUpDate} />
            </div>
            <div class="col-md-3">
              <label class="sample-label" for="editTracking">Tracking</label>
              <input
                id="editTracking"
                type="text"
                class="form-control"
                bind:value={editTracking}
                placeholder="Courier / AWB"
              />
            </div>
          </div>

          <div class="d-flex align-items-center justify-content-between mb-2">
            <label class="sample-label mb-0">Items</label>
            <button type="button" class="btn btn-sm btn-outline-primary sample-add-item-btn" on:click={addEditItemRow}>
              <i class="ti ti-plus me-1"></i>Add item
            </button>
          </div>

          <div class="sample-items-panel mb-3">
            <div class="sample-items-head d-none d-md-grid">
              <span>Item name</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Note</span>
              <span></span>
            </div>
            {#each editItems as item, idx}
              <div class="sample-items-row">
                <div>
                  <label class="sample-label d-md-none">Item name</label>
                  <input
                    class="form-control"
                    bind:value={item.name}
                    placeholder="e.g. Mushroom Valve"
                  />
                </div>
                <div>
                  <label class="sample-label d-md-none">Qty</label>
                  <input class="form-control" bind:value={item.quantity} placeholder="1" />
                </div>
                <div>
                  <label class="sample-label d-md-none">Unit</label>
                  <select class="form-select" bind:value={item.unit}>
                    {#each UNIT_OPTIONS as u}
                      <option value={u}>{u}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label class="sample-label d-md-none">Note</label>
                  <input class="form-control" bind:value={item.note} placeholder="Optional" />
                </div>
                <div class="sample-items-actions">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    title="Remove item"
                    on:click={() => removeEditItemRow(idx)}
                  >
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              </div>
            {/each}
          </div>

          <div class="mb-1">
            <label class="sample-label" for="editNotes">Notes</label>
            <textarea
              id="editNotes"
              class="form-control"
              rows="2"
              bind:value={editNotes}
              placeholder="Shipment notes"
            ></textarea>
          </div>
          {#if formError && showEditModal}
            <div class="text-danger mt-2" style="font-size:12px;">{formError}</div>
          {/if}
          <p class="text-muted mt-3 mb-0" style="font-size:12px;">
            Change movement status via the <strong>status</strong> button on the sample row. Photos via <strong>Add note / images</strong>.
          </p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={closeEditModal} disabled={sampleSaving}>
            Cancel
          </button>
          <button type="button" class="btn btn-primary" disabled={sampleSaving} on:click={submitEdit}>
            {sampleSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showStatusModal}
  <div
    class="modal fade show d-block sample-add-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable" role="document">
      <div class="modal-content sample-add-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti ti-arrows-exchange text-warning"></i>
            <span>Change status</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={closeStatusModal}
            aria-label="Close"
            disabled={sampleSaving}
          ></button>
        </div>
        <div class="modal-body">
          {#if statusChangeSample}
            <p class="text-muted mb-3" style="font-size:12px;">
              Current:
              <span class="badge {movementBadgeClass(statusChangeSample.status)} ms-1">
                {statusChangeSample.status}
              </span>
              <span class="text-muted ms-1">→</span>
              <span class="badge {movementBadgeClass(statusChangeStatus)} ms-1">
                {statusChangeStatus}
              </span>
            </p>
          {/if}

          <div class="sample-status-section mb-3">
            <div class="sample-status-section-title">Status</div>
            <div class="mb-3">
              <label class="sample-label" for="statusChangeStatus">New status</label>
              <select
                id="statusChangeStatus"
                class="form-select"
                bind:value={statusChangeStatus}
                on:change={onStatusChangeSelect}
              >
                {#each MOVEMENT_STATUS_OPTIONS as st}
                  <option value={st}>{st}</option>
                {/each}
              </select>
            </div>

            {#if statusNeedsHoldRemark}
              <div class="mb-0">
                <label class="sample-label" for="statusChangeHoldRemark">Hold remark *</label>
                <textarea
                  id="statusChangeHoldRemark"
                  class="form-control"
                  rows="2"
                  bind:value={statusChangeHoldRemark}
                  placeholder="Why is this sample on hold?"
                ></textarea>
              </div>
            {:else}
              <div class="mb-0">
                <label class="sample-label" for="statusChangeNote">Note</label>
                <textarea
                  id="statusChangeNote"
                  class="form-control"
                  rows="2"
                  bind:value={statusChangeNote}
                  placeholder="Optional note (also used for photo event)"
                ></textarea>
              </div>
            {/if}
          </div>

          {#if statusNeedsDelayRemark}
            <div class="sample-status-section mb-3 sample-status-section--warn">
              <div class="sample-status-section-title">Delay remark *</div>
              <textarea
                id="statusChangeDelayRemark"
                class="form-control"
                rows="2"
                bind:value={statusChangeDelayRemark}
                placeholder="Why is this sample overdue?"
              ></textarea>
              <div class="form-text text-danger mb-0">
                This movement is overdue — required before status update.
              </div>
            </div>
          {/if}

          {#if statusShowPrimaryDate || statusShowTrackingPrimary || statusHasMoreDates}
            <div class="sample-status-section mb-3">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="sample-status-section-title mb-0">Dates</div>
                {#if statusHasMoreDates}
                  <button
                    type="button"
                    class="btn btn-sm btn-link p-0"
                    style="font-size:12px;"
                    on:click={() => (statusShowMoreDates = !statusShowMoreDates)}
                  >
                    {statusShowMoreDates ? "Hide extra" : "More dates & shipping"}
                  </button>
                {/if}
              </div>
              <div class="row g-2">
                {#if statusNeedsReceivedDate}
                  <div class="col-md-6">
                    <label class="sample-label" for="statusChangeReceivedDate">Received date</label>
                    <input
                      id="statusChangeReceivedDate"
                      type="date"
                      class="form-control"
                      bind:value={statusChangeReceivedDate}
                    />
                  </div>
                {:else if statusNeedsReturnedDate}
                  <div class="col-md-6">
                    <label class="sample-label" for="statusChangeReturnedDate">Returned date</label>
                    <input
                      id="statusChangeReturnedDate"
                      type="date"
                      class="form-control"
                      bind:value={statusChangeReturnedDate}
                    />
                  </div>
                {:else if statusShowPrimaryDate}
                  <div class="col-md-6">
                    <label class="sample-label" for="statusChangeSentDate">Sent date</label>
                    <input
                      id="statusChangeSentDate"
                      type="date"
                      class="form-control"
                      bind:value={statusChangeSentDate}
                    />
                  </div>
                {/if}
                {#if statusShowTrackingPrimary}
                  <div class="col-md-6">
                    <label class="sample-label" for="statusChangeTracking">Tracking</label>
                    <input
                      id="statusChangeTracking"
                      type="text"
                      class="form-control"
                      bind:value={statusChangeTracking}
                      placeholder="Courier / AWB"
                    />
                  </div>
                {/if}
              </div>

              {#if statusShowMoreDates}
                <div class="row g-2 mt-2 pt-2 border-top">
                  {#if statusNeedsSentDate && !statusShowPrimaryDate}
                    <div class="col-md-4">
                      <label class="sample-label" for="statusChangeSentDateMore">Sent date</label>
                      <input
                        id="statusChangeSentDateMore"
                        type="date"
                        class="form-control"
                        bind:value={statusChangeSentDate}
                      />
                    </div>
                  {:else if statusNeedsSentDate && (statusNeedsReceivedDate || statusNeedsReturnedDate)}
                    <div class="col-md-4">
                      <label class="sample-label" for="statusChangeSentDateMore">Sent date</label>
                      <input
                        id="statusChangeSentDateMore"
                        type="date"
                        class="form-control"
                        bind:value={statusChangeSentDate}
                      />
                    </div>
                  {/if}
                  {#if !statusShowTrackingPrimary}
                    <div class="col-md-4">
                      <label class="sample-label" for="statusChangeTrackingMore">Tracking</label>
                      <input
                        id="statusChangeTrackingMore"
                        type="text"
                        class="form-control"
                        bind:value={statusChangeTracking}
                        placeholder="Courier / AWB"
                      />
                    </div>
                  {/if}
                  {#if statusIsShipping}
                    <div class="col-md-4">
                      <label class="sample-label" for="statusChangeExpectedDelivery">Expected delivery</label>
                      <input
                        id="statusChangeExpectedDelivery"
                        type="date"
                        class="form-control"
                        bind:value={statusChangeExpectedDelivery}
                      />
                    </div>
                    <div class="col-md-4">
                      <label class="sample-label" for="statusChangeExpectedReturn">Expected return</label>
                      <input
                        id="statusChangeExpectedReturn"
                        type="date"
                        class="form-control"
                        bind:value={statusChangeExpectedReturn}
                      />
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          <div class="sample-status-section mb-0">
            <div class="d-flex align-items-center justify-content-between">
              <div class="sample-status-section-title mb-0">Photos (optional)</div>
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                style="font-size:12px;"
                on:click={toggleStatusPhotos}
                disabled={sampleSaving}
              >
                <i class="ti {statusShowPhotos ? 'ti-chevron-up' : 'ti-photo-plus'} me-1"></i>
                {statusShowPhotos
                  ? "Hide photos"
                  : statusChangeFiles.length
                    ? `Photos (${statusChangeFiles.length})`
                    : "Add photos"}
              </button>
            </div>

            {#if statusShowPhotos}
              <p class="text-muted mt-2 mb-2" style="font-size:12px;">
                Step defaults from the new status — change if needed.
              </p>
              <div class="mb-2">
                <label class="sample-label" for="statusChangeStep">Image step</label>
                <select
                  id="statusChangeStep"
                  class="form-select"
                  bind:value={statusChangeStep}
                  disabled={sampleSaving}
                >
                  {#each IMAGE_STEP_OPTIONS as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              </div>
              {#if statusNeedsHoldRemark}
                <div class="mb-2">
                  <label class="sample-label" for="statusChangeEventNote">Event note</label>
                  <textarea
                    id="statusChangeEventNote"
                    class="form-control"
                    rows="2"
                    bind:value={statusChangeNote}
                    placeholder="Optional note for photos"
                    disabled={sampleSaving}
                  ></textarea>
                </div>
              {/if}
              <input
                bind:this={statusFileInputEl}
                type="file"
                class="d-none"
                accept="image/*,application/pdf"
                multiple
                disabled={sampleSaving}
                on:change={onStatusFilesChange}
              />
              <div
                class="sample-event-dropzone sample-event-dropzone--compact"
                class:sample-event-dropzone--disabled={sampleSaving || statusChangeFiles.length >= 10}
                role="button"
                tabindex="0"
                on:click={openStatusFilePicker}
                on:keydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openStatusFilePicker();
                  }
                }}
                on:dragover|preventDefault
                on:drop={onStatusImagesDrop}
              >
                <i class="ti ti-photo-plus" style="font-size:18px;"></i>
                <div>
                  <div class="fw-semibold" style="font-size:13px;">
                    {statusChangeFiles.length ? "Add more images" : "Add images"}
                  </div>
                  <div class="text-muted" style="font-size:11px;">Up to 10</div>
                </div>
              </div>
              {#if statusChangeFiles.length}
                <div class="sample-event-preview-grid mt-2">
                  {#each statusChangeFiles as item, i}
                    <div class="sample-event-preview-item">
                      {#if item.previewUrl}
                        <img src={item.previewUrl} alt={item.file.name} />
                      {:else}
                        <div class="sample-event-preview-file" title={item.file.name}>
                          <i class="ti ti-file"></i>
                          <span>{item.file.name}</span>
                        </div>
                      {/if}
                      <button
                        type="button"
                        class="sample-event-preview-remove"
                        title="Remove"
                        disabled={sampleSaving}
                        on:click|stopPropagation={() => removeStatusFile(i)}
                      >
                        ×
                      </button>
                    </div>
                  {/each}
                </div>
                <div class="text-muted mt-1" style="font-size:12px;">
                  {statusChangeFiles.length} / 10 image(s)
                </div>
              {/if}
            {/if}
          </div>

          {#if statusChangeError}
            <div class="text-danger mt-3" style="font-size:12px;">{statusChangeError}</div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={closeStatusModal} disabled={sampleSaving}>
            Cancel
          </button>
          <button type="button" class="btn btn-warning" disabled={sampleSaving} on:click={submitStatusChange}>
            {sampleSaving ? "Saving…" : "Update status"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showViewModal && viewSample}
  <div
    class="modal fade show d-block sample-add-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable" role="document">
      <div class="modal-content sample-add-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0 flex-wrap">
            <i class="ti ti-eye text-primary"></i>
            <span>Sample details</span>
            <span
              class="badge {viewSample.direction === 'Outbound' ? 'bg-info' : 'bg-secondary'}"
              style="font-size:10px;"
            >
              {viewSample.direction || "—"}
            </span>
            <span class="badge {movementBadgeClass(viewSample.status)}" style="font-size:10px;">
              {viewSample.status || "—"}
            </span>
            {#if viewSample.sentDelay?.delayed && viewSample.sentDelay?.label}
              <span class="badge bg-danger" style="font-size:10px;">
                {viewSample.sentDelay.label}
              </span>
            {/if}
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={closeViewModal}
            aria-label="Close"
          ></button>
        </div>
        <div class="modal-body">
          <div class="row g-3 mb-3">
            <div class="col-md-4">
              <div class="text-muted" style="font-size:11px;">Sent</div>
              <div class="fw-semibold" style="font-size:13px;">{formatDate(viewSample.sentDate)}</div>
            </div>
            <div class="col-md-4">
              <div class="text-muted" style="font-size:11px;">Received</div>
              <div class="fw-semibold" style="font-size:13px;">{formatDate(viewSample.receivedDate)}</div>
            </div>
            <div class="col-md-4">
              <div class="text-muted" style="font-size:11px;">Requested</div>
              <div class="fw-semibold" style="font-size:13px;">{formatDate(viewSample.requestedDate)}</div>
            </div>
            <div class="col-md-4">
              <div class="text-muted" style="font-size:11px;">Expected delivery</div>
              <div class="fw-semibold" style="font-size:13px;">{formatDate(viewSample.expectedDeliveryDate)}</div>
            </div>
            <div class="col-md-4">
              <div class="text-muted" style="font-size:11px;">Expected return</div>
              <div class="fw-semibold" style="font-size:13px;">{formatDate(viewSample.expectedReturnDate)}</div>
            </div>
            <div class="col-md-4">
              <div class="text-muted" style="font-size:11px;">Returned</div>
              <div class="fw-semibold" style="font-size:13px;">{formatDate(viewSample.returnedDate)}</div>
            </div>
            <div class="col-md-4">
              <div class="text-muted" style="font-size:11px;">Follow-up</div>
              <div class="fw-semibold" style="font-size:13px;">{formatDate(viewSample.followUpDate)}</div>
            </div>
            <div class="col-md-4">
              <div class="text-muted" style="font-size:11px;">Tracking</div>
              <div class="fw-semibold" style="font-size:13px;">{viewSample.tracking || "—"}</div>
            </div>
            <div class="col-md-4">
              <div class="text-muted" style="font-size:11px;">Created</div>
              <div class="fw-semibold" style="font-size:13px;">{formatEventTime(viewSample.createdAt) || "—"}</div>
            </div>
          </div>

          <div class="mb-3">
            <div class="text-muted mb-1" style="font-size:11px; font-weight:600;">Notes</div>
            <div class="p-2 rounded bg-light" style="font-size:13px; white-space:pre-wrap;">
              {viewSample.notes || "—"}
            </div>
          </div>

          <div class="mb-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <div class="text-muted" style="font-size:11px; font-weight:600;">Items</div>
            </div>
            {#if Array.isArray(viewSample.items) && viewSample.items.filter((it) => it?.name).length}
              <div class="table-responsive">
                <table class="table table-sm table-bordered mb-0">
                  <thead class="table-light">
                    <tr>
                      <th>Item</th>
                      <th class="text-center" style="width:70px;">Qty</th>
                      <th class="text-center" style="width:70px;">Unit</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each viewSample.items.filter((it) => it?.name) as it}
                      <tr>
                        <td>{it.name}</td>
                        <td class="text-center">{it.quantity || "—"}</td>
                        <td class="text-center">{it.unit || "—"}</td>
                        <td class="text-muted">{it.note || "—"}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {:else}
              <div class="text-muted" style="font-size:13px;">{formatItemsSummary(viewSample)}</div>
            {/if}
          </div>

          {#each [samplePhotoGallery(viewSample)] as viewGallery}
            {#if viewGallery.length}
              <div class="mb-3">
                <div class="text-muted mb-2" style="font-size:11px; font-weight:600;">
                  Photos
                  <span class="badge bg-primary ms-1" style="font-size:9px;">{viewGallery.length}</span>
                </div>
                <div class="d-flex flex-wrap gap-2">
                  {#each viewGallery.slice(0, 12) as img, imgIdx}
                    <button
                      type="button"
                      class="sample-event-thumb-btn"
                      title="View full image"
                      on:click={() => openSamplePhotoGallery(viewSample, imgIdx)}
                    >
                      <img
                        src={img.url}
                        alt={img.label || "sample"}
                        class="sample-event-thumb"
                      />
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}

          <div>
            <div class="text-muted mb-2" style="font-size:11px; font-weight:600;">
              Events
              {#if Array.isArray(viewSample.events) && viewSample.events.length}
                <span class="badge bg-secondary ms-1" style="font-size:9px;">{viewSample.events.length}</span>
              {/if}
              {#if viewSample.delayRemarkStatus}
                <span
                  class="badge ms-1"
                  class:bg-warning={String(viewSample.delayRemarkStatus).toLowerCase() === "pending"}
                  class:text-dark={String(viewSample.delayRemarkStatus).toLowerCase() === "pending"}
                  class:bg-success={String(viewSample.delayRemarkStatus).toLowerCase() === "approved"}
                  style="font-size:9px;"
                >
                  delay {viewSample.delayRemarkStatus}
                </span>
              {/if}
            </div>
            {#if Array.isArray(viewSample.events) && viewSample.events.length}
              <div class="sample-events-list">
                {#each viewSample.events as ev}
                  <div
                    class="sample-event-item"
                    class:sample-event-item--delay={String(ev.type || "").toLowerCase() === "delay_remark"}
                  >
                    <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
                      <span
                        class="badge"
                        class:bg-warning={String(ev.type || "").toLowerCase() === "delay_remark"}
                        class:text-dark={String(ev.type || "").toLowerCase() === "delay_remark"}
                        class:bg-secondary={String(ev.type || "").toLowerCase() !== "delay_remark"}
                        style="font-size:10px;"
                      >
                        {ev.type || "event"}
                      </span>
                      {#if ev.status}
                        <span class="badge bg-light text-dark border" style="font-size:10px;">{ev.status}</span>
                      {/if}
                      <span class="text-muted" style="font-size:11px;">{formatEventTime(ev.createdAt)}</span>
                    </div>
                    {#if ev.note}
                      <div style="font-size:13px; white-space:pre-wrap;">{ev.note}</div>
                    {/if}
                    {#if Array.isArray(ev.images) && ev.images.length}
                      <div class="d-flex flex-wrap gap-2 mt-2">
                        {#each ev.images as img, imgIdx}
                          <button
                            type="button"
                            class="sample-event-thumb-btn"
                            on:click={() => openEventLightbox(ev, imgIdx)}
                          >
                            <img
                              src={mediaUrl(img.url)}
                              alt={img.fileName || "event"}
                              class="sample-event-thumb"
                            />
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="text-muted" style="font-size:13px;">No events yet.</div>
            {/if}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={closeViewModal}>Close</button>
          {#if canMutateOrder && !decided}
            <button
              type="button"
              class="btn btn-outline-warning"
              disabled={sampleSaving || !hasSampleCompany || hasPendingDelayRemark(viewSample)}
              title={mutateBlockedTitle(viewSample, "Change status")}
              on:click={openStatusFromView}
            >
              <i class="ti ti-arrows-exchange me-1"></i>Change status
            </button>
            <button
              type="button"
              class="btn btn-outline-primary"
              disabled={sampleSaving || !hasSampleCompany || hasPendingDelayRemark(viewSample)}
              title={addEventBlockedTitle(viewSample)}
              on:click={openEventFromView}
            >
              <i class="ti ti-photo-plus me-1"></i>Add note / images
            </button>
            <button
              type="button"
              class="btn btn-primary"
              disabled={sampleSaving || !hasSampleCompany || hasPendingDelayRemark(viewSample)}
              title={mutateBlockedTitle(viewSample, "Edit")}
              on:click={openEditFromView}
            >
              <i class="ti ti-pencil me-1"></i>Edit
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showEventModal}
  <div
    class="modal fade show d-block sample-add-modal"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1055;"
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content sample-add-content">
        <div class="modal-header">
          <h5 class="modal-title d-flex align-items-center gap-2 mb-0">
            <i class="ti ti-message-plus text-primary"></i>
            <span>Add sample event</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            on:click={closeEventModal}
            aria-label="Close"
            disabled={sampleSaving}
          ></button>
        </div>

        <div class="modal-body">
          <p class="text-muted mb-3" style="font-size:13px;">
            Step defaults to the next pipeline step for this movement. You can still pick an earlier step again if needed.
          </p>
          <label class="sample-label" for="sampleEventStep">Step</label>
          <select
            id="sampleEventStep"
            class="form-select mb-3"
            bind:value={eventStep}
            disabled={sampleSaving}
          >
            {#each IMAGE_STEP_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
          <label class="sample-label" for="sampleEventNote">Note</label>
          <textarea
            id="sampleEventNote"
            class="form-control mb-3"
            rows="3"
            bind:value={eventNote}
            placeholder="Review / courier / quality note…"
            disabled={sampleSaving}
            on:input={() => (eventError = "")}
          ></textarea>
          {#if needsDelayRemarkInput((samples || []).find((s) => s.id === eventSampleId))}
            <label class="sample-label" for="sampleEventDelayRemark">
              Delay remark <span class="text-danger">*</span>
            </label>
            <textarea
              id="sampleEventDelayRemark"
              class="form-control mb-3"
              rows="2"
              bind:value={eventDelayRemark}
              placeholder="Why is this sample overdue?"
              disabled={sampleSaving}
              on:input={() => (eventError = "")}
            ></textarea>
          {/if}
          <label class="sample-label">Images</label>
          <input
            bind:this={eventFileInputEl}
            type="file"
            class="d-none"
            accept="image/*,application/pdf"
            multiple
            disabled={sampleSaving}
            on:change={onEventFilesChange}
          />
          <div
            class="sample-event-dropzone"
            class:sample-event-dropzone--disabled={sampleSaving || eventFiles.length >= 10}
            role="button"
            tabindex="0"
            on:click={openEventFilePicker}
            on:keydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openEventFilePicker();
              }
            }}
            on:dragover|preventDefault
            on:drop={onEventImagesDrop}
          >
            <i class="ti ti-photo-plus" style="font-size:22px;"></i>
            <div class="fw-semibold" style="font-size:13px;">
              {eventFiles.length ? "Add more images" : "Add images"}
            </div>
            <div class="text-muted" style="font-size:12px;">
              Click or drop photos here · up to 10
            </div>
          </div>
          {#if eventFiles.length}
            <div class="sample-event-preview-grid mt-2">
              {#each eventFiles as item, i}
                <div class="sample-event-preview-item">
                  {#if item.previewUrl}
                    <img src={item.previewUrl} alt={item.file.name} />
                  {:else}
                    <div class="sample-event-preview-file" title={item.file.name}>
                      <i class="ti ti-file"></i>
                      <span>{item.file.name}</span>
                    </div>
                  {/if}
                  <button
                    type="button"
                    class="sample-event-preview-remove"
                    title="Remove"
                    disabled={sampleSaving}
                    on:click|stopPropagation={() => removeEventFile(i)}
                  >
                    ×
                  </button>
                </div>
              {/each}
            </div>
            <div class="text-muted mt-1" style="font-size:12px;">
              {eventFiles.length} / 10 image(s)
            </div>
          {/if}
          {#if eventError}
            <div class="text-danger mt-2" style="font-size:12px;">{eventError}</div>
          {/if}
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-light"
            on:click={closeEventModal}
            disabled={sampleSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={sampleSaving || (!eventNote.trim() && !eventFiles.length)}
            on:click={submitEvent}
          >
            {sampleSaving ? "Saving…" : "Save event"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .sample-company-modal :global(.modal-dialog),
  .sample-company-modal-content,
  .sample-company-modal :global(.modal-body) {
    overflow: visible;
  }

  .sample-company-modal :global(.select2-container) {
    z-index: 1060;
  }

  .sample-company-modal :global(.select2-dropdown) {
    z-index: 1065;
  }

  .sample-add-content {
    border: 0;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
  }

  .sample-add-content :global(.modal-header) {
    border-bottom: 1px solid #eef2f7;
    padding: 14px 18px;
  }

  .sample-add-content :global(.modal-body) {
    padding: 18px;
  }

  .sample-add-content :global(.modal-footer) {
    border-top: 1px solid #eef2f7;
    padding: 12px 18px;
  }

  .sample-label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
  }

  .sample-status-section {
    border: 1px solid #eef2f7;
    border-radius: 10px;
    padding: 12px 14px;
    background: #fafbfc;
  }

  .sample-status-section--warn {
    border-color: #fecaca;
    background: #fff7f7;
  }

  .sample-status-section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 10px;
  }

  .sample-add-content :global(.form-control),
  .sample-add-content :global(.form-select) {
    min-height: 38px;
    border-color: #e2e8f0;
    border-radius: 8px;
    font-size: 13px;
  }

  .sample-add-content :global(.form-control:focus),
  .sample-add-content :global(.form-select:focus) {
    border-color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }

  .sample-add-item-btn {
    border-radius: 6px;
    font-size: 12px;
    padding: 4px 10px;
  }

  .sample-items-panel {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #fff;
    overflow: hidden;
  }

  .sample-items-head,
  .sample-items-row {
    display: grid;
    grid-template-columns: minmax(0, 2.2fr) 72px 88px minmax(0, 1.4fr) 40px;
    gap: 10px;
    align-items: end;
    padding: 10px 12px;
  }

  .sample-items-head {
    background: #f8fafc;
    border-bottom: 1px solid #eef2f7;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
  }

  .sample-items-row + .sample-items-row {
    border-top: 1px solid #f1f5f9;
  }

  .sample-items-actions {
    display: flex;
    justify-content: flex-end;
    padding-bottom: 2px;
  }

  .sample-items-actions :global(.btn) {
    width: 32px;
    height: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
  }

  .sample-events-list {
    padding: 8px 4px;
  }

  .sample-next-hint {
    font-size: 12px;
    color: #334155;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 6px 10px;
  }

  .sample-event-filter {
    width: auto;
    min-width: 110px;
    max-width: 140px;
    font-size: 11px;
    padding: 2px 24px 2px 8px;
    min-height: 28px;
  }

  .sample-action-menu {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 20;
    display: block;
    min-width: 180px;
    padding: 4px 0;
    margin-top: 2px;
    font-size: 13px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  td .dropdown {
    position: relative;
  }

  .sample-action-menu .dropdown-item {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    width: 100%;
    border: 0;
    background: transparent;
    text-align: left;
  }

  .sample-action-menu .dropdown-item:hover:not(:disabled) {
    background: #f1f5f9;
  }

  .sample-action-menu .dropdown-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sample-event-item {
    padding: 6px 10px;
    margin-bottom: 8px;
    background: #f8fafc;
    border-radius: 6px;
  }

  .sample-event-item--clickable {
    cursor: pointer;
    transition: background 0.12s ease, box-shadow 0.12s ease;
  }

  .sample-event-item--clickable:hover {
    background: #f1f5f9;
    box-shadow: 0 0 0 1px #e2e8f0;
  }

  .sample-event-item--delay {
    background: #fffbeb;
  }

  .sample-event-thumb-more {
    width: 56px;
    height: 56px;
    border-radius: 6px;
    border: 1px dashed #cbd5e1;
    background: #f8fafc;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .sample-event-thumb {
    width: 56px;
    height: 56px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    display: block;
  }

  .sample-event-thumb-btn {
    padding: 0;
    border: 0;
    background: transparent;
    cursor: zoom-in;
    border-radius: 6px;
  }

  .sample-event-thumb-btn:hover .sample-event-thumb {
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
  }

  .sample-event-dropzone {
    border: 1.5px dashed #cbd5e1;
    border-radius: 10px;
    padding: 18px 12px;
    text-align: center;
    background: #f8fafc;
    color: #334155;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .sample-event-dropzone--compact {
    flex-direction: row;
    justify-content: flex-start;
    text-align: left;
    padding: 10px 12px;
    gap: 10px;
  }

  .sample-event-dropzone:hover:not(.sample-event-dropzone--disabled) {
    border-color: #60a5fa;
    background: #eff6ff;
  }

  .sample-event-dropzone--disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .sample-event-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 8px;
  }

  .sample-event-preview-item {
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    background: #f1f5f9;
  }

  .sample-event-preview-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .sample-event-preview-file {
    width: 100%;
    height: 100%;
    padding: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 10px;
    text-align: center;
    word-break: break-all;
  }

  .sample-event-preview-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.75);
    color: #fff;
    line-height: 1;
    font-size: 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .sample-event-preview-remove:hover {
    background: #dc2626;
  }

  @media (max-width: 767.98px) {
    .sample-items-row {
      grid-template-columns: 1fr 1fr;
      align-items: start;
    }

    .sample-items-row > div:first-child,
    .sample-items-row > div:nth-child(4) {
      grid-column: 1 / -1;
    }

    .sample-items-actions {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }
  }
</style>
