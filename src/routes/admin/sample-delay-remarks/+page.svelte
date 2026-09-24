<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth } from "$lib/utils/auth";
  import Loader from "$lib/components/Loader.svelte";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import Swal from "sweetalert2";

  let currentUser = null;
  let loadingData = true;
  let firstLoad = false;
  let errorMessage = "";

  let rows = [];
  let totalItems = 0;
  let currentPage = 1;
  let rowsPerPage = 10;

  let statusFilter = "Pending";
  let searchTerm = "";
  let searchString = "";

  function canAccess() {
    const r = String(currentUser?.role || "").toLowerCase();
    return r === "master" || r === "admin";
  }

  function isPending(row) {
    return String(row?.status || "").toLowerCase() === "pending";
  }

  function orderLabel(order) {
    if (!order) return "—";
    if (order.pId) return `#${order.pId}${order.title ? ` — ${order.title}` : ""}`;
    return order.title || `Order #${order.id}`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function fetchList() {
    if (!canAccess()) return;
    loadingData = true;
    errorMessage = "";
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(rowsPerPage),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(searchTerm ? { search: searchTerm } : {}),
      });
      const data = await authApiFetch(
        `${API_ROUTES.ORDER_SAMPLE}/delay-remarks?${params}`,
      );
      rows = data.data ?? [];
      totalItems = data.total ?? 0;
      searchString =
        statusFilter && statusFilter !== "All"
          ? statusFilter
          : totalItems
            ? "All"
            : "";
    } catch (err) {
      errorMessage = "Failed to load delay remarks.";
      errorHandle(err);
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 200);
    }
  }

  let debounceTimeout;
  function handleSearchChange(value) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      searchTerm = value;
      currentPage = 1;
    }, 300);
  }

  function refreshPage() {
    fetchList();
  }

  async function approveRecord(id) {
    const row = rows.find((r) => r.id === Number(id));
    if (!row) return;
    if (!isPending(row)) {
      Swal.fire("Already handled", "This delay remark is not pending.", "info");
      return;
    }
    const result = await Swal.fire({
      title: "Approve delay remark?",
      input: "textarea",
      inputLabel: "Reply (optional)",
      inputPlaceholder: "Optional reply to the submitter…",
      inputValue: "",
      showCancelButton: true,
      confirmButtonText: "Approve",
      confirmButtonColor: "#198754",
      footer: (row.note || "").slice(0, 200) || "No remark text",
    });
    if (!result.isConfirmed) return;

    try {
      const body =
        result.value != null && String(result.value).trim() !== ""
          ? { reply: String(result.value).trim() }
          : {};
      const data = await authApiFetch(
        `${API_ROUTES.ORDER_SAMPLE}/events/${row.id}/approve-delay`,
        { method: "POST", data: JSON.stringify(body) },
      );
      Swal.fire("Approved", data.message || "Delay remark approved.", "success");
      await fetchList();
    } catch (err) {
      errorHandle(err);
    }
  }

  async function returnRecord(id) {
    const row = rows.find((r) => r.id === Number(id));
    if (!row) return;
    if (!isPending(row)) {
      Swal.fire("Already handled", "This delay remark is not pending.", "info");
      return;
    }
    const result = await Swal.fire({
      title: "Return delay remark?",
      input: "textarea",
      inputLabel: "Reply (optional)",
      inputPlaceholder: "Optional reason / reply…",
      inputValue: "",
      showCancelButton: true,
      confirmButtonText: "Return",
      confirmButtonColor: "#dc3545",
      footer: (row.note || "").slice(0, 200) || "No remark text",
    });
    if (!result.isConfirmed) return;

    try {
      const body =
        result.value != null && String(result.value).trim() !== ""
          ? { reply: String(result.value).trim() }
          : {};
      const data = await authApiFetch(
        `${API_ROUTES.ORDER_SAMPLE}/events/${row.id}/return-delay`,
        { method: "POST", data: JSON.stringify(body) },
      );
      Swal.fire("Returned", data.message || "Delay remark returned.", "success");
      await fetchList();
    } catch (err) {
      errorHandle(err);
    }
  }

  function viewOrder(id) {
    const row = rows.find((r) => r.id === Number(id));
    if (row?.order?.id) goto(`/admin/order/${row.order.id}`);
  }

  $: columns = [
    {
      key: "sample",
      label: "Sample / Order",
      render: (_val, row) => {
        const code = row?.order?.sampleCode
          ? `<div class="fw-semibold font-mono">${escapeHtml(row.order.sampleCode)}</div>`
          : "";
        const orderHtml = row?.order?.id
          ? `<a href="/admin/order/${row.order.id}" class="text-primary text-truncate d-block" style="max-width:260px" title="${escapeHtml(orderLabel(row.order))}">${escapeHtml(orderLabel(row.order))}</a>`
          : `<span class="text-muted">—</span>`;
        const meta = row?.sample
          ? `<div class="text-muted" style="font-size:11px;">${escapeHtml(row.sample.direction || "—")} · ${escapeHtml(row.sample.status || "—")}${
              row.sample.sentDelay?.delayed && row.sample.sentDelay?.label
                ? ` · <span class="text-danger">${escapeHtml(row.sample.sentDelay.label)}</span>`
                : ""
            }</div>`
          : "";
        return `${code}${orderHtml}${meta}`;
      },
    },
    {
      key: "note",
      label: "Remark",
      render: (val) =>
        `<div class="small" style="white-space:pre-wrap;max-width:360px;">${escapeHtml(val || "—")}</div>`,
    },
    {
      key: "reply",
      label: "Reply",
      render: (val) =>
        val
          ? `<div class="small text-muted" style="white-space:pre-wrap;max-width:280px;">${escapeHtml(val)}</div>`
          : `<span class="text-muted">—</span>`,
    },
    {
      key: "status",
      label: "Status",
      render: (val) => {
        const s = String(val || "").toLowerCase();
        if (s === "pending") {
          return `<span class="badge bg-warning text-dark">Pending</span>`;
        }
        if (s === "approved") {
          return `<span class="badge bg-success">Approved</span>`;
        }
        if (s === "returned") {
          return `<span class="badge bg-danger">Returned</span>`;
        }
        return `<span class="badge bg-secondary">${escapeHtml(val || "—")}</span>`;
      },
    },
    {
      key: "createdAt",
      label: "Submitted",
      render: (val) => {
        if (!val) return "—";
        const d = new Date(val);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
      },
    },
    {
      key: "createdByExternal",
      label: "By",
      render: (val) => escapeHtml(val || "—"),
    },
  ];

  $: actions = [
    {
      label: "View Order",
      icon: "ti ti-eye",
      onClick: (id) => viewOrder(id),
      color: "btn-soft-primary",
    },
    {
      label: "Approve",
      icon: "ti ti-check",
      onClick: (id) => approveRecord(id),
      color: "btn-soft-success",
      hidden: (row) => !isPending(row),
    },
    {
      label: "Return",
      icon: "ti ti-arrow-back-up",
      onClick: (id) => returnRecord(id),
      color: "btn-soft-danger",
      hidden: (row) => !isPending(row),
    },
  ];

  $: [searchTerm, statusFilter, currentPage, rowsPerPage], checkFetch();

  function checkFetch() {
    if (firstLoad) fetchList();
  }

  onMount(async () => {
    currentUser = checkAuth();
    if (!canAccess()) {
      loadingData = false;
      goto("/admin/dashboard");
      return;
    }
    await fetchList();
    setTimeout(() => {
      firstLoad = true;
    }, 400);
  });
</script>

{#if loadingData}
  <Loader />
{/if}

<div class="page-wrapper">
  <div class="content">
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">
          Sample Delay Remarks
          <span class="text-xs font-normal">
            {searchString ? `(${searchString})` : ""}
          </span>
        </h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">
              Delay Remarks
            </li>
          </ol>
        </nav>
      </div>
      <div class="gap-2 d-flex align-items-center flex-wrap">
        <a
          href="#refresh"
          on:click|preventDefault={refreshPage}
          class="btn btn-icon btn-outline-light shadow"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          aria-label="Refresh"
          data-bs-original-title="Refresh"><i class="ti ti-refresh"></i></a
        >
        <a
          href="#collapse-header"
          class="btn btn-icon btn-outline-light shadow"
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          aria-label="Collapse"
          data-bs-original-title="Collapse"
          id="collapse-header"><i class="ti ti-transition-top"></i></a
        >
      </div>
    </div>

    {#if errorMessage}
      <div class="alert alert-danger">{errorMessage}</div>
    {/if}

    <div class="row g-2 align-items-center mb-3">
      <div class="col-auto">
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark">
            <i class="ti ti-search"></i>
          </span>
          <input
            type="text"
            value={searchTerm}
            on:input={(e) => handleSearchChange(e.target.value)}
            class="form-control"
            placeholder="Search.."
            style="min-width:160px;"
          />
        </div>
      </div>
      <div class="col-auto">
        <select
          bind:value={statusFilter}
          class="form-select w-auto"
          on:change={() => (currentPage = 1)}
        >
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Returned">Returned</option>
          <option value="All">All</option>
        </select>
      </div>
      <div class="col"></div>
    </div>

    <div class="card border-0 rounded-0">
      <div class="card-body">
        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...rows]}
          {currentPage}
          {rowsPerPage}
          {totalItems}
          totalPages={Math.ceil(totalItems / rowsPerPage) || 1}
          serverMode={true}
          on:pageChange={(e) => (currentPage = e.detail)}
          on:rowsPerPageChange={(e) => {
            rowsPerPage = e.detail;
            currentPage = 1;
          }}
          on:search={(e) => {
            searchTerm = e.detail;
            currentPage = 1;
          }}
        />
      </div>
    </div>
  </div>
</div>
