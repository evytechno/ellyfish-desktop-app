<script>
  import { createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import Swal from "sweetalert2";

  export let selectedOrders = new Set();
  export let users = [];
  export let listOrders = [];
  export let currentUser = null;

  const dispatch = createEventDispatcher();

  let transferModalOpen = false;
  let transferUserId = null;
  let transferring = false;
  let replaceUsers = true;
  let overrideSameCompany = false;

  $: hasSameCompanyConflict = (() => {
    if (!transferUserId) return false;
    const toUser = users.find((u) => u.id === transferUserId);
    const toCompanyId = toUser?.company?.id ?? toUser?.companyId ?? null;
    if (!toCompanyId) return false;
    const selected = listOrders.filter((o) => selectedOrders.has(o.id));
    return selected.some((o) =>
      o.status === "Deal Lost" &&
      (o.assignedUsers || []).some((u) => {
        const uCompanyId = u.companyId ?? u.company?.id ?? null;
        return uCompanyId && uCompanyId === toCompanyId;
      })
    );
  })();

  function openTransfer() {
    transferUserId = null; replaceUsers = true; overrideSameCompany = false;
    transferModalOpen = true;
  }

  function closeTransfer() {
    transferModalOpen = false; transferUserId = null;
    replaceUsers = true; overrideSameCompany = false;
  }

  async function doTransfer() {
    if (!transferUserId) return;
    transferring = true;
    try {
      const res = await authApiFetch(API_ROUTES.ORDER + "/bulk-transfer", {
        method: "PUT",
        data: JSON.stringify({
          orderIds: [...selectedOrders],
          toUserId: Number(transferUserId),
          replaceUsers,
          overrideSameCompany: hasSameCompanyConflict ? overrideSameCompany : false,
        }),
      });
      const hasSkipped = res.skipped && res.skipped.length > 0;
      Swal.fire({
        icon: hasSkipped ? "warning" : "success",
        title: hasSkipped ? "Partially Transferred" : "Transferred!",
        html: hasSkipped
          ? `${res.message}<br><small class="text-muted">Skipped: ${res.skipped.map((s) => `#${s.id}`).join(", ")}</small>`
          : res.message,
      });
      closeTransfer();
      dispatch("transferred");
    } catch (e) {
      errorHandle(e);
    } finally {
      transferring = false;
    }
  }
</script>

{#if selectedOrders.size > 0 && ["master", "admin"].includes(currentUser?.role)}
  <div class="flex items-center gap-2 flex-wrap mb-2 px-1 py-2 bg-blue-50 border border-blue-200 rounded">
    <span class="text-sm font-semibold text-blue-700">
      <i class="ti ti-check me-1"></i>{selectedOrders.size} selected
    </span>
    {#if currentUser?.role === "master"}
      <button class="btn btn-sm btn-primary" on:click={openTransfer}>
        <i class="ti ti-transfer me-1"></i>Transfer
      </button>
    {/if}
    <button class="btn btn-sm btn-outline-danger" on:click={() => dispatch("exportPdf")}>
      <i class="ti ti-file-type-pdf me-1"></i>PDF ({selectedOrders.size})
    </button>
    <button class="btn btn-sm btn-outline-success" on:click={() => dispatch("exportExcel")}>
      <i class="ti ti-file-type-xls me-1"></i>Excel ({selectedOrders.size})
    </button>
    <button class="btn btn-sm btn-outline-secondary ms-auto" on:click={() => dispatch("clearSelection")}>
      <i class="ti ti-x me-1"></i>Clear
    </button>
  </div>
{/if}

<!-- Transfer Modal -->
{#if transferModalOpen && currentUser?.role === "master"}
  <div class="modal show d-block" tabindex="-1" style="background:rgba(0,0,0,0.45);">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="ti ti-transfer me-1"></i>Transfer {selectedOrders.size} Order{selectedOrders.size > 1 ? "s" : ""}
          </h5>
          <button class="btn-close" on:click={closeTransfer}></button>
        </div>
        <div class="modal-body">
          <p class="text-sm text-muted mb-3">
            Select a user to reassign the selected order{selectedOrders.size > 1 ? "s" : ""} to.
          </p>
          <label class="form-label">Transfer To</label>
          <select bind:value={transferUserId} class="form-select mb-3">
            <option value={null}>— Select User —</option>
            {#each users.filter((u) => u.status !== "banned" && u.role !== "master") as u}
              <option value={u.id}>{u.name} ({u.role}{u.subRole ? " · " + u.subRole : ""})</option>
            {/each}
          </select>

          <div class="form-check mb-1">
            <input class="form-check-input" type="checkbox" id="replaceUsersCheck" bind:checked={replaceUsers} />
            <label class="form-check-label fw-semibold" for="replaceUsersCheck">Replace existing assigned users</label>
          </div>
          <p class="text-xs text-muted ms-4">
            {#if replaceUsers}
              <i class="ti ti-alert-triangle text-warning me-1"></i>
              Current assignees will be <strong>removed</strong> and replaced.
            {:else}
              <i class="ti ti-user-plus text-success me-1"></i>
              Selected user will be <strong>added alongside</strong> existing assignees.
            {/if}
          </p>

          {#if hasSameCompanyConflict}
            <div class="form-check mb-1 mt-2">
              <input class="form-check-input" type="checkbox" id="overrideSameCompanyCheck"
                bind:checked={overrideSameCompany} />
              <label class="form-check-label fw-semibold text-warning" for="overrideSameCompanyCheck">
                Allow same company transfer
              </label>
            </div>
            <p class="text-xs text-muted ms-4">
              {#if overrideSameCompany}
                <i class="ti ti-alert-triangle text-warning me-1"></i>
                Deal Lost order will be transferred to the <strong>same company</strong>.
              {:else}
                <i class="ti ti-ban text-danger me-1"></i>
                Transfer blocked — check above to override.
              {/if}
            </p>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="btn btn-light" on:click={closeTransfer}>Cancel</button>
          <button
            class="btn btn-primary"
            disabled={!transferUserId || transferring || (hasSameCompanyConflict && !overrideSameCompany)}
            on:click={doTransfer}
          >
            {transferring ? "Transferring..." : "Confirm Transfer"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
