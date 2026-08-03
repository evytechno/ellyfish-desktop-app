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

  const ADDRESS_LABELS = {
    outgoing:       "Client Site Address",
    incoming:       "Client's Origin / Home Office",
    joint:          "Meeting Location",
    job_discussion: "Client Office Address",
    job_received:   "Pickup / Sent From Address",
    sample_sent:    "Delivery Address",
  };

  const VISIT_TYPES = [
    { value: "incoming",       icon: "ti-building-store",  label: "They Came To Us",        color: "primary",   desc: "Client visited your company" },
    { value: "outgoing",       icon: "ti-car",             label: "We Visited Client",       color: "warning",   desc: "Your team went to client site" },
    { value: "joint",          icon: "ti-users",           label: "Joint Site Visit",        color: "info",      desc: "Together at a third location" },
    { value: "job_discussion", icon: "ti-clipboard-list",  label: "Job Discussion",          color: "success",   desc: "Client discussed job requirements" },
    { value: "job_received",   icon: "ti-package",         label: "Job Received",            color: "secondary", desc: "Client sent material/job to us" },
    { value: "sample_sent",    icon: "ti-send",            label: "Sample Sent",             color: "danger",    desc: "You sent a sample to client" },
  ];

  const TYPE_FIELDS = {
    incoming:       { transport: false, location: false, startEnd: true,  outcome: true,  purpose: true,  feedback: true,  terms: false, jobs: true, nextFollowUp: true,  dateLabel: "Visit Date",     ourTeamLabel: "Our Team Who Received",  clientLabel: "Client Contacts Who Came",  jobsLabel: "Job / Material Details" },
    outgoing:       { transport: true,  location: false, startEnd: true,  outcome: true,  purpose: true,  feedback: true,  terms: true,  jobs: true, nextFollowUp: true,  dateLabel: "Visit Date",     ourTeamLabel: "Who Went From Our Side", clientLabel: "Client Contacts Met",       jobsLabel: "Job / Material Details" },
    joint:          { transport: true,  location: true,  startEnd: true,  outcome: true,  purpose: true,  feedback: false, terms: false, jobs: true, nextFollowUp: true,  dateLabel: "Visit Date",     ourTeamLabel: "Our Team",               clientLabel: "Client Contacts",           jobsLabel: "Job / Material Details" },
    job_discussion: { transport: false, location: false, startEnd: false, outcome: false, purpose: false, feedback: false, terms: true,  jobs: true,  nextFollowUp: true,  dateLabel: "Discussion Date",ourTeamLabel: "Our Team Present",       clientLabel: "Client Contacts Who Came",  jobsLabel: "Job / Work-piece Requirements" },
    job_received:   { transport: false, location: false, startEnd: false, outcome: false, purpose: false, feedback: false, terms: false, jobs: true,  nextFollowUp: false, dateLabel: "Date Received",  ourTeamLabel: "Received By",            clientLabel: "Sent By (Client Contact)",   jobsLabel: "Job / Material Details" },
    sample_sent:    { transport: false, location: false, startEnd: false, outcome: false, purpose: false, feedback: false, terms: false, jobs: true,  nextFollowUp: true,  dateLabel: "Date Sent",      ourTeamLabel: "Sent By",                clientLabel: "Sent To (Client Contact)",   jobsLabel: "Sample Details" },
  };

  $: fields = TYPE_FIELDS[visitType] || TYPE_FIELDS["outgoing"];

  // visit fields
  let visitType = "outgoing";
  let visitStatus = "completed";
  let companyId = "";
  let visitDate = "";
  let meetingTime = "";
  let startTime = "";
  let endTime = "";
  let transportMedium = "";
  let location = "";
  let addressLine = "";
  let city = "";
  let state = "";
  let pincode = "";
  let purpose = "";
  let outcome = "";
  let nextFollowUpDate = "";
  let clientFeedback = "";
  let notes = "";
  let terms = "";
  let selectedContactIds = [];

  // order link (master only)
  let linkedOrder = null;
  let orderSearchQuery = "";
  let orderSearchResults = [];
  let orderSearchLoading = false;
  let orderSearchTimer = null;
  let orderSearchDropdown = false;

  // order preview modal
  let orderPreview = null;
  let orderPreviewLoading = false;
  let showOrderPreview = false;

  async function openOrderPreview(orderId) {
    showOrderPreview = true;
    orderPreview = null;
    orderPreviewLoading = true;
    try {
      orderPreview = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}`);
    } catch (_) {}
    orderPreviewLoading = false;
  }

  async function searchOrders(q) {
    if (!q || q.trim().length < 1) { orderSearchResults = []; orderSearchDropdown = false; return; }
    orderSearchLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.ORDER}?search=${encodeURIComponent(q)}&limit=10`);
      orderSearchResults = res?.data ?? [];
      orderSearchDropdown = true;
    } catch (_) { orderSearchResults = []; }
    orderSearchLoading = false;
  }

  function onOrderSearchInput() {
    clearTimeout(orderSearchTimer);
    orderSearchTimer = setTimeout(() => searchOrders(orderSearchQuery), 300);
  }

  function selectOrder(order) {
    linkedOrder = order;
    orderSearchQuery = `#${order.pId} — ${order.title}`;
    orderSearchDropdown = false;
  }

  function clearLinkedOrder() {
    linkedOrder = null;
    orderSearchQuery = "";
    orderSearchResults = [];
  }

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
  let expenseForm = { title: "", companyId: "", items: [{ item: "", price: 0 }], remarks: "" };
  let expenseFiles = [];
  let expenseLightbox = null;
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
      visitStatus = visit.status ?? "completed";
      if (visit.order) {
        linkedOrder = visit.order;
        orderSearchQuery = `#${visit.order.pId} — ${visit.order.title}`;
      }
      companyId = visit.company?.id ? String(visit.company.id) : "";
      visitDate = visit.visitDate?.slice(0, 10) ?? "";
      meetingTime = (visit.meetingTime ?? "").slice(0, 5);
      startTime = toDatetimeLocal(visit.startTime);
      endTime = toDatetimeLocal(visit.endTime);
      transportMedium = visit.transportMedium ?? "";
      location = visit.location ?? "";
      addressLine = visit.addressLine ?? "";
      city = visit.city ?? "";
      state = visit.state ?? "";
      pincode = visit.pincode ?? "";
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
    if (!city.trim()) { errorMessage = "City is required."; return; }
    if (!state.trim()) { errorMessage = "State is required."; return; }
    if (!meetingTime) { errorMessage = "Meeting time is required."; return; }
    loading = true;
    try {
      // save visit fields
      const payload = {
        visitType, visitDate,
        meetingTime,
        status: visitStatus,
        orderId: currentUser?.role === 'master' ? (linkedOrder?.id ?? null) : undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        transportMedium: transportMedium || undefined,
        location: location || undefined,
        addressLine: addressLine || undefined,
        city: city.trim(),
        state: state.trim(),
        pincode: pincode || undefined,
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

  function addExpenseItem() { expenseForm.items = [...expenseForm.items, { item: "", price: 0 }]; }
  function removeExpenseItem(i) { expenseForm.items = expenseForm.items.filter((_, idx) => idx !== i); }
  $: totalExpenseAmount = expenseForm.items.reduce((s, it) => s + (parseFloat(it.price) || 0), 0);

  async function handleAddExpense() {
    if (!expenseForm.title) { Swal.fire("Error", "Title is required.", "error"); return; }
    addingExpense = true;
    try {
      const fd = new FormData();
      fd.append("title", expenseForm.title);
      fd.append("companyId", String(expenseForm.companyId));
      fd.append("clientVisitId", String(visitId));
      fd.append("items", JSON.stringify(expenseForm.items.filter((it) => it.item)));
      if (expenseForm.remarks) fd.append("remarks", expenseForm.remarks);
      for (const file of expenseFiles) fd.append("files", file);
      await authApiFetch(API_ROUTES.USER_PAYMENT, { method: "POST", data: fd });
      await loadExpenses();
      expenseForm = { title: "", companyId: expenseForm.companyId, items: [{ item: "", price: 0 }], remarks: "" };
      expenseFiles = [];
      showAddExpenseForm = false;
    } catch (_) { Swal.fire("Error", "Failed to save expense.", "error"); }
    finally { addingExpense = false; }
  }

  async function handleAddContact(keepOpen = false) {
    addContactError = "";
    if (!newContact.name.trim()) { addContactError = "Contact name is required."; return; }
    addingContact = true;
    try {
      const res = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: {
          clientId,
          name: newContact.name.trim(),
          designation: newContact.designation || undefined,
          mobile: newContact.mobile || undefined,
        },
      });
      const saved = res?.data ?? res;
      clientContacts = [...clientContacts, saved];
      selectedContactIds = [...selectedContactIds, saved.id];
      newContact = { name: "", designation: "", mobile: "" };
      if (!keepOpen) showAddContact = false;
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

  function expTotal(items) { return (items ?? []).reduce((s, it) => s + (parseFloat(it.price ?? it.amount) || 0), 0); }
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
        <button type="button" class="btn btn-warning btn-sm" on:click={() => history.length > 2 ? history.back() : goto(`/admin/client-visit/${visitId}`)}>
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
                      <i class="ti ti-users me-1 text-primary"></i>{fields.clientLabel}
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
                        <button type="button" class="btn btn-sm btn-outline-primary" disabled={addingContact} on:click={() => handleAddContact(true)}>
                          {addingContact ? "Saving..." : "Save & Add More"}
                        </button>
                        <button type="button" class="btn btn-sm btn-primary" disabled={addingContact} on:click={() => handleAddContact(false)}>
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

        <!-- ═══ ORDER LINK (master only) ═══ -->
        {#if currentUser?.role === 'master'}
          <div class="card border mb-3">
            <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between">
              <h6 class="mb-0 fw-semibold">
                <i class="ti ti-link me-2 text-warning"></i>Linked Order
              </h6>
              {#if linkedOrder}
                <button type="button" class="btn btn-sm btn-outline-danger py-0" on:click={clearLinkedOrder}>
                  <i class="ti ti-x me-1"></i>Remove Link
                </button>
              {/if}
            </div>
            <div class="card-body">
              {#if linkedOrder}
                <div class="d-flex align-items-center gap-3 p-2 border border-warning rounded" style="background:#fffbf0;">
                  <i class="ti ti-file-description text-warning" style="font-size:20px;flex-shrink:0;"></i>
                  <div class="flex-grow-1">
                    <div class="fw-semibold" style="font-size:13px;">#{linkedOrder.pId} — {linkedOrder.title}</div>
                    {#if linkedOrder.status}<span class="badge bg-secondary" style="font-size:10px;">{linkedOrder.status}</span>{/if}
                  </div>
                  <button type="button" class="btn btn-sm btn-outline-primary py-0" on:click={() => openOrderPreview(linkedOrder.id)}>
                    <i class="ti ti-eye me-1"></i>View
                  </button>
                </div>
              {:else}
                <div class="text-muted small mb-2">No order linked. Search to link one.</div>
              {/if}

              <!-- Order search -->
              <div class="mt-3 position-relative">
                <div class="input-group">
                  <span class="input-group-text"><i class="ti ti-search"></i></span>
                  <input
                    type="text"
                    class="form-control"
                    placeholder="Search order by title or #pId..."
                    bind:value={orderSearchQuery}
                    on:input={onOrderSearchInput}
                    autocomplete="off"
                  />
                  {#if orderSearchLoading}
                    <span class="input-group-text"><span class="spinner-border spinner-border-sm"></span></span>
                  {/if}
                </div>
                {#if orderSearchDropdown && orderSearchResults.length > 0}
                  <div class="border rounded bg-white position-absolute w-100 shadow" style="z-index:9999;max-height:220px;overflow-y:auto;top:100%;">
                    {#each orderSearchResults as o}
                      <button type="button" class="d-block w-100 text-start px-3 py-2 border-bottom" style="background:none;"
                        on:click={() => selectOrder(o)}>
                        <div class="fw-semibold" style="font-size:13px;">#{o.pId} — {o.title}</div>
                        <div class="text-muted" style="font-size:11px;">{o.status ?? ""}{o.orderClients?.[0]?.name ? ` · ${o.orderClients[0].name}` : ""}</div>
                      </button>
                    {/each}
                  </div>
                {:else if orderSearchDropdown && orderSearchResults.length === 0}
                  <div class="border rounded bg-white position-absolute w-100 shadow px-3 py-2" style="z-index:9999;top:100%;">
                    <span class="text-muted small">No orders found.</span>
                  </div>
                {/if}
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

            <div class="mb-3">
              <label class="form-label fw-semibold">Visit Type</label>
              <div class="row g-2">
                {#each VISIT_TYPES as t}
                  <div class="col-md-4 col-6">
                    <button type="button"
                      class="w-100 border rounded p-2 text-start position-relative"
                      style="cursor:pointer;background:{visitType === t.value ? 'var(--bs-' + t.color + '-bg-subtle,#e8f4ff)' : '#fff'};border-color:{visitType === t.value ? 'var(--bs-' + t.color + ')' : '#dee2e6'} !important;transition:all .15s;"
                      on:click={() => visitType = t.value}>
                      {#if visitType === t.value}
                        <span class="position-absolute top-0 end-0 mt-1 me-1"><i class="ti ti-circle-check text-{t.color}" style="font-size:14px;"></i></span>
                      {/if}
                      <div class="d-flex align-items-center gap-2">
                        <i class="ti {t.icon} text-{t.color}" style="font-size:16px;"></i>
                        <span class="fw-semibold" style="font-size:12px;">{t.label}</span>
                      </div>
                    </button>
                  </div>
                {/each}
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label fw-semibold">{fields.dateLabel} <span class="text-danger">*</span></label>
                <input type="date" class="form-control" bind:value={visitDate} required />
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">Meeting Time <span class="text-danger">*</span></label>
                <input type="time" class="form-control" bind:value={meetingTime} required />
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">Status <span class="text-danger">*</span></label>
                <select class="form-select" bind:value={visitStatus}>
                  <option value="scheduled">Scheduled (Planned)</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              {#if fields.startEnd}
                <div class="col-md-3">
                  <label class="form-label fw-semibold">Start Date &amp; Time</label>
                  <input type="datetime-local" class="form-control" bind:value={startTime} />
                </div>
                <div class="col-md-3">
                  <label class="form-label fw-semibold">End Date &amp; Time</label>
                  <input type="datetime-local" class="form-control" bind:value={endTime} />
                </div>
              {/if}
            </div>

            <div class="row g-3 mb-3">
              {#if fields.purpose}
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Purpose <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" bind:value={purpose} placeholder="e.g. Site survey, Machine demo, Follow-up..." required />
                </div>
              {/if}
              {#if fields.transport}
                <div class="col-md-2">
                  <label class="form-label fw-semibold">Transport</label>
                  <input type="text" class="form-control" placeholder="Car, Train, Flight..." bind:value={transportMedium} />
                </div>
              {/if}
              {#if fields.location}
                <div class="col-md-2">
                  <label class="form-label fw-semibold">Location / Site <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" placeholder="Address or site name..." bind:value={location} />
                </div>
              {/if}
              {#if fields.outcome}
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
              {/if}
              {#if fields.nextFollowUp}
                <div class="col-md-3">
                  <label class="form-label fw-semibold">Next Follow-up Date</label>
                  <input type="date" class="form-control" bind:value={nextFollowUpDate} />
                </div>
              {/if}
            </div>

            {#if fields.feedback}
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
            {:else}
              <div class="row g-3">
                <div class="col-md-12">
                  <label class="form-label fw-semibold">Internal Notes</label>
                  <textarea class="form-control" rows="3" placeholder="Internal notes..." bind:value={notes}></textarea>
                </div>
              </div>
            {/if}

          </div>

          <!-- Address — all types -->
          <div class="border-top pt-3 px-3 pb-3 mt-1">
            <label class="form-label fw-semibold mb-2">
              <i class="ti ti-map-pin me-1 text-primary"></i>{ADDRESS_LABELS[visitType] ?? "Address"}
            </label>
            <div class="row g-2">
              <div class="col-12">
                <input type="text" class="form-control" placeholder="Street / Area / Building" bind:value={addressLine} />
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold">City <span class="text-danger">*</span></label>
                <input type="text" class="form-control" placeholder="City" bind:value={city} required />
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold">State <span class="text-danger">*</span></label>
                <input type="text" class="form-control" placeholder="State" bind:value={state} required />
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold">Pincode</label>
                <input type="text" class="form-control" placeholder="Pincode" bind:value={pincode} />
              </div>
            </div>
          </div>

        </div>

        <!-- ═══ SECTION 2: Jobs ═══ -->
        {#if fields.jobs}
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between">
            <h6 class="mb-0 fw-semibold">
              <i class="ti ti-tool me-2 text-warning"></i>Section 2 — {fields.jobsLabel}
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

        {/if}

        <!-- Terms -->
        {#if fields.terms}
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
        {/if}

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
            <i class="ti ti-users me-2 text-primary"></i>{fields.ourTeamLabel} <span class="text-muted fw-normal">(Our Team)</span>
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
                    <th>Bills</th>
                    <th class="text-end">Total</th>
                    <th style="width:60px;"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each expenses as exp, i}
                    <tr>
                      <td class="text-muted" style="font-size:13px;">{i + 1}</td>
                      <td style="font-size:14px;">{exp.title}</td>
                      <td class="text-muted" style="font-size:13px;">{(exp.items ?? []).map((it) => `${it.item ?? it.description ?? ""} ₹${parseFloat(it.price ?? it.amount ?? 0).toFixed(0)}`).join(" · ") || "—"}</td>
                      <td class="text-muted" style="font-size:13px;">{exp.remarks || "—"}</td>
                      <td class="text-muted" style="font-size:13px;">{exp.createdAt ? new Date(exp.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : "—"}</td>
                      <td class="text-muted" style="font-size:13px;">{exp.user?.name ?? "—"}</td>
                      <td>
                        {#if exp.images?.length > 0}
                          <div class="d-flex flex-wrap gap-1">
                            {#each exp.images as img}
                              <button type="button" class="btn btn-link p-0" on:click={() => expenseLightbox = img.url} title={img.originalName}>
                                {#if img.mimeType?.startsWith('image/')}
                                  <img src={img.url} alt={img.originalName} style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #dee2e6;" />
                                {:else}
                                  <span class="badge bg-secondary" style="font-size:11px;"><i class="ti ti-file me-1"></i>PDF</span>
                                {/if}
                              </button>
                            {/each}
                          </div>
                        {:else}
                          <span class="text-muted" style="font-size:12px;">—</span>
                        {/if}
                      </td>
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
                    <td colspan="7" class="fw-semibold text-end" style="font-size:13px;">Grand Total</td>
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
                <input type="text" class="form-control" placeholder="Description (Fuel, Toll, Food, Hotel...)" bind:value={item.item} />
              </div>
              <div class="col-md-4">
                <div class="input-group">
                  <span class="input-group-text">₹</span>
                  <input type="number" class="form-control" placeholder="Amount (₹)" bind:value={item.price} min="0" />
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

          <div class="mb-3">
            <label class="form-label fw-semibold">Bill Images <span class="text-muted fw-normal" style="font-size:12px;">(optional, max 10)</span></label>
            <input type="file" class="form-control" accept="image/*,.pdf" multiple
              on:change={(e) => { expenseFiles = Array.from(e.target.files); }} />
            {#if expenseFiles.length > 0}
              <div class="d-flex flex-wrap gap-2 mt-2">
                {#each expenseFiles as file, i}
                  <div class="d-flex align-items-center gap-1 border rounded px-2 py-1" style="font-size:12px;background:#f8f9fa;">
                    <i class="ti ti-file me-1"></i>{file.name}
                    <button type="button" class="btn btn-link p-0 text-danger ms-1" style="font-size:12px;"
                      on:click={() => { expenseFiles = expenseFiles.filter((_, idx) => idx !== i); }}>
                      <i class="ti ti-x"></i>
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
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

{#if expenseLightbox}
  <div class="modal show d-block" tabindex="-1" style="background:rgba(0,0,0,0.75);z-index:9999;" on:click={() => expenseLightbox = null}>
    <div class="modal-dialog modal-dialog-centered modal-lg" on:click|stopPropagation>
      <div class="modal-content">
        <div class="modal-header py-2">
          <h6 class="modal-title mb-0">Bill Image</h6>
          <button type="button" class="btn-close" on:click={() => expenseLightbox = null}></button>
        </div>
        <div class="modal-body text-center p-2">
          <img src={expenseLightbox} alt="Bill" style="max-width:100%;max-height:80vh;object-fit:contain;" />
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ── Order Preview Modal ── -->
{#if showOrderPreview}
  <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);" on:click|self={() => showOrderPreview = false}>
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h6 class="modal-title mb-0 fw-semibold">
            <i class="ti ti-file-description me-2 text-warning"></i>
            {#if orderPreview}#{orderPreview.pId} — {orderPreview.title}{:else}Order Details{/if}
          </h6>
          <div class="d-flex align-items-center gap-2">
            {#if orderPreview}
              <a href="/admin/order/{orderPreview.id}" target="_blank" class="btn btn-sm btn-outline-primary py-0">
                <i class="ti ti-external-link me-1"></i>Open Full
              </a>
            {/if}
            <button type="button" class="btn-close" on:click={() => showOrderPreview = false}></button>
          </div>
        </div>
        <div class="modal-body p-0">
          {#if orderPreviewLoading}
            <div class="text-center py-5"><span class="spinner-border text-primary"></span></div>
          {:else if orderPreview}
            <table class="table table-bordered mb-0" style="font-size:13px;">
              <tbody>
                <tr>
                  <td class="text-muted fw-semibold" style="width:30%;">Order #</td>
                  <td>{orderPreview.financialYear}/{String(orderPreview.pId).padStart(6,'0')}</td>
                  <td class="text-muted fw-semibold">Status</td>
                  <td><span class="badge bg-secondary">{orderPreview.status}</span></td>
                </tr>
                <tr>
                  <td class="text-muted fw-semibold">Title</td>
                  <td colspan="3">{orderPreview.title}</td>
                </tr>
                {#if orderPreview.orderClients?.length}
                  <tr>
                    <td class="text-muted fw-semibold">Client</td>
                    <td colspan="3">{orderPreview.orderClients[0]?.name ?? '—'}{orderPreview.orderClients[0]?.mobile ? ` · ${orderPreview.orderClients[0].mobile}` : ''}</td>
                  </tr>
                {/if}
                {#if orderPreview.category}
                  <tr>
                    <td class="text-muted fw-semibold">Category</td>
                    <td colspan="3">{orderPreview.category}</td>
                  </tr>
                {/if}
                {#if orderPreview.price}
                  <tr>
                    <td class="text-muted fw-semibold">Price</td>
                    <td colspan="3">{orderPreview.currency === 'USD' ? '$' : '₹'}{Number(orderPreview.price).toLocaleString('en-IN')}</td>
                  </tr>
                {/if}
                {#if orderPreview.orderDate}
                  <tr>
                    <td class="text-muted fw-semibold">Order Date</td>
                    <td colspan="3">{new Date(orderPreview.orderDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</td>
                  </tr>
                {/if}
                {#if orderPreview.assignedUsers?.length}
                  <tr>
                    <td class="text-muted fw-semibold">Assigned</td>
                    <td colspan="3">{orderPreview.assignedUsers.map(u => u.name).join(', ')}</td>
                  </tr>
                {/if}
                {#if orderPreview.workOrderNumber}
                  <tr>
                    <td class="text-muted fw-semibold">Work Order</td>
                    <td colspan="3">{orderPreview.workOrderNumber}</td>
                  </tr>
                {/if}
              </tbody>
            </table>
          {:else}
            <div class="text-center py-5 text-muted">Failed to load order details.</div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
