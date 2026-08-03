<script>
  import { createEventDispatcher } from "svelte";
  import jQuery from "jquery";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import TypeableSelect from "$lib/components/TypeableSelect.svelte";

  export let categories = [];

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

  // Fallback contact fields
  let name = "";
  let email = "";
  let mobile = "";
  let whatsapp = "";
  let address = "";
  let alternateMobile = "";
  let designation = "";
  let remark = "";

  // Client search state
  let clientSearchQuery = "";
  let clientSearchResults = [];
  let clientSearchLoading = false;
  let selectedClient = null;
  let showCreateClient = false;
  let showClientDropdown = false;
  let selectedContacts = [];

  // New client form fields
  let newClientName = "";
  let newClientGst = "";
  let newClientAddress = "";
  let newClientEmail = "";
  let newClientMobile = "";

  let loading = false;
  let errorMessage = "";
  let formErrors = {};

  let clientSearchTimer = null;

  const currencies = [
    { code: "INR", symbol: "₹" },
    { code: "USD", symbol: "$" },
  ];
  const sources = ["Whatsapp", "Website", "Mail"];

  async function searchClients(q) {
    if (!q || q.trim().length < 1) { clientSearchResults = []; showClientDropdown = false; return; }
    clientSearchLoading = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT}/search?q=${encodeURIComponent(q)}`, { method: "GET" });
      clientSearchResults = res.data || [];
      showClientDropdown = true;
    } catch (e) { clientSearchResults = []; }
    clientSearchLoading = false;
  }

  function onClientSearchInput() {
    clearTimeout(clientSearchTimer);
    selectedClient = null; showCreateClient = false;
    clientSearchTimer = setTimeout(() => searchClients(clientSearchQuery), 300);
  }

  function selectClient(client) {
    selectedClient = client;
    clientSearchQuery = client.name;
    showClientDropdown = false;
    showCreateClient = false;
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
    selectedClient = null; clientSearchQuery = ""; showCreateClient = false;
    selectedContacts = []; clientSearchResults = []; showClientDropdown = false;
    company = ""; gstNumber = "";
  }

  function resetForm() {
    title = ""; category = ""; orderDate = null; startDate = null;
    deadlineDate = null; price = null; currency = "INR"; priceTerms = null;
    source = null; description = ""; company = ""; gstNumber = "";
    name = ""; email = ""; mobile = ""; alternateMobile = ""; whatsapp = "";
    address = ""; designation = ""; remark = "";
    newClientName = ""; newClientGst = ""; newClientAddress = "";
    newClientEmail = ""; newClientMobile = "";
    clearClientSelection();
  }

  function closeOffcanvas() {
    jQuery("#offcanvas_add").removeClass("show");
    jQuery(".offcanvas-backdrop").remove();
    jQuery("body").css({ overflow: "", paddingRight: "" });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    errorMessage = "";
    loading = true;
    formErrors = {};

    const newOrder = { title, price, currency, priceTerms, source, description, company, gstNumber };
    newOrder.category = category || "";
    if (orderDate) newOrder.orderDate = orderDate;
    if (startDate) newOrder.startDate = startDate;
    if (deadlineDate) newOrder.deadlineDate = deadlineDate;
    if (price) newOrder.price = Number(price);

    if (selectedClient) {
      newOrder.clientId = selectedClient.id;
      if (selectedContacts.length > 0) {
        newOrder.orderClients = selectedContacts.map((c) => ({
          name: c.name, mobile: c.mobile, email: c.email,
          designation: c.designation, whatsapp: c.whatsapp,
          alternateMobile: c.alternateMobile, address: c.address,
        }));
      }
    } else if (showCreateClient && newClientName) {
      newOrder.company = newClientName;
      newOrder.gstNumber = newClientGst || gstNumber;
      newOrder.orderClients = [{
        name: newClientName, mobile: newClientMobile, email: newClientEmail,
        address: newClientAddress, designation: "", whatsapp: "",
      }];
    } else {
      newOrder.orderClients = [{ name, mobile, email, whatsapp, address, alternateMobile, designation, remark }];
    }

    newOrder.orderActivity = { title: "Order Created", description: "A new order has been created." };

    if (title === "") { formErrors.title = ["Title is required."]; loading = false; return; }
    if (!selectedClient && !showCreateClient && name === "") {
      formErrors.name = ["Name is required."]; loading = false; return;
    }
    if (showCreateClient && !newClientName) {
      formErrors.newClientName = ["Client name is required."]; loading = false; return;
    }

    try {
      const data = await authApiFetch(API_ROUTES.ORDER, {
        method: "POST",
        data: JSON.stringify(newOrder),
      });
      Swal.fire("Success!", data.message, "success");
      resetForm();
      closeOffcanvas();
      dispatch("created");
    } catch (error) {
      const validationErrors = errorHandle(error);
      if (validationErrors && typeof validationErrors === "object") {
        formErrors = validationErrors;
      } else {
        errorMessage = "An unexpected error occurred.";
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="offcanvas offcanvas-end offcanvas-large" tabindex="-1" id="offcanvas_add">
  <div class="offcanvas-header border-bottom">
    <h5 class="mb-0">Add New Order</h5>
    <button
      type="button"
      class="btn-close custom-btn-close border p-1 me-0 d-flex align-items-center justify-content-center rounded-circle"
      data-bs-dismiss="offcanvas"
      aria-label="Close"
    ></button>
  </div>
  <div class="offcanvas-body">
    <form on:submit={handleSubmit} class="needs-validation space-y-4" novalidate>
      <div class="grid grid-cols-2 gap-4">
        <!-- Title -->
        <div>
          <label class="form-label" for="title">Title <span class="text-danger">*</span></label>
          <input type="text" name="title" class="form-control" class:is-invalid={formErrors.title}
            bind:value={title} required id="title" placeholder="Title" />
          {#if formErrors.title}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.title[0]}</li></ul>
          {/if}
        </div>

        <!-- Category -->
        <div>
          <label class="form-label" for="category">Category</label>
          {#key categories.length}
            <TypeableSelect id="category" options={categories} grouped={true}
              value={category !== "" ? category : null} placeholder="Select Category"
              on:change={(e) => (category = e.detail)} />
          {/key}
          {#if formErrors.category}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.category[0]}</li></ul>
          {/if}
        </div>

        <!-- Order Date -->
        <div>
          <label class="form-label" for="orderDate">Order Date</label>
          <input type="date" name="orderDate" class="form-control" class:is-invalid={formErrors.orderDate}
            bind:value={orderDate} id="orderDate" />
          {#if formErrors.orderDate}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.orderDate[0]}</li></ul>
          {/if}
        </div>

        <!-- Start Date -->
        <div>
          <label class="form-label" for="startDate">Start Date</label>
          <input type="date" name="startDate" class="form-control" class:is-invalid={formErrors.startDate}
            bind:value={startDate} id="startDate" />
          {#if formErrors.startDate}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.startDate[0]}</li></ul>
          {/if}
        </div>

        <!-- Deadline Date -->
        <div>
          <label class="form-label" for="deadlineDate">Deadline Date</label>
          <input type="date" name="deadlineDate" class="form-control" class:is-invalid={formErrors.deadlineDate}
            bind:value={deadlineDate} id="deadlineDate" />
          {#if formErrors.deadlineDate}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.deadlineDate[0]}</li></ul>
          {/if}
        </div>

        <!-- Price -->
        <div>
          <label class="form-label" for="price">Price</label>
          <div
            class="!flex items-center rounded-md bg-white !p-0 !pl-3 outline-1 -outline-offset-1 outline-gray-300 has-[input:focus-within]:outline-2 has-[input:focus-within]:-outline-offset-2 has-[input:focus-within]:outline-indigo-600 form-control"
            class:is-invalid={formErrors.price}
            class:border={!formErrors.price}
          >
            <div class="shrink-0 text-base text-gray-500 select-none sm:text-sm/6">
              {currencies.find((c) => c.code === currency)?.symbol}
            </div>
            <input id="price" type="number" name="price" bind:value={price} placeholder="0.00"
              class="block min-w-0 grow py-1.5 pr-3 pl-1 text-base placeholder:text-gray-400 focus:outline-none sm:text-sm/6" />
            <div class="grid shrink-0 grid-cols-1 focus-within:relative">
              <select id="currency" name="currency" bind:value={currency} aria-label="Currency"
                class="col-start-1 row-start-1 w-full border-l appearance-none rounded-md rounded-l-[0px] py-1.5 pr-7 pl-3 text-base text-gray-500 focus:outline-0 sm:text-sm/6">
                {#each currencies as c}
                  <option value={c.code}>{c.code}</option>
                {/each}
              </select>
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"
                class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4">
                <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                  clip-rule="evenodd" fill-rule="evenodd" />
              </svg>
            </div>
          </div>
          {#if formErrors.price}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.price[0]}</li></ul>
          {/if}
        </div>

        <!-- Price Terms -->
        <div>
          <label class="form-label" for="priceTerms">Price Terms</label>
          <input type="text" name="priceTerms" class="form-control" class:is-invalid={formErrors.priceTerms}
            bind:value={priceTerms} id="priceTerms" placeholder="Price Terms" />
          {#if formErrors.priceTerms}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.priceTerms[0]}</li></ul>
          {/if}
        </div>

        <!-- Source -->
        <div>
          <label class="form-label" for="source">Source</label>
          <TypeableSelect id="source" options={sources} value={source} placeholder="Select Source"
            on:change={(e) => (source = e.detail)} />
          {#if formErrors.source}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.source[0]}</li></ul>
          {/if}
        </div>

        <!-- Company -->
        <div>
          <label class="form-label" for="company">Company</label>
          <input type="text" name="company" class="form-control" class:is-invalid={formErrors.company}
            bind:value={company} id="company" placeholder="Company" />
          {#if formErrors.company}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.company[0]}</li></ul>
          {/if}
        </div>

        <!-- GST Number -->
        <div>
          <label class="form-label" for="gstNumber">GST Number</label>
          <input type="text" name="gstNumber" class="form-control" class:is-invalid={formErrors.gstNumber}
            bind:value={gstNumber} id="gstNumber" placeholder="GST Number" />
          {#if formErrors.gstNumber}
            <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.gstNumber[0]}</li></ul>
          {/if}
        </div>
      </div>

      <!-- Description -->
      <div class="col-span-2">
        <label class="form-label" for="description">Description</label>
        <textarea name="description" id="description" class="form-control"
          class:is-invalid={formErrors.description} bind:value={description}
          placeholder="Description"></textarea>
        {#if formErrors.description}
          <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.description[0]}</li></ul>
        {/if}
      </div>

      <hr />
      <h6>Client</h6>

      <!-- Client Search -->
      {#if !selectedClient && !showCreateClient}
        <div class="position-relative mb-3">
          <label class="form-label">Search Client</label>
          <div class="input-group">
            <input type="text" class="form-control" placeholder="Search by name, mobile, email..."
              bind:value={clientSearchQuery} on:input={onClientSearchInput} autocomplete="off" />
            {#if clientSearchLoading}
              <span class="input-group-text"><span class="spinner-border spinner-border-sm"></span></span>
            {/if}
          </div>
          {#if showClientDropdown && clientSearchResults.length > 0}
            <div class="border rounded bg-white position-absolute w-100 shadow-sm"
              style="z-index:9999;max-height:220px;overflow-y:auto;">
              {#each clientSearchResults as client}
                <button type="button" class="d-block w-100 text-start px-3 py-2 border-bottom hover:bg-gray-50"
                  on:click={() => selectClient(client)}>
                  <div class="fw-semibold">{client.name}</div>
                  {#if client.contacts?.length > 0}
                    <div class="text-muted small">{client.contacts.map((c) => c.name).join(", ")}</div>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
          {#if showClientDropdown && clientSearchResults.length === 0 && clientSearchQuery.length > 1}
            <div class="border rounded bg-white position-absolute w-100 shadow-sm px-3 py-2" style="z-index:9999;">
              <div class="text-muted small mb-2">No client found</div>
              <button type="button" class="btn btn-sm btn-outline-primary"
                on:click={() => { showCreateClient = true; newClientName = clientSearchQuery; showClientDropdown = false; }}>
                + Create New Client
              </button>
            </div>
          {/if}
        </div>
        <div class="text-center text-muted small mb-3">— or —</div>
        <button type="button" class="btn btn-sm btn-outline-secondary mb-3"
          on:click={() => { showCreateClient = true; showClientDropdown = false; }}>
          + Create New Client
        </button>
      {/if}

      <!-- Selected existing client -->
      {#if selectedClient}
        <div class="border rounded p-3 mb-3 bg-light">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div class="fw-bold"><i class="ti ti-building-store me-1"></i>{selectedClient.name}</div>
              {#if selectedClient.gstNumber}
                <div class="text-muted small">GST: {selectedClient.gstNumber}</div>
              {/if}
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger" on:click={clearClientSelection}>
              <i class="ti ti-x"></i>
            </button>
          </div>
          {#if selectedClient.contacts?.length > 0}
            <div class="mt-2">
              <div class="small text-muted mb-1">Select contacts for this order:</div>
              {#each selectedClient.contacts as contact}
                <label class="d-flex align-items-center gap-2 py-1 cursor-pointer">
                  <input type="checkbox"
                    checked={selectedContacts.some((c) => c.id === contact.id)}
                    on:change={() => toggleContact(contact)} />
                  <span class="small">
                    <strong>{contact.name}</strong>
                    {#if contact.designation}<span class="text-muted"> · {contact.designation}</span>{/if}
                    {#if contact.mobile}<span class="text-muted"> · {contact.mobile}</span>{/if}
                  </span>
                </label>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Create new client form -->
      {#if showCreateClient}
        <div class="border rounded p-3 mb-3 bg-light">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0">New Client</h6>
            <button type="button" class="btn btn-sm btn-outline-secondary"
              on:click={() => { showCreateClient = false; newClientName = ""; }}>
              <i class="ti ti-x"></i>
            </button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">Company Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control" class:is-invalid={formErrors.newClientName}
                bind:value={newClientName} placeholder="Company name" />
              {#if formErrors.newClientName}
                <ul class="text-danger mt-1 text-xs"><li>{formErrors.newClientName[0]}</li></ul>
              {/if}
            </div>
            <div>
              <label class="form-label">GST Number</label>
              <input type="text" class="form-control" bind:value={newClientGst} placeholder="GST number" />
            </div>
            <div>
              <label class="form-label">Contact Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control" bind:value={name} placeholder="Contact person name" />
            </div>
            <div>
              <label class="form-label">Mobile</label>
              <input type="text" class="form-control" bind:value={newClientMobile} placeholder="Mobile" />
            </div>
            <div>
              <label class="form-label">Email</label>
              <input type="email" class="form-control" bind:value={newClientEmail} placeholder="Email" />
            </div>
            <div>
              <label class="form-label">Address</label>
              <input type="text" class="form-control" bind:value={newClientAddress} placeholder="Address" />
            </div>
          </div>
        </div>
      {/if}

      <!-- Fallback: inline contact form -->
      {#if !selectedClient && !showCreateClient}
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label" for="name">Contact Name <span class="text-danger">*</span></label>
            <input type="text" name="name" class="form-control" class:is-invalid={formErrors.name}
              bind:value={name} id="name" placeholder="Name" />
            {#if formErrors.name}
              <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.name[0]}</li></ul>
            {/if}
          </div>
          <div>
            <label class="form-label" for="designation">Designation</label>
            <input type="text" name="designation" class="form-control" bind:value={designation}
              id="designation" placeholder="Designation" />
          </div>
          <div>
            <label class="form-label" for="email">Email</label>
            <input type="email" name="email" class="form-control" bind:value={email}
              id="email" placeholder="Email" />
          </div>
          <div>
            <label class="form-label" for="mobile">Mobile</label>
            <input type="text" name="mobile" class="form-control" bind:value={mobile}
              id="mobile" placeholder="Mobile" />
          </div>
          <div>
            <label class="form-label" for="alternateMobile">Alternate Mobile</label>
            <input type="text" name="alternateMobile" class="form-control" bind:value={alternateMobile}
              id="alternateMobile" placeholder="Alternate Mobile" />
          </div>
          <div>
            <label class="form-label" for="whatsapp">Whatsapp</label>
            <input type="text" name="whatsapp" class="form-control" bind:value={whatsapp}
              id="whatsapp" placeholder="Whatsapp" />
          </div>
          <div>
            <label class="form-label" for="address">Address</label>
            <input type="text" name="address" class="form-control" bind:value={address}
              id="address" placeholder="Address" />
          </div>
        </div>
      {/if}

      <div class="d-flex align-items-center justify-content-end mt-4">
        <button type="button" data-bs-dismiss="offcanvas" class="btn btn-light me-2">Cancel</button>
        <button class="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create New"}
        </button>
      </div>
    </form>
  </div>
</div>
