<script>
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { checkAuth } from "$lib/utils/auth";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import {
    groupUnreadStore,
    groupListStore,
    clearGroupUnread,
    loadGroupUnread,
    loadGroupList,
    sortedByActivity,
  } from "$lib/stores/groupChatStore";
  import { showToast } from "$lib/stores/uiToast";

  let currentUser;
  let sidebarLoading = true;
  let sidebarSearch = "";

  $: activeGroupId = $page.params.id ? Number($page.params.id) : null;
  $: canCreate = currentUser?.role === "master" || currentUser?.role === "admin" || currentUser?.role === "manager";

  $: filteredGroups = sortedByActivity(
    $groupListStore.filter((g) =>
      !sidebarSearch || g.name.toLowerCase().includes(sidebarSearch.toLowerCase())
    )
  );

  // ── Create modal ───────────────────────────────────────────────────────────
  let showCreateModal = false;
  let submitting = false;
  let cName = "";
  let cDesc = "";
  let cType = "team";
  let cColor = "#3b5bdb";
  let cSelectedIds = [];
  let cMemberSearch = "";
  let cAllUsers = [];
  let cLoadingUsers = false;

  const AVATAR_COLORS = [
    "#3b5bdb","#e03131","#0ca678","#f59f00",
    "#7950f2","#0dcaf0","#2f9e44","#e64980",
  ];
  const ROLE_LABEL = {
    telecaller:  "Telecaller",
    tech:        "Technician",
    tech_helper: "Senior Tech",
    manager:     "Manager",
    admin:       "Admin",
    master:      "Master",
  };
  const TYPE_ICON = {
    announcement: "ti-speakerphone",
    team:         "ti-users",
    role_channel: "ti-hash",
    direct:       "ti-user",
  };

  $: cFilteredUsers = cAllUsers.filter((u) =>
    !cMemberSearch ||
    u.name.toLowerCase().includes(cMemberSearch.toLowerCase()) ||
    (u.subRole ?? u.role ?? "").toLowerCase().includes(cMemberSearch.toLowerCase())
  );

  function userLabel(u) {
    const sub = u.subRole ?? u.role ?? "user";
    return ROLE_LABEL[sub] ?? sub;
  }

  async function openCreateModal() {
    showCreateModal = true;
    if (cAllUsers.length === 0) {
      cLoadingUsers = true;
      try {
        const res = await authApiFetch(`${API_ROUTES.USER}?limit=200`);
        cAllUsers = (res.data ?? res ?? []).filter((u) => u.id !== currentUser?.id && u.status === "active");
      } catch (_) {} finally {
        cLoadingUsers = false;
      }
    }
  }

  function closeCreateModal() {
    showCreateModal = false;
    cName = ""; cDesc = ""; cType = "team"; cColor = "#3b5bdb";
    cSelectedIds = []; cMemberSearch = "";
  }

  function toggleMember(userId) {
    if (cSelectedIds.includes(userId)) {
      cSelectedIds = cSelectedIds.filter((id) => id !== userId);
    } else {
      cSelectedIds = [...cSelectedIds, userId];
    }
  }

  async function handleCreate() {
    if (!cName.trim()) {
      showToast({ type: "warning", message: "Group name is required" });
      return;
    }
    submitting = true;
    try {
      const group = await authApiFetch(API_ROUTES.GROUP_CHAT, {
        method: "POST",
        data: {
          name: cName.trim(),
          description: cDesc.trim() || undefined,
          type: cType,
          avatarColor: cColor,
          memberIds: cSelectedIds,
        },
      });
      await loadGroupList();
      showToast({ type: "success", message: "Group created!" });
      closeCreateModal();
      goto(`/admin/group-chat/${group.id}`);
    } catch (e) {
      showToast({ type: "error", message: e?.data?.message ?? "Failed to create group" });
    } finally {
      submitting = false;
    }
  }

  // ── Sidebar helpers ────────────────────────────────────────────────────────
  function formatTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const diffDays = Math.floor((new Date() - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7)  return `${diffDays}d ago`;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }
  function avatarLetter(name) { return (name ?? "G")[0].toUpperCase(); }

  // ── Mount / Destroy ────────────────────────────────────────────────────────
  onMount(async () => {
    // Disable page-level scroll so the two-panel fills the viewport cleanly
    document.documentElement.style.overflow = "hidden";

    currentUser = checkAuth();
    if (!currentUser) return;

    sidebarLoading = true;
    // groupListStore & groupUnreadStore are already loaded by admin/+layout.svelte global socket.
    // Just mark loading done after a tick so the sidebar renders.
    await Promise.all([loadGroupList(), loadGroupUnread()]);
    sidebarLoading = false;
  });

  onDestroy(() => {
    // Restore page scroll when leaving group-chat
    document.documentElement.style.overflow = "";
  });
</script>

<div class="gc-two-panel">

    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <div class="gc-sidebar">

      <!-- Header -->
      <div class="gc-sidebar-header">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <div>
            <div class="gc-sidebar-title"><i class="ti ti-messages me-1"></i>Group Chats</div>
            <div class="gc-sidebar-sub">Conversations &amp; announcements</div>
          </div>
          {#if canCreate}
            <button class="gc-new-btn" on:click={openCreateModal}>
              <i class="ti ti-plus"></i> New
            </button>
          {/if}
        </div>

        <!-- Search -->
        <div class="gc-sidebar-search-wrap">
          <i class="ti ti-search gc-sidebar-search-icon"></i>
          <input
            type="text"
            class="gc-sidebar-search-input"
            placeholder="Search groups…"
            bind:value={sidebarSearch}
          />
        </div>
      </div>

      <!-- Group list -->
      <div class="gc-sidebar-list">
        {#if sidebarLoading}
          <div class="d-flex justify-content-center align-items-center" style="height:120px;">
            <div class="spinner-border spinner-border-sm" style="color:#3b5bdb;" role="status"></div>
          </div>

        {:else if filteredGroups.length === 0}
          <div class="text-center py-4 px-3 text-muted">
            <i class="ti ti-messages-off" style="font-size:2rem; display:block; margin-bottom:6px; opacity:0.35;"></i>
            <p class="mb-1 small">
              {#if sidebarSearch}No groups match "<strong>{sidebarSearch}</strong>"{:else}No groups yet{/if}
            </p>
            {#if canCreate && !sidebarSearch}
              <button class="btn btn-sm btn-primary mt-1" on:click={openCreateModal}>
                Create your first group
              </button>
            {/if}
          </div>

        {:else}
          {#each filteredGroups as group}
            {@const unread = $groupUnreadStore[group.id] ?? 0}
            {@const isActive = group.id === activeGroupId}
            <a
              href="/admin/group-chat/{group.id}"
              class="gc-sidebar-item {isActive ? 'gc-sidebar-item--active' : ''}"
            >
              <div class="gc-sidebar-item-avatar" style="background:{group.avatarColor ?? '#3b5bdb'};">
                {avatarLetter(group.name)}
              </div>
              <div class="gc-sidebar-item-content">
                <div class="gc-sidebar-item-row1">
                  <div class="d-flex align-items-center gap-1 min-w-0">
                    <span class="gc-sidebar-item-name">{group.name}</span>
                    <span class="gc-sidebar-type-badge">
                      <i class="ti {TYPE_ICON[group.type] ?? 'ti-users'}"></i>
                    </span>
                  </div>
                  <span class="gc-sidebar-item-time {unread > 0 ? 'gc-sidebar-item-time--unread' : ''}">
                    {formatTime(group.lastMessage?.createdAt ?? group.updatedAt)}
                  </span>
                </div>
                <div class="gc-sidebar-item-row2">
                  <span class="gc-sidebar-item-preview">
                    {#if group.lastMessage}
                      <strong class="gc-sidebar-preview-sender">{group.lastMessage.senderName}:</strong>
                      {group.lastMessage.message ?? "📎 Attachment"}
                    {:else}
                      <em>No messages yet</em>
                    {/if}
                  </span>
                  {#if unread > 0}
                    <span class="gc-sidebar-unread">{unread > 99 ? "99+" : unread}</span>
                  {/if}
                </div>
              </div>
            </a>
          {/each}
        {/if}
      </div>
    </div>

    <!-- ── Main panel ─────────────────────────────────────────────────── -->
    <div class="gc-main">
      <slot />
    </div>

</div>

<!-- ── Create Group Modal ───────────────────────────────────────────────────── -->
{#if showCreateModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="gc-modal-backdrop" on:click|self={closeCreateModal}>
    <div class="gc-modal-card">

      <!-- Modal header -->
      <div class="gc-modal-header">
        <div>
          <div class="gc-modal-title">Create New Group</div>
          <div class="gc-modal-sub">Fill in the details below</div>
        </div>
        <button class="gc-modal-close" on:click={closeCreateModal}>
          <i class="ti ti-x"></i>
        </button>
      </div>

      <div class="gc-modal-body">

        <!-- Name -->
        <div class="mb-3">
          <label class="form-label fw-semibold">Group Name <span class="text-danger">*</span></label>
          <input
            type="text"
            class="form-control"
            placeholder="e.g. Tech Team, Daily Standup…"
            bind:value={cName}
            maxlength="80"
          />
        </div>

        <!-- Description -->
        <div class="mb-3">
          <label class="form-label fw-semibold">Description <span class="text-muted small">(optional)</span></label>
          <textarea
            class="form-control"
            rows="2"
            placeholder="What is this group about?"
            bind:value={cDesc}
            maxlength="300"
          ></textarea>
        </div>

        <!-- Type -->
        <div class="mb-3">
          <label class="form-label fw-semibold">Type</label>
          <div class="d-flex gap-2 flex-wrap">
            {#each (currentUser?.role === "master" || currentUser?.role === "admin" ? ["announcement","team"] : ["team"]) as t}
              <button
                type="button"
                class="btn btn-sm {cType === t ? 'btn-primary' : 'btn-outline-secondary'}"
                on:click={() => (cType = t)}
              >
                {#if t === "announcement"}<i class="ti ti-speakerphone me-1"></i>Announcement
                {:else}<i class="ti ti-users me-1"></i>Team Group{/if}
              </button>
            {/each}
          </div>
          {#if cType === "announcement"}
            <p class="text-muted small mt-1 mb-0">Only you (and group admins) can post. Others can read only.</p>
          {/if}
        </div>

        <!-- Color -->
        <div class="mb-3">
          <label class="form-label fw-semibold">Avatar Color</label>
          <div class="d-flex gap-2 flex-wrap mb-2">
            {#each AVATAR_COLORS as color}
              <button
                type="button"
                class="border-0 rounded"
                style="width:28px;height:28px;background:{color};outline:{cColor === color ? '3px solid #000' : 'none'};outline-offset:2px;cursor:pointer;"
                on:click={() => (cColor = color)}
              ></button>
            {/each}
          </div>
          <div class="d-flex align-items-center gap-2">
            <div
              class="d-flex align-items-center justify-content-center fw-bold text-white rounded"
              style="width:36px;height:36px;font-size:15px;background:{cColor};"
            >{cName ? cName[0].toUpperCase() : "G"}</div>
            <span class="text-muted small">Preview</span>
          </div>
        </div>

        <!-- Members -->
        <div class="mb-3">
          <label class="form-label fw-semibold">Add Members</label>

          {#if cSelectedIds.length > 0}
            <div class="d-flex flex-wrap gap-1 mb-2">
              {#each cAllUsers.filter((u) => cSelectedIds.includes(u.id)) as u}
                <span class="badge bg-primary d-flex align-items-center gap-1" style="font-size:0.78rem; padding:4px 7px;">
                  {u.name}
                  <button
                    type="button"
                    class="btn-close btn-close-white"
                    style="font-size:7px;"
                    on:click={() => toggleMember(u.id)}
                  ></button>
                </span>
              {/each}
            </div>
          {/if}

          <div class="position-relative mb-2">
            <i class="ti ti-search position-absolute" style="left:10px;top:50%;transform:translateY(-50%);color:#adb5bd;font-size:13px;"></i>
            <input
              type="text"
              class="form-control form-control-sm ps-4"
              placeholder="Search users…"
              bind:value={cMemberSearch}
            />
          </div>

          {#if cLoadingUsers}
            <div class="text-center py-2">
              <span class="spinner-border spinner-border-sm text-primary"></span>
            </div>
          {:else}
            <div style="max-height:200px; overflow-y:auto; border:1px solid #dee2e6; border-radius:8px;">
              {#each cFilteredUsers as u}
                <button
                  type="button"
                  class="w-100 d-flex align-items-center gap-2 p-2 border-0 text-start"
                  style="background:{cSelectedIds.includes(u.id) ? '#eef3fb' : '#fff'}; transition:background 0.1s;"
                  on:click={() => toggleMember(u.id)}
                >
                  <div
                    class="d-flex align-items-center justify-content-center flex-shrink-0 rounded-circle fw-bold text-white"
                    style="width:30px;height:30px;font-size:12px;background:{cColor};"
                  >{u.name[0].toUpperCase()}</div>
                  <div class="flex-grow-1">
                    <div class="fw-semibold" style="font-size:0.83rem;">{u.name}</div>
                    <div class="text-muted" style="font-size:0.72rem;">{userLabel(u)}</div>
                  </div>
                  {#if cSelectedIds.includes(u.id)}
                    <i class="ti ti-check text-primary flex-shrink-0"></i>
                  {/if}
                </button>
                <div style="border-top:1px solid #f1f3f5;"></div>
              {/each}
              {#if cFilteredUsers.length === 0}
                <p class="text-muted text-center small py-3 mb-0">No users found</p>
              {/if}
            </div>
          {/if}
          <p class="text-muted small mt-1 mb-0">
            {cSelectedIds.length} member{cSelectedIds.length !== 1 ? 's' : ''} selected (+ you as owner)
          </p>
        </div>

        <!-- Actions -->
        <div class="d-flex gap-2 pt-1">
          <button
            type="button"
            class="btn btn-primary px-4"
            on:click={handleCreate}
            disabled={submitting}
          >
            {#if submitting}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
            Create Group
          </button>
          <button type="button" class="btn btn-outline-secondary" on:click={closeCreateModal}>Cancel</button>
        </div>

      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Two-panel layout ─────────────────────────────────────────────────────── */
  .gc-two-panel {
    position: fixed;
    top: 60px;                          /* below fixed topbar */
    left: var(--sidenav-width, 250px);  /* beside the sidebar */
    right: 0;
    bottom: 0;
    display: flex;
    overflow: hidden;
    border-top: 1px solid #e0e7ff;
    background: #fff;
    transition: left 0.2s ease;
  }

  /* Mini-sidebar collapsed state */
  :global(.mini-sidebar) .gc-two-panel {
    left: var(--crms-sidenav-width-sm, 70px);
  }

  /* Browser full-view (header maximize): fill the monitor like other pages */
  :global(html:fullscreen),
  :global(html:-webkit-full-screen) {
    width: 100vw !important;
    height: 100vh !important;
    max-width: none !important;
    overflow: hidden !important;
    background: #fff;
  }
  :global(html:fullscreen body),
  :global(html:-webkit-full-screen body),
  :global(html:fullscreen .main-wrapper),
  :global(html:-webkit-full-screen .main-wrapper) {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    overflow: hidden !important;
  }
  :global(html:fullscreen .footer),
  :global(html:-webkit-full-screen .footer) {
    display: none !important;
  }
  :global(html:fullscreen) .gc-two-panel,
  :global(html:-webkit-full-screen) .gc-two-panel {
    top: 60px;
    left: var(--sidenav-width, 250px);
    right: 0;
    bottom: 0;
    z-index: 20;
  }
  :global(html:fullscreen body.mini-sidebar) .gc-two-panel,
  :global(html:-webkit-full-screen body.mini-sidebar) .gc-two-panel {
    left: var(--crms-sidenav-width-sm, 70px);
  }

  /* ── Sidebar ──────────────────────────────────────────────────────────────── */
  .gc-sidebar {
    width: 300px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid #e0e7ff;
  }

  .gc-sidebar-header {
    background: linear-gradient(135deg, #3b5bdb 0%, #2546b8 100%);
    padding: 14px 16px 12px;
    flex-shrink: 0;
  }
  .gc-sidebar-title { font-weight: 700; color: #fff; font-size: 0.95rem; }
  .gc-sidebar-sub   { font-size: 0.7rem; color: rgba(255,255,255,0.65); }

  .gc-new-btn {
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.18); color: #fff;
    border: 1.5px solid rgba(255,255,255,0.35); border-radius: 18px;
    padding: 4px 12px; font-size: 0.78rem; font-weight: 600;
    cursor: pointer; transition: background 0.15s; flex-shrink: 0;
  }
  .gc-new-btn:hover { background: rgba(255,255,255,0.28); }

  .gc-sidebar-search-wrap { position: relative; }
  .gc-sidebar-search-icon {
    position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
    color: rgba(255,255,255,0.6); font-size: 13px;
  }
  .gc-sidebar-search-input {
    width: 100%; background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.25); border-radius: 18px;
    padding: 6px 12px 6px 30px; font-size: 0.82rem; color: #fff; outline: none;
    transition: background 0.15s;
  }
  .gc-sidebar-search-input::placeholder { color: rgba(255,255,255,0.55); }
  .gc-sidebar-search-input:focus { background: rgba(255,255,255,0.22); border-color: rgba(255,255,255,0.5); }

  .gc-sidebar-list { flex: 1; overflow-y: auto; background: #fff; }

  /* Sidebar item */
  .gc-sidebar-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; text-decoration: none; color: inherit;
    border-bottom: 1px solid #f3f4f6;
    transition: background 0.15s;
    cursor: pointer;
  }
  .gc-sidebar-item:hover { background: #f7f8ff; }
  .gc-sidebar-item--active { background: #eef2ff; box-shadow: inset -3px 0 0 #3b5bdb; }

  .gc-sidebar-item-avatar {
    width: 42px; height: 42px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700; color: #fff; flex-shrink: 0;
  }

  .gc-sidebar-item-content { flex: 1; min-width: 0; }

  .gc-sidebar-item-row1 {
    display: flex; align-items: center; justify-content: space-between;
    gap: 6px; margin-bottom: 2px;
  }
  .gc-sidebar-item-name {
    font-weight: 600; font-size: 0.85rem; color: #1a1a2e;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .gc-sidebar-type-badge { flex-shrink: 0; font-size: 10px; color: #adb5bd; }
  .gc-sidebar-item-time { font-size: 0.67rem; color: #adb5bd; white-space: nowrap; flex-shrink: 0; }
  .gc-sidebar-item-time--unread { color: #3b5bdb; font-weight: 600; }

  .gc-sidebar-item-row2 {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
  }
  .gc-sidebar-item-preview {
    font-size: 0.74rem; color: #6c757d;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
  }
  .gc-sidebar-preview-sender { color: #495057; }

  .gc-sidebar-unread {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px;
    background: #3b5bdb; color: #fff; font-size: 0.62rem; font-weight: 700; flex-shrink: 0;
  }

  /* ── Main panel ───────────────────────────────────────────────────────────── */
  .gc-main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* ── Modal backdrop ───────────────────────────────────────────────────────── */
  .gc-modal-backdrop {
    position: fixed; inset: 0; z-index: 1050;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .gc-modal-card {
    background: #fff; border-radius: 14px;
    width: 100%; max-width: 540px; max-height: 90vh;
    display: flex; flex-direction: column;
    box-shadow: 0 8px 40px rgba(0,0,0,0.18);
    overflow: hidden;
  }
  .gc-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px 14px;
    background: linear-gradient(135deg, #3b5bdb 0%, #2546b8 100%);
    flex-shrink: 0;
  }
  .gc-modal-title { font-weight: 700; color: #fff; font-size: 1rem; }
  .gc-modal-sub   { font-size: 0.72rem; color: rgba(255,255,255,0.65); }
  .gc-modal-close {
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(255,255,255,0.15); border: none; color: #fff; font-size: 15px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.15s; flex-shrink: 0;
  }
  .gc-modal-close:hover { background: rgba(255,255,255,0.28); }
  .gc-modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
</style>
