<script>
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Loader from "$lib/components/Loader.svelte";
  import { onMount } from "svelte";
  import { checkAuth } from "$lib/utils/auth";

  let loadingData = true;
  let firstLoad = false;
  let currentUser;
  let users = [];
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let searchTerm = "";

  onMount(async () => {
    currentUser = checkAuth();
    if (currentUser?.role !== "master") {
      loadingData = false;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "Only master can manage app users.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return;
    }
    fetchUsers();
    setTimeout(() => {
      firstLoad = true;
    }, 500);

    document.addEventListener("click", (e) => {
      const target = e.target.closest(".updateAppUserStatus");
      if (target) changeStatus(target.dataset.id);
    });
  });

  let columns = [
    {
      key: "name",
      label: "Name",
      render: (val, row) =>
        `<a href="/admin/app-user/${row.id}" class="flex items-center gap-1 text-danger capitalize">${row.name}</a>`,
    },
    { key: "email", label: "Email" },
    {
      key: "mobile",
      label: "Mobile",
      render: (val) => val || "—",
    },
    {
      key: "permissions",
      label: "Access",
      render: (val, row) => {
        const p = row.permissions || {};
        const bits = [];
        if (p.sample_view || p.sample_update) bits.push("Sample");
        if (p.dispatch_view || p.dispatch_update || p.dispatch_hold)
          bits.push("Dispatch");
        return bits.length
          ? bits
              .map((b) => `<span class="badge bg-primary me-1">${b}</span>`)
              .join("")
          : "—";
      },
    },
    {
      key: "status",
      label: "Status",
      render: (val, row) => {
        if (row.status?.toLowerCase() === "active") {
          return `<div class="flex items-center gap-1 text-success capitalize cursor-pointer updateAppUserStatus" data-id="${row.id}"><i class="ti ti-circle-check me-1"></i>${row.status}</div>`;
        }
        return `<div class="flex items-center gap-1 text-secondary capitalize cursor-pointer updateAppUserStatus" data-id="${row.id}"><i class="ti ti-circle-minus me-1"></i>${row.status}</div>`;
      },
    },
    {
      key: "lastLogin",
      label: "Last Login",
      render: (val, row) => {
        if (!row.lastLogin) return "—";
        const d = new Date(row.lastLogin);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
      },
    },
  ];

  let actions = [
    {
      label: "Edit",
      icon: "ti ti-edit",
      onClick: (id) => goto("/admin/app-user/edit/" + id),
      color: "btn-soft-info",
    },
    {
      label: "Delete",
      icon: "ti ti-trash",
      onClick: (id) => deleteRecord(id),
      color: "btn-soft-danger",
    },
  ];

  async function fetchUsers() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        page: currentPage.toString(),
        limit: rowsPerPage.toString(),
        search: searchTerm || "",
      });
      const data = await authApiFetch(
        `${API_ROUTES.APP_USER}?${query.toString()}`,
        { method: "GET" },
      );
      users = data.data;
      totalItems = data.total;
    } catch (error) {
      errorHandle(error);
    } finally {
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  async function deleteRecord(id) {
    const result = await Swal.fire({
      title: "Delete Confirmation",
      text: "Delete this app user? They will no longer log into the Sample/Dispatch app.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    });
    if (!result.isConfirmed) return;
    try {
      const data = await authApiFetch(`${API_ROUTES.APP_USER}/${id}`, {
        method: "DELETE",
      });
      users = users.filter((u) => u.id !== id);
      Swal.fire("Deleted!", data.message, "success");
    } catch (err) {
      errorHandle(err);
    }
  }

  async function changeStatus(id) {
    const user = users.find((u) => u.id === Number(id));
    if (!user) return;

    const { value: selectedStatus, isConfirmed } = await Swal.fire({
      title: "Change Status",
      text: `Select status for ${user?.name}.`,
      icon: "question",
      input: "select",
      inputOptions: { active: "Active", inactive: "Inactive" },
      inputValue: user.status,
      showCancelButton: true,
      confirmButtonText: "Update",
      customClass: { input: "form-select !w-auto" },
    });
    if (!isConfirmed) return;

    try {
      await authApiFetch(`${API_ROUTES.APP_USER}/${id}`, {
        method: "PUT",
        data: { status: selectedStatus },
      });
      users = users.map((u) =>
        u.id === Number(id) ? { ...u, status: selectedStatus } : u,
      );
    } catch (err) {
      errorHandle(err);
    }
  }

  $: [searchTerm, currentPage, rowsPerPage], checkFetchRecord();

  function checkFetchRecord() {
    if (firstLoad) fetchUsers();
  }
</script>

{#if loadingData}<Loader />{/if}

<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <h4 class="mb-0">App Users</h4>
          <span class="badge bg-soft-danger text-danger">Master only</span>
        </div>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">App Users</li>
          </ol>
        </nav>
        <p class="text-muted mb-0 mt-2 text-sm" style="max-width: 36rem;">
          Logins for the Sample &amp; Dispatch app. Separate from CRM users — no sales pipeline access.
        </p>
      </div>
      <a href="/admin/app-user/add" class="btn btn-primary">
        <i class="ti ti-plus me-1"></i>Add App User
      </a>
    </div>

    <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
      <div class="card-header bg-white border-bottom py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="list-icon"><i class="ti ti-device-mobile"></i></span>
          <div>
            <h6 class="mb-0">App user list</h6>
            <small class="text-muted">{totalItems} total</small>
          </div>
        </div>
      </div>
      <div class="card-body">
        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...users]}
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
    border-radius: 0.5rem;
    background: #fef2f2;
    color: #dc2626;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  :global(.bg-soft-danger) {
    background: #fef2f2 !important;
  }
</style>
