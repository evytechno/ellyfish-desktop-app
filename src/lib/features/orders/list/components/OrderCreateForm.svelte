<script>
  import { createEventDispatcher } from "svelte";
  import jQuery from "jquery";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import { get } from "svelte/store";
  import { companiesAllStore } from "$lib/stores/dataStores";

  export let categories = [];
  export let prefillClient = null;

  const dispatch = createEventDispatcher();

  // Order fields
  let title = "";
  let category = "";
  let orderDate = null;
  let startDate = null;
  let deadlineDate = null;
  let price = null;
  let currency = "INR";
  let priceTerms = null;
  let source = null;
  let description = "";
  let company = "";
  let gstNumber = "";
  let isSample = false;
  let showMoreOrderFields = false;
  let showMoreContactFields = false;

  /** Sample company (for sample code) — selectable; defaults to creator's company. */
  const currentUser = checkAuth();
  let companies = [];
  let sampleCompanyId =
    currentUser?.companyId != null ? Number(currentUser.companyId) : null;

  async function loadCompanies() {
    const cached = get(companiesAllStore);
    if (cached?.length) {
      companies = cached;
      return;
    }
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = Array.isArray(data) ? data : data?.data || [];
      companiesAllStore.set(companies);
    } catch (_) {
      companies = [];
    }
  }
  loadCompanies();

  // Optional first sample movement
  const SAMPLE_UNITS = ["Pcs", "Set", "Kg", "Nos", "Box"];
  let sampleDirection = "Outbound";
  let sampleSentDate = new Date().toISOString().slice(0, 10);
  let sampleTracking = "";
  let sampleNotes = "";
  let sampleItems = [{ name: "", quantity: "1", unit: "Pcs", note: "" }];

  // Quick contact (when no client selected)
  let name = "";
  let email = "";
  let mobile = "";
  let whatsapp = "";
  let address = "";
  let alternateMobile = "";
  let designation = "";
  let remark = "";

  // Client search
  let clientSearchQuery = "";
  let clientSearchResults = [];
  let clientSearchLoading = false;
  let selectedClient = null;
  let showClientDropdown = false;
  let selectedContacts = [];

  // New client modal
  let showCreateClientModal = false;
  let pendingNewClient = null; // confirmed draft from modal
  let newClientName = "";
  let newClientGst = "";
  let newClientAddress = "";
  let newClientEmail = "";
  let newClientMobile = "";
  let newClientContactName = "";

  let loading = false;
  let formErrors = {};
  let clientSearchTimer = null;

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];
  const sources = ["Whatsapp", "Website", "Mail"];

  async function searchClients(q) {
    if (!q || q.trim().length < 1) {
      clientSearchResults = [];
      showClientDropdown = false;
      return;
    }
    clientSearchLoading = true;
    try {
      const res = await authApiFetch(
        `${API_ROUTES.CLIENT}/search?q=${encodeURIComponent(q)}`,
        { method: "GET" },
      );
      clientSearchResults = res.data || [];
      showClientDropdown = true;
    } catch (_) {
      clientSearchResults = [];
    }
    clientSearchLoading = false;
  }

  function onClientSearchInput() {
    clearTimeout(clientSearchTimer);
    selectedClient = null;
    pendingNewClient = null;
    clientSearchTimer = setTimeout(() => searchClients(clientSearchQuery), 300);
  }

  function selectClient(client) {
    selectedClient = client;
    pendingNewClient = null;
    clientSearchQuery = client.name;
    showClientDropdown = false;
    showCreateClientModal = false;
    selectedContacts = [];
    company = client.name;
    gstNumber = client.gstNumber || "";
  }

  function toggleContact(contact) {
    const idx = selectedContacts.findIndex((c) => c.id === contact.id);
    if (idx >= 0) selectedContacts = selectedContacts.filter((c) => c.id !== contact.id);
    else selectedContacts = [...selectedContacts, contact];
  }

  function clearClientSelection() {
    selectedClient = null;
    pendingNewClient = null;
    clientSearchQuery = "";
    selectedContacts = [];
    clientSearchResults = [];
    showClientDropdown = false;
    company = "";
    gstNumber = "";
  }

  function openCreateClientModal(prefillName = "") {
    newClientName = prefillName || clientSearchQuery || "";
    newClientGst = "";
    newClientAddress = "";
    newClientEmail = "";
    newClientMobile = "";
    newClientContactName = prefillName || "";
    showClientDropdown = false;
    showCreateClientModal = true;
  }

  function closeCreateClientModal() {
    showCreateClientModal = false;
  }

  function confirmCreateClient() {
    formErrors = { ...formErrors, newClientName: undefined, newClientContactName: undefined };
    if (!newClientName.trim()) {
      formErrors = { ...formErrors, newClientName: ["Company name is required."] };
      return;
    }
    const contactName = (newClientContactName || newClientName).trim();
    if (!contactName) {
      formErrors = { ...formErrors, newClientContactName: ["Contact name is required."] };
      return;
    }

    pendingNewClient = {
      name: newClientName.trim(),
      gstNumber: newClientGst.trim(),
      address: newClientAddress.trim(),
      email: newClientEmail.trim(),
      mobile: newClientMobile.trim(),
      contactName,
    };
    selectedClient = null;
    company = pendingNewClient.name;
    gstNumber = pendingNewClient.gstNumber;
    name = pendingNewClient.contactName;
    mobile = pendingNewClient.mobile;
    email = pendingNewClient.email;
    address = pendingNewClient.address;
    showCreateClientModal = false;
  }

  function clearPendingNewClient() {
    pendingNewClient = null;
    newClientName = "";
    newClientGst = "";
    newClientAddress = "";
    newClientEmail = "";
    newClientMobile = "";
    newClientContactName = "";
  }

  function blankSampleItem() {
    return { name: "", quantity: "1", unit: "Pcs", note: "" };
  }

  function resetSampleFields() {
    sampleDirection = "Outbound";
    sampleSentDate = new Date().toISOString().slice(0, 10);
    sampleTracking = "";
    sampleNotes = "";
    sampleItems = [blankSampleItem()];
  }

  function addSampleItemRow() {
    sampleItems = [...sampleItems, blankSampleItem()];
  }

  function removeSampleItemRow(index) {
    if (sampleItems.length <= 1) {
      sampleItems = [blankSampleItem()];
      return;
    }
    sampleItems = sampleItems.filter((_, i) => i !== index);
  }

  function getValidSampleItems() {
    if (!isSample) return [];
    return sampleItems
      .map((it) => ({
        name: (it.name || "").trim(),
        quantity: (it.quantity || "").toString().trim() || null,
        unit: (it.unit || "").trim() || null,
        note: (it.note || "").trim() || null,
      }))
      .filter((it) => it.name);
  }

  function resetForm() {
    title = "";
    category = "";
    orderDate = null;
    startDate = null;
    deadlineDate = null;
    price = null;
    currency = "INR";
    priceTerms = null;
    source = null;
    description = "";
    company = "";
    gstNumber = "";
    isSample = false;
    showMoreOrderFields = false;
    showMoreContactFields = false;
    sampleCompanyId =
      currentUser?.companyId != null ? Number(currentUser.companyId) : null;
    resetSampleFields();
    name = "";
    email = "";
    mobile = "";
    alternateMobile = "";
    whatsapp = "";
    address = "";
    designation = "";
    remark = "";
    clearPendingNewClient();
    clearClientSelection();
    formErrors = {};
    if (prefillClient?.id) selectClient(prefillClient);
  }

  $: if (prefillClient?.id && selectedClient?.id !== prefillClient.id) {
    selectClient(prefillClient);
  }

  function closeOffcanvas() {
    jQuery("#offcanvas_add").removeClass("show");
    jQuery(".offcanvas-backdrop").remove();
    jQuery("body").css({ overflow: "", paddingRight: "" });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    loading = true;
    formErrors = {};

    const newOrder = {
      title,
      currency,
      source,
      description,
      company,
      gstNumber,
      isSample: !!isSample,
      ...(isSample
        ? {
            sampleDecision: "Pending",
            ...(sampleCompanyId != null
              ? { sampleCompanyId: Number(sampleCompanyId) }
              : {}),
          }
        : {}),
    };
    newOrder.category = category || "";
    if (orderDate) newOrder.orderDate = orderDate;
    if (startDate) newOrder.startDate = startDate;

    if (!isSample) {
      if (deadlineDate) newOrder.deadlineDate = deadlineDate;
      if (price) newOrder.price = Number(price);
      if (priceTerms) newOrder.priceTerms = priceTerms;
    }

    if (selectedClient) {
      newOrder.clientId = selectedClient.id;
      if (selectedContacts.length > 0) {
        newOrder.orderClients = selectedContacts.map((c) => ({
          name: c.name,
          mobile: c.mobile,
          email: c.email,
          designation: c.designation,
          whatsapp: c.whatsapp,
          alternateMobile: c.alternateMobile,
          address: c.address,
        }));
      }
    } else if (pendingNewClient) {
      newOrder.company = pendingNewClient.name;
      newOrder.gstNumber = pendingNewClient.gstNumber || gstNumber;
      newOrder.orderClients = [
        {
          name: pendingNewClient.contactName,
          mobile: pendingNewClient.mobile,
          email: pendingNewClient.email,
          address: pendingNewClient.address,
          designation: "",
          whatsapp: "",
        },
      ];
    } else {
      newOrder.orderClients = [
        { name, mobile, email, whatsapp, address, alternateMobile, designation, remark },
      ];
    }

    newOrder.orderActivity = {
      title: "Order Created",
      description: isSample
        ? "A new sample order has been created."
        : "A new order has been created.",
    };

    if (title === "") {
      formErrors.title = ["Title is required."];
      loading = false;
      return;
    }
    if (!selectedClient && !pendingNewClient && name === "") {
      formErrors.name = ["Contact name is required."];
      loading = false;
      return;
    }
    if (isSample) {
      if (sampleCompanyId == null) {
        formErrors.sampleCompanyId = ["Sample company is required."];
        loading = false;
        return;
      }
      if (!getValidSampleItems().length) {
        formErrors.sampleItems = ["Add at least one sample item with a name."];
        loading = false;
        return;
      }
    }

    try {
      const data = await authApiFetch(API_ROUTES.ORDER, {
        method: "POST",
        data: JSON.stringify(newOrder),
      });

      const createdOrderId = data?.data?.id;
      const validSampleItems = getValidSampleItems();
      let sampleSaved = false;

      if (createdOrderId && validSampleItems.length) {
        const first = validSampleItems[0];
        try {
          await authApiFetch(API_ROUTES.ORDER_SAMPLE, {
            method: "POST",
            data: JSON.stringify({
              orderId: createdOrderId,
              direction: sampleDirection,
              status: "Sent",
              sentDate: sampleSentDate
                ? new Date(sampleSentDate).toISOString()
                : undefined,
              tracking: sampleTracking.trim() || null,
              notes: sampleNotes.trim() || null,
              items: validSampleItems,
              description: validSampleItems.map((it) => it.name).join(", "),
              quantity: first.quantity
                ? `${first.quantity}${first.unit ? ` ${first.unit}` : ""}`
                : null,
            }),
          });
          sampleSaved = true;
        } catch (sampleErr) {
          errorHandle(sampleErr);
          Swal.fire(
            "Order created",
            "Order saved, but the first sample movement could not be added. You can add it on the Samples tab.",
            "warning",
          );
          resetForm();
          closeOffcanvas();
          dispatch("created");
          return;
        }
      }

      Swal.fire(
        "Success!",
        sampleSaved
          ? "Sample order created with first sample movement."
          : data.message,
        "success",
      );
      resetForm();
      closeOffcanvas();
      dispatch("created");
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        Swal.fire("Error", "An unexpected error occurred.", "error");
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="offcanvas offcanvas-end offcanvas-add-order" tabindex="-1" id="offcanvas_add">
  <div class="offcanvas-header border-bottom">
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <h5 class="mb-0">Add New Order</h5>
      {#if isSample}
        <span class="badge bg-info" style="font-size:11px;">Sample</span>
      {/if}
    </div>
    <button
      type="button"
      class="btn-close custom-btn-close border p-1 me-0 d-flex align-items-center justify-content-center rounded-circle"
      data-bs-dismiss="offcanvas"
      aria-label="Close"
    ></button>
  </div>

  <div class="offcanvas-body">
    <form on:submit={handleSubmit} class="needs-validation create-order-form" novalidate>
      <!-- Core -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="form-label" for="title">Title <span class="text-danger">*</span></label>
          <input
            type="text"
            class="form-control"
            class:is-invalid={formErrors.title}
            bind:value={title}
            id="title"
            placeholder="Title"
            required
          />
          {#if formErrors.title}
            <div class="invalid-feedback d-block">{formErrors.title[0]}</div>
          {/if}
        </div>
        <div>
          <label class="form-label" for="category">Category</label>
          <TypeableSelect
            id="category"
            placeholder="Search category…"
            value={category !== "" ? category : null}
            dropdownParent="#offcanvas_add"
            ajaxDelay={250}
            minimumInputLength={0}
            ajaxSearch={async (term) => {
              const q = (term || "").trim();
              const params = new URLSearchParams({
                page: "1",
                limit: "10",
              });
              if (q) params.set("search", q);
              const res = await authApiFetch(`${API_ROUTES.CATEGORY}?${params}`);
              return (res?.data || []).map((c) => c.name).filter(Boolean);
            }}
            on:change={(e) => (category = e.detail || "")}
          />
        </div>
      </div>

      <!-- Order type -->
      <div class="order-type-block mt-3" class:is-sample={isSample}>
        <div class="form-label mb-1" style="font-size:12px;">Order type</div>
        <div class="d-flex flex-wrap gap-2">
          <label class="order-type-option" class:active={!isSample}>
            <input
              type="radio"
              name="orderType"
              checked={!isSample}
              on:change={() => {
                isSample = false;
                resetSampleFields();
              }}
            />
            <span class="order-type-title">Normal order</span>
          </label>
          <label class="order-type-option" class:active={isSample}>
            <input
              type="radio"
              name="orderType"
              checked={isSample}
              on:change={() => {
                isSample = true;
                price = null;
                priceTerms = null;
                deadlineDate = null;
                resetSampleFields();
              }}
            />
            <span class="order-type-title">Sample case</span>
          </label>
        </div>
        {#if isSample}
          <div class="mt-2">
            <label class="form-label mb-1" style="font-size:12px;" for="sampleCompanyId">
              Sample company <span class="text-danger">*</span>
            </label>
            <TypeableSelect
              id="sampleCompanyId"
              objectMode={true}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              value={sampleCompanyId}
              placeholder="Select company..."
              on:change={(e) => {
                sampleCompanyId = e.detail;
                formErrors.sampleCompanyId = null;
              }}
            />
            {#if formErrors.sampleCompanyId}
              <ul class="text-danger mt-1 text-xs"><li>{formErrors.sampleCompanyId[0]}</li></ul>
            {:else}
              <div class="form-text text-muted" style="font-size:11px;">
                Defaults to your company. Sample code uses this (e.g. SAMP-XXXX-00001).
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Compact dates / source -->
      <div class="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label class="form-label" for="orderDate">Order Date</label>
          <input type="date" class="form-control" bind:value={orderDate} id="orderDate" />
        </div>
        <div>
          <label class="form-label" for="source">Source</label>
          <TypeableSelect
            id="source"
            options={sources}
            value={source}
            placeholder="Select Source"
            on:change={(e) => (source = e.detail)}
          />
        </div>
      </div>

      <button
        type="button"
        class="btn btn-link btn-sm px-0 mt-2 text-decoration-none"
        on:click={() => (showMoreOrderFields = !showMoreOrderFields)}
      >
        <i class="ti ti-chevron-{showMoreOrderFields ? 'up' : 'down'} me-1"></i>
        {showMoreOrderFields ? "Hide" : "More"} order details
      </button>

      {#if showMoreOrderFields}
        <div class="grid grid-cols-2 gap-3 mt-2 more-fields-panel">
          <div>
            <label class="form-label" for="startDate">Start Date</label>
            <input type="date" class="form-control" bind:value={startDate} id="startDate" />
          </div>
          {#if !isSample}
            <div>
              <label class="form-label" for="deadlineDate">Deadline Date</label>
              <input type="date" class="form-control" bind:value={deadlineDate} id="deadlineDate" />
            </div>
            <div>
              <label class="form-label" for="price">Price</label>
              <div class="input-group">
                <span class="input-group-text">{currencies.find((c) => c.code === currency)?.symbol}</span>
                <input type="number" class="form-control" bind:value={price} id="price" placeholder="0.00" />
                <select class="form-select" style="max-width:90px;" bind:value={currency}>
                  {#each currencies as c}<option value={c.code}>{c.code}</option>{/each}
                </select>
              </div>
            </div>
            <div>
              <label class="form-label" for="priceTerms">Price Terms</label>
              <input type="text" class="form-control" bind:value={priceTerms} id="priceTerms" placeholder="Price Terms" />
            </div>
          {/if}
          {#if !selectedClient && !pendingNewClient}
            <div>
              <label class="form-label" for="company">Company</label>
              <input type="text" class="form-control" bind:value={company} id="company" placeholder="Company" />
            </div>
            <div>
              <label class="form-label" for="gstNumber">GST Number</label>
              <input type="text" class="form-control" bind:value={gstNumber} id="gstNumber" placeholder="GST Number" />
            </div>
          {/if}
          <div class="col-span-2" style="grid-column:1/-1;">
            <label class="form-label" for="description">Description</label>
            <textarea class="form-control" rows="2" bind:value={description} id="description" placeholder="Description"></textarea>
          </div>
        </div>
      {/if}

      <!-- Required first sample when sample case -->
      {#if isSample}
        <div class="create-sample-block mt-3">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="fw-semibold" style="font-size:13px;">
              First sample <span class="text-danger">*</span>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" on:click={addSampleItemRow}>
              <i class="ti ti-plus"></i> Item
            </button>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label mb-1" style="font-size:11px;">Direction</label>
              <select class="form-select form-select-sm" bind:value={sampleDirection}>
                <option value="Outbound">Outbound</option>
                <option value="Inbound">Inbound</option>
              </select>
            </div>
            <div class="col-6">
              <label class="form-label mb-1" style="font-size:11px;">Sent date</label>
              <input type="date" class="form-control form-control-sm" bind:value={sampleSentDate} />
            </div>
            <div class="col-12">
              <input class="form-control form-control-sm" bind:value={sampleTracking} placeholder="Tracking / AWB" />
            </div>
          </div>
          {#each sampleItems as item, idx}
            <div class="create-sample-item-row mb-2">
              <input
                class="form-control form-control-sm"
                class:is-invalid={!!formErrors.sampleItems && !item.name?.trim()}
                bind:value={item.name}
                placeholder="Item name *"
                on:input={() => (formErrors.sampleItems = null)}
              />
              <input class="form-control form-control-sm" bind:value={item.quantity} placeholder="Qty" />
              <select class="form-select form-select-sm" bind:value={item.unit}>
                {#each SAMPLE_UNITS as u}<option value={u}>{u}</option>{/each}
              </select>
              <button type="button" class="btn btn-sm btn-outline-danger px-1" on:click={() => removeSampleItemRow(idx)}>
                <i class="ti ti-trash" style="font-size:12px;"></i>
              </button>
            </div>
          {/each}
          {#if formErrors.sampleItems}
            <ul class="text-danger mt-1 mb-2 text-xs"><li>{formErrors.sampleItems[0]}</li></ul>
          {/if}
          <input class="form-control form-control-sm" bind:value={sampleNotes} placeholder="Shipment notes (optional)" />
        </div>
      {/if}

      <!-- Client -->
      <div class="client-section mt-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h6 class="mb-0" style="font-size:13px;">Client</h6>
        </div>

        {#if selectedClient}
          <div class="border rounded p-2 bg-light">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="fw-semibold" style="font-size:13px;">{selectedClient.name}</div>
                {#if selectedClient.gstNumber}
                  <div class="text-muted" style="font-size:11px;">GST: {selectedClient.gstNumber}</div>
                {/if}
              </div>
              <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1" on:click={clearClientSelection}>
                <i class="ti ti-x"></i>
              </button>
            </div>
            {#if selectedClient.contacts?.length > 0}
              <div class="mt-2">
                <div class="text-muted mb-1" style="font-size:11px;">Contacts</div>
                {#each selectedClient.contacts as contact}
                  <label class="d-flex align-items-center gap-2 py-1 mb-0" style="font-size:12px;">
                    <input
                      type="checkbox"
                      checked={selectedContacts.some((c) => c.id === contact.id)}
                      on:change={() => toggleContact(contact)}
                    />
                    <span>
                      <strong>{contact.name}</strong>
                      {#if contact.mobile}<span class="text-muted"> · {contact.mobile}</span>{/if}
                    </span>
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        {:else if pendingNewClient}
          <div class="border rounded p-2 bg-light">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <span class="badge bg-secondary me-1" style="font-size:10px;">New</span>
                <span class="fw-semibold" style="font-size:13px;">{pendingNewClient.name}</span>
                <div class="text-muted" style="font-size:11px;">
                  {pendingNewClient.contactName}
                  {#if pendingNewClient.mobile} · {pendingNewClient.mobile}{/if}
                </div>
              </div>
              <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1" on:click={clearPendingNewClient}>
                <i class="ti ti-x"></i>
              </button>
            </div>
          </div>
        {:else}
          <div class="position-relative mb-2">
            <div class="input-group input-group-sm">
              <input
                type="text"
                class="form-control"
                placeholder="Search client…"
                bind:value={clientSearchQuery}
                on:input={onClientSearchInput}
                autocomplete="off"
              />
              {#if clientSearchLoading}
                <span class="input-group-text"><span class="spinner-border spinner-border-sm"></span></span>
              {/if}
            </div>
            {#if showClientDropdown && clientSearchResults.length > 0}
              <div class="client-dropdown">
                {#each clientSearchResults as client}
                  <button type="button" class="client-dropdown-item" on:click={() => selectClient(client)}>
                    <div class="fw-semibold">{client.name}</div>
                    {#if client.contacts?.length}
                      <div class="text-muted" style="font-size:11px;">
                        {client.contacts.map((c) => c.name).join(", ")}
                      </div>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
            {#if showClientDropdown && clientSearchResults.length === 0 && clientSearchQuery.length > 1}
              <div class="client-dropdown p-2">
                <div class="text-muted mb-2" style="font-size:12px;">No client found</div>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-primary w-100"
                  on:click={() => openCreateClientModal(clientSearchQuery)}
                >
                  + Create “{clientSearchQuery}”
                </button>
              </div>
            {/if}
          </div>

          <button
            type="button"
            class="btn btn-sm btn-outline-secondary mb-2"
            on:click={() => openCreateClientModal()}
          >
            + Create New Client
          </button>

          <div class="text-muted mb-2" style="font-size:11px;">— or quick contact —</div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="form-label mb-1" style="font-size:11px;">
                Contact Name <span class="text-danger">*</span>
              </label>
              <input
                type="text"
                class="form-control form-control-sm"
                class:is-invalid={formErrors.name}
                bind:value={name}
                placeholder="Name"
              />
              {#if formErrors.name}
                <div class="text-danger" style="font-size:11px;">{formErrors.name[0]}</div>
              {/if}
            </div>
            <div>
              <label class="form-label mb-1" style="font-size:11px;">Mobile</label>
              <input type="text" class="form-control form-control-sm" bind:value={mobile} placeholder="Mobile" />
            </div>
          </div>

          <button
            type="button"
            class="btn btn-link btn-sm px-0 mt-1 text-decoration-none"
            on:click={() => (showMoreContactFields = !showMoreContactFields)}
          >
            {showMoreContactFields ? "Hide" : "More"} contact fields
          </button>

          {#if showMoreContactFields}
            <div class="grid grid-cols-2 gap-2 mt-1">
              <input class="form-control form-control-sm" bind:value={email} placeholder="Email" />
              <input class="form-control form-control-sm" bind:value={whatsapp} placeholder="Whatsapp" />
              <input class="form-control form-control-sm" bind:value={designation} placeholder="Designation" />
              <input class="form-control form-control-sm" bind:value={alternateMobile} placeholder="Alt. mobile" />
              <input
                class="form-control form-control-sm"
                style="grid-column:1/-1;"
                bind:value={address}
                placeholder="Address"
              />
            </div>
          {/if}
        {/if}
      </div>

      <div class="d-flex align-items-center justify-content-end gap-2 mt-4 pb-1">
        <button type="button" data-bs-dismiss="offcanvas" class="btn btn-light">Cancel</button>
        <button class="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create New"}
        </button>
      </div>
    </form>
  </div>
</div>

{#if showCreateClientModal}
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.45);z-index:1060;"
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title">Create New Client</h5>
          <button type="button" class="btn-close" on:click={closeCreateClientModal}></button>
        </div>
        <div class="modal-body">
          <div class="row g-2">
            <div class="col-12">
              <label class="form-label">Company Name <span class="text-danger">*</span></label>
              <input
                type="text"
                class="form-control"
                class:is-invalid={formErrors.newClientName}
                bind:value={newClientName}
                placeholder="Company name"
              />
              {#if formErrors.newClientName}
                <div class="text-danger" style="font-size:12px;">{formErrors.newClientName[0]}</div>
              {/if}
            </div>
            <div class="col-md-6">
              <label class="form-label">Contact Name <span class="text-danger">*</span></label>
              <input
                type="text"
                class="form-control"
                class:is-invalid={formErrors.newClientContactName}
                bind:value={newClientContactName}
                placeholder="Contact person"
              />
            </div>
            <div class="col-md-6">
              <label class="form-label">Mobile</label>
              <input type="text" class="form-control" bind:value={newClientMobile} placeholder="Mobile" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Email</label>
              <input type="email" class="form-control" bind:value={newClientEmail} placeholder="Email" />
            </div>
            <div class="col-md-6">
              <label class="form-label">GST Number</label>
              <input type="text" class="form-control" bind:value={newClientGst} placeholder="GST" />
            </div>
            <div class="col-12">
              <label class="form-label">Address</label>
              <input type="text" class="form-control" bind:value={newClientAddress} placeholder="Address" />
            </div>
          </div>
        </div>
        <div class="modal-footer py-2">
          <button type="button" class="btn btn-light btn-sm" on:click={closeCreateClientModal}>Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" on:click={confirmCreateClient}>
            Use this client
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.offcanvas-add-order.offcanvas-end) {
    width: min(460px, 100vw) !important;
  }

  .create-order-form :global(.form-label) {
    font-size: 12px;
    margin-bottom: 4px;
  }

  .order-type-block {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px 10px;
    background: #fafafa;
  }

  .order-type-block.is-sample {
    border-color: #7dd3fc;
    background: #f0f9ff;
  }

  .order-type-option {
    flex: 1 1 120px;
    display: flex;
    flex-direction: column;
    padding: 6px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    margin: 0;
  }

  .order-type-option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .order-type-option.active {
    border-color: #0ea5e9;
    box-shadow: 0 0 0 1px #0ea5e9;
  }

  .order-type-title {
    font-size: 12px;
    font-weight: 600;
    color: #111827;
  }

  .more-fields-panel {
    border: 1px solid #f1f5f9;
    border-radius: 8px;
    padding: 10px;
    background: #fafafa;
  }

  .create-sample-block {
    border: 1px solid #bae6fd;
    background: #f0f9ff;
    border-radius: 8px;
    padding: 10px;
  }

  .create-sample-item-row {
    display: grid;
    grid-template-columns: 1fr 52px 68px 28px;
    gap: 6px;
    align-items: center;
  }

  .client-dropdown {
    position: absolute;
    z-index: 9999;
    width: 100%;
    max-height: 200px;
    overflow-y: auto;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }

  .client-dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    border: 0;
    border-bottom: 1px solid #f1f5f9;
    background: #fff;
    padding: 8px 12px;
    font-size: 13px;
  }

  .client-dropdown-item:hover {
    background: #f8fafc;
  }
</style>
