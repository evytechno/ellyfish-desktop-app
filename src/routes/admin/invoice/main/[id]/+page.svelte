<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { numberToWords } from "$lib/utils/numberToWords";
  import Loader from "$lib/components/Loader.svelte";
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

      // update params
      title = data?.title;
      category = data?.category;
      invoiceDate = data?.invoiceDate
        ? new Date(data.invoiceDate).toISOString().substring(0, 10)
        : "";
      startDate = data?.startDate
        ? new Date(data.startDate).toISOString().substring(0, 10)
        : "";
      deadlineDate = data?.deadlineDate
        ? new Date(data.deadlineDate).toISOString().substring(0, 10)
        : "";

      price = data?.price;
      priceTerms = data?.priceTerms;
      source = data?.source;
      description = data?.description;
      gstNumber = data?.gstNumber;
      company = data?.company;
    } catch (err) {
      errorMessage = "Failed to load invoice data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });

  $: subtotal = invoice?.items.reduce((sum, item) => sum + item.total, 0);
  $: extratotal = invoice?.extraItems.reduce(
    (sum, item) => sum + item.total,
    0
  );
  $: subplustotal = subtotal + extratotal;
  $: taxtotal = invoice?.taxItems.length
    ? invoice?.taxItems.reduce((sum, item) => sum + item.total, 0)
    : 0;
  $: total = Math.round(subplustotal + taxtotal);
  $: totalInWord = numberToWords(total || 0) + " Only";
</script>

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
          <div class="card">
            <div class="card-body">
              <!-- Items -->
              <div
                class="d-flex align-items-center justify-content-between border-bottom pb-3 mb-3"
              >
                <div class="max-w-[70%]">
                  <img
                    src={ATTACHMENT_BASE_URL + invoice?.company?.logo}
                    width="140"
                    alt="Img"
                  />
                  <p class="mb-0 mt-2">
                    {invoice?.company?.address}
                  </p>
                </div>
                <div>
                  <p class="mb-1 fw-semibold">
                    Invoice No : <span class="text-primary"
                      >#{invoice?.invoiceNo?.toString().padStart(6, "0")}</span
                    >
                  </p>
                  <p class="mb-1">
                    Invoice Date : <span class="text-dark">
                      {`${String(new Date(invoice.invoiceDate).getDate()).padStart(2, "0")}-${String(new Date(invoice.invoiceDate).getMonth() + 1).padStart(2, "0")}-${new Date(invoice.invoiceDate).getFullYear()}`}
                    </span>
                  </p>
                </div>
              </div>

              <!-- start row -->
              <div class="row pb-3 border-bottom mb-4">
                <div class="col-6">
                  <h5 class="mb-2 fs-14 fw-medium">Bill To</h5>
                  <h6 class="mb-1 capitalize">{invoice?.billToName}</h6>
                  {#if invoice?.billToAddress}
                    <p class="mb-1 capitalize">{invoice?.billToAddress}</p>
                  {/if}
                  {#if invoice?.billToGSTNumber}
                    <p class="mb-1">
                      GST : <span class="text-dark">
                        {invoice?.billToGSTNumber}
                      </span>
                    </p>
                  {/if}
                  {#if invoice?.billToEmail}
                    <p class="mb-1">
                      Email : <span class="text-dark">
                        {invoice?.billToEmail}
                      </span>
                    </p>
                  {/if}
                  {#if invoice?.billToMobile}
                    <p class="mb-0">
                      Mobile : <span class="text-dark">
                        {invoice?.billToMobile}
                      </span>
                    </p>
                  {/if}
                </div>
                <!-- end col -->
                <div class="col-6">
                  <h5 class="mb-2 fs-14 fw-medium">Ship To</h5>
                  <h6 class="mb-1 capitalize">{invoice?.shipToName}</h6>
                  {#if invoice?.shipToAddress}
                    <p class="mb-1 capitalize">{invoice?.shipToAddress}</p>
                  {/if}
                  {#if invoice?.shipToGSTNumber}
                    <p class="mb-1">
                      GST : <span class="text-dark">
                        {invoice?.shipToGSTNumber}
                      </span>
                    </p>
                  {/if}
                  {#if invoice?.shipToEmail}
                    <p class="mb-1">
                      Email : <span class="text-dark">
                        {invoice?.shipToEmail}
                      </span>
                    </p>
                  {/if}
                  {#if invoice?.shipToMobile}
                    <p class="mb-0">
                      Mobile : <span class="text-dark">
                        {invoice?.shipToMobile}
                      </span>
                    </p>
                  {/if}
                </div>
                <!-- end col -->
              </div>
              <!-- end row -->

              <!-- Items -->
              <div class="mb-4">
                <div>
                  <!-- Table List -->
                  <div class="table-responsive">
                    <table class="table table-nowrap border">
                      <thead class="table-light">
                        <tr>
                          <th class="border p-2 text-center">No.</th>
                          <th class="border p-2">Name</th>
                          <th class="border p-2">Qty</th>
                          <th class="border p-2">Unit Price</th>
                          <th class="border p-2">HS Code</th>
                          <th class="border p-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each invoice?.items as item, index}
                          <tr>
                            <td class="border p-2 text-center">{index + 1}.</td>
                            <td class="border p-2 capitalize">{item?.item}</td>
                            <td class="border p-2">{item?.quantity}</td>
                            <td class="border p-2">
                              {#if item?.price}
                                ₹ {item?.price.toFixed(2)}
                              {/if}
                            </td>
                            <td class="border p-2">{item.hsCode}</td>
                            <td class="border p-2">
                              ₹ {(item?.total).toFixed(2)}
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
                            <td class="border p-2">
                              ₹ {(item1?.total).toFixed(2)}/-
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                  <!-- /Table List -->
                </div>
              </div>
              <!-- etart row -->
              <div class="pb-3 mb-3 border-bottom avoid-page-break">
                <div class="row align-items-center">
                  <div class="col-6">
                    <div>
                      {#if invoice?.termsConditions}
                        <div class=" mb-3">
                          <h6 class="mb-1 fs-14 fw-semibold">
                            Terms and Conditions
                          </h6>
                          <p class="mb-0">
                            {invoice?.termsConditions}
                          </p>
                        </div>
                      {/if}
                      {#if invoice?.remarks}
                        <div>
                          <h6 class="mb-1 fs-14 fw-semibold">Notes</h6>
                          <p class="mb-0">
                            {invoice?.remarks}
                          </p>
                        </div>
                      {/if}
                    </div>
                  </div>
                  <!-- end col -->
                  <div class="col-6">
                    <div>
                      <div
                        class="d-flex align-items-center justify-content-between border-bottom pb-2 mb-2"
                      >
                        <h6 class="fs-14 fw-medium mb-0">Sub Total</h6>
                        <h6 class="fs-14 fw-medium mb-0">
                          ₹ {subtotal.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}/-
                        </h6>
                      </div>
                      {#each invoice?.taxItems as item2, index2}
                        <div
                          class="d-flex align-items-center justify-content-between border-bottom pb-2 mb-2"
                        >
                          <h6 class="fs-14 fw-medium mb-0">
                            {item2?.item} ({item2?.percentage}%)
                          </h6>
                          <h6 class="fs-14 fw-medium mb-0">
                            ₹ {item2?.total.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}/-
                          </h6>
                        </div>
                      {/each}
                      <div
                        class="d-flex align-items-center justify-content-between mb-1"
                      >
                        <h6 class="mb-0">TotalAmount</h6>
                        <h6 class="mb-0">
                          ₹ {total.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}/-
                        </h6>
                      </div>
                      <p>
                        Amount in Words : {totalInWord}
                      </p>
                    </div>
                  </div>
                  <!-- end col -->
                </div>
              </div>
              <!-- end row -->

              <!-- Items -->
              <div
                class="flex items-center justify-content-end text-end border-bottom mb-3 pb-3 avoid-page-break"
              >
                <div>
                  <img
                    src="/assets/img/icons/signature-img.svg"
                    alt="Img"
                    class="img-fluid"
                  />
                  <h6 class="fs-14 fw-semibold">Ted M. Davis</h6>
                  <p class="fs-13 fw-normal mb-0">Assistant Manager</p>
                </div>
              </div>

              <div class="text-center border-bottom pb-3 mb-3 avoid-page-break">
                <div
                  class="flex items-center justify-content-center text-center mb-3"
                >
                  <img
                    src={ATTACHMENT_BASE_URL + invoice?.company?.logo}
                    width="130"
                    alt="Img"
                  />
                </div>
                <p class="fs-13 mb-1">
                  Payment Made Via bank transfer / Cheque in the name of Thomas
                  Lawler
                </p>
                <div
                  class="d-flex align-items-center justify-content-center gap-3 flex-wrap"
                >
                  <p class="mb-0">
                    Bank Name : <span class="text-dark">
                      {invoice?.company?.bankName}
                    </span>
                  </p>
                  <p class="mb-0">
                    Account Holder Name : <span class="text-dark">
                      {invoice?.company?.accountHolderName}
                    </span>
                  </p>
                  <p class="mb-0">
                    Account Number : <span class="text-dark">
                      {invoice?.company?.accountNumber}
                    </span>
                  </p>
                  <p class="mb-0">
                    IFSC : <span class="text-dark">
                      {invoice?.company?.ifscCode}
                    </span>
                  </p>
                  <p class="mb-0">
                    Branch Address : <span class="text-dark">
                      {invoice?.company?.branchAddress}
                    </span>
                  </p>
                </div>
              </div>

              <div class="no-print">
                <div
                  class="text-center d-flex align-items-center justify-content-end"
                >
                  <a
                    href="#print"
                    class="btn btn-md btn-primary d-flex align-items-center"
                    on:click={() => window.print()}
                  >
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
