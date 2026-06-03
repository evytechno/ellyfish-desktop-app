<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Loader from "$lib/components/Loader.svelte";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  let loadingData = true;

  let errorMessage = "";
  let workOrder = null;
  let loading = false;
  let formErrors = {};
  let taxInvoiceId = null;
  let taxCheckDone = false;

  let workOrderId;
  $: workOrderId = $page.params.id;

  onMount(async () => {
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.WORK_ORDER}/${workOrderId}`);
      workOrder = data;
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
          const piId = piList.items[0].id;
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

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <!-- Start Content -->
  <div class="content pb-0">
    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap no-print">
      <div class="d-flex align-items-center gap-3">
        <button class="btn btn-outline-secondary btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <div class="d-flex align-items-center gap-2">
            <h4 class="mb-0">Work Order</h4>
            {#if workOrder?.workOrderNo}
              <span class="text-muted fw-normal fs-5">#{String(workOrder.workOrderNo).padStart(6, "0")}</span>
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
      <a href="/admin/workorder/edit/{workOrderId}" class="btn btn-primary btn-sm">
        <i class="ti ti-edit me-1"></i>Edit Work Order
      </a>
    </div>
    <!-- End Page Header -->
    {#if workOrder}
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
                    <div class="font-medium">Work Order No. :</div>
                    <div>{workOrder?.orderNo}</div>
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
                      <div>{workOrder?.user?.name}</div>
                    </div>
                  {/if}
                  {#if workOrder?.poNumber}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">PO Number :</div>
                      <div>{workOrder?.poNumber}</div>
                    </div>
                  {/if}
                  {#if workOrder?.company}
                    <div class="grid grid-cols-2 gap-2">
                      <div class="font-medium">Billing :</div>
                      <div>{workOrder?.company?.name}</div>
                    </div>
                  {/if}
                  <div class="grid grid-cols-2 gap-2">
                    <div class="font-medium">Uniq No. :</div>
                    <div>
                      #{workOrder?.workOrderNo?.toString().padStart(6, "0")}
                    </div>
                  </div>
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
                      <div class="font-medium">In Coterms :</div>
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
                  <table class="w-full border table-nowrap">
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
                          <td class="p-2 capitalize">{item?.item}</td>

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
                    <a href="/admin/invoice/create?fromOrder={workOrder.order.id}" class="btn btn-warning btn-sm">
                      <i class="ti ti-file-plus me-1"></i>Create Tax Invoice
                    </a>
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

<style>
  .item-cell { cursor: pointer; }
  .item-cell:hover { background: #f0f4ff; }
  .inline-cell-input {
    width: 100%; min-width: 55px; max-width: 110px;
    border: 1.5px solid #3b5bdb; border-radius: 4px;
    padding: 2px 4px; font-size: inherit; text-align: center;
    outline: none; background: #fff;
  }
  @media print {
    @page {
      padding: 5mm;
    }

    .no-print {
      display: none;
      padding: 0;
      margin: 0;
    }
    .pageHeader {
      margin: 0 !important;
      padding: 0 !important;
    }
    .card {
      margin: 0;
      border: 0;
    }
    .card-body {
      margin: 0;
    }
    .content {
      padding: 0;
      margin: 0;
    }
  }
</style>
