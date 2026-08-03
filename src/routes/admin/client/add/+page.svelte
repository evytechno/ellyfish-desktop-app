<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";

  let loadingData = true;
  let loading = false;
  let formErrors = {};

  // Client fields
  let name = "";
  let gstNumber = "";
  let email = "";
  let mobile = "";
  let whatsapp = "";
  let address = "";
  let remark = "";

  // Contacts
  let contacts = [{ name: "", designation: "", mobile: "", email: "", whatsapp: "", alternateMobile: "", address: "" }];

  function addContact() {
    contacts = [...contacts, { name: "", designation: "", mobile: "", email: "", whatsapp: "", alternateMobile: "", address: "" }];
  }

  function removeContact(index) {
    contacts = contacts.filter((_, i) => i !== index);
  }

  let currentUser;
  onMount(async () => {
    currentUser = checkAuth();
    if (currentUser?.role !== "master") {
      loadingData = false;
      Swal.fire({ icon: "warning", title: "Access Denied", text: "You are not authorized.", confirmButtonText: "Go Back" })
        .then(() => window.history.back());
      return;
    }
    setTimeout(() => { loadingData = false; }, 300);
  });

  async function handleSubmit(e) {
    e.preventDefault();
    formErrors = {};
    if (!name) { formErrors.name = ["Client name is required."]; return; }

    loading = true;
    try {
      // 1. Create client
      const clientRes = await authApiFetch(API_ROUTES.CLIENT, {
        method: "POST",
        data: JSON.stringify({ name, gstNumber, email, mobile, whatsapp, address, remark }),
      });
      const createdClient = clientRes.data;

      // 2. Create contacts (skip empty ones)
      const validContacts = contacts.filter(c => c.name.trim());
      for (const contact of validContacts) {
        await authApiFetch(API_ROUTES.CLIENT_CONTACT, {
          method: "POST",
          data: JSON.stringify({ ...contact, clientId: createdClient.id }),
        });
      }

      Swal.fire("Success!", clientRes.message, "success");
      goto("/admin/client/" + createdClient.id);
    } catch (error) {
      const errs = errorHandle(error);
      if (errs && typeof errs === "object") formErrors = errs;
      else Swal.fire("Error!", "An unexpected error occurred.", "error");
    } finally {
      loading = false;
    }
  }
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper client-page">
  <div class="content pb-0">

    <!-- Page Header -->
    <div class="mb-3">
      <h4 class="mb-1 client-page-title">Add Client</h4>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item"><a href="/admin/client">Clients</a></li>
          <li class="breadcrumb-item active" aria-current="page">Add Client</li>
        </ol>
      </nav>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-header d-flex align-items-center justify-content-between py-2">
        <h5 class="mb-0 client-section-title">Add Client</h5>
        <a href="/admin/client" class="btn btn-sm btn-primary">
          <i class="ti ti-list me-1"></i>Client List
        </a>
      </div>

      <div class="card-body">
        <form on:submit={handleSubmit} class="needs-validation" novalidate>

          <div class="client-add-grid">
            <!-- Shared header row — same height so borders align -->
            <div class="client-add-panel-head">
              <h6 class="mb-0 fw-semibold text-primary client-add-panel-title">
                <i class="ti ti-building-store me-1"></i>Company Information
              </h6>
            </div>
            <div class="client-add-panel-head client-add-panel-head--contacts">
              <h6 class="mb-0 fw-semibold text-primary client-add-panel-title">
                <i class="ti ti-users me-1"></i>Contacts
              </h6>
              <button type="button" class="btn btn-sm btn-outline-primary" on:click={addContact}>
                <i class="ti ti-plus me-1"></i>Add Contact
              </button>
            </div>

            <!-- Company Info -->
            <section class="client-add-panel">
              <div class="row g-3">
                <div class="col-12">
                  <label class="form-label" for="name">
                    Company Name <span class="text-danger">*</span>
                  </label>
                  <input
                    class="form-control"
                    class:is-invalid={formErrors.name}
                    type="text"
                    bind:value={name}
                    placeholder="Company name"
                    id="name"
                  />
                  {#if formErrors.name}
                    <ul class="text-danger mt-1 text-xs capitalize">
                      <li>{formErrors.name[0]}</li>
                    </ul>
                  {/if}
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="gstNumber">GST Number</label>
                  <input
                    class="form-control"
                    class:is-invalid={formErrors.gstNumber}
                    type="text"
                    bind:value={gstNumber}
                    placeholder="GST Number"
                    id="gstNumber"
                  />
                  {#if formErrors.gstNumber}
                    <ul class="text-danger mt-1 text-xs capitalize">
                      <li>{formErrors.gstNumber[0]}</li>
                    </ul>
                  {/if}
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="mobile">Mobile</label>
                  <input
                    class="form-control"
                    class:is-invalid={formErrors.mobile}
                    type="text"
                    bind:value={mobile}
                    placeholder="Mobile"
                    id="mobile"
                  />
                  {#if formErrors.mobile}
                    <ul class="text-danger mt-1 text-xs capitalize">
                      <li>{formErrors.mobile[0]}</li>
                    </ul>
                  {/if}
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="email">Email</label>
                  <input
                    class="form-control"
                    class:is-invalid={formErrors.email}
                    type="email"
                    bind:value={email}
                    placeholder="Email"
                    id="email"
                  />
                  {#if formErrors.email}
                    <ul class="text-danger mt-1 text-xs capitalize">
                      <li>{formErrors.email[0]}</li>
                    </ul>
                  {/if}
                </div>

                <div class="col-md-6">
                  <label class="form-label" for="whatsapp">Whatsapp</label>
                  <input
                    class="form-control"
                    type="text"
                    bind:value={whatsapp}
                    placeholder="Whatsapp"
                    id="whatsapp"
                  />
                </div>

                <div class="col-12">
                  <label class="form-label" for="address">Address</label>
                  <textarea
                    class="form-control"
                    bind:value={address}
                    placeholder="Address"
                    id="address"
                    rows="2"
                  ></textarea>
                </div>

                <div class="col-12">
                  <label class="form-label" for="remark">Remark</label>
                  <textarea
                    class="form-control"
                    bind:value={remark}
                    placeholder="Remark"
                    id="remark"
                    rows="2"
                  ></textarea>
                </div>
              </div>
            </section>

            <!-- Contacts -->
            <section class="client-add-panel client-add-panel--contacts">
              <div class="client-add-contacts-scroll">
                {#each contacts as contact, i}
                  <div class="border rounded p-3 mb-3 position-relative">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                      <span class="fw-semibold text-sm text-muted">Contact #{i + 1}</span>
                      {#if contacts.length > 1}
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-danger"
                          on:click={() => removeContact(i)}
                        >
                          <i class="ti ti-trash"></i>
                        </button>
                      {/if}
                    </div>
                    <div class="row g-2">
                      <div class="col-md-6">
                        <label class="form-label">Name <span class="text-danger">*</span></label>
                        <input
                          class="form-control"
                          type="text"
                          bind:value={contact.name}
                          placeholder="Contact name"
                        />
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Designation</label>
                        <input
                          class="form-control"
                          type="text"
                          bind:value={contact.designation}
                          placeholder="e.g. Manager, Director"
                        />
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Mobile</label>
                        <input
                          class="form-control"
                          type="text"
                          bind:value={contact.mobile}
                          placeholder="Mobile"
                        />
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Email</label>
                        <input
                          class="form-control"
                          type="email"
                          bind:value={contact.email}
                          placeholder="Email"
                        />
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Whatsapp</label>
                        <input
                          class="form-control"
                          type="text"
                          bind:value={contact.whatsapp}
                          placeholder="Whatsapp"
                        />
                      </div>
                      <div class="col-md-6">
                        <label class="form-label">Alternate Mobile</label>
                        <input
                          class="form-control"
                          type="text"
                          bind:value={contact.alternateMobile}
                          placeholder="Alternate mobile"
                        />
                      </div>
                      <div class="col-12">
                        <label class="form-label">Address</label>
                        <input
                          class="form-control"
                          type="text"
                          bind:value={contact.address}
                          placeholder="Contact address"
                        />
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </section>
          </div>

          <!-- Submit -->
          <div class="d-flex justify-content-end mt-3 gap-2 pt-3 border-top">
            <a href="/admin/client" class="btn btn-sm btn-light">Cancel</a>
            <button class="btn btn-sm btn-primary" type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Client"}
            </button>
          </div>

        </form>
      </div>
    </div>

  </div>
</div>

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
  .client-page :global(label),
  .client-page :global(input),
  .client-page :global(textarea),
  .client-page :global(select) {
    font-size: var(--app-font-size, 0.75rem) !important;
    line-height: var(--app-line-height, 1.45);
  }

  .client-page :global(.text-sm),
  .client-page :global(.text-xs),
  .client-page :global(.text-muted),
  .client-page :global(small),
  .client-page :global(.badge) {
    font-size: var(--app-font-size-sm, 0.6875rem) !important;
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

  .client-add-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto 1fr;
    column-gap: 0;
    row-gap: 12px;
    align-items: stretch;
  }

  .client-add-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 20px 8px 0;
    border-bottom: 1px solid #dee2e6;
  }

  .client-add-panel-head--contacts {
    padding: 0 0 8px 20px;
    border-left: 1px solid #e9ecef;
  }

  .client-add-panel-title {
    margin: 0 !important;
    line-height: 1.35;
  }

  .client-add-panel {
    min-width: 0;
    padding-right: 20px;
  }

  .client-add-panel--contacts {
    padding-right: 0;
    padding-left: 20px;
    border-left: 1px solid #e9ecef;
  }

  .client-add-contacts-scroll {
    max-height: min(62vh, 640px);
    overflow-y: auto;
    padding-right: 4px;
  }

  @media (max-width: 991.98px) {
    .client-add-grid {
      grid-template-columns: 1fr;
      grid-template-rows: none;
      row-gap: 0;
    }

    .client-add-panel-head {
      padding: 0 0 8px 0;
      margin-bottom: 12px;
    }

    .client-add-panel-head--contacts {
      padding: 16px 0 8px 0;
      margin-top: 8px;
      border-left: none;
      border-top: 1px solid #e9ecef;
    }

    .client-add-panel {
      padding-right: 0;
      padding-bottom: 8px;
    }

    .client-add-panel--contacts {
      padding-left: 0;
      border-left: none;
    }

    .client-add-contacts-scroll {
      max-height: none;
      overflow: visible;
    }
  }
</style>
