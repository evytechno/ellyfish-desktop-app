<script>
  import { createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { showToast } from "$lib/stores/uiToast";

  export let open = false;
  export let queryId = null;
  export let queryIds = [];
  export let querySubject = "";

  const dispatch = createEventDispatcher();

  const DURATIONS = [
    { hours: 1, label: "1 hour" },
    { hours: 6, label: "6 hours" },
    { hours: 24, label: "1 day" },
    { hours: 72, label: "3 days" },
    { hours: 168, label: "7 days" },
  ];

  let users = [];
  let assignments = [];
  let selectedIds = new Set();
  let durationHours = 24;
  let userSearch = "";
  let loading = false;
  let saving = false;
  let loadedFor = null;

  $: targetIds = (queryIds?.length ? queryIds : queryId != null ? [queryId] : []).filter(Boolean);
  $: isBulk = targetIds.length > 1;
  $: loadKey = targetIds.join(",");

  $: if (open && loadKey && loadedFor !== loadKey) {
    loadedFor = loadKey;
    selectedIds = new Set();
    durationHours = 24;
    userSearch = "";
    load();
  }
  $: if (!open) loadedFor = null;

  $: filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.subRole ?? "").toLowerCase().includes(q) ||
      (u.role ?? "").toLowerCase().includes(q) ||
      roleLabel(u).toLowerCase().includes(q)
    );
  });

  function roleLabel(u, subRole) {
    const role = typeof u === "string" ? null : u?.role;
    const sub = typeof u === "string" ? u : (u?.subRole ?? subRole);
    if (sub === "tech") return "Tech";
    if (sub === "telecaller") return "Telecaller";
    if (sub === "tech_helper") return "Senior Tech";
    if (role === "admin") return "Admin";
    if (role === "manager") return "Manager";
    if (role === "master") return "Master";
    return sub ? String(sub) : "User";
  }

  function asUserList(raw) {
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : [];
    return list
      .filter((u) => u && u.id != null && u.status !== "banned")
      .map((u) => ({
        id: u.id,
        name: u.name || u.email || `User #${u.id}`,
        role: u.role,
        subRole: u.subRole,
      }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  async function loadUsersList() {
    const paths = [
      `${API_ROUTES.USER}/all`,
      `${API_ROUTES.QUERY}/training-users`,
      `${API_ROUTES.QUERY}/training/users`,
    ];
    for (const path of paths) {
      try {
        const list = asUserList(await authApiFetch(path));
        if (list.length) return list;
      } catch (_) {}
    }
    return [];
  }

  async function load() {
    loading = true;
    try {
      if (isBulk || targetIds.length !== 1) {
        users = await loadUsersList();
        assignments = [];
      } else {
        const [u, a] = await Promise.all([
          loadUsersList(),
          authApiFetch(`${API_ROUTES.QUERY}/${targetIds[0]}/training`).catch(() => []),
        ]);
        users = Array.isArray(u) ? u : [];
        assignments = Array.isArray(a) ? a : [];
      }
    } catch (e) {
      errorHandle(e);
    } finally {
      loading = false;
    }
  }

  function toggleUser(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleAllVisible() {
    const ids = filteredUsers.map((u) => u.id);
    const allOn = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allOn) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    selectedIds = next;
  }

  function remaining(expiresAt) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "Expired";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
    if (h > 0) return `${h}h ${m}m left`;
    return `${Math.max(1, m)}m left`;
  }

  async function assign() {
    if (!selectedIds.size) {
      showToast({ type: "warning", message: "Select at least one user." });
      return;
    }
    saving = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/training/bulk`, {
        method: "POST",
        data: JSON.stringify({
          queryIds: targetIds,
          userIds: [...selectedIds],
          durationHours: Number(durationHours),
        }),
      });
      showToast({
        type: "success",
        message: isBulk
          ? `Training assigned on ${targetIds.length} queries.`
          : "Training access assigned.",
      });
      selectedIds = new Set();
      if (isBulk) {
        dispatch("assigned");
        close();
      } else {
        await load();
        dispatch("assigned");
      }
    } catch (e) {
      errorHandle(e);
    } finally {
      saving = false;
    }
  }

  async function revoke(id) {
    try {
      await authApiFetch(`${API_ROUTES.QUERY}/training/${id}`, { method: "DELETE" });
      assignments = assignments.filter((a) => a.id !== id);
      showToast({ type: "success", message: "Training access removed." });
    } catch (e) {
      errorHandle(e);
    }
  }

  function close() {
    open = false;
    dispatch("close");
  }
</script>

{#if open}
  <div class="qt-overlay" on:click={close} role="presentation">
    <div class="qt-modal" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="qt-head">
        <div>
          <h6 class="mb-0">Assign for training</h6>
          <div class="text-muted small text-truncate" style="max-width:360px;">
            {#if isBulk}{targetIds.length} queries{:else}{querySubject || `Query #${queryId}`}{/if}
          </div>
        </div>
        <button type="button" class="btn-close" on:click={close} aria-label="Close"></button>
      </div>

      {#if loading}
        <div class="text-center py-4">
          <span class="spinner-border spinner-border-sm text-primary"></span>
        </div>
      {:else}
        <div class="qt-body">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-1">
            <label class="form-label small mb-0">Assign to users</label>
            {#if filteredUsers.length}
              <button type="button" class="btn btn-link btn-sm p-0" on:click={toggleAllVisible}>
                {filteredUsers.every((u) => selectedIds.has(u.id)) ? "Clear" : "Select all"}
              </button>
            {/if}
          </div>
          <p class="text-muted small mb-2">Tick one or more people, set the time, then Assign.</p>
          <input
            class="form-control form-control-sm mb-2"
            placeholder="Search name or role…"
            bind:value={userSearch}
          />
          <div class="qt-user-list">
            {#if filteredUsers.length === 0}
              <div class="text-muted small py-2">
                {users.length ? "No match for that search." : "No users found. Restart the backend and try again."}
              </div>
            {:else}
              {#each filteredUsers as u}
                <label class="qt-user">
                  <input
                    type="checkbox"
                    class="form-check-input"
                    checked={selectedIds.has(u.id)}
                    on:change={() => toggleUser(u.id)}
                  />
                  <span class="qt-user-name">{u.name}</span>
                  <span class="badge bg-light text-dark border">{roleLabel(u)}</span>
                </label>
              {/each}
            {/if}
          </div>

          <label class="form-label small mb-1 mt-3">Access time</label>
          <select class="form-select form-select-sm" bind:value={durationHours}>
            {#each DURATIONS as d}
              <option value={d.hours}>{d.label}</option>
            {/each}
          </select>

          <button
            class="btn btn-primary btn-sm w-100 mt-3"
            on:click={assign}
            disabled={saving || !selectedIds.size}
          >
            {#if saving}
              <span class="spinner-border spinner-border-sm me-1"></span>
            {:else}
              <i class="ti ti-school me-1"></i>
            {/if}
            Assign ({selectedIds.size})
          </button>

          {#if !isBulk && assignments.length}
            <div class="qt-current-title">Current assignments</div>
            {#each assignments as a}
              <div class="qt-assign" class:qt-assign--expired={a.expired}>
                <div>
                  <div class="fw-medium">{a.userName}</div>
                  <div class="text-muted small">
                    {roleLabel({ subRole: a.userSubRole })} · {a.expired ? "Expired" : remaining(a.expiresAt)}
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-danger"
                  title="Remove access"
                  on:click={() => revoke(a.id)}
                >
                  <i class="ti ti-x"></i>
                </button>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .qt-overlay {
    position: fixed;
    inset: 0;
    z-index: 1080;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .qt-modal {
    background: #fff;
    border-radius: 10px;
    width: min(440px, 100%);
    max-height: min(86vh, 720px);
    overflow: auto;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.2);
  }
  .qt-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid #eee;
  }
  .qt-body {
    padding: 14px 16px 18px;
  }
  .qt-user-list {
    max-height: 220px;
    overflow: auto;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 4px;
  }
  .qt-user {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    margin: 0;
    cursor: pointer;
    border-radius: 6px;
  }
  .qt-user:hover {
    background: #f8f9fa;
  }
  .qt-user-name {
    flex: 1;
    font-size: 13px;
  }
  .qt-current-title {
    font-size: 12px;
    font-weight: 600;
    margin: 16px 0 8px;
  }
  .qt-assign {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 0;
    border-top: 1px solid #f1f3f5;
    font-size: 13px;
  }
  .qt-assign--expired {
    opacity: 0.55;
  }
</style>
