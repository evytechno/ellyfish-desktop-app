<script>
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Loader from "$lib/components/Loader.svelte";
  import { onMount } from "svelte";
  import { checkAuth, canAccess } from "$lib/utils/auth";

  let loadingData = true;
  let firstLoad = false;
  let currentUser;
  let rows = [];
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let searchTerm = "";
  let statusFilter = "";
  let hasHeadFilter = "";
  let closeOutFilter = "";

  const STATUS_LABELS = {
    delivered: "Delivered",
    installationInProgress: "Installation",
    installed: "Installed",
  };

  onMount(async () => {
    currentUser = checkAuth();
    if (
      !["master", "admin", "manager"].includes(currentUser?.role) ||
      !canAccess("installation", "view", currentUser)
    ) {
      loadingData = false;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "You do not have access to the Installation module.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return;
    }
    await fetchList();
    setTimeout(() => {
      firstLoad = true;
    }, 400);
  });

  function formatWhen(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function openJobById(id) {
    const row = rows.find((r) => Number(r.id) === Number(id));
    if (row?.orderId) {
      goto(`/admin/order/${row.orderId}/dispatch`);
      return;
    }
    Swal.fire({
      icon: "warning",
      title: "Order link missing",
      text: `No CRM order found for work order ${row?.workOrder || id}.`,
    });
  }

  $: columns = [
    {
      key: "workOrder",
      label: "Work order",
      render: (val, row) => {
        const title = row.orderTitle
          ? `<div class="text-xs text-muted truncate max-w-[220px]">${row.orderTitle}</div>`
          : "";
        const href = row.orderId
          ? `/admin/order/${row.orderId}/dispatch`
          : "#";
        return `<a href="${href}" class="font-monospace fw-semibold text-danger">${val || "—"}</a>${title}`;
      },
    },
    {
      key: "location",
      label: "Location",
      render: (_, row) => {
        const parts = [row.city, row.state].filter(Boolean);
        return parts.length ? parts.join(", ") : "—";
      },
    },
    {
      key: "status",
      label: "Stage",
      render: (val) => {
        const label = STATUS_LABELS[val] || val || "—";
        const cls =
          val === "installed"
            ? "bg-success-subtle text-success"
            : val === "installationInProgress"
              ? "bg-primary-subtle text-primary"
              : "bg-warning-subtle text-warning";
        return `<span class="badge border ${cls}">${label}</span>`;
      },
    },
    {
      key: "crew",
      label: "Crew / Head",
      render: (_, row) => {
        const crew = row.hasCrew
          ? `<span class="badge bg-light text-dark border me-1">${row.crewCount} crew</span>`
          : `<span class="badge bg-danger-subtle text-danger border me-1">No crew</span>`;
        const head = row.hasHead
          ? `<span class="badge bg-success-subtle text-success border" title="${row.headEmail || ""}">${row.headName || row.headEmail || "Head set"}</span>`
          : `<span class="badge bg-warning-subtle text-warning border">No Head</span>`;
        return `<div class="d-flex flex-wrap gap-1">${crew}${head}</div>`;
      },
    },
    {
      key: "closeOut",
      label: "Close-out",
      render: (_, row) => {
        if (row.finalClientDone) {
          return `<span class="badge bg-success-subtle text-success border">Done</span>`;
        }
        if (row.reviewDone) {
          return `<span class="badge bg-info-subtle text-info border">Review done</span>`;
        }
        return `<span class="badge bg-secondary-subtle text-secondary border">Pending</span>`;
      },
    },
    {
      key: "lastActivity",
      label: "Last activity",
      render: (_, row) => {
        const title = row.lastActivityTitle
          ? `<div class="truncate max-w-[200px]">${row.lastActivityTitle}</div>`
          : `<div class="text-muted">—</div>`;
        return `${title}<div class="text-xs text-muted">${formatWhen(row.lastActivityAt)}</div>`;
      },
    },
  ];

  let actions = [
    {
      label: "Open",
      icon: "ti ti-tool",
      onClick: (id) => openJobById(id),
      color: "btn-soft-primary",
    },
  ];

  async function fetchList() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        page: String(currentPage),
        limit: String(rowsPerPage),
        search: searchTerm || "",
      });
      if (statusFilter) query.set("status", statusFilter);
      if (hasHeadFilter) query.set("hasHead", hasHeadFilter);
      if (closeOutFilter) query.set("closeOut", closeOutFilter);

      const data = await authApiFetch(
        `${API_ROUTES.DISPATCH}?${query.toString()}`,
        { method: "GET" },
      );
      rows = data.data ?? [];
      totalItems = data.total ?? rows.length;
    } catch (error) {
      errorHandle(error);
      rows = [];
      totalItems = 0;
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 300);
    }
  }

  $: [searchTerm, currentPage, rowsPerPage, statusFilter, hasHeadFilter, closeOutFilter],
    checkFetch();

  function checkFetch() {
    if (firstLoad) fetchList();
  }

  function resetFilters() {
    statusFilter = "";
    hasHeadFilter = "";
    closeOutFilter = "";
    searchTerm = "";
    currentPage = 1;
  }
</script>

{#if loadingData}<Loader />{/if}

<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <h4 class="mb-0">Installation queue</h4>
          <span class="badge bg-soft-primary text-primary">Install Manager</span>
        </div>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Installation</li>
          </ol>
        </nav>
        <p class="text-muted mb-0 mt-2 text-sm" style="max-width: 40rem;">
          Delivered → Installation → Installed jobs. Assign crew / Head, track close-out, open the dispatch process.
        </p>
      </div>
    </div>

    <div class="card border-0 shadow-sm rounded-3 overflow-hidden mb-3">
      <div class="card-body py-3">
        <div class="d-flex flex-wrap gap-2 align-items-end">
          <div>
            <label class="form-label text-xs mb-1">Stage</label>
            <select
              class="form-select form-select-sm"
              style="min-width: 10rem;"
              bind:value={statusFilter}
              on:change={() => (currentPage = 1)}
            >
              <option value="">All install stages</option>
              <option value="delivered">Delivered</option>
              <option value="installationInProgress">Installation</option>
              <option value="installed">Installed</option>
            </select>
          </div>
          <div>
            <label class="form-label text-xs mb-1">Head</label>
            <select
              class="form-select form-select-sm"
              style="min-width: 8rem;"
              bind:value={hasHeadFilter}
              on:change={() => (currentPage = 1)}
            >
              <option value="">Any</option>
              <option value="yes">Has Head</option>
              <option value="no">No Head</option>
            </select>
          </div>
          <div>
            <label class="form-label text-xs mb-1">Close-out</label>
            <select
              class="form-select form-select-sm"
              style="min-width: 9rem;"
              bind:value={closeOutFilter}
              on:change={() => (currentPage = 1)}
            >
              <option value="">Any</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </select>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" on:click={resetFilters}>
            Reset
          </button>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
      <div class="card-header bg-white border-bottom py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="list-icon"><i class="ti ti-tool"></i></span>
          <div>
            <h6 class="mb-0">Install jobs</h6>
            <small class="text-muted">{totalItems} total</small>
          </div>
        </div>
      </div>
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

<style>
  .list-icon {
    width: 2.25rem;
    height: 2.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    background: #eff6ff;
    color: #2563eb;
  }
  .font-monospace {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
</style>
