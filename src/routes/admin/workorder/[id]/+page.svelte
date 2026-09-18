<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Loader from "$lib/components/Loader.svelte";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  import PIWOTIModal from "$lib/components/PIWOTIModal.svelte";
  import { checkAuth } from "$lib/utils/auth";

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
  let machineSaving = false;
  let machineMsg = "";
  let machineErr = "";

  // Modal state
  let piwotiOpen = false;
  let modalOrder = null;

  let workOrderId;
  $: workOrderId = $page.params.id;

  function categoryText(wo) {
    return String(wo?.category || wo?.order?.category || "").toLowerCase();
  }
  function isDispatchCat(wo) {
    if (wo?.isDispatchCategory != null) return !!wo.isDispatchCategory;
    const c = categoryText(wo);
    return c.includes("abrasive") || c.includes("spare part");
  }
  function isMachineCat(wo) {
    if (wo?.isMachineCategory != null) return !!wo.isMachineCategory;
    return categoryText(wo).includes("machine");
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
  }
  function statusBadgeClass(st) {
    if (st === "Completed") return "bg-success";
    if (st === "Dispatched") return "bg-primary";
    if (st === "Hold") return "bg-warning text-dark";
    return "bg-secondary";
  }

  async function updateStatus(nextStatus) {
    if (!workOrder?.id || statusUpdating) return;
    statusError = "";
    if (nextStatus === "Hold") {
      const remark = holdRemark.trim() || String(workOrder.remarks || "").trim();
      if (!remark) {
        statusError = 'Status "Hold" requires a remark.';
        return;
      }
    }
    statusUpdating = true;
    try {
      const payload = {
        status: nextStatus,
        companyId: workOrder.company?.id ?? workOrder.companyId,
      };
      if (nextStatus === "Hold" || holdRemark.trim()) {
        payload.remarks = holdRemark.trim() || workOrder.remarks || null;
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
      // refresh sentDelay from client rule if pending
      if (isDispatchCat(workOrder)) {
        workOrder = {
          ...workOrder,
          sentDelay: computeClientSentDelay(workOrder),
        };
      }
      holdRemark = "";
    } catch (err) {
      statusError = err?.message || "Failed to update work order status.";
      errorMessage = statusError;
    } finally {
      statusUpdating = false;
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

  async function saveMachinePanel() {
    if (!workOrder?.id || machineSaving) return;
    machineMsg = "";
    machineErr = "";
    machineSaving = true;
    try {
      if (machineCompletionDate) {
        const res = await authApiFetch(
          `${API_ROUTES.WORK_ORDER}/${workOrderId}/completion-date`,
          {
            method: "PUT",
            data: JSON.stringify({ completionDate: machineCompletionDate }),
          },
        );
        if (res?.data?.machine) {
          workOrder = { ...workOrder, machine: { ...workOrder.machine, ...res.data.machine } };
        }
      }
      const attrs = await authApiFetch(
        `${API_ROUTES.WORK_ORDER}/${workOrderId}/machine-attrs`,
        {
          method: "PUT",
          data: JSON.stringify({
            color: machineColor.trim() || null,
            size: machineSize.trim() || null,
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
      syncMachineForm(workOrder);
      machineMsg = "Machine details saved.";
    } catch (err) {
      machineErr = err?.message || "Failed to save machine details.";
    } finally {
      machineSaving = false;
    }
  }

  $: discussionEvents = (workOrder?.events || []).filter(
    (e) => e?.type === "discussion",
  );

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
              <span
                class="badge {statusBadgeClass(workOrder.status)}"
                style="font-size:11px;"
              >
                {workOrder.status || "Pending"}
              </span>
              {#if workOrder.category || workOrder.order?.category}
                <span class="badge bg-light text-dark border" style="font-size:11px;">
                  {workOrder.category || workOrder.order?.category}
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
          {#if isDispatchCat(workOrder)}
            <select
              class="form-select form-select-sm"
              style="width:auto;min-width:140px;"
              disabled={statusUpdating}
              value={workOrder.status || "Pending"}
              on:change={(e) => updateStatus(e.currentTarget.value)}
            >
              <option value="Pending">Pending</option>
              <option value="Dispatched">Dispatched</option>
              <option value="Hold">Hold</option>
              <option value="Completed">Completed</option>
            </select>
            <input
              type="text"
              class="form-control form-control-sm"
              style="width:200px;"
              placeholder="Remark (required for Hold)"
              bind:value={holdRemark}
              disabled={statusUpdating}
            />
            {#if workOrder.status !== "Completed"}
              <button
                type="button"
                class="btn btn-outline-success btn-sm"
                disabled={statusUpdating}
                on:click={() => updateStatus("Completed")}
              >
                Mark Completed
              </button>
            {:else}
              <button
                type="button"
                class="btn btn-outline-warning btn-sm"
                disabled={statusUpdating}
                on:click={() => updateStatus("Pending")}
              >
                Mark Pending
              </button>
            {/if}
          {:else if workOrder.status === "Completed"}
            <button
              type="button"
              class="btn btn-outline-warning btn-sm"
              disabled={statusUpdating}
              on:click={() => updateStatus("Pending")}
            >
              Mark Pending
            </button>
          {:else}
            <button
              type="button"
              class="btn btn-outline-success btn-sm"
              disabled={statusUpdating}
              on:click={() => updateStatus("Completed")}
            >
              Mark Completed
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

      {#if isMachineCat(workOrder)}
        <div class="card no-print mb-3">
          <div class="card-header py-2">
            <h6 class="mb-0"><i class="ti ti-settings me-1"></i>Machine details</h6>
          </div>
          <div class="card-body">
            <div class="row g-3 align-items-end">
              <div class="col-md-3">
                <label class="form-label mb-1" style="font-size:12px;">Completion date</label>
                <input type="date" class="form-control form-control-sm" bind:value={machineCompletionDate} disabled={machineSaving} />
              </div>
              <div class="col-md-3">
                <label class="form-label mb-1" style="font-size:12px;">Color</label>
                <input type="text" class="form-control form-control-sm" bind:value={machineColor} placeholder="Color" disabled={machineSaving} />
              </div>
              <div class="col-md-3">
                <label class="form-label mb-1" style="font-size:12px;">Size</label>
                <input type="text" class="form-control form-control-sm" bind:value={machineSize} placeholder="Size" disabled={machineSaving} />
              </div>
              <div class="col-md-3">
                <button type="button" class="btn btn-primary btn-sm" disabled={machineSaving} on:click={saveMachinePanel}>
                  {machineSaving ? "Saving…" : "Save machine details"}
                </button>
              </div>
            </div>
            {#if machineMsg}
              <div class="text-success mt-2" style="font-size:12px;">{machineMsg}</div>
            {/if}
            {#if machineErr}
              <div class="text-danger mt-2" style="font-size:12px;">{machineErr}</div>
            {/if}
            {#if workOrder.machine?.completionDate}
              <div class="text-muted mt-2" style="font-size:12px;">
                Current completion:
                {new Date(workOrder.machine.completionDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                {#if workOrder.machine.color} · Color: {workOrder.machine.color}{/if}
                {#if workOrder.machine.size} · Size: {workOrder.machine.size}{/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      {#if isMaster && isMachineCat(workOrder)}
        <div class="card no-print mb-3">
          <div class="card-header py-2 d-flex align-items-center justify-content-between gap-2 flex-wrap">
            <h6 class="mb-0"><i class="ti ti-messages me-1"></i>Discussions (master view)</h6>
            <span class="text-muted" style="font-size:11px;">Updates via guest API only</span>
          </div>
          <div class="card-body">
            {#if discussionEvents.length}
              <ul class="list-group list-group-flush">
                {#each discussionEvents as ev}
                  <li class="list-group-item px-0 py-2">
                    <div class="d-flex justify-content-between gap-2">
                      <div style="font-size:13px;">
                        <strong>{ev.remark || "(no remark)"}</strong>
                        {#if Array.isArray(ev.images) && ev.images.length}
                          <div class="d-flex flex-wrap gap-1 mt-1">
                            {#each ev.images as img}
                              <a
                                href={ATTACHMENT_BASE_URL + (img.url || "")}
                                target="_blank"
                                rel="noopener"
                                class="badge bg-light text-dark border"
                                style="font-size:10px;"
                              >
                                {img.fileName || "file"}
                              </a>
                            {/each}
                          </div>
                        {/if}
                      </div>
                      <div class="text-muted text-nowrap" style="font-size:11px;">
                        {#if ev.date}
                          {new Date(ev.date).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                        {:else if ev.createdAt}
                          {new Date(ev.createdAt).toLocaleString("en-IN")}
                        {/if}
                      </div>
                    </div>
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="text-muted" style="font-size:12px;">No discussions yet. Partners add via guest API.</div>
            {/if}
          </div>
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

<style>
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
