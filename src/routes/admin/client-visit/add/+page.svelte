<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { checkAuth } from "$lib/utils/auth";
  import Loader from "$lib/components/Loader.svelte";

  let currentUser = null;
  let loadingData = true;
  let loading = false;
  let errorMessage = "";
  let formErrors = {};

  // pre-fill from URL params (from order or client detail page)
  let prefilledOrderId = null;
  let prefilledOrderTitle = "";

  // data
  let companies = [];
  let users = [];

  // visit fields
  let visitType = "outgoing";
  let companyId = "";
  let visitDate = new Date().toISOString().slice(0, 10);
  let startTime = "";
  let endTime = "";
  let transportMedium = "";
  let purpose = "";
  let outcome = "";
  let nextFollowUpDate = "";
  let clientFeedback = "";
  let notes = "";
  let terms = "";

  // ── Client search/create (same as order page) ──
  let ncSearchQuery = "";
  let ncSearchResults = [];
  let ncSearchLoading = false;
  let ncSearchTimer = null;
  let ncSearchDropdown = false;
  let ncSelectedClient = null;
  let ncCreateMode = false;
  let ncClientName = "";
  let ncClientGst = "";
  let ncClientMobile = "";
  let ncClientEmail = "";
  let ncClientAddress = "";
  let ncFormErrors = {};
  let ncCreating = false;

  // client contacts (loaded after client selected)
  let clientContacts = [];
  let selectedContactIds = [];

  // add new contact inline
  let showAddContact = false;
  let newContact = { name: "", designation: "", mobile: "" };
  let addingContact = false;
  let addContactError = "";

  // attendees
  let attendees = [];

  // jobs
  let jobs = [];

  onMount(async () => {
    currentUser = checkAuth();
    try {
      const [compData, userData] = await Promise.all([
        authApiFetch(API_ROUTES.COMPANY + "/all"),
        authApiFetch(API_ROUTES.USER + "/all"),
      ]);
      companies = compData || [];
      users = userData || [];
      if (currentUser?.companyId) {
        const match = companies.find((c) => c.id === Number(currentUser.companyId));
        if (match) companyId = String(match.id);
      }

      // Pre-fill from URL params
      const urlOrderId = $page.url.searchParams.get("orderId");
      const urlClientId = $page.url.searchParams.get("clientId");

      if (urlOrderId) {
        // came from order detail page — load order to get client
        try {
          const orderRes = await authApiFetch(`${API_ROUTES.ORDER}/${urlOrderId}/basic`);
          const ord = orderRes?.data ?? orderRes;
          prefilledOrderId = Number(urlOrderId);
          prefilledOrderTitle = ord?.title || `Order #${urlOrderId}`;
          if (ord?.client) {
            await ncSelectClient(ord.client);
          } else if (urlClientId) {
            const clientRes = await authApiFetch(`${API_ROUTES.CLIENT}/${urlClientId}`);
            const cl = clientRes?.data ?? clientRes;
            if (cl) await ncSelectClient(cl);
          }
        } catch (_) {}
      } else if (urlClientId) {
        // came from client detail page — load client
        try {
          const clientRes = await authApiFetch(`${API_ROUTES.CLIENT}/${urlClientId}`);
          const cl = clientRes?.data ?? clientRes;
          if (cl) await ncSelectClient(cl);
        } catch (_) {}
      }
    } catch (_) {
      errorMessage = "Failed to load data.";
    } finally {
      loadingData = false;
    }
  });

  // ── Client search ──
  async function ncSearchClients(q) {
    if (!q || q.trim().length < 1) { ncSearchResults = []; ncSearchDropdown = false; return; }
    ncSearchLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT}/search?q=${encodeURIComponent(q)}`);
      ncSearchResults = res?.data ?? res ?? [];
      ncSearchDropdown = true;
    } catch (_) { ncSearchResults = []; }
    ncSearchLoading = false;
  }

  function ncOnSearchInput() {
    clearTimeout(ncSearchTimer);
    ncSelectedClient = null;
    ncCreateMode = false;
    clientContacts = [];
    selectedContactIds = [];
    showAddContact = false;
    newContact = { name: "", designation: "", mobile: "" };
    ncSearchTimer = setTimeout(() => ncSearchClients(ncSearchQuery), 300);
  }

  async function ncSelectClient(client) {
    ncSelectedClient = client;
    ncSearchQuery = client.name;
    ncSearchDropdown = false;
    ncCreateMode = false;
    clientContacts = [];
    selectedContactIds = [];
    try {
      const cc = await authApiFetch(`${API_ROUTES.CLIENT_CONTACT}/by-client/${client.id}`);
      clientContacts = cc?.data ?? cc ?? [];
    } catch (_) {}
  }

  function ncClearClient() {
    ncSelectedClient = null;
    ncSearchQuery = "";
    ncSearchDropdown = false;
    clientContacts = [];
    selectedContactIds = [];
    showAddContact = false;
    newContact = { name: "", designation: "", mobile: "" };
  }

  async function ncSaveNewClient() {
    ncFormErrors = {};
    if (!ncClientName.trim()) { ncFormErrors.ncClientName = "Company name is required."; return; }
    ncCreating = true;
    try {
      const res = await authApiFetch(API_ROUTES.CLIENT, {
        method: "POST",
        data: JSON.stringify({
          name: ncClientName.trim(),
          gstNumber: ncClientGst || undefined,
          mobile: ncClientMobile || undefined,
          email: ncClientEmail || undefined,
          address: ncClientAddress || undefined,
        }),
      });
      await ncSelectClient(res?.data ?? res);
      ncCreateMode = false;
      ncClientName = ""; ncClientGst = ""; ncClientMobile = ""; ncClientEmail = ""; ncClientAddress = "";
    } catch (err) {
      const e = errorHandle(err);
      ncFormErrors = typeof e === "object" ? e : { ncClientName: "Failed to create client." };
    } finally {
      ncCreating = false;
    }
  }

  async function ncAddContact() {
    addContactError = "";
    if (!newContact.name.trim()) { addContactError = "Contact name is required."; return; }
    addingContact = true;
    try {
      const res = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          clientId: ncSelectedClient.id,
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

  // attendees
  function addAttendee() { attendees = [...attendees, { userId: "", isLead: false }]; }
  function removeAttendee(i) { attendees = attendees.filter((_, idx) => idx !== i); }

  // jobs
  function addJob() {
    jobs = [...jobs, { description: "", material: "", quantity: "", size: "", requirement: "", cost: "" }];
  }
  function removeJob(i) { jobs = jobs.filter((_, idx) => idx !== i); }
  $: totalCost = jobs.reduce((s, j) => s + (parseFloat(j.cost) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    formErrors = {};
    errorMessage = "";

    if (!ncSelectedClient) {
      errorMessage = "Please select or create a client before saving.";
      return;
    }
    if (!companyId) { formErrors.companyId = ["Company is required."]; return; }
    if (!purpose) { formErrors.purpose = ["Purpose is required."]; return; }

    loading = true;
    try {
      const payload = {
        visitType, visitDate,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        transportMedium: transportMedium || undefined,
        companyId: Number(companyId),
        clientId: ncSelectedClient.id,
        orderId: prefilledOrderId || undefined,
        clientContactIds: selectedContactIds,
        purpose,
        outcome: outcome || undefined,
        nextFollowUpDate: nextFollowUpDate || undefined,
        clientFeedback: clientFeedback || undefined,
        notes: notes || undefined,
        terms: terms || undefined,
        attendees: attendees.filter((a) => a.userId).map((a) => ({ userId: Number(a.userId), isLead: a.isLead })),
      };

      const res = await authApiFetch(API_ROUTES.CLIENT_VISIT, { method: "POST", data: payload });
      const newVisitId = res.data?.id;

      // create each job via separate API now that visit exists
      for (const j of jobs.filter((j) => j.description)) {
        await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${newVisitId}/jobs`, {
          method: "POST",
          data: { description: j.description, material: j.material, quantity: j.quantity, size: j.size, requirement: j.requirement, cost: j.cost || 0 },
        });
      }

      Swal.fire({ icon: "success", title: "Visit saved!", text: "You can now add job images from the edit page.", timer: 2000, showConfirmButton: false });
      setTimeout(() => goto(`/admin/client-visit/edit/${newVisitId}`), 2000);
    } catch (err) {
      const errs = errorHandle(err);
      if (errs && typeof errs === "object") formErrors = errs;
      else errorMessage = "An unexpected error occurred.";
    } finally {
      loading = false;
    }
  }
</script>

<div class="page-wrapper">
  <div class="content">

    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div class="d-flex align-items-center gap-3">
        <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <h4 class="mb-0">Add Client Visit</h4>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              <li class="breadcrumb-item"><a href="/admin/client-visit">Client Visits</a></li>
              <li class="breadcrumb-item active">Add</li>
            </ol>
          </nav>
        </div>
      </div>
      <a href="/admin/client-visit" class="btn btn-primary btn-sm">
        <i class="ti ti-list me-1"></i>Visit List
      </a>
    </div>

    {#if loadingData}
      <Loader />
    {:else}
      <form on:submit={handleSubmit}>

        {#if errorMessage}
          <div class="alert alert-danger py-2 mb-3">{errorMessage}</div>
        {/if}

        {#if prefilledOrderId}
          <div class="alert alert-info py-2 mb-3 d-flex align-items-center gap-2">
            <i class="ti ti-link me-1"></i>
            This visit will be linked to <strong class="ms-1">{prefilledOrderTitle}</strong>
            <a href="/admin/order/{prefilledOrderId}" class="ms-2 small">(View Order)</a>
          </div>
        {/if}

        <!-- ═══ CLIENT CARD ═══ -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold">
              <i class="ti ti-building-store me-2 text-primary"></i>Client <span class="text-danger">*</span>
            </h6>
          </div>
          <div class="card-body">

            <!-- Search state -->
            {#if !ncSelectedClient && !ncCreateMode}
              <div class="mb-3 position-relative">
                <label class="form-label fw-semibold">Search Client</label>
                <div class="input-group">
                  <input
                    type="text"
                    class="form-control"
                    placeholder="Search by name, mobile, email..."
                    bind:value={ncSearchQuery}
                    on:input={ncOnSearchInput}
                    autocomplete="off"
                  />
                  {#if ncSearchLoading}
                    <span class="input-group-text">
                      <span class="spinner-border spinner-border-sm"></span>
                    </span>
                  {/if}
                </div>

                <!-- Results dropdown -->
                {#if ncSearchDropdown && ncSearchResults.length > 0}
                  <div class="border rounded bg-white position-absolute w-100 shadow" style="z-index:9999;max-height:220px;overflow-y:auto;top:100%;">
                    {#each ncSearchResults as client}
                      <button type="button"
                        class="d-block w-100 text-start px-3 py-2 border-bottom"
                        style="background:none;"
                        on:click={() => ncSelectClient(client)}>
                        <div class="fw-semibold">
                          <i class="ti ti-building-store me-1 text-primary"></i>{client.name}
                        </div>
                        {#if client.gstNumber}
                          <div class="text-muted small">GST: {client.gstNumber}</div>
                        {/if}
                        {#if client.contacts?.length > 0}
                          <div class="text-muted small">Contacts: {client.contacts.map((c) => c.name).join(", ")}</div>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {/if}

                <!-- No results -->
                {#if ncSearchDropdown && ncSearchResults.length === 0 && ncSearchQuery.length > 1}
                  <div class="border rounded bg-white position-absolute w-100 shadow px-3 py-2" style="z-index:9999;top:100%;">
                    <div class="text-muted small mb-2">No client found for "{ncSearchQuery}"</div>
                    <button type="button" class="btn btn-sm btn-outline-primary"
                      on:click={() => { ncCreateMode = true; ncClientName = ncSearchQuery; ncSearchDropdown = false; }}>
                      <i class="ti ti-plus me-1"></i>Create New Client
                    </button>
                  </div>
                {/if}
              </div>

              <div class="text-center text-muted small my-3">— or —</div>
              <button type="button" class="btn btn-outline-warning btn-sm"
                on:click={() => { ncCreateMode = true; ncSearchDropdown = false; }}>
                <i class="ti ti-plus me-1"></i>Create New Client
              </button>
            {/if}

            <!-- Selected client confirmation card -->
            {#if ncSelectedClient}
              <div class="border border-primary rounded p-3" style="background:#f0f4ff;">
                <!-- Client info row -->
                <div class="d-flex justify-content-between align-items-start mb-3">
                  <div class="d-flex align-items-center gap-3">
                    <div class="rounded-circle d-flex align-items-center justify-content-center bg-primary text-white" style="width:44px;height:44px;font-size:20px;flex-shrink:0;">
                      <i class="ti ti-building-store"></i>
                    </div>
                    <div>
                      <div class="fw-bold" style="font-size:16px;">{ncSelectedClient.name}</div>
                      <div class="d-flex flex-wrap gap-3 mt-1">
                        {#if ncSelectedClient.gstNumber}
                          <span class="text-muted small"><i class="ti ti-file-invoice me-1"></i>GST: {ncSelectedClient.gstNumber}</span>
                        {/if}
                        {#if ncSelectedClient.mobile}
                          <span class="text-muted small"><i class="ti ti-phone me-1"></i>{ncSelectedClient.mobile}</span>
                        {/if}
                        {#if ncSelectedClient.email}
                          <span class="text-muted small"><i class="ti ti-mail me-1"></i>{ncSelectedClient.email}</span>
                        {/if}
                      </div>
                    </div>
                  </div>
                  <button type="button" class="btn btn-sm btn-outline-danger" on:click={ncClearClient}>
                    <i class="ti ti-x me-1"></i>Change
                  </button>
                </div>

                <!-- Client contacts met during visit -->
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
                        <button type="button" class="btn btn-sm btn-primary" disabled={addingContact} on:click={ncAddContact}>
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
            {/if}

            <!-- Create new client inline form -->
            {#if ncCreateMode}
              <div class="border rounded p-3 bg-light">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h6 class="mb-0 fw-semibold"><i class="ti ti-plus me-1 text-warning"></i>New Client</h6>
                  <button type="button" class="btn btn-sm btn-outline-secondary"
                    on:click={() => { ncCreateMode = false; ncClientName = ""; ncFormErrors = {}; }}>
                    <i class="ti ti-x"></i>
                  </button>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="form-label fw-semibold">Company Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" class:is-invalid={ncFormErrors.ncClientName}
                      placeholder="Company name" bind:value={ncClientName} />
                    {#if ncFormErrors.ncClientName}
                      <ul class="text-danger mt-1 text-xs"><li>{ncFormErrors.ncClientName}</li></ul>
                    {/if}
                  </div>
                  <div>
                    <label class="form-label fw-semibold">GST Number</label>
                    <input type="text" class="form-control" placeholder="GST number" bind:value={ncClientGst} />
                  </div>
                  <div>
                    <label class="form-label fw-semibold">Mobile</label>
                    <input type="text" class="form-control" placeholder="Mobile" bind:value={ncClientMobile} />
                  </div>
                  <div>
                    <label class="form-label fw-semibold">Email</label>
                    <input type="email" class="form-control" placeholder="Email" bind:value={ncClientEmail} />
                  </div>
                  <div class="col-span-2">
                    <label class="form-label fw-semibold">Address</label>
                    <input type="text" class="form-control" placeholder="Address" bind:value={ncClientAddress} />
                  </div>
                </div>
                <div class="mt-3 d-flex gap-2">
                  <button type="button" class="btn btn-warning" disabled={ncCreating} on:click={ncSaveNewClient}>
                    <i class="ti ti-check me-1"></i>{ncCreating ? "Creating..." : "Save & Select Client"}
                  </button>
                  <button type="button" class="btn btn-outline-secondary"
                    on:click={() => { ncCreateMode = false; ncClientName = ""; ncFormErrors = {}; }}>
                    Cancel
                  </button>
                </div>
              </div>
            {/if}

          </div>
        </div>

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
                <label class="form-label fw-semibold">Visit Type <span class="text-danger">*</span></label>
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
                <label class="form-label fw-semibold">Our Company <span class="text-danger">*</span></label>
                <select class="form-select" class:is-invalid={formErrors.companyId} bind:value={companyId}>
                  <option value="">— Select company —</option>
                  {#each companies as c}
                    <option value={c.id}>{c.name}</option>
                  {/each}
                </select>
                {#if formErrors.companyId}
                  <div class="invalid-feedback">{formErrors.companyId[0]}</div>
                {/if}
              </div>

              <div class="col-md-3">
                <label class="form-label fw-semibold">Visit Date <span class="text-danger">*</span></label>
                <input type="date" class="form-control" bind:value={visitDate} required />
              </div>

              <div class="col-md-3">
                <label class="form-label fw-semibold">Transport Medium</label>
                <input type="text" class="form-control" placeholder="Car, Train, Bike, Flight..." bind:value={transportMedium} />
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-md-3">
                <label class="form-label fw-semibold">Start Date &amp; Time</label>
                <input type="datetime-local" class="form-control" bind:value={startTime} />
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">End Date &amp; Time</label>
                <input type="datetime-local" class="form-control" bind:value={endTime} />
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

            <div class="row g-3 mb-3">
              <div class="col-12">
                <label class="form-label fw-semibold">Purpose of Visit <span class="text-danger">*</span></label>
                <input type="text" class="form-control" class:is-invalid={formErrors.purpose}
                  placeholder="e.g. Site survey, Machine demo, Follow-up, Requirement discussion"
                  bind:value={purpose} />
                {#if formErrors.purpose}
                  <div class="invalid-feedback">{formErrors.purpose[0]}</div>
                {/if}
              </div>
            </div>

            <!-- Attendees -->
            <div class="mb-3">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <label class="form-label fw-semibold mb-0">Our Team — Attendees</label>
                <button type="button" class="btn btn-sm btn-outline-primary" on:click={addAttendee}>
                  <i class="ti ti-plus me-1"></i>Add Employee
                </button>
              </div>
              {#if attendees.length === 0}
                <div class="text-muted small">No attendees added yet.</div>
              {:else}
                <div class="d-flex flex-wrap gap-2">
                  {#each attendees as att, i}
                    <div class="border rounded px-3 py-2 d-flex align-items-center gap-3" style="background:#f8f9fa;">
                      <select class="border-0 bg-transparent" style="font-size:14px;outline:none;min-width:160px;" bind:value={att.userId}>
                        <option value="">Select employee...</option>
                        {#each users as u}
                          <option value={u.id}>{u.name} ({u.role})</option>
                        {/each}
                      </select>
                      <label class="d-flex align-items-center gap-1 mb-0 small" style="cursor:pointer;white-space:nowrap;">
                        <input type="checkbox" bind:checked={att.isLead} style="accent-color:var(--bs-primary);" />
                        Lead
                      </label>
                      <button type="button" class="btn-close" style="font-size:10px;" on:click={() => removeAttendee(i)}></button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Feedback / Notes -->
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label fw-semibold">Client Feedback</label>
                <textarea class="form-control" rows="3" placeholder="What the client said, asked, or decided during the visit..." bind:value={clientFeedback}></textarea>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold">Internal Notes</label>
                <textarea class="form-control" rows="3" placeholder="Follow-up actions, price discussed, concerns..." bind:value={notes}></textarea>
              </div>
            </div>

          </div>
        </div>

        <!-- ═══ SECTION 2: Jobs ═══ -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between">
            <h6 class="mb-0 fw-semibold">
              <i class="ti ti-tool me-2 text-warning"></i>Job / Work-piece Requirements
              {#if jobs.length > 0}
                <span class="badge bg-warning text-dark ms-2">{jobs.length} job{jobs.length > 1 ? 's' : ''}</span>
              {/if}
            </h6>
            <button type="button" class="btn btn-sm btn-outline-warning" on:click={addJob}>
              <i class="ti ti-plus me-1"></i>Add Job
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
              <div class="table-responsive">
                <table class="table table-bordered mb-0">
                  <thead class="table-light">
                    <tr>
                      <th class="text-center" style="width:36px;">#</th>
                      <th>Work-piece / Description <span class="text-danger">*</span></th>
                      <th style="width:130px">Material</th>
                      <th style="width:100px">Quantity</th>
                      <th style="width:110px">Size / Dim.</th>
                      <th>Requirement / Specification</th>
                      <th style="width:130px">Est. Cost (₹)</th>
                      <th style="width:52px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each jobs as job, i}
                      <tr>
                        <td class="text-center text-muted align-middle">{i + 1}</td>
                        <td class="px-2 py-2">
                          <input type="text" class="form-control form-control-sm" placeholder="e.g. Casting deburring, Shot peening..." bind:value={job.description} />
                        </td>
                        <td class="px-2 py-2">
                          <input type="text" class="form-control form-control-sm" placeholder="Cast iron, Steel..." bind:value={job.material} />
                        </td>
                        <td class="px-2 py-2">
                          <input type="text" class="form-control form-control-sm" placeholder="500 pcs" bind:value={job.quantity} />
                        </td>
                        <td class="px-2 py-2">
                          <input type="text" class="form-control form-control-sm" placeholder="80–120mm" bind:value={job.size} />
                        </td>
                        <td class="px-2 py-2">
                          <textarea class="form-control form-control-sm" rows="2" placeholder="Ra value, Almen intensity, finish spec..." bind:value={job.requirement}></textarea>
                        </td>
                        <td class="px-2 py-2">
                          <div class="input-group input-group-sm">
                            <span class="input-group-text">₹</span>
                            <input type="number" class="form-control" placeholder="0" bind:value={job.cost} min="0" />
                          </div>
                        </td>
                        <td class="text-center align-middle px-2">
                          <button type="button" class="btn btn-sm btn-soft-danger" on:click={() => removeJob(i)}>
                            <i class="ti ti-trash"></i>
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>

              <div class="d-flex align-items-center justify-content-between px-3 py-2 bg-light border-top">
                <button type="button" class="btn btn-outline-warning btn-sm" on:click={addJob}>
                  <i class="ti ti-plus me-1"></i>Add Another Job
                </button>
                <span>
                  <span class="text-muted me-2 small">Total Estimate</span>
                  <span class="fw-semibold" style="font-size:16px;">₹{totalCost.toLocaleString('en-IN')}</span>
                </span>
              </div>

              <div class="px-3 py-2 border-top">
                <div class="alert alert-info py-2 mb-0 small">
                  <i class="ti ti-camera me-1"></i>
                  <strong>Images:</strong> Job images can be uploaded after saving — you'll be taken to the edit page automatically.
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Terms -->
        <div class="card border mb-4">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold">
              <i class="ti ti-file-text me-2 text-primary"></i>Terms Discussed
            </h6>
          </div>
          <div class="card-body">
            <textarea class="form-control" rows="2" placeholder="Delivery terms, advance amount, warranty, lead time discussed during the visit..." bind:value={terms}></textarea>
          </div>
        </div>

        <!-- Submit -->
        <div class="d-flex align-items-center gap-3 mb-5">
          <button type="submit" class="btn btn-primary btn-lg" disabled={loading}>
            <i class="ti ti-device-floppy me-1"></i>{loading ? "Saving..." : "Save Visit"}
          </button>
          <a href="/admin/client-visit" class="btn btn-outline-secondary">Cancel</a>
        </div>

      </form>
    {/if}

  </div>
</div>
