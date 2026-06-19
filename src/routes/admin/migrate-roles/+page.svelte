<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import Loader from "$lib/components/Loader.svelte";

  let currentUser;
  let loadingData = true;
  let running = false;
  let done = false;

  // All users fetched from API
  let allUsers = [];
  // Users that need migration (roles null/empty)
  let toMigrate = [];
  // Results per user
  let results = []; // { id, name, role, status: 'pending'|'success'|'error', error }

  let processed = 0;
  let successCount = 0;
  let errorCount = 0;

  onMount(async () => {
    currentUser = checkAuth();
    if (currentUser?.role !== "master") {
      goto("/admin/dashboard");
      return;
    }
    await loadUsers();
    loadingData = false;
  });

  async function loadUsers() {
    try {
      // Fetch all users with a high limit — returns full data including permissions
      const data = await authApiFetch(`${API_ROUTES.USER}?page=1&limit=1000`);
      allUsers = data.data ?? [];

      // Filter users not yet migrated (roles null, undefined, or empty array)
      toMigrate = allUsers.filter(
        (u) => !u.roles || u.roles.length === 0
      );

      results = toMigrate.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        subRole: u.subRole ?? null,
        status: "pending",
        error: null,
      }));
    } catch (e) {
      allUsers = [];
      toMigrate = [];
    }
  }

  function buildRolePermissions(user) {
    const role = user.role ?? "user";
    return {
      roles: [role],
      rolePermissions: {
        [role]: {
          subRole: role === "user" ? (user.subRole ?? null) : null,
          orderAccess: user.orderAccess ?? true,
          queryAccessTelecaller: user.queryAccessTelecaller ?? true,
          queryAccessTech: user.queryAccessTech ?? true,
          queryAccessTechHelper: user.queryAccessTechHelper ?? true,
        },
      },
    };
  }

  async function runMigration() {
    if (running || toMigrate.length === 0) return;
    running = true;
    done = false;
    processed = 0;
    successCount = 0;
    errorCount = 0;

    // Reset all to pending
    results = results.map((r) => ({ ...r, status: "pending", error: null }));

    for (let i = 0; i < toMigrate.length; i++) {
      const user = toMigrate[i];
      const payload = buildRolePermissions(user);

      results[i] = { ...results[i], status: "running" };
      results = [...results]; // trigger reactivity

      try {
        await authApiFetch(`${API_ROUTES.USER}/${user.id}`, {
          method: "PUT",
          data: JSON.stringify(payload),
        });
        results[i] = { ...results[i], status: "success" };
        successCount++;
      } catch (e) {
        const msg = e?.message || "Unknown error";
        results[i] = { ...results[i], status: "error", error: msg };
        errorCount++;
      }

      processed++;
      results = [...results];
    }

    running = false;
    done = true;
  }

  $: progress = toMigrate.length > 0 ? Math.round((processed / toMigrate.length) * 100) : 100;
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4">
      <h4 class="mb-1">Migrate User Roles</h4>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item active" aria-current="page">Migrate Roles</li>
        </ol>
      </nav>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header flex items-center justify-between">
        <h5>One-Time Role Migration</h5>
      </div>

      <div class="card-body">
        <!-- Info box -->
        <div class="alert alert-info d-flex gap-2 align-items-start mb-4">
          <i class="ti ti-info-circle fs-18 mt-1"></i>
          <div>
            <strong>What this does:</strong> Backfills the new <code>roles</code> and <code>rolePermissions</code> fields
            for existing users based on their current <code>role</code>, <code>subRole</code>, and permission settings.
            Safe to run multiple times — already-migrated users are skipped automatically.
          </div>
        </div>

        <!-- Summary counts -->
        <div class="grid grid-cols-3 gap-4 mb-4">
          <div class="stat-card">
            <div class="stat-number">{allUsers.length}</div>
            <div class="stat-label">Total Users</div>
          </div>
          <div class="stat-card stat-warn">
            <div class="stat-number">{toMigrate.length}</div>
            <div class="stat-label">Need Migration</div>
          </div>
          <div class="stat-card stat-success">
            <div class="stat-number">{allUsers.length - toMigrate.length}</div>
            <div class="stat-label">Already Migrated</div>
          </div>
        </div>

        {#if toMigrate.length === 0 && !loadingData}
          <div class="alert alert-success d-flex gap-2 align-items-center">
            <i class="ti ti-circle-check fs-20"></i>
            <strong>All users are already migrated. Nothing to do.</strong>
          </div>
        {:else}
          <!-- Progress bar (shown while running or done) -->
          {#if running || done}
            <div class="mb-3">
              <div class="d-flex justify-content-between mb-1">
                <span class="text-sm text-muted">
                  {#if running}Migrating user {processed} of {toMigrate.length}...{:else}Done — {successCount} succeeded, {errorCount} failed{/if}
                </span>
                <span class="text-sm fw-semibold">{progress}%</span>
              </div>
              <div class="progress" style="height: 8px;">
                <div
                  class="progress-bar {errorCount > 0 ? 'bg-warning' : 'bg-success'}"
                  style="width: {progress}%"
                ></div>
              </div>
            </div>
          {/if}

          <!-- Run button -->
          <div class="mb-4">
            <button
              class="btn btn-primary"
              on:click={runMigration}
              disabled={running || (done && errorCount === 0)}
            >
              {#if running}
                <span class="spinner-border spinner-border-sm me-1"></span>
                Running...
              {:else if done && errorCount === 0}
                <i class="ti ti-circle-check me-1"></i> Migration Complete
              {:else if done && errorCount > 0}
                <i class="ti ti-refresh me-1"></i> Retry Failed ({errorCount})
              {:else}
                <i class="ti ti-player-play me-1"></i> Run Migration ({toMigrate.length} users)
              {/if}
            </button>
          </div>

          <!-- Results table -->
          {#if results.length > 0}
            <div class="table-responsive">
              <table class="table table-sm table-bordered">
                <thead class="table-light">
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Sub Role</th>
                    <th>Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {#each results as row, i}
                    <tr class:table-success={row.status === "success"} class:table-danger={row.status === "error"}>
                      <td>{i + 1}</td>
                      <td>{row.name}</td>
                      <td><span class="badge bg-secondary text-capitalize">{row.role}</span></td>
                      <td>{row.subRole ?? "—"}</td>
                      <td>
                        {#if row.status === "pending"}
                          <span class="badge bg-light text-muted">Pending</span>
                        {:else if row.status === "running"}
                          <span class="badge bg-primary">
                            <span class="spinner-border spinner-border-sm me-1" style="width:10px;height:10px;"></span>
                            Running
                          </span>
                        {:else if row.status === "success"}
                          <span class="badge bg-success"><i class="ti ti-check me-1"></i>Success</span>
                        {:else if row.status === "error"}
                          <span class="badge bg-danger"><i class="ti ti-x me-1"></i>Failed</span>
                        {/if}
                      </td>
                      <td class="text-muted text-xs">{row.error ?? "—"}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .stat-card {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 10px;
    padding: 16px 20px;
    text-align: center;
  }
  .stat-card.stat-warn { background: #fff8e1; border-color: #ffe082; }
  .stat-card.stat-success { background: #e8f5e9; border-color: #a5d6a7; }
  .stat-number { font-size: 28px; font-weight: 700; color: #333; }
  .stat-label { font-size: 12px; color: #666; margin-top: 2px; }
</style>
