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

  let permissions = {
    sample_view: true,
    sample_update: true,
    dispatch_view: true,
    dispatch_update: true,
    dispatch_hold: true,
  };

  onMount(() => {
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
        data: { name, email, password, mobile, permissions },
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
    <div class="flex items-start justify-between gap-3 mb-4 flex-wrap">
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
      <a href="/admin/app-user" class="btn btn-outline-secondary btn-sm">
        <i class="ti ti-arrow-left me-1"></i>Back to list
      </a>
    </div>

    <form on:submit={handleSubmit} autocomplete="off">
      <div class="grid gap-3 app-user-form">
        <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
          <div class="card-header bg-white border-bottom py-3">
            <div class="flex items-center gap-2">
              <span class="app-user-icon"><i class="ti ti-device-mobile"></i></span>
              <div>
                <h5 class="mb-0">Account details</h5>
                <small class="text-muted">Login for Sample / Dispatch app only</small>
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
                  placeholder="Warehouse user name"
                  autocomplete="off"
                  required
                />
                {#if formErrors.name}
                  <div class="invalid-feedback d-block">{formErrors.name[0]}</div>
                {/if}
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
                  placeholder="app.user@company.com"
                  autocomplete="off"
                  required
                />
                {#if formErrors.email}
                  <div class="invalid-feedback d-block">{formErrors.email[0]}</div>
                {/if}
              </div>
              <div>
                <label class="form-label fw-semibold" for="mobile">Mobile</label>
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
                <label class="form-label fw-semibold" for="password"
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
                      placeholder="Create a strong password"
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
                      placeholder="Create a strong password"
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
                  <div class="invalid-feedback d-block">{formErrors.password[0]}</div>
                {:else}
                  <small class="text-muted"
                    >Min 6 chars · uppercase · number · special (@$!%*?&)</small
                  >
                {/if}
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

        <div class="flex items-center gap-2 sticky-actions">
          <button type="submit" class="btn btn-primary px-4" disabled={loading}>
            {#if loading}
              <span class="spinner-border spinner-border-sm me-1"></span>
              Creating…
            {:else}
              <i class="ti ti-check me-1"></i>Create App User
            {/if}
          </button>
          <a href="/admin/app-user" class="btn btn-light">Cancel</a>
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
  .app-user-form {
    max-width: 920px;
  }
  .sticky-actions {
    padding: 0.75rem 0 1.25rem;
  }
</style>
