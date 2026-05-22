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

  let invoiceId;
  $: invoiceId = $page.params.id;

  onMount(async () => {
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.INVOICE}/${invoiceId}`);
      invoice = data;
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
    invoice && invoice.companySnapshot && invoice.invoiceNo
      ? `${getShortName(invoice.companySnapshot.name)}_INV_${invoice.invoiceNo.toString().padStart(6, "0")}`
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
</svelte:head>
{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <div class="content pb-0">
    <div class="pageHeader d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap no-print">
      <div class="no-print">
        <h4 class="mb-1">Tax Invoice</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item"><a href="/admin/invoice/tax">Tax Invoices</a></li>
            <li class="breadcrumb-item active" aria-current="page">Tax Invoice</li>
          </ol>
        </nav>
      </div>
    </div>

    {#if invoice}
      <div class="row">
        <div class="col-lg-10 mx-auto">
          <div class="card printInvoice" id="printInvoice">
            <div class="card-body">
              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <div>
                      GST NO. <span class="font-semibold">{invoice?.companySnapshot?.gstNumber}</span>
                    </div>
                    <div>
                      <img
                        src={invoice?.companySnapshot?.logo}
                        alt={invoice?.companySnapshot?.name}
                        width="200px"
                      />
                    </div>
                    <div class="space-y-1">
                      <div class="font-semibold text-lg">{invoice?.companySnapshot?.name}</div>
                      <div>{invoice?.companySnapshot?.address}</div>
                      <div>Contact No. : {invoice?.companySnapshot?.mobile}</div>
                      <div>Email : {invoice?.companySnapshot?.email}</div>
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
                    {#if invoice?.poNumber}
                      <div class="flex items-center justify-between pb-1 px-0">
                        <div>PO Number</div>
                        <div>{invoice?.poNumber}</div>
                      </div>
                    {/if}
                    {#if invoice?.priceTerms}
                      <div class="grow flex items-center">Payment : {invoice?.priceTerms}</div>
                    {/if}
                    {#if invoice?.swiftCode}
                      <div class="grow flex items-center">Swift Code : {invoice?.swiftCode}</div>
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
                    <table class="w-full">
                      <thead class="bg-[#106ab0] text-white">
                        <tr>
                          <th class="border p-2 text-white text-center">No.</th>
                          <th class="border p-2 text-white">Name</th>
                          <th class="border p-2 text-white text-center">Qty</th>
                          <th class="border p-2 text-white text-center">Unit Price</th>
                          <th class="border p-2 text-white text-center">HS Code</th>
                          <th class="border p-2 text-white text-center">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each invoice?.items ?? [] as item, index}
                          <tr>
                            <td class="border p-2 text-center">{index + 1}.</td>
                            <td class="border p-2 capitalize">{item?.item}</td>
                            <td class="border p-2 text-center">{item?.quantity}</td>
                            <td class="border p-2 text-center">
                              {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                              {item?.price?.toFixed(2)}/-
                            </td>
                            <td class="border p-2 text-center">{item.hsCode ? item.hsCode : "-"}</td>
                            <td class="border p-2 text-center">
                              {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                              {(item?.total)?.toFixed(2)}/-
                            </td>
                          </tr>
                        {/each}
                        {#each invoice?.extraItems ?? [] as item1, index1}
                          <tr>
                            <td class="border p-2 text-center">{(invoice?.items?.length ?? 0) + index1 + 1}.</td>
                            <td class="border p-2 capitalize" colspan="4">{item1?.item}</td>
                            <td class="border p-2 text-center">
                              {currencies.find((c) => c.code === invoice?.currency)?.symbol}
                              {(item1?.total)?.toFixed(2)}/-
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
                      {#each [invoice?.bankSnapshot] as b}
                        {#if b?.accountHolderName}<div>Account Holder Name : {b.accountHolderName}</div>{/if}
                        {#if b?.bankName}<div>Bank Name : {b.bankName}</div>{/if}
                        {#if b?.accountNumber}<div>Account Number : {b.accountNumber}</div>{/if}
                        {#if b?.branchAddress}<div>Bank Address : {b.branchAddress}</div>{/if}
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
                  <div class="text-left text-xs">{invoice?.termsConditions}</div>
                {/if}
                {#if invoice?.remarks}
                  <div class="text-left text-xs">{invoice?.remarks}</div>
                {/if}
              </div>

              <div class="no-print">
                <div class="text-center d-flex align-items-center justify-content-end gap-4 mt-4 border-top pt-4">
                  {#if !invoice?.isLocked}
                    <a
                      href="/admin/invoice/tax?editId={invoiceId}"
                      class="btn btn-md btn-soft-info d-flex align-items-center"
                    >
                      <i class="ti ti-edit me-1"></i>Edit
                    </a>
                    <a
                      href="/admin/invoice/tax?syncId={invoiceId}"
                      class="btn btn-md btn-soft-success d-flex align-items-center"
                    >
                      <i class="ti ti-refresh me-1"></i>Sync from PI
                    </a>
                    <button
                      class="btn btn-md btn-warning d-flex align-items-center"
                      on:click={lockInvoice}
                      disabled={locking}
                    >
                      <i class="ti ti-lock me-1"></i>{locking ? "Locking..." : "Lock Invoice"}
                    </button>
                  {:else}
                    <span class="badge bg-success fs-14 p-2">
                      <i class="ti ti-lock me-1"></i>Locked
                    </span>
                  {/if}
                  <a
                    href="#print"
                    class="btn btn-md btn-primary d-flex align-items-center"
                    on:click={() => window.print()}
                  >
                    <i class="ti ti-printer me-1"></i>Print Invoice
                  </a>
                </div>
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
    @page { padding: 5mm; }
    .no-print { display: none; padding: 0; margin: 0; }
    .pageHeader { margin: 0 !important; padding: 0 !important; }
    .avoid-page-break { page-break-inside: avoid; break-inside: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    .card { margin: 0; border: 0; }
    .card-body { margin: 0; }
    .content { padding: 0; margin: 0; }
  }
</style>
