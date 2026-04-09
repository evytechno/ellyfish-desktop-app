<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { page } from "$app/stores";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";
  let loadingData = true;
  import { ATTACHMENT_BASE_URL } from "$lib/constants/constants";

  // Form state
  let name = "";
  let description = "";

  let loading = false;
  let errorMessage = "";

  // Field-specific error messages
  let formErrors = {};

  let categoryId;
  $: categoryId = $page.params.id;

  let currentUser;
  onMount(async () => {
    currentUser = checkAuth();
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

      name = data.name;
      description = data.description;
    } catch (error) {
      errorMessage = "Failed to load category data.";
      console.error("Fetch error:", error);
      loading = false;
      const validationErrors = errorHandle(error);
    } finally {
      loading = false;
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const categoryPayload = {};
    categoryPayload.name = name;
    categoryPayload.description = description;

    try {
      const data = await authApiFetch(`${API_ROUTES.CATEGORY}/${categoryId}`, {
        method: "PUT",
        data: categoryPayload, // Send FormData
      });

      // Reset Form
      name = "";
      description = "";
      formErrors = {};

      Swal.fire("Success!", data.message, "success");
      goto("/admin/category");
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);

      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4">
      <h4 class="mb-1">Edit Category</h4>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item">
            <a href="/admin/category">Categories</a>
          </li>
          <li class="breadcrumb-item active" aria-current="page">
            Edit Category
          </li>
        </ol>
      </nav>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header flex items-center justify-between">
        <h5>Edit Category</h5>
        <a href="/admin/category" class="btn btn-primary">
          <i class="ti ti-square-rounded-plus-filled me-1"></i>Category List
        </a>
      </div>

      <div class="card-body">
        <form on:submit={handleSubmit} class="needs-validation" novalidate>
          <div class="grid grid-cols-3 gap-4">
            <div class="col-span-1">
              <label class="form-label" for="name">Name</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.name}
                type="text"
                bind:value={name}
                placeholder="Name"
                id="name"
                required
              />
              {#if formErrors.name}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.name[0]}</li>
                </ul>
              {/if}
            </div>
          </div>

          <div class="flex justify-end mt-4">
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Submiting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
