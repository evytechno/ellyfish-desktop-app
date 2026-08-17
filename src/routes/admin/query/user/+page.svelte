<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import { queryPrivacy } from "$lib/stores/queryPrivacy";
  import QueryUserDetail from "$lib/components/QueryUserDetail.svelte";
  import { maskQueryPersonName } from "$lib/utils/maskUser";

  let currentUser;
  let loading = true;
  let search = "";
  let roleFilter = "all";
  let sortBy = "attention";
  let selectedUserId = null;
  let didInitSelection = false;

  let telecallers = [];
  let techs = [];
  let techHelpers = [];
  let periodDays = 30;

  const TAG_LABELS = {
    high_reopen_rate: "High reopen",
    stuck_queries: "Stuck",
    inactive: "No activity",
    low_resolution: "Low resolve",
    high_backlog: "Backlog",
    no_activity: "No activity",
  };

  $: canViewTelecaller = currentUser?.role === "master" || (currentUser?.queryAccessTelecaller ?? true);
  $: canViewTech = currentUser?.role === "master" || (currentUser?.queryAccessTech ?? true);
  $: canViewTechHelper = currentUser?.role === "master" || (currentUser?.queryAccessTechHelper ?? true);

  onMount(async () => {
    currentUser = checkAuth();
    if (!currentUser) { goto("/login"); return; }
    if (currentUser.role === "user") { goto("/admin/dashboard"); return; }
    try {
      const data = await authApiFetch(`${API_ROUTES.QUERY}/user-summaries`);
      periodDays = data?.periodDays ?? 30;
      telecallers = data?.telecallers ?? [];
      techs = data?.techs ?? [];
      techHelpers = data?.techHelpers ?? [];
    } catch (_) {
      try {
        const all = await authApiFetch(`${API_ROUTES.USER}/all`);
        const list = (all ?? []).filter(u =>
          u.subRole === "telecaller" || u.subRole === "tech" || u.subRole === "tech_helper"
        );
        telecallers = list.filter(u => u.subRole === "telecaller").map(emptySummary("telecaller"));
        techs = list.filter(u => u.subRole === "tech").map(emptySummary("tech"));
        techHelpers = list.filter(u => u.subRole === "tech_helper").map(emptySummary("tech_helper"));
      } catch (_) {}
    } finally {
      loading = false;
    }
  });

  function emptySummary(role) {
    return (u) => ({
      userId: u.id, name: u.name, status: u.status ?? "active", role,
      total: null, open: null, inProgress: null, reopened: null, stuck: null, resolved: null,
      reopenRate: null, resolutionRate: null, tags: [], needsAttention: false,
    });
  }

  function initials(name) {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  }

  function displayName(u) {
    return maskQueryPersonName(
      { id: u.userId ?? u.id, name: u.name, subRole: u.subRole ?? u.role },
      currentUser,
      $queryPrivacy,
    );
  }

  function roleLabel(role) {
    if (role === "telecaller") return "Telecaller";
    if (role === "tech") return "Tech";
    return "Senior Tech";
  }

  function matchesSearch(u) {
    if (!search.trim()) return true;
    return displayName(u).toLowerCase().includes(search.trim().toLowerCase());
  }

  function sortUsers(list) {
    const arr = [...list];
    if (sortBy === "name") {
      arr.sort((a, b) => displayName(a).localeCompare(displayName(b)));
    } else if (sortBy === "total") {
      arr.sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || displayName(a).localeCompare(displayName(b)));
    } else if (sortBy === "stuck") {
      arr.sort((a, b) => (b.stuck ?? 0) - (a.stuck ?? 0) || displayName(a).localeCompare(displayName(b)));
    } else {
      arr.sort((a, b) => {
        const att = Number(b.needsAttention) - Number(a.needsAttention);
        if (att) return att;
        const stuck = (b.stuck ?? 0) - (a.stuck ?? 0);
        if (stuck) return stuck;
        return (b.total ?? 0) - (a.total ?? 0);
      });
    }
    return arr;
  }

  $: visibleTc = canViewTelecaller ? sortUsers(telecallers.filter(matchesSearch)) : [];
  $: visibleTech = canViewTech ? sortUsers(techs.filter(matchesSearch)) : [];
  $: visibleHelper = canViewTechHelper ? sortUsers(techHelpers.filter(matchesSearch)) : [];

  $: permitted = [
    ...(canViewTelecaller ? telecallers : []),
    ...(canViewTech ? techs : []),
    ...(canViewTechHelper ? techHelpers : []),
  ];

  $: attentionCount = permitted.filter(u => u.needsAttention).length;

  $: flatVisible = (() => {
    if (roleFilter === "attention") {
      return sortUsers([
        ...visibleTc.filter(u => u.needsAttention),
        ...visibleTech.filter(u => u.needsAttention),
        ...visibleHelper.filter(u => u.needsAttention),
      ]);
    }
    const out = [];
    if (roleFilter === "all" || roleFilter === "telecaller") out.push(...visibleTc);
    if (roleFilter === "all" || roleFilter === "tech") out.push(...visibleTech);
    if (roleFilter === "all" || roleFilter === "tech_helper") out.push(...visibleHelper);
    return out;
  })();

  $: sections = (() => {
    if (roleFilter === "attention") {
      return flatVisible.length
        ? [{ key: "attention", title: "Needs attention", icon: "ti-alert-triangle", list: flatVisible, accent: "warn" }]
        : [];
    }
    const out = [];
    if ((roleFilter === "all" || roleFilter === "telecaller") && visibleTc.length) {
      out.push({ key: "tc", title: "Telecallers", icon: "ti-headset", list: visibleTc, accent: "tc" });
    }
    if ((roleFilter === "all" || roleFilter === "tech") && visibleTech.length) {
      out.push({ key: "tech", title: "Tech Support", icon: "ti-tools", list: visibleTech, accent: "tech" });
    }
    if ((roleFilter === "all" || roleFilter === "tech_helper") && visibleHelper.length) {
      out.push({ key: "helper", title: "Senior Techs", icon: "ti-user-star", list: visibleHelper, accent: "helper" });
    }
    return out;
  })();

  // Sync selection from URL ?id= and default to first user
  $: urlId = Number($page.url.searchParams.get("id") || 0) || null;

  $: if (!loading && !didInitSelection && flatVisible.length) {
    didInitSelection = true;
    const fromUrl = urlId && flatVisible.some(u => u.userId === urlId) ? urlId
      : (urlId && permitted.some(u => u.userId === urlId) ? urlId : null);
    const first = fromUrl ?? flatVisible[0]?.userId ?? permitted[0]?.userId ?? null;
    if (first) selectUser(first, true);
  }

  $: if (urlId && urlId !== selectedUserId && permitted.some(u => u.userId === urlId)) {
    selectedUserId = urlId;
  }

  function selectUser(id, replace = false) {
    id = Number(id);
    if (!id) return;
    selectedUserId = id;
    const qs = new URLSearchParams($page.url.searchParams);
    qs.set("id", String(id));
    goto(`/admin/query/user?${qs}`, { replaceState: replace || true, keepFocus: true, noScroll: true });
  }
</script>

<div class="page-wrapper qu-page">
  <div class="content qu-shell">
    <div class="qu-toolbar">
      <div class="d-flex align-items-center gap-2 min-w-0">
        <button class="btn btn-sm btn-outline-secondary qu-back" on:click={() => history.back()}>
          <i class="ti ti-arrow-left"></i>
        </button>
        <div class="min-w-0">
          <h4 class="mb-0">Query Users</h4>
          <p class="qu-sub mb-0">Last {periodDays} days · select a user to view stats</p>
        </div>
      </div>
      {#if attentionCount > 0}
        <span class="qu-attn-badge"><i class="ti ti-alert-triangle"></i> {attentionCount} need attention</span>
      {/if}
    </div>

    {#if loading}
      <div class="qu-split">
        <aside class="qu-list-pane">
          <div class="qu-list-tools">
            <div class="qu-skel" style="height:28px;flex:1;"></div>
            <div class="qu-skel" style="height:28px;width:90px;"></div>
          </div>
          <div class="qu-scroll p-2">
            {#each Array(8) as _}
              <div class="qu-skel mb-2" style="height:52px;border-radius:6px;"></div>
            {/each}
          </div>
        </aside>
        <section class="qu-detail-pane">
          <div class="qu-skel mb-3" style="height:88px;border-radius:8px;"></div>
          <div class="row g-2 mb-3">
            {#each Array(6) as _}
              <div class="col-4 col-md-2"><div class="qu-skel" style="height:64px;border-radius:8px;"></div></div>
            {/each}
          </div>
          <div class="qu-skel" style="height:180px;border-radius:8px;"></div>
        </section>
      </div>
    {:else if !permitted.length}
      <div class="qu-empty">
        <i class="ti ti-users"></i>
        <span>No query users found</span>
      </div>
    {:else}
      <div class="qu-split">
        <!-- Left: 30% list -->
        <aside class="qu-list-pane">
          <div class="qu-list-tools">
            <div class="input-icon input-icon-start position-relative qu-search">
              <span class="input-icon-addon"><i class="ti ti-search"></i></span>
              <input type="text" class="form-control" placeholder="Search…" bind:value={search} />
            </div>
            <select class="form-select form-select-sm qu-sort" bind:value={sortBy}>
              <option value="attention">Attention</option>
              <option value="total">Most queries</option>
              <option value="stuck">Most stuck</option>
              <option value="name">Name</option>
            </select>
          </div>

          <div class="qu-pills">
            <button type="button" class="qu-pill {roleFilter === 'all' ? 'is-on' : ''}" on:click={() => roleFilter = "all"}>All</button>
            {#if canViewTelecaller}
              <button type="button" class="qu-pill {roleFilter === 'telecaller' ? 'is-on' : ''}" on:click={() => roleFilter = "telecaller"}>TC</button>
            {/if}
            {#if canViewTech}
              <button type="button" class="qu-pill {roleFilter === 'tech' ? 'is-on' : ''}" on:click={() => roleFilter = "tech"}>Tech</button>
            {/if}
            {#if canViewTechHelper}
              <button type="button" class="qu-pill {roleFilter === 'tech_helper' ? 'is-on' : ''}" on:click={() => roleFilter = "tech_helper"}>Senior</button>
            {/if}
            <button type="button" class="qu-pill qu-pill--warn {roleFilter === 'attention' ? 'is-on' : ''}" on:click={() => roleFilter = "attention"}>
              Alert{#if attentionCount}<span class="qu-pill-n">{attentionCount}</span>{/if}
            </button>
          </div>

          <div class="qu-scroll">
            {#if sections.length === 0}
              <div class="qu-empty qu-empty--sm">
                <span>{roleFilter === "attention" ? "No alerts" : "No matches"}</span>
              </div>
            {:else}
              {#each sections as sec}
                <div class="qu-section">
                  <div class="qu-section-head">
                    <span class="qu-section-title"><i class="ti {sec.icon}"></i> {sec.title}</span>
                    <span class="qu-count">{sec.list.length}</span>
                  </div>
                  {#each sec.list as u}
                    <button
                      type="button"
                      class="qu-row qu-row--{sec.accent} {selectedUserId === u.userId ? 'is-active' : ''} {u.needsAttention ? 'qu-row--alert' : ''}"
                      on:click={() => selectUser(u.userId)}
                    >
                      <div class="qu-avatar qu-avatar--{u.role === 'telecaller' ? 'tc' : u.role === 'tech' ? 'tech' : 'helper'}">
                        {initials(displayName(u))}
                      </div>
                      <div class="qu-info">
                        <div class="qu-name">{displayName(u)}</div>
                        <div class="qu-meta">
                          <span>{roleLabel(u.role)}</span>
                          {#if u.total != null}
                            <span>·</span>
                            <span>{u.total}q</span>
                          {/if}
                          {#if (u.stuck ?? 0) > 0}
                            <span class="qu-stuck">{u.stuck} stuck</span>
                          {/if}
                        </div>
                        {#if u.tags?.some(t => t !== "inactive" && t !== "no_activity")}
                          <div class="qu-flags">
                            {#each u.tags.filter(t => t !== "inactive" && t !== "no_activity") as tag}
                              <span class="qu-flag">{TAG_LABELS[tag] ?? tag}</span>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </button>
                  {/each}
                </div>
              {/each}
            {/if}
          </div>
        </aside>

        <!-- Right: 70% detail -->
        <section class="qu-detail-pane">
          {#if selectedUserId}
            <QueryUserDetail userId={selectedUserId} embedded={true} />
          {:else}
            <div class="qu-empty">
              <i class="ti ti-user-search"></i>
              <span>Select a user to view details</span>
            </div>
          {/if}
        </section>
      </div>
    {/if}
  </div>
</div>

<style>
  .qu-page,
  .qu-page :global(.content) {
    font-size: 12px !important;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .qu-page :global(h4) {
    font-size: 15px !important;
    font-weight: 600 !important;
    letter-spacing: -0.01em;
    color: #212529;
  }
  .qu-page :global(.form-control),
  .qu-page :global(.form-select),
  .qu-page :global(.btn-sm) {
    font-size: 11.5px !important;
    line-height: 1.35 !important;
  }
  .qu-page :global(.form-control) {
    height: 28px !important;
    min-height: 28px !important;
    padding: 2px 8px 2px 30px !important;
  }
  .qu-page :global(.form-select) {
    height: 28px !important;
    min-height: 28px !important;
    padding: 2px 28px 2px 8px !important;
  }

  .qu-shell {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 70px);
    min-height: 480px;
    overflow: hidden;
  }

  .qu-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    flex-shrink: 0;
    margin-bottom: 10px;
  }
  .qu-back {
    width: 28px;
    height: 28px;
    padding: 0 !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .qu-sub {
    font-size: 11px;
    color: #868e96;
    margin-top: 2px;
    font-weight: 400;
  }
  .qu-attn-badge {
    font-size: 11px;
    color: #e67700;
    background: #fff9db;
    border: 1px solid #ffe8a1;
    border-radius: 6px;
    padding: 4px 10px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .qu-split {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 30% 70%;
    gap: 12px;
  }

  .qu-list-pane {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    overflow: hidden;
  }
  .qu-list-tools {
    display: flex;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid #f1f3f5;
    flex-shrink: 0;
  }
  .qu-search { flex: 1; min-width: 0; }
  .qu-search :global(.input-icon-addon) {
    font-size: 12px;
    color: #adb5bd;
  }
  .qu-sort { width: 110px; flex-shrink: 0; }

  .qu-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid #f1f3f5;
    flex-shrink: 0;
  }
  .qu-pill {
    height: 24px;
    padding: 0 8px;
    border-radius: 5px;
    border: 1px solid #dee2e6;
    background: #fff;
    color: #495057;
    font-size: 10.5px;
    font-weight: 400;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
  .qu-pill:hover { background: #f8f9fa; }
  .qu-pill.is-on {
    background: #212529;
    border-color: #212529;
    color: #fff;
  }
  .qu-pill--warn.is-on {
    background: #e67700;
    border-color: #e67700;
  }
  .qu-pill-n {
    min-width: 14px;
    height: 14px;
    padding: 0 4px;
    border-radius: 99px;
    background: #fa5252;
    color: #fff;
    font-size: 9px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .qu-scroll {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 6px;
  }

  .qu-section { margin-bottom: 10px; }
  .qu-section-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 4px 6px;
  }
  .qu-section-title {
    font-size: 10px;
    font-weight: 600;
    color: #868e96;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .qu-count {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 99px;
    background: #f1f3f5;
    color: #868e96;
    font-size: 9.5px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .qu-row {
    width: 100%;
    max-width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px;
    margin-bottom: 4px;
    background: #fff;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    border-left: 3px solid #f59f00;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
    box-sizing: border-box;
  }
  .qu-row--tech { border-left-color: #0ca678; }
  .qu-row--helper { border-left-color: #7950f2; }
  .qu-row--warn { border-left-color: #e67700; }
  .qu-row:hover { background: #f8f9fa; }
  .qu-row.is-active {
    background: #eef3fb;
    border-color: #a5b4fc;
  }
  .qu-row--alert { background: #fff9db; }
  .qu-row--alert.is-active { background: #fff3bf; }

  .qu-avatar {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: #fff4e6;
    color: #e67700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .qu-avatar--tech { background: #e6fcf5; color: #087f5b; }
  .qu-avatar--helper { background: #f3f0ff; color: #5f3dc4; }

  .qu-info { min-width: 0; flex: 1; }
  .qu-name {
    font-size: 12px;
    font-weight: 400;
    color: #212529;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .qu-meta {
    font-size: 10px;
    color: #868e96;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 1px;
  }
  .qu-stuck { color: #e67700; font-weight: 500; }
  .qu-flags {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 4px;
  }
  .qu-flag {
    font-size: 9px;
    font-weight: 500;
    padding: 0 5px;
    border-radius: 3px;
    background: #fff5f5;
    color: #c92a2a;
  }

  .qu-detail-pane {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 10px 12px;
  }

  .qu-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 48px 16px;
    color: #adb5bd;
    font-size: 12px;
    height: 100%;
  }
  .qu-empty--sm { padding: 24px 12px; height: auto; }
  .qu-empty i { font-size: 22px; opacity: 0.7; }

  .qu-skel {
    background: linear-gradient(90deg, #f1f3f5 25%, #e9ecef 50%, #f1f3f5 75%);
    background-size: 200% 100%;
    animation: qu-shimmer 1.2s ease-in-out infinite;
    border-radius: 6px;
  }
  @keyframes qu-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @media (max-width: 992px) {
    .qu-shell { height: auto; overflow: visible; }
    .qu-split {
      grid-template-columns: 1fr;
      height: auto;
    }
    .qu-list-pane { max-height: 360px; }
    .qu-detail-pane { min-height: 60vh; }
  }
</style>
