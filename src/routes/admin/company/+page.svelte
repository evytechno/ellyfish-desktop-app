<script>
  import DynamicDataTable from "$lib/components/DynamicDataTable.svelte";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";
  import { errorHandle } from "$lib/utils/errorHandle";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import { onMount } from "svelte";
  let loadingData = true;

  let firstLoad = false;
  let currentUser;
  onMount(() => {
    currentUser = checkAuth();
    if (currentUser?.role === "user") {
      loadingData = false;
      loading = false;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "You are not authorized to view this page.",
        confirmButtonText: "Go Back",
      }).then(() => {
        window.history.back();
      });
      return;
    }
    fetchCompanies();
    setTimeout(() => {
      firstLoad = true;
    }, 500);
  });

  let refresh = false;
  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      try {
        await Promise.all([fetchCompanies()]);
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        refresh = false;
      }
    }, 200);
  }

  let loading;

  let trashBin = false;

  let companies = [];
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let searchTerm = "";
  let columns = [
    {
      key: "name",
      label: "Name",
      render: (val, row) => {
        return `<a href="/admin/company/${row.id}"  class="flex items-center gap-1 text-danger">${row.name}</a>`;
        // return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
      },
    },
    { key: "email", label: "Email" },
    {
      key: "createdAt",
      label: "Created At",
      render: (val, row) => {
        const d = new Date(row.createdAt);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
      },
    },
  ];

  let actions = [
    {
      label: "Edit",
      icon: "ti ti-edit",
      onClick: (id) => editRecord(id),
      color: "btn-soft-info",
    },
    {
      label: "Delete",
      icon: "ti ti-trash",
      onClick: (id) => deleteRecord(id),
      color: "btn-soft-danger",
    },
  ];
  async function fetchCompanies() {
    loadingData = true;
    try {
      const query = new URLSearchParams({
        page: currentPage.toString(),
        limit: rowsPerPage.toString(),
        search: searchTerm || "",
      });
      if (trashBin) {
        query.append("withDeleted", trashBin);
      }

      const data = await authApiFetch(
        `${API_ROUTES.COMPANY}?${query.toString()}`,
        {
          method: "GET",
        }
      );

      companies = data.data;
      totalItems = data.total;
    } catch (error) {
      console.error("Fetch error:", error);
      loading = false;
      const validationErrors = errorHandle(error);
    } finally {
      loading = false;
      setTimeout(() => {
        loadingData = false;
      }, 500);
    }
  }

  const editRecord = async (id) => {
    goto("/admin/company/edit/" + id);
  };

  async function deleteRecord(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.COMPANY}/${id}`, {
            method: "DELETE",
          });
          companies = companies.filter((company) => company.id !== id); // Remove from local list
          Swal.fire("Deleted!", data.message, "success");
          goto("/admin/company");
        } catch (err) {
          const validationErrors = errorHandle(err);
        }
      }
    });
  }

  $: [searchTerm, currentPage, rowsPerPage, trashBin], checkFetchRecord();

  function checkFetchRecord() {
    if (firstLoad) {
      fetchCompanies();
    }
  }
</script>

{#if loadingData}
  <Loader />
{/if}
<div class="page-wrapper">
  <!-- Start Content -->
  <div class="content pb-0">
    <!-- Page Header -->
    <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
      <div>
        <h4 class="mb-1">Companies</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">
              Companies
            </li>
          </ol>
        </nav>
      </div>
      <div class="gap-2 d-flex align-items-center flex-wrap">
        <a
          href="#refresh"
          on:click={refreshPage}
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
    <!-- End Page Header -->

    <!-- card start -->
    <div class="card border-0 rounded-0">
      <div
        class="card-header flex items-center justify-between gap-2 flex-wrap"
      >
        {#if trashBin}
          <div class="pb-2.5">
            <button on:click={() => (trashBin = false)}>
              <i class="ti ti-arrow-narrow-left me-1"></i>Back
            </button>
          </div>
        {:else}
          <div class="input-icon input-icon-start position-relative">
            <h5>Companies List</h5>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            {#if currentUser?.role != "user"}
              <div
                class="d-flex align-items-center shadow p-1 rounded border view-icons bg-white"
              >
                <button
                  on:click={() => (trashBin = true)}
                  class="flex-shrink-0 btn btn-sm p-1 border-0 fs-14 bg-primary text-white"
                >
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            {/if}
            <a href="/admin/company/add" class="btn btn-primary">
              <i class="ti ti-square-rounded-plus-filled me-1"></i>Add Company
            </a>
          </div>
        {/if}
      </div>
      <div class="card-body">
        <DynamicDataTable
          loading={loadingData}
          {columns}
          {actions}
          data={[...companies]}
          {currentPage}
          {rowsPerPage}
          {totalItems}
          totalPages={Math.ceil(totalItems / rowsPerPage)}
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
    <!-- card end -->
  </div>
  <!-- End Content -->
</div>
