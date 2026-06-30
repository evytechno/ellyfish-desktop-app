<script>
  export let order;
  export let users = [];
  export let orderVisits = [];
  export let showVisitModal = false;
  export let showVisitListModal = false;
  export let openVisitModal;
  export let submitVisitModal;

  let visitType = "outgoing";
  let visitDate = null;
  let visitStartTime = null;
  let visitEndTime = null;
  let visitTransport = "";
  let visitCompanyId = "";
  let visitCompanies = [];
  let visitPurpose = "";
  let visitOutcome = "";
  let visitClientContacts = [];
  let visitSelectedContactIds = [];
  let visitAttendees = [];
  let visitNextFollowUp = null;
  let visitFeedback = "";
  let visitNotes = "";
  let visitTerms = "";
  let visitError = "";
  let visitFormErrors = {};
  let visitLoading = false;

  $: if (order?.client?.contacts) {
    visitClientContacts = order.client.contacts ?? [];
  }
  $: if (order) {
    visitCompanies = order.client ? [{ id: order.client.id, name: order.client.name }] : [];
    if (order.client) visitCompanyId = String(order.client.id);
  }

  function toggleVisitContact(id) {
    visitSelectedContactIds = visitSelectedContactIds.includes(id)
      ? visitSelectedContactIds.filter((x) => x !== id)
      : [...visitSelectedContactIds, id];
  }

  function addVisitAttendee() {
    visitAttendees = [...visitAttendees, { userId: "", isLead: false }];
  }

  function removeVisitAttendee(i) {
    visitAttendees = visitAttendees.filter((_, idx) => idx !== i);
  }

  async function handleSubmitVisit() {
    visitFormErrors = {};
    if (!visitDate) { visitFormErrors.visitDate = "Visit date is required."; return; }
    if (!visitCompanyId) { visitFormErrors.companyId = "Company is required."; return; }
    if (!visitPurpose) { visitFormErrors.purpose = "Purpose is required."; return; }
    visitLoading = true;
    try {
      await submitVisitModal({
        visitType, visitDate, visitStartTime, visitEndTime, visitTransport,
        visitCompanyId, visitPurpose, visitOutcome, visitSelectedContactIds,
        visitAttendees, visitNextFollowUp, visitFeedback, visitNotes, visitTerms,
      });
      showVisitModal = false;
      visitDate = null; visitPurpose = ""; visitOutcome = ""; visitSelectedContactIds = []; visitAttendees = [];
    } catch (e) {
      visitError = e?.message ?? "Failed to save visit.";
    } finally {
      visitLoading = false;
    }
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
                      <span class="badge {v.visitType === 'incoming' ? 'bg-primary' : 'bg-warning text-dark'}">{v.visitType}</span>
                    </td>
                    <td class="small">{v.visitDate ? new Date(v.visitDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td class="small">{v.purpose || '—'}</td>
                    <td class="small">{v.outcome || '—'}</td>
                    <td class="small">{v.attendees?.length ?? 0}</td>
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
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={() => (showVisitListModal = false)}>Close</button>
          <button type="button" class="btn btn-success" on:click={() => { showVisitListModal = false; openVisitModal(); }}>
            <i class="ti ti-plus me-1"></i>Add Visit
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Create Visit Modal -->
{#if showVisitModal}
  <div class="modal fade show d-block" tabindex="-1" role="dialog" style="background:rgba(0,0,0,0.5);overflow-y:auto;"
    on:click|self={() => (showVisitModal = false)}>
    <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="ti ti-map-pin me-2 text-success"></i>Create Visit for This Order</h5>
          <button type="button" class="btn-close" on:click={() => (showVisitModal = false)}></button>
        </div>
        <div class="modal-body">
          {#if visitError}
            <div class="alert alert-danger py-2 mb-3">{visitError}</div>
          {/if}
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-semibold">Visit Type <span class="text-danger">*</span></label>
              <select class="form-select" bind:value={visitType}>
                <option value="outgoing">Outgoing</option>
                <option value="incoming">Incoming</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Visit Date <span class="text-danger">*</span></label>
              <input type="date" class="form-control" class:is-invalid={visitFormErrors.visitDate} bind:value={visitDate} />
              {#if visitFormErrors.visitDate}<div class="invalid-feedback">{visitFormErrors.visitDate}</div>{/if}
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Start Date &amp; Time</label>
              <input type="datetime-local" class="form-control" bind:value={visitStartTime} />
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">End Date &amp; Time</label>
              <input type="datetime-local" class="form-control" bind:value={visitEndTime} />
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Transport Medium</label>
              <input type="text" class="form-control" bind:value={visitTransport} placeholder="e.g. Car, Train, Bike..." />
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Company <span class="text-danger">*</span></label>
              <select class="form-select" class:is-invalid={visitFormErrors.companyId} bind:value={visitCompanyId}>
                <option value="">Select company...</option>
                {#each visitCompanies as c}
                  <option value={String(c.id)}>{c.name}</option>
                {/each}
              </select>
              {#if visitFormErrors.companyId}<div class="invalid-feedback">{visitFormErrors.companyId}</div>{/if}
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Purpose <span class="text-danger">*</span></label>
              <textarea class="form-control" class:is-invalid={visitFormErrors.purpose} rows="2" bind:value={visitPurpose} placeholder="Reason for the visit..."></textarea>
              {#if visitFormErrors.purpose}<div class="invalid-feedback">{visitFormErrors.purpose}</div>{/if}
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Outcome</label>
              <textarea class="form-control" rows="2" bind:value={visitOutcome} placeholder="Result of the visit..."></textarea>
            </div>
            {#if visitClientContacts.length > 0}
              <div class="col-12">
                <label class="form-label fw-semibold">Client Contacts Met</label>
                <div class="d-flex flex-wrap gap-2">
                  {#each visitClientContacts as cc}
                    <button type="button"
                      class="btn btn-sm {visitSelectedContactIds.includes(cc.id) ? 'btn-primary' : 'btn-outline-secondary'}"
                      on:click={() => toggleVisitContact(cc.id)}>
                      <i class="ti ti-user me-1"></i>{cc.name}{cc.designation ? ` (${cc.designation})` : ""}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
            <div class="col-12">
              <label class="form-label fw-semibold">Team Attendees</label>
              {#each visitAttendees as att, i}
                <div class="d-flex gap-2 mb-2 align-items-center">
                  <select class="form-select form-select-sm" bind:value={att.userId}>
                    <option value="">Select user...</option>
                    {#each users as u}
                      <option value={u.id}>{u.name}</option>
                    {/each}
                  </select>
                  <div class="form-check form-check-inline mb-0 text-nowrap">
                    <input class="form-check-input" type="checkbox" id="lead_{i}" bind:checked={att.isLead} />
                    <label class="form-check-label small" for="lead_{i}">Lead</label>
                  </div>
                  <button type="button" class="btn btn-sm btn-outline-danger" on:click={() => removeVisitAttendee(i)}>
                    <i class="ti ti-x"></i>
                  </button>
                </div>
              {/each}
              <button type="button" class="btn btn-sm btn-outline-secondary mt-1" on:click={addVisitAttendee}>
                <i class="ti ti-plus me-1"></i>Add Attendee
              </button>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Next Follow-up Date</label>
              <input type="date" class="form-control" bind:value={visitNextFollowUp} />
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Client Feedback</label>
              <input type="text" class="form-control" bind:value={visitFeedback} placeholder="Client's feedback..." />
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Internal Notes</label>
              <textarea class="form-control" rows="2" bind:value={visitNotes} placeholder="Internal notes..."></textarea>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Terms Discussed</label>
              <textarea class="form-control" rows="2" bind:value={visitTerms} placeholder="Terms discussed during visit..."></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={() => (showVisitModal = false)}>Cancel</button>
          <button type="button" class="btn btn-success" on:click={handleSubmitVisit} disabled={visitLoading}>
            {#if visitLoading}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
            Save Visit
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
