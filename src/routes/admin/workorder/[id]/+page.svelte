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
  let holdRemark = "";
  let statusError = "";

  const currentUser = checkAuth();
  const isMaster = currentUser?.role === "master";

  // Machine panel
  let machineCompletionDate = "";
  let machineColor = "";
  let machineSize = "";
  let machineStage = "Meeting";
  let machineSaving = false;
  let machineStageSaving = false;
  let machineMsg = "";
  let machineErr = "";
  let machineDrawerOpen = false;
  let historyBusyId = null;
  let addImagesEventId = null;
  let lightboxImages = [];
  let lightboxStart = 0;

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

  $: stageEvents = (workOrder?.events || []).filter((e) => e.type === "stage");

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
  function syncMachineForm(wo) {
    const m = wo?.machine;
    machineCompletionDate = toDateInput(m?.completionDate);
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

  async function updateStatus(nextStatus, remarks) {
    if (!workOrder?.id || statusUpdating) return;
    statusError = "";
    const remarkVal =
      remarks !== undefined
        ? String(remarks || "").trim()
        : holdRemark.trim() || String(workOrder.remarks || "").trim();
    if (nextStatus === "Hold" && !remarkVal) {
      statusError = 'Status "Hold" requires a remark.';
      return;
    }
    statusUpdating = true;
    try {
      const payload = {
        status: nextStatus,
        companyId: workOrder.company?.id ?? workOrder.companyId,
      };
      if (nextStatus === "Hold" || remarkVal) {
        payload.remarks = remarkVal || null;
      }
      const data = await authApiFetch(`${API_ROUTES.WORK_ORDER}/${workOrderId}`, {
        method: "PUT",
        data: JSON.stringify(payload),
      });
      workOrder = {
        ...workOrder,
        status: data?.data?.status ?? nextStatus,
        remarks: payload.remarks !== undefined ? payload.remarks : workOrder.remarks,
      };
      if (isDispatchCat(workOrder)) {
        workOrder = {
          ...workOrder,
          sentDelay: computeClientSentDelay(workOrder),
        };
      }
      holdRemark = workOrder.status === "Hold" ? (workOrder.remarks || "") : "";
    } catch (err) {
      statusError = err?.message || "Failed to update work order status.";
      errorMessage = statusError;
      throw err;
    } finally {
      statusUpdating = false;
    }
  }

  async function openStatusChangeModal() {
    if (!workOrder?.id || statusUpdating) return;
    statusError = "";
    const current = workOrder.status || "Pending";
    const isDispatch = isDispatchCat(workOrder);
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
          <div style="font-size:15px;font-weight:700;color:#111827;font-family:ui-monospace,monospace;">${workOrder.workOrderNo || `WO #${workOrder.id}`}</div>
        </div>
        <div id="wo-st-opts" style="text-align:left;">${optsHtml}</div>
        <div id="wo-st-hold-wrap" style="display:${current === "Hold" ? "block" : "none"};text-align:left;margin-top:4px;">
          <label style="font-size:12px;font-weight:600;color:#374151;">Hold remark</label>
          <input id="wo-st-hold-remark" class="swal2-input" style="width:100%;margin:6px 0 0;" placeholder="Required for Hold" value="${String(workOrder.remarks || "").replace(/"/g, "&quot;")}" />
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
      await updateStatus(result.status, result.remarks);
      Swal.fire("Updated", `Status set to ${result.status}.`, "success");
    } catch (err) {
      Swal.fire("Error", err?.message || statusError || "Failed to update status.", "error");
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
        workOrder = { ...workOrder, machine: { ...(workOrder.machine || {}), ...res.data.machine } };
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
          color: attrs.data.color,
          size: attrs.data.size,
          completionDate:
            attrs.data.completionDate ?? workOrder.machine?.completionDate ?? null,
        },
      };
    }
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

  function escAttr(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function openMachineDetailsModal() {
    if (!workOrder?.id || machineSaving || machineStageSaving) return;
    machineMsg = "";
    machineErr = "";

    const currentStage = workOrder.machine?.stage || machineStage || "Meeting";
    const currentDate = toDateInput(workOrder.machine?.completionDate) || machineCompletionDate || "";
    const currentColor = workOrder.machine?.color || machineColor || "";
    const currentSize = workOrder.machine?.size || machineSize || "";

    const optsHtml = MACHINE_STAGES.map((st) => {
      const s = MACHINE_STAGE_STYLE[st] || { bg: "#e5e7eb", color: "#374151" };
      const selected = st === currentStage;
      return `
        <button type="button" class="wo-stage-opt" data-value="${st}" style="
          display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;
          border:1.5px solid ${selected ? "#2563eb" : "#e5e7eb"};border-radius:12px;padding:10px 12px;margin:0 0 6px;
          background:${selected ? "#f8fafc" : "#fff"};cursor:pointer;outline:none;
          box-shadow:${selected ? "0 0 0 3px rgba(37,99,235,0.12)" : "none"};
        ">
          <span style="
            display:inline-flex;align-items:center;justify-content:center;
            min-width:120px;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;
            background:${s.bg};color:${s.color};
          ">${st}</span>
          <span class="wo-stage-check" style="
            flex-shrink:0;width:20px;height:20px;border-radius:50%;border:2px solid ${selected ? "#2563eb" : "#d1d5db"};
            background:${selected ? "#2563eb" : "transparent"};color:${selected ? "#fff" : "transparent"};
            display:inline-flex;align-items:center;justify-content:center;font-size:11px;
          ">✓</span>
        </button>`;
    }).join("");

    const { value: result, isConfirmed } = await Swal.fire({
      title: "Edit machine details",
      html: `
        <div style="text-align:left;margin:0 0 12px;">
          <div style="font-size:12px;color:#6b7280;">Work order</div>
          <div style="font-size:15px;font-weight:700;color:#111827;font-family:ui-monospace,monospace;">${escAttr(workOrder.workOrderNo || `WO #${workOrder.id}`)}</div>
        </div>
        <div style="text-align:left;margin-bottom:6px;font-size:12px;font-weight:600;color:#374151;">Production stage</div>
        <div id="wo-stage-opts" style="text-align:left;max-height:220px;overflow:auto;margin-bottom:10px;">${optsHtml}</div>
        <div style="text-align:left;margin-bottom:10px;">
          <label style="font-size:12px;font-weight:600;color:#374151;">Stage remark (optional)</label>
          <input id="wo-stage-remark" class="swal2-input" style="width:100%;margin:6px 0 0;" placeholder="Note when updating stage" />
        </div>
        <div style="text-align:left;margin-bottom:10px;">
          <label style="font-size:12px;font-weight:600;color:#374151;">Completion date</label>
          <input id="wo-mach-date" type="date" class="swal2-input" style="width:100%;margin:6px 0 0;" value="${escAttr(currentDate)}" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:left;">
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;">Color</label>
            <input id="wo-mach-color" class="swal2-input" style="width:100%;margin:6px 0 0;" placeholder="Color" value="${escAttr(currentColor)}" />
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;">Size</label>
            <input id="wo-mach-size" class="swal2-input" style="width:100%;margin:6px 0 0;" placeholder="Size" value="${escAttr(currentSize)}" />
          </div>
        </div>
        <div style="text-align:left;margin-top:10px;">
          <label style="font-size:12px;font-weight:600;color:#374151;">Stage images (optional)</label>
          <input id="wo-stage-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple class="swal2-file" style="width:100%;margin:6px 0 0;font-size:12px;" />
          <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Attached to the new stage history entry.</div>
        </div>
        <input type="hidden" id="wo-stage-value" value="${escAttr(currentStage)}" />
      `,
      width: 480,
      showCancelButton: true,
      confirmButtonText: "Save details",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#9ca3af",
      focusConfirm: false,
      preConfirm: () => {
        const stage = document.getElementById("wo-stage-value")?.value || currentStage;
        const remark = String(document.getElementById("wo-stage-remark")?.value || "").trim();
        const completionDate = String(document.getElementById("wo-mach-date")?.value || "").trim();
        const color = String(document.getElementById("wo-mach-color")?.value || "").trim();
        const size = String(document.getElementById("wo-mach-size")?.value || "").trim();
        const files = Array.from(document.getElementById("wo-stage-images")?.files || []);

        const stageChanged = stage !== currentStage;
        const attrsChanged =
          completionDate !== currentDate ||
          color !== currentColor ||
          size !== currentSize;
        const hasImages = files.length > 0;

        if (!stageChanged && !remark && !attrsChanged && !hasImages) {
          Swal.showValidationMessage("Change a field, add a remark, or attach images.");
          return false;
        }
        return {
          stage,
          remark: remark || undefined,
          stageChanged,
          updateStage: stageChanged || !!remark || hasImages,
          files,
          completionDate,
          color,
          size,
          attrsChanged,
        };
      },
      didOpen: () => {
        const wrap = document.getElementById("wo-stage-opts");
        const hidden = document.getElementById("wo-stage-value");
        if (!wrap || !hidden) return;
        const select = (btn) => {
          wrap.querySelectorAll(".wo-stage-opt").forEach((el) => {
            el.style.borderColor = "#e5e7eb";
            el.style.boxShadow = "none";
            el.style.background = "#fff";
            const check = el.querySelector(".wo-stage-check");
            if (check) {
              check.style.borderColor = "#d1d5db";
              check.style.background = "transparent";
              check.style.color = "transparent";
            }
          });
          btn.style.borderColor = "#2563eb";
          btn.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.15)";
          btn.style.background = "#f8fafc";
          const check = btn.querySelector(".wo-stage-check");
          if (check) {
            check.style.borderColor = "#2563eb";
            check.style.background = "#2563eb";
            check.style.color = "#fff";
          }
          hidden.value = btn.getAttribute("data-value") || "";
        };
        wrap.querySelectorAll(".wo-stage-opt").forEach((btn) => {
          btn.addEventListener("click", () => select(btn));
        });
      },
    });

    if (!isConfirmed || !result) return;

    machineSaving = true;
    machineStageSaving = true;
    try {
      if (result.updateStage) {
        await applyMachineStage({
          stage: result.stage,
          remark: result.remark,
          files: result.files || [],
        });
      }
      if (result.attrsChanged) {
        await applyMachineAttrs({
          completionDate: result.completionDate,
          color: result.color,
          size: result.size,
        });
      }
      syncMachineForm(workOrder);
      machineMsg = "Machine details saved.";
      Swal.fire("Updated", "Machine details saved.", "success");
    } catch (err) {
      machineErr = err?.message || "Failed to save machine details.";
      Swal.fire("Error", machineErr, "error");
    } finally {
      machineSaving = false;
      machineStageSaving = false;
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
      holdRemark = workOrder?.status === "Hold" ? (workOrder.remarks || "") : "";
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
          {#if isMachineCat(workOrder)}
            <button
              type="button"
              class="btn btn-outline-primary btn-sm"
              on:click={() => (machineDrawerOpen = true)}
            >
              <i class="ti ti-settings me-1"></i>Machine detail
              {#if isMaster && stageEvents.length}
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

<LightBox bind:data={lightboxImages} startIndex={lightboxStart} />

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
            <dt>Completion date</dt>
            <dd>
              {#if workOrder.machine?.completionDate}
                {new Date(workOrder.machine.completionDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}
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

        <button
          type="button"
          class="btn btn-outline-primary btn-sm w-100 wo-mach-edit-btn"
          disabled={machineSaving || machineStageSaving}
          on:click={openMachineDetailsModal}
        >
          <i class="ti ti-edit me-1"></i>
          {machineSaving || machineStageSaving ? "Saving…" : "Edit machine details"}
        </button>
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
        <section class="wo-mach-history">
          <div class="wo-mach-history__title">
            <div class="wo-mach-history__heading">
              <i class="ti ti-timeline"></i>
              <span>Stage history</span>
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
                      style="background:{(MACHINE_STAGE_STYLE[ev.meta?.stage || workOrder.machine?.stage] || {}).bg || '#94a3b8'};"
                    ></span>
                    {#if i < stageEvents.length - 1}
                      <span class="wo-hist-item__line"></span>
                    {/if}
                  </div>

                  <div class="wo-hist-item__body">
                    <div class="wo-hist-item__top">
                      <div class="wo-hist-item__badges">
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
                      </div>

                      <div class="wo-hist-item__aside">
                        <time class="wo-hist-date">
                          {#if ev.date}
                            {new Date(ev.date).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                          {:else if ev.createdAt}
                            {new Date(ev.createdAt).toLocaleString("en-IN")}
                          {/if}
                        </time>
                        <div class="wo-hist-actions">
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
                      </div>
                    </div>

                    {#if ev.remark}
                      <p class="wo-hist-remark">{ev.remark}</p>
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
              <div>No stage history yet</div>
              <small>Updates from Edit machine details will appear here.</small>
            </div>
          {/if}
        </section>
      {/if}

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
    grid-template-columns: 118px 1fr;
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
  .wo-hist-thumb img {
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
