<script>
  import { onMount, onDestroy, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { checkAuth } from "$lib/utils/auth";
  import Loader from "$lib/components/Loader.svelte";

  // ── Visit type definitions ──────────────────────────────────────────────────
  const ADDRESS_LABELS = {
    outgoing:       "Client Site Address",
    incoming:       "Client's Origin / Home Office",
    joint:          "Meeting Location",
    job_discussion: "Client Office Address",
    job_received:   "Pickup / Sent From Address",
    sample_sent:    "Delivery Address",
  };

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
  let visitStatus = "completed";
  let companyId = "";
  let visitDate = new Date().toISOString().slice(0, 10);
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

  // ── Sidebar TOC ─────────────────────────────────────────────────────────────
  let activeSection = "cv-sec-type";
  let tocObserver = null;

  $: tocItems = [
    { id: "cv-sec-type", label: "Type", icon: "ti-category" },
    ...(visitType
      ? [
          { id: "cv-sec-client", label: "Client", icon: "ti-building-store" },
          { id: "cv-sec-details", label: "Details", icon: "ti-info-circle" },
          ...(fields?.jobs
            ? [{ id: "cv-sec-jobs", label: visitType === "sample_sent" ? "Sample" : "Jobs", icon: "ti-tool" }]
            : []),
          { id: "cv-sec-attendees", label: "Attendees", icon: "ti-users" },
          { id: "cv-sec-save", label: "Save", icon: "ti-device-floppy" },
        ]
      : []),
  ];

  function scrollToSection(id) {
    activeSection = id;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function sectionDone(id) {
    if (id === "cv-sec-type") return !!visitType;
    if (id === "cv-sec-client") return !!ncSelectedClient;
    return false;
  }

  function setupTocObserver() {
    tocObserver?.disconnect();
    if (typeof IntersectionObserver === "undefined") return;
    tocObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) activeSection = visible[0].target.id;
      },
      { rootMargin: "-15% 0px -65% 0px", threshold: 0 }
    );
    for (const item of tocItems) {
      const el = document.getElementById(item.id);
      if (el) tocObserver.observe(el);
    }
  }

  $: if (!loadingData) {
    void visitType;
    void fields?.jobs;
    tick().then(setupTocObserver);
  }

  onDestroy(() => tocObserver?.disconnect());

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
    if (!city.trim()) { formErrors.city = ["City is required."]; scrollToSection("cv-sec-details"); return; }
    if (!state.trim()) { formErrors.state = ["State is required."]; scrollToSection("cv-sec-details"); return; }
    if (!meetingTime) { formErrors.meetingTime = ["Meeting time is required."]; scrollToSection("cv-sec-details"); return; }
    if (fields?.purpose && !purpose.trim()) { formErrors.purpose = ["Purpose is required."]; return; }

    loading = true;
    try {
      const payload = {
        visitType,
        visitDate,
        meetingTime,
        status: visitStatus,
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
        addressLine: addressLine || undefined,
        city: city.trim(),
        state: state.trim(),
        pincode: pincode || undefined,
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

<div class="page-wrapper cv-add-page">
  <div class="content">

    <!-- Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
      <div class="d-flex align-items-center gap-3">
        <button type="button" class="btn btn-warning btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <h4 class="mb-0 cv-title">Log Interaction</h4>
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
      <div class="cv-layout">
        <!-- Left sticky TOC (below breadcrumb, stays while scrolling form) -->
        <aside class="cv-toc" aria-label="On this page">
          <div class="cv-toc-inner">
            <div class="cv-toc-heading">On this page</div>
            <nav class="cv-toc-nav">
              {#each tocItems as item}
                <button
                  type="button"
                  class="cv-toc-link"
                  class:active={activeSection === item.id}
                  class:done={sectionDone(item.id)}
                  on:click={() => scrollToSection(item.id)}
                >
                  <i class="ti {item.icon}"></i>
                  <span>{item.label}</span>
                  {#if sectionDone(item.id)}
                    <i class="ti ti-check cv-toc-check"></i>
                  {/if}
                </button>
              {/each}
            </nav>
            {#if !visitType}
              <div class="cv-toc-hint text-muted">Select a type to unlock the rest of the form.</div>
            {/if}
          </div>
        </aside>

        <div class="cv-main">
      <form on:submit={handleSubmit}>

        {#if errorMessage}
          <div class="alert alert-danger py-2 mb-3">{errorMessage}</div>
        {/if}

        {#if prefilledOrderId}
          <div class="alert alert-info py-2 mb-3">
            <i class="ti ti-link me-1"></i>Linked to <strong>{prefilledOrderTitle}</strong>
            <a href="/admin/order/{prefilledOrderId}" class="ms-2 cv-meta">(View Order)</a>
          </div>
        {/if}

        <!-- Mobile TOC -->
        <nav class="cv-toc-mobile" aria-label="Page sections">
          {#each tocItems as item}
            <button
              type="button"
              class="cv-toc-pill"
              class:active={activeSection === item.id}
              class:done={sectionDone(item.id)}
              on:click={() => scrollToSection(item.id)}
            >
              {item.label}
            </button>
          {/each}
        </nav>

        <!-- ═══ STEP 1: Type Selector ═══ -->
        <div id="cv-sec-type" class="card border mb-3 cv-sec">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold cv-section"><i class="ti ti-category me-2 text-primary"></i>What Happened? <span class="text-danger">*</span></h6>
          </div>
          <div class="card-body">
            <div class="row g-2">
              {#each VISIT_TYPES as t}
                <div class="col-md-4 col-6">
                  <button
                    type="button"
                    class="cv-type-btn w-100 border rounded text-start position-relative"
                    class:cv-type-btn--active={visitType === t.value}
                    style="--type-color: var(--bs-{t.color}); background:{visitType === t.value ? 'var(--bs-' + t.color + '-bg-subtle, #e8f4ff)' : '#fff'}; border-color:{visitType === t.value ? 'var(--bs-' + t.color + ')' : '#dee2e6'} !important;"
                    on:click={() => { visitType = t.value; errorMessage = ""; }}
                  >
                    {#if visitType === t.value}
                      <span class="position-absolute top-0 end-0 mt-1 me-1">
                        <i class="ti ti-circle-check text-{t.color} cv-type-check"></i>
                      </span>
                    {/if}
                    <div class="d-flex align-items-center gap-2 mb-1">
                      <i class="ti {t.icon} text-{t.color} cv-type-icon"></i>
                      <span class="fw-semibold cv-type-label">{t.label}</span>
                    </div>
                    <div class="text-muted cv-meta">{t.desc}</div>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        </div>

        {#if visitType}

        <!-- ═══ STEP 2: Client ═══ -->
        <div id="cv-sec-client" class="card border mb-3 cv-sec">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold cv-section"><i class="ti ti-building-store me-2 text-primary"></i>Client <span class="text-danger">*</span></h6>
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
                  <div class="border rounded bg-white position-absolute w-100 shadow cv-dropdown">
                    {#each ncSearchResults as client}
                      <button type="button" class="cv-dropdown-item d-block w-100 text-start px-3 py-2 border-bottom" on:click={() => ncSelectClient(client)}>
                        <div class="fw-semibold"><i class="ti ti-building-store me-1 text-primary"></i>{client.name}</div>
                        {#if client.gstNumber}<div class="text-muted cv-meta">GST: {client.gstNumber}</div>{/if}
                      </button>
                    {/each}
                  </div>
                {/if}
                {#if ncSearchDropdown && ncSearchResults.length === 0 && ncSearchQuery.length > 1}
                  <div class="border rounded bg-white position-absolute w-100 shadow px-3 py-2 cv-dropdown">
                    <div class="text-muted cv-meta mb-2">No client found for "{ncSearchQuery}"</div>
                    <button type="button" class="btn btn-sm btn-outline-primary"
                      on:click={() => { ncCreateMode = true; ncClientName = ncSearchQuery; ncSearchDropdown = false; }}>
                      <i class="ti ti-plus me-1"></i>Create New Client
                    </button>
                  </div>
                {/if}
              </div>
              <div class="text-center text-muted cv-meta my-2">— or —</div>
              <button type="button" class="btn btn-outline-warning btn-sm" on:click={() => { ncCreateMode = true; ncSearchDropdown = false; }}>
                <i class="ti ti-plus me-1"></i>Create New Client
              </button>
            {/if}

            {#if ncSelectedClient}
              <div class="border border-primary rounded p-3 cv-client-card">
                <div class="d-flex justify-content-between align-items-start mb-3">
                  <div class="d-flex align-items-center gap-3">
                    <div class="rounded-circle d-flex align-items-center justify-content-center bg-primary text-white cv-client-avatar">
                      <i class="ti ti-building-store"></i>
                    </div>
                    <div>
                      <div class="fw-bold cv-client-name">{ncSelectedClient.name}</div>
                      <div class="d-flex flex-wrap gap-3 mt-1">
                        {#if ncSelectedClient.gstNumber}<span class="text-muted cv-meta">GST: {ncSelectedClient.gstNumber}</span>{/if}
                        {#if ncSelectedClient.mobile}<span class="text-muted cv-meta"><i class="ti ti-phone me-1"></i>{ncSelectedClient.mobile}</span>{/if}
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
                        <label class="cv-chip border rounded px-2 py-1 d-flex align-items-center gap-2 {selectedContactIds.includes(cc.id) ? 'border-primary cv-chip--on' : 'border-secondary'}"
                          style="cursor:pointer;background:{selectedContactIds.includes(cc.id) ? '#dde8ff' : '#fff'};">
                          <input type="checkbox" checked={selectedContactIds.includes(cc.id)} on:change={() => toggleContact(cc.id)} style="accent-color:var(--bs-primary);width:14px;height:14px;" />
                          <span class="fw-semibold">{cc.name}</span>
                          {#if cc.designation}<span class="text-muted">— {cc.designation}</span>{/if}
                          {#if cc.mobile}<span class="text-muted cv-meta">· {cc.mobile}</span>{/if}
                        </label>
                      {/each}
                    </div>
                  {:else if !showAddContact}
                    <div class="text-muted cv-meta mb-2"><i class="ti ti-info-circle me-1"></i>No contacts on file for this client.</div>
                  {/if}
                  {#if showAddContact}
                    <div class="border rounded p-3 mt-2" style="background:#fff;">
                      <div class="fw-semibold mb-2 cv-meta">New Contact</div>
                      {#if addContactError}<div class="alert alert-danger py-1 px-2 mb-2 cv-meta">{addContactError}</div>{/if}
                      <div class="row g-2 mb-2">
                        <div class="col-md-4"><input type="text" class="form-control form-control-sm" placeholder="Full name *" bind:value={newContact.name} /></div>
                        <div class="col-md-4"><input type="text" class="form-control form-control-sm" placeholder="Designation" bind:value={newContact.designation} /></div>
                        <div class="col-md-4"><input type="text" class="form-control form-control-sm" placeholder="Mobile" bind:value={newContact.mobile} /></div>
                      </div>
                      <div class="d-flex gap-2 flex-wrap">
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
                  <h6 class="mb-0 fw-semibold cv-section"><i class="ti ti-plus me-1 text-warning"></i>New Client</h6>
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
                  <button type="button" class="btn btn-warning btn-sm" disabled={ncCreating} on:click={ncSaveNewClient}>{ncCreating ? "Creating..." : "Save & Select Client"}</button>
                  <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => { ncCreateMode = false; ncClientName = ""; ncFormErrors = {}; }}>Cancel</button>
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- ═══ STEP 3: Type-specific fields ═══ -->
        <div id="cv-sec-details" class="card border mb-3 cv-sec">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold cv-section"><i class="ti ti-info-circle me-2 text-primary"></i>Details</h6>
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

              <!-- Meeting time — always required -->
              <div class="col-md-4">
                <label class="form-label fw-semibold">Meeting Time <span class="text-danger">*</span></label>
                <input type="time" class="form-control" class:is-invalid={formErrors.meetingTime} bind:value={meetingTime} required />
                {#if formErrors.meetingTime}<div class="invalid-feedback">{formErrors.meetingTime[0]}</div>{/if}
              </div>

              <!-- Status -->
              <div class="col-md-4">
                <label class="form-label fw-semibold">Status <span class="text-danger">*</span></label>
                <select class="form-select" bind:value={visitStatus}>
                  <option value="scheduled">Scheduled (Planned)</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <!-- Transport medium -->
              {#if fields?.transport}
                <div class="col-md-4">
                  <label class="form-label fw-semibold">Transport Medium</label>
                  <input type="text" class="form-control" placeholder="Car, Train, Bike, Flight..." bind:value={transportMedium} />
                </div>
              {/if}

              <!-- Location (joint visit legacy) -->
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

            <!-- Address — shown for all types -->
            {#if visitType}
              <div class="mt-3 mb-3 px-1">
                <label class="form-label fw-semibold mb-2">
                  <i class="ti ti-map-pin me-1 text-primary"></i>{ADDRESS_LABELS[visitType] ?? "Address"}
                </label>
                <div class="row g-2">
                  <div class="col-12">
                    <input type="text" class="form-control" placeholder="Street / Area / Building" bind:value={addressLine} />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-semibold">City <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" class:is-invalid={formErrors.city} placeholder="City" bind:value={city} required />
                    {#if formErrors.city}<div class="invalid-feedback">{formErrors.city[0]}</div>{/if}
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-semibold">State <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" class:is-invalid={formErrors.state} placeholder="State" bind:value={state} required />
                    {#if formErrors.state}<div class="invalid-feedback">{formErrors.state[0]}</div>{/if}
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-semibold">Pincode</label>
                    <input type="text" class="form-control" placeholder="Pincode" bind:value={pincode} />
                  </div>
                </div>
              </div>
            {/if}

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
          <div id="cv-sec-jobs" class="card border mb-3 cv-sec">
            <div class="card-header py-2 bg-white d-flex align-items-center justify-content-between">
              <h6 class="mb-0 fw-semibold cv-section">
                <i class="ti ti-tool me-2 text-warning"></i>
                {visitType === "job_discussion" ? "Job / Work-piece Requirements" : visitType === "sample_sent" ? "Sample Details" : "Job / Material Details"}
                {#if jobs.length > 0}<span class="badge bg-warning text-dark ms-2">{jobs.length}</span>{/if}
              </h6>
              <button type="button" class="btn btn-sm btn-outline-warning" on:click={addJob}><i class="ti ti-plus me-1"></i>Add Row</button>
            </div>
            <div class="card-body p-0">
              {#if jobs.length === 0}
                <div class="text-center py-4">
                  <i class="ti ti-tool cv-empty-icon"></i>
                  <p class="text-muted mb-2 cv-meta">No items added yet.</p>
                  <button type="button" class="btn btn-outline-warning btn-sm" on:click={addJob}><i class="ti ti-plus me-1"></i>Add First Row</button>
                </div>
              {:else}
                <div class="table-responsive">
                  <table class="table table-bordered mb-0 cv-table">
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
                    <span class="text-muted me-2 cv-meta">Total Estimate</span>
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
        <div id="cv-sec-attendees" class="card border mb-3 cv-sec">
          <div class="card-header py-2 bg-white">
            <h6 class="mb-0 fw-semibold cv-section"><i class="ti ti-users me-2 text-primary"></i>Attendees</h6>
          </div>
          <div class="card-body">
            <label class="form-label fw-semibold">{fields?.ourTeamLabel ?? "Our Team"}</label>
            {#if attendees.length === 0}
              <div class="text-muted cv-meta mb-2">No team members added yet.</div>
            {:else}
              <div class="d-flex flex-wrap gap-2 mb-2">
                {#each attendees as att, i}
                  <div class="cv-attendee border rounded px-2 py-1 d-flex align-items-center gap-2">
                    <select class="cv-attendee-select border-0 bg-transparent" bind:value={att.userId}>
                      <option value="">Select employee...</option>
                      {#each users as u}<option value={u.id}>{u.name} ({u.role})</option>{/each}
                    </select>
                    <label class="d-flex align-items-center gap-1 mb-0 cv-meta" style="cursor:pointer;white-space:nowrap;">
                      <input type="checkbox" bind:checked={att.isLead} style="accent-color:var(--bs-primary);" /> Lead
                    </label>
                    <button type="button" class="btn-close cv-attendee-close" on:click={() => removeAttendee(i)}></button>
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
        <div id="cv-sec-save" class="cv-sec">
        <div class="alert alert-info py-2 mb-3">
          <i class="ti ti-receipt me-1"></i>
          <strong>Expenses</strong> can be added after saving the visit. Click <em>Save</em> to continue, then add expenses on the edit page.
        </div>

        <!-- Submit -->
        <div class="d-flex align-items-center gap-2 mb-5">
          <button type="submit" class="btn btn-primary btn-sm" disabled={loading}>
            <i class="ti ti-device-floppy me-1"></i>{loading ? "Saving..." : "Save"}
          </button>
          <a href="/admin/client-visit" class="btn btn-outline-secondary btn-sm">Cancel</a>
        </div>
        </div>

        {/if}
      </form>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .cv-add-page {
    font-size: var(--app-font-size, 0.75rem);
    line-height: var(--app-line-height, 1.45);
  }

  .cv-add-page :global(.content),
  .cv-add-page :global(.card-body),
  .cv-add-page :global(.card-header),
  .cv-add-page :global(.breadcrumb),
  .cv-add-page :global(.form-label),
  .cv-add-page :global(.form-control),
  .cv-add-page :global(.form-select),
  .cv-add-page :global(.form-control-sm),
  .cv-add-page :global(.form-select-sm),
  .cv-add-page :global(.btn),
  .cv-add-page :global(.btn-sm),
  .cv-add-page :global(.alert),
  .cv-add-page :global(.input-group-text),
  .cv-add-page :global(.invalid-feedback),
  .cv-add-page :global(table),
  .cv-add-page :global(th),
  .cv-add-page :global(td),
  .cv-add-page :global(label),
  .cv-add-page :global(input),
  .cv-add-page :global(select),
  .cv-add-page :global(textarea) {
    font-size: var(--app-font-size, 0.75rem) !important;
    line-height: var(--app-line-height, 1.45);
  }

  .cv-title {
    font-size: var(--app-font-size-xl, 1rem) !important;
    font-weight: 600;
    line-height: 1.35;
  }

  .cv-section {
    font-size: var(--app-font-size-md, 0.8125rem) !important;
    font-weight: 600;
    line-height: 1.35;
  }

  .cv-meta {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
    line-height: var(--app-line-height, 1.45);
  }

  .cv-type-btn {
    padding: 0.65rem 0.75rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    font-size: var(--app-font-size, 0.75rem);
  }

  .cv-type-label {
    font-size: var(--app-font-size, 0.75rem) !important;
  }

  .cv-type-icon {
    font-size: 1rem !important;
  }

  .cv-type-check {
    font-size: 0.875rem !important;
  }

  .cv-dropdown {
    z-index: 9999;
    max-height: 220px;
    overflow-y: auto;
    top: 100%;
  }

  .cv-dropdown-item {
    background: none;
    border: 0;
    font-size: var(--app-font-size, 0.75rem);
  }

  .cv-dropdown-item:hover {
    background: #f1f3f5;
  }

  .cv-client-card {
    background: #f0f4ff;
  }

  .cv-client-avatar {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    font-size: 1rem;
  }

  .cv-client-name {
    font-size: var(--app-font-size-lg, 0.875rem) !important;
  }

  .cv-chip {
    font-size: var(--app-font-size, 0.75rem) !important;
  }

  .cv-table :global(th),
  .cv-table :global(td) {
    font-size: var(--app-font-size, 0.75rem) !important;
    vertical-align: middle;
  }

  .cv-empty-icon {
    font-size: 1.75rem !important;
    color: #dee2e6;
    display: block;
    margin-bottom: 6px;
  }

  .cv-attendee {
    background: #f8f9fa;
  }

  .cv-attendee-select {
    font-size: var(--app-font-size, 0.75rem) !important;
    outline: none;
    min-width: 160px;
  }

  .cv-attendee-close {
    font-size: 0.625rem !important;
  }

  .cv-add-page :global(.badge) {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
  }

  .cv-add-page :global(.small) {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
  }

  /* ── Layout + left sticky TOC (below breadcrumb) ─────────── */
  .cv-layout {
    display: block;
  }

  .cv-main {
    min-width: 0;
  }

  .cv-sec {
    scroll-margin-top: 80px;
  }

  .cv-toc {
    display: none;
  }

  @media (min-width: 992px) {
    .cv-layout {
      display: flex;
      align-items: flex-start;
      gap: 1.25rem;
    }

    .cv-toc {
      display: block;
      position: sticky;
      top: 16px;
      width: 200px;
      flex-shrink: 0;
      align-self: flex-start;
      z-index: 5;
    }

    .cv-main {
      flex: 1;
      min-width: 0;
      margin-left: 0;
    }
  }

  .cv-toc-inner {
    border: 1px solid #e9ecef;
    border-radius: 10px;
    background: #fff;
    padding: 14px 12px;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  .cv-toc-heading {
    font-size: 0.75rem !important;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #868e96;
    padding: 0 8px 10px;
    margin-bottom: 6px;
    border-bottom: 1px solid #f1f3f5;
  }

  .cv-toc-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cv-toc-link {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 0;
    background: transparent;
    text-align: left;
    padding: 10px 10px;
    border-radius: 8px;
    font-size: 0.8125rem !important;
    color: #495057;
    line-height: 1.35;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .cv-toc-link i:first-child {
    font-size: 1.05rem;
    color: #adb5bd;
    flex-shrink: 0;
  }

  .cv-toc-link span {
    flex: 1;
    min-width: 0;
    font-weight: 500;
  }

  .cv-toc-link:hover {
    background: #f8f9fa;
    color: #212529;
  }

  .cv-toc-link.active {
    background: #e7f1ff;
    color: #0d6efd;
    font-weight: 600;
  }

  .cv-toc-link.active i:first-child {
    color: #0d6efd;
  }

  .cv-toc-link.done:not(.active) {
    color: #2b8a3e;
  }

  .cv-toc-check {
    font-size: 0.875rem !important;
    color: #2b8a3e;
    margin-left: auto;
  }

  .cv-toc-hint {
    font-size: 0.75rem !important;
    padding: 10px 8px 2px;
    line-height: 1.4;
  }

  /* Mobile horizontal TOC */
  .cv-toc-mobile {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 10px;
    margin-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }

  @media (min-width: 992px) {
    .cv-toc-mobile {
      display: none;
    }
  }

  .cv-toc-pill {
    flex-shrink: 0;
    border: 1px solid #dee2e6;
    background: #fff;
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 0.75rem !important;
    color: #495057;
    cursor: pointer;
    white-space: nowrap;
  }

  .cv-toc-pill.active {
    border-color: #0d6efd;
    background: #e7f1ff;
    color: #0d6efd;
    font-weight: 600;
  }

  .cv-toc-pill.done:not(.active) {
    border-color: #b2f2bb;
    color: #2b8a3e;
  }
</style>
