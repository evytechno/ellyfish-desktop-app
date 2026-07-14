<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { numberToWords } from "$lib/utils/numberToWords";
  import Loader from "$lib/components/Loader.svelte";
  import Swal from "sweetalert2";

  let loadingData = true;
  let errorMessage = "";
  let invoice = null;
  let locking = false;
  let piCompany = null;

  let invoiceId;
  $: invoiceId = $page.params.id;

  onMount(async () => {
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.INVOICE}/${invoiceId}`);
      invoice = data;

      // If companySnapshot is empty, fetch PI directly to get company data
      const snap = data?.companySnapshot;
      const snapEmpty = !snap || !snap.name;
      if (snapEmpty && data?.pi?.id) {
        try {
          const pi = await authApiFetch(`${API_ROUTES.ORDER_PAYMENT}/${data.pi.id}`);
          piCompany = pi?.company ?? null;
        } catch {
          piCompany = null;
        }
      }
    } catch (err) {
      errorMessage = "Failed to load invoice data.";
    } finally {
      setTimeout(() => { loadingData = false; }, 500);
    }
  });

  $: subtotal =
    (invoice?.items ?? []).reduce((sum, item) => sum + (item.total ?? 0), 0) -
    (invoice?.discount ?? 0);
  $: extratotal = (invoice?.extraItems ?? []).reduce(
    (sum, item) => sum + (item.total ?? 0), 0
  );
  $: taxableExtraTotal = (invoice?.extraItems ?? []).reduce((sum, item) => sum + (item.taxable !== false ? (item.total ?? 0) : 0), 0);
  $: nonTaxableExtraTotal = (invoice?.extraItems ?? []).reduce((sum, item) => sum + (item.taxable === false ? (item.total ?? 0) : 0), 0);
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

  // Use companySnapshot if it has data, else fall back to PI's company relation
  $: displayCompany = invoice?.companySnapshot?.name
    ? invoice.companySnapshot
    : (piCompany ?? invoice?.company ?? null);

  $: pageTitle =
    invoice && displayCompany && invoice.invoiceNo
      ? `${getShortName(displayCompany.name)}_INV_${invoice.invoiceNo.toString().padStart(6, "0")}`
      : "Loading...";

  async function lockInvoice() {
    const result = await Swal.fire({
      title: "Lock Invoice?",
      text: "Once locked, this invoice cannot be edited. This action is permanent.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Lock It",
    });
    if (!result.isConfirmed) return;
    locking = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.INVOICE}/${invoiceId}/lock`, {
        method: "PUT",
      });
      invoice = data.data;
      Swal.fire("Locked!", "Invoice has been locked successfully.", "success");
    } catch (err) {
      Swal.fire("Error", "Failed to lock invoice.", "error");
    } finally {
      locking = false;
    }
  }
</script>

<svelte:head>
  <title>{pageTitle}</title>
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
  <div class="content pb-0">
    <div class="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap no-print">
      <div class="d-flex align-items-center gap-3">
        <button class="btn btn-warning btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <div class="d-flex align-items-center gap-2">
            <h4 class="mb-0">Tax Invoice</h4>
            {#if invoice?.invoiceNo}
              <span class="text-muted fw-normal fs-5">#{String(invoice.invoiceNo).padStart(6, "0")}</span>
            {/if}
            {#if invoice}
              <span class="badge {invoice.isLocked ? 'bg-success' : 'bg-warning text-dark'}">
                {invoice.isLocked ? 'Locked' : 'Draft'}
              </span>
            {/if}
          </div>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              <li class="breadcrumb-item"><a href="/admin/invoice/tax">Tax Invoices</a></li>
              <li class="breadcrumb-item active">Detail</li>
            </ol>
          </nav>
        </div>
      </div>
      {#if invoice && !invoice.isLocked}
        <a href="/admin/invoice/tax/{invoiceId}/edit" class="btn btn-primary btn-sm no-print">
          <i class="ti ti-edit me-1"></i>Edit Invoice
        </a>
      {/if}
    </div>

    {#if invoice}
      <div class="row">
        <div class="col-lg-10 mx-auto">
          <div class="card printInvoice" id="printInvoice">
            <div class="card-body">
              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    {#if displayCompany?.gstNumber}
                      <div>GST NO. <span class="font-semibold">{displayCompany.gstNumber}</span></div>
                    {/if}
                    {#if displayCompany?.logo}
                      <div>
                        <img src={displayCompany.logo} alt={displayCompany.name} width="200px" />
                      </div>
                    {/if}
                    <div class="space-y-1">
                      {#if displayCompany?.name}
                        <div class="font-semibold text-lg">{displayCompany.name}</div>
                      {/if}
                      {#if displayCompany?.address}
                        <div>{displayCompany.address}</div>
                      {/if}
                      {#if displayCompany?.mobile}
                        <div>Contact No. : {displayCompany.mobile}</div>
                      {/if}
                      {#if displayCompany?.email}
                        <div>Email : {displayCompany.email}</div>
                      {/if}
                    </div>
                  </div>
                  <div class="flex flex-col space-y-2">
                    <div class="space-y-2">
                      <div class="flex items-center justify-between p-2 px-0 text-lg font-semibold">
                        <div>Tax Invoice</div>
                        <div>#{invoice?.invoiceNo?.toString().padStart(6, "0")}</div>
                      </div>
                      <div class="flex items-center justify-between p-2 text-lg bg-[#106ab0] text-white">
                        <div>{invoice?.totalAmountTitle || "Total Amount"}</div>
                        <div>
                          {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                          {invoice?.totalAmountValue?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                        </div>
                      </div>
                      <div class="flex items-center justify-between p-2 px-0">
                        <div>Date</div>
                        <div>
                          {`${String(new Date(invoice.invoiceDate).getDate()).padStart(2, "0")}-${String(new Date(invoice.invoiceDate).getMonth() + 1).padStart(2, "0")}-${new Date(invoice.invoiceDate).getFullYear()}`}
                        </div>
                      </div>
                    </div>
                    {#if invoice?.poNumber || invoice?.poDate}
                      <div>
                        {#if invoice?.poNumber}
                          <div class="flex items-center justify-between pb-1 px-0">
                            <div>PO Number</div>
                            <div>{invoice.poNumber}</div>
                          </div>
                        {/if}
                        {#if invoice?.poDate}
                          <div class="flex items-center justify-between pb-1 px-0">
                            <div>PO Date</div>
                            <div>{`${String(new Date(invoice.poDate).getDate()).padStart(2,"0")}-${String(new Date(invoice.poDate).getMonth()+1).padStart(2,"0")}-${new Date(invoice.poDate).getFullYear()}`}</div>
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
                    {#if invoice?.inCoterms}
                      <div class="flex items-center justify-between pb-1 px-0">
                        <div>Incoterms</div>
                        <div>{invoice.inCoterms}{invoice.inCotermsBy ? ` - ${invoice.inCotermsBy}` : ""}</div>
                      </div>
                    {/if}
                  </div>
                </div>

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

                <div>
                  <div class="table-responsive">
                    <table class="w-full" style="table-layout:fixed;">
                      <thead class="bg-[#106ab0] text-white">
                        <tr>
                          <th class="border p-2 text-white text-center" style="width:50px;">No.</th>
                          <th class="border p-2 text-white" style="width:30%;">Name</th>
                          <th class="border p-2 text-white text-center" style="width:55px;">Qty</th>
                          <th class="border p-2 text-white text-center" style="width:55px;">Unit</th>
                          <th class="border p-2 text-white text-center" style="min-width:80px;">Unit Price</th>
                          <th class="border p-2 text-white text-center" style="width:80px;">HS Code</th>
                          <th class="border p-2 text-white text-center" style="min-width:80px;">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each invoice?.items ?? [] as item, index}
                          <tr>
                            <td class="border p-2 text-center">{index + 1}.</td>
                            <td class="border p-2 capitalize" style="word-break:break-word;overflow-wrap:break-word;">{item?.item}</td>
                            <td class="border p-2 text-center">{item?.quantity}</td>
                            <td class="border p-2 text-center">{item?.unit || "Pcs"}</td>
                            <td class="border p-2 text-center" style="white-space:nowrap;">
                              {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                              {(item?.price ?? item?.unitPrice ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                            </td>
                            <td class="border p-2 text-center">{item.hsCode ? item.hsCode : "-"}</td>
                            <td class="border p-2 text-center" style="white-space:nowrap;">
                              {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                              {((item?.total && item.total > 0) ? item.total : ((parseFloat(item?.quantity) || 0) * (parseFloat(item?.price ?? item?.unitPrice) || 0))).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                            </td>
                          </tr>
                        {/each}
                        {#each invoice?.extraItems ?? [] as item1, index1}
                          <tr>
                            <td class="border p-2 text-center">{(invoice?.items?.length ?? 0) + index1 + 1}.</td>
                            <td class="border p-2 capitalize" colspan="5">{item1?.item}</td>
                            <td class="border p-2 text-center" style="white-space:nowrap;">
                              {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                              {(item1?.total ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4 avoid-page-break">
                  <div class="space-y-2">
                    <div class="font-semibold">Bank Details :</div>
                    <div class="space-y-1">
                      {#each [invoice?.bankSnapshot ?? piCompany ?? displayCompany] as b}
                        {#if b?.accountHolderName}<div>Account Holder Name : {b.accountHolderName}</div>{/if}
                        {#if b?.bankName}<div>Bank Name : {b.bankName}</div>{/if}
                        {#if b?.branchAddress}<div>Bank Address : {b.branchAddress}</div>{/if}
                        {#if b?.accountNumber}<div>Account Number : {b.accountNumber}</div>{/if}
                        {#if invoice?.currency === "USD" && invoice?.swiftCode}<div>Swift Code : {invoice.swiftCode}</div>{/if}
                        {#if b?.ifscCode}<div>IFSC Code : {b.ifscCode}</div>{/if}
                      {/each}
                    </div>
                  </div>
                  <div>
                    <div class="flex items-center justify-between py-2 font-semibold">
                      <div>Subtotal</div>
                      <div>
                        {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                        {subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                      </div>
                    </div>
                    {#if invoice?.discount != 0}
                      <div class="flex items-center justify-between py-0.5">
                        <div>Discount</div>
                        <div>
                          {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                          {invoice?.discount?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                        </div>
                      </div>
                    {/if}
                    {#if taxableExtraTotal > 0}
                      <div class="flex items-center justify-between py-0.5">
                        <div>Extra Charges (Taxable)</div>
                        <div>
                          {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                          {taxableExtraTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                        </div>
                      </div>
                    {/if}
                    <div class="mb-2">
                      {#each invoice?.taxItems ?? [] as item2}
                        <div class="flex items-center justify-between py-0.5">
                          <div>{item2?.item} ({item2?.percentage}%)</div>
                          <div>
                            {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                            {item2?.total?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                          </div>
                        </div>
                      {/each}
                    </div>
                    {#if nonTaxableExtraTotal > 0}
                      <div class="flex items-center justify-between py-0.5 mb-2">
                        <div>Extra Charges (Non-Taxable)</div>
                        <div>
                          {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                          {nonTaxableExtraTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                        </div>
                      </div>
                    {/if}
                    <div class="flex items-center justify-between p-2 text-lg bg-[#106ab0] text-white">
                      <div>Total Amount</div>
                      <div>
                        {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                        {total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-
                      </div>
                    </div>
                    <div class="flex items-center justify-start py-2">
                      {invoice?.currency} : {totalInWord}
                    </div>
                  </div>
                </div>

                <div class="text-left text-xs">
                  Declaration: We declare that this Invoice shows the actual price of goods described and that all particulars are true and correct.
                </div>
                {#if invoice?.termsConditions}
                  <div class="text-left text-xs">
                    <span class="font-semibold">Terms & Conditions: </span>{invoice?.termsConditions}
                  </div>
                {/if}
                {#if invoice?.remarks}
                  <div class="text-left text-xs">
                    <span class="font-semibold">Remarks: </span>{invoice?.remarks}
                  </div>
                {/if}
              </div>

              <!-- Bottom Action Bar -->
              <div class="no-print d-flex align-items-center justify-content-end gap-2 flex-wrap mt-4 pt-4 border-top">
                {#if !invoice?.isLocked}
                  <a href="/admin/invoice/tax/{invoiceId}/edit?sync=1" class="btn btn-success btn-sm">
                    <i class="ti ti-refresh me-1"></i>Sync from PI
                  </a>
                  <button class="btn btn-warning btn-sm" on:click={lockInvoice} disabled={locking}>
                    <i class="ti ti-lock me-1"></i>{locking ? "Locking..." : "Lock Invoice"}
                  </button>
                {/if}
                <button class="btn btn-primary btn-sm" on:click={() => window.print()}>
                  <i class="ti ti-printer me-1"></i>Print Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else if !loadingData}
      <div class="row">
        <div class="col-md-12">{errorMessage || "Invoice not found."}</div>
      </div>
    {/if}
  </div>
</div>

<style>
  @media print {
    @page { margin: 0; size: A4; }
    :global(*) { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
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
