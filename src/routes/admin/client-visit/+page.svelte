<script>
  import { onMount } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { goto } from "$app/navigation";
  import { checkAuth } from "$lib/utils/auth";
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { companiesAllStore, usersAllStore } from "$lib/stores/dataStores";
  import { get } from "svelte/store";
  import { page } from "$app/stores";

  let currentUser = null;
  let visits = [];
  let users = [];
  let companies = [];
  let loadingData = true;
  let refresh = false;

  let searchTerm = "";
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let selectedFilter = "last7days";
  let customStartDate = null;
  let customEndDate = null;
  let visitTypeFilter = "";
  let statusFilter = "";
  let byUserId = null;
  let byCompanyId = null;
  let firstLoad = false;

  onMount(() => {
    currentUser = checkAuth();
    fetchVisits();
    getAllUsers();
    getAllCompanies();
    setTimeout(() => { firstLoad = true; }, 500);
  });

  function getDateRange() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (selectedFilter === "upcoming") {
      const end = new Date(today); end.setDate(end.getDate() + 7);
      return { startDate: today.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
    } else if (selectedFilter === "upcoming_all") {
      return { startDate: today.toISOString().slice(0, 10) };
    } else if (selectedFilter === "today") {
      return { startDate: today.toISOString().slice(0, 10), endDate: today.toISOString().slice(0, 10) };
    } else if (selectedFilter === "last7days") {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { startDate: s.toISOString().slice(0, 10), endDate: today.toISOString().slice(0, 10) };
    } else if (selectedFilter === "last30days") {
      const s = new Date(today); s.setDate(s.getDate() - 29);
      return { startDate: s.toISOString().slice(0, 10), endDate: today.toISOString().slice(0, 10) };
    } else if (selectedFilter === "custom" && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    return {};
  }

  async function fetchVisits() {
    loadingData = true;
    try {
      const { startDate, endDate } = getDateRange();
      const params = new URLSearchParams({ page: String(currentPage), limit: String(rowsPerPage) });
      if (searchTerm) params.set("search", searchTerm);
      if (visitTypeFilter) params.set("visitType", visitTypeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (byUserId) params.set("byUserId", String(byUserId));
      if (byCompanyId) params.set("byCompanyId", String(byCompanyId));

      const data = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}?${params}`);
      visits = data.data ?? [];
      totalItems = data.total ?? 0;
    } catch (e) {
    } finally {
      loadingData = false;
    }
  }

  async function getAllUsers() {
    const cached = get(usersAllStore);
    if (cached?.length > 0) { users = cached; return; }
    try {
      const data = await authApiFetch(API_ROUTES.USER + "/all");
      users = data;
      usersAllStore.set(data);
    } catch (_) {}
  }

  async function getAllCompanies() {
    const cached = get(companiesAllStore);
    if (cached?.length > 0) { companies = cached; return; }
    try {
      const data = await authApiFetch(API_ROUTES.COMPANY + "/all");
      companies = data;
      companiesAllStore.set(data);
    } catch (_) {}
  }

  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      await fetchVisits();
      refresh = false;
    }, 200);
  }

  let debounceTimeout;
  function handleSearchChange(value) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => { searchTerm = value; }, 300);
  }

  $: [searchTerm, selectedFilter, customStartDate, customEndDate, currentPage, rowsPerPage, visitTypeFilter, statusFilter, byUserId, byCompanyId], checkFetch();
  function checkFetch() {
    if (firstLoad) {
      if (selectedFilter === "custom" && (!customStartDate || !customEndDate)) return;
      fetchVisits();
    }
  }

  function formatDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2,"0")}-${String(dt.getMonth()+1).padStart(2,"0")}-${dt.getFullYear()}`;
  }

  const STATUS_BADGE = {
    scheduled: { cls: "bg-primary",  label: "Scheduled" },
    completed:  { cls: "bg-success",  label: "Completed" },
    cancelled:  { cls: "bg-danger",   label: "Cancelled" },
  };

  $: columns = [
    {
      key: "status",
      label: "Status",
      render: (val, row) => {
        const s = STATUS_BADGE[row.status] ?? { cls: "bg-secondary", label: row.status ?? "—" };
        return `<span class="badge ${s.cls}">${s.label}</span>`;
      },
    },
    {
      key: "visitType",
      label: "Type",
      render: (val, row) => {
        const BADGES = { incoming: 'bg-info', outgoing: 'bg-warning text-dark', joint: 'bg-primary', job_discussion: 'bg-success', job_received: 'bg-secondary', sample_sent: 'bg-danger' };
        const LABELS = { incoming: 'They Came To Us', outgoing: 'We Visited Client', joint: 'Joint Site Visit', job_discussion: 'Client Gave Job Details', job_received: 'Job Received', sample_sent: 'Sample Sent' };
        return `<span class="badge ${BADGES[row.visitType] ?? 'bg-secondary'}">${LABELS[row.visitType] ?? row.visitType}</span>`;
      },
    },
    {
      key: "visitDate",
      label: "Visit Date",
      render: (val, row) => formatDate(row.visitDate),
    },
    {
      key: "client",
      label: "Client",
      render: (val, row) => {
        const city = row.city ? `<div class="text-muted" style="font-size:10.5px;">${row.city}</div>` : "";
        return `<div>${row.client?.name ?? "—"}${city}</div>`;
      },
    },
    {
      key: "order",
      label: "Order",
      render: (val, row) => row.order
        ? `<a href="/admin/order/${row.order.id}" class="text-primary">#${row.order.id}</a>`
        : "—",
    },
    {
      key: "purpose",
      label: "Purpose",
      render: (val, row) => `<span title="${row.purpose}">${row.purpose?.length > 25 ? row.purpose.slice(0,25)+'…' : row.purpose}</span>`,
    },
    {
      key: "outcome",
      label: "Outcome",
      render: (val, row) => {
        const colors = { Positive: "bg-success", Negative: "bg-danger", Pending: "bg-warning text-dark", "No Response": "bg-secondary" };
        return row.outcome ? `<span class="badge ${colors[row.outcome] ?? 'bg-secondary'}">${row.outcome}</span>` : "—";
      },
    },
    {
      key: "attendees",
      label: "Attendees",
      render: (val, row) => String(row.attendees?.length ?? 0),
    },
    {
      key: "nextFollowUpDate",
      label: "Follow Up",
      render: (val, row) => formatDate(row.nextFollowUpDate),
    },
    ...(currentUser?.role !== "user" ? [
      {
        key: "createdBy",
        label: "By",
        render: (val, row) => row.createdBy?.name ?? "—",
      },
      {
        key: "company",
        label: "Company",
        render: (val, row) => row.company?.name ?? "—",
      },
    ] : []),
  ];

  let actions = [
    {
      label: "Edit",
      icon: "ti ti-edit",
      onClick: (id) => goto(`/admin/client-visit/edit/${id}`),
      color: "btn-soft-info",
    },
    {
      label: "Delete",
      icon: "ti ti-trash",
      onClick: (id) => deleteVisit(id),
      color: "btn-soft-danger",
    },
    {
      label: "View",
      icon: "ti ti-eye",
      onClick: (id) => goto(`/admin/client-visit/${id}`),
      color: "btn-soft-success",
    },
  ];

  async function deleteVisit(id) {
    const result = await Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this visit?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    });
    if (!result.isConfirmed) return;
    try {
      const data = await authApiFetch(`${API_ROUTES.CLIENT_VISIT}/${id}`, { method: "DELETE" });
      visits = visits.filter((v) => v.id !== id);
      Swal.fire("Deleted!", data.message, "success");
      refreshPage();
    } catch (err) {
      errorHandle(err);
    }
  }
</script>

<div class="page-wrapper">
  <div class="content">
    <!-- Page Header -->
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">Client Visits</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Client Visits</li>
          </ol>
        </nav>
      </div>
      <div class="gap-2 d-flex align-items-center flex-wrap">
        <a href="#refresh" on:click|preventDefault={refreshPage}
          class="btn btn-icon btn-outline-light shadow"
          data-bs-toggle="tooltip" data-bs-placement="top"
          aria-label="Refresh" data-bs-original-title="Refresh">
          <i class="ti ti-refresh"></i>
        </a>
        <a href="#collapse-header"
          class="btn btn-icon btn-outline-light shadow"
          data-bs-toggle="tooltip" data-bs-placement="top"
          aria-label="Collapse" data-bs-original-title="Collapse"
          id="collapse-header">
          <i class="ti ti-transition-top"></i>
        </a>
      </div>
    </div>

    <!-- Filters -->
    <div class="row g-2 align-items-center mb-3">
      <div class="col-auto">
        <div class="input-icon input-icon-start position-relative">
          <span class="input-icon-addon text-dark"><i class="ti ti-search"></i></span>
          <input type="text" value={searchTerm} on:input={(e) => handleSearchChange(e.target.value)}
            class="form-control" placeholder="Search.." style="min-width:160px;" />
        </div>
      </div>
      <div class="col-auto">
        <select bind:value={selectedFilter} class="form-select w-auto">
          <option value="all">All</option>
          <option value="upcoming">Upcoming (Next 7 Days)</option>
          <option value="upcoming_all">Upcoming (All Future)</option>
          <option value="today">Today</option>
          <option value="last7days">Last 7 Days</option>
          <option value="last30days">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>
      {#if selectedFilter === "custom"}
        <div class="col-auto">
          <input type="date" bind:value={customStartDate} class="form-control" style="min-width:140px;" />
        </div>
        <div class="col-auto">
          <input type="date" bind:value={customEndDate} class="form-control" style="min-width:140px;" />
        </div>
      {/if}
      <div class="col-auto">
        <select bind:value={visitTypeFilter} class="form-select w-auto">
          <option value="">All Types</option>
          <option value="incoming">They Came To Us</option>
          <option value="outgoing">We Visited Client</option>
          <option value="joint">Joint Site Visit</option>
          <option value="job_discussion">Client Gave Job Details</option>
          <option value="job_received">Job Received</option>
          <option value="sample_sent">Sample Sent</option>
        </select>
      </div>
      <div class="col-auto">
        <select bind:value={statusFilter} class="form-select w-auto">
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {#if currentUser?.role !== "user"}
        <div class="col-auto">
          <select bind:value={byUserId} class="form-select w-auto">
            <option value={null}>Select User</option>
            {#each users as u}
              <option value={u.id}>{u.name}</option>
            {/each}
          </select>
        </div>
        <div class="col-auto">
          <select bind:value={byCompanyId} class="form-select w-auto">
            <option value={null}>Select Company</option>
            {#each companies as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>
      {/if}
      <div class="col"></div>
      <div class="col-auto">
        <a href="/admin/client-visit/add" class="btn btn-primary">
          <i class="ti ti-square-rounded-plus-filled me-1"></i>Add New Visit
        </a>
      </div>
    </div>

    <!-- Table -->
    <div class="card border-0 rounded-0">
      <div class="card-body">
        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...visits]}
          {currentPage}
          {rowsPerPage}
          totalItems={totalItems}
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
