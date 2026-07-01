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

  let name = "";
  let description = "";
  let parentId = null;
  let parentCategories = [];

  let loading = false;
  let errorMessage = "";
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
      const [categoryData, allData] = await Promise.all([
        authApiFetch(`${API_ROUTES.CATEGORY}/${categoryId}`),
        authApiFetch(API_ROUTES.CATEGORY + "/all"),
      ]);

      name = categoryData.name;
      description = categoryData.description || "";
      parentId = categoryData.parentId ?? null;
      // Exclude the current category from parent options to prevent self-reference
      parentCategories = allData.filter((c) => c.id !== Number(categoryId));
    } catch (error) {
      errorMessage = "Failed to load category data.";
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

    const categoryPayload = {
      name,
      description: description || undefined,
      parentId: parentId ? Number(parentId) : null,
    };

    try {
      const data = await authApiFetch(`${API_ROUTES.CATEGORY}/${categoryId}`, {
        method: "PUT",
        data: categoryPayload,
      });

      name = "";
      description = "";
      parentId = null;
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
              <label class="form-label" for="name">Name <span class="text-danger">*</span></label>
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

            <div class="col-span-1">
              <label class="form-label" for="parentId">Parent Category</label>
              <select
                class="form-control"
                id="parentId"
                bind:value={parentId}
              >
                <option value={null}>— None (Top Level) —</option>
                {#each parentCategories as cat}
                  <option value={cat.id}>{cat.name}</option>
                {/each}
              </select>
            </div>

            <div class="col-span-1">
              <label class="form-label" for="description">Description</label>
              <input
                class="form-control"
                type="text"
                bind:value={description}
                placeholder="Description (optional)"
                id="description"
              />
            </div>
          </div>

          <div class="flex justify-end mt-4">
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
