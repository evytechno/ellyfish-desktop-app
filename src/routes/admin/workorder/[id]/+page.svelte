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

  // Field-specific error messages
  let formErrors = {};

  let workOrderId;
  $: workOrderId = $page.params.id;

  onMount(async () => {
    loadingData = true;
    try {
      const data = await authApiFetch(
        `${API_ROUTES.WORK_ORDER}/${workOrderId}`
      );
      workOrder = data;
    } catch (err) {
      errorMessage = "Failed to load workOrder data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });
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
        <h4 class="mb-1">Work Order</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item">
              <a href="/admin/workorder">Work Orders</a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">
              Work Order
            </li>
          </ol>
        </nav>
      </div>
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
                  <div class="font-semibold">Description :</div>
                  <div class="space-y-2 mt-2">
                    {#each workOrder?.items as item, index}
                      <div class="flex items-start justify-start gap-2">
                        <div>{index + 1}.</div>
                        <div class="capitalize">{item?.item}</div>
                      </div>
                    {/each}
                  </div>
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
                    <i class="ti ti-printer me-1"></i>Print Work Order</a
                  >
                </div>
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
