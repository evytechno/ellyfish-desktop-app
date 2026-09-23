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
  import AppUserPermissionsEditor from "$lib/components/AppUserPermissionsEditor.svelte";

  let loadingData = true;
  let loading = false;
  let errorMessage = "";
  let formErrors = {};
  let currentUser;

  $: userId = $page.params.id;

  let name = "";
  let email = "";
  let mobile = "";
  let status = "active";
  let permissions = {
    sample_view: true,
    sample_update: true,
    dispatch_view: true,
    dispatch_update: true,
    dispatch_hold: true,
  };

  onMount(async () => {
    currentUser = checkAuth();
    if (currentUser?.role !== "master") {
      loadingData = false;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "Only master can edit app users.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return;
    }
    await loadUser();
  });

  async function loadUser() {
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.APP_USER}/${userId}`);
      name = data.name || "";
      email = data.email || "";
      mobile = data.mobile || "";
      status = data.status || "active";
      permissions = {
        sample_view: true,
        sample_update: true,
        dispatch_view: true,
        dispatch_update: true,
        dispatch_hold: true,
        ...(data.permissions || {}),
      };
    } catch (err) {
      errorMessage = "Failed to load app user.";
      errorHandle(err);
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 300);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    formErrors = {};
    loading = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.APP_USER}/${userId}`, {
        method: "PUT",
        data: { name, email, mobile, status, permissions },
      });
      Swal.fire("Success!", data.message, "success");
      goto(`/admin/app-user/${userId}`);
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object")
        formErrors = validationErrors;
      else errorMessage = "An unexpected error occurred.";
    } finally {
      loading = false;
    }
  }
</script>

{#if loadingData}<Loader />{/if}

<div class="page-wrapper">
  <div class="content pb-0">
    <div class="flex items-start justify-between gap-3 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">Edit App User</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item"><a href="/admin/app-user">App Users</a></li>
            <li class="breadcrumb-item active" aria-current="page">Edit</li>
          </ol>
        </nav>
      </div>
      <div class="flex gap-2">
        <a href="/admin/app-user/{userId}" class="btn btn-outline-secondary btn-sm">View</a>
        <a href="/admin/app-user" class="btn btn-outline-secondary btn-sm">
          <i class="ti ti-arrow-left me-1"></i>List
        </a>
      </div>
    </div>

    <form on:submit={handleSubmit} autocomplete="off">
      <div class="grid gap-3" style="max-width: 920px;">
        <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
          <div class="card-header bg-white border-bottom py-3">
            <div class="flex items-center gap-2">
              <span class="app-user-icon"><i class="ti ti-user-edit"></i></span>
              <div>
                <h5 class="mb-0">Account details</h5>
                <small class="text-muted">Sample / Dispatch app login</small>
              </div>
            </div>
          </div>
          <div class="card-body p-4">
            {#if errorMessage}
              <div class="alert alert-danger py-2">{errorMessage}</div>
            {/if}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="form-label fw-semibold" for="name"
                  >Name <span class="text-danger">*</span></label
                >
                <input
                  class="form-control"
                  class:is-invalid={formErrors.name}
                  type="text"
                  bind:value={name}
                  id="name"
                  required
                />
              </div>
              <div>
                <label class="form-label fw-semibold" for="email"
                  >Email <span class="text-danger">*</span></label
                >
                <input
                  class="form-control"
                  class:is-invalid={formErrors.email}
                  type="email"
                  bind:value={email}
                  id="email"
                  required
                />
              </div>
              <div>
                <label class="form-label fw-semibold" for="mobile">Mobile</label>
                <input class="form-control" type="text" bind:value={mobile} id="mobile" />
              </div>
              <div>
                <label class="form-label fw-semibold" for="status">Status</label>
                <select class="form-select" id="status" bind:value={status}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
          <div class="card-header bg-white border-bottom py-3">
            <div class="flex items-center gap-2">
              <span class="app-user-icon"><i class="ti ti-key"></i></span>
              <div>
                <h5 class="mb-0">Permissions</h5>
                <small class="text-muted">What this user can do in the app</small>
              </div>
            </div>
          </div>
          <div class="card-body p-4">
            <AppUserPermissionsEditor bind:permissions />
          </div>
        </div>

        <div class="flex items-center gap-2 pb-3">
          <button type="submit" class="btn btn-primary px-4" disabled={loading}>
            {#if loading}
              <span class="spinner-border spinner-border-sm me-1"></span>
              Saving…
            {:else}
              <i class="ti ti-device-floppy me-1"></i>Save Changes
            {/if}
          </button>
          <a href="/admin/app-user/{userId}" class="btn btn-light">Cancel</a>
        </div>
      </div>
    </form>
  </div>
</div>

<style>
  .app-user-icon {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.5rem;
    background: #fef2f2;
    color: #dc2626;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
</style>
