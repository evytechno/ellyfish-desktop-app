<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Loader from "$lib/components/Loader.svelte";
  import LightBox from "$lib/components/LightBox.svelte";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import PIWOTIModal from "$lib/components/PIWOTIModal.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import Swal from "sweetalert2";

  let loadingData = true;

  let errorMessage = "";
  let workOrder = null;
  let loading = false;
  let formErrors = {};
  let taxInvoiceId = null;
  let taxCheckDone = false;
  let piNumber = null;
  let piId = null;
  let statusUpdating = false;
  let statusError = "";
  let statusMsg = "";
  let showStatusModal = false;
  let statusDraft = "Pending";
  let statusRemarkDraft = "";
  let statusModalError = "";
  let statusPhotoFiles = [];
  let statusPhotoPreviews = [];

  const currentUser = checkAuth();
  const isMaster = currentUser?.role === "master";

  // Machine panel
  let machineCompletionDate = "";
  let machineSalesCompletionDate = "";
  let machineDispatchDate = "";
  let machineColor = "";
  let machineSize = "";
  let machineStage = "Meeting";
  let machineStageSchedule = {};
  let machineSaving = false;
  let machineStageSaving = false;
  let machineMsg = "";
  let machineErr = "";
  let machineDrawerOpen = false;
  let statusHistoryDrawerOpen = false;
  let historyBusyId = null;
  let addImagesEventId = null;
  let lightboxImages = [];
  let lightboxStart = 0;
  let showMachineModal = false;
  let showScheduleModal = false;
  let machineModalError = "";
  let scheduleModalError = "";
  let machineStageDraft = "Meeting";
  let machineRemarkDraft = "";
  let machineDateDraft = "";
  let machineSalesDateDraft = "";
  let machineDispatchDateDraft = "";
  let machineScheduleDraft = {};
  let machineScheduleBaseline = {};
  let machineColorDraft = "";
  let machineSizeDraft = "";
  let machinePhotoFiles = [];
  let machinePhotoPreviews = [];
  let machineModalBaseline = {
    stage: "Meeting",
    completionDate: "",
    salesCompletionDate: "",
    dispatchDate: "",
    color: "",
    size: "",
  };

  const MACHINE_STAGES = [
    "Meeting",
    "Design",
    "Cutting/Bending",
    "Painting",
    "Fitting",
    "Testing",
    "Ready to Dispatch",
  ];

  const MACHINE_STAGE_STYLE = {
    Meeting: { bg: "#6366f1", color: "#fff" },
    Design: { bg: "#0ea5e9", color: "#fff" },
    "Cutting/Bending": { bg: "#14b8a6", color: "#fff" },
    Painting: { bg: "#f59e0b", color: "#1f2937" },
    Fitting: { bg: "#8b5cf6", color: "#fff" },
    Testing: { bg: "#ef4444", color: "#fff" },
    "Ready to Dispatch": { bg: "#16a34a", color: "#fff" },
  };

  function stageBadgeStyle(st) {
    const s = MACHINE_STAGE_STYLE[st] || { bg: "#e5e7eb", color: "#374151" };
    return `background:${s.bg};color:${s.color};`;
  }

  // Modal state
  let piwotiOpen = false;
  let modalOrder = null;

  let workOrderId;
  $: workOrderId = $page.params.id;

  $: stageEvents = (workOrder?.events || []).filter(
    (e) => e.type === "stage" || e.type === "schedule" || e.type === "completion",
  );
  $: statusEvents = Array.isArray(workOrder?.statusEvents)
    ? workOrder.statusEvents
    : [];

  function isDispatchCat(wo) {
    if (wo?.isDispatchCategory != null) return !!wo.isDispatchCategory;
    const t = String(wo?.orderType || "").toLowerCase();
    return t === "abrasive" || t === "spareparts";
  }
  function isMachineCat(wo) {
    if (wo?.isMachineCategory != null) return !!wo.isMachineCategory;
    return String(wo?.orderType || "").toLowerCase() === "machine";
  }
  function toDateInput(d) {
    if (!d) return "";
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }
  function normalizeScheduleMap(raw) {
    const out = {};
    for (const st of MACHINE_STAGES) {
      const v = toDateInput(raw?.[st]);
      if (v) out[st] = v;
    }
    return out;
  }
  function schedulesEqual(a, b) {
    for (const st of MACHINE_STAGES) {
      if (String(a?.[st] || "") !== String(b?.[st] || "")) return false;
    }
    return true;
  }
  function formatUtcDate(d) {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" });
    } catch {
      return "";
    }
  }
  function plannedStageOverdue(stage, planned) {
    if (!planned) return false;
    const current = workOrder?.machine?.stage || machineStage;
    const curIdx = MACHINE_STAGES.indexOf(current);
    const stIdx = MACHINE_STAGES.indexOf(stage);
    if (stIdx < 0) return false;
    // Overdue if planned date passed and this stage is current or not yet reached
    if (stIdx > curIdx) return false;
    if (stIdx < curIdx) return false; // already passed
    const end = new Date(planned);
    end.setHours(23, 59, 59, 999);
    return Date.now() > end.getTime();
  }
  function syncMachineForm(wo) {
    const m = wo?.machine;
    machineCompletionDate = toDateInput(m?.completionDate);
    machineSalesCompletionDate = toDateInput(m?.salesCompletionDate);
    machineDispatchDate = toDateInput(m?.dispatchDate);
    machineStageSchedule = normalizeScheduleMap(m?.stageSchedule);
    machineColor = m?.color || "";
    machineSize = m?.size || "";
    machineStage = m?.stage || "Meeting";
  }
  function statusBadgeClass(st) {
    if (st === "Completed") return "bg-success";
    if (st === "Dispatched") return "bg-primary";
    if (st === "Hold") return "bg-warning text-dark";
    return "bg-secondary";
  }

  function orderTypeBadge(t) {
    const map = {
      Machine: { label: "Machine", bg: "#0ea5e9", color: "#fff" },
      Abrasive: { label: "Abrasive", bg: "#f59e0b", color: "#1f2937" },
      SpareParts: { label: "Spare Parts", bg: "#64748b", color: "#fff" },
    };
    return map[t] || { label: t || "—", bg: "#e5e7eb", color: "#374151" };
  }

  async function updateStatus(nextStatus, remarks, files = []) {
    if (!workOrder?.id || statusUpdating) return;
    statusError = "";
    statusMsg = "";
    const remarkVal =
      remarks !== undefined
        ? String(remarks || "").trim()
        : String(workOrder.remarks || "").trim();
    if (nextStatus === "Hold" && !remarkVal) {
      statusError = 'Status "Hold" requires a remark.';
      return;
    }
    statusUpdating = true;
    try {
      let data;
      const fileList = Array.isArray(files) ? files.filter(Boolean) : [];
      if (fileList.length) {
        const form = new FormData();
        form.append("status", nextStatus);
        if (nextStatus === "Hold" || remarkVal) {
          form.append("remarks", remarkVal || "");
        }
        for (const file of fileList.slice(0, 5)) {
          form.append("images", file);
        }
        data = await authApiFetch(
          `${API_ROUTES.WORK_ORDER}/${workOrderId}/status`,
          { method: "PUT", data: form },
        );
      } else {
        const payload = { status: nextStatus };
        if (nextStatus === "Hold" || remarkVal) {
          payload.remarks = remarkVal || null;
        }
        data = await authApiFetch(
          `${API_ROUTES.WORK_ORDER}/${workOrderId}/status`,
          { method: "PUT", data: JSON.stringify(payload) },
        );
      }

      const next = data?.data || {};
      const prevEvents = Array.isArray(workOrder.statusEvents)
        ? workOrder.statusEvents
        : [];
      workOrder = {
        ...workOrder,
        status: next.status ?? nextStatus,
        remarks:
          next.remarks !== undefined
            ? next.remarks
            : remarkVal || workOrder.remarks,
        sentDelay: next.sentDelay ?? workOrder.sentDelay,
        statusEvents: next.statusEvent
          ? [next.statusEvent, ...prevEvents]
          : prevEvents,
      };
      if (isDispatchCat(workOrder) && !next.sentDelay) {
        workOrder = {
          ...workOrder,
          sentDelay: computeClientSentDelay(workOrder),
        };
      }
    } catch (err) {
      statusError = err?.message || "Failed to update work order status.";
      errorMessage = statusError;
      throw err;
    } finally {
      statusUpdating = false;
    }
  }

  function statusOptionsForWo(wo) {
    const isDispatch = isDispatchCat(wo);
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

  function clearStatusPhotos() {
    for (const p of statusPhotoPreviews) {
      if (p?.url) URL.revokeObjectURL(p.url);
    }
    statusPhotoFiles = [];
    statusPhotoPreviews = [];
  }

  function openStatusChangeModal() {
    if (!workOrder?.id || statusUpdating) return;
    statusError = "";
    statusModalError = "";
    statusDraft = workOrder.status || "Pending";
    statusRemarkDraft =
      workOrder.status === "Hold" ? workOrder.remarks || "" : "";
    clearStatusPhotos();
    showStatusModal = true;
  }

  function closeStatusModal() {
    if (statusUpdating) return;
    showStatusModal = false;
    statusModalError = "";
    clearStatusPhotos();
  }

  function onStatusPhotosPick(e) {
    const picked = Array.from(e?.target?.files || []);
    e.target.value = "";
    if (!picked.length) return;
    const room = Math.max(0, 5 - statusPhotoFiles.length);
    const next = picked.slice(0, room);
    if (picked.length > room) {
      statusModalError = "Maximum 5 photos.";
    } else {
      statusModalError = "";
    }
    const previews = next.map((file) => ({
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    statusPhotoFiles = [...statusPhotoFiles, ...next];
    statusPhotoPreviews = [...statusPhotoPreviews, ...previews];
  }

  function removeStatusPhoto(idx) {
    const prev = statusPhotoPreviews[idx];
    if (prev?.url) URL.revokeObjectURL(prev.url);
    statusPhotoFiles = statusPhotoFiles.filter((_, i) => i !== idx);
    statusPhotoPreviews = statusPhotoPreviews.filter((_, i) => i !== idx);
  }

  async function submitStatusModal() {
    if (!workOrder?.id || statusUpdating) return;
    statusModalError = "";
    const current = workOrder.status || "Pending";
    if (statusDraft === "Hold" && !String(statusRemarkDraft || "").trim()) {
      statusModalError = 'Status "Hold" requires a remark.';
      return;
    }
    if (
      statusDraft === current &&
      statusDraft !== "Hold" &&
      !statusPhotoFiles.length
    ) {
      statusModalError = "Status is already set to that value.";
      return;
    }
    try {
      await updateStatus(
        statusDraft,
        statusDraft === "Hold" || statusRemarkDraft
          ? statusRemarkDraft
          : undefined,
        statusPhotoFiles,
      );
      showStatusModal = false;
      clearStatusPhotos();
      statusMsg = `Status set to ${statusDraft}.`;
      statusHistoryDrawerOpen = true;
    } catch (err) {
      statusModalError =
        err?.message || statusError || "Failed to update status.";
    }
  }

  function computeClientSentDelay(wo) {
    if (!isDispatchCat(wo) || wo?.status !== "Pending" || !wo?.createdAt) {
      return { delayed: false, ms: null, days: null, label: null };
    }
    const createdMs = new Date(wo.createdAt).getTime();
    if (Number.isNaN(createdMs)) {
      return { delayed: false, ms: null, days: null, label: null };
    }
    const grace = 2 * 24 * 60 * 60 * 1000;
    const ageMs = Date.now() - createdMs;
    if (ageMs <= grace) {
      return { delayed: false, ms: null, days: null, label: null };
    }
    const overdueMs = ageMs - grace;
    const totalHours = Math.floor(overdueMs / (60 * 60 * 1000));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    let label;
    if (days > 0 && hours > 0) label = `${days}d ${hours}h overdue`;
    else if (days > 0) label = `${days}d overdue`;
    else if (hours > 0) label = `${hours}h overdue`;
    else label = "<1h overdue";
    return { delayed: true, ms: overdueMs, days, label };
  }

  async function applyMachineAttrs({ completionDate, color, size }) {
    if (completionDate) {
      const res = await authApiFetch(
        `${API_ROUTES.WORK_ORDER}/${workOrderId}/completion-date`,
        {
          method: "PUT",
          data: JSON.stringify({ completionDate }),
        },
      );
      if (res?.data?.machine) {
        workOrder = {
          ...workOrder,
          machine: { ...(workOrder.machine || {}), ...res.data.machine },
        };
      }
    }
    const attrs = await authApiFetch(
      `${API_ROUTES.WORK_ORDER}/${workOrderId}/machine-attrs`,
      {
        method: "PUT",
        data: JSON.stringify({
          color: color.trim() || null,
          size: size.trim() || null,
        }),
      },
    );
    if (attrs?.data) {
      workOrder = {
        ...workOrder,
        machine: {
          ...(workOrder.machine || {}),
          ...attrs.data,
          completionDate:
            attrs.data.completionDate ??
            workOrder.machine?.completionDate ??
            null,
        },
      };
    }
  }

  async function applySalesDates({ salesCompletionDate, dispatchDate }) {
    const body = {};
    if (salesCompletionDate !== undefined) {
      body.salesCompletionDate = salesCompletionDate || null;
    }
    if (dispatchDate !== undefined) {
      body.dispatchDate = dispatchDate || null;
    }
    const res = await authApiFetch(
      `${API_ROUTES.WORK_ORDER}/${workOrderId}/sales-dates`,
      {
        method: "PUT",
        data: JSON.stringify(body),
      },
    );
    if (res?.data?.machine) {
      workOrder = {
        ...workOrder,
        machine: { ...(workOrder.machine || {}), ...res.data.machine },
      };
    }
    return res;
  }

  async function applyStageSchedule(schedule) {
    const res = await authApiFetch(
      `${API_ROUTES.WORK_ORDER}/${workOrderId}/stage-schedule`,
      {
        method: "PUT",
        data: JSON.stringify({ schedule }),
      },
    );
    if (res?.data?.machine) {
      workOrder = {
        ...workOrder,
        machine: { ...(workOrder.machine || {}), ...res.data.machine },
      };
    }
    return res;
  }

  function isHistoryImage(img) {
    const name = String(img?.fileName || img?.url || "").toLowerCase();
    return /\.(jpe?g|png|gif|webp)$/i.test(name) || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(String(img?.url || ""));
  }

  function mediaUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return ATTACHMENT_BASE_URL + url;
  }

  function openImageLightbox(urls, index = 0) {
    lightboxStart = index;
    lightboxImages = Array.isArray(urls) ? urls.filter(Boolean) : [urls].filter(Boolean);
  }

  function openHistoryImage(ev, imgIdx) {
    const imgs = (ev?.images || []).filter(isHistoryImage);
    const urls = imgs.map((x) => mediaUrl(x.url));
    const clicked = ev?.images?.[imgIdx];
    const start = Math.max(
      0,
      imgs.findIndex((x) => x === clicked || x?.url === clicked?.url),
    );
    if (!urls.length) return;
    openImageLightbox(urls, start);
  }

  function patchLocalEvent(eventId, nextEvent) {
    workOrder = {
      ...workOrder,
      events: (workOrder.events || []).map((e) =>
        e.id === eventId ? { ...e, ...nextEvent } : e,
      ),
    };
  }

  async function applyMachineStage({ stage, remark, files = [] }) {
    const hasFiles = Array.isArray(files) && files.length > 0;
    let data;
    if (hasFiles) {
      const form = new FormData();
      form.append("stage", stage);
      if (remark) form.append("remark", remark);
      for (const file of files) {
        if (file) form.append("images", file);
      }
      data = form;
    } else {
      data = JSON.stringify({
        stage,
        remark: remark || undefined,
      });
    }
    const res = await authApiFetch(`${API_ROUTES.WORK_ORDER}/${workOrderId}/stage`, {
      method: "PUT",
      data,
    });
    if (res?.data?.machine) {
      workOrder = {
        ...workOrder,
        machine: { ...(workOrder.machine || {}), ...res.data.machine },
      };
    }
    if (res?.data?.event && isMaster) {
      workOrder = {
        ...workOrder,
        events: [...(workOrder.events || []), res.data.event],
      };
    }
    return res;
  }

  async function deleteStageHistory(ev) {
    if (!isMaster || !ev?.id || historyBusyId) return;
    const confirm = await Swal.fire({
      title: "Delete history entry?",
      text: "This removes the stage history row and its images.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#9ca3af",
    });
    if (!confirm.isConfirmed) return;

    historyBusyId = ev.id;
    machineErr = "";
    try {
      await authApiFetch(
        `${API_ROUTES.WORK_ORDER}/${workOrderId}/machine-events/${ev.id}`,
        { method: "DELETE" },
      );
      workOrder = {
        ...workOrder,
        events: (workOrder.events || []).filter((e) => e.id !== ev.id),
      };
      machineMsg = "Stage history entry deleted.";
    } catch (err) {
      machineErr = err?.message || "Failed to delete history entry.";
      Swal.fire("Error", machineErr, "error");
    } finally {
      historyBusyId = null;
    }
  }

  async function removeStageHistoryImage(ev, imageIndex) {
    if (!isMaster || !ev?.id || historyBusyId) return;
    const confirm = await Swal.fire({
      title: "Remove image?",
      text: "This image will be removed from the history entry.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#9ca3af",
    });
    if (!confirm.isConfirmed) return;

    historyBusyId = ev.id;
    machineErr = "";
    try {
      const res = await authApiFetch(
        `${API_ROUTES.WORK_ORDER}/${workOrderId}/machine-events/${ev.id}/images/${imageIndex}`,
        { method: "DELETE" },
      );
      if (res?.data?.event) {
        patchLocalEvent(ev.id, res.data.event);
      } else {
        const nextImages = [...(ev.images || [])];
        nextImages.splice(imageIndex, 1);
        patchLocalEvent(ev.id, { images: nextImages.length ? nextImages : null });
      }
      machineMsg = "Image removed.";
    } catch (err) {
      machineErr = err?.message || "Failed to remove image.";
      Swal.fire("Error", machineErr, "error");
    } finally {
      historyBusyId = null;
    }
  }

  function triggerAddHistoryImages(eventId) {
    if (!isMaster || historyBusyId) return;
    addImagesEventId = eventId;
    const input = document.getElementById("wo-history-image-input");
    if (input) {
      input.value = "";
      input.click();
    }
  }

  async function onHistoryImagesSelected(e) {
    const eventId = addImagesEventId;
    const files = Array.from(e?.target?.files || []);
    addImagesEventId = null;
    if (!eventId || !files.length) return;

    historyBusyId = eventId;
    machineErr = "";
    try {
      const form = new FormData();
      for (const file of files) form.append("images", file);
      const res = await authApiFetch(
        `${API_ROUTES.WORK_ORDER}/${workOrderId}/machine-events/${eventId}/images`,
        { method: "POST", data: form },
      );
      if (res?.data?.event) {
        patchLocalEvent(eventId, res.data.event);
      }
      machineMsg = "Images added.";
    } catch (err) {
      machineErr = err?.message || "Failed to add images.";
      Swal.fire("Error", machineErr, "error");
    } finally {
      historyBusyId = null;
      if (e?.target) e.target.value = "";
    }
  }

  function clearMachinePhotos() {
    for (const p of machinePhotoPreviews) {
      if (p?.url) URL.revokeObjectURL(p.url);
    }
    machinePhotoFiles = [];
    machinePhotoPreviews = [];
  }

  function openMachineDetailsModal() {
    if (!workOrder?.id || machineSaving || machineStageSaving) return;
    machineMsg = "";
    machineErr = "";
    machineModalError = "";
    const stage = workOrder.machine?.stage || machineStage || "Meeting";
    const completionDate =
      toDateInput(workOrder.machine?.completionDate) || machineCompletionDate || "";
    const salesCompletionDate =
      toDateInput(workOrder.machine?.salesCompletionDate) ||
      machineSalesCompletionDate ||
      "";
    const dispatchDate =
      toDateInput(workOrder.machine?.dispatchDate) || machineDispatchDate || "";
    const color = workOrder.machine?.color || machineColor || "";
    const size = workOrder.machine?.size || machineSize || "";
    machineStageDraft = stage;
    machineRemarkDraft = "";
    machineDateDraft = completionDate;
    machineSalesDateDraft = salesCompletionDate;
    machineDispatchDateDraft = dispatchDate;
    machineColorDraft = color;
    machineSizeDraft = size;
    machineModalBaseline = {
      stage,
      completionDate,
      salesCompletionDate,
      dispatchDate,
      color,
      size,
    };
    clearMachinePhotos();
    showMachineModal = true;
  }

  function openStageScheduleModal() {
    if (!workOrder?.id || machineSaving || machineStageSaving) return;
    machineMsg = "";
    machineErr = "";
    scheduleModalError = "";
    const stageSchedule = normalizeScheduleMap(
      workOrder.machine?.stageSchedule || machineStageSchedule,
    );
    machineScheduleDraft = { ...stageSchedule };
    machineScheduleBaseline = { ...stageSchedule };
    showScheduleModal = true;
  }

  function closeMachineModal() {
    if (machineSaving || machineStageSaving) return;
    showMachineModal = false;
    machineModalError = "";
    clearMachinePhotos();
  }

  function closeScheduleModal() {
    if (machineSaving) return;
    showScheduleModal = false;
    scheduleModalError = "";
  }

  function onMachinePhotosPick(e) {
    const picked = Array.from(e?.target?.files || []);
    e.target.value = "";
    if (!picked.length) return;
    const room = Math.max(0, 5 - machinePhotoFiles.length);
    const next = picked.slice(0, room);
    machineModalError =
      picked.length > room ? "Maximum 5 files." : "";
    const previews = next.map((file) => ({
      url: file.type?.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
      name: file.name,
      isPdf: file.type === "application/pdf",
    }));
    machinePhotoFiles = [...machinePhotoFiles, ...next];
    machinePhotoPreviews = [...machinePhotoPreviews, ...previews];
  }

  function removeMachinePhoto(idx) {
    const prev = machinePhotoPreviews[idx];
    if (prev?.url) URL.revokeObjectURL(prev.url);
    machinePhotoFiles = machinePhotoFiles.filter((_, i) => i !== idx);
    machinePhotoPreviews = machinePhotoPreviews.filter((_, i) => i !== idx);
  }

  async function submitMachineModal() {
    if (!workOrder?.id || machineSaving || machineStageSaving) return;
    machineModalError = "";
    const stage = machineStageDraft || machineModalBaseline.stage;
    const remark = String(machineRemarkDraft || "").trim();
    const completionDate = String(machineDateDraft || "").trim();
    const salesCompletionDate = String(machineSalesDateDraft || "").trim();
    const dispatchDate = String(machineDispatchDateDraft || "").trim();
    const color = String(machineColorDraft || "").trim();
    const size = String(machineSizeDraft || "").trim();
    const files = machinePhotoFiles;

    const stageChanged = stage !== machineModalBaseline.stage;
    const workshopDateChanged =
      completionDate !== machineModalBaseline.completionDate;
    const salesDatesChanged =
      salesCompletionDate !== machineModalBaseline.salesCompletionDate ||
      dispatchDate !== machineModalBaseline.dispatchDate;
    const attrsChanged =
      color !== machineModalBaseline.color ||
      size !== machineModalBaseline.size;
    const hasImages = files.length > 0;

    if (
      !stageChanged &&
      !remark &&
      !workshopDateChanged &&
      !salesDatesChanged &&
      !attrsChanged &&
      !hasImages
    ) {
      machineModalError = "Change a field, add a remark, or attach images.";
      return;
    }

    machineSaving = true;
    machineStageSaving = true;
    try {
      if (stageChanged || remark || hasImages) {
        await applyMachineStage({ stage, remark: remark || undefined, files });
      }
      if (workshopDateChanged || attrsChanged) {
        await applyMachineAttrs({
          completionDate: workshopDateChanged ? completionDate : "",
          color,
          size,
        });
      }
      if (salesDatesChanged) {
        await applySalesDates({
          salesCompletionDate:
            salesCompletionDate !== machineModalBaseline.salesCompletionDate
              ? salesCompletionDate
              : undefined,
          dispatchDate:
            dispatchDate !== machineModalBaseline.dispatchDate
              ? dispatchDate
              : undefined,
        });
      }
      syncMachineForm(workOrder);
      machineMsg = "Machine details saved.";
      showMachineModal = false;
      clearMachinePhotos();
    } catch (err) {
      machineModalError = err?.message || "Failed to save machine details.";
      machineErr = machineModalError;
    } finally {
      machineSaving = false;
      machineStageSaving = false;
    }
  }

  async function submitScheduleModal() {
    if (!workOrder?.id || machineSaving) return;
    scheduleModalError = "";
    const schedule = normalizeScheduleMap(machineScheduleDraft);
    if (schedulesEqual(schedule, machineScheduleBaseline)) {
      scheduleModalError = "Change at least one planned stage date.";
      return;
    }
    machineSaving = true;
    try {
      const res = await applyStageSchedule(
        Object.keys(schedule).length ? schedule : null,
      );
      if (res?.data?.event && isMaster) {
        workOrder = {
          ...workOrder,
          events: [...(workOrder.events || []), res.data.event],
        };
      }
      syncMachineForm(workOrder);
      machineMsg = "Stage schedule saved.";
      showScheduleModal = false;
    } catch (err) {
      scheduleModalError = err?.message || "Failed to save stage schedule.";
      machineErr = scheduleModalError;
    } finally {
      machineSaving = false;
    }
  }

  async function loadOrderForModal(orderId) {
    try {
      const data = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}/basic`);
      modalOrder = data;
    } catch {
      modalOrder = null;
    }
  }

  async function onPIWOTIRefresh() {
    if (!workOrder?.order?.id) return;
    try {
      const data = await authApiFetch(`${API_ROUTES.ORDER}/${workOrder.order.id}/basic`);
      modalOrder = data;
      taxInvoiceId = data.invoices?.[0]?.id ?? null;
    } catch {}
    taxCheckDone = true;
  }

  onMount(async () => {
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.WORK_ORDER}/${workOrderId}`);
      workOrder = data;
      if (!workOrder.sentDelay && isDispatchCat(workOrder)) {
        workOrder = { ...workOrder, sentDelay: computeClientSentDelay(workOrder) };
      }
      syncMachineForm(workOrder);
    } catch (err) {
      errorMessage = "Failed to load workOrder data.";
    } finally {
      setTimeout(() => { loadingData = false; }, 500);
    }

    // Check if tax invoice already exists for this order
    try {
      if (workOrder?.order?.id) {
        const piList = await authApiFetch(`${API_ROUTES.ORDER_PAYMENT}/check/${workOrder.order.id}`);
        if (piList?.count > 0) {
          piId = piList.items[0].id;
          const pi = piList.items[0];
          piNumber = String(pi.invoiceNo).padStart(6, "0");
          const res = await authApiFetch(`${API_ROUTES.INVOICE}/by-pi/${piId}`);
          taxInvoiceId = res?.taxInvoiceId ?? null;
        }
      }
    } catch {
      taxInvoiceId = null;
    } finally {
      taxCheckDone = true;
    }
  });

  // ── Inline item edit ──────────────────────────────────────────────────────
  const unitOptions = ["Pcs", "Kg", "g", "L", "mL", "m", "cm", "Set", "Box", "Nos"];
  let editingCell = null;
  let editingValue = "";
  let savingItems = false;

  function startCellEdit(rowIndex, field) {
    editingCell = { rowIndex, field };
    editingValue = String(workOrder.items[rowIndex][field] ?? "");
  }

  function cancelCellEdit() { editingCell = null; editingValue = ""; }

  async function commitCell() {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell;
    const updatedItems = workOrder.items.map((item, i) => {
      if (i !== rowIndex) return item;
      return { ...item, [field]: field === "quantity" || field === "unitPrice" ? Number(editingValue) : editingValue };
    });
    editingCell = null;
    editingValue = "";
    savingItems = true;
    try {
      await authApiFetch(`${API_ROUTES.WORK_ORDER}/${workOrderId}`, {
        method: "PUT",
        data: JSON.stringify({ items: updatedItems }),
      });
      workOrder = { ...workOrder, items: updatedItems };
    } catch {
      workOrder = { ...workOrder };
    } finally {
      savingItems = false;
    }
  }

  function handleCellKeydown(e) {
    if (e.key === "Enter") { e.preventDefault(); commitCell(); }
    if (e.key === "Escape") cancelCellEdit();
  }
</script>

<svelte:head>
  <style>
    @media print {
      .no-print { display: none !important; }
      .sidebar, aside, header.header, .main-wrapper > .header { display: none !important; }
      .page-wrapper { padding: 0 !important; margin: 0 !important; }
      .content { padding: 0 !important; margin: 0 !important; }
      .card { margin: 0 !important; border: 0 !important; box-shadow: none !important; }
      .card-body { margin: 0 !important; padding: 10mm !important; }
    }
  </style>
</svelte:head>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <!-- Start Content -->
  <div class="content pb-0">
    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap no-print">
      <div class="d-flex align-items-center gap-3">
        <button class="btn btn-warning btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <div class="d-flex align-items-center gap-2">
            <h4 class="mb-0">Work Order</h4>
            {#if workOrder?.workOrderNo}
              <span class="text-muted fw-normal fs-5">{workOrder.workOrderNo}</span>
            {/if}
            {#if workOrder}
              <button
                type="button"
                class="badge border-0 {statusBadgeClass(workOrder.status)}"
                style="font-size:11px;cursor:pointer;"
                title="Click to change status"
                disabled={statusUpdating}
                on:click={openStatusChangeModal}
              >
                {workOrder.status || "Pending"}
              </button>
              {#if workOrder.orderType}
                {@const ot = orderTypeBadge(workOrder.orderType)}
                <span
                  class="badge"
                  style="font-size:11px;background:{ot.bg};color:{ot.color};"
                >
                  {ot.label}
                </span>
              {/if}
              {#if workOrder.sentDelay?.delayed && workOrder.sentDelay?.label}
                <span class="badge bg-danger" style="font-size:11px;" title="Pending more than 2 days">
                  {workOrder.sentDelay.label}
                </span>
              {/if}
            {/if}
          </div>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              <li class="breadcrumb-item"><a href="/admin/workorder">Work Orders</a></li>
              <li class="breadcrumb-item active">WO Detail</li>
            </ol>
          </nav>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 no-print flex-wrap">
        {#if workOrder}
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            disabled={statusUpdating}
            on:click={openStatusChangeModal}
          >
            {statusUpdating ? "Updating…" : "Change status"}
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            on:click={() => {
              machineDrawerOpen = false;
              statusHistoryDrawerOpen = true;
            }}
          >
            <i class="ti ti-history me-1"></i>Status history
            {#if statusEvents.length}
              <span class="badge bg-secondary ms-1" style="font-size:10px;">{statusEvents.length}</span>
            {/if}
          </button>
          {#if isMachineCat(workOrder)}
            <button
              type="button"
              class="btn btn-outline-primary btn-sm"
              on:click={() => {
                statusHistoryDrawerOpen = false;
                machineDrawerOpen = true;
              }}
            >
              <i class="ti ti-settings me-1"></i>Machine detail
              {#if stageEvents.length}
                <span class="badge bg-primary ms-1" style="font-size:10px;">{stageEvents.length}</span>
              {/if}
            </button>
          {/if}
        {/if}
        <a href="/admin/workorder/edit/{workOrderId}" class="btn btn-primary btn-sm">
          <i class="ti ti-edit me-1"></i>Edit Work Order
        </a>
      </div>
    </div>
    {#if statusError}
      <div class="alert alert-danger py-2 no-print" style="font-size:13px;">{statusError}</div>
    {/if}
    {#if statusMsg}
      <div class="alert alert-success py-2 no-print" style="font-size:13px;">{statusMsg}</div>
    {/if}
    <!-- End Page Header -->
    {#if workOrder}
      {#if isDispatchCat(workOrder) && workOrder.sentDelay?.delayed}
        <div class="alert alert-warning py-2 no-print mb-3" style="font-size:13px;">
          <i class="ti ti-clock-exclamation me-1"></i>
          Sent delay: <strong>{workOrder.sentDelay.label}</strong>
          (still Pending more than 2 days after creation)
        </div>
      {/if}

      <div class="row">
        <div class="col-lg-10 mx-auto">
          <div class="card printWorkOrder" id="printWorkOrder">
            <div class="card-body">
              <div class="space-y-4">
                <!-- <div class="text-center text-xs">!! Jai Ganeshya Namah !!</div> -->
                <div class="grid grid-cols-3 gap-4">
                  <div class="border-r">
                    <img
                      src={ATTACHMENT_BASE_URL + workOrder?.company?.logo}
                      alt={workOrder?.company?.name}
                      width="200px"
                    />
                  </div>
                  <div class="space-y-2 col-span-2">
                    <div class="text-lg text-center font-semibold text-black">
                      Work Order
                    </div>
                    <div class="text-lg text-center font-semibold">
                      {workOrder?.title}
                    </div>
                  </div>
                </div>
                <hr />
                <div class="grid grid-cols-2 gap-2">

                  <div class="grid grid-cols-2 gap-2">
                    <div class="font-medium">WO No. :</div>
                    <div>
                      {workOrder?.workOrderNo}
                    </div>
                  </div>

                  {#if workOrder?.workOrderDate}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Date :</div>
                      <div>
                        {`${String(new Date(workOrder.workOrderDate).getDate()).padStart(2, "0")}-${String(new Date(workOrder.workOrderDate).getMonth() + 1).padStart(2, "0")}-${new Date(workOrder.workOrderDate).getFullYear()}`}
                      </div>
                    </div>
                  {/if}
                  {#if workOrder?.user}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Order By :</div>
                      <div>{workOrder?.orderByName || workOrder?.user?.name}</div>
                    </div>
                  {/if}
                  {#if piNumber}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">PI Number :</div>
                      <div>
                        {#if piId}
                          <a href="/admin/invoice/{piId}">#{piNumber}</a>
                        {:else}
                          #{piNumber}
                        {/if}
                      </div>
                    </div>
                  {/if}
                  {#if workOrder?.company}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Billing :</div>
                      <div>{workOrder?.company?.name}</div>
                    </div>
                  {/if}
                  {#if workOrder?.orderNo}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Ref. No. :</div>
                      <div>{workOrder.orderNo}</div>
                    </div>
                  {/if}
                  {#if workOrder?.dispatchAddress}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Dispatch Address :</div>
                      <div>{workOrder?.dispatchAddress}</div>
                    </div>
                  {/if}
                  {#if workOrder?.dispatchPincode}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Dispatch Pincode :</div>
                      <div>{workOrder?.dispatchPincode}</div>
                    </div>
                  {/if}
                  {#if workOrder?.inCoterms}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Incoterms :</div>
                      <div>
                        {workOrder?.inCoterms} - {workOrder?.inCotermsBy}
                      </div>
                    </div>
                  {/if}
                  {#if workOrder?.paymentMethod}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Transport Payment Method :</div>
                      <div>{workOrder?.paymentMethod}</div>
                    </div>
                  {/if}
                  {#if workOrder?.packingType}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Packing Type :</div>
                      <div>
                        {workOrder?.packingType}
                        {#if workOrder?.packingCharges}
                          {workOrder?.packingCharges ? "-" : ""}
                          {workOrder?.packingCharges}
                        {/if}
                      </div>
                    </div>
                  {/if}
                  {#if workOrder?.transporterName}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Transporter Name :</div>
                      <div>{workOrder?.transporterName}</div>
                    </div>
                  {/if}
                </div>
                <hr />
                <div>
                  <div class="font-semibold mb-2">Description :</div>
                  <table class="w-full border" style="table-layout:fixed;">
                    <thead class="table-light border-bottom">
                      <tr>
                        <th class="p-2 text-center" style="width:44px;">Sr.</th>
                        <th class="p-2 text-left">Item</th>
                        <th class="p-2 text-center" style="width:70px;">Qty</th>
                        <th class="p-2 text-center" style="width:70px;">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each workOrder?.items as item, index}
                        <tr class="border-bottom item-row">
                          <td class="p-2 text-center">{index + 1}</td>
                          <td class="p-2 capitalize" style="word-break:break-word;overflow-wrap:break-word;">{item?.item}</td>

                          <!-- Qty -->
                          <td class="p-2 text-center item-cell" on:click={() => startCellEdit(index, "quantity")}>
                            {#if editingCell?.rowIndex === index && editingCell?.field === "quantity"}
                              <input class="inline-cell-input" type="number" min="0" bind:value={editingValue}
                                on:blur={commitCell} on:keydown={handleCellKeydown} autofocus />
                            {:else}
                              {item?.quantity ?? "-"}
                            {/if}
                          </td>

                          <!-- Unit -->
                          <td class="p-2 text-center item-cell" on:click={() => startCellEdit(index, "unit")}>
                            {#if editingCell?.rowIndex === index && editingCell?.field === "unit"}
                              <select class="inline-cell-input" bind:value={editingValue}
                                on:change={commitCell} on:blur={commitCell} on:keydown={handleCellKeydown} autofocus>
                                {#each unitOptions as u}<option value={u}>{u}</option>{/each}
                              </select>
                            {:else}
                              {item?.unit || "Pcs"}
                            {/if}
                          </td>

                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
                <hr />
                <div class="grid grid-cols-2 gap-2">
                  {#if workOrder?.installationEngineer}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Installation Engineer :</div>
                      <div>{workOrder?.installationEngineer}</div>
                    </div>
                  {/if}
                  {#if workOrder?.installationDate}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Installation Date :</div>
                      <div>
                        {`${String(new Date(workOrder.installationDate).getDate()).padStart(2, "0")}-${String(new Date(workOrder.installationDate).getMonth() + 1).padStart(2, "0")}-${new Date(workOrder.installationDate).getFullYear()}`}
                      </div>
                    </div>
                  {/if}
                </div>

                {#if workOrder?.remarks}
                  <div class="font-medium">Remarks :</div>
                  <div class="text-left text-xs">
                    {workOrder?.remarks}
                  </div>
                {/if}
              </div>

              <div class="no-print d-flex align-items-center justify-content-end gap-2 flex-wrap mt-4 pt-4 border-top">
                {#if workOrder?.order?.id && taxCheckDone}
                  {#if taxInvoiceId}
                    <a href="/admin/invoice/tax/{taxInvoiceId}" class="btn btn-info btn-sm">
                      <i class="ti ti-file-invoice me-1"></i>View Tax Invoice
                    </a>
                  {:else}
                    <button class="btn btn-warning btn-sm" on:click={() => { piwotiOpen = true; if (!modalOrder) loadOrderForModal(workOrder.order.id); }}>
                      <i class="ti ti-file-plus me-1"></i>Create Tax Invoice
                    </button>
                  {/if}
                {/if}
                <button class="btn btn-primary btn-sm" on:click={() => window.print()}>
                  <i class="ti ti-printer me-1"></i>Print Work Order
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="row">
        <div class="col-md-12">Loading Work Order details...</div>
      </div>
    {/if}

    <!-- Start Footer -->
  </div>
  <!-- End Content -->
</div>

<PIWOTIModal
  open={piwotiOpen}
  type="TI"
  order={modalOrder}
  on:close={() => piwotiOpen = false}
  on:refresh={onPIWOTIRefresh}
/>

{#if showStatusModal && workOrder}
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.5);z-index:1060;"
    on:click|self={closeStatusModal}
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
            disabled={statusUpdating}
            on:click={closeStatusModal}
          ></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <div class="text-muted" style="font-size:12px;">Work order</div>
            <div class="fw-semibold font-monospace">
              {workOrder.workOrderNo || `WO #${workOrder.id}`}
            </div>
          </div>

          <label class="form-label">Status <span class="text-danger">*</span></label>
          <div class="wo-st-opts mb-3">
            {#each statusOptionsForWo(workOrder) as opt}
              <button
                type="button"
                class="wo-st-chip"
                class:is-active={statusDraft === opt.value}
                style="--st-bg:{opt.bg};--st-fg:{opt.color};"
                on:click={() => (statusDraft = opt.value)}
              >
                {#if statusDraft === opt.value}<i class="ti ti-check"></i>{/if}
                {opt.label}
              </button>
            {/each}
          </div>

          {#if statusDraft === "Hold"}
            <div class="mb-3">
              <label class="form-label">Hold remark <span class="text-danger">*</span></label>
              <textarea
                class="form-control"
                rows="2"
                bind:value={statusRemarkDraft}
                placeholder="Why is this on hold?"
              ></textarea>
            </div>
          {/if}

          {#if isDispatchCat(workOrder)}
            <div class="mb-1">
              <label class="form-label">
                Photos <span class="text-muted fw-normal">(optional, max 5)</span>
              </label>
              <div class="d-flex flex-wrap gap-2 align-items-start mb-2">
                {#each statusPhotoPreviews as preview, idx}
                  <div class="wo-st-preview">
                    <img src={preview.url} alt={preview.name || "photo"} />
                    <button
                      type="button"
                      class="wo-st-preview__rm"
                      title="Remove"
                      on:click={() => removeStatusPhoto(idx)}
                    ><i class="ti ti-x"></i></button>
                  </div>
                {/each}
                {#if statusPhotoFiles.length < 5}
                  <label class="wo-st-add-photo">
                    <i class="ti ti-photo-plus"></i>
                    <span>Add</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      hidden
                      on:change={onStatusPhotosPick}
                    />
                  </label>
                {/if}
              </div>
              <div class="text-muted" style="font-size:11px;">
                Shown in status history (CRM + app).
              </div>
            </div>
          {/if}

          {#if statusModalError}
            <div class="alert alert-danger py-2 mb-0 mt-3" style="font-size:13px;">
              {statusModalError}
            </div>
          {/if}
        </div>
        <div class="modal-footer py-2">
          <button
            type="button"
            class="btn btn-light btn-sm"
            disabled={statusUpdating}
            on:click={closeStatusModal}
          >Cancel</button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={statusUpdating}
            on:click={submitStatusModal}
          >
            {statusUpdating ? "Updating…" : "Update status"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showMachineModal && workOrder}
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.5);z-index:1060;"
    on:click|self={closeMachineModal}
  >
    <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title mb-0 fw-semibold">
            <i class="ti ti-settings me-2 text-primary"></i>Edit machine details
          </h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            disabled={machineSaving || machineStageSaving}
            on:click={closeMachineModal}
          ></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <div class="text-muted" style="font-size:12px;">Work order</div>
            <div class="fw-semibold font-monospace">
              {workOrder.workOrderNo || `WO #${workOrder.id}`}
            </div>
          </div>

          <label class="form-label">Production stage <span class="text-danger">*</span> <span class="text-muted fw-normal">(workshop)</span></label>
          <div class="wo-st-opts mb-3">
            {#each MACHINE_STAGES as st}
              {@const style = MACHINE_STAGE_STYLE[st] || { bg: "#e5e7eb", color: "#374151" }}
              <button
                type="button"
                class="wo-st-chip"
                class:is-active={machineStageDraft === st}
                style="--st-bg:{style.bg};--st-fg:{style.color};"
                on:click={() => (machineStageDraft = st)}
              >
                {#if machineStageDraft === st}<i class="ti ti-check"></i>{/if}
                {st}
              </button>
            {/each}
          </div>

          <div class="mb-3">
            <label class="form-label">Stage remark <span class="text-muted fw-normal">(optional)</span></label>
            <input
              class="form-control"
              type="text"
              bind:value={machineRemarkDraft}
              placeholder="Note when updating stage"
            />
          </div>

          <div class="mb-3">
            <label class="form-label">Machine completion date <span class="text-muted fw-normal">(by workshop)</span></label>
            <input
              class="form-control"
              type="date"
              bind:value={machineDateDraft}
            />
          </div>

          <div class="row g-2 mb-3">
            <div class="col-md-6">
              <label class="form-label">Machine completion date <span class="text-muted fw-normal">(by sales)</span></label>
              <input
                class="form-control"
                type="date"
                bind:value={machineSalesDateDraft}
              />
            </div>
            <div class="col-md-6">
              <label class="form-label">Machine dispatch date <span class="text-muted fw-normal">(by sales)</span></label>
              <input
                class="form-control"
                type="date"
                bind:value={machineDispatchDateDraft}
              />
            </div>
          </div>

          <div class="row g-2 mb-3">
            <div class="col-md-6">
              <label class="form-label">Color</label>
              <input
                class="form-control"
                type="text"
                bind:value={machineColorDraft}
                placeholder="Color"
              />
            </div>
            <div class="col-md-6">
              <label class="form-label">Size</label>
              <input
                class="form-control"
                type="text"
                bind:value={machineSizeDraft}
                placeholder="Size"
              />
            </div>
          </div>

          <div class="mb-1">
            <label class="form-label">
              Stage images <span class="text-muted fw-normal">(optional, max 5)</span>
            </label>
            <div class="d-flex flex-wrap gap-2 align-items-start mb-2">
              {#each machinePhotoPreviews as preview, idx}
                <div class="wo-st-preview">
                  {#if preview.url}
                    <img src={preview.url} alt={preview.name || "file"} />
                  {:else}
                    <div class="wo-st-preview__file">
                      <i class="ti ti-file-type-pdf"></i>
                      <span>{preview.name || "PDF"}</span>
                    </div>
                  {/if}
                  <button
                    type="button"
                    class="wo-st-preview__rm"
                    title="Remove"
                    on:click={() => removeMachinePhoto(idx)}
                  ><i class="ti ti-x"></i></button>
                </div>
              {/each}
              {#if machinePhotoFiles.length < 5}
                <label class="wo-st-add-photo">
                  <i class="ti ti-photo-plus"></i>
                  <span>Add</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    multiple
                    hidden
                    on:change={onMachinePhotosPick}
                  />
                </label>
              {/if}
            </div>
            <div class="text-muted" style="font-size:11px;">
              Attached to the new stage history entry.
            </div>
          </div>

          {#if machineModalError}
            <div class="alert alert-danger py-2 mb-0 mt-3" style="font-size:13px;">
              {machineModalError}
            </div>
          {/if}
        </div>
        <div class="modal-footer py-2">
          <button
            type="button"
            class="btn btn-light btn-sm"
            disabled={machineSaving || machineStageSaving}
            on:click={closeMachineModal}
          >Cancel</button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={machineSaving || machineStageSaving}
            on:click={submitMachineModal}
          >
            {machineSaving || machineStageSaving ? "Saving…" : "Save details"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showScheduleModal && workOrder}
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.5);z-index:1060;"
    on:click|self={closeScheduleModal}
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title mb-0 fw-semibold">
            <i class="ti ti-calendar-event me-2 text-primary"></i>Stage schedule
          </h5>
          <button
            type="button"
            class="btn-close"
            aria-label="Close"
            disabled={machineSaving}
            on:click={closeScheduleModal}
          ></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <div class="text-muted" style="font-size:12px;">Work order</div>
            <div class="fw-semibold font-monospace">
              {workOrder.workOrderNo || `WO #${workOrder.id}`}
            </div>
            <div class="text-muted mt-1" style="font-size:12px;">
              Set planned dates per stage (separate from stage updates).
            </div>
          </div>
          <div class="wo-st-schedule">
            {#each MACHINE_STAGES as st}
              <div class="wo-st-schedule__row">
                <span class="wo-st-schedule__label">{st}</span>
                <input
                  class="form-control form-control-sm"
                  type="date"
                  value={machineScheduleDraft[st] || ""}
                  on:change={(e) => {
                    const v = e.currentTarget.value;
                    if (v) machineScheduleDraft = { ...machineScheduleDraft, [st]: v };
                    else {
                      const next = { ...machineScheduleDraft };
                      delete next[st];
                      machineScheduleDraft = next;
                    }
                  }}
                />
              </div>
            {/each}
          </div>
          {#if scheduleModalError}
            <div class="alert alert-danger py-2 mb-0 mt-3" style="font-size:13px;">
              {scheduleModalError}
            </div>
          {/if}
        </div>
        <div class="modal-footer py-2">
          <button
            type="button"
            class="btn btn-light btn-sm"
            disabled={machineSaving}
            on:click={closeScheduleModal}
          >Cancel</button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={machineSaving}
            on:click={submitScheduleModal}
          >
            {machineSaving ? "Saving…" : "Save schedule"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<LightBox bind:data={lightboxImages} startIndex={lightboxStart} />

{#if workOrder}
  {#if statusHistoryDrawerOpen}
    <div
      class="wo-mach-drawer-backdrop no-print"
      on:click={() => (statusHistoryDrawerOpen = false)}
      on:keydown={(e) => e.key === "Escape" && (statusHistoryDrawerOpen = false)}
      role="presentation"
    ></div>
  {/if}
  <aside
    class="wo-mach-drawer no-print"
    class:wo-mach-drawer--open={statusHistoryDrawerOpen}
    aria-hidden={!statusHistoryDrawerOpen}
  >
    <div class="wo-mach-drawer__head">
      <div>
        <div class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Work order</div>
        <h5 class="mb-0" style="font-size:16px;">
          <i class="ti ti-history me-1"></i>Status history
          {#if statusEvents.length}
            <span class="badge bg-soft-primary text-primary ms-1" style="font-size:10px;">{statusEvents.length}</span>
          {/if}
        </h5>
        <div class="text-muted" style="font-size:12px;font-family:ui-monospace,monospace;">
          {workOrder.workOrderNo || `WO #${workOrder.id}`}
        </div>
      </div>
      <button
        type="button"
        class="btn btn-sm btn-light"
        aria-label="Close"
        on:click={() => (statusHistoryDrawerOpen = false)}
      >
        <i class="ti ti-x"></i>
      </button>
    </div>
    <div class="wo-mach-drawer__body">
      {#if statusEvents.length}
        <ul class="wo-status-drawer-list">
          {#each statusEvents as ev, i}
            <li class="wo-status-drawer-item">
              <div class="wo-status-drawer-item__rail" aria-hidden="true">
                <span class="wo-status-drawer-item__dot"></span>
                {#if i < statusEvents.length - 1}
                  <span class="wo-status-drawer-item__line"></span>
                {/if}
              </div>
              <div class="wo-status-drawer-item__body">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                  {#if ev.fromStatus}
                    <span class="badge border {statusBadgeClass(ev.fromStatus)}" style="font-size:10px;">{ev.fromStatus}</span>
                    <i class="ti ti-arrow-right text-muted" style="font-size:12px;"></i>
                  {/if}
                  <span class="badge {statusBadgeClass(ev.toStatus)}" style="font-size:11px;">{ev.toStatus}</span>
                </div>
                <div class="text-muted mb-1" style="font-size:11px;">
                  {#if ev.createdAt}
                    {new Date(ev.createdAt).toLocaleString("en-IN")}
                  {/if}
                  {#if ev.createdByExternal}
                    · {String(ev.createdByExternal).replace(/^crm:/, "")}
                  {/if}
                </div>
                {#if ev.remark}
                  <p class="mb-2 text-secondary" style="font-size:13px;">{ev.remark}</p>
                {/if}
                {#if Array.isArray(ev.images) && ev.images.length}
                  <div class="wo-hist-gallery">
                    {#each ev.images as img, imgIdx}
                      {#if isHistoryImage(img)}
                        <button
                          type="button"
                          class="wo-hist-thumb-btn"
                          title="Quick view"
                          on:click={() => openHistoryImage(ev, imgIdx)}
                        >
                          <img src={mediaUrl(img.url)} alt={img.fileName || "status"} />
                        </button>
                      {:else}
                        <a
                          href={mediaUrl(img.url)}
                          target="_blank"
                          rel="noopener"
                          class="wo-hist-file"
                        >
                          <i class="ti ti-file-text"></i>
                        </a>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="wo-mach-empty-card">
          <i class="ti ti-history" style="font-size:22px;opacity:0.45;"></i>
          <div class="fw-semibold mt-2">No status changes yet</div>
          <small class="text-muted">Updates from Change status will appear here.</small>
        </div>
      {/if}
    </div>
  </aside>
{/if}

{#if workOrder && isMachineCat(workOrder)}
  {#if machineDrawerOpen}
    <div
      class="wo-mach-drawer-backdrop no-print"
      on:click={() => (machineDrawerOpen = false)}
      on:keydown={(e) => e.key === "Escape" && (machineDrawerOpen = false)}
      role="presentation"
    ></div>
  {/if}
  <aside
    class="wo-mach-drawer no-print"
    class:wo-mach-drawer--open={machineDrawerOpen}
    aria-hidden={!machineDrawerOpen}
  >
    <div class="wo-mach-drawer__head">
      <div>
        <div class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Work order</div>
        <h5 class="mb-0" style="font-size:16px;">
          <i class="ti ti-settings me-1"></i>Machine details
        </h5>
        <div class="text-muted" style="font-size:12px;font-family:ui-monospace,monospace;">
          {workOrder.workOrderNo || `WO #${workOrder.id}`}
        </div>
      </div>
      <button
        type="button"
        class="btn btn-sm btn-light"
        aria-label="Close"
        on:click={() => (machineDrawerOpen = false)}
      >
        <i class="ti ti-x"></i>
      </button>
    </div>
    <div class="wo-mach-drawer__body">
      <section class="wo-mach-status">
        <div class="wo-mach-status__stage">
          <span class="wo-mach-label">Current stage</span>
          <button
            type="button"
            class="wo-mach-stage-pill"
            style={stageBadgeStyle(workOrder.machine?.stage || machineStage)}
            disabled={machineSaving || machineStageSaving}
            title="Edit machine details"
            on:click={openMachineDetailsModal}
          >
            {workOrder.machine?.stage || machineStage || "Meeting"}
          </button>
        </div>

        <dl class="wo-mach-meta">
          <div>
            <dt>Completion (workshop)</dt>
            <dd>
              {#if workOrder.machine?.completionDate}
                {formatUtcDate(workOrder.machine.completionDate)}
              {:else}
                <span class="wo-mach-empty">Not set</span>
              {/if}
            </dd>
          </div>
          <div>
            <dt>Completion (sales)</dt>
            <dd>
              {#if workOrder.machine?.salesCompletionDate}
                {formatUtcDate(workOrder.machine.salesCompletionDate)}
              {:else}
                <span class="wo-mach-empty">Not set</span>
              {/if}
            </dd>
          </div>
          <div>
            <dt>Dispatch (sales)</dt>
            <dd>
              {#if workOrder.machine?.dispatchDate}
                {formatUtcDate(workOrder.machine.dispatchDate)}
              {:else}
                <span class="wo-mach-empty">Not set</span>
              {/if}
            </dd>
          </div>
          <div>
            <dt>Color</dt>
            <dd>
              {#if workOrder.machine?.color}
                {workOrder.machine.color}
              {:else}
                <span class="wo-mach-empty">Not set</span>
              {/if}
            </dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {#if workOrder.machine?.size}
                {workOrder.machine.size}
              {:else}
                <span class="wo-mach-empty">Not set</span>
              {/if}
            </dd>
          </div>
        </dl>

        <div class="wo-mach-schedule">
          <div class="d-flex align-items-center justify-content-between gap-2">
            <span class="wo-mach-label">Stage schedule</span>
            <button
              type="button"
              class="btn btn-link btn-sm p-0"
              style="font-size:12px;font-weight:600;"
              disabled={machineSaving || machineStageSaving}
              on:click={openStageScheduleModal}
            >
              {Object.keys(normalizeScheduleMap(workOrder.machine?.stageSchedule)).length
                ? "Edit"
                : "Add"}
            </button>
          </div>
          {#if Object.keys(normalizeScheduleMap(workOrder.machine?.stageSchedule)).length}
            <ul class="wo-mach-schedule__list">
              {#each MACHINE_STAGES as st}
                {@const planned = normalizeScheduleMap(workOrder.machine?.stageSchedule)[st]}
                {#if planned}
                  <li class:is-overdue={plannedStageOverdue(st, planned)}>
                    <span>{st}</span>
                    <span>{formatUtcDate(planned)}</span>
                  </li>
                {/if}
              {/each}
            </ul>
          {:else}
            <div class="wo-mach-empty" style="margin-top:6px;">No schedule yet</div>
          {/if}
        </div>

        <div class="d-grid gap-2">
          <button
            type="button"
            class="btn btn-outline-primary btn-sm w-100 wo-mach-edit-btn"
            disabled={machineSaving || machineStageSaving}
            on:click={openMachineDetailsModal}
          >
            <i class="ti ti-edit me-1"></i>
            {machineSaving || machineStageSaving ? "Saving…" : "Edit machine details"}
          </button>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm w-100 wo-mach-edit-btn"
            disabled={machineSaving || machineStageSaving}
            on:click={openStageScheduleModal}
          >
            <i class="ti ti-calendar-event me-1"></i>
            {Object.keys(normalizeScheduleMap(workOrder.machine?.stageSchedule)).length
              ? "Edit stage schedule"
              : "Add stage schedule"}
          </button>
        </div>
      </section>

      {#if isMaster}
        <input
          id="wo-history-image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          multiple
          class="d-none"
          on:change={onHistoryImagesSelected}
        />
      {/if}
      <section class="wo-mach-history">
        <div class="wo-mach-history__title">
          <div class="wo-mach-history__heading">
            <i class="ti ti-timeline"></i>
            <span>Machine history</span>
            {#if stageEvents.length}
              <span class="wo-mach-history__count">{stageEvents.length}</span>
            {/if}
          </div>
        </div>

        {#if stageEvents.length}
          <ul class="wo-mach-history__list">
            {#each [...stageEvents].reverse() as ev, i}
              <li class="wo-hist-item" class:wo-hist-item--busy={historyBusyId === ev.id}>
                <div class="wo-hist-item__rail" aria-hidden="true">
                  <span
                    class="wo-hist-item__dot"
                    style="background:{ev.type === 'schedule'
                      ? '#0ea5e9'
                      : ev.type === 'completion'
                        ? '#16a34a'
                        : (MACHINE_STAGE_STYLE[ev.meta?.stage || workOrder.machine?.stage] || {}).bg || '#94a3b8'};"
                  ></span>
                  {#if i < stageEvents.length - 1}
                    <span class="wo-hist-item__line"></span>
                  {/if}
                </div>

                <div class="wo-hist-item__body">
                  <div class="wo-hist-item__top">
                    <div class="wo-hist-item__badges">
                      {#if ev.type === "schedule"}
                        <span class="wo-hist-stage" style="background:#0ea5e9;color:#fff;">
                          Schedule
                        </span>
                        {#if Array.isArray(ev.meta?.changedStages) && ev.meta.changedStages.length}
                          <span class="wo-hist-chip">{ev.meta.changedStages.join(", ")}</span>
                        {/if}
                      {:else if ev.type === "completion"}
                        <span class="wo-hist-stage" style="background:#16a34a;color:#fff;">
                          {ev.meta?.kind === "sales"
                            ? "Sales completion"
                            : ev.meta?.kind === "dispatch"
                              ? "Dispatch"
                              : "Workshop completion"}
                        </span>
                      {:else}
                        <span
                          class="wo-hist-stage"
                          style={stageBadgeStyle(ev.meta?.stage || workOrder.machine?.stage)}
                        >
                          {ev.meta?.stage || workOrder.machine?.stage || "—"}
                        </span>
                        {#if ev.meta?.previousStage && ev.meta?.stageChanged !== false && ev.meta?.previousStage !== ev.meta?.stage}
                          <span class="wo-hist-chip">from {ev.meta.previousStage}</span>
                        {:else if ev.meta?.stageChanged === false}
                          <span class="wo-hist-chip wo-hist-chip--muted">same stage</span>
                        {/if}
                      {/if}
                    </div>

                    <div class="wo-hist-item__aside">
                      <time class="wo-hist-date">
                        {#if ev.date}
                          {new Date(ev.date).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                        {:else if ev.createdAt}
                          {new Date(ev.createdAt).toLocaleString("en-IN")}
                        {/if}
                      </time>
                      {#if isMaster}
                        <div class="wo-hist-actions">
                          {#if ev.type === "stage"}
                            <button
                              type="button"
                              class="wo-hist-action"
                              title="Add images"
                              aria-label="Add images"
                              disabled={historyBusyId === ev.id}
                              on:click={() => triggerAddHistoryImages(ev.id)}
                            >
                              <i class="ti ti-photo-plus"></i>
                            </button>
                          {/if}
                          <button
                            type="button"
                            class="wo-hist-action wo-hist-action--danger"
                            title="Delete history entry"
                            aria-label="Delete history entry"
                            disabled={historyBusyId === ev.id}
                            on:click={() => deleteStageHistory(ev)}
                          >
                            <i class="ti ti-trash"></i>
                          </button>
                        </div>
                      {/if}
                    </div>
                  </div>

                  {#if ev.remark}
                    <p class="wo-hist-remark">{ev.remark}</p>
                  {/if}

                  {#if ev.type === "schedule" && ev.meta?.schedule}
                    <div class="wo-hist-schedule-diff text-muted" style="font-size:12px;margin-top:6px;">
                      {#each MACHINE_STAGES as st}
                        {#if (ev.meta?.changedStages || []).includes(st)}
                          <div>
                            {st}:
                            {ev.meta?.previousSchedule?.[st]
                              ? formatUtcDate(ev.meta.previousSchedule[st])
                              : "—"}
                            →
                            {ev.meta?.schedule?.[st]
                              ? formatUtcDate(ev.meta.schedule[st])
                              : "cleared"}
                          </div>
                        {/if}
                      {/each}
                    </div>
                  {/if}

                  {#if Array.isArray(ev.images) && ev.images.length}
                    <div class="wo-hist-gallery">
                      {#each ev.images as img, imgIdx}
                        <div class="wo-hist-thumb">
                          {#if isHistoryImage(img)}
                            <button
                              type="button"
                              class="wo-hist-thumb-btn"
                              title="Quick view"
                              on:click={() => openHistoryImage(ev, imgIdx)}
                            >
                              <img src={mediaUrl(img.url)} alt={img.fileName || "stage"} />
                              <span class="wo-hist-thumb__zoom"><i class="ti ti-zoom-in"></i></span>
                            </button>
                          {:else}
                            <a
                              href={mediaUrl(img.url)}
                              target="_blank"
                              rel="noopener"
                              class="wo-hist-file"
                              title={img.fileName || "file"}
                            >
                              <i class="ti ti-file-text"></i>
                              <span>{img.fileName || "file"}</span>
                            </a>
                          {/if}
                          {#if isMaster}
                            <button
                              type="button"
                              class="wo-hist-thumb__rm"
                              title="Remove image"
                              aria-label="Remove image"
                              disabled={historyBusyId === ev.id}
                              on:click|stopPropagation={() => removeStageHistoryImage(ev, imgIdx)}
                            >
                              <i class="ti ti-x"></i>
                            </button>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="wo-mach-history__empty">
            <i class="ti ti-history"></i>
            <div>No machine history yet</div>
            <small>Stage, schedule, and completion updates will appear here.</small>
          </div>
        {/if}
      </section>

      {#if machineMsg}
        <div class="wo-mach-toast wo-mach-toast--ok">{machineMsg}</div>
      {/if}
      {#if machineErr}
        <div class="wo-mach-toast wo-mach-toast--err">{machineErr}</div>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .wo-st-opts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .wo-st-chip {
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
    line-height: 1.2;
    cursor: pointer;
    outline: none;
    transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.1s;
  }
  .wo-st-chip:hover {
    border-color: var(--st-bg, #94a3b8);
    color: #0f172a;
    background: #f8fafc;
  }
  .wo-st-chip.is-active {
    background: var(--st-bg, #2563eb);
    border-color: var(--st-bg, #2563eb);
    color: var(--st-fg, #fff);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12),
      0 0 0 3px color-mix(in srgb, var(--st-bg, #2563eb) 22%, transparent);
  }
  .wo-st-chip i {
    font-size: 14px;
    line-height: 1;
  }
  .wo-st-preview {
    position: relative;
    width: 72px;
    height: 72px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    background: #f8fafc;
  }
  .wo-st-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .wo-st-preview__file {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 6px;
    text-align: center;
    font-size: 9px;
    font-weight: 600;
    color: #64748b;
    line-height: 1.2;
    overflow: hidden;
  }
  .wo-st-preview__file i {
    font-size: 18px;
    color: #ef4444;
  }
  .wo-st-preview__file span {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-all;
  }
  .wo-st-preview__rm {
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
    line-height: 1;
  }
  .wo-st-add-photo {
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
  .wo-st-add-photo:hover {
    border-color: var(--bs-primary, #2563eb);
    color: var(--bs-primary, #2563eb);
    background: #fff;
  }
  .wo-st-add-photo i {
    font-size: 18px;
  }

  .wo-mach-drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    z-index: 1040;
  }
  .wo-mach-drawer {
    position: fixed;
    top: 0;
    right: 0;
    width: min(440px, 100vw);
    height: 100vh;
    background: #fff;
    z-index: 1050;
    display: flex;
    flex-direction: column;
    box-shadow: -8px 0 32px rgba(15, 23, 42, 0.14);
    transform: translateX(100%);
    transition: transform 0.25s ease;
    pointer-events: none;
  }
  .wo-mach-drawer--open {
    transform: translateX(0);
    pointer-events: auto;
  }
  .wo-mach-drawer__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 20px 16px;
    border-bottom: 1px solid #eef2f7;
    background: linear-gradient(180deg, #fafbfd 0%, #fff 100%);
  }
  .wo-mach-drawer__body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 18px 28px;
    background: #f7f8fb;
  }

  .wo-mach-empty-card {
    background: #fff;
    border: 1px dashed #dbe3ef;
    border-radius: 14px;
    padding: 28px 18px;
    text-align: center;
    color: #64748b;
  }

  .wo-status-drawer-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .wo-status-drawer-item {
    display: flex;
    gap: 12px;
    align-items: stretch;
  }
  .wo-status-drawer-item + .wo-status-drawer-item {
    margin-top: 2px;
  }
  .wo-status-drawer-item__rail {
    width: 14px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .wo-status-drawer-item__dot {
    width: 10px;
    height: 10px;
    margin-top: 6px;
    border-radius: 50%;
    background: var(--bs-primary, #2563eb);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    flex-shrink: 0;
  }
  .wo-status-drawer-item__line {
    flex: 1;
    width: 2px;
    margin: 4px 0 0;
    background: #e2e8f0;
    border-radius: 1px;
    min-height: 18px;
  }
  .wo-status-drawer-item__body {
    flex: 1;
    min-width: 0;
    background: #fff;
    border: 1px solid #e8ecf2;
    border-radius: 12px;
    padding: 12px 12px 10px;
    margin-bottom: 10px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .wo-mach-status {
    background: #fff;
    border: 1px solid #e8ecf2;
    border-radius: 14px;
    padding: 14px 14px 12px;
    margin-bottom: 14px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .wo-mach-status__stage {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid #f1f5f9;
  }
  .wo-mach-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .wo-mach-stage-pill {
    border: 0;
    border-radius: 999px;
    padding: 7px 14px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  }
  .wo-mach-stage-pill:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
  .wo-mach-meta {
    margin: 0 0 12px;
    display: grid;
    gap: 8px;
  }
  .wo-mach-meta > div {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 8px;
    font-size: 13px;
    align-items: baseline;
  }
  .wo-mach-meta dt {
    margin: 0;
    color: #64748b;
    font-weight: 500;
  }
  .wo-mach-meta dd {
    margin: 0;
    color: #0f172a;
    font-weight: 600;
  }
  .wo-mach-empty {
    color: #94a3b8;
    font-weight: 500;
  }
  .wo-mach-schedule {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
  }
  .wo-mach-schedule__list {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .wo-mach-schedule__list li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: #374151;
  }
  .wo-mach-schedule__list li.is-overdue {
    color: #b91c1c;
    font-weight: 600;
  }
  .wo-st-schedule {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 220px;
    overflow: auto;
    padding: 8px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #f9fafb;
  }
  .wo-st-schedule__row {
    display: grid;
    grid-template-columns: minmax(110px, 1fr) minmax(140px, 1.2fr);
    gap: 8px;
    align-items: center;
  }
  .wo-st-schedule__label {
    font-size: 12px;
    font-weight: 600;
    color: #4b5563;
  }
  .wo-mach-edit-btn {
    border-radius: 10px;
    font-weight: 600;
    padding: 8px 12px;
  }

  .wo-mach-history {
    border: 1px solid #e8ecf2;
    border-radius: 14px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .wo-mach-history__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 14px;
    background: #fff;
    border-bottom: 1px solid #eef2f7;
  }
  .wo-mach-history__heading {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 700;
    color: #1e293b;
  }
  .wo-mach-history__heading i {
    color: #64748b;
    font-size: 16px;
  }
  .wo-mach-history__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: #eef2ff;
    color: #4338ca;
    font-size: 11px;
    font-weight: 700;
  }
  .wo-mach-history__list {
    list-style: none;
    margin: 0;
    padding: 8px 0 4px;
  }
  .wo-mach-history__empty {
    padding: 28px 16px;
    text-align: center;
    color: #64748b;
  }
  .wo-mach-history__empty i {
    display: block;
    font-size: 28px;
    color: #cbd5e1;
    margin-bottom: 8px;
  }
  .wo-mach-history__empty div {
    font-size: 13px;
    font-weight: 600;
    color: #475569;
  }
  .wo-mach-history__empty small {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: #94a3b8;
  }

  .wo-hist-item {
    display: grid;
    grid-template-columns: 18px 1fr;
    gap: 10px;
    padding: 10px 14px 14px;
    position: relative;
  }
  .wo-hist-item + .wo-hist-item {
    border-top: 1px solid #f1f5f9;
  }
  .wo-hist-item--busy {
    opacity: 0.65;
    pointer-events: none;
  }
  .wo-hist-item__rail {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 6px;
  }
  .wo-hist-item__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px #e2e8f0;
    flex-shrink: 0;
    z-index: 1;
  }
  .wo-hist-item__line {
    flex: 1;
    width: 2px;
    margin-top: 4px;
    background: #e2e8f0;
    border-radius: 2px;
    min-height: 24px;
  }
  .wo-hist-item__body {
    min-width: 0;
  }
  .wo-hist-item__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .wo-hist-item__badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .wo-hist-stage {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
  }
  .wo-hist-chip {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    color: #475569;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
  }
  .wo-hist-chip--muted {
    color: #64748b;
    background: #f8fafc;
  }
  .wo-hist-item__aside {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    flex-shrink: 0;
  }
  .wo-hist-date {
    font-size: 11px;
    color: #94a3b8;
    white-space: nowrap;
  }
  .wo-hist-actions {
    display: inline-flex;
    gap: 4px;
  }
  .wo-hist-action {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: #fff;
    color: #475569;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .wo-hist-action i {
    font-size: 15px;
  }
  .wo-hist-action:hover:not(:disabled) {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #0f172a;
  }
  .wo-hist-action--danger:hover:not(:disabled) {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }
  .wo-hist-action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .wo-hist-remark {
    margin: 8px 0 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: #f8fafc;
    border: 1px solid #eef2f7;
    color: #475569;
    font-size: 12px;
    line-height: 1.45;
  }
  .wo-hist-gallery {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .wo-hist-thumb {
    position: relative;
    width: 64px;
    height: 64px;
    flex-shrink: 0;
  }
  .wo-hist-thumb-btn {
    display: block;
    width: 64px;
    height: 64px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: zoom-in;
    border-radius: 10px;
    overflow: hidden;
    position: relative;
  }
  .wo-hist-thumb img,
  .wo-hist-thumb-btn img {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    display: block;
    background: #fff;
    transition: transform 0.2s ease;
  }
  .wo-hist-thumb-btn:hover img {
    transform: scale(1.04);
  }
  .wo-hist-thumb__zoom {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.35);
    color: #fff;
    opacity: 0;
    transition: opacity 0.15s ease;
    border-radius: 10px;
    pointer-events: none;
  }
  .wo-hist-thumb-btn:hover .wo-hist-thumb__zoom {
    opacity: 1;
  }
  .wo-hist-file {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 64px;
    height: 64px;
    padding: 6px;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #475569;
    font-size: 9px;
    text-align: center;
    text-decoration: none;
    word-break: break-all;
    line-height: 1.15;
  }
  .wo-hist-file i {
    font-size: 16px;
    color: #64748b;
  }
  .wo-hist-thumb__rm {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid #e2e8f0;
    background: #fff;
    color: #64748b;
    font-size: 12px;
    line-height: 1;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
    opacity: 0;
    transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .wo-hist-thumb:hover .wo-hist-thumb__rm,
  .wo-hist-thumb__rm:focus-visible {
    opacity: 1;
  }
  .wo-hist-thumb__rm:hover:not(:disabled) {
    color: #dc2626;
    border-color: #fecaca;
    background: #fef2f2;
  }
  .wo-hist-thumb__rm:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .wo-mach-toast {
    margin-top: 12px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
  }
  .wo-mach-toast--ok {
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
  }
  .wo-mach-toast--err {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }

  .item-cell { cursor: pointer; }
  .item-cell:hover { background: #f0f4ff; }
  .inline-cell-input {
    width: 100%; min-width: 55px; max-width: 110px;
    border: 1.5px solid #3b5bdb; border-radius: 4px;
    padding: 2px 24px 2px 4px; font-size: inherit; text-align: center;
    outline: none;
    background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%233b5bdb' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 6px center;
    background-size: 11px;
    -webkit-appearance: none; -moz-appearance: none; appearance: none;
  }
  @media print {
    @page { margin: 0; size: A4; }
    :global(*) {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    :global(.no-print) { display: none !important; }
    :global(.sidebar), :global(aside), :global(header.header), :global(.main-wrapper > .header) { display: none !important; }
    :global(.page-wrapper) { padding: 0 !important; margin: 0 !important; }
    :global(.content) { padding: 0 !important; margin: 0 !important; }
    :global(.card) { margin: 0 !important; border: 0 !important; box-shadow: none !important; }
    :global(.card-body) { margin: 0 !important; padding: 10mm !important; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
</style>
