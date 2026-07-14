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

  let userId;
  $: userId = $page.params.id;

  let password = "";
  let confirmPassword = "";

  let formErrors = {};
  let loading = false;

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
      user = data;
    } catch (err) {
      errorMessage = "Failed to load user data.";
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  });

  async function handleSubmitForChangePassword(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {}; // Reset previous errors

    const updatePassword = { password };

    // Validation rules
    const passwordPattern =
      /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

    // Client-side validation
    if (!password) {
      formErrors.password = ["Password is required."];
    } else if (password.length < 6) {
      formErrors.password = ["Password must be at least 6 characters."];
    } else if (!passwordPattern.test(password)) {
      formErrors.password = [
        "Password too weak. It must include at least one uppercase letter, one number, and one special character.",
      ];
    }

    if (!confirmPassword) {
      formErrors.confirmPassword = ["Confirm Password is required."];
    } else if (password !== confirmPassword) {
      formErrors.confirmPassword = ["Passwords do not match."];
    }

    // If any validation errors, stop and return
    if (Object.keys(formErrors).length > 0) {
      loading = false;
      return;
    }

    try {
      const data = await authApiFetch(
        `${API_ROUTES.USER}/changepassword/${userId}`,
        {
          method: "POST",
          data: JSON.stringify(updatePassword),
        }
      );

      Swal.fire("Success!", data.message, "success");

      // Reset form fields
      password = "";
      confirmPassword = "";
    } catch (error) {
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
  <!-- Start Content -->
  <div class="content pb-0">
    <!-- Page Header -->
    <div
      class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap"
    >
      <div>
        <button class="btn btn-warning btn-sm mb-2" on:click={() => history.length > 2 ? history.back() : window.location.href='/admin/user'}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <h4 class="mb-1">User</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item"><a href="/admin/user">Users</a></li>
            <li class="breadcrumb-item active" aria-current="page">User</li>
          </ol>
        </nav>
      </div>
    </div>
    <!-- End Page Header -->

    {#if user}
      <div class="row">
        <div class="col-md-12">
          <div class="card">
            <div class="card-body pb-2">
              <div
                class="d-flex align-items-center justify-content-between flex-wrap"
              >
                <div class="d-flex align-items-center mb-2">
                  <div
                    class="avatar avatar-xxl avatar-rounded me-3 flex-shrink-0"
                  >
                    <img src="/assets/img/profiles/user.png" alt="img" />
                    <span class="status online"></span>
                  </div>
                  <div>
                    <h5 class="mb-1 capitalize">{user?.name}</h5>
                    <p class="mb-0 capitalize">{user?.role}</p>
                    {#if user?.subRole}
                      <p class="mb-2 text-muted small capitalize">{user.subRole}</p>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- /Contact User -->
        </div>

        <!-- Contact Sidebar -->
        <div class="col-xl-4">
          <div class="card">
            <div class="card-body p-3">
              <h6 class="mb-3 fw-semibold">Basic Information</h6>
              <div class="border-bottom mb-3 pb-3">
                <div class="d-flex align-items-center mb-2">
                  <span
                    class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                  >
                    <i class="ti ti-mail fs-14"></i>
                  </span>
                  <p class="mb-0">
                    <a href="mailto:{user?.email}">{user?.email}</a>
                  </p>
                </div>
                <div class="d-flex align-items-center mb-2">
                  <span
                    class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                  >
                    <i class="ti ti-phone fs-14"></i>
                  </span>
                  <p class="mb-0">{user?.mobile}</p>
                </div>
                <div class="d-flex align-items-center mb-2">
                  <span
                    class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                  >
                    <i class="ti ti-phone fs-14"></i>
                  </span>
                  <p class="mb-0">{user?.whatsapp}</p>
                </div>
                {#if user?.address}
                  <div class="d-flex align-items-center mb-3">
                    <span
                      class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                    >
                      <i class="ti ti-map-pin fs-14"></i>
                    </span>
                    <p class="mb-0">{user?.address}</p>
                  </div>
                {/if}
                <div class="d-flex align-items-center mb-2">
                  <span
                    class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                  >
                    <i class="ti ti-clock fs-14"></i>
                  </span>
                  <p class="mb-0">
                    Login Window:
                    <strong>
                      {user?.loginStartTime || "09:00"} – {user?.loginEndTime || "18:10"} IST
                    </strong>
                    {#if user?.loginStartTime || user?.loginEndTime}
                      <span class="badge bg-success ms-1" style="font-size:10px;">Custom</span>
                    {:else}
                      <span class="badge bg-secondary ms-1" style="font-size:10px;">Default</span>
                    {/if}
                  </p>
                </div>
                <div class="d-flex align-items-center">
                  <span
                    class="avatar avatar-xs bg-light p-0 flex-shrink-0 rounded-circle text-dark me-2"
                  >
                    <i class="ti ti-calendar-exclamation fs-14"></i>
                  </span>
                  <p class="mb-0">
                    Created on {user?.createdAt &&
                      new Date(user.createdAt).toLocaleString("en-GB", {
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
        <div class="col-xl-8">
          <div class="card">
            <div class="card-body p-3">
              <h6 class="mb-3 fw-semibold">Change Password</h6>
              <form
                on:submit={handleSubmitForChangePassword}
                class="needs-validation"
                novalidate
              >
                <div class="grid grid-cols-1 gap-4">
                  <div>
                    <label class="form-label" for="password">Password</label>
                    <input
                      class="form-control"
                      class:is-invalid={formErrors.password}
                      type="text"
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
                  <div>
                    <label class="form-label" for="confirmPassword">
                      Confirm Password
                    </label>
                    <input
                      class="form-control"
                      class:is-invalid={formErrors.confirmPassword}
                      type="text"
                      bind:value={confirmPassword}
                      placeholder="Confirm Password"
                      id="confirmPassword"
                      required
                    />
                    {#if formErrors.confirmPassword}
                      <ul class="text-danger mt-1 text-xs capitalize">
                        <li>{formErrors.confirmPassword[0]}</li>
                      </ul>
                    {/if}
                  </div>
                </div>

                <div class="flex justify-end mt-4">
                  <button
                    class="btn btn-primary"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? "Updating..." : "Update"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
        <!-- /Contact Sidebar -->
      </div>
    {:else}
      <div class="row">
        <div class="col-md-12">Loading user details...</div>
      </div>
    {/if}
    <!-- Start Footer -->
  </div>
  <!-- End Content -->
</div>
