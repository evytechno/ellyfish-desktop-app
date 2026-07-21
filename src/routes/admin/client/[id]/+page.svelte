<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import { statusNamesStore } from "$lib/stores/statusNames";

  let loadingData = true;
  let loading = false;
  let currentUser;
  let client = null;
  let formErrors = {};

  // Edit client fields
  let editName = "";
  let editGst = "";
  let editEmail = "";
  let editMobile = "";
  let editWhatsapp = "";
  let editAddress = "";
  let editRemark = "";
  let editLoading = false;
  let isEditing = false;

  // Add contact form
  let showContactForm = false;
  let contactFormLoading = false;
  let contactName = "";
  let contactDesignation = "";
  let contactMobile = "";
  let contactEmail = "";
  let contactWhatsapp = "";
  let contactAltMobile = "";
  let contactAddress = "";
  let contactFormErrors = {};

  // Edit contact
  let editingContact = null;
  let editContactLoading = false;

  $: clientId = $page.params.id;

  // Role helpers
  $: canEdit = currentUser?.role === "master" || currentUser?.subRole === "telecaller";
  $: canView = canEdit || currentUser?.role === "admin" || currentUser?.role === "manager" || currentUser?.role === "user";
  $: visibleOrders = currentUser?.role === "user"
    ? (client?.orders ?? []).filter((o) =>
        o.assignedUsers?.some((u) => u.id === Number(currentUser.id))
      )
    : (client?.orders ?? []);

  onMount(async () => {
    currentUser = checkAuth();

    // Recompute after currentUser is set
    const _canEdit = currentUser?.role === "master" || currentUser?.subRole === "telecaller";
    const _canView = _canEdit || currentUser?.role === "admin" || currentUser?.role === "manager" || currentUser?.role === "user";

    if (!_canView) {
      loadingData = false;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "You are not authorized to view this page.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return;
    }
    await fetchClient();
  });

  async function fetchClient() {
    loadingData = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT}/${clientId}`, { method: "GET" });
      client = res.data;
      editName      = client.name        || "";
      editGst       = client.gstNumber   || "";
      editEmail     = client.email       || "";
      editMobile    = client.mobile      || "";
      editWhatsapp  = client.whatsapp    || "";
      editAddress   = client.address     || "";
      editRemark    = client.remark      || "";
    } catch (e) {
      Swal.fire("Error!", "Failed to load client.", "error");
    } finally {
      setTimeout(() => { loadingData = false; }, 300);
    }
  }

  async function saveClient(e) {
    e.preventDefault();
    formErrors = {};
    if (!editName) { formErrors.editName = ["Name is required."]; return; }
    editLoading = true;
    try {
      const payload = { name: editName };
      if (editGst)      payload.gstNumber  = editGst;
      if (editEmail)    payload.email      = editEmail;
      if (editMobile)   payload.mobile     = editMobile;
      if (editWhatsapp) payload.whatsapp   = editWhatsapp;
      if (editAddress)  payload.address    = editAddress;
      if (editRemark)   payload.remark     = editRemark;
      const res = await authApiFetch(`${API_ROUTES.CLIENT}/${clientId}`, {
        method: "PUT",
        data: JSON.stringify(payload),
      });
      client = { ...client, ...res.data };
      isEditing = false;
      Swal.fire("Saved!", "Client updated successfully.", "success");
    } catch (error) {
      const errs = errorHandle(error);
      if (errs && typeof errs === "object") formErrors = errs;
      else Swal.fire("Error!", "Failed to update client.", "error");
    } finally {
      editLoading = false;
    }
  }

  let addMoreLoading = false;

  async function addContact(e, keepOpen = false) {
    e.preventDefault();
    contactFormErrors = {};
    if (!contactName) { contactFormErrors.contactName = ["Name is required."]; return; }
    if (keepOpen) addMoreLoading = true; else contactFormLoading = true;
    try {
      const res = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          clientId: Number(clientId),
          name: contactName,
          ...(contactDesignation  && { designation:     contactDesignation }),
          ...(contactMobile       && { mobile:          contactMobile }),
          ...(contactEmail        && { email:           contactEmail }),
          ...(contactWhatsapp     && { whatsapp:        contactWhatsapp }),
          ...(contactAltMobile    && { alternateMobile: contactAltMobile }),
          ...(contactAddress      && { address:         contactAddress }),
        }),
      });
      client.contacts = [...(client.contacts || []), res.data];
      contactName = ""; contactDesignation = ""; contactMobile = "";
      contactEmail = ""; contactWhatsapp = ""; contactAltMobile = ""; contactAddress = "";
      if (keepOpen) {
        Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Contact saved!", showConfirmButton: false, timer: 1500 });
      } else {
        showContactForm = false;
        Swal.fire("Success!", "Contact added.", "success");
      }
    } catch (error) {
      const errs = errorHandle(error);
      if (errs && typeof errs === "object") contactFormErrors = errs;
      else Swal.fire("Error!", "Failed to add contact.", "error");
    } finally {
      contactFormLoading = false;
      addMoreLoading = false;
    }
  }

  function startEditContact(contact) {
    editingContact = { ...contact };
  }

  async function saveContact(e) {
    e.preventDefault();
    if (!editingContact?.name) return;
    editContactLoading = true;
    try {
      const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...contactPayload } = editingContact;
      // Strip empty strings so optional @IsEmail / @IsString validators don't reject them
      const cleanPayload = Object.fromEntries(Object.entries(contactPayload).filter(([, v]) => v !== ""));
      const res = await authApiFetch(`${API_ROUTES.CLIENT_CONTACT}/${editingContact.id}`, {
        method: "PUT",
        data: JSON.stringify(cleanPayload),
      });
      client.contacts = client.contacts.map(c => c.id === editingContact.id ? res.data : c);
      editingContact = null;
      Swal.fire("Saved!", "Contact updated.", "success");
    } catch (e) {
      Swal.fire("Error!", "Failed to update contact.", "error");
    } finally {
      editContactLoading = false;
    }
  }

  async function deleteContact(id, name) {
    Swal.fire({
      title: "Archive Contact?",
      text: `Archive "${name}" from this client?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, archive it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.CLIENT_CONTACT}/${id}`, { method: "DELETE" });
          client.contacts = client.contacts.filter(c => c.id !== id);
          Swal.fire("Archived!", data.message, "success");
        } catch (e) {
          Swal.fire("Error!", "Failed to archive contact.", "error");
        }
      }
    });
  }

  async function deleteClient() {
    Swal.fire({
      title: "Archive Client?",
      text: `Archive "${client?.name}" and all its data?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, archive it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.CLIENT}/${clientId}`, { method: "DELETE" });
          Swal.fire("Archived!", data.message, "success");
          goto("/admin/client");
        } catch (e) {
          Swal.fire("Error!", "Failed to archive client.", "error");
        }
      }
    });
  }

  function formatDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2,"0")}-${String(dt.getMonth()+1).padStart(2,"0")}-${dt.getFullYear()}`;
  }
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper">
  <div class="content pb-0">

    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div class="d-flex align-items-center gap-3">
        <button class="btn btn-warning btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <h4 class="mb-1">{client?.name || "Client Detail"}</h4>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0 p-0">
              <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
              {#if canEdit}
                <li class="breadcrumb-item"><a href="/admin/client">Clients</a></li>
              {:else}
                <li class="breadcrumb-item">Clients</li>
              {/if}
              <li class="breadcrumb-item active" aria-current="page">
                {client?.name || "Detail"}
              </li>
            </ol>
          </nav>
        </div>
      </div>
      <div class="gap-2 d-flex align-items-center flex-wrap">
        <a href="/admin/client-visit/add?clientId={clientId}" class="btn btn-success shadow">
          <i class="ti ti-map-pin me-1"></i>Create Visit
        </a>
        {#if canEdit}
          <button class="btn btn-outline-danger shadow" on:click={deleteClient}>
            <i class="ti ti-archive me-1"></i>Archive
          </button>
        {/if}
      </div>
    </div>

    <div class="row g-4">

      <!-- Left: Client Info -->
      <div class="col-md-4">
        <div class="card border-0 rounded-0">
          <div class="card-header d-flex align-items-center justify-content-between">
            <h5 class="mb-0">
              <i class="ti ti-building-store me-2 text-primary"></i>Client Info
            </h5>
            {#if canEdit && !isEditing}
              <button class="btn btn-outline-primary btn-sm" on:click={() => isEditing = true}>
                <i class="ti ti-edit me-1"></i>Edit
              </button>
            {/if}
          </div>
          <div class="card-body">

            {#if canEdit && isEditing}
              <!-- Edit form -->
              <form on:submit={saveClient} novalidate>
                <div class="mb-3">
                  <label class="form-label">Company Name <span class="text-danger">*</span></label>
                  <input class="form-control" class:is-invalid={formErrors.editName}
                    type="text" bind:value={editName} placeholder="Company name" />
                  {#if formErrors.editName}
                    <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.editName[0]}</li></ul>
                  {/if}
                </div>
                <div class="mb-3">
                  <label class="form-label">GST Number</label>
                  <input class="form-control" type="text" bind:value={editGst} placeholder="GST number" />
                </div>
                <div class="mb-3">
                  <label class="form-label">Mobile</label>
                  <input class="form-control" type="text" bind:value={editMobile} placeholder="Mobile" />
                </div>
                <div class="mb-3">
                  <label class="form-label">Email</label>
                  <input class="form-control" type="email" bind:value={editEmail} placeholder="Email" />
                </div>
                <div class="mb-3">
                  <label class="form-label">Whatsapp</label>
                  <input class="form-control" type="text" bind:value={editWhatsapp} placeholder="Whatsapp" />
                </div>
                <div class="mb-3">
                  <label class="form-label">Address</label>
                  <textarea class="form-control" bind:value={editAddress} placeholder="Address" rows="2"></textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Remark</label>
                  <textarea class="form-control" bind:value={editRemark} placeholder="Remark" rows="2"></textarea>
                </div>
                <div class="d-flex justify-content-end gap-2">
                  <button type="button" class="btn btn-secondary btn-sm" on:click={() => isEditing = false} disabled={editLoading}>
                    Cancel
                  </button>
                  <button type="submit" class="btn btn-primary btn-sm" disabled={editLoading}>
                    {editLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>

            {:else}
              <!-- Read-only view -->
              <table class="table table-sm table-borderless mb-0">
                <tbody>
                  <tr>
                    <td class="text-muted small" style="width:35%">Company</td>
                    <td class="fw-semibold">{client?.name || "—"}</td>
                  </tr>
                  <tr>
                    <td class="text-muted small">GST</td>
                    <td>{client?.gstNumber || "—"}</td>
                  </tr>
                  <tr>
                    <td class="text-muted small">Mobile</td>
                    <td>{client?.mobile || "—"}</td>
                  </tr>
                  <tr>
                    <td class="text-muted small">Email</td>
                    <td>{client?.email || "—"}</td>
                  </tr>
                  <tr>
                    <td class="text-muted small">Whatsapp</td>
                    <td>{client?.whatsapp || "—"}</td>
                  </tr>
                  <tr>
                    <td class="text-muted small">Address</td>
                    <td>{client?.address || "—"}</td>
                  </tr>
                  <tr>
                    <td class="text-muted small">Remark</td>
                    <td>{client?.remark || "—"}</td>
                  </tr>
                </tbody>
              </table>
            {/if}

          </div>
        </div>
      </div>

      <!-- Right: Contacts + Orders -->
      <div class="col-md-8">

        <!-- Contacts Card -->
        <div class="card border-0 rounded-0 mb-4">
          <div class="card-header flex items-center justify-between gap-2 flex-wrap">
            <h5 class="mb-0">
              <i class="ti ti-users me-2 text-primary"></i>Contacts
              <span class="badge bg-info text-white ms-1">{client?.contacts?.length || 0}</span>
            </h5>
            {#if canEdit}
              <button
                class="btn btn-primary btn-sm"
                on:click={() => { showContactForm = !showContactForm; editingContact = null; }}
              >
                <i class="ti ti-square-rounded-plus-filled me-1"></i>Add Contact
              </button>
            {/if}
          </div>

          <div class="card-body">
            <!-- Add Contact Form — canEdit only -->
            {#if canEdit && showContactForm}
              <form on:submit={addContact} class="border rounded p-3 mb-4 bg-light">
                <h6 class="mb-3 fw-semibold">New Contact</h6>
                <div class="grid grid-cols-3 gap-3">
                  <div>
                    <label class="form-label">Name <span class="text-danger">*</span></label>
                    <input
                      class="form-control"
                      class:is-invalid={contactFormErrors.contactName}
                      type="text"
                      bind:value={contactName}
                      placeholder="Contact name"
                    />
                    {#if contactFormErrors.contactName}
                      <ul class="text-danger mt-1 text-xs capitalize"><li>{contactFormErrors.contactName[0]}</li></ul>
                    {/if}
                  </div>
                  <div>
                    <label class="form-label">Designation</label>
                    <input class="form-control" type="text" bind:value={contactDesignation} placeholder="e.g. Manager" />
                  </div>
                  <div>
                    <label class="form-label">Mobile</label>
                    <input class="form-control" type="text" bind:value={contactMobile} placeholder="Mobile" />
                  </div>
                  <div>
                    <label class="form-label">Email</label>
                    <input class="form-control" type="email" bind:value={contactEmail} placeholder="Email" />
                  </div>
                  <div>
                    <label class="form-label">Whatsapp</label>
                    <input class="form-control" type="text" bind:value={contactWhatsapp} placeholder="Whatsapp" />
                  </div>
                  <div>
                    <label class="form-label">Alt. Mobile</label>
                    <input class="form-control" type="text" bind:value={contactAltMobile} placeholder="Alternate mobile" />
                  </div>
                  <div class="col-span-3">
                    <label class="form-label">Address</label>
                    <input class="form-control" type="text" bind:value={contactAddress} placeholder="Address" />
                  </div>
                </div>
                <div class="flex justify-end gap-2 mt-3">
                  <button type="button" class="btn btn-light btn-sm" on:click={() => showContactForm = false}>Cancel</button>
                  <button type="button" class="btn btn-outline-primary btn-sm" disabled={addMoreLoading || contactFormLoading} on:click={(e) => addContact(e, true)}>
                    {addMoreLoading ? "Saving..." : "Save & Add More"}
                  </button>
                  <button type="submit" class="btn btn-primary btn-sm" disabled={contactFormLoading || addMoreLoading}>
                    {contactFormLoading ? "Saving..." : "Add Contact"}
                  </button>
                </div>
              </form>
            {/if}

            <!-- Edit Contact Form — canEdit only -->
            {#if canEdit && editingContact}
              <form on:submit={saveContact} class="border rounded p-3 mb-4 bg-light border-warning">
                <h6 class="mb-3 fw-semibold">Edit Contact — {editingContact.name}</h6>
                <div class="grid grid-cols-3 gap-3">
                  <div>
                    <label class="form-label">Name <span class="text-danger">*</span></label>
                    <input class="form-control" type="text" bind:value={editingContact.name} placeholder="Name" />
                  </div>
                  <div>
                    <label class="form-label">Designation</label>
                    <input class="form-control" type="text" bind:value={editingContact.designation} placeholder="Designation" />
                  </div>
                  <div>
                    <label class="form-label">Mobile</label>
                    <input class="form-control" type="text" bind:value={editingContact.mobile} placeholder="Mobile" />
                  </div>
                  <div>
                    <label class="form-label">Email</label>
                    <input class="form-control" type="email" bind:value={editingContact.email} placeholder="Email" />
                  </div>
                  <div>
                    <label class="form-label">Whatsapp</label>
                    <input class="form-control" type="text" bind:value={editingContact.whatsapp} placeholder="Whatsapp" />
                  </div>
                  <div>
                    <label class="form-label">Alt. Mobile</label>
                    <input class="form-control" type="text" bind:value={editingContact.alternateMobile} placeholder="Alternate mobile" />
                  </div>
                  <div class="col-span-3">
                    <label class="form-label">Address</label>
                    <input class="form-control" type="text" bind:value={editingContact.address} placeholder="Address" />
                  </div>
                </div>
                <div class="flex justify-end gap-2 mt-3">
                  <button type="button" class="btn btn-light btn-sm" on:click={() => editingContact = null}>Cancel</button>
                  <button type="submit" class="btn btn-warning btn-sm" disabled={editContactLoading}>
                    {editContactLoading ? "Saving..." : "Save Contact"}
                  </button>
                </div>
              </form>
            {/if}

            <!-- Contacts Table -->
            {#if !client?.contacts || client.contacts.length === 0}
              <div class="text-center py-4 text-muted">
                <i class="ti ti-users fs-1 d-block mb-2"></i>
                No contacts yet. Add the first contact above.
              </div>
            {:else}
              <div class="table-responsive">
                <table class="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                  <thead>
                    <tr class="bg-gray-100 text-left text-gray-700 uppercase text-sm">
                      <th class="px-4 py-2">Name</th>
                      <th class="px-4 py-2">Designation</th>
                      <th class="px-4 py-2">Mobile</th>
                      <th class="px-4 py-2">Email</th>
                      <th class="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each client.contacts as contact}
                      <tr class="border-t hover:bg-gray-50">
                        <td class="px-4 py-2 fw-semibold">{contact.name}</td>
                        <td class="px-4 py-2 text-muted small">{contact.designation || "—"}</td>
                        <td class="px-4 py-2 small">{contact.mobile || "—"}</td>
                        <td class="px-4 py-2 small">{contact.email || "—"}</td>
                        <td class="px-4 py-2">
                          {#if canEdit}
                            <div class="d-inline-flex gap-2">
                              <button
                                class="btn btn-icon btn-sm rounded-pill btn-soft-info"
                                on:click={() => { startEditContact(contact); showContactForm = false; }}
                                title="Edit"
                              >
                                <i class="ti ti-edit"></i>
                              </button>
                              <button
                                class="btn btn-icon btn-sm rounded-pill btn-soft-danger"
                                on:click={() => deleteContact(contact.id, contact.name)}
                                title="Archive"
                              >
                                <i class="ti ti-trash"></i>
                              </button>
                            </div>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>

        <!-- Orders Card -->
        <div class="card border-0 rounded-0">
          <div class="card-header">
            <h5 class="mb-0">
              <i class="ti ti-medal me-2 text-primary"></i>Orders
              <span class="badge bg-primary ms-1">{visibleOrders.length}</span>
            </h5>
          </div>
          <div class="card-body">
            {#if visibleOrders.length === 0}
              <div class="text-center py-4 text-muted">
                <i class="ti ti-medal fs-1 d-block mb-2"></i>
                No orders linked to this client.
              </div>
            {:else}
              <div class="table-responsive">
                <table class="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                  <thead>
                    <tr class="bg-gray-100 text-left text-gray-700 uppercase text-sm">
                      <th class="px-4 py-2">#</th>
                      <th class="px-4 py-2">Title</th>
                      <th class="px-4 py-2">Status</th>
                      <th class="px-4 py-2">Order Date</th>
                      <th class="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each visibleOrders as order}
                      <tr class="border-t hover:bg-gray-50">
                        <td class="px-4 py-2 text-muted small">{order.pId}</td>
                        <td class="px-4 py-2 fw-semibold">{order.pId ? `#${order.pId} - ${order.title || ""}` : (order.title || "-")}</td>
                        <td class="px-4 py-2">
                          <span class="badge bg-secondary">{$statusNamesStore[order.status]?.name ?? order.status}</span>
                        </td>
                        <td class="px-4 py-2 small text-muted">{formatDate(order.orderDate)}</td>
                        <td class="px-4 py-2">
                          <a
                            href="/admin/order/{order.id}"
                            class="btn btn-icon btn-sm rounded-pill btn-soft-info"
                            title="View Order"
                          >
                            <i class="ti ti-eye"></i>
                          </a>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </div>

      </div>
    </div>

  </div>
</div>
