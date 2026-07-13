<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { goto } from "$app/navigation";
  import { checkAuth } from "$lib/utils/auth";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import Swal from "sweetalert2";

  let loadingData = true;
  let firstLoad = false;
  let converting = null;

  let items = [];
  let totalItems = 0;
  let currentPage = 1;
  let rowsPerPage = 20;
  let searchTerm = "";

  let detailModalOpen = false;
  let detailItem = null;

  let convertModalOpen = false;
  let convertSource = null;
  let convertForm = {
    title: "", description: "", category: "",
    customerName: "", phone: "", whatsapp: "", companyName: "", address: "",
  };

  onMount(async () => {
    checkAuth();
    await fetchList();
    firstLoad = true;
  });

  async function fetchList() {
    loadingData = true;
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(rowsPerPage) });
      if (searchTerm) params.set("search", searchTerm);
      const res = await authApiFetch(`${API_ROUTES.OLD_INQUIRY}/my?${params}`);
      items = res.data ?? [];
      totalItems = res.total ?? 0;
    } catch (e) {
      errorHandle(e);
    } finally {
      loadingData = false;
    }
  }

  let debounce;
  $: [searchTerm, currentPage, rowsPerPage], (() => {
    if (!firstLoad) return;
    clearTimeout(debounce);
    debounce = setTimeout(fetchList, 250);
  })();

  $: columns = [
    {
      key: "inquiryCode",
      label: "Code",
      render: (val) => `<span class="text-muted small">${val || "—"}</span>`,
    },
    {
      key: "customerName",
      label: "Customer",
      render: (val, row) =>
        `<a href="#" class="text-primary fw-semibold">${val || "—"}</a>`,
    },
    { key: "companyName", label: "Company", render: (val) => val || "—" },
    { key: "phone", label: "Phone", render: (val) => val || "—" },
    { key: "productInterest", label: "Product", render: (val) => val || "—" },
    {
      key: "followups",
      label: "History",
      render: (val) =>
        `<span class="badge bg-light text-dark border">${Array.isArray(val) ? val.length : 0} notes</span>`,
    },
  ];

  $: actions = [
    {
      label: "View History",
      icon: "ti ti-eye",
      color: "btn-soft-info",
      onClick: (id) => {
        const item = items.find((i) => i.id === id);
        if (item) openDetail(item);
      },
    },
    {
      label: "Move to Order",
      icon: "ti ti-arrow-right",
      color: "btn-soft-success",
      disabled: (row) => row.status === "converted",
      onClick: (id) => {
        const item = items.find((i) => i.id === id);
        if (item && item.status !== "converted") convertToOrder(item);
      },
    },
  ];

  function convertToOrder(item) {
    convertSource = item;
    convertForm = {
      title: item.productInterest || "",
      description: `Imported from old inquiry${item.inquiryCode ? ": " + item.inquiryCode : ""}${item.description ? "\n\n[Raw Data]\n" + item.description : ""}`,
      category: "",
      customerName: item.customerName || "",
      phone: item.phone || "",
      whatsapp: item.phone || "",
      companyName: item.companyName || "",
      address: item.address || "",
    };
    convertModalOpen = true;
  }

  async function submitConvert() {
    if (!convertSource) return;
    converting = convertSource.id;
    try {
      const res = await authApiFetch(`${API_ROUTES.OLD_INQUIRY}/${convertSource.id}/convert`, {
        method: "POST",
        data: convertForm,
      });
      convertModalOpen = false;
      Swal.fire("Done!", "Order created successfully.", "success").then(() => {
        goto(`/admin/order/${res.orderId}`);
      });
    } catch (e) {
      errorHandle(e);
    } finally {
      converting = null;
    }
  }

  function openDetail(item) {
    detailItem = item;
    detailModalOpen = true;
  }
</script>

<div class="page-wrapper">
  <div class="content">
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">My Old Inquiries</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active">My Old Inquiries</li>
          </ol>
        </nav>
      </div>
      <button class="btn btn-icon btn-outline-light shadow" on:click={fetchList} title="Refresh">
        <i class="ti ti-refresh"></i>
      </button>
    </div>

    <div class="row g-2 align-items-center mb-3">
      <div class="col-auto">
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
          <input
            type="text"
            bind:value={searchTerm}
            class="form-control"
            placeholder="Search name, phone, product..."
            style="min-width:200px;"
          />
        </div>
      </div>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-body">
        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...items]}
          {currentPage}
          {rowsPerPage}
          {totalItems}
          totalPages={Math.ceil(totalItems / rowsPerPage)}
          serverMode={true}
          headersItemShow={false}
          on:pageChange={(e) => (currentPage = e.detail)}
          on:rowsPerPageChange={(e) => { rowsPerPage = e.detail; currentPage = 1; }}
          on:search={(e) => { searchTerm = e.detail; currentPage = 1; }}
        />
      </div>
    </div>
  </div>
</div>

<!-- Detail Modal -->
{#if detailModalOpen && detailItem}
  <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            {detailItem.customerName || "Detail"}
            {detailItem.inquiryCode ? `— ${detailItem.inquiryCode}` : ""}
          </h5>
          <button type="button" class="btn-close" on:click={() => (detailModalOpen = false)}></button>
        </div>
        <div class="modal-body">
          <div class="row g-3 mb-4">
            <div class="col-6"><strong>Inquiry Code:</strong> {detailItem.inquiryCode || "—"}</div>
            <div class="col-6"><strong>Status:</strong>
              <span class="badge {detailItem.status === 'converted' ? 'bg-success' : detailItem.status === 'assigned' ? 'bg-info' : 'bg-warning text-dark'}">
                {detailItem.status}
              </span>
            </div>
            <div class="col-6"><strong>Customer Name:</strong> {detailItem.customerName || "—"}</div>
            <div class="col-6"><strong>Phone:</strong> {detailItem.phone || "—"}</div>
            <div class="col-6"><strong>Company:</strong> {detailItem.companyName || "—"}</div>
            <div class="col-6"><strong>Product:</strong> {detailItem.productInterest || "—"}</div>
            <div class="col-12"><strong>Address:</strong> {detailItem.address || "—"}</div>
            {#if detailItem.description}
              <div class="col-12">
                <strong>Description / Raw Data:</strong>
                <div class="mt-1 p-2 bg-light rounded small text-muted" style="white-space:pre-wrap;max-height:120px;overflow-y:auto;">{detailItem.description}</div>
              </div>
            {/if}
            <div class="col-6"><strong>Assigned At:</strong> {detailItem.assignedAt ? new Date(detailItem.assignedAt).toLocaleDateString('en-IN') : "—"}</div>
            <div class="col-6"><strong>Imported At:</strong> {detailItem.createdAt ? new Date(detailItem.createdAt).toLocaleDateString('en-IN') : "—"}</div>
          </div>

          <h6 class="mb-2">Follow-up History ({detailItem.followups?.length ?? 0})</h6>
          <div style="max-height:320px;overflow-y:auto;">
            {#if detailItem.followups?.length}
              {#each detailItem.followups as f}
                <div class="d-flex gap-3 p-2 mb-1 bg-light rounded">
                  <span class="text-muted small" style="min-width:90px;">{f.date || "No date"}</span>
                  <span>{f.remark || "—"}</span>
                </div>
              {/each}
            {:else}
              <p class="text-muted">No follow-up history.</p>
            {/if}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" on:click={() => (detailModalOpen = false)}>Close</button>
          <button
            class="btn btn-success"
            on:click={() => { detailModalOpen = false; convertToOrder(detailItem); }}
          >
            <i class="ti ti-arrow-right me-1"></i>Move to Order
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Convert to Order Modal -->
{#if convertModalOpen && convertSource}
  <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);z-index:1060;">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-arrow-right me-2 text-success"></i>Convert to Order
            {#if convertSource.inquiryCode}
              <span class="text-muted small ms-2">— {convertSource.inquiryCode}</span>
            {/if}
          </h5>
          <button type="button" class="btn-close" on:click={() => (convertModalOpen = false)}></button>
        </div>
        <div class="modal-body">

          <p class="fw-semibold text-uppercase text-muted small mb-2 border-bottom pb-1">Order Details</p>
          <div class="row g-3 mb-4">
            <div class="col-12">
              <label class="form-label">Title <span class="text-danger">*</span></label>
              <input class="form-control" bind:value={convertForm.title} placeholder="Product / service title" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Category</label>
              <input class="form-control" bind:value={convertForm.category} placeholder="e.g. Thermal Spray, Blasting..." />
            </div>
            <div class="col-12">
              <label class="form-label">Description</label>
              <textarea class="form-control" rows="2" bind:value={convertForm.description}></textarea>
            </div>
          </div>

          <p class="fw-semibold text-uppercase text-muted small mb-2 border-bottom pb-1">Customer Details</p>
          <div class="row g-3 mb-4">
            <div class="col-md-6">
              <label class="form-label">Customer Name</label>
              <input class="form-control" bind:value={convertForm.customerName} placeholder="Full name" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Company</label>
              <input class="form-control" bind:value={convertForm.companyName} placeholder="Company name" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Phone</label>
              <input class="form-control" bind:value={convertForm.phone} placeholder="Mobile number"
                on:input={() => { if (!convertForm.whatsapp) convertForm.whatsapp = convertForm.phone; }} />
            </div>
            <div class="col-md-6">
              <label class="form-label">WhatsApp</label>
              <input class="form-control" bind:value={convertForm.whatsapp} placeholder="WhatsApp number" />
            </div>
            <div class="col-12">
              <label class="form-label">Address</label>
              <input class="form-control" bind:value={convertForm.address} placeholder="Full address" />
            </div>
          </div>

          {#if convertSource.followups?.length}
            <p class="fw-semibold text-uppercase text-muted small mb-2 border-bottom pb-1">
              Follow-up History — {convertSource.followups.length} notes will be saved as chat messages
            </p>
            <div style="max-height:180px;overflow-y:auto;" class="mb-2">
              {#each convertSource.followups as f}
                <div class="d-flex gap-3 p-2 mb-1 bg-light rounded">
                  <span class="text-muted small" style="min-width:90px;">{f.date || "No date"}</span>
                  <span class="small">{f.remark || "—"}</span>
                </div>
              {/each}
            </div>
          {/if}

        </div>
        <div class="modal-footer">
          <button class="btn btn-light" on:click={() => (convertModalOpen = false)}>Cancel</button>
          <button
            class="btn btn-success"
            disabled={converting === convertSource.id || !convertForm.title}
            on:click={submitConvert}
          >
            {#if converting === convertSource.id}
              <span class="spinner-border spinner-border-sm me-1"></span>Creating...
            {:else}
              <i class="ti ti-check me-1"></i>Confirm & Create Order
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
