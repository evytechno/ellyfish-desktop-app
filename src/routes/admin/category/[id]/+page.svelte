<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { page } from "$app/stores";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import Swal from "sweetalert2";
  let loadingData = true;
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";

  let errorMessage = "";
  let category = null;

  let categoryId;
  $: categoryId = $page.params.id;

  let currentUser;
  onMount(async () => {
    currentUser = checkAuth();
    loadingData = true;

    if (currentUser?.role === "user") {
      loadingData = false;
      loading = false;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "You are not authorized to view this page.",
        confirmButtonText: "Go Back",
      }).then(() => {
        window.history.back();
      });
      return;
    }
    try {
      const data = await authApiFetch(`${API_ROUTES.CATEGORY}/${categoryId}`);
      category = data;
    } catch (err) {
      errorMessage = "Failed to load category data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });
  let activeTab = "Activity";
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <!-- Start Content -->
  <div class="content pb-0">
    <!-- Page Header -->
    <div
      class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap"
    >
      <div>
        <h4 class="mb-1">Category</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item">
              <a href="/admin/category">Categories</a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">Category</li>
          </ol>
        </nav>
      </div>
    </div>
    <!-- End Page Header -->

    {#if category}
      <div class="row">
        <div class="col-md-12">
          <div class="card">
            <div class="card-body pb-2">
              <div
                class="d-flex align-items-center justify-content-between flex-wrap"
              >
                <div class="d-flex align-items-center mb-2">
                  <div
                    class="avatar avatar-xxl avatar-rounded me-3 flex-shrink-0 border"
                  >
                    <img
                      src={category?.logo
                        ? ATTACHMENT_BASE_URL + category?.logo
                        : "/assets/img/profiles/user.png"}
                      alt="img"
                      class="object-contain"
                    />
                    <span class="status online"></span>
                  </div>
                  <div>
                    <h5 class="mb-1">{category?.name}</h5>
                    <!-- <p class="mb-2">{category?.role}</p> -->
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- /Contact Category -->
        </div>

        <!-- Contact Sidebar -->
        <div class="col-xl-4">
          <div class="card">
            <div class="card-body p-3">
              <h6 class="mb-3 fw-semibold">Basic Information</h6>
              <div class="border-bottom mb-3 pb-3">
                <div class="d-flex align-items-center mb-2">
                  <span
                    class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                  >
                    <i class="ti ti-mail fs-14"></i>
                  </span>
                  <p class="mb-0">
                    <a href="mailto:{category?.email}">{category?.email}</a>
                  </p>
                </div>
                <div class="d-flex align-items-center mb-2">
                  <span
                    class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                  >
                    <i class="ti ti-phone fs-14"></i>
                  </span>
                  <p class="mb-0">{category?.mobile}</p>
                </div>
                <div class="d-flex align-items-center mb-2">
                  <span
                    class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                  >
                    <i class="ti ti-phone fs-14"></i>
                  </span>
                  <p class="mb-0">{category?.whatsapp}</p>
                </div>
                {#if category?.address}
                  <div class="d-flex align-items-center mb-3">
                    <span
                      class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                    >
                      <i class="ti ti-map-pin fs-14"></i>
                    </span>
                    <p class="mb-0">{category?.address}</p>
                  </div>
                {/if}
                {#if category?.gstNumber}
                  <div class="d-flex align-items-center mb-2">
                    <span
                      class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                    >
                      <i class="ti ti-receipt fs-14"></i>
                    </span>
                    <p class="mb-0">GST: {category.gstNumber}</p>
                  </div>
                {/if}

                <div class="d-flex align-items-center">
                  <span
                    class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                  >
                    <i class="ti ti-calendar-exclamation fs-14"></i>
                  </span>
                  <p class="mb-0">
                    Created on {category?.createdAt &&
                      new Date(category.createdAt).toLocaleString("en-GB", {
                        timeZone: "Asia/Kolkata",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-xl-4">
          <div class="card">
            <div class="card-body p-3">
              <h6 class="mb-3 fw-semibold">Bank Details</h6>
              <div class="">
                {#if category?.bankName}
                  <div class="mb-2">
                    <strong>Bank:</strong>
                    {category.bankName}
                  </div>
                  <div class="mb-2">
                    <strong>Account Holder:</strong>
                    {category.accountHolderName}
                  </div>
                  <div class="mb-2">
                    <strong>Account Number:</strong>
                    {category.accountNumber}
                  </div>
                  <div class="mb-2">
                    <strong>IFSC Code:</strong>
                    {category.ifscCode}
                  </div>
                  <div class="mb-2">
                    <strong>Branch:</strong>
                    {category.branchAddress}
                  </div>
                {/if}

                {#if category?.description}
                  <hr />
                  <h6 class="mb-2 fw-semibold">Description</h6>
                  <p>{category.description}</p>
                {/if}
              </div>
            </div>
          </div>
        </div>
        <!-- /Contact Sidebar -->
      </div>
    {:else}
      <div class="row">
        <div class="col-md-12">Loading category details...</div>
      </div>
    {/if}
    <!-- Start Footer -->
  </div>
  <!-- End Content -->
</div>
