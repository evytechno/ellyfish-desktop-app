<script>
  import { createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { errorHandle } from "$lib/utils/errorHandle";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { canAccess } from "$lib/utils/auth";
  import Swal from "sweetalert2";

  export let selectedOrders = new Set();
  export let users = [];
  export let listOrders = [];
  export let currentUser = null;

  const dispatch = createEventDispatcher();

  let transferModalOpen = false;
  let transferUserId = null;
  let transferring = false;
  let replaceUsers = false;
  let overrideSameCompany = false;
  let linkedQueryAction = "move";
  let viewOldData = true;
  /** When Replace OFF: 'same' keeps live status, 'new' resets to New Lead */
  let statusMode = "new";
  let linkedQueryTotal = 0;
  let checkingLinkedQueries = false;
  let linkedQueryFetched = false;
  let lastSummaryKey = "";
  let summaryRequestId = 0;

  $: selectedList = listOrders.filter((o) => selectedOrders.has(o.id));
  $: blockedTransferOrders = selectedList.filter(
    (o) => o.status === "Deal Won" || o.status === "Qualified",
  );
  $: transferableCount = selectedOrders.size - blockedTransferOrders.length;
  $: canTransfer =
    currentUser?.role === "master" || canAccess("transfer_orders", "full", currentUser);

  $: hasSameCompanyConflict = (() => {
    if (!transferUserId) return false;
    const toUser = users.find((u) => u.id === transferUserId);
    const toCompanyId = toUser?.company?.id ?? toUser?.companyId ?? null;
    if (!toCompanyId) return false;
    return selectedList.some((o) =>
      o.status === "Deal Lost" &&
      (o.assignedUsers || []).some((u) => {
        const uCompanyId = u.companyId ?? u.company?.id ?? null;
        return uCompanyId && uCompanyId === toCompanyId;
      })
    );
  })();

  $: if (transferModalOpen && selectedOrders.size > 0) {
    void refreshLinkedQuerySummary();
  }

  async function refreshLinkedQuerySummary() {
    if (!transferModalOpen || selectedOrders.size === 0) return;

    const orderKey = [...selectedOrders].sort((a, b) => a - b).join(",");
    if (orderKey === lastSummaryKey && linkedQueryFetched) return;

    lastSummaryKey = orderKey;
    const requestId = ++summaryRequestId;
    checkingLinkedQueries = true;
    linkedQueryFetched = false;
    try {
      const res = await authApiFetch(API_ROUTES.ORDER + "/linked-queries-summary", {
        method: "POST",
        data: JSON.stringify({ orderIds: [...selectedOrders] }),
      });
      if (requestId !== summaryRequestId) return;
      linkedQueryTotal = Number(res?.totalActive) || 0;
      linkedQueryFetched = true;
      if (linkedQueryTotal > 0) linkedQueryAction = "move";
    } catch (e) {
      if (requestId !== summaryRequestId) return;
      linkedQueryTotal = 0;
      linkedQueryFetched = true;
    } finally {
      if (requestId === summaryRequestId) checkingLinkedQueries = false;
    }
  }

  function openTransfer() {
    transferUserId = null;
    replaceUsers = false;
    overrideSameCompany = false;
    linkedQueryAction = "move";
    viewOldData = true;
    statusMode = "new";
    linkedQueryTotal = 0;
    linkedQueryFetched = false;
    lastSummaryKey = "";
    checkingLinkedQueries = false;
    transferModalOpen = true;
  }

  function closeTransfer() {
    transferModalOpen = false;
    transferUserId = null;
    replaceUsers = false;
    overrideSameCompany = false;
    linkedQueryAction = "move";
    viewOldData = true;
    statusMode = "new";
    linkedQueryTotal = 0;
    linkedQueryFetched = false;
    lastSummaryKey = "";
    checkingLinkedQueries = false;
  }

  async function doTransfer() {
    if (!transferUserId) return;
    if (transferableCount <= 0) {
      Swal.fire(
        "Cannot transfer",
        "Deal Won and Qualified orders cannot be transferred. Deselect them and try again.",
        "warning",
      );
      return;
    }
    if (linkedQueryTotal > 0 && linkedQueryAction !== "move" && linkedQueryAction !== "close") {
      Swal.fire("Required", "Choose what to do with linked active queries.", "warning");
      return;
    }
    transferring = true;
    try {
      const transferableIds = [...selectedOrders].filter((id) => {
        const o = listOrders.find((row) => row.id === id);
        return o && o.status !== "Deal Won" && o.status !== "Qualified";
      });
      const payload = {
        orderIds: transferableIds,
        toUserId: Number(transferUserId),
        replaceUsers,
        overrideSameCompany: hasSameCompanyConflict ? overrideSameCompany : false,
        viewOldData: viewOldData === true,
        statusMode: replaceUsers ? "new" : statusMode === "same" ? "same" : "new",
      };
      if (linkedQueryTotal > 0) {
        payload.linkedQueryAction = linkedQueryAction;
      }
      const res = await authApiFetch(API_ROUTES.ORDER + "/bulk-transfer", {
        method: "PUT",
        data: JSON.stringify(payload),
      });
      const skipped = [
        ...(res.skipped || []),
        ...blockedTransferOrders.map((o) => ({
          id: o.pId ?? o.id,
          reason: `${o.status} orders cannot be transferred`,
        })),
      ];
      const hasSkipped = skipped.length > 0;
      Swal.fire({
        icon: hasSkipped ? "warning" : "success",
        title: hasSkipped ? "Partially Transferred" : "Transferred!",
        html: hasSkipped
          ? `${res.message}<br><small class="text-muted">${skipped
              .map((s) => `#${s.id}: ${s.reason}`)
              .join("<br>")}</small>`
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
    {#if canTransfer}
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
{#if transferModalOpen && canTransfer}
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
          {#if blockedTransferOrders.length > 0}
            <div class="alert alert-warning py-2 px-3 mb-3" style="font-size:12px;">
              <i class="ti ti-ban me-1"></i>
              <strong>{blockedTransferOrders.length}</strong> selected order{blockedTransferOrders.length > 1 ? "s" : ""}
              with status <strong>Deal Won</strong> or <strong>Qualified</strong> cannot be transferred
              and will be skipped.
            </div>
          {/if}
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
          <p class="text-xs text-muted ms-4 mb-2">
            {#if replaceUsers}
              <i class="ti ti-alert-triangle text-warning me-1"></i>
              Current assignees will be <strong>removed</strong> and replaced. Transfer To user becomes <strong>Active</strong>. Status resets to <strong>New Lead</strong>.
            {:else}
              <i class="ti ti-user-plus text-success me-1"></i>
              Selected user becomes <strong>Active</strong>; existing assignees become <strong>Old</strong> (frozen at current status).
            {/if}
          </p>

          {#if !replaceUsers}
            <div class="border rounded p-3 mb-3 bg-light">
              <div class="fw-semibold mb-2" style="font-size:13px;">
                <i class="ti ti-flag me-1"></i>Status for new Active user
              </div>
              <div class="form-check mb-2">
                <input class="form-check-input" type="radio" name="transferStatusMode" id="statusSame" value="same" bind:group={statusMode} />
                <label class="form-check-label" for="statusSame">
                  <span class="fw-semibold">Same as current</span>
                  <div class="text-muted" style="font-size:12px;">Keep the order’s live status for the new Active user.</div>
                </label>
              </div>
              <div class="form-check mb-0">
                <input class="form-check-input" type="radio" name="transferStatusMode" id="statusNew" value="new" bind:group={statusMode} />
                <label class="form-check-label" for="statusNew">
                  <span class="fw-semibold">New start</span>
                  <div class="text-muted" style="font-size:12px;">Reset live status to <strong>New Lead</strong>. Old users stay frozen at the previous status.</div>
                </label>
              </div>
            </div>
          {/if}

          <div class="form-check mb-1 mt-1">
            <input class="form-check-input" type="checkbox" id="viewOldDataCheck" bind:checked={viewOldData} />
            <label class="form-check-label fw-semibold" for="viewOldDataCheck">Show old order data to new user</label>
          </div>
          <p class="text-xs text-muted ms-4 mb-2">
            {#if viewOldData}
              New Active user can see full chat / activity / file history (default).
            {:else}
              New Active user starts fresh — history before this transfer stays hidden.
            {/if}
          </p>

          {#if checkingLinkedQueries || linkedQueryTotal > 0}
            <div class="border rounded p-3 mt-3 bg-light">
              <div class="fw-semibold mb-1">
                <i class="ti ti-ticket me-1"></i>Linked queries
              </div>
              {#if checkingLinkedQueries}
                <p class="text-xs text-muted mb-0">Checking linked queries…</p>
              {:else}
                <p class="text-sm mb-2">
                  <strong>{linkedQueryTotal}</strong> active linked quer{linkedQueryTotal === 1 ? "y" : "ies"} found.
                  Choose what happens after transfer:
                </p>
                <div class="form-check mb-2 p-2 border rounded bg-white">
                  <input class="form-check-input" type="radio" name="linkedQueryAction" id="lqMove"
                    value="move" bind:group={linkedQueryAction} />
                  <label class="form-check-label" for="lqMove">
                    <div class="fw-semibold">Move with order</div>
                    <div class="text-xs text-muted">Raised By → new owner</div>
                    <div class="text-xs text-muted">Tech Assigned To stays unchanged</div>
                  </label>
                </div>
                <div class="form-check p-2 border rounded bg-white">
                  <input class="form-check-input" type="radio" name="linkedQueryAction" id="lqClose"
                    value="close" bind:group={linkedQueryAction} />
                  <label class="form-check-label" for="lqClose">
                    <div class="fw-semibold">Do not move</div>
                    <div class="text-xs text-muted">Resolve / close those queries</div>
                  </label>
                </div>
              {/if}
            </div>
          {/if}

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
            disabled={!transferUserId || transferring || checkingLinkedQueries || transferableCount <= 0 || (hasSameCompanyConflict && !overrideSameCompany) || (linkedQueryTotal > 0 && !linkedQueryAction)}
            on:click={doTransfer}
          >
            {transferring ? "Transferring..." : transferableCount > 0 ? `Confirm Transfer (${transferableCount})` : "Cannot Transfer"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
