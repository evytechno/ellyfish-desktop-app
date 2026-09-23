<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { page } from "$app/stores";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";

  let loadingData = true;
  let errorMessage = "";
  let user = null;
  let currentUser;

  let password = "";
  let confirmPassword = "";
  let formErrors = {};
  let loading = false;
  let showPassword = false;

  $: userId = $page.params.id;

  onMount(async () => {
    currentUser = checkAuth();
    if (currentUser?.role !== "master") {
      loadingData = false;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "Only master can view app users.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return;
    }
    await loadUser();
  });

  async function loadUser() {
    loadingData = true;
    try {
      user = await authApiFetch(`${API_ROUTES.APP_USER}/${userId}`);
    } catch (err) {
      errorMessage = "Failed to load app user.";
      errorHandle(err);
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 300);
    }
  }

  function formatLogin(val) {
    if (!val) return "Never";
    const d = new Date(val);
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
  }

  const permMeta = [
    { key: "sample_view", group: "Sample", label: "View" },
    { key: "sample_update", group: "Sample", label: "Update" },
    { key: "dispatch_view", group: "Dispatch", label: "View" },
    { key: "dispatch_update", group: "Dispatch", label: "Update" },
    { key: "dispatch_hold", group: "Dispatch", label: "Hold" },
  ];

  async function handleChangePassword(event) {
    event.preventDefault();
    formErrors = {};
    loading = true;

    const passwordPattern =
      /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

    if (!password) formErrors.password = ["Password is required."];
    else if (!passwordPattern.test(password))
      formErrors.password = [
        "Password too weak. It must include at least one uppercase letter, one number, and one special character.",
      ];

    if (!confirmPassword)
      formErrors.confirmPassword = ["Confirm Password is required."];
    else if (password !== confirmPassword)
      formErrors.confirmPassword = ["Passwords do not match."];

    if (Object.keys(formErrors).length > 0) {
      loading = false;
      return;
    }

    try {
      const data = await authApiFetch(
        `${API_ROUTES.APP_USER}/${userId}/changepassword`,
        { method: "POST", data: { password } },
      );
      Swal.fire("Success!", data.message, "success");
      password = "";
      confirmPassword = "";
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object")
        formErrors = validationErrors;
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
        <h4 class="mb-1 capitalize">{user?.name || "App User"}</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item"><a href="/admin/app-user">App Users</a></li>
            <li class="breadcrumb-item active" aria-current="page">Detail</li>
          </ol>
        </nav>
      </div>
      <div class="flex gap-2">
        <a href="/admin/app-user/edit/{userId}" class="btn btn-primary btn-sm">
          <i class="ti ti-edit me-1"></i>Edit
        </a>
        <a href="/admin/app-user" class="btn btn-outline-secondary btn-sm">
          <i class="ti ti-arrow-left me-1"></i>List
        </a>
      </div>
    </div>

    {#if errorMessage}
      <div class="alert alert-danger">{errorMessage}</div>
    {/if}

    {#if user}
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-3" style="max-width: 1100px;">
        <div class="lg:col-span-3 grid gap-3">
          <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
            <div class="card-body p-4">
              <div class="flex items-start gap-3 mb-4">
                <div class="profile-avatar">
                  {(user.name || "?").charAt(0).toUpperCase()}
                </div>
                <div class="flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h5 class="mb-0 capitalize">{user.name}</h5>
                    <span
                      class="badge {user.status === 'active'
                        ? 'bg-success'
                        : 'bg-secondary'} text-capitalize">{user.status}</span
                    >
                    <span class="badge bg-soft-danger text-danger">App only</span>
                  </div>
                  <div class="text-muted mt-1 text-sm">{user.email}</div>
                </div>
              </div>

              <div class="detail-grid">
                <div>
                  <div class="detail-label">Mobile</div>
                  <div class="detail-value">{user.mobile || "—"}</div>
                </div>
                <div>
                  <div class="detail-label">Last login</div>
                  <div class="detail-value">{formatLogin(user.lastLogin)}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
            <div class="card-header bg-white border-bottom py-3">
              <h6 class="mb-0">Permissions</h6>
            </div>
            <div class="card-body p-4">
              <div class="perm-readout">
                {#each ["Sample", "Dispatch"] as group}
                  <div class="perm-readout__group">
                    <div class="perm-readout__title">{group}</div>
                    <div class="flex flex-wrap gap-2">
                      {#each permMeta.filter((p) => p.group === group) as item}
                        <span
                          class="perm-pill"
                          class:on={user.permissions?.[item.key]}
                        >
                          {#if user.permissions?.[item.key]}
                            <i class="ti ti-check"></i>
                          {:else}
                            <i class="ti ti-x"></i>
                          {/if}
                          {item.label}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </div>

        <div class="lg:col-span-2">
          <div class="card border-0 shadow-sm rounded-3 overflow-hidden h-100">
            <div class="card-header bg-white border-bottom py-3">
              <h6 class="mb-0">Change password</h6>
            </div>
            <div class="card-body p-4">
              <form on:submit={handleChangePassword} autocomplete="off">
                <div class="mb-3">
                  <label class="form-label fw-semibold" for="password"
                    >New password</label
                  >
                  <div class="input-group">
                    {#if showPassword}
                      <input
                        class="form-control"
                        class:is-invalid={formErrors.password}
                        type="text"
                        bind:value={password}
                        id="password"
                        autocomplete="new-password"
                      />
                    {:else}
                      <input
                        class="form-control"
                        class:is-invalid={formErrors.password}
                        type="password"
                        bind:value={password}
                        id="password"
                        autocomplete="new-password"
                      />
                    {/if}
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      on:click={() => (showPassword = !showPassword)}
                    >
                      <i class="ti {showPassword ? 'ti-eye-off' : 'ti-eye'}"></i>
                    </button>
                  </div>
                  {#if formErrors.password}
                    <div class="invalid-feedback d-block">{formErrors.password[0]}</div>
                  {/if}
                </div>
                <div class="mb-3">
                  <label class="form-label fw-semibold" for="confirmPassword"
                    >Confirm password</label
                  >
                  <input
                    class="form-control"
                    class:is-invalid={formErrors.confirmPassword}
                    type="password"
                    bind:value={confirmPassword}
                    id="confirmPassword"
                    autocomplete="new-password"
                  />
                  {#if formErrors.confirmPassword}
                    <div class="invalid-feedback d-block"
                      >{formErrors.confirmPassword[0]}</div
                    >
                  {/if}
                </div>
                <button type="submit" class="btn btn-primary w-100" disabled={loading}>
                  {loading ? "Saving…" : "Update password"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .profile-avatar {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 0.75rem;
    background: linear-gradient(135deg, #fecaca, #f87171);
    color: #7f1d1d;
    font-weight: 700;
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding-top: 0.5rem;
    border-top: 1px solid #f3f4f6;
  }
  .detail-label {
    font-size: 0.75rem;
    color: #6b7280;
    margin-bottom: 0.15rem;
  }
  .detail-value {
    font-size: 0.925rem;
    color: #111827;
    font-weight: 500;
  }
  .perm-readout {
    display: grid;
    gap: 1rem;
  }
  .perm-readout__title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.4rem;
  }
  .perm-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
    font-size: 0.78rem;
    background: #f3f4f6;
    color: #9ca3af;
    border: 1px solid #e5e7eb;
  }
  .perm-pill.on {
    background: #fef2f2;
    color: #b91c1c;
    border-color: #fecaca;
  }
  :global(.bg-soft-danger) {
    background: #fef2f2 !important;
  }
</style>
