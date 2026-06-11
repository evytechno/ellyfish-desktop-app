<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { numberToWords } from "$lib/utils/numberToWords";
  import Loader from "$lib/components/Loader.svelte";
  import InvoiceExport from "$lib/components/InvoiceExport.svelte";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";

  let loadingData = true;
  let errorMessage = "";
  let invoice = null;
  let formErrors = {};
  let taxInvoiceId = null;
  let taxCheckDone = false;
  let workOrderId = null;
  let workOrderCheckDone = false;

  let invoiceId;
  $: invoiceId = $page.params.id;

  onMount(async () => {
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.ORDER_PAYMENT}/${invoiceId}`);
      invoice = data;
    } catch (err) {
      errorMessage = "Failed to load invoice data.";
    } finally {
      setTimeout(() => { loadingData = false; }, 500);
    }

    try {
      const res = await authApiFetch(`${API_ROUTES.INVOICE}/by-pi/${invoiceId}`);
      taxInvoiceId = res?.taxInvoiceId ?? null;
    } catch {
      taxInvoiceId = null;
    } finally {
      taxCheckDone = true;
    }

    // Check if work order already exists for this order
    try {
      if (invoice?.order?.id) {
        const check = await authApiFetch(`${API_ROUTES.WORK_ORDER}/check/${invoice.order.id}`);
        workOrderId = check?.count > 0 ? check.items[0].id : null;
      }
    } catch {
      workOrderId = null;
    } finally {
      workOrderCheckDone = true;
    }
  });

  $: subtotal =
    (invoice?.items ?? []).reduce((sum, item) => sum + (item.total ?? 0), 0) -
    (invoice?.discount ?? 0);
  $: extratotal = (invoice?.extraItems ?? []).reduce((sum, item) => sum + (item.total ?? 0), 0);
  $: subplustotal = (subtotal ?? 0) + (extratotal ?? 0);
  $: taxtotal = invoice?.taxItems?.length
    ? invoice.taxItems.reduce((sum, item) => sum + (item.total ?? 0), 0)
    : 0;
  $: total = Math.round((subplustotal ?? 0) + (taxtotal ?? 0));
  $: totalInWord = numberToWords(Number.isFinite(total) ? Math.round(total) : 0) + " Only";

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];

  function getShortName(name) {
    if (!name) return "";
    return name.trim().split(" ")[0].toUpperCase();
  }

  $: pageTitle =
    invoice && invoice.company && invoice.invoiceNo && invoice.company.name
      ? `${getShortName(invoice.company.name)}_PI_${invoice.invoiceNo.toString().padStart(6, "0")}`
      : "Loading...";

  $: piNumber = invoice?.invoiceNo
    ? `${invoice.financialYear ?? ""}/${invoice.invoiceNo.toString().padStart(6, "0")}`
    : "";

  $: statusColor =
    invoice?.status === "Paid" ? "success" :
    invoice?.status === "Partially Paid" ? "warning" : "danger";

  // ── Inline item edit ──────────────────────────────────────────────────────
  const unitOptions = ["Pcs", "Kg", "g", "L", "mL", "m", "cm", "Set", "Box", "Nos"];
  let editingCell = null; // { rowIndex, field }
  let editingValue = "";
  let savingItems = false;

  function startCellEdit(rowIndex, field) {
    const item = invoice.items[rowIndex];
    editingCell = { rowIndex, field };
    editingValue = String(item[field] ?? "");
  }

  function cancelCellEdit() {
    editingCell = null;
    editingValue = "";
  }

  async function commitCell() {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell;
    const updatedItems = invoice.items.map((item, i) => {
      if (i !== rowIndex) return item;
      const updated = { ...item, [field]: field === "quantity" || field === "unitPrice" ? Number(editingValue) : editingValue };
      updated.total = parseFloat(((updated.quantity || 0) * (updated.unitPrice ?? updated.price ?? 0)).toFixed(2));
      return updated;
    });
    editingCell = null;
    editingValue = "";
    savingItems = true;
    try {
      await authApiFetch(`${API_ROUTES.ORDER_PAYMENT}/${invoiceId}`, {
        method: "PUT",
        data: JSON.stringify({ items: updatedItems }),
      });
      invoice = { ...invoice, items: updatedItems };
    } catch {
      // revert on error
      invoice = { ...invoice };
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
  <title>{pageTitle}</title>
</svelte:head>

{#if loadingData}<Loader />{/if}

<div class="page-wrapper">
  <div class="content pb-0">

    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap no-print">
      <div class="d-flex align-items-center gap-3">
        <button class="btn btn-outline-secondary btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <div class="d-flex align-items-center gap-2">
            <h4 class="mb-0">Proforma Invoice</h4>
            {#if piNumber}
              <span class="text-muted fw-normal fs-5">#{piNumber}</span>
            {/if}
            {#if invoice?.status}
              <span class="badge bg-{statusColor}">{invoice.status}</span>
            {/if}
          </div>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              <li class="breadcrumb-item"><a href="/admin/invoice">Invoices</a></li>
              <li class="breadcrumb-item active">PI Detail</li>
            </ol>
          </nav>
        </div>
      </div>

      <!-- Top: Edit only -->
      {#if invoice}
        <a href="/admin/invoice/edit/{invoiceId}" class="btn btn-primary btn-sm">
          <i class="ti ti-edit me-1"></i>Edit PI
        </a>
      {/if}
    </div>

    {#if invoice}
      <div class="row">
        <div class="col-lg-10 mx-auto">
          <div class="card printInvoice" id="printInvoice">
            <div class="card-body">
              <div class="space-y-4">

                <!-- Header: Company + Invoice Info -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <div>GST NO. <span class="font-semibold">{invoice?.company?.gstNumber}</span></div>
                    <div>
                      <img src={ATTACHMENT_BASE_URL + invoice?.company?.logo} alt={invoice?.company?.name} width="200px" />
                    </div>
                    <div class="space-y-1">
                      <div class="font-semibold text-lg">{invoice?.company?.name}</div>
                      <div>{invoice?.company?.address}</div>
                      <div>Contact No. : {invoice?.company?.mobile}</div>
                      <div>Email : {invoice?.company?.email}</div>
                    </div>
                  </div>
                  <div class="flex flex-col space-y-2">
                    <div class="space-y-2">
                      <div class="flex items-center justify-between p-2 px-0 text-lg font-semibold">
                        <div>Proforma Invoice</div>
                        <div>#{invoice?.invoiceNo?.toString().padStart(6, "0")}</div>
                      </div>
                      <div class="flex items-center justify-between p-2 text-lg bg-[#106ab0] text-white">
                        <div>{invoice?.totalAmountTitle || "Total Amount"}</div>
                        <div>
                          {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                          {invoice?.totalAmountValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                        </div>
                      </div>
                      <div class="flex items-center justify-between p-2 px-0">
                        <div>Date</div>
                        <div>{`${String(new Date(invoice.invoiceDate).getDate()).padStart(2,"0")}-${String(new Date(invoice.invoiceDate).getMonth()+1).padStart(2,"0")}-${new Date(invoice.invoiceDate).getFullYear()}`}</div>
                      </div>
                    </div>
                    {#if invoice?.poNumber || invoice?.poDate}
                      <div>
                        {#if invoice?.poNumber}
                          <div class="flex items-center justify-between pb-1 px-0">
                            <div>PO Number</div>
                            <div>{invoice?.poNumber}</div>
                          </div>
                        {/if}
                        {#if invoice?.poDate}
                          <div class="flex items-center justify-between pb-1 px-0">
                            <div>PO Date</div>
                            <div>{`${String(new Date(invoice?.poDate).getDate()).padStart(2,"0")}-${String(new Date(invoice?.poDate).getMonth()+1).padStart(2,"0")}-${new Date(invoice?.poDate).getFullYear()}`}</div>
                          </div>
                        {/if}
                      </div>
                    {/if}
                    {#if invoice?.priceTerms}
                      <div class="flex items-center justify-between pb-1 px-0">
                        <div>Payment</div>
                        <div>{invoice.priceTerms}</div>
                      </div>
                    {/if}
                  </div>
                </div>

                <!-- Bill To / Ship To -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <div class="font-semibold">Bill To :</div>
                    <div class="space-y-1">
                      <div>{invoice?.billToName}</div>
                      <div>{invoice?.billToAddress}</div>
                      {#if invoice?.billToGSTNumber}<div>GSTIN : {invoice?.billToGSTNumber}</div>{/if}
                      {#if invoice?.billToMobile}<div>Contact No. : {invoice?.billToMobile}</div>{/if}
                      {#if invoice?.billToEmail}<div>Email : {invoice?.billToEmail}</div>{/if}
                    </div>
                  </div>
                  <div class="space-y-2">
                    <div class="font-semibold">Ship To :</div>
                    <div class="space-y-1">
                      <div>{invoice?.shipToName}</div>
                      <div>{invoice?.shipToAddress}</div>
                      {#if invoice?.shipToGSTNumber}<div>GSTIN : {invoice?.shipToGSTNumber}</div>{/if}
                      {#if invoice?.shipToMobile}<div>Contact No. : {invoice?.shipToMobile}</div>{/if}
                      {#if invoice?.shipToEmail}<div>Email : {invoice?.shipToEmail}</div>{/if}
                    </div>
                  </div>
                </div>

                <!-- Items Table -->
                <div class="table-responsive">
                  <table class="w-full">
                    <thead class="bg-[#106ab0] text-white">
                      <tr>
                        <th class="border p-2 text-white text-center">No.</th>
                        <th class="border p-2 text-white">Name</th>
                        <th class="border p-2 text-white text-center">Qty</th>
                        <th class="border p-2 text-white text-center">Unit</th>
                        <th class="border p-2 text-white text-center">Unit Price</th>
                        <th class="border p-2 text-white text-center">HS Code</th>
                        <th class="border p-2 text-white text-center">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each invoice?.items as item, index}
                        {@const sym = currencies.find((c) => c.code === invoice?.currency)?.symbol ?? "₹"}
                        <tr class="item-row">
                          <td class="border p-2 text-center">{index + 1}.</td>
                          <td class="border p-2 capitalize">{item?.item}</td>

                          <!-- Qty -->
                          <td class="border p-2 text-center item-cell" on:click={() => startCellEdit(index, "quantity")}>
                            {#if editingCell?.rowIndex === index && editingCell?.field === "quantity"}
                              <input class="inline-cell-input" type="number" min="0" bind:value={editingValue}
                                on:blur={commitCell} on:keydown={handleCellKeydown} autofocus />
                            {:else}
                              {item?.quantity}
                            {/if}
                          </td>

                          <!-- Unit -->
                          <td class="border p-2 text-center item-cell" on:click={() => startCellEdit(index, "unit")}>
                            {#if editingCell?.rowIndex === index && editingCell?.field === "unit"}
                              <select class="inline-cell-input" bind:value={editingValue}
                                on:change={commitCell} on:blur={commitCell} on:keydown={handleCellKeydown} autofocus>
                                {#each unitOptions as u}<option value={u}>{u}</option>{/each}
                              </select>
                            {:else}
                              {item?.unit || "Pcs"}
                            {/if}
                          </td>

                          <!-- Unit Price -->
                          <td class="border p-2 text-center item-cell" on:click={() => startCellEdit(index, "unitPrice")}>
                            {#if editingCell?.rowIndex === index && editingCell?.field === "unitPrice"}
                              <input class="inline-cell-input" type="number" min="0" bind:value={editingValue}
                                on:blur={commitCell} on:keydown={handleCellKeydown} autofocus />
                            {:else}
                              {sym}{item?.unitPrice?.toFixed(2) ?? item?.price?.toFixed(2) ?? "0.00"}/-
                            {/if}
                          </td>

                          <!-- HS Code -->
                          <td class="border p-2 text-center item-cell" on:click={() => startCellEdit(index, "hsCode")}>
                            {#if editingCell?.rowIndex === index && editingCell?.field === "hsCode"}
                              <input class="inline-cell-input" type="text" bind:value={editingValue}
                                on:blur={commitCell} on:keydown={handleCellKeydown} autofocus />
                            {:else}
                              {item.hsCode || "-"}
                            {/if}
                          </td>

                          <td class="border p-2 text-center">
                            {sym}{(item?.total ?? 0).toFixed(2)}/-
                          </td>
                        </tr>
                      {/each}
                      {#each invoice?.extraItems as item1, index1}
                        <tr>
                          <td class="border p-2 text-center">{invoice?.items.length + index1 + 1}.</td>
                          <td class="border p-2 capitalize" colspan="5">{item1?.item}</td>
                          <td class="border p-2 text-center">
                            {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                            {(item1?.total ?? 0).toFixed(2)}/-
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>

                <!-- Bank Details + Totals -->
                <div class="grid grid-cols-2 gap-4 avoid-page-break">
                  <div class="space-y-2">
                    <div class="font-semibold">Bank Details :</div>
                    <div class="space-y-1">
                      {#each [invoice?.selectedBankAccount ?? invoice?.company] as b}
                        {#if b?.accountHolderName}<div>Account Holder Name : {b.accountHolderName}</div>{/if}
                        {#if b?.bankName}<div>Bank Name : {b.bankName}</div>{/if}
                        {#if b?.branchAddress || b?.bankAddress}<div>Bank Address : {b.branchAddress || b.bankAddress}</div>{/if}
                        {#if b?.accountNumber}<div>Account Number : {b.accountNumber}</div>{/if}
                        {#if invoice?.currency === "USD" && invoice?.swiftCode}<div>Swift Code : {invoice.swiftCode}</div>{/if}
                        {#if b?.ifscCode}<div>IFSC Code : {b.ifscCode}</div>{/if}
                      {/each}
                    </div>
                  </div>
                  <div>
                    <div class="flex items-center justify-between py-2 font-semibold">
                      <div>Subtotal</div>
                      <div>{currencies.find((c) => c.code === invoice?.currency)?.symbol} {subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-</div>
                    </div>
                    {#if invoice?.discount != 0}
                      <div class="flex items-center justify-between py-0.5">
                        <div>Discount</div>
                        <div>{currencies.find((c) => c.code === invoice?.currency)?.symbol} {invoice?.discount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-</div>
                      </div>
                    {/if}
                    <div class="mb-2">
                      {#each invoice?.taxItems as item2}
                        <div class="flex items-center justify-between py-0.5">
                          <div>{item2?.item} ({item2?.percentage}%)</div>
                          <div>{currencies.find((c) => c.code === invoice?.currency)?.symbol} {item2?.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-</div>
                        </div>
                      {/each}
                    </div>
                    <div class="flex items-center justify-between p-2 text-lg bg-[#106ab0] text-white">
                      <div>Total Amount</div>
                      <div>{currencies.find((c) => c.code === invoice?.currency)?.symbol} {total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-</div>
                    </div>
                    <div class="flex items-center justify-start py-2">
                      {invoice?.currency} : {totalInWord}
                    </div>
                  </div>
                </div>

                <!-- Declaration -->
                <div class="text-left text-xs">
                  Declaration: We declare that this Invoice shows the actual price of goods described and that all particulars are true and correct.
                </div>

                <!-- Terms & Conditions -->
                {#if invoice?.termsConditions}
                  <div class="text-left text-xs">
                    <span class="font-semibold">Terms & Conditions: </span>{invoice?.termsConditions}
                  </div>
                {/if}

                <!-- Remarks -->
                {#if invoice?.remarks}
                  <div class="text-left text-xs">
                    <span class="font-semibold">Remarks: </span>{invoice?.remarks}
                  </div>
                {/if}

              </div>

              <!-- Bottom Action Bar -->
              <div class="no-print d-flex align-items-center justify-content-end gap-2 flex-wrap mt-4 pt-4 border-top">
                <!-- <InvoiceExport {invoice} /> -->
                {#if workOrderCheckDone}
                  {#if workOrderId}
                    <a href="/admin/workorder/{workOrderId}" class="btn btn-success btn-sm">
                      <i class="ti ti-clipboard me-1"></i>View Work Order
                    </a>
                  {:else}
                    <a href="/admin/workorder/add?fromInvoice={invoiceId}" class="btn btn-success btn-sm">
                      <i class="ti ti-clipboard-plus me-1"></i>Create Work Order
                    </a>
                  {/if}
                {/if}
                {#if taxCheckDone}
                  {#if taxInvoiceId}
                    <a href="/admin/invoice/tax/{taxInvoiceId}" class="btn btn-info btn-sm">
                      <i class="ti ti-file-invoice me-1"></i>View Tax Invoice
                    </a>
                  {:else if invoice?.order?.id}
                    <a href="/admin/invoice/tax?fromOrder={invoice.order.id}" class="btn btn-warning btn-sm">
                      <i class="ti ti-file-plus me-1"></i>Create Tax Invoice
                    </a>
                  {/if}
                {/if}
                <button class="btn btn-primary btn-sm" on:click={() => window.print()}>
                  <i class="ti ti-printer me-1"></i>Print
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    {:else if errorMessage}
      <div class="alert alert-danger">{errorMessage}</div>
    {:else}
      <div class="text-muted">Loading invoice details...</div>
    {/if}

  </div>
</div>

<style>
  .item-cell { cursor: pointer; }
  .item-cell:hover { background: #f0f4ff; }
  .inline-cell-input {
    width: 100%; min-width: 60px; max-width: 120px;
    border: 1.5px solid #3b5bdb; border-radius: 4px;
    padding: 2px 4px; font-size: inherit; text-align: center;
    outline: none; background: #fff;
  }
  .item-row .item-cell { position: relative; }
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
    .avoid-page-break { page-break-inside: avoid; break-inside: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
</style>
