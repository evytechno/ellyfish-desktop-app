<script>
  export let order;
  export let currentUser;
  export let orderQueries = [];
  export let orderQueriesLoading = false;
  export let maskAssignedName;
  export let openQueryModal;
  export let openEditQueryModal;
</script>

<div class="tab-pane active show" id="tab_10">
  <div class="card">
    <div class="card-header d-flex align-items-center justify-content-between py-2">
      <h5 class="fw-semibold mb-0">
        <i class="ti ti-help-circle me-1 text-primary"></i>
        {#if currentUser?.subRole === "tech"}My Assigned Queries{:else}Related Queries{/if}
      </h5>
      {#if currentUser?.subRole === "telecaller" || (currentUser?.role === "user" && !currentUser?.subRole)}
        <button class="btn btn-sm btn-outline-warning" on:click={openQueryModal}>
          <i class="ti ti-plus me-1"></i>Raise Query
        </button>
      {/if}
    </div>
    <div class="card-body p-0">
      {#if orderQueriesLoading}
        <div class="text-center py-4">
          <span class="spinner-border spinner-border-sm text-primary"></span>
        </div>
      {:else}
        {@const visibleQueries = currentUser?.subRole === "tech"
          ? orderQueries.filter((q) => q.assignedTo?.id === currentUser?.id)
          : orderQueries}
        {#if visibleQueries.length === 0}
          <div class="text-center py-4 text-muted small">
            {#if currentUser?.subRole === "tech"}
              <i class="ti ti-help-off me-1"></i>No queries assigned to you for this order.
            {:else if currentUser?.subRole === "telecaller"}
              <i class="ti ti-help-off me-1"></i>You haven't raised any queries for this order yet.
            {:else}
              <i class="ti ti-help-off me-1"></i>No queries raised for this order yet.
            {/if}
          </div>
        {:else}
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0 small">
              <thead class="table-light">
                <tr>
                  <th>Subject</th>
                  {#if currentUser?.subRole === "tech"}
                    <th>Raised By</th>
                  {:else if currentUser?.subRole === "telecaller"}
                    <th>Assigned To</th>
                  {:else}
                    <th>Raised By</th>
                    <th>Assigned To</th>
                  {/if}
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {#each visibleQueries as q}
                  <tr>
                    <td class="fw-semibold">{q.subject}</td>
                    {#if currentUser?.subRole === "tech"}
                      <td>{maskAssignedName(q.raisedBy) ?? "-"}</td>
                    {:else if currentUser?.subRole === "telecaller"}
                      <td>
                        {#if q.assignedTo}
                          <span class="badge bg-success-subtle text-success-emphasis">{maskAssignedName(q.assignedTo)}</span>
                        {:else}
                          <span class="text-muted">Unassigned</span>
                        {/if}
                      </td>
                    {:else}
                      <td>
                        {#if q.raisedBy}
                          {#if q.raisedBy.name === "Telecaller"}
                            <span class="text-muted small"><i class="ti ti-lock me-1"></i>Hidden</span>
                          {:else}
                            <div class="d-flex align-items-center gap-1">
                              <span>{q.raisedBy.name}</span>
                              <span class="badge bg-warning-subtle text-warning-emphasis" style="font-size:10px;">Telecaller</span>
                            </div>
                          {/if}
                        {:else}-{/if}
                      </td>
                      <td>
                        {#if q.assignedTo}
                          {#if q.assignedTo.name === "Tech"}
                            <span class="text-muted small"><i class="ti ti-lock me-1"></i>Hidden</span>
                          {:else}
                            <div class="d-flex align-items-center gap-1">
                              <span>{q.assignedTo.name}</span>
                              <span class="badge bg-success-subtle text-success-emphasis" style="font-size:10px;">Tech</span>
                            </div>
                          {/if}
                        {:else}<span class="text-muted">Unassigned</span>{/if}
                      </td>
                    {/if}
                    <td>
                      <span class="badge {q.status === 'open' ? 'bg-primary' : q.status === 'in_progress' ? 'bg-warning text-dark' : q.status === 'resolved' ? 'bg-success' : q.status === 'reopened' ? 'bg-danger' : 'bg-secondary'}">
                        {q.status?.replace("_", " ")}
                      </span>
                    </td>
                    <td class="text-muted">
                      {new Date(q.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td class="d-flex gap-1 align-items-center">
                      <a href="/admin/query/{q.id}" class="btn btn-sm btn-outline-primary"><i class="ti ti-eye"></i></a>
                      {#if (currentUser?.subRole === 'telecaller' && q.raisedBy?.id === currentUser?.id) || (!currentUser?.subRole && ['master','admin','manager'].includes(currentUser?.role))}
                        <button class="btn btn-sm btn-outline-secondary" on:click={() => openEditQueryModal(q)} title="Edit Query">
                          <i class="ti ti-pencil"></i>
                        </button>
                      {/if}
                    </td>
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
