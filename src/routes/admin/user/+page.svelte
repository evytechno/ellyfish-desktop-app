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

  let selectedUserIds = new Set();
  let sendingWarning = false;
  let loadingData = true;

  let firstLoad = false;
  let currentUser;
  onMount(async () => {
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
    fetchUsers();
    setTimeout(() => {
      firstLoad = true;
    }, 500);
    document.addEventListener("change", (e) => {
      const cb = e.target.closest(".warn-check");
      if (cb) {
        const id = Number(cb.dataset.id);
        if (cb.checked) selectedUserIds.add(id);
        else selectedUserIds.delete(id);
        selectedUserIds = new Set(selectedUserIds); // trigger reactivity
      }
    });

    document.addEventListener("click", (e) => {
      const target = e.target.closest(".updateStatus");
      if (target) {
        const id = target.dataset.id;
        changeStatus(id);
      }
      const timeTarget = e.target.closest(".updateLoginTime");
      if (timeTarget) {
        const id = timeTarget.dataset.id;
        changeLoginTime(id);
      }
    });
  });

  let loading;

  let trashBin = false;

  let users = [];
  let currentPage = 1;
  let rowsPerPage = 10;
  let totalItems = 0;
  let searchTerm = "";
  $: columns = [
    {
      key: "id",
      label: "",
      render: (val, row) => {
        const checked = selectedUserIds.has(row.id) ? "checked" : "";
        return `<input type="checkbox" class="form-check-input warn-check" data-id="${row.id}" ${checked} style="width:18px;height:18px;cursor:pointer;" />`;
      },
    },
    {
      key: "name",
      label: "Name",
      render: (val, row) => {
        const badge =
          row.status === "banned"
            ? `<span class="badge bg-danger ms-1" style="font-size:10px;">Banned</span>`
            : row.status === "inactive"
            ? `<span class="badge bg-secondary ms-1" style="font-size:10px;">Inactive</span>`
            : "";
        return `<a href="/admin/user/${row.id}" class="flex items-center gap-1 text-danger capitalize">${row.name}</a>`;
      },
    },
    { key: "email", label: "Email" },
    {
      key: "company",
      label: "Company",
      render: (val, row) => {
        return row?.company ? row?.company?.name : "-";
      },
    },
    {
      key: "role",
      label: "Role",
      render: (val, row) => {
        const sub = row?.subRole ? ` <span class="text-muted small">(${row.subRole})</span>` : "";
        return `<div class="capitalize">${row?.role}${sub}</div>`;
      },
    },
    {
      key: "status",
      label: "Status",
      render: (val, row) => {
        if (row.status.toLowerCase() === "active") {
          return `<div class="flex items-center gap-1 text-success capitalize cursor-pointer updateStatus" data-id="${row.id}"><i class="ti ti-circle-check me-1"></i>${row.status}</div>`;
        }
        if (row.status.toLowerCase() === "inactive") {
          return `<div class="flex items-center gap-1 text-secondary capitalize cursor-pointer updateStatus" data-id="${row.id}"><i class="ti ti-circle-minus me-1"></i>${row.status}</div>`;
        }
        if (row.status.toLowerCase() === "banned") {
          return `<div class="flex items-center gap-1 text-danger capitalize cursor-pointer updateStatus" data-id="${row.id}"><i class="ti ti-ban me-1"></i>${row.status}</div>`;
        }
      },
    },
    {
      key: "lastLogin",
      label: "Last Login",
      render: (val, row) => {
        if (row.lastLogin) {
          const d = new Date(row.lastLogin);
          return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
        } else {
          return `-`;
        }
      },
    },
    {
      key: "loginStartTime",
      label: "Login Window",
      render: (val, row) => {
        const start = row.loginStartTime || "09:00";
        const end   = row.loginEndTime   || "18:10";
        const isCustom = row.loginStartTime || row.loginEndTime;
        const badge = isCustom
          ? `<span class="badge bg-success ms-1" style="font-size:10px;">Custom</span>`
          : `<span class="badge bg-secondary ms-1" style="font-size:10px;">Default</span>`;
        return `<div class="flex items-center gap-1 cursor-pointer updateLoginTime" data-id="${row.id}">
          <i class="ti ti-clock text-primary fs-14"></i>
          <span class="text-primary">${start} – ${end}</span>${badge}
        </div>`;
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

  let refresh = false;
  let debounceRefreshTimeout;
  async function refreshPage() {
    if (debounceRefreshTimeout) clearTimeout(debounceRefreshTimeout);
    debounceRefreshTimeout = setTimeout(async () => {
      refresh = true;
      try {
        await Promise.all([fetchUsers()]);
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        refresh = false;
      }
    }, 200);
  }

  async function fetchUsers() {
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
        `${API_ROUTES.USER}?${query.toString()}`,
        { method: "GET" }
      );

      users = data.data;
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
    goto("/admin/user/edit/" + id);
  };

  async function deleteRecord(id) {
    Swal.fire({
      title: "Delete Confirmation",
      text: "Are you sure you want to delete this record?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const data = await authApiFetch(`${API_ROUTES.USER}/${id}`, {
            method: "DELETE",
          });
          users = users.filter((user) => user.id !== id); // Remove from local list
          Swal.fire("Deleted!", data.message, "success");
          goto("/admin/user");
        } catch (err) {
          const validationErrors = errorHandle(err);
        }
      }
    });
  }

  async function changeStatus(id) {
    const user = users.find((u) => u.id === Number(id));
    if (!user) return console.error("User not found");

    const { value: selectedStatus, isConfirmed } = await Swal.fire({
      title: "Change User Status",
      text: `Select a new status for ${user?.name}.`,
      icon: "question",
      input: "select",
      inputOptions: {
        active: "Active",
        inactive: "Inactive",
        banned: "Banned",
      },
      inputPlaceholder: "Choose status",
      inputValue: user.status,
      showCancelButton: true,
      confirmButtonText: "Update Status",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#28a745",
      customClass: {
        input: "form-select !w-auto",
      },
      inputValidator: (value) => {
        if (!value) return "Please select a status!";
      },
    });

    if (!isConfirmed) return;

    try {
      Swal.showLoading();

      await authApiFetch(`${API_ROUTES.USER}/${id}`, {
        method: "PUT",
        data: JSON.stringify({ status: selectedStatus }),
      });

      users = users.map((u) =>
        u.id === Number(id) ? { ...u, status: selectedStatus } : u
      );

      // Swal.fire(
      //   "Success!",
      //   `User status changed to "${selectedStatus}".`,
      //   "success"
      // );
    } catch (err) {
      console.error("Failed to change user status:", err);
    }
  }

  async function changeLoginTime(id) {
    const user = users.find((u) => u.id === Number(id));
    if (!user) return;

    const { value: formValues, isConfirmed } = await Swal.fire({
      title: `Login Window — ${user.name}`,
      html: `
        <div class="text-start mb-3">
          <label class="form-label fw-semibold">Login Start Time</label>
          <input id="swal-start" type="time" class="form-control"
            value="${user.loginStartTime || '09:00'}" />
        </div>
        <div class="text-start">
          <label class="form-label fw-semibold">Login End Time</label>
          <input id="swal-end" type="time" class="form-control"
            value="${user.loginEndTime || '18:10'}" />
        </div>`,
      showCancelButton: true,
      confirmButtonText: "Save",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#28a745",
      focusConfirm: false,
      preConfirm: () => {
        const start = document.getElementById("swal-start").value;
        const end   = document.getElementById("swal-end").value;
        return {
          loginStartTime: (start && start !== '09:00') ? start : null,
          loginEndTime:   (end   && end   !== '18:10') ? end   : null,
        };
      },
    });

    if (!isConfirmed) return;

    try {
      Swal.showLoading();
      await authApiFetch(`${API_ROUTES.USER}/${id}`, {
        method: "PUT",
        data: JSON.stringify(formValues),
      });

      users = users.map((u) =>
        u.id === Number(id)
          ? { ...u, loginStartTime: formValues.loginStartTime, loginEndTime: formValues.loginEndTime }
          : u
      );

      Swal.fire("Saved!", "Login window updated successfully.", "success");
    } catch (err) {
      Swal.fire("Error", errorHandle(err), "error");
    }
  }

  $: [searchTerm, currentPage, rowsPerPage, trashBin], checkFetchRecord();

  function checkFetchRecord() {
    if (firstLoad) {
      fetchUsers();
    }
  }

  async function sendWarning() {
    if (selectedUserIds.size === 0) {
      Swal.fire({ icon: "warning", title: "No users selected", text: "Please select at least one user to send a warning." });
      return;
    }

    const { value: formValues, isConfirmed } = await Swal.fire({
      title: `<span style="font-size:1.1rem;font-weight:700;">⚠️ Send Warning</span>`,
      html: `
        <div style="text-align:left;">
          <div style="margin-bottom:14px;">
            <label style="font-weight:600;font-size:0.85rem;color:#374151;display:block;margin-bottom:5px;">
              📝 Message
            </label>
            <textarea id="swal-warn-msg" rows="3"
              style="width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:0.92rem;resize:vertical;outline:none;"
            >Reminder: Mobile usage during work hours is not permitted. Please focus on your tasks.</textarea>
          </div>

          <div style="margin-bottom:14px;">
            <label style="font-weight:600;font-size:0.85rem;color:#374151;display:block;margin-bottom:5px;">
              ⏱️ Auto-close Duration
            </label>
            <select id="swal-warn-duration"
              style="width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:0.92rem;outline:none;">
              <option value="10">10 seconds</option>
              <option value="20">20 seconds</option>
              <option value="30">30 seconds</option>
              <option value="60">60 seconds</option>
            </select>
          </div>

          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f9fafb;border-radius:8px;border:1.5px solid #e5e7eb;">
            <input type="checkbox" id="swal-warn-sound" checked
              style="width:18px;height:18px;cursor:pointer;accent-color:#ef4444;" />
            <label for="swal-warn-sound" style="font-weight:600;font-size:0.88rem;color:#374151;cursor:pointer;margin:0;">
              🔔 Play alert sound on user screen
            </label>
          </div>

          <div style="margin-top:12px;padding:8px 12px;background:#fef2f2;border-radius:8px;border-left:3px solid #ef4444;">
            <p style="margin:0;font-size:0.8rem;color:#991b1b;">
              Sending to <strong>${selectedUserIds.size}</strong> selected user(s)
            </p>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "🚀 Send Warning",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ef4444",
      width: 480,
      focusConfirm: false,
      preConfirm: () => {
        const msg = document.getElementById("swal-warn-msg").value.trim();
        if (!msg) { Swal.showValidationMessage("Message cannot be empty."); return false; }
        return {
          message:  msg,
          duration: Number(document.getElementById("swal-warn-duration").value),
          sound:    document.getElementById("swal-warn-sound").checked,
        };
      },
    });

    if (!isConfirmed || !formValues) return;

    sendingWarning = true;
    try {
      await authApiFetch(`${API_ROUTES.WARNING}/send`, {
        method: "POST",
        data: JSON.stringify({
          userIds:  [...selectedUserIds],
          message:  formValues.message,
          duration: formValues.duration,
          sound:    formValues.sound,
        }),
      });
      selectedUserIds = new Set();
      Swal.fire({ icon: "success", title: "Warning Sent!", timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Failed", text: errorHandle(err) });
    } finally {
      sendingWarning = false;
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
        <h4 class="mb-1">Users</h4>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0 p-0">
            <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Users</li>
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
            <h5>Users List</h5>
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
            {#if currentUser?.role === "master" || currentUser?.role === "admin"}
              <button
                class="btn btn-danger"
                on:click={sendWarning}
                disabled={sendingWarning || selectedUserIds.size === 0}
              >
                {#if sendingWarning}
                  <span class="spinner-border spinner-border-sm me-1"></span>
                {:else}
                  <i class="ti ti-alert-triangle me-1"></i>
                {/if}
                Send Warning{selectedUserIds.size > 0 ? ` (${selectedUserIds.size})` : ""}
              </button>
            {/if}
            <a href="/admin/user/add" class="btn btn-primary">
              <i class="ti ti-square-rounded-plus-filled me-1"></i>Add User
            </a>
          </div>
        {/if}
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
