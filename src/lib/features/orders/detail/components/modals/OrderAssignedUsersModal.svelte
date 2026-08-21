<script>
  import { maskAssignedName as _maskAssignedName } from "$lib/utils/maskUser";

  export let order;
  export let currentUser;
  export let users = [];
  export let addAssignedUser;

  let selectedUsers = [];
  let userSearch = "";
  let loading = false;
  let syncedKey = "";

  $: lockedIds = new Set(
    (order?.assignedUsers ?? [])
      .filter((u) => u?.role === "user")
      .map((u) => Number(u.id)),
  );
  $: activeId =
    order?.activeUserId != null ? Number(order.activeUserId) : null;

  // Re-sync locked selection when assigned users on the order change
  $: {
    const key = `${order?.id ?? ""}:${[...lockedIds].sort((a, b) => a - b).join(",")}`;
    if (order && key !== syncedKey) {
      syncedKey = key;
      selectedUsers = [...lockedIds];
    }
  }

  function maskName(u) {
    return _maskAssignedName(u, currentUser);
  }

  function isLocked(userId) {
    return lockedIds.has(Number(userId));
  }

  function isActive(userId) {
    return activeId != null && Number(userId) === activeId;
  }

  function sortAssignable(a, b) {
    const aActive = isActive(a.id) ? 0 : 1;
    const bActive = isActive(b.id) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aLocked = isLocked(a.id) ? 0 : 1;
    const bLocked = isLocked(b.id) ? 0 : 1;
    if (aLocked !== bLocked) return aLocked - bLocked;
    return String(a.name || "").localeCompare(String(b.name || ""));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    loading = true;
    try {
      const ids = [
        ...new Set([
          ...lockedIds,
          ...(selectedUsers || []).map(Number).filter(Boolean),
        ]),
      ];
      await addAssignedUser(ids);
    } finally {
      loading = false;
    }
  }
</script>

<div class="modal fade" id="add_contact" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Manage Assigned Users</h5>
        <button
          type="button"
          class="btn-close custom-btn-close border p-1 me-0 text-dark"
          data-bs-dismiss="modal"
          aria-label="Close"
        ></button>
      </div>
      <form on:submit={handleSubmit} class="needs-validation" novalidate>
        <div class="modal-body">
          <div class="mb-2">
            <input
              type="text"
              class="form-control"
              placeholder="Search users to add..."
              bind:value={userSearch}
            />
          </div>
          <p class="text-muted mb-3" style="font-size:12px;">
            Already assigned are locked. Remove or <strong>Set Active</strong> from the sidebar.
          </p>
          <div
            class="access-wrap"
            style="max-height: 300px; overflow-y: auto; overflow-x: hidden;"
          >
            {#if users.length}
              {@const filteredUsers = users
                .filter((u) => u.status !== "banned" && u.status !== "inactive")
                .filter((u) => {
                  if (["master", "admin", "manager"].includes(currentUser?.role))
                    return true;
                  if (currentUser?.subRole === "telecaller")
                    return u.subRole === "telecaller";
                  if (
                    currentUser?.subRole === "tech" ||
                    currentUser?.subRole === "tech_helper"
                  )
                    return (
                      u.subRole === "tech" || u.subRole === "tech_helper"
                    );
                  return false;
                })
                .filter((u) =>
                  u.name?.toLowerCase().includes(userSearch.toLowerCase()),
                )
                .slice()
                .sort(sortAssignable)}
              {#if filteredUsers.length}
                <div class="row g-2">
                  {#each filteredUsers as user}
                    {@const locked = isLocked(user.id)}
                    {@const active = isActive(user.id)}
                    <div class="col-6">
                      <label
                        class="checkboxs d-flex align-items-center p-2 rounded border h-100"
                        class:bg-light={locked || selectedUsers.includes(user.id)}
                        class:border-primary={locked ||
                          selectedUsers.includes(user.id)}
                        class:opacity-50={user.status === "inactive"}
                        style="cursor:{locked || user.status === 'inactive'
                          ? 'not-allowed'
                          : 'pointer'}; transition: background 0.15s;"
                      >
                        {#if locked}
                          <input
                            type="checkbox"
                            class="form-check-input me-2 mt-0 flex-shrink-0"
                            checked
                            disabled
                          />
                        {:else}
                          <input
                            type="checkbox"
                            class="form-check-input me-2 mt-0 flex-shrink-0"
                            bind:group={selectedUsers}
                            value={user.id}
                            disabled={user.status === "inactive"}
                          />
                        {/if}
                        <span
                          class="avatar avatar-xs rounded-circle me-2 flex-shrink-0"
                        >
                          <img
                            src="/assets/img/profiles/user.png"
                            alt="img"
                            class="rounded-circle"
                            style="width:28px;height:28px;object-fit:cover;"
                          />
                        </span>
                        <div class="overflow-hidden flex-grow-1">
                          <p
                            class="fw-medium mb-0 text-truncate"
                            style="font-size:12px;"
                          >
                            {maskName(user)}
                          </p>
                          {#if active}
                            <span
                              class="badge bg-success-transparent text-success"
                              style="font-size:10px;">Active</span
                            >
                          {:else if locked}
                            <span
                              class="badge bg-warning-transparent text-warning"
                              style="font-size:10px;">Assigned</span
                            >
                          {/if}
                        </div>
                      </label>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-muted text-center py-3 mb-0">
                  No users match "{userSearch}"
                </p>
              {/if}
            {:else}
              <p class="text-muted text-center py-3 mb-0">No users available</p>
            {/if}
          </div>
          <div class="modal-btn text-end mt-3">
            <button
              type="button"
              class="btn btn-light me-2"
              data-bs-dismiss="modal">Cancel</button
            >
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Confirming..." : "Confirm"}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</div>
