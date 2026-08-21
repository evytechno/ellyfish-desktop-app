<script>
  import QueryQuickView from "$lib/components/QueryQuickView.svelte";

  export let order;
  export let currentUser;
  export let orderQueries = [];
  export let orderQueriesLoading = false;
  export let maskAssignedName;
  export let openQueryModal;
  export let openEditQueryModal;
  export let canMutateOrder = true;

  let qvOpen = false;
  let qvId = null;

  function openQuickView(id) {
    qvId = id;
    qvOpen = true;
  }

  function canEditQuery(q) {
    if (!canMutateOrder) return false;
    if (!q || !currentUser) return false;
    if (
      currentUser.subRole === "telecaller" &&
      q.raisedBy?.id === currentUser.id
    ) {
      return true;
    }
    if (
      !currentUser.subRole &&
      ["master", "admin", "manager"].includes(currentUser.role)
    ) {
      return true;
    }
    return false;
  }
</script>

<div class="tab-pane active show oq-queries" id="tab_10">
  <div class="oq-queries-head">
    <h5 class="oq-queries-title mb-0">
      <i class="ti ti-help-circle me-1 text-primary"></i>
      {#if currentUser?.subRole === "tech"}My Queries{:else}Related Queries{/if}
    </h5>
    {#if canMutateOrder && (currentUser?.subRole === "telecaller" || currentUser?.subRole === "tech" || (currentUser?.role === "user" && !currentUser?.subRole))}
      <button class="btn btn-sm btn-outline-warning" on:click={openQueryModal}>
        <i class="ti ti-plus me-1"></i>Raise Query
      </button>
    {/if}
  </div>

  {#if orderQueriesLoading}
    <div class="oq-queries-empty text-center py-4">
      <span class="spinner-border spinner-border-sm text-primary"></span>
    </div>
  {:else}
    {@const visibleQueries =
      currentUser?.subRole === "tech"
        ? orderQueries.filter(
            (q) =>
              q.isRaisedByMe ||
              q.assignedToId === currentUser?.id ||
              q.assignedTo?.id === currentUser?.id,
          )
        : orderQueries}
    {#if visibleQueries.length === 0}
      <div class="oq-queries-empty text-center py-4 text-muted small">
        {#if currentUser?.subRole === "tech"}
          <i class="ti ti-help-off me-1"></i>No queries assigned to you or raised by you for this order.
        {:else if currentUser?.subRole === "telecaller"}
          <i class="ti ti-help-off me-1"></i>You haven't raised any queries for this order yet.
        {:else}
          <i class="ti ti-help-off me-1"></i>No queries raised for this order yet.
        {/if}
      </div>
    {:else}
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 oq-queries-table">
          <thead>
            <tr>
              <th>Subject</th>
              {#if currentUser?.subRole === "telecaller"}
                <th>Assigned To</th>
              {:else if currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper"}
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
                <td>
                  {#if q.ticketCode}
                    <div class="oq-queries-ticket">{q.ticketCode}</div>
                  {/if}
                  <button
                    type="button"
                    class="oq-qv-subject text-primary"
                    on:click={() => openQuickView(q.id)}
                  >
                    {q.subject}
                  </button>
                </td>
                {#if currentUser?.subRole === "telecaller"}
                  <td>
                    {#if q.assignedTo}
                      <span class="badge bg-success-subtle text-success-emphasis"
                        >{maskAssignedName(q.assignedTo)}</span
                      >
                    {:else}
                      <span class="text-muted">Unassigned</span>
                    {/if}
                  </td>
                {:else if currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper"}
                  <td>
                    {#if q.raisedBy}
                      {#if q.raisedBy.name === "Telecaller"}
                        <span class="text-muted small"
                          ><i class="ti ti-lock me-1"></i>Hidden</span
                        >
                      {:else}
                        <div class="d-flex align-items-center gap-1">
                          <span>{q.raisedBy.name}</span>
                          <span class="badge bg-warning-subtle text-warning-emphasis oq-queries-chip"
                            >Telecaller</span
                          >
                        </div>
                      {/if}
                    {:else}-{/if}
                  </td>
                  <td>
                    {#if q.assignedTo}
                      {#if q.assignedTo.name === "Tech"}
                        <span class="text-muted small"
                          ><i class="ti ti-lock me-1"></i>Hidden</span
                        >
                      {:else}
                        <div class="d-flex align-items-center gap-1">
                          <span>{q.assignedTo.name}</span>
                          <span class="badge bg-success-subtle text-success-emphasis oq-queries-chip"
                            >Tech</span
                          >
                        </div>
                      {/if}
                    {:else}<span class="text-muted">Unassigned</span>{/if}
                  </td>
                {/if}
                <td>
                  <span
                    class="badge {q.status === 'open'
                      ? 'bg-primary'
                      : q.status === 'in_progress'
                        ? 'bg-warning text-dark'
                        : q.status === 'resolved'
                          ? 'bg-success'
                          : q.status === 'reopened'
                            ? 'bg-danger'
                            : 'bg-secondary'}"
                  >
                    {q.status?.replace("_", " ")}
                  </span>
                </td>
                <td class="text-muted text-nowrap">
                  {new Date(q.createdAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td class="oq-queries-actions">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-primary"
                    title="Quick view"
                    on:click={() => openQuickView(q.id)}
                  >
                    <i class="ti ti-eye"></i>
                  </button>
                  {#if canEditQuery(q)}
                    <button
                      class="btn btn-sm btn-outline-secondary"
                      on:click={() => openEditQueryModal(q)}
                      title="Edit Query"
                    >
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

<QueryQuickView
  bind:open={qvOpen}
  queryId={qvId}
  {currentUser}
  hideOrderLink={true}
  canEdit={canEditQuery}
  on:edit={(e) => openEditQueryModal(e.detail)}
  on:close={() => {
    qvId = null;
  }}
/>

<style>
  .oq-queries {
    border: none;
    background: transparent;
  }
  .oq-queries-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px 12px 8px;
  }
  .oq-queries-title {
    font-size: 12px;
    font-weight: 500;
    color: #343a40;
  }
  .oq-queries-empty {
    padding-left: 12px;
    padding-right: 12px;
  }
  .oq-queries-table {
    border: none !important;
    font-size: 12px;
  }
  .oq-queries-table :global(thead th) {
    font-size: 11px;
    font-weight: 400;
    color: #868e96;
    background: transparent;
    border-top: none !important;
    border-bottom: 1px solid #eef1f4 !important;
    padding: 8px 12px;
    white-space: nowrap;
  }
  .oq-queries-table :global(tbody td) {
    border-top: none !important;
    border-bottom: 1px solid #f1f3f5 !important;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 400;
    vertical-align: middle;
  }
  .oq-queries-table :global(tbody tr:last-child td) {
    border-bottom: none !important;
  }
  .oq-queries-ticket {
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.3px;
    color: #868e96;
    margin-bottom: 2px;
  }
  .oq-queries-chip {
    font-size: 10px;
  }
  .oq-queries-actions {
    display: flex;
    gap: 4px;
    align-items: center;
    white-space: nowrap;
  }
  .oq-qv-subject {
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
    font-size: inherit;
    font-weight: 400;
    max-width: 100%;
  }
  .oq-qv-subject:hover {
    text-decoration: underline;
  }
</style>
