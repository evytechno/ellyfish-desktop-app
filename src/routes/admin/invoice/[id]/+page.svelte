<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { numberToWords } from "$lib/utils/numberToWords";
  import Loader from "$lib/components/Loader.svelte";
  import InvoiceExport from "$lib/components/InvoiceExport.svelte";
  let loadingData = true;
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";

  let errorMessage = "";
  let invoice = null;

  let loading = false;

  // Field-specific error messages
  let formErrors = {};

  let invoiceId;
  $: invoiceId = $page.params.id;

  onMount(async () => {
    loadingData = true;
    try {
      const data = await authApiFetch(
        `${API_ROUTES.ORDER_PAYMENT}/${invoiceId}`
      );
      invoice = data;
    } catch (err) {
      errorMessage = "Failed to load invoice data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });

  $: subtotal =
    (invoice?.items ?? []).reduce((sum, item) => sum + (item.total ?? 0), 0) -
    (invoice?.discount ?? 0);
  $: extratotal = (invoice?.extraItems ?? []).reduce(
    (sum, item) => sum + (item.total ?? 0),
    0
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
    invoice && invoice.company && invoice.invoiceNo && invoice.company.name
      ? `${getShortName(invoice.company.name)}_PI_${invoice.invoiceNo.toString().padStart(6, "0")}`
      : "Loading...";
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>
{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <!-- Start Content -->
  <div class="content pb-0">
    <!-- Page Header -->
    <div
      class="pageHeader d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap no-print"
    >
      <div class="no-print">
        <h4 class="mb-1">Invoice</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item">
              <a href="/admin/invoice">Invoices</a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">Invoice</li>
          </ol>
        </nav>
      </div>
    </div>
    <!-- End Page Header -->
    {#if invoice}
      <div class="row">
        <div class="col-lg-10 mx-auto">
          <div class="card printInvoice" id="printInvoice">
            <div class="card-body">
              <div class="space-y-4">
                <!-- <div class="text-center text-xs">!! Jai Ganeshya Namah !!</div> -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <div>
                      GST NO. <span class="font-semibold"
                        >{invoice?.company?.gstNumber}</span
                      >
                    </div>
                    <div>
                      <img
                        src={ATTACHMENT_BASE_URL + invoice?.company?.logo}
                        alt={invoice?.company?.name}
                        width="200px"
                      />
                    </div>
                    <div class="space-y-1">
                      <div class="font-semibold text-lg">
                        {invoice?.company?.name}
                      </div>
                      <div>{invoice?.company?.address}</div>
                      <div>Contact No. : {invoice?.company?.mobile}</div>
                      <div>Email : {invoice?.company?.email}</div>
                    </div>
                  </div>
                  <div class="flex flex-col space-y-2">
                    <div class="space-y-2">
                      <div
                        class="flex items-center justify-between p-2 px-0 text-lg font-semibold"
                      >
                        <div>Proforma Invoice</div>
                        <div>
                          #{invoice?.invoiceNo?.toString().padStart(6, "0")}
                        </div>
                      </div>
                      <div
                        class="flex items-center justify-between p-2 text-lg bg-[#106ab0] text-white"
                      >
                        <div>{invoice?.totalAmountTitle || "Total Amount"}</div>
                        <div>
                          {currencies.find((c) => c.code === invoice?.currency)
                            ?.symbol}
                          {invoice?.totalAmountValue.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}/-
                        </div>
                      </div>
                      <div class="flex items-center justify-between p-2 px-0">
                        <div>Date</div>
                        <div>
                          {`${String(new Date(invoice.invoiceDate).getDate()).padStart(2, "0")}-${String(new Date(invoice.invoiceDate).getMonth() + 1).padStart(2, "0")}-${new Date(invoice.invoiceDate).getFullYear()}`}
                        </div>
                      </div>
                    </div>
                    {#if invoice?.poNumber && invoice?.poDate}
                      <div>
                        {#if invoice?.poNumber}
                          <div
                            class="flex items-center justify-between pb-1 px-0"
                          >
                            <div>PO Number</div>
                            <div>{invoice?.poNumber}</div>
                          </div>
                        {/if}
                        {#if invoice?.poDate}
                          <div
                            class="flex items-center justify-between pb-1 px-0"
                          >
                            <div>PO Date</div>
                            <div>
                              {`${String(new Date(invoice?.poDate).getDate()).padStart(2, "0")}-${String(new Date(invoice?.poDate).getMonth() + 1).padStart(2, "0")}-${new Date(invoice?.poDate).getFullYear()}`}
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/if}
                    {#if invoice?.priceTerms}
                      <div class="grow flex items-center">
                        Payment : {invoice?.priceTerms}
                      </div>
                    {/if}
                    {#if invoice?.swiftCode}
                      <div class="grow flex items-center">
                        Swift Code : {invoice?.swiftCode}
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
                      {#if invoice?.billToGSTNumber}
                        <div>GSTIN : {invoice?.billToGSTNumber}</div>
                      {/if}
                      {#if invoice?.billToMobile}
                        <div>Contact No. : {invoice?.billToMobile}</div>
                      {/if}
                      {#if invoice?.billToEmail}
                        <div>Email : {invoice?.billToEmail}</div>
                      {/if}
                    </div>
                  </div>
                  <div class="space-y-2">
                    <div class="font-semibold">Ship To :</div>
                    <div class="space-y-1">
                      <div>{invoice?.shipToName}</div>
                      <div>{invoice?.shipToAddress}</div>
                      {#if invoice?.shipToGSTNumber}
                        <div>GSTIN : {invoice?.shipToGSTNumber}</div>
                      {/if}
                      {#if invoice?.shipToMobile}
                        <div>Contact No. : {invoice?.shipToMobile}</div>
                      {/if}
                      {#if invoice?.shipToEmail}
                        <div>Email : {invoice?.shipToEmail}</div>
                      {/if}
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
                          <th class="border p-2 text-white text-center">
                            Unit Price
                          </th>
                          <th class="border p-2 text-white text-center">
                            HS Code
                          </th>
                          <th class="border p-2 text-white text-center">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each invoice?.items as item, index}
                          <tr>
                            <td class="border p-2 text-center">{index + 1}.</td>
                            <td class="border p-2 capitalize">{item?.item}</td>
                            <td class="border p-2 text-center">
                              {item?.quantity}
                            </td>
                            <td class="border p-2 text-center"
                              >{currencies.find(
                                (c) => c.code === invoice?.currency
                              )?.symbol}
                              {item?.price.toFixed(2)}/-
                            </td>
                            <td class="border p-2 text-center">
                              {item.hsCode ? item.hsCode : "-"}
                            </td>
                            <td class="border p-2 text-center"
                              >{currencies.find(
                                (c) => c.code === invoice?.currency
                              )?.symbol}
                              {(item?.total).toFixed(2)}/-
                            </td>
                          </tr>
                        {/each}
                        {#each invoice?.extraItems as item1, index1}
                          <tr>
                            <td class="border p-2 text-center">
                              {invoice?.items.length + index1 + 1}.
                            </td>
                            <td class="border p-2 capitalize" colspan="4">
                              {item1?.item}
                            </td>
                            <td class="border p-2 text-center"
                              >{currencies.find(
                                (c) => c.code === invoice?.currency
                              )?.symbol}
                              {(item1?.total).toFixed(2)}/-
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
                      {#each [invoice?.selectedBankAccount ?? invoice?.company] as b}
                        {#if b?.accountHolderName}
                          <div>Account Holder Name : {b.accountHolderName}</div>
                        {/if}
                        {#if b?.bankName}
                          <div>Bank Name : {b.bankName}</div>
                        {/if}
                        {#if b?.accountNumber}
                          <div>Account Number : {b.accountNumber}</div>
                        {/if}
                        {#if b?.branchAddress || b?.bankAddress}
                          <div>Bank Address : {b.branchAddress || b.bankAddress}</div>
                        {/if}
                        {#if b?.ifscCode}
                          <div>IFSC Code : {b.ifscCode}</div>
                        {/if}
                      {/each}
                    </div>
                  </div>
                  <div>
                    <div
                      class="flex items-center justify-between py-2 font-semibold"
                    >
                      <div>Subtotal</div>
                      <div>
                        {currencies.find((c) => c.code === invoice?.currency)
                          ?.symbol}
                        {subtotal.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}/-
                      </div>
                    </div>

                    {#if invoice?.discount != 0}
                      <div class="flex items-center justify-between py-0.5">
                        <div>Discount</div>
                        <div>
                          {currencies.find((c) => c.code === invoice?.currency)
                            ?.symbol}
                          {invoice?.discount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}/-
                        </div>
                      </div>
                    {/if}
                    <div class="mb-2">
                      {#each invoice?.taxItems as item2, index2}
                        <div class="flex items-center justify-between py-0.5">
                          <div>{item2?.item} ({item2?.percentage}%)</div>
                          <div>
                            {currencies.find(
                              (c) => c.code === invoice?.currency
                            )?.symbol}
                            {item2?.total.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}/-
                          </div>
                        </div>
                      {/each}
                    </div>
                    <div
                      class="flex items-center justify-between p-2 text-lg bg-[#106ab0] text-white"
                    >
                      <div>Total Amount</div>
                      <div>
                        {currencies.find((c) => c.code === invoice?.currency)
                          ?.symbol}
                        {total.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}/-
                      </div>
                    </div>
                    <div class="flex items-center justify-start py-2">
                      {invoice?.currency} : {totalInWord}
                    </div>
                  </div>
                </div>
                <div class="text-left text-xs">
                  Declaration: We declare that this Invoice shows the actual
                  price of goods described and that all particulars are true and
                  correct.
                </div>
                {#if invoice?.termsConditions}
                  <div class="text-left text-xs">
                    {invoice?.termsConditions}
                  </div>
                {/if}
                {#if invoice?.remarks}
                  <div class="text-left text-xs">
                    {invoice?.remarks}
                  </div>
                {/if}
              </div>

              <div class="no-print">
                <div
                  class="text-center d-flex align-items-center justify-content-end gap-4 mt-4 border-top pt-4"
                >
                  <InvoiceExport {invoice} />
                  <a
                    href="#print"
                    class="btn btn-md btn-primary d-flex align-items-center"
                    on:click={() => window.print()}
                  >
                    <!-- on:click={() => printPDF()} -->
                    <i class="ti ti-printer me-1"></i>Print Invoice</a
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="row">
        <div class="col-md-12">Loading invoice details...</div>
      </div>
    {/if}

    <!-- Start Footer -->
  </div>
  <!-- End Content -->
</div>

<style>
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

    .avoid-page-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    table {
      page-break-inside: auto;
    }

    tr {
      page-break-inside: avoid;
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
