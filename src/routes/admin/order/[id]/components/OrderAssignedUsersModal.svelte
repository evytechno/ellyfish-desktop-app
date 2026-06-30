<script>
  import { maskAssignedName as _maskAssignedName } from "$lib/utils/maskUser";

  export let order;
  export let currentUser;
  export let users = [];
  export let addAssignedUser;

  let selectedUsers = [];
  let userSearch = "";
  let loading = false;

  $: if (order) {
    selectedUsers = (order.assignedUsers ?? [])
      .filter((u) => u?.role === "user")
      .map((u) => u?.id);
  }

  function maskName(u) { return _maskAssignedName(u, currentUser); }

  async function handleSubmit(e) {
    e.preventDefault();
    loading = true;
    try {
      await addAssignedUser(selectedUsers);
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
        <button type="button" class="btn-close custom-btn-close border p-1 me-0 text-dark" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <form on:submit={handleSubmit} class="needs-validation" novalidate>
        <div class="modal-body">
          <div class="mb-3">
            <input type="text" class="form-control" placeholder="Search users..."
              bind:value={userSearch} />
          </div>
          <div class="access-wrap" style="max-height: 300px; overflow-y: auto; overflow-x: hidden;">
            {#if users.length}
              {@const filteredUsers = users
                .filter((u) => u.status !== "banned" && u.status !== "inactive")
                .filter((u) => {
                  if (['master','admin','manager'].includes(currentUser?.role)) return true;
                  if (currentUser?.subRole === 'telecaller') return u.subRole === 'telecaller';
                  if (currentUser?.subRole === 'tech' || currentUser?.subRole === 'tech_helper') return u.subRole === 'tech' || u.subRole === 'tech_helper';
                  return false;
                })
                .filter((u) => u.name?.toLowerCase().includes(userSearch.toLowerCase()))}
              {#if filteredUsers.length}
                <div class="row g-2">
                  {#each filteredUsers as user}
                    <div class="col-6">
                      <label class="checkboxs d-flex align-items-center p-2 rounded border h-100"
                        class:bg-light={selectedUsers.includes(user.id)}
                        class:border-primary={selectedUsers.includes(user.id)}
                        class:opacity-50={user.status === "inactive"}
                        style="cursor:{user.status === 'inactive' ? 'not-allowed' : 'pointer'}; transition: background 0.15s;">
                        <input type="checkbox" class="form-check-input me-2 mt-0 flex-shrink-0"
                          bind:group={selectedUsers} value={user.id} disabled={user.status === "inactive"} />
                        <span class="avatar avatar-xs rounded-circle me-2 flex-shrink-0">
                          <img src="/assets/img/profiles/user.png" alt="img" class="rounded-circle" style="width:28px;height:28px;object-fit:cover;" />
                        </span>
                        <div class="overflow-hidden">
                          <p class="fw-medium mb-0 text-truncate" style="font-size:0.85rem;">{maskName(user)}</p>
                        </div>
                      </label>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-muted text-center py-3 mb-0">No users match "{userSearch}"</p>
              {/if}
            {:else}
              <p class="text-muted text-center py-3 mb-0">No users available</p>
            {/if}
          </div>
          <div class="modal-btn text-end mt-3">
            <button type="button" class="btn btn-light me-2" data-bs-dismiss="modal">Cancel</button>
            <button class="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Confirming..." : "Confirm"}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</div>
