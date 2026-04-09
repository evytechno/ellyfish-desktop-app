<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { numberToWords } from "$lib/utils/numberToWords";
  import Loader from "$lib/components/Loader.svelte";
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";
  let loadingData = true;

  let errorMessage = "";
  let payment = null;

  let loading = false;

  // Field-specific error messages
  let formErrors = {};

  let paymentId;
  $: paymentId = $page.params.id;

  onMount(async () => {
    loadingData = true;
    try {
      const data = await authApiFetch(
        `${API_ROUTES.USER_PAYMENT}/${paymentId}`
      );
      payment = data;
    } catch (err) {
      errorMessage = "Failed to load payment data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });

  $: subtotal = payment?.items.reduce((sum, item) => sum + item.price, 0);

  $: total = Math.round(subtotal);
  $: totalInWord = numberToWords(total || 0) + " Only";

  function shortenFileName(name, keepStart = 8, keepEnd = 12) {
    if (name.length <= keepStart + keepEnd) return name;
    return name.slice(0, keepStart) + "..." + name.slice(-keepEnd);
  }
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
        <h4 class="mb-1">Payment</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item">
              <a href="/admin/payment">Payments</a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">Payment</li>
          </ol>
        </nav>
      </div>
    </div>
    <!-- End Page Header -->
    {#if payment}
      <div class="row">
        <div class="col-lg-10 mx-auto">
          <div class="card printPayment" id="printPayment">
            <div class="card-body">
              <div class="space-y-4">
                <!-- <div class="text-center text-xs">!! Jai Ganeshya Namah !!</div> -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <div>
                      GST NO. <span class="font-semibold"
                        >{payment?.company?.gstNumber}</span
                      >
                    </div>
                    <div>
                      <img
                        src={ATTACHMENT_BASE_URL + payment?.company?.logo}
                        alt={payment?.company?.name}
                        width="200px"
                      />
                    </div>
                    <div class="space-y-1">
                      <div class="font-semibold text-lg">
                        {payment?.company?.name}
                      </div>
                      <div>{payment?.company?.address}</div>
                      <div>Contact No. : {payment?.company?.mobile}</div>
                      <div>Email : {payment?.company?.email}</div>
                    </div>
                  </div>
                  <div class="flex flex-col space-y-2">
                    <div class="space-y-2">
                      <div
                        class="flex items-center justify-between p-2 px-0 text-lg font-semibold"
                      >
                        <div>Payment No.</div>
                        <div>
                          #{payment?.invoiceNo?.toString().padStart(6, "0")}
                        </div>
                      </div>
                      <div class="flex items-center justify-between p-2 px-0">
                        <div>Title</div>
                        <div>{payment?.title}</div>
                      </div>
                      <div class="space-y-1">
                        <div class="flex items-center justify-between px-0">
                          <div>Status</div>
                          <div>{payment?.status}</div>
                        </div>
                        <div class="flex items-center justify-between px-0">
                          <div>Date</div>
                          <div>
                            {`${String(new Date(payment.paymentDate).getDate()).padStart(2, "0")}-${String(new Date(payment.paymentDate).getMonth() + 1).padStart(2, "0")}-${new Date(payment.paymentDate).getFullYear()}`}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="space-y-2 pt-2">
                      <div class="flex items-center justify-between px-0">
                        <div>Name</div>
                        <div>{payment?.user?.name}</div>
                      </div>
                      <div class="flex items-center justify-between px-0">
                        <div>Email</div>
                        <div>{payment?.user?.email}</div>
                      </div>
                      <div class="flex items-center justify-between px-0">
                        <div>Mobile</div>
                        <div>{payment?.user?.mobile}</div>
                      </div>
                      <div class="flex items-center justify-between px-0">
                        <div>Whatsapp</div>
                        <div>{payment?.user?.whatsapp}</div>
                      </div>
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
                          <th class="border p-2 text-white text-center">
                            Price
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each payment?.items as item, index}
                          <tr>
                            <td class="border p-2 text-center">{index + 1}.</td>
                            <td class="border p-2 capitalize">{item?.item}</td>
                            <td class="border p-2 text-center">
                              ₹ {item?.price.toFixed(2)}/-
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4 avoid-page-break">
                  <div class="space-y-2"></div>
                  <div>
                    <div
                      class="flex items-center justify-between py-2 font-semibold"
                    >
                      <div>Subtotal</div>
                      <div>
                        ₹ {subtotal.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}/-
                      </div>
                    </div>

                    <div
                      class="flex items-center justify-between p-2 text-lg bg-[#106ab0] text-white"
                    >
                      <div>Total Amount</div>
                      <div>
                        ₹ {total.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}/-
                      </div>
                    </div>
                    <div class="flex items-center justify-start py-2">
                      RS : {totalInWord}
                    </div>
                  </div>
                </div>
                {#if payment?.remarks}
                  <div class="text-left text-xs">
                    {payment?.remarks}
                  </div>
                {/if}

                <div
                  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
                >
                  {#if payment?.images && payment?.images?.length}
                    {#each payment?.images as image}
                      <div class="">
                        <a href={ATTACHMENT_BASE_URL + image?.url} target="_blank">
                          <div class="card mb-0 hover:border-red-400">
                            <div class="card-body p-2">
                              <div
                                class="d-flex align-items-center justify-content-between flex-wrap row-gap-3"
                              >
                                <div class="d-flex align-items-center me-3">
                                  {#if image.mimeType && image.mimeType.startsWith("image")}
                                    <span class="avatar border me-2">
                                      <img
                                        src={ATTACHMENT_BASE_URL + image?.url}
                                        alt={image?.url}
                                        class="object-contain"
                                      />
                                    </span>
                                  {:else}
                                    <span class="avatar bg-success me-2">
                                      <i class="ti ti-file-spreadsheet fs-20"
                                      ></i>
                                    </span>
                                  {/if}
                                  <div>
                                    <h6
                                      class="fw-medium fs-14 mb-1 trank"
                                      title={image?.originalName}
                                    >
                                      <a
                                        href={ATTACHMENT_BASE_URL + image?.url}
                                        target="_blank"
                                      >
                                        {shortenFileName(image?.originalName)}
                                      </a>
                                    </h6>
                                    <p class="mb-0">
                                      {(image.size / 1024).toFixed(2)} KB
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </a>
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>

              <div class="no-print">
                <div
                  class="text-center d-flex align-items-center justify-content-end mt-4 border-top pt-4"
                >
                  <a
                    href="#print"
                    class="btn btn-md btn-primary d-flex align-items-center"
                    on:click={() => window.print()}
                  >
                    <!-- on:click={() => printPDF()} -->
                    <i class="ti ti-printer me-1"></i>Print Payment</a
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="row">
        <div class="col-md-12">Loading payment details...</div>
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
