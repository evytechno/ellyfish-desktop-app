<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  let loadingData = true;
  import { checkAuth } from "$lib/utils/auth";
  import { companiesAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";

  // Form state
  let name = "";
  let email = "";
  let mobile = "";
  let whatsapp = "";
  let password = "";
  let role = "user";
  let companyId = null;
  let loading = false;
  let errorMessage = "";

  let companies = [];

  // Field-specific error messages
  let formErrors = {};

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
    getAllCompanies();
    setTimeout(() => {
      loadingData = false;
    }, 500);
  });

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors

    const newUser = { name, email, password, mobile, whatsapp, role };
    if (companyId != null) {
      newUser.company = companyId;
    }
    if (companyId == null) {
      formErrors.companyId = ["Company is required."];
      loading = false;
      return;
    }

    try {
      const data = await authApiFetch(API_ROUTES.USER, {
        method: "POST",
        data: JSON.stringify(newUser),
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
      console.log("formErrors : ", formErrors);

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
      <h4 class="mb-1">Add User</h4>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item"><a href="/admin/user">Users</a></li>
          <li class="breadcrumb-item active" aria-current="page">Add User</li>
        </ol>
      </nav>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header flex items-center justify-between">
        <h5>Add User</h5>
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
            <div>
              <label class="form-label" for="password"
                >Password <span class="text-danger">*</span></label
              >
              <input
                class="form-control"
                class:is-invalid={formErrors.password}
                type="password"
                bind:value={password}
                placeholder="Password"
                id="password"
                required
              />
              {#if formErrors.password}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.password[0]}</li>
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
