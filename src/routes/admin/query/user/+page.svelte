<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import { queryPrivacy } from "$lib/stores/queryPrivacy";

  let currentUser;
  let users   = [];
  let loading = true;

  // master always sees all; admin/manager filtered by their queryAccess flags
  $: canViewTelecaller  = currentUser?.role === "master" || (currentUser?.queryAccessTelecaller  ?? true);
  $: canViewTech        = currentUser?.role === "master" || (currentUser?.queryAccessTech        ?? true);
  $: canViewTechHelper  = currentUser?.role === "master" || (currentUser?.queryAccessTechHelper  ?? true);

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.role === "user") { goto("/admin/dashboard"); return; }
    try {
      const all = await authApiFetch(`${API_ROUTES.USER}/all`);
      users = (all ?? []).filter(u => u.subRole === "telecaller" || u.subRole === "tech" || u.subRole === "tech_helper");
    } catch (_) {}
    finally { loading = false; }
  });

  function initials(name) {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  }

  $: maskTC     = (name) => (currentUser?.role === "master" && $queryPrivacy.telecaller && name) ? "Telecaller" : (name ?? "?");
  $: maskTech   = (name) => (currentUser?.role === "master" && $queryPrivacy.tech       && name) ? "Tech"        : (name ?? "?");
  $: maskHelper = (name) => (currentUser?.role === "master" && $queryPrivacy.techHelper && name) ? "Senior Tech" : (name ?? "?");
</script>

<div class="page-wrapper">
  <div class="content">
    <div class="d-flex align-items-center gap-2 mb-4">
      <button class="btn btn-sm btn-outline-secondary" on:click={() => history.back()}>
        <i class="ti ti-arrow-left"></i> Back
      </button>
      <h4 class="fw-bold mb-0">Query User Stats</h4>
    </div>

    {#if loading}
      <div class="text-center py-5"><span class="spinner-border text-primary"></span></div>
    {:else if users.length === 0}
      <div class="text-center py-5 text-muted">
        <i class="ti ti-users fs-1 d-block mb-2"></i>No query users found.
      </div>
    {:else}
      <!-- Telecallers -->
      {@const telecallers   = users.filter(u => u.subRole === "telecaller")}
      {@const techUsers     = users.filter(u => u.subRole === "tech")}
      {@const techHelpers   = users.filter(u => u.subRole === "tech_helper")}

      {#if canViewTelecaller && telecallers.length}
        <div class="section-label">Telecallers</div>
        <div class="row g-3 mb-4">
          {#each telecallers as u}
            <div class="col-6 col-md-3">
              <a href="/admin/query/user/{u.id}" class="user-card user-card--telecaller">
                <div class="uc-avatar">{initials(maskTC(u.name))}</div>
                <div class="uc-name">{maskTC(u.name)}</div>
                <div class="uc-sub">Telecaller</div>
                <span class="uc-status {u.status === 'active' ? 'uc-status--active' : 'uc-status--inactive'}">
                  {u.status ?? "active"}
                </span>
              </a>
            </div>
          {/each}
        </div>
      {:else if !canViewTelecaller && telecallers.length}
        <div class="section-label">Telecallers</div>
        <div class="access-blocked mb-4">
          <i class="ti ti-lock me-2"></i>You don't have permission to view telecaller stats.
        </div>
      {/if}

      {#if canViewTech && techUsers.length}
        <div class="section-label">Tech Support</div>
        <div class="row g-3">
          {#each techUsers as u}
            <div class="col-6 col-md-3">
              <a href="/admin/query/user/{u.id}" class="user-card user-card--tech">
                <div class="uc-avatar uc-avatar--tech">{initials(maskTech(u.name))}</div>
                <div class="uc-name">{maskTech(u.name)}</div>
                <div class="uc-sub">Tech</div>
                <span class="uc-status {u.status === 'active' ? 'uc-status--active' : 'uc-status--inactive'}">
                  {u.status ?? "active"}
                </span>
              </a>
            </div>
          {/each}
        </div>
      {:else if !canViewTech && techUsers.length}
        <div class="section-label">Tech Support</div>
        <div class="access-blocked">
          <i class="ti ti-lock me-2"></i>You don't have permission to view tech stats.
        </div>
      {/if}

      <!-- Senior Techs -->
      {#if canViewTechHelper && techHelpers.length}
        <div class="section-label mt-4">Senior Techs</div>
        <div class="row g-3">
          {#each techHelpers as u}
            <div class="col-6 col-md-3">
              <a href="/admin/query/user/{u.id}" class="user-card user-card--helper">
                <div class="uc-avatar uc-avatar--helper">{initials(maskHelper(u.name))}</div>
                <div class="uc-name">{maskHelper(u.name)}</div>
                <div class="uc-sub">Senior Tech</div>
                <span class="uc-status {u.status === 'active' ? 'uc-status--active' : 'uc-status--inactive'}">
                  {u.status ?? "active"}
                </span>
              </a>
            </div>
          {/each}
        </div>
      {:else if !canViewTechHelper && techHelpers.length}
        <div class="section-label mt-4">Senior Techs</div>
        <div class="access-blocked">
          <i class="ti ti-lock me-2"></i>You don't have permission to view Senior Tech stats.
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .section-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.8px; color: #adb5bd; margin-bottom: 10px;
  }
  .user-card {
    display: flex; flex-direction: column; align-items: center;
    background: #fff; border-radius: 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.07);
    padding: 22px 16px; text-decoration: none;
    border-top: 3px solid #f59f00;
    transition: box-shadow 0.15s, transform 0.12s;
    cursor: pointer;
  }
  .user-card--tech   { border-top-color: #0ca678; }
  .user-card--helper { border-top-color: #7950f2; }
  .user-card:hover   { box-shadow: 0 6px 20px rgba(0,0,0,0.12); transform: translateY(-2px); text-decoration: none; }
  .uc-avatar {
    width: 52px; height: 52px; border-radius: 50%;
    background: #f59f00; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 18px; margin-bottom: 10px;
  }
  .uc-avatar--tech   { background: #0ca678; }
  .uc-avatar--helper { background: #7950f2; }
  .uc-name { font-size: 14px; font-weight: 600; color: #212529; text-align: center; }
  .uc-sub  { font-size: 11.5px; color: #868e96; margin-top: 2px; }
  .uc-status {
    margin-top: 8px; font-size: 10px; font-weight: 600;
    padding: 2px 10px; border-radius: 20px;
  }
  .uc-status--active   { background: #edfaf3; color: #198754; }
  .uc-status--inactive { background: #f4f5f6; color: #6c757d; }
  .access-blocked {
    padding: 14px 18px; background: #fff8f0; border: 1px dashed #fd7e14;
    border-radius: 10px; color: #856404; font-size: 13px;
  }
</style>
