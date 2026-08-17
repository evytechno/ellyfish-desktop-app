<script>
  import { goto } from "$app/navigation";

  export let order;
  export let orderVisits = [];
  export let showVisitListModal = false;
  // kept for backward compat but unused now
  export let showVisitModal = false;
  export let openVisitModal = null;
  export let submitVisitModal = null;
  export let visitCompanies = [];
  export let visitCompanyId = "";
  export let users = [];

  function navigateToAdd() {
    showVisitListModal = false;
    const params = new URLSearchParams();
    if (order?.id) params.set("orderId", String(order.id));
    if (order?.clientId) params.set("clientId", String(order.clientId));
    goto(`/admin/client-visit/add?${params.toString()}`);
  }
</script>

<!-- Visit List Modal -->
{#if showVisitListModal}
  <div class="modal fade show d-block" tabindex="-1" role="dialog" style="background:rgba(0,0,0,0.5);"
    on:click|self={() => (showVisitListModal = false)}>
    <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-map-pin me-2 text-success"></i>Visits for This Order
            <span class="badge bg-success ms-1">{orderVisits.length}</span>
          </h5>
          <button type="button" class="btn-close" on:click={() => (showVisitListModal = false)}></button>
        </div>
        <div class="modal-body p-0">
          {#if orderVisits.length === 0}
            <div class="text-center py-5 text-muted">
              <i class="ti ti-map-pin" style="font-size:40px;display:block;margin-bottom:8px;opacity:.3;"></i>
              No visits recorded for this order yet.
            </div>
          {:else}
            <div class="table-responsive">
              <table class="table table-hover mb-0">
                <thead class="table-light">
                  <tr>
                    <th class="px-3 text-center">#</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Purpose</th>
                    <th>Outcome</th>
                    <th>Attendees</th>
                    <th class="text-end px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each orderVisits as v, i}
                    <tr>
                      <td class="px-3 fw-semibold text-center">{i + 1}</td>
                      <td>
                        <span class="badge {v.visitType === 'incoming' ? 'bg-primary' : v.visitType === 'outgoing' ? 'bg-warning text-dark' : v.visitType === 'joint' ? 'bg-info' : v.visitType === 'job_discussion' ? 'bg-success' : v.visitType === 'job_received' ? 'bg-secondary' : 'bg-danger'}">
                          {v.visitType === 'incoming' ? 'They Came To Us' : v.visitType === 'outgoing' ? 'We Visited Client' : v.visitType === 'joint' ? 'Joint Site Visit' : v.visitType === 'job_discussion' ? 'Client Gave Job Details' : v.visitType === 'job_received' ? 'Job Received' : 'Sample Sent'}
                        </span>
                      </td>
                      <td class="small">{v.visitDate ? new Date(v.visitDate).toLocaleDateString("en-IN") : "—"}</td>
                      <td class="small">{v.purpose || "—"}</td>
                      <td class="small">{v.outcome || "—"}</td>
                      <td class="small">
                        {#if v.attendees?.length}
                          {v.attendees.map((a) => a.user?.name || a.guestName).filter(Boolean).join(", ") || "—"}
                        {:else}
                          —
                        {/if}
                      </td>
                      <td class="text-end px-3">
                        <div class="d-inline-flex gap-2">
                          <a href="/admin/client-visit/{v.id}" class="btn btn-sm btn-outline-primary" title="View"><i class="ti ti-eye"></i></a>
                          <a href="/admin/client-visit/edit/{v.id}" class="btn btn-sm btn-outline-warning" title="Edit"><i class="ti ti-edit"></i></a>
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={() => (showVisitListModal = false)}>Close</button>
          <button type="button" class="btn btn-success" on:click={navigateToAdd}>
            <i class="ti ti-plus me-1"></i>Log Interaction
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
