<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import Loader from "$lib/components/Loader.svelte";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";

  let loadingData = true;
  let errorMessage = "";

  let invoices = [];
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let search = "";
  let searchTimeout;

  onMount(async () => {
    // Handle URL param redirects (legacy links from other pages)
    const fromOrderId = $page.url.searchParams.get("fromOrder");
    const editId = $page.url.searchParams.get("editId");
    const syncId = $page.url.searchParams.get("syncId");

    if (fromOrderId) {
      goto(`/admin/invoice/create?fromOrder=${fromOrderId}`);
      return;
    }
    if (editId) {
      goto(`/admin/invoice/tax/${editId}/edit`);
      return;
    }
    if (syncId) {
      goto(`/admin/invoice/tax/${syncId}/edit?sync=1`);
      return;
    }

    await fetchInvoices();
  });

  async function fetchInvoices() {
    loadingData = true;
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(rowsPerPage),
        ...(search ? { search } : {}),
      });
      const data = await authApiFetch(`${API_ROUTES.INVOICE}?${params}`);
      invoices = data.data ?? [];
      totalItems = data.total ?? 0;
    } catch (err) {
      errorMessage = "Failed to load invoices.";
    } finally {
      setTimeout(() => { loadingData = false; }, 300);
    }
  }

  function handleSearch(e) {
    clearTimeout(searchTimeout);
    search = e.target.value;
    searchTimeout = setTimeout(() => { currentPage = 1; fetchInvoices(); }, 400);
  }

  const columns = [
    {
      key: "invoiceNo",
      label: "Invoice No",
      render: (val, row) =>
        `<a href="/admin/invoice/tax/${row.id}" class="text-danger fw-semibold">#${String(row.invoiceNo).padStart(6, "0")}</a>`,
    },
    {
      key: "invoiceDate",
      label: "Invoice Date",
      render: (val) => {
        if (!val) return "-";
        const d = new Date(val);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
      },
    },
    { key: "companySnapshot", label: "Company", render: (val) => val?.name ?? "-" },
    {
      key: "order",
      label: "Order",
      render: (val) =>
        val
          ? `<a href="/admin/order/${val.id}" class="text-primary">${val.financialYear}/${String(val.pId).padStart(6, "0")}</a>`
          : "-",
    },
    {
      key: "totalAmountValue",
      label: "Amount",
      render: (val, row) => {
        const sym = row.currency === "USD" ? "$" : "₹";
        return `${sym} ${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
      },
    },
    {
      key: "isLocked",
      label: "Status",
      render: (val) =>
        val
          ? `<span class="badge bg-success">Locked</span>`
          : `<span class="badge bg-warning text-dark">Draft</span>`,
    },
  ];

  async function deleteRecord(id) {
    const inv = invoices.find((i) => i.id === id);
    if (inv?.isLocked) {
      Swal.fire("Locked", "This invoice is locked and cannot be deleted.", "error");
      return;
    }
    const result = await Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this tax invoice?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    });
    if (!result.isConfirmed) return;
    try {
      const data = await authApiFetch(`${API_ROUTES.INVOICE}/${id}`, { method: "DELETE" });
      invoices = invoices.filter((i) => i.id !== id);
      Swal.fire("Deleted!", data.message, "success");
      fetchInvoices();
    } catch (err) {
      errorHandle(err);
    }
  }

  const actions = [
    {
      label: "View",
      icon: "ti ti-eye",
      onClick: (id) => goto(`/admin/invoice/tax/${id}`),
      color: "btn-soft-primary",
    },
    {
      label: "Edit",
      icon: "ti ti-edit",
      onClick: (id) => goto(`/admin/invoice/tax/${id}/edit`),
      color: "btn-soft-info",
    },
    {
      label: "Delete",
      icon: "ti ti-trash",
      onClick: (id) => deleteRecord(id),
      color: "btn-soft-danger",
    },
  ];
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper">
  <div class="content">
    <div class="d-flex align-items-center justify-content-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">Tax Invoices</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active">Tax Invoices</li>
          </ol>
        </nav>
      </div>
    </div>

    {#if errorMessage}
      <div class="alert alert-danger">{errorMessage}</div>
    {/if}

    <div class="card">
      <div class="card-body">
        <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <input
            type="text"
            class="form-control"
            style="max-width:280px"
            placeholder="Search invoices..."
            on:input={handleSearch}
          />
        </div>

        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...invoices]}
          {currentPage}
          {rowsPerPage}
          {totalItems}
          totalPages={Math.ceil(totalItems / rowsPerPage)}
          serverMode={true}
          on:pageChange={(e) => { currentPage = e.detail; fetchInvoices(); }}
          on:rowsPerPageChange={(e) => { rowsPerPage = e.detail; currentPage = 1; fetchInvoices(); }}
        />
      </div>
    </div>
  </div>
</div>
