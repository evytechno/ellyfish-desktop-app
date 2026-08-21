<script>
  import { statusNamesStore } from "$lib/stores/statusNames";

  export let order;
  export let statuses = [];
  export let togglePin;
  export let changeOrderStatus;
  export let canMutateOrder = true;
  export let isOldAssignee = false;
  export let piwotiOpen;
  export let piwotiType;
  export let orderVisits = [];
  export let openVisitModal;
  export let showVisitListModal;
  export let openFeedbackModal = () => {};

  const statusBtnColors = {
    "New Lead": "#4c6ef5",
    Contacted: "#7950f2",
    "Follow Up": "#f59f00",
    Qualified: "#2ecc71",
    Unqualified: "#e74c3c",
    "Needs Assessment": "#fd7e14",
    "Quotation Sent": "#12b886",
    "Negotiation In Progress": "#e67700",
    "Deal Won": "#2f9e44",
    "Deal Lost": "#fa5252",
    Dispatched: "#4c6ef5",
    Completed: "#2f9e44",
    Reference: "#495057",
  };

  function statusBtnColor(status) {
    return statusBtnColors[status] || "#868e96";
  }

  function getAvatarText(title) {
    if (!title) return "";
    const words = title.trim().split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0][0].toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
</script>

<div class="card order-header-card">
  <div class="card-body">
    <div class="order-header-top">
      <div class="order-header-identity">
        <div
          class="order-header-avatar avatar avatar-xxl avatar-rounded border border-warning bg-soft-warning flex-shrink-0"
        >
          <h6 class="mb-0 text-warning">
            {getAvatarText(order?.title)}
          </h6>
        </div>
        <div class="min-w-0">
          <div class="d-flex align-items-center gap-2 flex-wrap mb-2">
            <h5 class="order-header-title capitalize mb-0">
              {order?.title}
            </h5>
            {#if isOldAssignee}
              <span class="order-header-old-badge">
                <i class="ti ti-eye-off"></i>
                View only · Frozen at transfer
              </span>
            {:else if order?._viewOldDataHidden}
              <span class="order-header-old-badge" style="color:#1e40af;background:#eff6ff;border-color:#93c5fd;">
                <i class="ti ti-clock"></i>
                Old history hidden
              </span>
            {/if}
          </div>
          <div class="order-header-meta">
            <span class="order-header-chip">
              <i class="ti ti-hash"></i>
              {order?.financialYear}/{order?.pId?.toString().padStart(6, "0")}
            </span>
            {#if order?.workOrderNumber}
              <span class="order-header-chip">
                <i class="ti ti-file-description"></i>
                {order.workOrderNumber}
              </span>
            {/if}
            {#if order?.category}
              <span class="order-header-chip">
                <i class="ti ti-layout-grid"></i>{order.category}
              </span>
            {/if}
            {#if order?.source === 'old_import'}
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;background:#e8f4ff;color:#1971c2;border:1px solid #a5d8ff;border-radius:5px;padding:2px 8px;letter-spacing:0.2px;">
                <i class="ti ti-database-import" style="font-size:12px;"></i>Old Import
              </span>
            {:else if order?.source}
              <span class="order-header-chip capitalize">
                <i class="ti ti-mailbox"></i>{order.source}
              </span>
            {/if}
          </div>
        </div>
      </div>

      <div class="order-header-actions">
        <button
          type="button"
          class="btn btn-xs order-header-pin-btn"
          disabled={!canMutateOrder}
          title={canMutateOrder ? "Toggle pin" : "Only the Active assignee can pin"}
          on:click={() => togglePin(order?.id)}
        >
          {#if order?.pinStatus === "true"}
            <i class="ti ti-pinned me-1"></i>Pinned
          {:else}
            <i class="ti ti-pin me-1"></i>Pin
          {/if}
        </button>
        <div class="dropdown">
          <button
            type="button"
            class="btn btn-xs order-header-status-btn"
            style="background:{statusBtnColor(order?.status)};border-color:{statusBtnColor(order?.status)};"
            data-bs-toggle={canMutateOrder ? "dropdown" : undefined}
            aria-expanded="false"
            disabled={!canMutateOrder}
            title={canMutateOrder ? "Change status" : "Only the Active assignee can change status"}
          >
            <i class="ti ti-thumb-up"></i>
            <span>
              {$statusNamesStore[order?.status]?.name
                ? $statusNamesStore[order?.status]?.name
                : order?.status || "Status"}
            </span>
            {#if canMutateOrder}
              <i class="ti ti-chevron-down"></i>
            {/if}
          </button>
          {#if canMutateOrder}
          <div class="dropdown-menu dropdown-menu-end">
            {#each statuses as status}
              <a
                class="dropdown-item"
                class:active={order.status === status}
                href={`#${status}`}
                on:click|preventDefault={() => changeOrderStatus(status)}
              >
                <span>{$statusNamesStore[status]?.name ?? status}</span>
              </a>
            {/each}
          </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="order-header-docs">
      <div class="order-header-docs-label">
        <i class="ti ti-files"></i>Linked Documents
      </div>
      {#if isOldAssignee}
        <p class="order-header-docs-hidden mb-0">
          Showing this order as it was when you were Active. Later updates are hidden.
        </p>
      {:else}
      <div class="order-header-docs-row">
        <div class="order-header-doc-item">
          <span class="order-header-doc-type">PI</span>
          {#if order?.orderPayments?.length > 0}
            <a
              href="/admin/invoice/{order.orderPayments[0].id}"
              class="order-header-doc-link order-header-doc-link--success"
            >
              <i class="ti ti-receipt"></i>
              {order.orderPayments[0].financialYear}/{String(
                order.orderPayments[0].invoiceNo,
              ).padStart(6, "0")}
              {#if order.orderPayments.length > 1}
                <span class="badge bg-success ms-1 order-header-doc-badge"
                  >+{order.orderPayments.length - 1}</span
                >
              {/if}
            </a>
          {:else if ["Deal Won", "Dispatched", "Completed"].includes(order.status)}
            <button
              type="button"
              class="order-header-doc-action order-header-doc-action--pi"
              on:click={() => {
                piwotiType = "PI";
                piwotiOpen = true;
              }}
            >
              <i class="ti ti-plus me-1"></i>Create PI
            </button>
          {:else}
            <span class="order-header-doc-muted" title="Requires Deal Won status">
              <i class="ti ti-lock me-1"></i>Needs Deal Won
            </span>
          {/if}
        </div>

        <span class="order-header-doc-sep" aria-hidden="true"></span>

        <div class="order-header-doc-item">
          <span class="order-header-doc-type">WO</span>
          {#if order?.workOrders?.length > 0}
            <a
              href="/admin/workorder/{order.workOrders[0].id}"
              class="order-header-doc-link order-header-doc-link--success"
            >
              <i class="ti ti-file-description"></i>
              {order.workOrders[0].workOrderNo}
              {#if order.workOrders.length > 1}
                <span class="badge bg-success ms-1 order-header-doc-badge"
                  >+{order.workOrders.length - 1}</span
                >
              {/if}
            </a>
          {:else if order?.orderPayments?.length > 0}
            <button
              type="button"
              class="order-header-doc-action order-header-doc-action--wo"
              on:click={() => {
                piwotiType = "WO";
                piwotiOpen = true;
              }}
            >
              <i class="ti ti-plus me-1"></i>Create WO
            </button>
          {:else}
            <span class="order-header-doc-muted">
              <i class="ti ti-lock me-1"></i>Needs PI
            </span>
          {/if}
        </div>

        <span class="order-header-doc-sep" aria-hidden="true"></span>

        <div class="order-header-doc-item">
          <span class="order-header-doc-type">TI</span>
          {#if order?.invoices?.length > 0}
            <a
              href="/admin/invoice/tax/{order.invoices[0].id}"
              class="order-header-doc-link order-header-doc-link--warning"
            >
              <i class="ti ti-file-invoice"></i>
              {order.invoices[0].financialYear}/{String(order.invoices[0].invoiceNo).padStart(
                6,
                "0",
              )}
              {#if order.invoices[0].isLocked}
                <span class="badge bg-success ms-1 order-header-doc-badge">Locked</span>
              {:else}
                <span class="badge bg-warning text-dark ms-1 order-header-doc-badge">Draft</span>
              {/if}
            </a>
          {:else if order?.orderPayments?.length > 0 && order?.workOrders?.length > 0}
            <button
              type="button"
              class="order-header-doc-action order-header-doc-action--ti"
              on:click={() => {
                piwotiType = "TI";
                piwotiOpen = true;
              }}
            >
              <i class="ti ti-plus me-1"></i>Create TI
            </button>
          {:else}
            <span class="order-header-doc-muted">
              <i class="ti ti-lock me-1"></i>Needs PI &amp; WO
            </span>
          {/if}
        </div>

        <div class="order-header-doc-item ms-auto d-flex align-items-center gap-2">
          {#if canMutateOrder}
            <button class="btn btn-outline-primary btn-sm" on:click={openFeedbackModal}>
              <i class="ti ti-message-star me-1"></i>Add Feedback
            </button>
            {#if orderVisits.length === 0}
              <button class="btn btn-success btn-sm" on:click={openVisitModal}>
                <i class="ti ti-map-pin me-1"></i>Create Visit
              </button>
            {:else}
              {@const scheduledCount = orderVisits.filter(v => v.status === 'scheduled').length}
              <button
                class="btn btn-outline-success btn-sm"
                on:click={() => (showVisitListModal = true)}
              >
                <i class="ti ti-map-pin me-1"></i>{orderVisits.length} Visit{orderVisits.length > 1 ? 's' : ''}
                {#if scheduledCount > 0}
                  <span class="badge bg-primary ms-1">{scheduledCount} upcoming</span>
                {/if}
              </button>
              <button
                class="btn btn-success btn-sm"
                on:click={openVisitModal}
                title="Add another visit"
              >
                <i class="ti ti-plus"></i>
              </button>
            {/if}
          {:else if orderVisits.length > 0}
            <button
              class="btn btn-outline-success btn-sm"
              on:click={() => (showVisitListModal = true)}
            >
              <i class="ti ti-map-pin me-1"></i>{orderVisits.length} Visit{orderVisits.length > 1 ? 's' : ''}
            </button>
          {/if}
        </div>
      </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .order-header-card {
    border: none;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
    overflow: visible;
  }
  .order-header-card .card-body {
    overflow: visible;
  }
  .order-header-actions .dropdown-menu {
    z-index: 1050;
  }
  .order-header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .order-header-identity {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    min-width: 0;
    flex: 1;
  }
  .order-header-title {
    font-size: 13px;
    font-weight: 500;
    color: #212529;
    line-height: 1.35;
  }
  .order-header-old-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 11px;
    font-weight: 600;
    color: #92400e;
    background: #fff7ed;
    border: 1px solid #fdba74;
    border-radius: 999px;
    padding: 0.2rem 0.65rem;
    white-space: nowrap;
  }
  .order-header-docs-hidden {
    font-size: 12px;
    color: #64748b;
    margin-top: 0.35rem;
  }
  .order-header-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .order-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.5rem;
    font-size: 11px;
    font-weight: 400;
    color: #495057;
    background: #f8fafc;
    border: 1px solid #e8edf2;
    border-radius: 999px;
    line-height: 1.2;
  }
  .order-header-chip i {
    font-size: 12px;
    color: #6c757d;
  }
  .order-header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .order-header-pin-btn,
  .order-header-status-btn {
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px;
    height: 26px !important;
    min-height: 26px !important;
    width: auto !important;
    min-width: auto !important;
    padding: 0 10px !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    line-height: 1 !important;
    border-radius: 4px !important;
    white-space: nowrap !important;
    overflow: visible !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .order-header-pin-btn {
    color: #c92a2a !important;
    background: #fff5f5 !important;
    border: 1px solid #ffa8a8 !important;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  }
  .order-header-pin-btn:hover {
    background: #fa5252 !important;
    border-color: #fa5252 !important;
    color: #fff !important;
    box-shadow: 0 2px 6px rgba(250, 82, 82, 0.28);
  }
  .order-header-status-btn {
    color: #fff !important;
    border: 1px solid transparent !important;
    box-shadow: none !important;
  }
  .order-header-status-btn:hover,
  .order-header-status-btn:focus,
  .order-header-status-btn:active,
  .order-header-status-btn.show {
    color: #fff !important;
    filter: brightness(0.92);
  }
  .order-header-docs {
    padding-top: 0.875rem;
    border-top: 1px solid #eef1f4;
  }
  .order-header-docs-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 11px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: #6c757d;
    margin-bottom: 0.5rem;
  }
  .order-header-docs-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
  }
  .order-header-doc-item {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .order-header-doc-type {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    height: 1.5rem;
    padding: 0 0.375rem;
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.02em;
    color: #6c757d;
    background: #f1f3f5;
    border-radius: 0.375rem;
    flex-shrink: 0;
  }
  .order-header-doc-sep {
    width: 1px;
    height: 1.25rem;
    background: #dee2e6;
    flex-shrink: 0;
  }
  .order-header-doc-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 12px;
    font-weight: 400;
    text-decoration: none;
    padding: 0.2rem 0.45rem;
    border-radius: 0.375rem;
    line-height: 1.3;
  }
  .order-header-doc-link--success {
    color: #0ca678;
    background: #e6fcf5;
    border: 1px solid #63e6be;
  }
  .order-header-doc-link--success:hover {
    background: #0ca678;
    border-color: #0ca678;
    color: #fff;
  }
  .order-header-doc-link--warning {
    color: #e67700;
    background: #fff9db;
    border: 1px solid #ffd43b;
  }
  .order-header-doc-link--warning:hover {
    background: #e67700;
    border-color: #e67700;
    color: #fff;
  }
  .order-header-doc-action {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.3;
    text-decoration: none;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
  }
  .order-header-doc-action--pi {
    background: #edf2ff;
    border-color: #748ffc;
    color: #364fc7;
  }
  .order-header-doc-action--pi:hover {
    background: #364fc7;
    border-color: #364fc7;
    color: #fff;
    box-shadow: 0 2px 6px rgba(54, 79, 199, 0.28);
    transform: translateY(-1px);
  }
  .order-header-doc-action--wo {
    background: #e6fcf5;
    border-color: #63e6be;
    color: #0ca678;
  }
  .order-header-doc-action--wo:hover {
    background: #0ca678;
    border-color: #0ca678;
    color: #fff;
    box-shadow: 0 2px 6px rgba(12, 166, 120, 0.28);
    transform: translateY(-1px);
  }
  .order-header-doc-action--ti {
    background: #fff9db;
    border-color: #ffd43b;
    color: #e67700;
  }
  .order-header-doc-action--ti:hover {
    background: #e67700;
    border-color: #e67700;
    color: #fff;
    box-shadow: 0 2px 6px rgba(230, 119, 0, 0.28);
    transform: translateY(-1px);
  }
  .order-header-doc-muted {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 400;
    color: #868e96;
  }
  .order-header-doc-badge {
    font-size: 10px;
    font-weight: 400;
    padding: 0.15em 0.4em;
  }
  .order-header-docs-row :global(.btn-sm) {
    font-size: 12px !important;
    font-weight: 400 !important;
    padding: 4px 10px !important;
    line-height: 1.3 !important;
  }
  .order-header-docs-row :global(.btn-outline-primary) {
    color: #364fc7 !important;
    border-color: #748ffc !important;
    background: #edf2ff !important;
  }
  .order-header-docs-row :global(.btn-outline-primary:hover) {
    color: #fff !important;
    background: #364fc7 !important;
    border-color: #364fc7 !important;
  }
  .order-header-docs-row :global(.btn-outline-success) {
    color: #2b8a3e !important;
    border-color: #8ce99a !important;
    background: #ebfbee !important;
  }
  .order-header-docs-row :global(.btn-outline-success:hover) {
    color: #fff !important;
    background: #2f9e44 !important;
    border-color: #2f9e44 !important;
  }
  .order-header-docs-row :global(.btn-success) {
    background: #2f9e44 !important;
    border-color: #2f9e44 !important;
    color: #fff !important;
  }
  @media (max-width: 575.98px) {
    .order-header-doc-sep {
      display: none;
    }
    .order-header-doc-item {
      width: 100%;
    }
  }
</style>
