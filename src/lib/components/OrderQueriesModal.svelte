<script>
  import { createEventDispatcher } from "svelte";
  import { loadOrderQueries } from "$lib/features/orders/detail/api/orderDetailApi";
  import QueryQuickView from "$lib/components/QueryQuickView.svelte";
  import RaiseQueryModal from "$lib/components/RaiseQueryModal.svelte";
  import { maskAssignedName } from "$lib/utils/maskUser";
  import { canMutateOrder } from "$lib/utils/orderLiveAccess";

  export let open = false;
  export let order = null;
  export let currentUser = null;
  export let startWithRaise = false;

  const dispatch = createEventDispatcher();

  let queries = [];
  let loading = false;
  let loadedFor = null;
  let raiseOpen = false;
  let qvOpen = false;
  let qvId = null;

  $: canRaise =
    canMutateOrder(currentUser, order) &&
    (["master", "admin", "manager"].includes(currentUser?.role) ||
      currentUser?.subRole === "telecaller" ||
      currentUser?.subRole === "tech" ||
      (currentUser?.role === "user" && !currentUser?.subRole));

  $: isFrozenOld = order?._oldAssigneeView === true;

  $: orderLabel = order?.pId
    ? `#${order.pId}${order?.title ? ` — ${order.title}` : ""}`
    : order?.title || "Order";

  $: if (open && order?.id && loadedFor !== order.id) {
    loadedFor = order.id;
    raiseOpen = !!(startWithRaise && canRaise);
    load();
  }

  $: if (!open) {
    loadedFor = null;
    qvOpen = false;
    qvId = null;
    raiseOpen = false;
  }

  const STATUS_CLASS = {
    open: "bg-primary",
    in_progress: "bg-warning text-dark",
    resolved: "bg-success",
    reopened: "bg-danger",
    closed: "bg-secondary",
  };

  function close() {
    open = false;
    dispatch("close");
  }

  function onBackdrop(e) {
    if (e.target === e.currentTarget) close();
  }

  async function load() {
    if (!order?.id) return;
    loading = true;
    try {
      const res = await loadOrderQueries(order.id);
      queries = Array.isArray(res) ? res : (res?.data ?? []);
    } catch (_) {
      queries = [];
    } finally {
      loading = false;
    }
  }

  function canEditQuery(q) {
    if (!canMutateOrder(currentUser, order)) return false;
    if (!q || !currentUser) return false;
    if (currentUser.subRole === "telecaller" && q.raisedBy?.id === currentUser.id) return true;
    if (!currentUser.subRole && ["master", "admin", "manager"].includes(currentUser.role)) return true;
    return false;
  }

  function openQuickView(id) {
    qvId = id;
    qvOpen = true;
  }

  function formatWhen(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  function personName(p) {
    return maskAssignedName(p, currentUser) || p?.name || "—";
  }
</script>

<svelte:window on:keydown={(e) => open && e.key === "Escape" && !qvOpen && !raiseOpen && close()} />

{#if open && order}
  <div
    class="oqm-backdrop"
    on:click={onBackdrop}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="presentation"
  >
    <div class="oqm-card card shadow-lg" role="dialog" aria-modal="true" aria-labelledby="oqm-title">
      <div class="oqm-head">
        <div class="min-w-0">
          <div class="oqm-eyebrow"><i class="ti ti-help-circle me-1"></i>Queries</div>
          <h5 id="oqm-title" class="oqm-title text-truncate" title={orderLabel}>{orderLabel}</h5>
        </div>
        <div class="d-flex align-items-center gap-2 flex-shrink-0">
          {#if canRaise}
            <button class="btn btn-sm btn-warning" on:click={() => (raiseOpen = true)}>
              <i class="ti ti-plus me-1"></i>Add Query
            </button>
          {:else if isFrozenOld}
            <span class="badge bg-soft-warning text-warning border border-warning" style="font-size:11px;">
              Frozen · cannot raise
            </span>
          {/if}
          <button type="button" class="btn-close" on:click={close} aria-label="Close"></button>
        </div>
      </div>

      <div class="oqm-body">
        {#if loading}
          <div class="text-center py-4">
            <span class="spinner-border spinner-border-sm text-primary"></span>
          </div>
        {:else if queries.length === 0}
          <div class="text-center py-4 text-muted small">
            <i class="ti ti-help-off d-block mb-1" style="font-size:22px;"></i>
            No queries for this order yet.
            {#if canRaise}
              <div class="mt-2">
                <button class="btn btn-sm btn-outline-warning" on:click={() => (raiseOpen = true)}>
                  <i class="ti ti-plus me-1"></i>Add Query
                </button>
              </div>
            {/if}
          </div>
        {:else}
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0 oqm-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  {#if currentUser?.subRole !== "telecaller" && currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper"}
                    <th>Raised By</th>
                    <th>Assigned To</th>
                  {:else if currentUser?.subRole === "telecaller"}
                    <th>Assigned To</th>
                  {/if}
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {#each queries as q}
                  <tr>
                    <td>
                      {#if q.ticketCode}
                        <div class="oqm-ticket">{q.ticketCode}</div>
                      {/if}
                      <button type="button" class="oqm-subject" on:click={() => openQuickView(q.id)}>
                        {q.subject}
                      </button>
                    </td>
                    {#if currentUser?.subRole !== "telecaller" && currentUser?.subRole !== "tech" && currentUser?.subRole !== "tech_helper"}
                      <td>{personName(q.raisedBy)}</td>
                      <td>
                        {#if q.assignedTo}
                          {personName(q.assignedTo)}
                        {:else}
                          <span class="text-muted">Unassigned</span>
                        {/if}
                      </td>
                    {:else if currentUser?.subRole === "telecaller"}
                      <td>
                        {#if q.assignedTo}
                          {personName(q.assignedTo)}
                        {:else}
                          <span class="text-muted">Unassigned</span>
                        {/if}
                      </td>
                    {/if}
                    <td>
                      <span class="badge {STATUS_CLASS[q.status] ?? 'bg-secondary'}">
                        {q.status?.replace("_", " ")}
                      </span>
                    </td>
                    <td class="text-muted text-nowrap">{formatWhen(q.createdAt)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<RaiseQueryModal
  bind:open={raiseOpen}
  linkedOrder={order}
  lockOrder={true}
  on:created={load}
/>

<QueryQuickView
  bind:open={qvOpen}
  queryId={qvId}
  {currentUser}
  hideOrderLink={true}
  canEdit={canEditQuery}
  on:close={() => {
    qvId = null;
  }}
/>

<style>
  .oqm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 1045;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .oqm-card {
    width: min(720px, 100%);
    max-height: min(82vh, 720px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin: 0;
  }
  .oqm-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid #eef1f4;
  }
  .oqm-eyebrow {
    font-size: 11px;
    font-weight: 600;
    color: #868e96;
    letter-spacing: 0.02em;
  }
  .oqm-title {
    font-size: 14px;
    font-weight: 600;
    color: #212529;
    margin: 2px 0 0;
  }
  .oqm-body {
    overflow: auto;
    min-height: 120px;
  }
  .oqm-table {
    font-size: 12px;
  }
  .oqm-table :global(thead th) {
    font-size: 11px;
    font-weight: 500;
    color: #868e96;
    background: #f8f9fa;
    border-bottom: 1px solid #eef1f4 !important;
    padding: 8px 12px;
    white-space: nowrap;
  }
  .oqm-table :global(tbody td) {
    padding: 8px 12px;
    border-bottom: 1px solid #f1f3f5 !important;
    vertical-align: middle;
  }
  .oqm-ticket {
    font-size: 10.5px;
    font-weight: 600;
    color: #868e96;
    letter-spacing: 0.2px;
    margin-bottom: 2px;
  }
  .oqm-subject {
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: #364fc7;
    font-size: 12px;
    font-weight: 500;
  }
  .oqm-subject:hover {
    text-decoration: underline;
  }
</style>
