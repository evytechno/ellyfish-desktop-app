<script>
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Swal from "sweetalert2";

  export let order;
  export let addActivityToGroupedActivities;

  // Modal visibility — bind: from parent
  export let showChangeClientModal = false;
  export let showNewClientModal = false;
  export let showAddContactModal = false;
  export let showEditClientModal = false;

  // ── Edit Client ────────────────────────────────────────────────────────────
  let editClientData = { name: "", email: "", mobile: "", whatsapp: "", address: "", gstNumber: "", remark: "" };
  let savingClient = false;
  let editClientErrors = {};

  // Pre-fill from order.client when modal opens
  let _prevShowEdit = false;
  $: if (showEditClientModal && !_prevShowEdit && order?.client) {
    const c = order.client;
    editClientData = {
      name:      c.name      ?? "",
      email:     c.email     ?? "",
      mobile:    c.mobile    ?? "",
      whatsapp:  c.whatsapp  ?? "",
      address:   c.address   ?? "",
      gstNumber: c.gstNumber ?? "",
      remark:    c.remark    ?? "",
    };
    editClientErrors = {};
    _prevShowEdit = true;
  }
  $: if (!showEditClientModal) _prevShowEdit = false;

  async function saveEditClient() {
    if (!editClientData.name?.trim()) {
      editClientErrors = { name: "Client name is required." };
      return;
    }
    savingClient = true;
    editClientErrors = {};
    try {
      await authApiFetch(`${API_ROUTES.CLIENT}/${order.client.id}`, {
        method: "PUT",
        data: JSON.stringify(editClientData),
      });
      order = { ...order, client: { ...order.client, ...editClientData } };
      showEditClientModal = false;
    } catch (e) {
      const errs = e?.data?.message;
      if (typeof errs === "object") editClientErrors = errs;
      else editClientErrors = { name: errs ?? "Failed to update client." };
    } finally {
      savingClient = false;
    }
  }

  // ── Change / Link Client ───────────────────────────────────────────────────
  let changeClientQuery = "";
  let changeClientResults = [];
  let changeClientLoading = false;
  let changeClientTimer = null;
  let changeClientDropdown = false;

  // Legacy contacts (first-time link)
  let legacyChecked = [];
  $: legacyContacts =
    !order?.clientId && order?.orderClients?.length > 0
      ? order.orderClients.filter((oc) => !oc.deletedAt)
      : [];
  $: if (showChangeClientModal && legacyContacts.length > 0)
    legacyChecked = legacyContacts.map((oc) => oc.id);

  function toggleLegacy(id) {
    legacyChecked = legacyChecked.includes(id)
      ? legacyChecked.filter((i) => i !== id)
      : [...legacyChecked, id];
  }

  // Inline create inside Change modal
  let ccSelectedExisting = null;
  let ccInlineCreate = false;
  let ccNewName = "";
  let ccNewGst = "";
  let ccNewMobile = "";
  let ccNewEmail = "";
  let ccNewAddress = "";
  let ccCreateLoading = false;
  let ccCreateErrors = {};

  function ccOpenInlineCreate() {
    ccInlineCreate = true;
    ccNewName = changeClientQuery;
    ccNewGst = ccNewMobile = ccNewEmail = ccNewAddress = "";
    ccCreateErrors = {};
  }

  function ccCancelInlineCreate() {
    ccInlineCreate = false;
    ccNewName = ccNewGst = ccNewMobile = ccNewEmail = ccNewAddress = "";
    ccCreateErrors = {};
  }

  function closeChangeClientModal() {
    showChangeClientModal = false;
    ccSelectedExisting = null;
    changeClientQuery = "";
    changeClientResults = [];
    changeClientDropdown = false;
    ccCancelInlineCreate();
  }

  async function searchChangeClient(q) {
    if (!q || q.trim().length < 1) {
      changeClientResults = [];
      changeClientDropdown = false;
      return;
    }
    changeClientLoading = true;
    try {
      const res = await authApiFetch(
        `${API_ROUTES.CLIENT}/search?q=${encodeURIComponent(q)}`,
        { method: "GET" },
      );
      changeClientResults = res.data || [];
      changeClientDropdown = true;
    } catch (e) {
      changeClientResults = [];
    }
    changeClientLoading = false;
  }

  function onChangeClientInput() {
    clearTimeout(changeClientTimer);
    changeClientTimer = setTimeout(() => searchChangeClient(changeClientQuery), 300);
  }

  async function migrateLegacyContacts(resolvedClient) {
    const toMigrate = legacyContacts.filter((oc) => legacyChecked.includes(oc.id));
    for (const oc of toMigrate) {
      try {
        const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
          method: "POST",
          data: JSON.stringify({
            clientId: resolvedClient.id,
            name: oc.name,
            mobile: oc.mobile || undefined,
            email: oc.email || undefined,
            designation: oc.designation || undefined,
            whatsapp: oc.whatsapp || undefined,
            alternateMobile: oc.alternateMobile || undefined,
            address: oc.address || undefined,
          }),
        });
        const contact = contactRes.data;
        const ocRes = await authApiFetch(API_ROUTES.ORDER_CONTACT, {
          method: "POST",
          data: JSON.stringify({ orderId: order.id, clientContactId: contact.id }),
        });
        if (!order.orderContacts) order.orderContacts = [];
        order.orderContacts = [...order.orderContacts, ocRes.data];
        if (!resolvedClient.contacts) resolvedClient.contacts = [];
        resolvedClient.contacts = [...resolvedClient.contacts, contact];
      } catch (e) {
      }
    }
  }

  async function confirmChangeClient(newClient) {
    try {
      const isFirstLink = !order.clientId;
      const res = await authApiFetch(`${API_ROUTES.ORDER}/${order.id}/change-client`, {
        method: "PUT",
        data: JSON.stringify({ clientId: newClient.id }),
      });
      order.client = newClient;
      order.clientId = newClient.id;
      order.orderContacts = [];
      if (isFirstLink && legacyChecked.length > 0) await migrateLegacyContacts(newClient);
      closeChangeClientModal();
      const desc = isFirstLink
        ? `Client "${newClient.name}" linked with ${legacyChecked.length} contact(s).`
        : `Client changed to "${newClient.name}".`;
      order.groupedActivities = addActivityToGroupedActivities({
        title: isFirstLink ? "Client Linked" : "Client Changed",
        description: desc,
        createdAt: new Date().toISOString(),
      });
      Swal.fire("Success!", res.message || desc, "success");
    } catch (error) {
      Swal.fire("Error!", "Failed to link client.", "error");
    }
  }

  async function ccCreateAndLink() {
    ccCreateErrors = {};
    if (!ccNewName.trim()) { ccCreateErrors.name = "Company name is required."; return; }
    ccCreateLoading = true;
    try {
      const clientRes = await authApiFetch(API_ROUTES.CLIENT, {
        method: "POST",
        data: JSON.stringify({
          name: ccNewName.trim(),
          gstNumber: ccNewGst || undefined,
          mobile: ccNewMobile || undefined,
          email: ccNewEmail || undefined,
          address: ccNewAddress || undefined,
        }),
      });
      await confirmChangeClient(clientRes.data);
      ccCancelInlineCreate();
    } catch (error) {
      const errs = errorHandle(error);
      if (errs && typeof errs === "object") ccCreateErrors = errs;
      else Swal.fire("Error!", "Failed to create client.", "error");
    } finally {
      ccCreateLoading = false;
    }
  }

  // ── New Client + Contact Modal ─────────────────────────────────────────────
  let newClientStep = 1;
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
  let ncContactName = "";
  let ncContactDesignation = "";
  let ncContactMobile = "";
  let ncContactEmail = "";
  let ncContactWhatsapp = "";
  let ncContactAltMobile = "";
  let ncSubmitLoading = false;
  let ncFormErrors = {};

  // Reset when modal opens
  let _prevShowNew = false;
  $: if (showNewClientModal && !_prevShowNew) {
    newClientStep = 1;
    ncSearchQuery = ncClientName = ncClientGst = ncClientMobile = ncClientEmail = ncClientAddress = "";
    ncContactName = ncContactDesignation = ncContactMobile = ncContactEmail = ncContactWhatsapp = ncContactAltMobile = "";
    ncSearchResults = [];
    ncSearchDropdown = false;
    ncSelectedClient = null;
    ncCreateMode = false;
    ncFormErrors = {};
    _prevShowNew = true;
  }
  $: if (!showNewClientModal) _prevShowNew = false;

  async function ncSearchClients(q) {
    if (!q || q.trim().length < 1) { ncSearchResults = []; ncSearchDropdown = false; return; }
    ncSearchLoading = true;
    try {
      const res = await authApiFetch(
        `${API_ROUTES.CLIENT}/search?q=${encodeURIComponent(q)}`,
        { method: "GET" },
      );
      ncSearchResults = res.data || [];
      ncSearchDropdown = true;
    } catch (e) { ncSearchResults = []; }
    ncSearchLoading = false;
  }

  function ncOnSearchInput() {
    clearTimeout(ncSearchTimer);
    ncSelectedClient = null;
    ncCreateMode = false;
    ncSearchTimer = setTimeout(() => ncSearchClients(ncSearchQuery), 300);
  }

  function ncSelectClient(client) {
    ncSelectedClient = client;
    ncSearchQuery = client.name;
    ncSearchDropdown = false;
    ncCreateMode = false;
  }

  function ncGoToStep2() {
    ncFormErrors = {};
    if (!ncSelectedClient && !ncCreateMode) {
      ncFormErrors.step1 = "Please select an existing client or create a new one.";
      return;
    }
    if (ncCreateMode && !ncClientName.trim()) {
      ncFormErrors.ncClientName = "Company name is required.";
      return;
    }
    newClientStep = 2;
  }

  async function ncSubmit() {
    ncFormErrors = {};
    if (!ncContactName.trim()) { ncFormErrors.ncContactName = "Contact name is required."; return; }
    ncSubmitLoading = true;
    try {
      let resolvedClient = ncSelectedClient;
      if (!resolvedClient) {
        const clientRes = await authApiFetch(API_ROUTES.CLIENT, {
          method: "POST",
          data: JSON.stringify({
            name: ncClientName.trim(),
            gstNumber: ncClientGst || undefined,
            mobile: ncClientMobile || undefined,
            email: ncClientEmail || undefined,
            address: ncClientAddress || undefined,
          }),
        });
        resolvedClient = clientRes.data;
      }
      const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          clientId: resolvedClient.id,
          name: ncContactName.trim(),
          designation: ncContactDesignation || undefined,
          mobile: ncContactMobile || undefined,
          email: ncContactEmail || undefined,
          whatsapp: ncContactWhatsapp || undefined,
          alternateMobile: ncContactAltMobile || undefined,
        }),
      });
      const newContact = contactRes.data;
      await authApiFetch(`${API_ROUTES.ORDER}/${order.id}/change-client`, {
        method: "PUT",
        data: JSON.stringify({ clientId: resolvedClient.id }),
      });
      const ocRes = await authApiFetch(API_ROUTES.ORDER_CONTACT, {
        method: "POST",
        data: JSON.stringify({ orderId: order.id, clientContactId: newContact.id }),
      });
      order.client = resolvedClient;
      order.clientId = resolvedClient.id;
      order.orderContacts = [ocRes.data];
      if (!order.client.contacts) order.client.contacts = [];
      order.client.contacts = [...order.client.contacts, newContact];
      order.groupedActivities = addActivityToGroupedActivities({
        title: "Client Linked",
        description: `Client "${resolvedClient.name}" linked with contact "${newContact.name}".`,
        createdAt: new Date().toISOString(),
      });
      showNewClientModal = false;
      Swal.fire("Success!", `Client "${resolvedClient.name}" linked to this order.`, "success");
    } catch (error) {
      const errs = errorHandle(error);
      if (errs && typeof errs === "object") ncFormErrors = errs;
      else Swal.fire("Error!", "Failed to link client.", "error");
    } finally {
      ncSubmitLoading = false;
    }
  }

  // ── Add Contact Modal ──────────────────────────────────────────────────────
  let acName = "";
  let acDesignation = "";
  let acMobile = "";
  let acEmail = "";
  let acWhatsapp = "";
  let acAltMobile = "";
  let acAddress = "";
  let acLoading = false;
  let acMoreLoading = false;
  let acFormErrors = {};

  // Reset when modal opens
  let _prevShowAc = false;
  $: if (showAddContactModal && !_prevShowAc) {
    acName = acDesignation = acMobile = acEmail = acWhatsapp = acAltMobile = acAddress = "";
    acFormErrors = {};
    acLoading = false;
    _prevShowAc = true;
  }
  $: if (!showAddContactModal) _prevShowAc = false;

  async function submitAddContact(keepOpen = false) {
    acFormErrors = {};
    if (!acName.trim()) { acFormErrors.acName = "Name is required."; return; }
    if (keepOpen) acMoreLoading = true; else acLoading = true;
    try {
      const contactRes = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          clientId: order.client.id,
          name: acName.trim(),
          designation: acDesignation || undefined,
          mobile: acMobile || undefined,
          email: acEmail || undefined,
          whatsapp: acWhatsapp || undefined,
          alternateMobile: acAltMobile || undefined,
          address: acAddress || undefined,
        }),
      });
      const newContact = contactRes.data;
      const ocRes = await authApiFetch(API_ROUTES.ORDER_CONTACT, {
        method: "POST",
        data: JSON.stringify({ orderId: order.id, clientContactId: newContact.id }),
      });
      if (!order.orderContacts) order.orderContacts = [];
      order.orderContacts = [...order.orderContacts, ocRes.data];
      if (!order.client.contacts) order.client.contacts = [];
      order.client.contacts = [...order.client.contacts, newContact];
      order.groupedActivities = addActivityToGroupedActivities({
        title: "Contact Added",
        description: `Contact "${newContact.name}" added to order.`,
        createdAt: new Date().toISOString(),
      });
      if (keepOpen) {
        acName = acDesignation = acMobile = acEmail = acWhatsapp = acAltMobile = acAddress = "";
        Swal.fire({ toast: true, position: "top-end", icon: "success", title: `"${newContact.name}" saved!`, showConfirmButton: false, timer: 1500 });
      } else {
        showAddContactModal = false;
        Swal.fire("Success!", `Contact "${newContact.name}" added.`, "success");
      }
    } catch (error) {
      const errs = errorHandle(error);
      if (errs && typeof errs === "object") acFormErrors = errs;
      else Swal.fire("Error!", "Failed to add contact.", "error");
    } finally {
      acLoading = false;
      acMoreLoading = false;
    }
  }
</script>

<!-- Add Contact Modal -->
{#if showAddContactModal}
  <div class="modal fade show d-block" role="dialog" style="background:rgba(0,0,0,0.5);z-index:9999;">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="ti ti-user-plus me-2 text-primary"></i>Add Contact</h5>
          <button type="button" class="btn-close" on:click={() => (showAddContactModal = false)}></button>
        </div>
        <div class="modal-body">
          <div class="mb-3 p-2 bg-light rounded d-flex align-items-center gap-2 border">
            <i class="ti ti-building-store text-primary"></i>
            <span class="fw-semibold">{order.client?.name}</span>
            {#if order.client?.gstNumber}
              <span class="text-muted small ms-1">GST: {order.client.gstNumber}</span>
            {/if}
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control" class:is-invalid={acFormErrors.acName} bind:value={acName} placeholder="Contact name" />
              {#if acFormErrors.acName}<ul class="text-danger mt-1 text-xs"><li>{acFormErrors.acName}</li></ul>{/if}
            </div>
            <div>
              <label class="form-label">Designation</label>
              <input type="text" class="form-control" bind:value={acDesignation} placeholder="e.g. Manager, Director" />
            </div>
            <div>
              <label class="form-label">Mobile</label>
              <input type="text" class="form-control" bind:value={acMobile} placeholder="Mobile" />
            </div>
            <div>
              <label class="form-label">Email</label>
              <input type="email" class="form-control" bind:value={acEmail} placeholder="Email" />
            </div>
            <div>
              <label class="form-label">Whatsapp</label>
              <input type="text" class="form-control" bind:value={acWhatsapp} placeholder="Whatsapp" />
            </div>
            <div>
              <label class="form-label">Alternate Mobile</label>
              <input type="text" class="form-control" bind:value={acAltMobile} placeholder="Alternate mobile" />
            </div>
            <div class="col-span-2">
              <label class="form-label">Address</label>
              <input type="text" class="form-control" bind:value={acAddress} placeholder="Address" />
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={() => (showAddContactModal = false)}>Cancel</button>
          <button type="button" class="btn btn-outline-primary" on:click={() => submitAddContact(true)} disabled={acLoading || acMoreLoading}>
            {acMoreLoading ? "Saving..." : "Save & Add More"}
          </button>
          <button type="button" class="btn btn-primary" on:click={() => submitAddContact()} disabled={acLoading || acMoreLoading}>
            {acLoading ? "Saving..." : "Add Contact"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- New Client + Contact Modal -->
{#if showNewClientModal}
  <div class="modal fade show d-block" role="dialog" style="background:rgba(0,0,0,0.5);z-index:9999;">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-building-store me-2 text-primary"></i>
            {newClientStep === 1 ? "Step 1 — Select or Create Client" : "Step 2 — Add Contact Person"}
          </h5>
          <button type="button" class="btn-close" on:click={() => (showNewClientModal = false)}></button>
        </div>
        <div class="modal-body">
          <!-- Step indicator -->
          <div class="d-flex align-items-center gap-2 mb-4">
            <div class="d-flex align-items-center gap-1">
              <span class="badge rounded-pill {newClientStep >= 1 ? 'bg-primary' : 'bg-secondary'} px-3 py-2">1</span>
              <span class="small fw-semibold {newClientStep >= 1 ? 'text-primary' : 'text-muted'}">Client</span>
            </div>
            <div class="flex-grow-1 border-top mx-2"></div>
            <div class="d-flex align-items-center gap-1">
              <span class="badge rounded-pill {newClientStep >= 2 ? 'bg-primary' : 'bg-secondary'} px-3 py-2">2</span>
              <span class="small fw-semibold {newClientStep >= 2 ? 'text-primary' : 'text-muted'}">Contact</span>
            </div>
          </div>

          <!-- STEP 1 -->
          {#if newClientStep === 1}
            {#if !ncSelectedClient && !ncCreateMode}
              <div class="mb-3 position-relative">
                <label class="form-label fw-semibold">Search Existing Client</label>
                <div class="input-group">
                  <input type="text" class="form-control" placeholder="Type company name, mobile, email..." bind:value={ncSearchQuery} on:input={ncOnSearchInput} autocomplete="off" />
                  {#if ncSearchLoading}<span class="input-group-text"><span class="spinner-border spinner-border-sm"></span></span>{/if}
                </div>
                {#if ncSearchDropdown && ncSearchResults.length > 0}
                  <div class="border rounded bg-white position-absolute w-100 shadow" style="z-index:9999;max-height:220px;overflow-y:auto;top:100%;">
                    {#each ncSearchResults as client}
                      <button type="button" class="d-block w-100 text-start px-3 py-2 border-bottom" style="background:none;" on:click={() => ncSelectClient(client)}>
                        <div class="fw-semibold"><i class="ti ti-building-store me-1 text-primary"></i>{client.name}</div>
                        {#if client.gstNumber}<div class="text-muted small">GST: {client.gstNumber}</div>{/if}
                        {#if client.contacts?.length > 0}<div class="text-muted small">Contacts: {client.contacts.map((c) => c.name).join(", ")}</div>{/if}
                      </button>
                    {/each}
                  </div>
                {/if}
                {#if ncSearchDropdown && ncSearchResults.length === 0 && ncSearchQuery.length > 1}
                  <div class="border rounded bg-white position-absolute w-100 shadow px-3 py-2" style="z-index:9999;top:100%;">
                    <div class="text-muted small mb-2">No client found for "{ncSearchQuery}"</div>
                    <button type="button" class="btn btn-sm btn-outline-primary" on:click={() => { ncCreateMode = true; ncClientName = ncSearchQuery; ncSearchDropdown = false; }}>
                      <i class="ti ti-plus me-1"></i>Create New Client
                    </button>
                  </div>
                {/if}
              </div>
              <div class="text-center text-muted small my-3">— or —</div>
              <button type="button" class="btn btn-outline-secondary btn-sm" on:click={() => { ncCreateMode = true; ncSearchDropdown = false; }}>
                <i class="ti ti-plus me-1"></i>Create New Client
              </button>
            {/if}

            {#if ncSelectedClient}
              <div class="border rounded p-3 bg-light mb-3">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <div class="fw-bold"><i class="ti ti-building-store me-1 text-primary"></i>{ncSelectedClient.name}</div>
                    {#if ncSelectedClient.gstNumber}<div class="text-muted small">GST: {ncSelectedClient.gstNumber}</div>{/if}
                    {#if ncSelectedClient.contacts?.length > 0}<div class="text-muted small mt-1">Existing contacts: {ncSelectedClient.contacts.map((c) => c.name).join(", ")}</div>{/if}
                  </div>
                  <button type="button" class="btn btn-sm btn-outline-danger" on:click={() => { ncSelectedClient = null; ncSearchQuery = ""; }}><i class="ti ti-x"></i></button>
                </div>
              </div>
            {/if}

            {#if ncCreateMode}
              <div class="border rounded p-3 bg-light mb-3">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <h6 class="mb-0 fw-semibold">New Client</h6>
                  <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => { ncCreateMode = false; ncClientName = ""; }}><i class="ti ti-x"></i></button>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="form-label">Company Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" class:is-invalid={ncFormErrors.ncClientName} bind:value={ncClientName} placeholder="Company name" />
                    {#if ncFormErrors.ncClientName}<ul class="text-danger mt-1 text-xs"><li>{ncFormErrors.ncClientName}</li></ul>{/if}
                  </div>
                  <div>
                    <label class="form-label">GST Number</label>
                    <input type="text" class="form-control" bind:value={ncClientGst} placeholder="GST number" />
                  </div>
                  <div>
                    <label class="form-label">Mobile</label>
                    <input type="text" class="form-control" bind:value={ncClientMobile} placeholder="Mobile" />
                  </div>
                  <div>
                    <label class="form-label">Email</label>
                    <input type="email" class="form-control" bind:value={ncClientEmail} placeholder="Email" />
                  </div>
                  <div class="col-span-2">
                    <label class="form-label">Address</label>
                    <input type="text" class="form-control" bind:value={ncClientAddress} placeholder="Address" />
                  </div>
                </div>
              </div>
            {/if}

            {#if ncFormErrors.step1}<div class="alert alert-warning py-2 small">{ncFormErrors.step1}</div>{/if}
          {/if}

          <!-- STEP 2 -->
          {#if newClientStep === 2}
            <div class="mb-2 p-2 bg-light rounded border d-flex align-items-center gap-2">
              <i class="ti ti-building-store text-primary"></i>
              <span class="fw-semibold">{ncSelectedClient?.name || ncClientName}</span>
              <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" on:click={() => (newClientStep = 1)}>
                <i class="ti ti-edit me-1"></i>Change
              </button>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label class="form-label">Contact Name <span class="text-danger">*</span></label>
                <input type="text" class="form-control" class:is-invalid={ncFormErrors.ncContactName} bind:value={ncContactName} placeholder="Full name" />
                {#if ncFormErrors.ncContactName}<ul class="text-danger mt-1 text-xs"><li>{ncFormErrors.ncContactName}</li></ul>{/if}
              </div>
              <div>
                <label class="form-label">Designation</label>
                <input type="text" class="form-control" bind:value={ncContactDesignation} placeholder="e.g. Manager, Director" />
              </div>
              <div>
                <label class="form-label">Mobile</label>
                <input type="text" class="form-control" bind:value={ncContactMobile} placeholder="Mobile" />
              </div>
              <div>
                <label class="form-label">Email</label>
                <input type="email" class="form-control" bind:value={ncContactEmail} placeholder="Email" />
              </div>
              <div>
                <label class="form-label">Whatsapp</label>
                <input type="text" class="form-control" bind:value={ncContactWhatsapp} placeholder="Whatsapp" />
              </div>
              <div>
                <label class="form-label">Alternate Mobile</label>
                <input type="text" class="form-control" bind:value={ncContactAltMobile} placeholder="Alternate mobile" />
              </div>
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={() => (showNewClientModal = false)}>Cancel</button>
          {#if newClientStep === 1}
            <button type="button" class="btn btn-primary" on:click={ncGoToStep2}>Next <i class="ti ti-arrow-right ms-1"></i></button>
          {:else}
            <button type="button" class="btn btn-outline-secondary" on:click={() => (newClientStep = 1)}><i class="ti ti-arrow-left me-1"></i>Back</button>
            <button type="button" class="btn btn-primary" on:click={ncSubmit} disabled={ncSubmitLoading}>
              {ncSubmitLoading ? "Saving..." : "Save & Link Client"}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Client Modal -->
{#if showEditClientModal}
  <div class="modal fade show d-block" tabindex="-1" role="dialog" style="background:rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="ti ti-building-store me-2"></i>Edit Client</h5>
          <button type="button" class="btn-close" on:click={() => (showEditClientModal = false)}></button>
        </div>
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label">Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control" class:is-invalid={editClientErrors.name} bind:value={editClientData.name} placeholder="Client name" />
              {#if editClientErrors.name}<div class="invalid-feedback">{editClientErrors.name}</div>{/if}
            </div>
            <div class="col-12">
              <label class="form-label">GST Number</label>
              <input type="text" class="form-control" bind:value={editClientData.gstNumber} placeholder="GST Number" maxlength="20" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Mobile</label>
              <input type="text" class="form-control" bind:value={editClientData.mobile} placeholder="Mobile" maxlength="20" />
            </div>
            <div class="col-md-6">
              <label class="form-label">WhatsApp</label>
              <input type="text" class="form-control" bind:value={editClientData.whatsapp} placeholder="WhatsApp" maxlength="20" />
            </div>
            <div class="col-12">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" bind:value={editClientData.email} placeholder="Email" maxlength="100" />
            </div>
            <div class="col-12">
              <label class="form-label">Address</label>
              <textarea class="form-control" rows="2" bind:value={editClientData.address} placeholder="Address" maxlength="500"></textarea>
            </div>
            <div class="col-12">
              <label class="form-label">Remark</label>
              <textarea class="form-control" rows="2" bind:value={editClientData.remark} placeholder="Remark" maxlength="500"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={() => (showEditClientModal = false)}>Cancel</button>
          <button type="button" class="btn btn-primary" on:click={saveEditClient} disabled={savingClient}>
            {#if savingClient}<span class="spinner-border spinner-border-sm me-1"></span>{/if}
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Change / Link Client Modal -->
{#if showChangeClientModal}
  <div class="modal fade show d-block" role="dialog" style="background:rgba(0,0,0,0.5);z-index:9999;">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{order.client ? "Change Client" : "Link Client"}</h5>
          <button type="button" class="btn-close" on:click={closeChangeClientModal}></button>
        </div>
        <div class="modal-body">
          {#if order.client}
            <div class="mb-3 text-muted small">Current: <strong>{order.client.name}</strong></div>
          {/if}

          <div class="d-flex align-items-center justify-content-between mb-2">
            <label class="form-label mb-0 fw-semibold">
              {#if ccInlineCreate}
                <i class="ti ti-building-store me-1 text-primary"></i>New Client
              {:else}
                <i class="ti ti-search me-1 text-primary"></i>Search Client
              {/if}
            </label>
            {#if ccInlineCreate}
              <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => { ccCancelInlineCreate(); ccSelectedExisting = null; changeClientQuery = ""; }}>
                <i class="ti ti-arrow-left me-1"></i>Back to Search
              </button>
            {:else}
              <button type="button" class="btn btn-sm btn-outline-primary" on:click={ccOpenInlineCreate}>
                <i class="ti ti-plus me-1"></i>New Client
              </button>
            {/if}
          </div>

          {#if !ccInlineCreate}
            <div class="position-relative">
              <div class="input-group mb-2">
                <input type="text" class="form-control" placeholder="Type name, mobile, email, GST..." bind:value={changeClientQuery} on:input={onChangeClientInput} autocomplete="off" />
                {#if changeClientLoading}<span class="input-group-text"><span class="spinner-border spinner-border-sm"></span></span>{/if}
              </div>
              {#if changeClientDropdown && changeClientResults.length > 0}
                <div class="border rounded" style="max-height:200px;overflow-y:auto;">
                  {#each changeClientResults as client}
                    <button type="button" class="d-block w-100 text-start px-3 py-2 border-bottom" style="background:none;" on:click={() => { changeClientDropdown = false; ccSelectedExisting = client; }}>
                      <div class="fw-semibold"><i class="ti ti-building-store me-1 text-primary"></i>{client.name}</div>
                      {#if client.gstNumber}<div class="text-muted small">GST: {client.gstNumber}</div>{/if}
                      {#if client.contacts?.length > 0}<div class="text-muted small">{client.contacts.map((c) => c.name).join(", ")}</div>{/if}
                    </button>
                  {/each}
                </div>
              {/if}
              {#if changeClientDropdown && changeClientResults.length === 0}
                <div class="text-muted small mt-1 fst-italic">No client found — use <strong>New Client</strong> button above to create one.</div>
              {/if}
            </div>
            {#if ccSelectedExisting}
              <div class="border rounded p-3 mt-2 bg-light d-flex justify-content-between align-items-start">
                <div>
                  <div class="fw-semibold"><i class="ti ti-building-store me-1 text-primary"></i>{ccSelectedExisting.name}</div>
                  {#if ccSelectedExisting.gstNumber}<div class="text-muted small">GST: {ccSelectedExisting.gstNumber}</div>{/if}
                  {#if ccSelectedExisting.contacts?.length > 0}<div class="text-muted small mt-1">{ccSelectedExisting.contacts.map((c) => c.name).join(", ")}</div>{/if}
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => { ccSelectedExisting = null; changeClientQuery = ""; }}><i class="ti ti-x"></i></button>
              </div>
            {/if}
          {/if}

          {#if ccInlineCreate}
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">Company Name <span class="text-danger">*</span></label>
                <input type="text" class="form-control" class:is-invalid={ccCreateErrors.name} bind:value={ccNewName} placeholder="Company name" />
                {#if ccCreateErrors.name}<ul class="text-danger mt-1 text-xs"><li>{ccCreateErrors.name}</li></ul>{/if}
              </div>
              <div>
                <label class="form-label">GST Number</label>
                <input type="text" class="form-control" bind:value={ccNewGst} placeholder="GST number" />
              </div>
              <div>
                <label class="form-label">Mobile</label>
                <input type="text" class="form-control" bind:value={ccNewMobile} placeholder="Mobile" />
              </div>
              <div>
                <label class="form-label">Email</label>
                <input type="email" class="form-control" bind:value={ccNewEmail} placeholder="Email" />
              </div>
              <div class="col-span-2">
                <label class="form-label">Address</label>
                <input type="text" class="form-control" bind:value={ccNewAddress} placeholder="Address" />
              </div>
            </div>
          {/if}

          {#if legacyContacts.length > 0 && !order.clientId}
            <div class="mt-3 border rounded p-3 bg-light">
              <div class="fw-semibold small mb-2"><i class="ti ti-users me-1 text-primary"></i>Legacy contacts on this order — add to client:</div>
              {#each legacyContacts as oc}
                <label class="d-flex align-items-center gap-2 py-1 cursor-pointer">
                  <input type="checkbox" checked={legacyChecked.includes(oc.id)} on:change={() => toggleLegacy(oc.id)} />
                  <span class="small">
                    <strong>{oc.name}</strong>
                    {#if oc.designation}<span class="text-muted"> · {oc.designation}</span>{/if}
                    {#if oc.mobile}<span class="text-muted"> · {oc.mobile}</span>{/if}
                    {#if oc.email}<span class="text-muted"> · {oc.email}</span>{/if}
                  </span>
                </label>
              {/each}
              {#if legacyChecked.length > 0}
                <div class="text-primary small mt-1"><i class="ti ti-check me-1"></i>{legacyChecked.length} contact(s) will be added</div>
              {/if}
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" on:click={closeChangeClientModal}>Cancel</button>
          {#if ccSelectedExisting}
            <button type="button" class="btn btn-primary" on:click={() => confirmChangeClient(ccSelectedExisting)}>
              {#if legacyChecked.length > 0 && !order.clientId}
                Link ({legacyChecked.length} contact{legacyChecked.length > 1 ? "s" : ""})
              {:else}
                Link Client
              {/if}
            </button>
          {/if}
          {#if ccInlineCreate}
            <button type="button" class="btn btn-primary" on:click={ccCreateAndLink} disabled={ccCreateLoading}>
              {#if ccCreateLoading}
                Creating...
              {:else if legacyChecked.length > 0 && !order.clientId}
                Create & Link ({legacyChecked.length} contact{legacyChecked.length > 1 ? "s" : ""})
              {:else}
                Create & Link
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
