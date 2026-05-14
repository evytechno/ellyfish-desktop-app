<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { page } from "$app/stores";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  let loadingData = true;
  import { checkAuth } from "$lib/utils/auth";
  import { get } from "svelte/store";
  import { companiesAllStore } from "$lib/stores/dataStores";

  let name = "";
  let email = "";
  let mobile = "";
  let whatsapp = "";
  let role = "";
  let subRole = null;
  let orderAccess = true;
  let companyId = null;
  let loginStartTime = "";
  let loginEndTime = "";
  let loading = false;
  let errorMessage = "";
  let formErrors = {};

  let companies = [];

  let userId;
  $: userId = $page.params.id;

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
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.USER}/${userId}`);
      name = data.name;
      email = data.email;
      mobile = data.mobile;
      whatsapp = data.whatsapp;
      role = data.role;
      subRole = data.subRole || null;
      orderAccess = data.orderAccess ?? true;
      companyId = data?.company?.id || null;
      loginStartTime = data.loginStartTime || "09:00";
      loginEndTime = data.loginEndTime || "18:10";
    } catch (error) {
      errorMessage = "Failed to load user data.";
      console.error("Fetch error:", error);
      loading = false;
      const validationErrors = errorHandle(error);
    } finally {
      loading = false;
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
    getAllCompanies();
  });

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const updatedUser = { name, email, mobile, whatsapp, role,
      subRole: role === "user" ? (subRole || null) : null,
      orderAccess: (role === "user" && subRole === "tech") ? orderAccess : true,
      loginStartTime: loginStartTime || null,
      loginEndTime: loginEndTime || null,
    };
    if (companyId != null) {
      updatedUser.company = companyId;
    }
    if (companyId == null) {
      formErrors.companyId = ["Company is required."];
      loading = false;
      return;
    }
    try {
      const data = await authApiFetch(`${API_ROUTES.USER}/${userId}`, {
        method: "PUT",
        data: JSON.stringify(updatedUser),
      });

      Swal.fire("Success!", data.message, "success");
      goto("/admin/user");
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

  async function getAllCompanies() {
    const cached = get(companiesAllStore);
    if (cached && cached.length > 0) {
      companies = cached;
      loadingData = false;
      return;
    }
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = data;
      companiesAllStore.set(data);
    } catch (err) {
      errorMessage = "Failed to load company data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }
  const roles = ["admin", "manager", "user"];
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4">
      <h4 class="mb-1">Edit User</h4>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item"><a href="/admin/user">Users</a></li>
          <li class="breadcrumb-item active" aria-current="page">Edit User</li>
        </ol>
      </nav>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header flex items-center justify-between">
        <h5>Edit User</h5>
        <a href="/admin/user" class="btn btn-primary">
          <i class="ti ti-square-rounded-plus-filled me-1"></i>User List
        </a>
      </div>

      <div class="card-body">
        <form on:submit={handleSubmit} class="needs-validation" novalidate>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="form-label" for="name"
                >Name <span class="text-danger">*</span></label
              >
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
            <div>
              <label class="form-label" for="email"
                >Email <span class="text-danger">*</span></label
              >
              <input
                class="form-control"
                class:is-invalid={formErrors.email}
                type="email"
                bind:value={email}
                placeholder="email"
                id="email"
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
                class:is-invalid={formErrors.mobile}
                type="text"
                bind:value={mobile}
                placeholder="Mobile"
                id="mobile"
                required
              />
              {#if formErrors.mobile}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.mobile[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="whatsapp">Whatsapp</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.whatsapp}
                type="text"
                bind:value={whatsapp}
                placeholder="Whatsapp"
                id="whatsapp"
                required
              />
              {#if formErrors.whatsapp}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.whatsapp[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="companyId">
                Company <span class="text-danger">*</span>
              </label>
              <select
                name="companyId"
                id="companyId"
                class="select form-control"
                class:is-invalid={formErrors.companyId}
                bind:value={companyId}
                required
              >
                <option value={null}>Select Company</option>
                {#each companies as company}
                  <option value={company?.id}>{company?.name}</option>
                {/each}
              </select>
              {#if formErrors.companyId}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.companyId[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="role">
                Role <span class="text-danger">*</span>
              </label>
              <select
                name="role"
                id="role"
                class="select form-control"
                class:is-invalid={formErrors.role}
                bind:value={role}
                required
              >
                <option value={null}>Select Role</option>
                {#each roles as role}
                  {#if role != currentUser?.role}
                    <option value={role}>{role}</option>
                  {/if}
                {/each}
              </select>
              {#if formErrors.role}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.role[0]}</li>
                </ul>
              {/if}
            </div>
            {#if role === "user"}
              <div>
                <label class="form-label" for="subRole">Sub Role</label>
                <select
                  name="subRole"
                  id="subRole"
                  class="select form-control"
                  bind:value={subRole}
                >
                  <option value={null}>None</option>
                  <option value="telecaller">Telecaller</option>
                  <option value="tech">Tech</option>
                </select>
                {#if subRole === "tech"}
                  <div class="d-flex align-items-center gap-2 mt-2">
                    <div class="form-check form-switch mb-0">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        id="orderAccess"
                        bind:checked={orderAccess}
                      />
                      <label class="form-check-label" for="orderAccess">
                        Order Access
                      </label>
                    </div>
                    <span class="text-muted small">(allow this tech user to manage orders)</span>
                  </div>
                {/if}
              </div>
            {/if}
            <div>
              <label class="form-label" for="loginStartTime">Login Start Time</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.loginStartTime}
                type="time"
                bind:value={loginStartTime}
                id="loginStartTime"
              />
              <small class="text-muted">Leave blank to use default (09:00)</small>
              {#if formErrors.loginStartTime}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.loginStartTime[0]}</li>
                </ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="loginEndTime">Login End Time</label>
              <input
                class="form-control"
                class:is-invalid={formErrors.loginEndTime}
                type="time"
                bind:value={loginEndTime}
                id="loginEndTime"
              />
              <small class="text-muted">Leave blank to use default (18:10)</small>
              {#if formErrors.loginEndTime}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.loginEndTime[0]}</li>
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
