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
  import { categoriesAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";
  import { OrderCreateForm } from "$lib/features/orders/list";

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
  let contactRemark = "";
  let contactFormErrors = {};

  // Edit contact
  let editingContact = null;
  let editContactLoading = false;
  let expandedContactId = null;

  function toggleContactExpand(id) {
    expandedContactId = expandedContactId === id ? null : id;
  }

  $: clientId = $page.params.id;

  // Role helpers
  $: canEdit = currentUser?.role === "master" || currentUser?.subRole === "telecaller";
  $: canView =
    canEdit ||
    currentUser?.role === "admin" ||
    currentUser?.role === "manager" ||
    currentUser?.role === "user";
  $: visibleOrders =
    currentUser?.role === "user"
      ? (client?.orders ?? []).filter((o) =>
          o.assignedUsers?.some((u) => u.id === Number(currentUser.id)),
        )
      : (client?.orders ?? []);

  $: visibleVisits = [...(client?.clientVisits ?? [])].sort((a, b) => {
    const da = new Date(a.visitDate || a.createdAt || 0).getTime();
    const db = new Date(b.visitDate || b.createdAt || 0).getTime();
    return db - da;
  });

  $: clientPIs = visibleOrders.flatMap((o) =>
    (o.orderPayments ?? []).map((pi) => ({ ...pi, _order: o })),
  );
  $: clientWOs = visibleOrders.flatMap((o) =>
    (o.workOrders ?? []).map((wo) => ({ ...wo, _order: o })),
  );
  $: clientTIs = visibleOrders.flatMap((o) =>
    (o.invoices ?? []).map((ti) => ({ ...ti, _order: o })),
  );

  const VISIT_TYPE = {
    incoming: { label: "They Came To Us", cls: "bg-info text-white" },
    outgoing: { label: "We Visited Client", cls: "bg-warning text-dark" },
    joint: { label: "Joint Site Visit", cls: "bg-primary" },
    job_discussion: { label: "Client Gave Job Details", cls: "bg-success" },
    job_received: { label: "Job Received", cls: "bg-secondary" },
    sample_sent: { label: "Sample Sent", cls: "bg-danger" },
  };

  const VISIT_STATUS = {
    scheduled: { label: "Scheduled", cls: "bg-primary" },
    completed: { label: "Completed", cls: "bg-success" },
    cancelled: { label: "Cancelled", cls: "bg-danger" },
  };

  onMount(async () => {
    currentUser = checkAuth();

    // Recompute after currentUser is set
    const _canEdit = currentUser?.role === "master" || currentUser?.subRole === "telecaller";
    const _canView =
      _canEdit ||
      currentUser?.role === "admin" ||
      currentUser?.role === "manager" ||
      currentUser?.role === "user";

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
    await getAllCategories();
  });

  async function getAllCategories() {
    const cached = get(categoriesAllStore);
    if (cached?.length > 0 && typeof cached[0] === "object" && cached[0].label) {
      categories = cached;
      return;
    }
    try {
      const data = await authApiFetch(API_ROUTES.CATEGORY + "/all");
      categories = data.map((parent) => ({
        label: parent.name,
        options: parent.children?.length > 0 ? parent.children.map((c) => c.name) : [parent.name],
      }));
      categoriesAllStore.set(categories);
    } catch {}
  }

  function onOrderCreated() {
    activeDocTab = "orders";
    fetchClient(false);
  }

  async function fetchClient(showLoader = true) {
    if (showLoader) loadingData = true;
    try {
      const res = await authApiFetch(`${API_ROUTES.CLIENT}/${clientId}`, { method: "GET" });
      client = res.data;
      editName = client.name || "";
      editGst = client.gstNumber || "";
      editEmail = client.email || "";
      editMobile = client.mobile || "";
      editWhatsapp = client.whatsapp || "";
      editAddress = client.address || "";
      editRemark = client.remark || "";
    } catch (e) {
      Swal.fire("Error!", "Failed to load client.", "error");
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 300);
    }
  }

  async function saveClient(e) {
    e.preventDefault();
    formErrors = {};
    if (!editName) {
      formErrors.editName = ["Name is required."];
      return;
    }
    editLoading = true;
    try {
      const payload = { name: editName };
      if (editGst) payload.gstNumber = editGst;
      if (editEmail) payload.email = editEmail;
      if (editMobile) payload.mobile = editMobile;
      if (editWhatsapp) payload.whatsapp = editWhatsapp;
      if (editAddress) payload.address = editAddress;
      if (editRemark) payload.remark = editRemark;
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
    if (!contactName) {
      contactFormErrors.contactName = ["Name is required."];
      return;
    }
    if (keepOpen) addMoreLoading = true;
    else contactFormLoading = true;
    try {
      const res = await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
        method: "POST",
        data: JSON.stringify({
          clientId: Number(clientId),
          name: contactName,
          ...(contactDesignation && { designation: contactDesignation }),
          ...(contactMobile && { mobile: contactMobile }),
          ...(contactEmail && { email: contactEmail }),
          ...(contactWhatsapp && { whatsapp: contactWhatsapp }),
          ...(contactAltMobile && { alternateMobile: contactAltMobile }),
          ...(contactAddress && { address: contactAddress }),
          ...(contactRemark && { remark: contactRemark }),
        }),
      });
      client.contacts = [...(client.contacts || []), res.data];
      contactName = "";
      contactDesignation = "";
      contactMobile = "";
      contactEmail = "";
      contactWhatsapp = "";
      contactAltMobile = "";
      contactAddress = "";
      contactRemark = "";
      if (keepOpen) {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Contact saved!",
          showConfirmButton: false,
          timer: 1500,
        });
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

  function closeAddContact() {
    showContactForm = false;
    contactFormErrors = {};
  }

  function closeEditContact() {
    editingContact = null;
  }

  function openEditClient() {
    editName = client?.name || "";
    editGst = client?.gstNumber || "";
    editEmail = client?.email || "";
    editMobile = client?.mobile || "";
    editWhatsapp = client?.whatsapp || "";
    editAddress = client?.address || "";
    editRemark = client?.remark || "";
    formErrors = {};
    isEditing = true;
  }

  function closeEditClient() {
    if (editLoading) return;
    isEditing = false;
    formErrors = {};
  }

  async function saveContact(e) {
    e.preventDefault();
    if (!editingContact?.name) return;
    editContactLoading = true;
    try {
      const {
        id: _id,
        createdAt: _c,
        updatedAt: _u,
        deletedAt: _d,
        ...contactPayload
      } = editingContact;
      // Strip empty strings so optional @IsEmail / @IsString validators don't reject them
      const cleanPayload = Object.fromEntries(
        Object.entries(contactPayload).filter(([, v]) => v !== ""),
      );
      const res = await authApiFetch(`${API_ROUTES.CLIENT_CONTACT}/${editingContact.id}`, {
        method: "PUT",
        data: JSON.stringify(cleanPayload),
      });
      client.contacts = client.contacts.map((c) => (c.id === editingContact.id ? res.data : c));
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
          const data = await authApiFetch(`${API_ROUTES.CLIENT_CONTACT}/${id}`, {
            method: "DELETE",
          });
          client.contacts = client.contacts.filter((c) => c.id !== id);
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
    return `${String(dt.getDate()).padStart(2, "0")}-${String(dt.getMonth() + 1).padStart(2, "0")}-${dt.getFullYear()}`;
  }

  function padDocNo(n) {
    return String(n ?? "").padStart(6, "0");
  }

  function formatAmount(n) {
    if (n == null || n === "") return "—";
    const num = Number(n);
    if (Number.isNaN(num)) return "—";
    return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function orderLabel(order) {
    if (!order) return "—";
    if (order.pId) return `#${order.pId}${order.title ? " - " + order.title : ""}`;
    return order.title || "—";
  }

  function relatedOrder(row) {
    return row?._order || row?.order || null;
  }

  function piLabel(pi) {
    if (!pi) return "—";
    return `${pi.financialYear}/${padDocNo(pi.invoiceNo)}`;
  }

  function tiLabel(ti) {
    if (!ti) return "—";
    return `${ti.financialYear}/${padDocNo(ti.invoiceNo)}`;
  }

  function hasValue(v) {
    return v != null && String(v).trim() !== "";
  }

  function maskMobile(m) {
    if (!m) return "—";
    const s = String(m).replace(/\s/g, "");
    if (s.length <= 4) return s;
    return "•".repeat(s.length - 4) + s.slice(-4);
  }

  function maskEmail(e) {
    if (!e) return "—";
    const [user, domain] = String(e).split("@");
    if (!domain) return e;
    const visible =
      user.length > 2 ? user[0] + "•".repeat(user.length - 2) + user.slice(-1) : user[0] + "•";
    return `${visible}@${domain}`;
  }

  let revealed = {};
  function toggleReveal(key) {
    revealed = { ...revealed, [key]: !revealed[key] };
  }

  let copiedFieldKey = "";
  let copyTimeout;
  async function copyField(key, value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      copiedFieldKey = key;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copiedFieldKey = "";
      }, 1500);
    } catch (_) {}
  }

  $: missingClientFields = [
    !hasValue(client?.gstNumber) && "GST",
    !hasValue(client?.mobile) && "Mobile",
    !hasValue(client?.email) && "Email",
    !hasValue(client?.whatsapp) && "Whatsapp",
    !hasValue(client?.address) && "Address",
    !hasValue(client?.remark) && "Remark",
  ].filter(Boolean);

  let activeDocTab = "orders";
  let categories = [];

  function setDocTab(tab) {
    activeDocTab = tab;
  }
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper client-page">
  <div class="content pb-0">
    <!-- Page Header -->
    <div class="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
      <div class="d-flex align-items-center gap-3">
        <button class="btn btn-warning btn-sm" on:click={() => window.history.back()}>
          <i class="ti ti-arrow-left me-1"></i>Back
        </button>
        <div>
          <h4 class="mb-1 client-page-title">{client?.name || "Client Detail"}</h4>
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
        <a
          href="#offcanvas_add"
          class="btn btn-sm btn-primary shadow"
          data-bs-toggle="offcanvas"
          data-bs-target="#offcanvas_add"
        >
          <i class="ti ti-plus me-1"></i>Create New Order
        </a>
        <a href="/admin/client-visit/add?clientId={clientId}" class="btn btn-sm btn-success shadow">
          <i class="ti ti-map-pin me-1"></i>Create Visit
        </a>
        {#if canEdit}
          <button class="btn btn-sm btn-outline-danger shadow" on:click={deleteClient}>
            <i class="ti ti-archive me-1"></i>Archive
          </button>
        {/if}
      </div>
    </div>

    <div class="client-page-layout">
      <!-- Left: Client Info + Contacts -->
      <div class="client-page-left">
        <div class="card border-0 rounded-0 mb-4">
          <div class="card-header d-flex align-items-center justify-content-between py-2">
            <h5 class="mb-0 client-section-title">
              <i class="ti ti-building-store me-2 text-primary"></i>Client Info
            </h5>
            {#if canEdit}
              <button class="btn btn-outline-primary btn-sm" on:click={openEditClient}>
                <i class="ti ti-edit me-1"></i>Edit
              </button>
            {/if}
          </div>
          <div class="card-body py-3">
              <div class="client-info-list">
                <div class="client-info-row">
                  <span class="client-info-label">Company</span>
                  <span class="client-info-value fw-semibold">{client?.name || "—"}</span>
                </div>
                {#if hasValue(client?.gstNumber)}
                  <div class="client-info-row">
                    <span class="client-info-label">GST</span>
                    <span class="client-info-value client-sensitive">
                      {client.gstNumber}
                      <button
                        type="button"
                        class="client-sens-btn"
                        title="Copy GST"
                        on:click={() => copyField("client-gst", client.gstNumber)}
                      >
                        <i class="ti {copiedFieldKey === 'client-gst' ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                      </button>
                    </span>
                  </div>
                {/if}
                {#if hasValue(client?.mobile)}
                  <div class="client-info-row">
                    <span class="client-info-label">Mobile</span>
                    <span class="client-info-value client-sensitive">
                      <span class:client-masked={!revealed["client-mobile"]}
                        >{revealed["client-mobile"] ? client.mobile : maskMobile(client.mobile)}</span
                      >
                      <button
                        type="button"
                        class="client-sens-btn"
                        title={revealed["client-mobile"] ? "Hide" : "Show"}
                        on:click|stopPropagation={() => toggleReveal("client-mobile")}
                      >
                        <i class="ti {revealed['client-mobile'] ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                      </button>
                      <button
                        type="button"
                        class="client-sens-btn"
                        title="Copy mobile"
                        on:click|stopPropagation={() => copyField("client-mobile", client.mobile)}
                      >
                        <i class="ti {copiedFieldKey === 'client-mobile' ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                      </button>
                    </span>
                  </div>
                {/if}
                {#if hasValue(client?.email)}
                  <div class="client-info-row">
                    <span class="client-info-label">Email</span>
                    <span class="client-info-value client-sensitive">
                      <span class:client-masked={!revealed["client-email"]}
                        >{revealed["client-email"] ? client.email : maskEmail(client.email)}</span
                      >
                      <button
                        type="button"
                        class="client-sens-btn"
                        title={revealed["client-email"] ? "Hide" : "Show"}
                        on:click|stopPropagation={() => toggleReveal("client-email")}
                      >
                        <i class="ti {revealed['client-email'] ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                      </button>
                      <button
                        type="button"
                        class="client-sens-btn"
                        title="Copy email"
                        on:click|stopPropagation={() => copyField("client-email", client.email)}
                      >
                        <i class="ti {copiedFieldKey === 'client-email' ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                      </button>
                    </span>
                  </div>
                {/if}
                {#if hasValue(client?.whatsapp)}
                  <div class="client-info-row">
                    <span class="client-info-label">Whatsapp</span>
                    <span class="client-info-value client-sensitive">
                      <span class:client-masked={!revealed["client-whatsapp"]}
                        >{revealed["client-whatsapp"] ? client.whatsapp : maskMobile(client.whatsapp)}</span
                      >
                      <button
                        type="button"
                        class="client-sens-btn"
                        title={revealed["client-whatsapp"] ? "Hide" : "Show"}
                        on:click|stopPropagation={() => toggleReveal("client-whatsapp")}
                      >
                        <i class="ti {revealed['client-whatsapp'] ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                      </button>
                      <button
                        type="button"
                        class="client-sens-btn"
                        title="Copy Whatsapp"
                        on:click|stopPropagation={() => copyField("client-whatsapp", client.whatsapp)}
                      >
                        <i class="ti {copiedFieldKey === 'client-whatsapp' ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                      </button>
                    </span>
                  </div>
                {/if}
                {#if hasValue(client?.address)}
                  <div class="client-info-row">
                    <span class="client-info-label">Address</span>
                    <span class="client-info-value">{client.address}</span>
                  </div>
                {/if}
                {#if hasValue(client?.remark)}
                  <div class="client-info-row">
                    <span class="client-info-label">Remark</span>
                    <span class="client-info-value">{client.remark}</span>
                  </div>
                {/if}
              </div>
              {#if canEdit && missingClientFields.length}
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 mt-2 client-info-missing"
                  on:click={openEditClient}
                  title={missingClientFields.join(", ")}
                >
                  Add missing details
                </button>
              {/if}
          </div>
        </div>

        <!-- Contacts — left column, below Client Info -->
        <div class="card border-0 rounded-0">
          <div
            class="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap py-2"
          >
            <h5 class="mb-0 client-section-title">
              <i class="ti ti-users me-2 text-primary"></i>Contacts
              <span class="badge bg-info text-white ms-1">{client?.contacts?.length || 0}</span>
            </h5>
            {#if canEdit}
              <button
                class="btn btn-primary btn-sm"
                on:click={() => {
                  editingContact = null;
                  showContactForm = true;
                }}
              >
                <i class="ti ti-square-rounded-plus-filled me-1"></i>Add Contact
              </button>
            {/if}
          </div>

          <div class="card-body">
            {#if !client?.contacts || client.contacts.length === 0}
              <div class="text-center py-4 text-muted">
                <i class="ti ti-users fs-1 d-block mb-2"></i>
                No contacts yet. Add the first contact above.
              </div>
            {:else}
              <div class="client-contact-list">
                {#each client.contacts as contact}
                  {@const isOpen = expandedContactId === contact.id}
                  <div class="client-contact-row" class:is-open={isOpen}>
                    <div class="min-w-0 flex-fill">
                      <button
                        type="button"
                        class="client-contact-toggle"
                        on:click={() => toggleContactExpand(contact.id)}
                        aria-expanded={isOpen}
                      >
                        <i class="ti {isOpen ? 'ti-chevron-down' : 'ti-chevron-right'} client-contact-chevron"></i>
                        <span class="min-w-0 text-start">
                          <span class="fw-semibold d-block text-truncate">{contact.name || "—"}</span>
                          <span class="small text-muted d-block text-truncate">
                            {#if contact.designation}{contact.designation} · {/if}
                            {revealed[`c-${contact.id}-mobile`] ? (contact.mobile || "—") : maskMobile(contact.mobile)}
                          </span>
                        </span>
                      </button>

                      {#if isOpen}
                        <div class="client-contact-details">
                          <div class="client-info-row">
                            <span class="client-info-label">Name</span>
                            <span class="client-info-value fw-semibold">{contact.name || "—"}</span>
                          </div>
                          <div class="client-info-row">
                            <span class="client-info-label">Designation</span>
                            <span class="client-info-value">{contact.designation || "—"}</span>
                          </div>
                          <div class="client-info-row">
                            <span class="client-info-label">Mobile</span>
                            <span class="client-info-value client-sensitive">
                              {#if contact.mobile}
                                <span class:client-masked={!revealed[`c-${contact.id}-mobile`]}
                                  >{revealed[`c-${contact.id}-mobile`] ? contact.mobile : maskMobile(contact.mobile)}</span
                                >
                                <button
                                  type="button"
                                  class="client-sens-btn"
                                  title={revealed[`c-${contact.id}-mobile`] ? "Hide" : "Show"}
                                  on:click|stopPropagation={() => toggleReveal(`c-${contact.id}-mobile`)}
                                >
                                  <i class="ti {revealed[`c-${contact.id}-mobile`] ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                                </button>
                                <button
                                  type="button"
                                  class="client-sens-btn"
                                  title="Copy mobile"
                                  on:click|stopPropagation={() => copyField(`c-${contact.id}-mobile`, contact.mobile)}
                                >
                                  <i class="ti {copiedFieldKey === `c-${contact.id}-mobile` ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                                </button>
                              {:else}
                                —
                              {/if}
                            </span>
                          </div>
                          <div class="client-info-row">
                            <span class="client-info-label">Email</span>
                            <span class="client-info-value client-sensitive">
                              {#if contact.email}
                                <span class:client-masked={!revealed[`c-${contact.id}-email`]}
                                  >{revealed[`c-${contact.id}-email`] ? contact.email : maskEmail(contact.email)}</span
                                >
                                <button
                                  type="button"
                                  class="client-sens-btn"
                                  title={revealed[`c-${contact.id}-email`] ? "Hide" : "Show"}
                                  on:click|stopPropagation={() => toggleReveal(`c-${contact.id}-email`)}
                                >
                                  <i class="ti {revealed[`c-${contact.id}-email`] ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                                </button>
                                <button
                                  type="button"
                                  class="client-sens-btn"
                                  title="Copy email"
                                  on:click|stopPropagation={() => copyField(`c-${contact.id}-email`, contact.email)}
                                >
                                  <i class="ti {copiedFieldKey === `c-${contact.id}-email` ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                                </button>
                              {:else}
                                —
                              {/if}
                            </span>
                          </div>
                          <div class="client-info-row">
                            <span class="client-info-label">Whatsapp</span>
                            <span class="client-info-value client-sensitive">
                              {#if contact.whatsapp}
                                <span class:client-masked={!revealed[`c-${contact.id}-whatsapp`]}
                                  >{revealed[`c-${contact.id}-whatsapp`] ? contact.whatsapp : maskMobile(contact.whatsapp)}</span
                                >
                                <button
                                  type="button"
                                  class="client-sens-btn"
                                  title={revealed[`c-${contact.id}-whatsapp`] ? "Hide" : "Show"}
                                  on:click|stopPropagation={() => toggleReveal(`c-${contact.id}-whatsapp`)}
                                >
                                  <i class="ti {revealed[`c-${contact.id}-whatsapp`] ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                                </button>
                                <button
                                  type="button"
                                  class="client-sens-btn"
                                  title="Copy Whatsapp"
                                  on:click|stopPropagation={() => copyField(`c-${contact.id}-whatsapp`, contact.whatsapp)}
                                >
                                  <i class="ti {copiedFieldKey === `c-${contact.id}-whatsapp` ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                                </button>
                              {:else}
                                —
                              {/if}
                            </span>
                          </div>
                          <div class="client-info-row">
                            <span class="client-info-label">Alt. Mobile</span>
                            <span class="client-info-value client-sensitive">
                              {#if contact.alternateMobile}
                                <span class:client-masked={!revealed[`c-${contact.id}-alt`]}
                                  >{revealed[`c-${contact.id}-alt`] ? contact.alternateMobile : maskMobile(contact.alternateMobile)}</span
                                >
                                <button
                                  type="button"
                                  class="client-sens-btn"
                                  title={revealed[`c-${contact.id}-alt`] ? "Hide" : "Show"}
                                  on:click|stopPropagation={() => toggleReveal(`c-${contact.id}-alt`)}
                                >
                                  <i class="ti {revealed[`c-${contact.id}-alt`] ? 'ti-eye-off' : 'ti-eye'} text-muted"></i>
                                </button>
                                <button
                                  type="button"
                                  class="client-sens-btn"
                                  title="Copy mobile"
                                  on:click|stopPropagation={() => copyField(`c-${contact.id}-alt`, contact.alternateMobile)}
                                >
                                  <i class="ti {copiedFieldKey === `c-${contact.id}-alt` ? 'ti-check text-success' : 'ti-copy text-muted'}"></i>
                                </button>
                              {:else}
                                —
                              {/if}
                            </span>
                          </div>
                          <div class="client-info-row">
                            <span class="client-info-label">Address</span>
                            <span class="client-info-value">{contact.address || "—"}</span>
                          </div>
                          <div class="client-info-row">
                            <span class="client-info-label">Remark</span>
                            <span class="client-info-value">{contact.remark || "—"}</span>
                          </div>
                        </div>
                      {/if}
                    </div>
                    {#if canEdit}
                      <div class="d-inline-flex gap-1 flex-shrink-0">
                        <button
                          class="btn btn-icon btn-sm rounded-pill btn-soft-info"
                          on:click={() => {
                            startEditContact(contact);
                            showContactForm = false;
                          }}
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
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Right: tabbed Orders / PI / WO / TI / Visits -->
      <div class="client-page-right">
        <div class="card border-0 rounded-0">
          <div class="card-body pb-0 pt-2 px-2">
            <ul class="nav nav-tabs nav-bordered mb-0 client-doc-tabs" role="tablist">
              <li class="nav-item" role="presentation">
                <a
                  href="#client-tab-orders"
                  class="nav-link border-3"
                  class:active={activeDocTab === "orders"}
                  on:click|preventDefault={() => setDocTab("orders")}
                  aria-selected={activeDocTab === "orders"}
                  role="tab"
                >
                  <i class="ti ti-medal me-1"></i>Orders
                  <span class="badge bg-primary ms-1">{visibleOrders.length}</span>
                </a>
              </li>
              <li class="nav-item" role="presentation">
                <a
                  href="#client-tab-pi"
                  class="nav-link border-3"
                  class:active={activeDocTab === "pi"}
                  on:click|preventDefault={() => setDocTab("pi")}
                  aria-selected={activeDocTab === "pi"}
                  role="tab"
                >
                  <i class="ti ti-receipt me-1"></i>PI
                  <span class="badge bg-success ms-1">{clientPIs.length}</span>
                </a>
              </li>
              <li class="nav-item" role="presentation">
                <a
                  href="#client-tab-wo"
                  class="nav-link border-3"
                  class:active={activeDocTab === "wo"}
                  on:click|preventDefault={() => setDocTab("wo")}
                  aria-selected={activeDocTab === "wo"}
                  role="tab"
                >
                  <i class="ti ti-file-description me-1"></i>WO
                  <span class="badge bg-primary ms-1">{clientWOs.length}</span>
                </a>
              </li>
              <li class="nav-item" role="presentation">
                <a
                  href="#client-tab-ti"
                  class="nav-link border-3"
                  class:active={activeDocTab === "ti"}
                  on:click|preventDefault={() => setDocTab("ti")}
                  aria-selected={activeDocTab === "ti"}
                  role="tab"
                >
                  <i class="ti ti-file-invoice me-1"></i>TI
                  <span class="badge bg-warning text-dark ms-1">{clientTIs.length}</span>
                </a>
              </li>
              <li class="nav-item" role="presentation">
                <a
                  href="#client-tab-visits"
                  class="nav-link border-3"
                  class:active={activeDocTab === "visits"}
                  on:click|preventDefault={() => setDocTab("visits")}
                  aria-selected={activeDocTab === "visits"}
                  role="tab"
                >
                  <i class="ti ti-map-pin me-1"></i>Visits
                  <span class="badge bg-success ms-1">{visibleVisits.length}</span>
                </a>
              </li>
            </ul>
          </div>

          <div class="card-body">
            {#if activeDocTab === "orders"}
              {#if visibleOrders.length === 0}
                <div class="text-center py-4 text-muted">
                  <i class="ti ti-medal fs-1 d-block mb-2"></i>
                  No orders linked to this client.
                  <div class="mt-3">
                    <a
                      href="#offcanvas_add"
                      class="btn btn-sm btn-primary"
                      data-bs-toggle="offcanvas"
                      data-bs-target="#offcanvas_add"
                    >
                      <i class="ti ti-plus me-1"></i>Create New Order
                    </a>
                  </div>
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
                        <th class="px-4 py-2">PI</th>
                        <th class="px-4 py-2">WO</th>
                        <th class="px-4 py-2">TI</th>
                        <th class="px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each visibleOrders as order}
                        <tr class="border-t hover:bg-gray-50">
                          <td class="px-4 py-2 text-muted small">{order.pId}</td>
                          <td class="px-4 py-2 fw-semibold">
                            <a class="client-doc-link" href="/admin/order/{order.id}"
                              >{orderLabel(order)}</a
                            >
                          </td>
                          <td class="px-4 py-2">
                            <span class="badge bg-secondary"
                              >{$statusNamesStore[order.status]?.name ?? order.status}</span
                            >
                          </td>
                          <td class="px-4 py-2 small text-muted">{formatDate(order.orderDate)}</td>
                          <td class="px-4 py-2 small">
                            {#if order.orderPayments?.[0]}
                              <a
                                class="client-doc-link"
                                href="/admin/invoice/{order.orderPayments[0].id}"
                              >
                                {piLabel(order.orderPayments[0])}
                              </a>
                              {#if order.orderPayments.length > 1}
                                <span class="text-muted">+{order.orderPayments.length - 1}</span>
                              {/if}
                            {:else}
                              —
                            {/if}
                          </td>
                          <td class="px-4 py-2 small">
                            {#if order.workOrders?.[0]}
                              <a
                                class="client-doc-link"
                                href="/admin/workorder/{order.workOrders[0].id}"
                              >
                                {order.workOrders[0].workOrderNo || "WO"}
                              </a>
                              {#if order.workOrders.length > 1}
                                <span class="text-muted">+{order.workOrders.length - 1}</span>
                              {/if}
                            {:else}
                              —
                            {/if}
                          </td>
                          <td class="px-4 py-2 small">
                            {#if order.invoices?.[0]}
                              <a
                                class="client-doc-link"
                                href="/admin/invoice/tax/{order.invoices[0].id}"
                              >
                                {tiLabel(order.invoices[0])}
                              </a>
                              {#if order.invoices.length > 1}
                                <span class="text-muted">+{order.invoices.length - 1}</span>
                              {/if}
                            {:else}
                              —
                            {/if}
                          </td>
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
            {:else if activeDocTab === "pi"}
              {#if clientPIs.length === 0}
                <div class="text-center py-4 text-muted">
                  <i class="ti ti-receipt fs-1 d-block mb-2"></i>
                  No PI linked to this client.
                </div>
              {:else}
                <div class="table-responsive">
                  <table class="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                    <thead>
                      <tr class="bg-gray-100 text-left text-gray-700 uppercase text-sm">
                        <th class="px-4 py-2">PI No.</th>
                        <th class="px-4 py-2">Date</th>
                        <th class="px-4 py-2">Amount</th>
                        <th class="px-4 py-2">Status</th>
                        <th class="px-4 py-2">Order</th>
                        <th class="px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each clientPIs as pi}
                        {@const piOrder = relatedOrder(pi)}
                        <tr class="border-t hover:bg-gray-50">
                          <td class="px-4 py-2 fw-semibold">
                            <a class="client-doc-link" href="/admin/invoice/{pi.id}">{piLabel(pi)}</a>
                          </td>
                          <td class="px-4 py-2 small text-muted">{formatDate(pi.invoiceDate)}</td>
                          <td class="px-4 py-2 small">{formatAmount(pi.totalAmountValue)}</td>
                          <td class="px-4 py-2">
                            <span
                              class="badge {pi.status === 'Paid' ? 'bg-success' : 'bg-secondary'}"
                              >{pi.status || "—"}</span
                            >
                          </td>
                          <td class="px-4 py-2 small">
                            {#if piOrder?.id}
                              <a class="client-doc-link" href="/admin/order/{piOrder.id}"
                                >{orderLabel(piOrder)}</a
                              >
                            {:else}
                              —
                            {/if}
                          </td>
                          <td class="px-4 py-2">
                            <a
                              href="/admin/invoice/{pi.id}"
                              class="btn btn-icon btn-sm rounded-pill btn-soft-info"
                              title="View PI"
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
            {:else if activeDocTab === "wo"}
              {#if clientWOs.length === 0}
                <div class="text-center py-4 text-muted">
                  <i class="ti ti-file-description fs-1 d-block mb-2"></i>
                  No WO linked to this client.
                </div>
              {:else}
                <div class="table-responsive">
                  <table class="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                    <thead>
                      <tr class="bg-gray-100 text-left text-gray-700 uppercase text-sm">
                        <th class="px-4 py-2">WO No.</th>
                        <th class="px-4 py-2">Title</th>
                        <th class="px-4 py-2">Date</th>
                        <th class="px-4 py-2">Order</th>
                        <th class="px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each clientWOs as wo}
                        {@const woOrder = relatedOrder(wo)}
                        <tr class="border-t hover:bg-gray-50">
                          <td class="px-4 py-2 fw-semibold">
                            <a class="client-doc-link" href="/admin/workorder/{wo.id}"
                              >{wo.workOrderNo || "WO"}</a
                            >
                          </td>
                          <td class="px-4 py-2 small">{wo.title || "—"}</td>
                          <td class="px-4 py-2 small text-muted">{formatDate(wo.workOrderDate)}</td>
                          <td class="px-4 py-2 small">
                            {#if woOrder?.id}
                              <a class="client-doc-link" href="/admin/order/{woOrder.id}"
                                >{orderLabel(woOrder)}</a
                              >
                            {:else}
                              —
                            {/if}
                          </td>
                          <td class="px-4 py-2">
                            <a
                              href="/admin/workorder/{wo.id}"
                              class="btn btn-icon btn-sm rounded-pill btn-soft-info"
                              title="View WO"
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
            {:else if activeDocTab === "ti"}
              {#if clientTIs.length === 0}
                <div class="text-center py-4 text-muted">
                  <i class="ti ti-file-invoice fs-1 d-block mb-2"></i>
                  No TI linked to this client.
                </div>
              {:else}
                <div class="table-responsive">
                  <table class="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                    <thead>
                      <tr class="bg-gray-100 text-left text-gray-700 uppercase text-sm">
                        <th class="px-4 py-2">TI No.</th>
                        <th class="px-4 py-2">Date</th>
                        <th class="px-4 py-2">Amount</th>
                        <th class="px-4 py-2">Status</th>
                        <th class="px-4 py-2">Order</th>
                        <th class="px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each clientTIs as ti}
                        {@const tiOrder = relatedOrder(ti)}
                        <tr class="border-t hover:bg-gray-50">
                          <td class="px-4 py-2 fw-semibold">
                            <a class="client-doc-link" href="/admin/invoice/tax/{ti.id}"
                              >{tiLabel(ti)}</a
                            >
                          </td>
                          <td class="px-4 py-2 small text-muted">{formatDate(ti.invoiceDate)}</td>
                          <td class="px-4 py-2 small">{formatAmount(ti.totalAmountValue)}</td>
                          <td class="px-4 py-2">
                            {#if ti.isLocked}
                              <span class="badge bg-success">Locked</span>
                            {:else}
                              <span class="badge bg-warning text-dark">Draft</span>
                            {/if}
                          </td>
                          <td class="px-4 py-2 small">
                            {#if tiOrder?.id}
                              <a class="client-doc-link" href="/admin/order/{tiOrder.id}"
                                >{orderLabel(tiOrder)}</a
                              >
                            {:else}
                              —
                            {/if}
                          </td>
                          <td class="px-4 py-2">
                            <a
                              href="/admin/invoice/tax/{ti.id}"
                              class="btn btn-icon btn-sm rounded-pill btn-soft-info"
                              title="View TI"
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
            {:else if activeDocTab === "visits"}
              {#if visibleVisits.length === 0}
                <div class="text-center py-4 text-muted">
                  <i class="ti ti-map-pin fs-1 d-block mb-2"></i>
                  No visits linked to this client.
                </div>
              {:else}
                <div class="table-responsive">
                  <table class="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                    <thead>
                      <tr class="bg-gray-100 text-left text-gray-700 uppercase text-sm">
                        <th class="px-4 py-2">Type</th>
                        <th class="px-4 py-2">Date</th>
                        <th class="px-4 py-2">Purpose</th>
                        <th class="px-4 py-2">Status</th>
                        <th class="px-4 py-2">Order</th>
                        <th class="px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each visibleVisits as visit}
                        {@const typeMeta = VISIT_TYPE[visit.visitType] ?? {
                          label: visit.visitType || "—",
                          cls: "bg-secondary",
                        }}
                        {@const statusMeta = VISIT_STATUS[visit.status] ?? {
                          label: visit.status || "—",
                          cls: "bg-secondary",
                        }}
                        {@const visitOrder = relatedOrder(visit)}
                        <tr class="border-t hover:bg-gray-50">
                          <td class="px-4 py-2">
                            <span class="badge {typeMeta.cls}">{typeMeta.label}</span>
                          </td>
                          <td class="px-4 py-2 small text-muted">{formatDate(visit.visitDate)}</td>
                          <td class="px-4 py-2 small">{visit.purpose || "—"}</td>
                          <td class="px-4 py-2">
                            <span class="badge {statusMeta.cls}">{statusMeta.label}</span>
                          </td>
                          <td class="px-4 py-2 small">
                            {#if visitOrder?.id}
                              <a class="client-doc-link" href="/admin/order/{visitOrder.id}"
                                >{orderLabel(visitOrder)}</a
                              >
                            {:else}
                              —
                            {/if}
                          </td>
                          <td class="px-4 py-2">
                            <a
                              href="/admin/client-visit/{visit.id}"
                              class="btn btn-icon btn-sm rounded-pill btn-soft-info"
                              title="View Visit"
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
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

{#if canEdit && isEditing}
  <div
    class="modal fade show d-block client-page"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.5);z-index:1060;"
    on:click|self={closeEditClient}
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title client-section-title mb-0">
            <i class="ti ti-building-store me-2 text-primary"></i>Client Info
          </h5>
          <button type="button" class="btn-close" on:click={closeEditClient}></button>
        </div>
        <form on:submit={saveClient} novalidate>
          <div class="modal-body">
            <div class="mb-2">
              <label class="form-label">Company Name <span class="text-danger">*</span></label>
              <input
                class="form-control"
                class:is-invalid={formErrors.editName}
                type="text"
                bind:value={editName}
                placeholder="Company name"
              />
              {#if formErrors.editName}
                <ul class="text-danger mt-1 text-xs capitalize">
                  <li>{formErrors.editName[0]}</li>
                </ul>
              {/if}
            </div>
            <div class="mb-2">
              <label class="form-label">GST Number</label>
              <input class="form-control" type="text" bind:value={editGst} placeholder="GST number" />
            </div>
            <div class="client-info-edit-grid">
              <div class="mb-2">
                <label class="form-label">Mobile</label>
                <input class="form-control" type="text" bind:value={editMobile} placeholder="Mobile" />
              </div>
              <div class="mb-2">
                <label class="form-label">Whatsapp</label>
                <input class="form-control" type="text" bind:value={editWhatsapp} placeholder="Whatsapp" />
              </div>
            </div>
            <div class="mb-2">
              <label class="form-label">Email</label>
              <input class="form-control" type="email" bind:value={editEmail} placeholder="Email" />
            </div>
            <div class="mb-2">
              <label class="form-label">Address</label>
              <textarea class="form-control" bind:value={editAddress} placeholder="Address" rows="2"></textarea>
            </div>
            <div class="mb-2">
              <label class="form-label">Remark</label>
              <textarea class="form-control" bind:value={editRemark} placeholder="Remark" rows="2"></textarea>
            </div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-light btn-sm" on:click={closeEditClient} disabled={editLoading}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary btn-sm" disabled={editLoading}>
              {editLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

{#if canEdit && showContactForm}
  <div
    class="modal fade show d-block client-page"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.5);z-index:1060;"
    on:click|self={closeAddContact}
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title client-section-title mb-0">
            <i class="ti ti-user-plus me-2 text-primary"></i>New Contact
          </h5>
          <button type="button" class="btn-close" on:click={closeAddContact}></button>
        </div>
        <form on:submit={addContact}>
          <div class="modal-body">
            <div class="row g-2">
              <div class="col-md-6">
                <label class="form-label">Name <span class="text-danger">*</span></label>
                <input
                  class="form-control"
                  class:is-invalid={contactFormErrors.contactName}
                  type="text"
                  bind:value={contactName}
                  placeholder="Contact name"
                />
                {#if contactFormErrors.contactName}
                  <ul class="text-danger mt-1 text-xs capitalize">
                    <li>{contactFormErrors.contactName[0]}</li>
                  </ul>
                {/if}
              </div>
              <div class="col-md-6">
                <label class="form-label">Designation</label>
                <input
                  class="form-control"
                  type="text"
                  bind:value={contactDesignation}
                  placeholder="e.g. Manager"
                />
              </div>
              <div class="col-md-6">
                <label class="form-label">Mobile</label>
                <input class="form-control" type="text" bind:value={contactMobile} placeholder="Mobile" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Email</label>
                <input class="form-control" type="email" bind:value={contactEmail} placeholder="Email" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Whatsapp</label>
                <input class="form-control" type="text" bind:value={contactWhatsapp} placeholder="Whatsapp" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Alt. Mobile</label>
                <input
                  class="form-control"
                  type="text"
                  bind:value={contactAltMobile}
                  placeholder="Alternate mobile"
                />
              </div>
              <div class="col-12">
                <label class="form-label">Address</label>
                <input class="form-control" type="text" bind:value={contactAddress} placeholder="Address" />
              </div>
              <div class="col-12">
                <label class="form-label">Remark</label>
                <input class="form-control" type="text" bind:value={contactRemark} placeholder="Remark" />
              </div>
            </div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-light btn-sm" on:click={closeAddContact}>Cancel</button>
            <button
              type="button"
              class="btn btn-outline-primary btn-sm"
              disabled={addMoreLoading || contactFormLoading}
              on:click={(e) => addContact(e, true)}
            >
              {addMoreLoading ? "Saving..." : "Save & Add More"}
            </button>
            <button type="submit" class="btn btn-primary btn-sm" disabled={contactFormLoading || addMoreLoading}>
              {contactFormLoading ? "Saving..." : "Add Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

{#if canEdit && editingContact}
  <div
    class="modal fade show d-block client-page"
    tabindex="-1"
    role="dialog"
    style="background:rgba(0,0,0,0.5);z-index:1060;"
    on:click|self={closeEditContact}
  >
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header py-2">
          <h5 class="modal-title client-section-title mb-0">
            <i class="ti ti-edit me-2 text-primary"></i>Edit Contact — {editingContact.name}
          </h5>
          <button type="button" class="btn-close" on:click={closeEditContact}></button>
        </div>
        <form on:submit={saveContact}>
          <div class="modal-body">
            <div class="row g-2">
              <div class="col-md-6">
                <label class="form-label">Name <span class="text-danger">*</span></label>
                <input class="form-control" type="text" bind:value={editingContact.name} placeholder="Name" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Designation</label>
                <input
                  class="form-control"
                  type="text"
                  bind:value={editingContact.designation}
                  placeholder="Designation"
                />
              </div>
              <div class="col-md-6">
                <label class="form-label">Mobile</label>
                <input class="form-control" type="text" bind:value={editingContact.mobile} placeholder="Mobile" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Email</label>
                <input class="form-control" type="email" bind:value={editingContact.email} placeholder="Email" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Whatsapp</label>
                <input class="form-control" type="text" bind:value={editingContact.whatsapp} placeholder="Whatsapp" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Alt. Mobile</label>
                <input
                  class="form-control"
                  type="text"
                  bind:value={editingContact.alternateMobile}
                  placeholder="Alternate mobile"
                />
              </div>
              <div class="col-12">
                <label class="form-label">Address</label>
                <input class="form-control" type="text" bind:value={editingContact.address} placeholder="Address" />
              </div>
              <div class="col-12">
                <label class="form-label">Remark</label>
                <input class="form-control" type="text" bind:value={editingContact.remark} placeholder="Remark" />
              </div>
            </div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-light btn-sm" on:click={closeEditContact}>Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm" disabled={editContactLoading}>
              {editContactLoading ? "Saving..." : "Save Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<OrderCreateForm {categories} prefillClient={client} on:created={onOrderCreated} />

<style>
  .client-page {
    font-size: var(--app-font-size, 0.75rem);
    line-height: var(--app-line-height, 1.45);
  }

  .client-page :global(.content),
  .client-page :global(.card-body),
  .client-page :global(.card-header),
  .client-page :global(.breadcrumb),
  .client-page :global(.form-control),
  .client-page :global(.form-select),
  .client-page :global(.form-label),
  .client-page :global(.btn),
  .client-page :global(.btn-sm),
  .client-page :global(table),
  .client-page :global(th),
  .client-page :global(td),
  .client-page :global(label),
  .client-page :global(input),
  .client-page :global(textarea),
  .client-page :global(select) {
    font-size: var(--app-font-size, 0.75rem) !important;
    line-height: var(--app-line-height, 1.45);
  }

  .client-page :global(.text-sm),
  .client-page :global(.text-xs),
  .client-page :global(.uppercase) {
    font-size: var(--app-font-size, 0.75rem) !important;
  }

  .client-page :global(.text-muted),
  .client-page :global(small),
  .client-page :global(.badge) {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
  }

  .client-page :global(thead th) {
    font-size: var(--app-font-size, 0.75rem) !important;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .client-page-title {
    font-size: var(--app-font-size-xl, 1rem) !important;
    font-weight: 600;
    line-height: 1.35;
  }

  .client-section-title {
    font-size: var(--app-font-size-lg, 0.875rem) !important;
    font-weight: 600;
    line-height: 1.35;
  }

  .client-page :global(h6) {
    font-size: var(--app-font-size-md, 0.8125rem) !important;
    font-weight: 600;
  }

  .client-page-layout {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 20px;
  }

  .client-page-left {
    min-width: 0;
    position: sticky;
    top: 12px;
    align-self: start;
  }

  .client-page-right {
    min-width: 0;
  }

  @media (max-width: 1200px) {
    .client-page-layout {
      grid-template-columns: 1fr;
    }

    .client-page-left {
      position: static;
    }
  }

  .client-info-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .client-info-row {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
  }

  .client-info-label {
    color: #6c757d;
    white-space: nowrap;
  }

  .client-info-value {
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .client-info-missing {
    color: var(--bs-primary, #e31e24) !important;
    text-decoration: none;
    text-align: left;
  }

  .client-info-missing:hover {
    text-decoration: underline;
  }

  .client-info-edit-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 10px;
  }

  .client-contact-details {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    margin-top: 8px;
    padding-left: 18px;
  }

  .client-contact-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid #e9ecef;
  }

  .client-contact-row:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .client-contact-row:first-child {
    padding-top: 0;
  }

  .client-contact-toggle {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    width: 100%;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }

  .client-contact-chevron {
    margin-top: 3px;
    color: #6c757d;
    font-size: 14px;
  }

  .client-doc-tabs {
    border-bottom: 1px solid var(--crms-border-color, #dee2e6) !important;
  }

  .client-doc-tabs .nav-link {
    cursor: pointer;
    border: 0 !important;
    border-bottom: 2px solid transparent !important;
    margin-bottom: -1px;
  }

  .client-doc-tabs .nav-link.active {
    border-bottom-color: var(--crms-primary, #e31e24) !important;
  }

  .client-doc-link {
    color: var(--bs-primary, #e31e24);
    font-weight: 600;
    text-decoration: none;
  }

  .client-doc-link:hover {
    text-decoration: underline;
  }

  .client-sensitive {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .client-masked {
    letter-spacing: 0.04em;
    color: #6c757d;
  }

  .client-sens-btn {
    flex-shrink: 0;
    border: none;
    background: transparent;
    padding: 0;
    line-height: 1;
    cursor: pointer;
    opacity: 0.55;
  }

  .client-sens-btn:hover {
    opacity: 1;
  }

  .client-sens-btn :global(i) {
    font-size: 12px;
    pointer-events: none;
  }
</style>
