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
  let selectedRoles = ["user"];
  let companyId = null;
  let loginStartTime = "";
  let loginEndTime = "";
  let loading = false;
  let errorMessage = "";
  let formErrors = {};
  let companies = [];

  // Allowed sales users (master setting for admin users)
  let salesUsersGroups = {}; // { telecaller: [{id,name}], tech: [...], manager: [...] }
  let allowedSalesUserIds = null; // null = no restriction

  // Per-role permissions
  let rolePerms = {
    admin:   { subRole: null, orderAccess: true, queryAccessTelecaller: true, queryAccessTech: true, queryAccessTechHelper: true },
    manager: { subRole: null, orderAccess: true, queryAccessTelecaller: true, queryAccessTech: true, queryAccessTechHelper: true },
    user:    { subRole: null, orderAccess: true, queryAccessTelecaller: true, queryAccessTech: true, queryAccessTechHelper: true },
  };

  const availableRoles = ["admin", "manager", "user"];

  let userId;
  $: userId = $page.params.id;

  let currentUser;
  onMount(async () => {
    currentUser = checkAuth();
    if (currentUser?.role === "user") {
      loadingData = false;
      Swal.fire({ icon: "warning", title: "Access Denied", text: "You are not authorized.", confirmButtonText: "Go Back" }).then(() => window.history.back());
      return;
    }
    loadingData = true;
    try {
      const data = await authApiFetch(`${API_ROUTES.USER}/${userId}`);
      name = data.name;
      email = data.email;
      mobile = data.mobile;
      whatsapp = data.whatsapp;
      companyId = data?.company?.id || null;
      loginStartTime = data.loginStartTime || "09:00";
      loginEndTime = data.loginEndTime || "18:10";
      allowedSalesUserIds = data.allowedSalesUserIds ?? null;

      // Load roles
      selectedRoles = data.roles && data.roles.length > 0 ? data.roles : [data.role ?? "user"];

      // Load rolePermissions — fallback to flat fields if missing
      if (data.rolePermissions) {
        for (const r of selectedRoles) {
          if (data.rolePermissions[r]) {
            rolePerms[r] = { ...rolePerms[r], ...data.rolePermissions[r] };
          }
        }
      } else {
        // Legacy user — build from flat fields
        const primaryRole = data.role ?? "user";
        rolePerms[primaryRole] = {
          subRole: primaryRole === "user" ? (data.subRole ?? null) : null,
          orderAccess: data.orderAccess ?? true,
          queryAccessTelecaller: data.queryAccessTelecaller ?? true,
          queryAccessTech: data.queryAccessTech ?? true,
          queryAccessTechHelper: data.queryAccessTechHelper ?? true,
        };
      }
    } catch (error) {
      errorMessage = "Failed to load user data.";
    } finally {
      loading = false;
      setTimeout(() => { loadingData = false; }, 500);
    }
    getAllCompanies();
    if (currentUser?.role === "master") loadSalesUsers();
  });

  async function loadSalesUsers() {
    try {
      const data = await authApiFetch(`${API_ROUTES.USER}/sales-users`);
      salesUsersGroups = data;
    } catch (_) {}
  }

  function toggleSalesUser(id) {
    if (!allowedSalesUserIds) {
      allowedSalesUserIds = [id];
    } else if (allowedSalesUserIds.includes(id)) {
      const updated = allowedSalesUserIds.filter(x => x !== id);
      allowedSalesUserIds = updated.length ? updated : null;
    } else {
      allowedSalesUserIds = [...allowedSalesUserIds, id];
    }
  }

  function toggleGroup(users) {
    const ids = users.map(u => u.id);
    const allSelected = ids.every(id => allowedSalesUserIds?.includes(id));
    if (allSelected) {
      const updated = (allowedSalesUserIds ?? []).filter(id => !ids.includes(id));
      allowedSalesUserIds = updated.length ? updated : null;
    } else {
      const merged = [...new Set([...(allowedSalesUserIds ?? []), ...ids])];
      allowedSalesUserIds = merged;
    }
  }

  function toggleRole(role) {
    if (selectedRoles.includes(role)) {
      if (selectedRoles.length === 1) return;
      selectedRoles = selectedRoles.filter(r => r !== role);
    } else {
      selectedRoles = [...selectedRoles, role];
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    if (companyId == null) {
      formErrors.companyId = ["Company is required."];
      loading = false;
      return;
    }

    // Build rolePermissions from UI state
    const rolePermissions = {};
    for (const r of selectedRoles) {
      rolePermissions[r] = { ...rolePerms[r] };
      if (r !== "user") rolePermissions[r].subRole = null;
    }

    const primaryRole = selectedRoles[0];
    const primaryPerms = rolePermissions[primaryRole];

    const updatedUser = {
      name, email, mobile, whatsapp,
      role: primaryRole,
      subRole: primaryPerms.subRole ?? null,
      orderAccess: primaryPerms.orderAccess,
      queryAccessTelecaller: primaryPerms.queryAccessTelecaller,
      queryAccessTech: primaryPerms.queryAccessTech,
      queryAccessTechHelper: primaryPerms.queryAccessTechHelper,
      roles: selectedRoles,
      rolePermissions,
      company: companyId,
      loginStartTime: loginStartTime || null,
      loginEndTime: loginEndTime || null,
      allowedSalesUserIds: currentUser?.role === "master" && selectedRoles.includes("admin") ? (allowedSalesUserIds ?? null) : undefined,
    };

    try {
      const data = await authApiFetch(`${API_ROUTES.USER}/${userId}`, { method: "PUT", data: JSON.stringify(updatedUser) });
      Swal.fire("Success!", data.message, "success");
      goto("/admin/user");
    } catch (error) {
      loading = false;
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") formErrors = validationErrors;
      else errorMessage = "An unexpected error occurred.";
    } finally {
      loading = false;
    }
  }

  async function getAllCompanies() {
    const cached = get(companiesAllStore);
    if (cached && cached.length > 0) { companies = cached; loadingData = false; return; }
    loadingData = true;
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = data;
      companiesAllStore.set(data);
    } catch (err) {
      errorMessage = "Failed to load company data.";
    } finally {
      setTimeout(() => { loadingData = false; }, 500);
    }
  }
</script>

{#if loadingData}<Loader />{/if}

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
              <label class="form-label" for="name">Name <span class="text-danger">*</span></label>
              <input class="form-control" class:is-invalid={formErrors.name} type="text" bind:value={name} placeholder="Name" id="name" required />
              {#if formErrors.name}<ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.name[0]}</li></ul>{/if}
            </div>
            <div>
              <label class="form-label" for="email">Email <span class="text-danger">*</span></label>
              <input class="form-control" class:is-invalid={formErrors.email} type="email" bind:value={email} placeholder="email" id="email" required />
              {#if formErrors.email}<ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.email[0]}</li></ul>{/if}
            </div>
            <div>
              <label class="form-label" for="mobile">Mobile</label>
              <input class="form-control" type="text" bind:value={mobile} placeholder="Mobile" id="mobile" />
            </div>
            <div>
              <label class="form-label" for="whatsapp">Whatsapp</label>
              <input class="form-control" type="text" bind:value={whatsapp} placeholder="Whatsapp" id="whatsapp" />
            </div>
            <div>
              <label class="form-label" for="companyId">Company <span class="text-danger">*</span></label>
              <select name="companyId" id="companyId" class="select form-control" class:is-invalid={formErrors.companyId} bind:value={companyId} required>
                <option value={null}>Select Company</option>
                {#each companies as company}
                  <option value={company?.id}>{company?.name}</option>
                {/each}
              </select>
              {#if formErrors.companyId}<ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.companyId[0]}</li></ul>{/if}
            </div>
            <div>
              <label class="form-label" for="loginStartTime">Login Start Time</label>
              <input class="form-control" type="time" bind:value={loginStartTime} id="loginStartTime" />
              <small class="text-muted">Leave blank to use default (09:00)</small>
            </div>
            <div>
              <label class="form-label" for="loginEndTime">Login End Time</label>
              <input class="form-control" type="time" bind:value={loginEndTime} id="loginEndTime" />
              <small class="text-muted">Leave blank to use default (18:10)</small>
            </div>
          </div>

          <!-- Roles multi-select -->
          <div class="mt-4">
            <label class="form-label">Roles <span class="text-danger">*</span></label>
            <div class="d-flex gap-3 flex-wrap">
              {#each availableRoles as role}
                {#if role !== currentUser?.role}
                  <div class="form-check">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="role_{role}"
                      checked={selectedRoles.includes(role)}
                      on:change={() => toggleRole(role)}
                    />
                    <label class="form-check-label text-capitalize" for="role_{role}">{role}</label>
                  </div>
                {/if}
              {/each}
            </div>
            <small class="text-muted">First selected role is the primary role.</small>
          </div>

          <!-- Per-role permission sections — all boxes in one row -->
          {#if selectedRoles.length > 0}
            <div class="mt-3 grid grid-cols-3 gap-3">
              {#each selectedRoles as role}
                <div class="role-perms-box">
                  <div class="role-perms-title">
                    <i class="ti ti-shield-check me-1"></i>
                    <span class="text-capitalize">{role}</span> Permissions
                  </div>

                  {#if role === "user"}
                    <div class="mt-2">
                      <label class="form-label" for="subRole_{role}">Sub Role</label>
                      <select id="subRole_{role}" class="select form-control" bind:value={rolePerms[role].subRole}>
                        <option value={null}>None</option>
                        <option value="telecaller">Telecaller</option>
                        <option value="tech">Tech</option>
                        <option value="tech_helper">Tech Helper</option>
                      </select>
                    </div>
                    {#if rolePerms[role].subRole === "tech" || rolePerms[role].subRole === "tech_helper"}
                      <div class="perm-row mt-2">
                        <span class="perm-label">Order Access</span>
                        <div class="form-check form-switch mb-0">
                          <input class="form-check-input" type="checkbox" id="orderAccess_{role}" bind:checked={rolePerms[role].orderAccess} />
                          <label class="form-check-label" for="orderAccess_{role}">{rolePerms[role].orderAccess ? "Allowed" : "Blocked"}</label>
                        </div>
                      </div>
                    {/if}
                  {/if}

                  {#if (role === "admin" || role === "manager") && currentUser?.role === "master"}
                    <div class="mt-2 d-flex flex-column gap-2">
                      <div class="perm-row">
                        <div>
                          <div class="perm-label">View Telecaller Info</div>
                          <div class="perm-desc">Can see telecaller names in queries, chat &amp; stats</div>
                        </div>
                        <div class="form-check form-switch mb-0">
                          <input class="form-check-input" type="checkbox" id="qat_{role}" bind:checked={rolePerms[role].queryAccessTelecaller} />
                          <label class="form-check-label" for="qat_{role}">{rolePerms[role].queryAccessTelecaller ? "Allowed" : "Blocked"}</label>
                        </div>
                      </div>
                      <div class="perm-row">
                        <div>
                          <div class="perm-label">View Tech Info</div>
                          <div class="perm-desc">Can see tech names in queries, chat &amp; stats</div>
                        </div>
                        <div class="form-check form-switch mb-0">
                          <input class="form-check-input" type="checkbox" id="qatech_{role}" bind:checked={rolePerms[role].queryAccessTech} />
                          <label class="form-check-label" for="qatech_{role}">{rolePerms[role].queryAccessTech ? "Allowed" : "Blocked"}</label>
                        </div>
                      </div>
                      <div class="perm-row">
                        <div>
                          <div class="perm-label">View Tech Helper Info</div>
                          <div class="perm-desc">Can see tech helper names in queries, chat &amp; stats</div>
                        </div>
                        <div class="form-check form-switch mb-0">
                          <input class="form-check-input" type="checkbox" id="qatHelper_{role}" bind:checked={rolePerms[role].queryAccessTechHelper} />
                          <label class="form-check-label" for="qatHelper_{role}">{rolePerms[role].queryAccessTechHelper ? "Allowed" : "Blocked"}</label>
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if currentUser?.role === "master" && selectedRoles.includes("admin")}
            <div class="mt-4">
              <label class="form-label fw-bold">Allowed Sales Users</label>
              <div class="text-muted small mb-2">
                {#if !allowedSalesUserIds}
                  No restriction — admin sees all users' data.
                {:else}
                  Restricted to {allowedSalesUserIds.length} selected user(s).
                {/if}
              </div>
              <div class="allowed-users-box">
                {#each Object.entries(salesUsersGroups) as [group, users]}
                  {#if users.length > 0}
                    <div class="mb-3">
                      <div class="d-flex align-items-center gap-2 mb-1">
                        <input
                          type="checkbox"
                          id="group_{group}"
                          checked={users.every(u => allowedSalesUserIds?.includes(u.id))}
                          indeterminate={users.some(u => allowedSalesUserIds?.includes(u.id)) && !users.every(u => allowedSalesUserIds?.includes(u.id))}
                          on:change={() => toggleGroup(users)}
                          class="form-check-input mt-0"
                        />
                        <label for="group_{group}" class="group-label text-capitalize">{group}</label>
                      </div>
                      <div class="ps-4 d-flex flex-wrap gap-2">
                        {#each users as user}
                          <label class="user-chip" class:selected={allowedSalesUserIds?.includes(user.id)}>
                            <input type="checkbox" class="d-none" checked={allowedSalesUserIds?.includes(user.id)} on:change={() => toggleSalesUser(user.id)} />
                            {user.name}
                          </label>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/each}
                {#if Object.keys(salesUsersGroups).length === 0}
                  <p class="text-muted small">No sales users found.</p>
                {/if}
              </div>
            </div>
          {/if}

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

<style>
  .role-perms-box {
    background: #f8f9ff;
    border: 1px solid #d0d7f5;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .role-perms-title {
    font-size: 12.5px;
    font-weight: 700;
    color: #3b5bdb;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .perm-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 8px 12px;
  }
  .perm-label {
    font-size: 13px;
    font-weight: 600;
    color: #333;
  }
  .perm-desc {
    font-size: 11px;
    color: #888;
    margin-top: 1px;
  }
  .allowed-users-box {
    background: #f8f9ff;
    border: 1px solid #d0d7f5;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .group-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #3b5bdb;
    cursor: pointer;
  }
  .user-chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 20px;
    border: 1px solid #ced4da;
    background: #fff;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.15s;
    user-select: none;
  }
  .user-chip.selected {
    background: #3b5bdb;
    border-color: #3b5bdb;
    color: #fff;
  }
</style>
