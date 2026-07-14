<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { page } from "$app/stores";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import Swal from "sweetalert2";
  let loadingData = true;

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
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <div class="content pb-0">
    <div class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div>
        <button class="btn btn-warning btn-sm mb-2" on:click={() => history.length > 2 ? history.back() : window.location.href='/admin/category'}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
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
      <a href="/admin/category/edit/{categoryId}" class="btn btn-primary">
        <i class="ti ti-edit me-1"></i>Edit
      </a>
    </div>

    {#if category}
      <div class="row">
        <div class="col-xl-6">
          <div class="card">
            <div class="card-body p-3">
              <h6 class="mb-3 fw-semibold">Category Details</h6>

              <div class="mb-3">
                <span class="text-muted text-xs">Name</span>
                <p class="mb-0 fw-semibold fs-5">{category.name}</p>
              </div>

              {#if category.parent?.name}
                <div class="mb-3">
                  <span class="text-muted text-xs">Parent Category</span>
                  <p class="mb-0">
                    <a href="/admin/category/{category.parentId}" class="text-danger">
                      {category.parent.name}
                    </a>
                  </p>
                </div>
              {:else}
                <div class="mb-3">
                  <span class="text-muted text-xs">Parent Category</span>
                  <p class="mb-0 text-muted">Top Level</p>
                </div>
              {/if}

              {#if category.description}
                <div class="mb-3">
                  <span class="text-muted text-xs">Description</span>
                  <p class="mb-0">{category.description}</p>
                </div>
              {/if}

              <div class="mb-0">
                <span class="text-muted text-xs">Created On</span>
                <p class="mb-0">
                  {category.createdAt &&
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
    {:else if errorMessage}
      <div class="alert alert-danger">{errorMessage}</div>
    {:else}
      <div>Loading category details...</div>
    {/if}
  </div>
</div>
