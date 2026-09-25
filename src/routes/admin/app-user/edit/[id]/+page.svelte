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
  import {
    fetchWorkshopSalesEmployees,
    workshopEmployeeLabel,
  } from "$lib/api/workshopSales";

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
  let workshopEmployeeId = "";
  let workshopEmployees = [];
  let workshopLoadError = "";
  let permissions = {
    sample_view: true,
    sample_update: true,
    dispatch_view: true,
    dispatch_update: true,
    dispatch_hold: true,
  };

  function onWorkshopPick() {
    if (!workshopEmployeeId) return;
    const emp = workshopEmployees.find((e) => e._id === workshopEmployeeId);
    if (!emp) return;
    if (!name?.trim()) name = emp.username || emp.name || "";
    if (!email?.trim() && emp.email) email = emp.email;
  }

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
    await Promise.all([loadUser(), loadWorkshop()]);
  });

  async function loadWorkshop() {
    try {
      workshopEmployees = await fetchWorkshopSalesEmployees();
      if (!workshopEmployees.length) {
        workshopLoadError =
          "Workshop list empty — link id can still be kept or cleared.";
      }
    } catch {
      workshopLoadError = "Could not load workshop employees.";
    }
  }

  async function loadUser() {
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.APP_USER}/${userId}`);
      name = data.name || "";
      email = data.email || "";
      mobile = data.mobile || "";
      status = data.status || "active";
      workshopEmployeeId = data.workshopEmployeeId || "";
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
        data: {
          name,
          email,
          mobile,
          status,
          permissions,
          workshopEmployeeId: workshopEmployeeId || null,
        },
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
    <div class="mb-3 flex items-center justify-between flex-wrap gap-2">
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
        <a href="/admin/app-user" class="btn btn-primary btn-sm">
          <i class="ti ti-list me-1"></i>List
        </a>
      </div>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header flex items-center justify-between flex-wrap gap-2">
        <h5 class="mb-0">Edit app user</h5>
        <span class="badge bg-soft-danger text-danger">App only · no CRM login</span>
      </div>

      <div class="card-body">
        <form on:submit={handleSubmit} autocomplete="off" class="needs-validation" novalidate>
          {#if errorMessage}
            <div class="alert alert-danger py-2 mb-3">{errorMessage}</div>
          {/if}
          {#if workshopLoadError}
            <div class="alert alert-warning py-2 mb-3">{workshopLoadError}</div>
          {/if}

          <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div>
              <div class="fw-semibold mb-2">Account</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="sm:col-span-2">
                  <label class="form-label" for="workshopEmployeeId"
                    >Workshop employee <span class="text-muted">(optional)</span></label
                  >
                  <select
                    class="form-select"
                    class:is-invalid={formErrors.workshopEmployeeId}
                    id="workshopEmployeeId"
                    bind:value={workshopEmployeeId}
                    on:change={onWorkshopPick}
                  >
                    <option value="">— None —</option>
                    {#each workshopEmployees as emp}
                      <option value={emp._id}>{workshopEmployeeLabel(emp)}</option>
                    {/each}
                  </select>
                  {#if workshopEmployeeId && !workshopEmployees.some((e) => e._id === workshopEmployeeId)}
                    <small class="text-warning d-block mt-1"
                      >Linked id <code>{workshopEmployeeId}</code> not in list
                      (kept).</small
                    >
                  {/if}
                </div>

                <div>
                  <label class="form-label" for="name"
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
                  <label class="form-label" for="email"
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
                  <label class="form-label" for="mobile">Mobile</label>
                  <input class="form-control" type="text" bind:value={mobile} id="mobile" />
                </div>

                <div>
                  <label class="form-label" for="status">Status</label>
                  <select class="form-select" id="status" bind:value={status}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <div class="fw-semibold mb-2">Permissions</div>
              <AppUserPermissionsEditor bind:permissions />
            </div>
          </div>

          <div class="mt-4 pt-3 border-top flex items-center gap-2">
            <button type="submit" class="btn btn-primary" disabled={loading}>
              {#if loading}
                <span class="spinner-border spinner-border-sm me-1"></span>
                Saving…
              {:else}
                <i class="ti ti-device-floppy me-1"></i>Save changes
              {/if}
            </button>
            <a href="/admin/app-user/{userId}" class="btn btn-light">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
