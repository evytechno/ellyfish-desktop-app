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

  // ── Visit type definitions ──────────────────────────────────────────────────
  const VISIT_TYPES = [
    { value: "incoming",       icon: "ti-building-store",  label: "They Came To Us",          color: "primary",   desc: "Client visited your company" },
    { value: "outgoing",       icon: "ti-car",             label: "We Visited Client",         color: "warning",   desc: "Your team went to client site" },
    { value: "joint",          icon: "ti-users",           label: "Joint Site Visit",          color: "info",      desc: "Together at a third location" },
    { value: "job_discussion", icon: "ti-clipboard-list",  label: "Client Gave Job Details",   color: "success",   desc: "Client came and discussed job requirements" },
    { value: "job_received",   icon: "ti-package",         label: "Job Received",              color: "secondary", desc: "Client sent material/job to us" },
    { value: "sample_sent",    icon: "ti-send",            label: "Sample Sent",               color: "danger",    desc: "You sent a sample to client" },
  ];

  // Which field sections each type shows
  const TYPE_FIELDS = {
    incoming:       { transport: false, location: false, startEnd: true,  outcome: true,  purpose: true,  feedback: true,  terms: false, jobs: true, nextFollowUp: true,  ourTeamLabel: "Our Team Who Received",  clientLabel: "Client Contacts Who Came",    ourTeamRequired: false, clientRequired: false },
    outgoing:       { transport: true,  location: false, startEnd: true,  outcome: true,  purpose: true,  feedback: true,  terms: true,  jobs: true, nextFollowUp: true,  ourTeamLabel: "Who Went From Our Side", clientLabel: "Client Contacts Met",         ourTeamRequired: true,  clientRequired: false },
    joint:          { transport: true,  location: true,  startEnd: true,  outcome: true,  purpose: true,  feedback: false, terms: false, jobs: true, nextFollowUp: true,  ourTeamLabel: "Our Team",               clientLabel: "Client Contacts",             ourTeamRequired: true,  clientRequired: false },
    job_discussion: { transport: false, location: false, startEnd: false, outcome: false, purpose: false, feedback: false, terms: true,  jobs: true,  nextFollowUp: true,  ourTeamLabel: "Our Team Present",       clientLabel: "Client Contacts Who Came",    ourTeamRequired: false, clientRequired: false },
    job_received:   { transport: false, location: false, startEnd: false, outcome: false, purpose: false, feedback: false, terms: false, jobs: true,  nextFollowUp: false, ourTeamLabel: "Received By",            clientLabel: "Sent By (Client Contact)",    ourTeamRequired: false, clientRequired: false },
    sample_sent:    { transport: false, location: false, startEnd: false, outcome: false, purpose: false, feedback: false, terms: false, jobs: true,  nextFollowUp: true,  ourTeamLabel: "Sent By",                clientLabel: "Sent To (Client Contact)",    ourTeamRequired: false, clientRequired: false },
  };

  const EXPENSE_CATEGORIES = [
    { value: "travel",        label: "Travel / Fuel" },
    { value: "food",          label: "Food / Meals" },
    { value: "accommodation", label: "Accommodation" },
    { value: "courier",       label: "Courier / Shipping" },
    { value: "toll_parking",  label: "Toll / Parking" },
    { value: "gift",          label: "Gift / Entertainment" },
    { value: "misc",          label: "Miscellaneous" },
  ];

  let currentUser = null;
  let loadingData = true;
  let loading = false;
  let errorMessage = "";
  let formErrors = {};

  let prefilledOrderId = null;
  let prefilledOrderTitle = "";

  let companies = [];
  let users = [];

  // ── Visit fields ────────────────────────────────────────────────────────────
  let visitType = "";
  let companyId = "";
  let visitDate = new Date().toISOString().slice(0, 10);
  let startTime = "";
  let endTime = "";
  let transportMedium = "";
  let location = "";
  let purpose = "";
  let outcome = "";
  let nextFollowUpDate = "";
  let clientFeedback = "";
  let notes = "";
  let terms = "";

  // ── Client search/create ────────────────────────────────────────────────────
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

  // ── Client contacts ─────────────────────────────────────────────────────────
  let clientContacts = [];
  let selectedContactIds = [];
  let showAddContact = false;
  let newContact = { name: "", designation: "", mobile: "" };
  let addingContact = false;
  let addContactError = "";

  // ── Attendees ───────────────────────────────────────────────────────────────
  let attendees = [];

  // ── Jobs ────────────────────────────────────────────────────────────────────
  let jobs = [];
  $: totalCost = jobs.reduce((s, j) => s + (parseFloat(j.cost) || 0), 0);

  // ── Expenses ────────────────────────────────────────────────────────────────
  let expenses = [];
  $: totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  $: fields = TYPE_FIELDS[visitType] || null;

  onMount(async () => {
    currentUser = checkAuth();
    try {
      const [compData, userData] = await Promise.all([
        authApiFetch(API_ROUTES.COMPANY + "/all"),
        authApiFetch(API_ROUTES.USER + "/all"),
      ]);
      companies = compData || [];
      users = userData || [];
      if (currentUser?.id) {
        attendees = [{ userId: Number(currentUser.id), isLead: true }];
      }
      if (currentUser?.companyId) {
        const match = companies.find((c) => c.id === Number(currentUser.companyId));
        if (match) companyId = String(match.id);
      }

      const urlOrderId = $page.url.searchParams.get("orderId");
      const urlClientId = $page.url.searchParams.get("clientId");
      const urlType = $page.url.searchParams.get("type");
      if (urlType && TYPE_FIELDS[urlType]) visitType = urlType;

      if (urlOrderId) {
        try {
          const orderRes = await authApiFetch(`${API_ROUTES.ORDER}/${urlOrderId}/basic`);
          const ord = orderRes?.data ?? orderRes;
          prefilledOrderId = Number(urlOrderId);
          prefilledOrderTitle = ord?.title || `Order #${urlOrderId}`;
          if (ord?.client) await ncSelectClient(ord.client);
          else if (urlClientId) {
            const cl = (await authApiFetch(`${API_ROUTES.CLIENT}/${urlClientId}`))?.data;
            if (cl) await ncSelectClient(cl);
          }
        } catch (_) {}
      } else if (urlClientId) {
        try {
          const cl = (await authApiFetch(`${API_ROUTES.CLIENT}/${urlClientId}`))?.data;
          if (cl) await ncSelectClient(cl);
        } catch (_) {}
      }
    } catch (_) {
      errorMessage = "Failed to load data.";
    } finally {
      loadingData = false;
    }
  });

  // ── Client search ────────────────────────────────────────────────────────────
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
    clientContacts = [];
    selectedContactIds = [];
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
    clientContacts = [];
    selectedContactIds = [];
  }

  async function ncSaveNewClient() {
    ncFormErrors = {};
    if (!ncClientName.trim()) { ncFormErrors.ncClientName = "Company name is required."; return; }
    ncCreating = true;
    try {
      const res = await authApiFetch(API_ROUTES.CLIENT, {
        method: "POST",
        data: { name: ncClientName.trim(), gstNumber: ncClientGst || undefined, mobile: ncClientMobile || undefined, email: ncClientEmail || undefined, address: ncClientAddress || undefined },
      });
      await ncSelectClient(res?.data ?? res);
      ncCreateMode = false;
      ncClientName = ""; ncClientGst = ""; ncClientMobile = ""; ncClientEmail = ""; ncClientAddress = "";
    } catch (err) {
      const e = errorHandle(err);
      ncFormErrors = typeof e === "object" ? e : { ncClientName: "Failed to create client." };
    } finally { ncCreating = false; }
  }

  async function ncAddContact(keepOpen = false) {
    addContactError = "";
    if (!newContact.name.trim()) { addContactError = "Contact name is required."; return; }
    addingContact = true;
    try {
      const res = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: { clientId: ncSelectedClient.id, name: newContact.name.trim(), designation: newContact.designation || undefined, mobile: newContact.mobile || undefined },
      });
      const saved = res?.data ?? res;
      clientContacts = [...clientContacts, saved];
      selectedContactIds = [...selectedContactIds, saved.id];
      newContact = { name: "", designation: "", mobile: "" };
      if (!keepOpen) showAddContact = false;
    } catch (_) { addContactError = "Failed to save contact."; }
    finally { addingContact = false; }
  }

  function toggleContact(id) {
    selectedContactIds = selectedContactIds.includes(id)
      ? selectedContactIds.filter((x) => x !== id)
      : [...selectedContactIds, id];
  }

  // ── Attendees ────────────────────────────────────────────────────────────────
  function addAttendee() { attendees = [...attendees, { userId: "", isLead: false }]; }
  function removeAttendee(i) { attendees = attendees.filter((_, idx) => idx !== i); }

  // ── Jobs ─────────────────────────────────────────────────────────────────────
  function addJob() { jobs = [...jobs, { description: "", material: "", quantity: "", size: "", requirement: "", cost: "" }]; }
  function removeJob(i) { jobs = jobs.filter((_, idx) => idx !== i); }

  // ── Expenses ─────────────────────────────────────────────────────────────────
  function addExpense() { expenses = [...expenses, { category: "travel", amount: "", paidBy: "self", receiptNo: "", notes: "" }]; }
  function removeExpense(i) { expenses = expenses.filter((_, idx) => idx !== i); }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    formErrors = {};
    errorMessage = "";

    if (!visitType) { errorMessage = "Please select an interaction type."; return; }
    if (!ncSelectedClient) { errorMessage = "Please select or create a client."; return; }
    if (!companyId) { formErrors.companyId = ["Our company is required."]; return; }
    if (fields?.purpose && !purpose.trim()) { formErrors.purpose = ["Purpose is required."]; return; }

    loading = true;
    try {
      const payload = {
        visitType,
        visitDate,
        companyId: Number(companyId),
        clientId: ncSelectedClient.id,
        orderId: prefilledOrderId || undefined,
        clientContactIds: selectedContactIds,
        purpose: purpose.trim() || undefined,
        outcome: outcome || undefined,
        nextFollowUpDate: nextFollowUpDate || undefined,
        clientFeedback: clientFeedback || undefined,
        notes: notes || undefined,
        terms: terms || undefined,
        transportMedium: transportMedium || undefined,
        location: location || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        attendees: attendees.filter((a) => a.userId).map((a) => ({ userId: Number(a.userId), isLead: a.isLead })),
      };

      const res = await authApiFetch(API_ROUTES.CLIENT_VISIT, { method: "POST", data: payload });
      const newVisitId = res.data?.id ?? res?.id;

      // Create jobs separately (need visitId for image uploads later)
      for (const j of jobs.filter((j) => j.description)) {
        await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${newVisitId}/jobs`, {
          method: "POST",
          data: { description: j.description, material: j.material, quantity: j.quantity, size: j.size, requirement: j.requirement, cost: j.cost || 0 },
        });
      }

      Swal.fire({ icon: "success", title: "Saved!", timer: 1800, showConfirmButton: false });
      setTimeout(() => goto(`/admin/client-visit/edit/${newVisitId}`), 1800);
    } catch (err) {
      const errs = errorHandle(err);
      if (errs && typeof errs === "object") formErrors = errs;
      else errorMessage = "An unexpected error occurred.";
    } finally { loading = false; }
  }
</script>

<div class="page-wrapper">
  <div class="content">

    <!-- Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div class="d-flex align-items-center gap-3">
        <button type="button" class="btn btn-warning btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <h4 class="mb-0">Log Interaction</h4>
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
          <div class="alert alert-info py-2 mb-3">
            <i class="ti ti-link me-1"></i>Linked to <strong>{prefilledOrderTitle}</strong>
            <a href="/admin/order/{prefilledOrderId}" class="ms-2 small">(View Order)</a>
          </div>
        {/if}

        <!-- ═══ STEP 1: Type Selector ═══ -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-category me-2 text-primary"></i>What Happened? <span class="text-danger">*</span></h6>
          </div>
          <div class="card-body">
            <div class="row g-2">
              {#each VISIT_TYPES as t}
                <div class="col-md-4 col-6">
                  <button
                    type="button"
                    class="w-100 border rounded p-3 text-start position-relative"
                    style="cursor:pointer; background:{visitType === t.value ? 'var(--bs-' + t.color + '-bg-subtle, #e8f4ff)' : '#fff'}; border-color:{visitType === t.value ? 'var(--bs-' + t.color + ')' : '#dee2e6'} !important; transition: all .15s;"
                    on:click={() => { visitType = t.value; errorMessage = ""; }}
                  >
                    {#if visitType === t.value}
                      <span class="position-absolute top-0 end-0 mt-1 me-1">
                        <i class="ti ti-circle-check text-{t.color}" style="font-size:16px;"></i>
                      </span>
                    {/if}
                    <div class="d-flex align-items-center gap-2 mb-1">
                      <i class="ti {t.icon} text-{t.color}" style="font-size:20px;"></i>
                      <span class="fw-semibold" style="font-size:13px;">{t.label}</span>
                    </div>
                    <div class="text-muted" style="font-size:11px;">{t.desc}</div>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        </div>

        {#if visitType}

        <!-- ═══ STEP 2: Client ═══ -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-building-store me-2 text-primary"></i>Client <span class="text-danger">*</span></h6>
          </div>
          <div class="card-body">

            {#if !ncSelectedClient && !ncCreateMode}
              <div class="mb-3 position-relative">
                <label class="form-label fw-semibold">Search Client</label>
                <div class="input-group">
                  <input type="text" class="form-control" placeholder="Search by name, mobile, email..."
                    bind:value={ncSearchQuery} on:input={ncOnSearchInput} autocomplete="off" />
                  {#if ncSearchLoading}
                    <span class="input-group-text"><span class="spinner-border spinner-border-sm"></span></span>
                  {/if}
                </div>
                {#if ncSearchDropdown && ncSearchResults.length > 0}
                  <div class="border rounded bg-white position-absolute w-100 shadow" style="z-index:9999;max-height:220px;overflow-y:auto;top:100%;">
                    {#each ncSearchResults as client}
                      <button type="button" class="d-block w-100 text-start px-3 py-2 border-bottom" style="background:none;" on:click={() => ncSelectClient(client)}>
                        <div class="fw-semibold"><i class="ti ti-building-store me-1 text-primary"></i>{client.name}</div>
                        {#if client.gstNumber}<div class="text-muted small">GST: {client.gstNumber}</div>{/if}
                      </button>
                    {/each}
                  </div>
                {/if}
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
              <div class="text-center text-muted small my-2">— or —</div>
              <button type="button" class="btn btn-outline-warning btn-sm" on:click={() => { ncCreateMode = true; ncSearchDropdown = false; }}>
                <i class="ti ti-plus me-1"></i>Create New Client
              </button>
            {/if}

            {#if ncSelectedClient}
              <div class="border border-primary rounded p-3" style="background:#f0f4ff;">
                <div class="d-flex justify-content-between align-items-start mb-3">
                  <div class="d-flex align-items-center gap-3">
                    <div class="rounded-circle d-flex align-items-center justify-content-center bg-primary text-white" style="width:44px;height:44px;flex-shrink:0;">
                      <i class="ti ti-building-store" style="font-size:20px;"></i>
                    </div>
                    <div>
                      <div class="fw-bold" style="font-size:16px;">{ncSelectedClient.name}</div>
                      <div class="d-flex flex-wrap gap-3 mt-1">
                        {#if ncSelectedClient.gstNumber}<span class="text-muted small">GST: {ncSelectedClient.gstNumber}</span>{/if}
                        {#if ncSelectedClient.mobile}<span class="text-muted small"><i class="ti ti-phone me-1"></i>{ncSelectedClient.mobile}</span>{/if}
                      </div>
                    </div>
                  </div>
                  <button type="button" class="btn btn-sm btn-outline-danger" on:click={ncClearClient}>
                    <i class="ti ti-x me-1"></i>Change
                  </button>
                </div>

                <!-- Client contacts -->
                <div class="border-top pt-3">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <label class="form-label fw-semibold mb-0">
                      <i class="ti ti-users me-1 text-primary"></i>{fields?.clientLabel ?? "Client Contacts"}
                    </label>
                    {#if !showAddContact}
                      <button type="button" class="btn btn-sm btn-outline-primary" on:click={() => { showAddContact = true; addContactError = ""; }}>
                        <i class="ti ti-plus me-1"></i>Add Contact
                      </button>
                    {/if}
                  </div>
                  {#if clientContacts.length > 0}
                    <div class="d-flex flex-wrap gap-2 mb-2">
                      {#each clientContacts as cc}
                        <label class="border rounded px-3 py-2 d-flex align-items-center gap-2 {selectedContactIds.includes(cc.id) ? 'border-primary' : 'border-secondary'}"
                          style="cursor:pointer;font-size:14px;background:{selectedContactIds.includes(cc.id) ? '#dde8ff' : '#fff'};">
                          <input type="checkbox" checked={selectedContactIds.includes(cc.id)} on:change={() => toggleContact(cc.id)} style="accent-color:var(--bs-primary);width:15px;height:15px;" />
                          <span class="fw-semibold">{cc.name}</span>
                          {#if cc.designation}<span class="text-muted">— {cc.designation}</span>{/if}
                          {#if cc.mobile}<span class="text-muted small">· {cc.mobile}</span>{/if}
                        </label>
                      {/each}
                    </div>
                  {:else if !showAddContact}
                    <div class="text-muted small mb-2"><i class="ti ti-info-circle me-1"></i>No contacts on file for this client.</div>
                  {/if}
                  {#if showAddContact}
                    <div class="border rounded p-3 mt-2" style="background:#fff;">
                      <div class="fw-semibold mb-2 small">New Contact</div>
                      {#if addContactError}<div class="alert alert-danger py-1 px-2 mb-2 small">{addContactError}</div>{/if}
                      <div class="row g-2 mb-2">
                        <div class="col-md-4"><input type="text" class="form-control form-control-sm" placeholder="Full name *" bind:value={newContact.name} /></div>
                        <div class="col-md-4"><input type="text" class="form-control form-control-sm" placeholder="Designation" bind:value={newContact.designation} /></div>
                        <div class="col-md-4"><input type="text" class="form-control form-control-sm" placeholder="Mobile" bind:value={newContact.mobile} /></div>
                      </div>
                      <div class="d-flex gap-2">
                        <button type="button" class="btn btn-sm btn-outline-primary" disabled={addingContact} on:click={() => ncAddContact(true)}>{addingContact ? "Saving..." : "Save & Add More"}</button>
                        <button type="button" class="btn btn-sm btn-primary" disabled={addingContact} on:click={() => ncAddContact(false)}><i class="ti ti-check me-1"></i>{addingContact ? "Saving..." : "Save & Select"}</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => { showAddContact = false; newContact = { name: "", designation: "", mobile: "" }; }}>Cancel</button>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if ncCreateMode}
              <div class="border rounded p-3 bg-light">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h6 class="mb-0 fw-semibold"><i class="ti ti-plus me-1 text-warning"></i>New Client</h6>
                  <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => { ncCreateMode = false; ncClientName = ""; ncFormErrors = {}; }}><i class="ti ti-x"></i></button>
                </div>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label fw-semibold">Company Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" class:is-invalid={ncFormErrors.ncClientName} placeholder="Company name" bind:value={ncClientName} />
                    {#if ncFormErrors.ncClientName}<div class="invalid-feedback">{ncFormErrors.ncClientName}</div>{/if}
                  </div>
                  <div class="col-md-6"><label class="form-label fw-semibold">GST Number</label><input type="text" class="form-control" placeholder="GST" bind:value={ncClientGst} /></div>
                  <div class="col-md-6"><label class="form-label fw-semibold">Mobile</label><input type="text" class="form-control" placeholder="Mobile" bind:value={ncClientMobile} /></div>
                  <div class="col-md-6"><label class="form-label fw-semibold">Email</label><input type="email" class="form-control" placeholder="Email" bind:value={ncClientEmail} /></div>
                  <div class="col-12"><label class="form-label fw-semibold">Address</label><input type="text" class="form-control" placeholder="Address" bind:value={ncClientAddress} /></div>
                </div>
                <div class="mt-3 d-flex gap-2">
                  <button type="button" class="btn btn-warning" disabled={ncCreating} on:click={ncSaveNewClient}>{ncCreating ? "Creating..." : "Save & Select Client"}</button>
                  <button type="button" class="btn btn-outline-secondary" on:click={() => { ncCreateMode = false; ncClientName = ""; ncFormErrors = {}; }}>Cancel</button>
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- ═══ STEP 3: Type-specific fields ═══ -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-info-circle me-2 text-primary"></i>Details</h6>
          </div>
          <div class="card-body">

            <div class="row g-3 mb-3">
              <!-- Our Company — always shown -->
              <div class="col-md-4">
                <label class="form-label fw-semibold">Our Company <span class="text-danger">*</span></label>
                <select class="form-select" class:is-invalid={formErrors.companyId} bind:value={companyId}>
                  <option value="">— Select —</option>
                  {#each companies as c}<option value={c.id}>{c.name}</option>{/each}
                </select>
                {#if formErrors.companyId}<div class="invalid-feedback">{formErrors.companyId[0]}</div>{/if}
              </div>

              <!-- Date — always shown, label changes -->
              <div class="col-md-4">
                <label class="form-label fw-semibold">
                  {visitType === "job_received" ? "Date Received" : visitType === "sample_sent" ? "Date Sent" : "Visit Date"}
                  <span class="text-danger">*</span>
                </label>
                <input type="date" class="form-control" bind:value={visitDate} required />
              </div>

              <!-- Transport medium -->
              {#if fields?.transport}
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Transport Medium</label>
                  <input type="text" class="form-control" placeholder="Car, Train, Bike, Flight..." bind:value={transportMedium} />
                </div>
              {/if}

              <!-- Location (joint visit) -->
              {#if fields?.location}
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Visit Location / Site <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" placeholder="Address or site name..." bind:value={location} />
                </div>
              {/if}

              <!-- Start / End time -->
              {#if fields?.startEnd}
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Start Time</label>
                  <input type="datetime-local" class="form-control" bind:value={startTime} />
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-semibold">End Time</label>
                  <input type="datetime-local" class="form-control" bind:value={endTime} />
                </div>
              {/if}
            </div>

            <!-- Purpose -->
            {#if fields?.purpose}
              <div class="mb-3">
                <label class="form-label fw-semibold">Purpose of Visit <span class="text-danger">*</span></label>
                <input type="text" class="form-control" class:is-invalid={formErrors.purpose}
                  placeholder="e.g. Site survey, Machine demo, Follow-up, Requirement discussion"
                  bind:value={purpose} />
                {#if formErrors.purpose}<div class="invalid-feedback">{formErrors.purpose[0]}</div>{/if}
              </div>
            {/if}

            <div class="row g-3">
              <!-- Outcome -->
              {#if fields?.outcome}
                <div class="col-md-4">
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

              <!-- Next follow-up -->
              {#if fields?.nextFollowUp}
                <div class="col-md-4">
                  <label class="form-label fw-semibold">
                    {visitType === "sample_sent" ? "Expected Feedback Date" : "Next Follow-up Date"}
                  </label>
                  <input type="date" class="form-control" bind:value={nextFollowUpDate} />
                </div>
              {/if}

              <!-- Client feedback -->
              {#if fields?.feedback}
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Client Feedback</label>
                  <input type="text" class="form-control" placeholder="What the client said or decided..." bind:value={clientFeedback} />
                </div>
              {/if}
            </div>

            {#if notes !== undefined}
              <div class="mt-3">
                <label class="form-label fw-semibold">Internal Notes</label>
                <textarea class="form-control" rows="2" placeholder="Follow-up actions, price discussed, concerns..." bind:value={notes}></textarea>
              </div>
            {/if}

            <!-- Terms -->
            {#if fields?.terms}
              <div class="mt-3">
                <label class="form-label fw-semibold">Terms Discussed</label>
                <textarea class="form-control" rows="2" placeholder="Delivery terms, advance, warranty, lead time..." bind:value={terms}></textarea>
              </div>
            {/if}
          </div>
        </div>

        <!-- ═══ Jobs section (type-specific) ═══ -->
        {#if fields?.jobs}
          <div class="card border mb-3">
            <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between">
              <h6 class="mb-0 fw-semibold">
                <i class="ti ti-tool me-2 text-warning"></i>
                {visitType === "job_discussion" ? "Job / Work-piece Requirements" : visitType === "sample_sent" ? "Sample Details" : "Job / Material Details"}
                {#if jobs.length > 0}<span class="badge bg-warning text-dark ms-2">{jobs.length}</span>{/if}
              </h6>
              <button type="button" class="btn btn-sm btn-outline-warning" on:click={addJob}><i class="ti ti-plus me-1"></i>Add Row</button>
            </div>
            <div class="card-body p-0">
              {#if jobs.length === 0}
                <div class="text-center py-4">
                  <i class="ti ti-tool" style="font-size:36px;color:#dee2e6;display:block;margin-bottom:6px;"></i>
                  <p class="text-muted mb-2 small">No items added yet.</p>
                  <button type="button" class="btn btn-outline-warning btn-sm" on:click={addJob}><i class="ti ti-plus me-1"></i>Add First Row</button>
                </div>
              {:else}
                <div class="table-responsive">
                  <table class="table table-bordered mb-0">
                    <thead class="table-light">
                      <tr>
                        <th class="text-center" style="width:36px;">#</th>
                        <th>Description <span class="text-danger">*</span></th>
                        <th style="width:120px">Material</th>
                        <th style="width:90px">Qty</th>
                        <th style="width:100px">Size</th>
                        {#if visitType === "job_discussion"}<th>Specification</th><th style="width:120px">Est. Cost (₹)</th>{/if}
                        <th style="width:42px"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each jobs as job, i}
                        <tr>
                          <td class="text-center text-muted align-middle">{i + 1}</td>
                          <td class="px-2 py-1"><input type="text" class="form-control form-control-sm" bind:value={job.description} /></td>
                          <td class="px-2 py-1"><input type="text" class="form-control form-control-sm" bind:value={job.material} /></td>
                          <td class="px-2 py-1"><input type="text" class="form-control form-control-sm" bind:value={job.quantity} /></td>
                          <td class="px-2 py-1"><input type="text" class="form-control form-control-sm" bind:value={job.size} /></td>
                          {#if visitType === "job_discussion"}
                            <td class="px-2 py-1"><textarea class="form-control form-control-sm" rows="2" bind:value={job.requirement}></textarea></td>
                            <td class="px-2 py-1"><div class="input-group input-group-sm"><span class="input-group-text">₹</span><input type="number" class="form-control" bind:value={job.cost} min="0" /></div></td>
                          {/if}
                          <td class="text-center align-middle px-1">
                            <button type="button" class="btn btn-sm btn-outline-danger" on:click={() => removeJob(i)}><i class="ti ti-trash"></i></button>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
                {#if visitType === "job_discussion" && totalCost > 0}
                  <div class="d-flex justify-content-end px-3 py-2 bg-light border-top">
                    <span class="text-muted me-2 small">Total Estimate</span>
                    <span class="fw-semibold">₹{totalCost.toLocaleString("en-IN")}</span>
                  </div>
                {/if}
                <div class="px-3 py-2 border-top">
                  <button type="button" class="btn btn-outline-warning btn-sm" on:click={addJob}><i class="ti ti-plus me-1"></i>Add Another Row</button>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- ═══ STEP 4: Attendees — always shown ═══ -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold"><i class="ti ti-users me-2 text-primary"></i>Attendees</h6>
          </div>
          <div class="card-body">
            <label class="form-label fw-semibold">{fields?.ourTeamLabel ?? "Our Team"}</label>
            {#if attendees.length === 0}
              <div class="text-muted small mb-2">No team members added yet.</div>
            {:else}
              <div class="d-flex flex-wrap gap-2 mb-2">
                {#each attendees as att, i}
                  <div class="border rounded px-3 py-2 d-flex align-items-center gap-3" style="background:#f8f9fa;">
                    <select class="border-0 bg-transparent" style="font-size:14px;outline:none;min-width:160px;" bind:value={att.userId}>
                      <option value="">Select employee...</option>
                      {#each users as u}<option value={u.id}>{u.name} ({u.role})</option>{/each}
                    </select>
                    <label class="d-flex align-items-center gap-1 mb-0 small" style="cursor:pointer;white-space:nowrap;">
                      <input type="checkbox" bind:checked={att.isLead} style="accent-color:var(--bs-primary);" /> Lead
                    </label>
                    <button type="button" class="btn-close" style="font-size:10px;" on:click={() => removeAttendee(i)}></button>
                  </div>
                {/each}
              </div>
            {/if}
            <button type="button" class="btn btn-sm btn-outline-primary" on:click={addAttendee}>
              <i class="ti ti-plus me-1"></i>Add Employee
            </button>
          </div>
        </div>

        <!-- ═══ STEP 5: Expenses note ═══ -->
        <div class="alert alert-info py-2 mb-3">
          <i class="ti ti-receipt me-1"></i>
          <strong>Expenses</strong> can be added after saving the visit. Click <em>Save</em> to continue, then add expenses on the edit page.
        </div>

        <!-- Submit -->
        <div class="d-flex align-items-center gap-3 mb-5">
          <button type="submit" class="btn btn-primary btn-lg" disabled={loading}>
            <i class="ti ti-device-floppy me-1"></i>{loading ? "Saving..." : "Save"}
          </button>
          <a href="/admin/client-visit" class="btn btn-outline-secondary">Cancel</a>
        </div>

        {/if}
      </form>
    {/if}
  </div>
</div>
