<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { checkAuth } from "$lib/utils/auth";
  import Loader from "$lib/components/Loader.svelte";

  const BASE_URL = import.meta.env.VITE_PUBLIC_API_URL?.replace("/api", "") ?? "";
  let visitId = $page.params.id;

  let currentUser = null;
  let loadingData = true;
  let loading = false;
  let errorMessage = "";

  let companies = [];
  let users = [];
  let clientContacts = [];
  let clientId = null;
  let clientInfo = null; // full client object for display card

  // add contact inline
  let showAddContact = false;
  let newContact = { name: "", designation: "", mobile: "" };
  let addingContact = false;
  let addContactError = "";

  // visit fields
  let visitType = "outgoing";
  let companyId = "";
  let visitDate = "";
  let startTime = "";
  let endTime = "";
  let transportMedium = "";
  let purpose = "";
  let outcome = "";
  let nextFollowUpDate = "";
  let clientFeedback = "";
  let notes = "";
  let terms = "";
  let selectedContactIds = [];

  // attendees
  let existingAttendees = [];
  let newAttUserId = "";
  let newAttIsLead = false;
  let addingAttendee = false;

  // jobs
  let jobs = [];
  let uploadingJobIndex = null;

  // expenses
  let expenses = [];
  let loadingExpenses = false;
  let expenseForm = { title: "", companyId: "", items: [{ description: "", amount: 0 }], remarks: "" };
  let addingExpense = false;

  function toDatetimeLocal(val) {
    if (!val) return "";
    const d = new Date(val);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  onMount(async () => {
    currentUser = checkAuth();
    try {
      const [visit, userData, compData] = await Promise.all([
        authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${visitId}`),
        authApiFetch(`${API_ROUTES.USER}/all`),
        authApiFetch(`${API_ROUTES.COMPANY}/all`),
      ]);

      visitType = visit.visitType ?? "outgoing";
      companyId = visit.company?.id ? String(visit.company.id) : "";
      visitDate = visit.visitDate?.slice(0, 10) ?? "";
      startTime = toDatetimeLocal(visit.startTime);
      endTime = toDatetimeLocal(visit.endTime);
      transportMedium = visit.transportMedium ?? "";
      purpose = visit.purpose ?? "";
      outcome = visit.outcome ?? "";
      nextFollowUpDate = visit.nextFollowUpDate?.slice(0, 10) ?? "";
      clientFeedback = visit.clientFeedback ?? "";
      notes = visit.notes ?? "";
      terms = visit.terms ?? "";
      jobs = (visit.jobs ?? []).map((j) => ({ description: "", material: "", quantity: "", size: "", requirement: "", cost: 0, images: [], ...j, _saved: true }));
      existingAttendees = visit.attendees ?? [];
      clientId = visit.client?.id ?? null;
      clientInfo = visit.client ?? null;
      selectedContactIds = (visit.clientContacts ?? []).map((c) => c.id);
      users = userData || [];
      companies = compData || [];
      if (visit.company?.id) expenseForm = { ...expenseForm, companyId: visit.company.id };

      if (clientId) {
        try {
          const cc = await authApiFetch(`${API_ROUTES.CLIENT_CONTACT}/by-client/${clientId}`);
          clientContacts = cc?.data ?? cc ?? [];
        } catch (_) {}
      }
    } catch (_) {
      errorMessage = "Failed to load visit.";
    } finally {
      loadingData = false;
    }
    await loadExpenses();
  });

  async function loadExpenses() {
    loadingExpenses = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.USER_PAYMENT}/by-visit/${visitId}`);
      expenses = Array.isArray(res) ? res : [];
    } catch (_) { expenses = []; }
    finally { loadingExpenses = false; }
  }

  // ── Job CRUD (each job has its own ID now) ──
  let addingJob = false;

  async function addJob() {
    addingJob = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${visitId}/jobs`, { method: "POST", data: { description: "", images: [] } });
      jobs = [...jobs, { ...res.data, images: res.data.images ?? [] }];
    } catch (_) { Swal.fire("Error", "Failed to add job.", "error"); }
    finally { addingJob = false; }
  }

  async function removeJob(jobId) {
    const r = await Swal.fire({ title: "Remove job?", text: "All images for this job will also be removed.", icon: "warning", showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Remove" });
    if (!r.isConfirmed) return;
    try {
      await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/jobs/${jobId}`, { method: "DELETE" });
      jobs = jobs.filter((j) => j.id !== jobId);
    } catch (_) { Swal.fire("Error", "Failed to remove job.", "error"); }
  }

  $: totalCost = jobs.reduce((s, j) => s + (parseFloat(j.cost) || 0), 0);

  async function uploadImage(jobId, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    uploadingJobIndex = jobId;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/jobs/${jobId}/image`, { method: "POST", data: fd });
      jobs = jobs.map((j) => j.id === jobId ? { ...j, images: res.data?.images ?? j.images } : j);
      fileInput.value = "";
    } catch (_) {
      Swal.fire("Error", "Image upload failed.", "error");
    } finally {
      uploadingJobIndex = null;
    }
  }

  async function removeImage(jobId, imgIndex) {
    const result = await Swal.fire({ title: "Remove image?", icon: "warning", showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Remove" });
    if (!result.isConfirmed) return;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/jobs/${jobId}/image/${imgIndex}`, { method: "DELETE" });
      jobs = jobs.map((j) => j.id === jobId ? { ...j, images: res.data?.images ?? j.images } : j);
    } catch (_) {
      Swal.fire("Error", "Could not remove image.", "error");
    }
  }

  async function handleSubmit(e) {
    if (e?.preventDefault) e.preventDefault();
    errorMessage = "";
    loading = true;
    try {
      // save visit fields
      const payload = {
        visitType, visitDate,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        transportMedium: transportMedium || undefined,
        purpose,
        outcome: outcome || undefined,
        nextFollowUpDate: nextFollowUpDate || undefined,
        clientFeedback: clientFeedback || undefined,
        notes: notes || undefined,
        terms: terms || undefined,
        clientContactIds: selectedContactIds,
      };
      await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${visitId}`, { method: "PUT", data: payload });
      // save each job's text fields
      await Promise.all(jobs.map((j) =>
        authApiFetch(`${API_ROUTES.CLIENT_VISIT}/jobs/${j.id}`, {
          method: "PUT",
          data: { description: j.description, material: j.material, quantity: j.quantity, size: j.size, requirement: j.requirement, cost: j.cost },
        })
      ));
      goto(`/admin/client-visit/${visitId}`);
    } catch (err) {
      const errs = errorHandle(err);
      errorMessage = typeof errs === "string" ? errs : "An error occurred.";
    } finally {
      loading = false;
    }
  }

  async function handleAddAttendee() {
    if (!newAttUserId) return;
    addingAttendee = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${visitId}/attendees`, {
        method: "POST",
        data: { userId: Number(newAttUserId), isLead: newAttIsLead },
      });
      existingAttendees = res.data?.attendees ?? existingAttendees;
      newAttUserId = ""; newAttIsLead = false;
    } catch (_) { Swal.fire("Error", "Failed to add attendee.", "error"); }
    finally { addingAttendee = false; }
  }

  async function handleRemoveAttendee(attId) {
    const r = await Swal.fire({ title: "Remove attendee?", icon: "warning", showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Remove" });
    if (!r.isConfirmed) return;
    try {
      await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${visitId}/attendees/${attId}`, { method: "DELETE" });
      existingAttendees = existingAttendees.filter((a) => a.id !== attId);
    } catch (_) { Swal.fire("Error", "Failed to remove.", "error"); }
  }

  function addExpenseItem() { expenseForm.items = [...expenseForm.items, { description: "", amount: 0 }]; }
  function removeExpenseItem(i) { expenseForm.items = expenseForm.items.filter((_, idx) => idx !== i); }
  $: totalExpenseAmount = expenseForm.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

  async function handleAddExpense() {
    if (!expenseForm.title) { Swal.fire("Error", "Title is required.", "error"); return; }
    addingExpense = true;
    try {
      const fd = new FormData();
      fd.append("title", expenseForm.title);
      fd.append("companyId", String(expenseForm.companyId));
      fd.append("clientVisitId", String(visitId));
      fd.append("items", JSON.stringify(expenseForm.items.filter((it) => it.description)));
      if (expenseForm.remarks) fd.append("remarks", expenseForm.remarks);
      await authApiFetch(API_ROUTES.USER_PAYMENT, { method: "POST", data: fd });
      await loadExpenses();
      expenseForm = { title: "", companyId: expenseForm.companyId, items: [{ description: "", amount: 0 }], remarks: "" };
      showAddExpenseForm = false;
    } catch (_) { Swal.fire("Error", "Failed to save expense.", "error"); }
    finally { addingExpense = false; }
  }

  async function handleAddContact() {
    addContactError = "";
    if (!newContact.name.trim()) { addContactError = "Contact name is required."; return; }
    addingContact = true;
    try {
      const res = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          clientId,
          name: newContact.name.trim(),
          designation: newContact.designation || undefined,
          mobile: newContact.mobile || undefined,
        }),
      });
      const saved = res?.data ?? res;
      clientContacts = [...clientContacts, saved];
      selectedContactIds = [...selectedContactIds, saved.id];
      newContact = { name: "", designation: "", mobile: "" };
      showAddContact = false;
    } catch (_) {
      addContactError = "Failed to save contact. Please try again.";
    } finally {
      addingContact = false;
    }
  }

  function toggleContact(id) {
    if (selectedContactIds.includes(id)) selectedContactIds = selectedContactIds.filter((x) => x !== id);
    else selectedContactIds = [...selectedContactIds, id];
  }

  function expTotal(items) { return (items ?? []).reduce((s, it) => s + (parseFloat(it.amount) || 0), 0); }
  $: grandTotalExpenses = expenses.reduce((s, exp) => s + expTotal(exp.items), 0);

  let showAddExpenseForm = false;

  async function deleteExpense(id) {
    const r = await Swal.fire({ title: "Delete expense?", text: "This cannot be undone.", icon: "warning", showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Delete" });
    if (!r.isConfirmed) return;
    try {
      await authApiFetch(`${API_ROUTES.USER_PAYMENT}/${id}`, { method: "DELETE" });
      await loadExpenses();
    } catch (_) { Swal.fire("Error", "Failed to delete expense.", "error"); }
  }
</script>

<div class="page-wrapper">
  <div class="content">

    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div class="d-flex align-items-center gap-3">
        <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => history.length > 2 ? history.back() : goto(`/admin/client-visit/${visitId}`)}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <h4 class="mb-0">Edit Client Visit</h4>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              <li class="breadcrumb-item"><a href="/admin/client-visit">Client Visits</a></li>
              <li class="breadcrumb-item active">Edit</li>
            </ol>
          </nav>
        </div>
      </div>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-primary" on:click={handleSubmit} disabled={loading}>
          <i class="ti ti-device-floppy me-1"></i>{loading ? "Saving..." : "Save Changes"}
        </button>
        <a href="/admin/client-visit/{visitId}" class="btn btn-outline-secondary">Cancel</a>
      </div>
    </div>

    {#if loadingData}
      <Loader />
    {:else}
      {#if errorMessage}
        <div class="alert alert-danger py-2 mb-3">{errorMessage}</div>
      {/if}

      <form on:submit={handleSubmit}>

        <!-- ═══ CLIENT CARD ═══ -->
        {#if clientInfo}
          <div class="card border mb-3">
            <div class="card-header py-2 bg-white">
              <h6 class="mb-0 fw-semibold">
                <i class="ti ti-building-store me-2 text-primary"></i>Client
              </h6>
            </div>
            <div class="card-body">
              <!-- Client info -->
              <div class="border border-primary rounded p-3" style="background:#f0f4ff;">
                <div class="d-flex align-items-center gap-3 mb-3">
                  <div class="rounded-circle d-flex align-items-center justify-content-center bg-primary text-white" style="width:44px;height:44px;font-size:20px;flex-shrink:0;">
                    <i class="ti ti-building-store"></i>
                  </div>
                  <div>
                    <div class="fw-bold" style="font-size:16px;">{clientInfo.name}</div>
                    <div class="d-flex flex-wrap gap-3 mt-1">
                      {#if clientInfo.gstNumber}
                        <span class="text-muted small"><i class="ti ti-file-invoice me-1"></i>GST: {clientInfo.gstNumber}</span>
                      {/if}
                      {#if clientInfo.mobile}
                        <span class="text-muted small"><i class="ti ti-phone me-1"></i>{clientInfo.mobile}</span>
                      {/if}
                      {#if clientInfo.email}
                        <span class="text-muted small"><i class="ti ti-mail me-1"></i>{clientInfo.email}</span>
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Contacts section -->
                <div class="border-top pt-3">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <label class="form-label fw-semibold mb-0">
                      <i class="ti ti-users me-1 text-primary"></i>Contacts Met During Visit
                      <span class="text-muted fw-normal">(select all who attended)</span>
                    </label>
                    {#if !showAddContact}
                      <button type="button" class="btn btn-sm btn-outline-primary"
                        on:click={() => { showAddContact = true; addContactError = ""; }}>
                        <i class="ti ti-plus me-1"></i>Add Contact
                      </button>
                    {/if}
                  </div>

                  {#if clientContacts.length > 0}
                    <div class="d-flex flex-wrap gap-2 mb-2">
                      {#each clientContacts as cc}
                        <label class="border rounded px-3 py-2 d-flex align-items-center gap-2 {selectedContactIds.includes(cc.id) ? 'border-primary' : 'border-secondary'}"
                          style="cursor:pointer;font-size:14px;background:{selectedContactIds.includes(cc.id) ? '#dde8ff' : '#fff'};">
                          <input type="checkbox"
                            checked={selectedContactIds.includes(cc.id)}
                            on:change={() => toggleContact(cc.id)}
                            style="accent-color:var(--bs-primary);width:15px;height:15px;" />
                          <span class="fw-semibold">{cc.name}</span>
                          {#if cc.designation}<span class="text-muted">— {cc.designation}</span>{/if}
                          {#if cc.mobile}<span class="text-muted small">· {cc.mobile}</span>{/if}
                        </label>
                      {/each}
                    </div>
                  {:else if !showAddContact}
                    <div class="text-muted small mb-2">
                      <i class="ti ti-info-circle me-1"></i>No contacts on file for this client.
                    </div>
                  {/if}

                  <!-- Inline add contact form -->
                  {#if showAddContact}
                    <div class="border rounded p-3 mt-2" style="background:#fff;">
                      <div class="fw-semibold mb-2 small">New Contact</div>
                      {#if addContactError}
                        <div class="alert alert-danger py-1 px-2 mb-2 small">{addContactError}</div>
                      {/if}
                      <div class="row g-2 mb-2">
                        <div class="col-md-4">
                          <input type="text" class="form-control form-control-sm" placeholder="Full name *"
                            bind:value={newContact.name} />
                        </div>
                        <div class="col-md-4">
                          <input type="text" class="form-control form-control-sm" placeholder="Designation (e.g. Purchase Manager)"
                            bind:value={newContact.designation} />
                        </div>
                        <div class="col-md-4">
                          <input type="text" class="form-control form-control-sm" placeholder="Mobile"
                            bind:value={newContact.mobile} />
                        </div>
                      </div>
                      <div class="d-flex gap-2">
                        <button type="button" class="btn btn-sm btn-primary" disabled={addingContact} on:click={handleAddContact}>
                          <i class="ti ti-check me-1"></i>{addingContact ? "Saving..." : "Save & Select"}
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary"
                          on:click={() => { showAddContact = false; newContact = { name: "", designation: "", mobile: "" }; addContactError = ""; }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- ═══ SECTION 1: Visit Info ═══ -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold">
              <i class="ti ti-map-pin me-2 text-primary"></i>Visit Information
            </h6>
          </div>
          <div class="card-body">

            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label fw-semibold">Visit Type</label>
                <div class="d-flex gap-2">
                  <button type="button"
                    class="btn flex-fill {visitType === 'outgoing' ? 'btn-warning' : 'btn-outline-secondary'}"
                    on:click={() => (visitType = 'outgoing')}>
                    <i class="ti ti-arrow-up-right me-1"></i>Outgoing
                  </button>
                  <button type="button"
                    class="btn flex-fill {visitType === 'incoming' ? 'btn-info text-white' : 'btn-outline-secondary'}"
                    on:click={() => (visitType = 'incoming')}>
                    <i class="ti ti-arrow-down-left me-1"></i>Incoming
                  </button>
                </div>
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">Visit Date <span class="text-danger">*</span></label>
                <input type="date" class="form-control" bind:value={visitDate} required />
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">Start Date &amp; Time</label>
                <input type="datetime-local" class="form-control" bind:value={startTime} />
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">End Date &amp; Time</label>
                <input type="datetime-local" class="form-control" bind:value={endTime} />
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-md-4">
                <label class="form-label fw-semibold">Purpose <span class="text-danger">*</span></label>
                <input type="text" class="form-control" bind:value={purpose} placeholder="e.g. Site survey, Machine demo, Follow-up..." required />
              </div>
              <div class="col-md-2">
                <label class="form-label fw-semibold">Transport</label>
                <input type="text" class="form-control" placeholder="Car, Train, Flight..." bind:value={transportMedium} />
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">Outcome</label>
                <select class="form-select" bind:value={outcome}>
                  <option value="">— Select outcome —</option>
                  <option value="Positive">Positive</option>
                  <option value="Negative">Negative</option>
                  <option value="Pending">Pending</option>
                  <option value="No Response">No Response</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">Next Follow-up Date</label>
                <input type="date" class="form-control" bind:value={nextFollowUpDate} />
              </div>
            </div>

            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label fw-semibold">Client Feedback</label>
                <textarea class="form-control" rows="3" placeholder="What the client said, asked, or decided during the visit..." bind:value={clientFeedback}></textarea>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Internal Notes</label>
                <textarea class="form-control" rows="3" placeholder="Internal notes — follow-up actions, price discussed, concerns..." bind:value={notes}></textarea>
              </div>
            </div>

          </div>
        </div>

        <!-- ═══ SECTION 2: Jobs ═══ -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between">
            <h6 class="mb-0 fw-semibold">
              <i class="ti ti-tool me-2 text-warning"></i>Section 2 — Job / Work-piece Requirements
              {#if jobs.length > 0}
                <span class="badge bg-warning text-dark ms-2">{jobs.length} job{jobs.length > 1 ? 's' : ''}</span>
              {/if}
            </h6>
            <button type="button" class="btn btn-sm btn-outline-warning" on:click={addJob} disabled={addingJob}>
              <i class="ti ti-plus me-1"></i>{addingJob ? "Adding..." : "Add Job"}
            </button>
          </div>
          <div class="card-body p-0">
            {#if jobs.length === 0}
              <div class="text-center py-5">
                <i class="ti ti-tool" style="font-size:40px;color:#dee2e6;display:block;margin-bottom:8px;"></i>
                <p class="text-muted mb-2">No jobs added yet.</p>
                <button type="button" class="btn btn-outline-warning" on:click={addJob}>
                  <i class="ti ti-plus me-1"></i>Add First Job
                </button>
              </div>
            {:else}
              {#each jobs as job, i}
                <div class="p-3" style="border-bottom:1px solid #f0f0f0;">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="fw-semibold" style="font-size:13px;">Job #{i + 1}</span>
                    <button type="button" class="btn btn-sm btn-soft-danger" on:click={() => removeJob(job.id)}>
                      <i class="ti ti-trash me-1"></i>Remove
                    </button>
                  </div>
                  <div class="row g-2 mb-3">
                    <div class="col-md-4">
                      <label class="form-label fw-semibold">Work-piece / Description <span class="text-danger">*</span></label>
                      <input type="text" class="form-control" placeholder="e.g. Casting deburring, Shot peening..." bind:value={job.description} />
                    </div>
                    <div class="col-md-2">
                      <label class="form-label fw-semibold">Material</label>
                      <input type="text" class="form-control" placeholder="Cast iron, Steel..." bind:value={job.material} />
                    </div>
                    <div class="col-md-2">
                      <label class="form-label fw-semibold">Qty</label>
                      <input type="text" class="form-control" placeholder="500 pcs" bind:value={job.quantity} />
                    </div>
                    <div class="col-md-2">
                      <label class="form-label fw-semibold">Size / Dim.</label>
                      <input type="text" class="form-control" placeholder="80–120mm" bind:value={job.size} />
                    </div>
                    <div class="col-md-2">
                      <label class="form-label fw-semibold">Est. Cost (₹)</label>
                      <div class="input-group">
                        <span class="input-group-text">₹</span>
                        <input type="number" class="form-control" placeholder="0" bind:value={job.cost} min="0" />
                      </div>
                    </div>
                    <div class="col-12">
                      <label class="form-label fw-semibold">Requirement / Specification</label>
                      <textarea class="form-control" rows="2" placeholder="Surface finish Ra value, Almen intensity, shot peening spec, hardness requirement..." bind:value={job.requirement}></textarea>
                    </div>
                  </div>

                  <!-- Images -->
                  <div>
                    <label class="form-label fw-semibold">Job Images</label>
                    <div class="d-flex align-items-center gap-3 flex-wrap">
                      {#each (job.images ?? []) as img, imgIdx}
                        <div style="position:relative;display:inline-block;">
                          <img src="{BASE_URL}{img.url}" alt="Job image" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid #dee2e6;" />
                          <button type="button" on:click={() => removeImage(job.id, imgIdx)}
                            style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#dc3545;border:none;color:white;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>
                        </div>
                      {/each}
                      <label class="border border-dashed rounded d-flex flex-column align-items-center justify-content-center text-muted" style="width:80px;height:80px;cursor:pointer;gap:4px;font-size:11px;border-style:dashed !important;">
                        {#if uploadingJobIndex === job.id}
                          <span style="font-size:10px;text-align:center;">Uploading...</span>
                        {:else}
                          <i class="ti ti-camera-plus" style="font-size:22px;"></i>
                          <span>Add photo</span>
                        {/if}
                        <input type="file" accept="image/*" class="d-none" disabled={uploadingJobIndex !== null}
                          on:change={(e) => uploadImage(job.id, e.currentTarget)} />
                      </label>
                    </div>
                  </div>
                </div>
              {/each}

              <div class="d-flex align-items-center justify-content-between px-3 py-2 bg-light border-top">
                <button type="button" class="btn btn-outline-warning btn-sm" on:click={addJob} disabled={addingJob}>
                  <i class="ti ti-plus me-1"></i>{addingJob ? "Adding..." : "Add Another Job"}
                </button>
                <span>
                  <span class="text-muted me-2" style="font-size:13px;">Total Estimate</span>
                  <span class="fw-semibold" style="font-size:16px;">₹{totalCost.toLocaleString('en-IN')}</span>
                </span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Terms -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold">
              <i class="ti ti-file-text me-2 text-primary"></i>Terms Discussed
            </h6>
          </div>
          <div class="card-body">
            <textarea class="form-control" rows="2" placeholder="Delivery terms, advance amount, warranty period, lead time discussed during the visit..." bind:value={terms}></textarea>
          </div>
        </div>

        <!-- Save -->
        <div class="d-flex gap-2 mb-4">
          <button type="submit" class="btn btn-primary" disabled={loading}>
            <i class="ti ti-device-floppy me-1"></i>{loading ? "Saving..." : "Save Changes"}
          </button>
          <a href="/admin/client-visit/{visitId}" class="btn btn-outline-secondary">Cancel</a>
        </div>

      </form>

      <!-- ═══ SECTION 3: Attendees ═══ -->
      <div class="card border mb-3">
        <div class="card-header py-2 bg-white">
          <h6 class="mb-0 fw-semibold">
            <i class="ti ti-users me-2 text-primary"></i>Attendees <span class="text-muted fw-normal">(Our Team)</span>
          </h6>
        </div>
        <div class="card-body">
          {#if existingAttendees.length > 0}
            <div class="d-flex flex-wrap gap-2 mb-3">
              {#each existingAttendees as att}
                <div class="d-flex align-items-center gap-2 border rounded px-3 py-2" style="font-size:14px;background:#f8f9fa;">
                  <i class="ti ti-user-circle text-muted"></i>
                  <span class="fw-semibold">{att.user?.name ?? "—"}</span>
                  <span class="text-muted" style="font-size:12px;">{att.user?.role ?? ""}</span>
                  {#if att.isLead}<span class="badge bg-primary ms-1">Lead</span>{/if}
                  <button type="button" class="btn-close" style="font-size:10px;" on:click={() => handleRemoveAttendee(att.id)}></button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-muted mb-3" style="font-size:13px;">No attendees added yet.</p>
          {/if}
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <select class="form-select" style="max-width:240px;" bind:value={newAttUserId}>
              <option value="">Select employee...</option>
              {#each users as u}
                <option value={u.id}>{u.name} ({u.role})</option>
              {/each}
            </select>
            <label class="d-flex align-items-center gap-1 mb-0" style="cursor:pointer;">
              <input type="checkbox" bind:checked={newAttIsLead} style="accent-color:var(--bs-primary);" />
              Mark as Lead
            </label>
            <button type="button" class="btn btn-outline-primary" disabled={!newAttUserId || addingAttendee} on:click={handleAddAttendee}>
              <i class="ti ti-plus me-1"></i>{addingAttendee ? "Adding..." : "Add Attendee"}
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ SECTION 4: Expenses ═══ -->
      <div class="card border mb-5">
        <div class="card-header py-2 bg-white">
          <h6 class="mb-0 fw-semibold">
            <i class="ti ti-receipt me-2 text-success"></i>Expenses <span class="text-muted fw-normal">(Travel, Food, Other)</span>
          </h6>
        </div>
        <div class="card-body p-0">
          {#if loadingExpenses}
            <div class="p-3 text-muted">Loading expenses...</div>
          {:else if expenses.length > 0}
            <div class="table-responsive">
              <table class="table table-sm mb-0">
                <thead class="table-light">
                  <tr>
                    <th style="width:40px;">#</th>
                    <th>Title</th>
                    <th>Items</th>
                    <th>Remarks</th>
                    <th>Date</th>
                    <th>Added By</th>
                    <th class="text-end">Total</th>
                    <th style="width:60px;"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each expenses as exp, i}
                    <tr>
                      <td class="text-muted" style="font-size:13px;">{i + 1}</td>
                      <td style="font-size:14px;">{exp.title}</td>
                      <td class="text-muted" style="font-size:13px;">{(exp.items ?? []).map((it) => `${it.description} ₹${parseFloat(it.amount||0).toFixed(0)}`).join(" · ") || "—"}</td>
                      <td class="text-muted" style="font-size:13px;">{exp.remarks || "—"}</td>
                      <td class="text-muted" style="font-size:13px;">{exp.createdAt ? new Date(exp.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : "—"}</td>
                      <td class="text-muted" style="font-size:13px;">{exp.user?.name ?? "—"}</td>
                      <td class="text-end fw-semibold">₹{expTotal(exp.items).toLocaleString('en-IN')}</td>
                      <td>
                        <button class="btn btn-sm btn-outline-danger px-2 py-1" on:click={() => deleteExpense(exp.id)} title="Delete">
                          <i class="ti ti-trash" style="font-size:13px;"></i>
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
                <tfoot class="table-light">
                  <tr>
                    <td colspan="6" class="fw-semibold text-end" style="font-size:13px;">Grand Total</td>
                    <td class="text-end fw-bold" style="font-size:14px;">₹{grandTotalExpenses.toLocaleString('en-IN')}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          {:else}
            <div class="p-3 text-muted" style="font-size:13px;">No expenses recorded yet.</div>
          {/if}
        </div>

        <div class="card-body border-top">
          <div class="d-flex align-items-center justify-content-between mb-3">
            <h6 class="fw-semibold mb-0">Add Expense</h6>
            <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => showAddExpenseForm = !showAddExpenseForm}>
              <i class="ti ti-{showAddExpenseForm ? 'chevron-up' : 'chevron-down'} me-1"></i>{showAddExpenseForm ? "Hide" : "Show"}
            </button>
          </div>

          {#if showAddExpenseForm}
          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label fw-semibold">Title <span class="text-danger">*</span></label>
              <input type="text" class="form-control" placeholder="e.g. Travel to Pune, Client lunch" bind:value={expenseForm.title} />
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Remarks</label>
              <input type="text" class="form-control" placeholder="Any additional notes..." bind:value={expenseForm.remarks} />
            </div>
          </div>

          <label class="form-label fw-semibold">Items <span class="text-danger">*</span></label>
          {#each expenseForm.items as item, i}
            <div class="row g-2 mb-2 align-items-center">
              <div class="col-md-6">
                <input type="text" class="form-control" placeholder="Description (Fuel, Toll, Food, Hotel...)" bind:value={item.description} />
              </div>
              <div class="col-md-4">
                <div class="input-group">
                  <span class="input-group-text">₹</span>
                  <input type="number" class="form-control" placeholder="Amount (₹)" bind:value={item.amount} min="0" />
                </div>
              </div>
              <div class="col-md-2">
                <button type="button" class="btn btn-outline-danger w-100" on:click={() => removeExpenseItem(i)} disabled={expenseForm.items.length === 1}>
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </div>
          {/each}

          <div class="d-flex align-items-center justify-content-between mt-3 mb-3">
            <button type="button" class="btn btn-outline-secondary btn-sm" on:click={addExpenseItem}>
              <i class="ti ti-plus me-1"></i>Add Item
            </button>
            <span class="fw-semibold">Total: ₹{totalExpenseAmount.toLocaleString('en-IN')}</span>
          </div>

          <button type="button" class="btn btn-success" disabled={addingExpense} on:click={handleAddExpense}>
            <i class="ti ti-plus me-1"></i>{addingExpense ? "Saving..." : "Save Expense"}
          </button>
          {/if}
        </div>
      </div>

    {/if}
  </div>
</div>
