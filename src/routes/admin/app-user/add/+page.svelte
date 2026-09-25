<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
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
  let showPassword = false;

  let name = "";
  let email = "";
  let mobile = "";
  let password = "";
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
        text: "Only master can create app users.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return;
    }
    try {
      workshopEmployees = await fetchWorkshopSalesEmployees();
      if (!workshopEmployees.length) {
        workshopLoadError =
          "Workshop list empty — check API URL / HMAC, or fill fields manually.";
      }
    } catch {
      workshopLoadError = "Could not load workshop employees.";
    }
    setTimeout(() => {
      loadingData = false;
    }, 300);
  });

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    formErrors = {};
    loading = true;

    try {
      const data = await authApiFetch(API_ROUTES.APP_USER, {
        method: "POST",
        data: {
          name,
          email,
          password,
          mobile,
          permissions,
          workshopEmployeeId: workshopEmployeeId || null,
        },
      });
      Swal.fire("Success!", data.message, "success");
      goto("/admin/app-user");
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
        <h4 class="mb-1">Add App User</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item"><a href="/admin/app-user">App Users</a></li>
            <li class="breadcrumb-item active" aria-current="page">Add</li>
          </ol>
        </nav>
      </div>
      <a href="/admin/app-user" class="btn btn-primary btn-sm">
        <i class="ti ti-list me-1"></i>App user list
      </a>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header flex items-center justify-between flex-wrap gap-2">
        <h5 class="mb-0">Create app user</h5>
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
            <!-- Left: account fields -->
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
                    <option value="">— None (samples only) —</option>
                    {#each workshopEmployees as emp}
                      <option value={emp._id}>{workshopEmployeeLabel(emp)}</option>
                    {/each}
                  </select>
                  <small class="text-muted"
                    >Only installers who need Installation visits</small
                  >
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
                    placeholder="Name"
                    autocomplete="off"
                    required
                  />
                  {#if formErrors.name}
                    <ul class="text-danger mt-1 text-xs capitalize">
                      <li>{formErrors.name[0]}</li>
                    </ul>
                  {/if}
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
                    placeholder="email@company.com"
                    autocomplete="off"
                    required
                  />
                  {#if formErrors.email}
                    <ul class="text-danger mt-1 text-xs capitalize">
                      <li>{formErrors.email[0]}</li>
                    </ul>
                  {/if}
                </div>

                <div>
                  <label class="form-label" for="mobile">Mobile</label>
                  <input
                    class="form-control"
                    type="text"
                    bind:value={mobile}
                    id="mobile"
                    placeholder="Optional"
                    autocomplete="off"
                  />
                </div>

                <div>
                  <label class="form-label" for="password"
                    >Password <span class="text-danger">*</span></label
                  >
                  <div class="input-group">
                    {#if showPassword}
                      <input
                        class="form-control"
                        class:is-invalid={formErrors.password}
                        type="text"
                        bind:value={password}
                        id="password"
                        placeholder="Password"
                        autocomplete="new-password"
                        required
                      />
                    {:else}
                      <input
                        class="form-control"
                        class:is-invalid={formErrors.password}
                        type="password"
                        bind:value={password}
                        id="password"
                        placeholder="Password"
                        autocomplete="new-password"
                        required
                      />
                    {/if}
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      on:click={() => (showPassword = !showPassword)}
                      tabindex="-1"
                    >
                      <i class="ti {showPassword ? 'ti-eye-off' : 'ti-eye'}"></i>
                    </button>
                  </div>
                  {#if formErrors.password}
                    <ul class="text-danger mt-1 text-xs capitalize">
                      <li>{formErrors.password[0]}</li>
                    </ul>
                  {:else}
                    <small class="text-muted"
                      >Min 6 · uppercase · number · special (@$!%*?&)</small
                    >
                  {/if}
                </div>
              </div>
            </div>

            <!-- Right: permissions -->
            <div>
              <div class="fw-semibold mb-2">Permissions</div>
              <AppUserPermissionsEditor bind:permissions />
            </div>
          </div>

          <div class="mt-4 pt-3 border-top flex items-center gap-2">
            <button type="submit" class="btn btn-primary" disabled={loading}>
              {#if loading}
                <span class="spinner-border spinner-border-sm me-1"></span>
                Creating…
              {:else}
                <i class="ti ti-check me-1"></i>Create App User
              {/if}
            </button>
            <a href="/admin/app-user" class="btn btn-light">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>
