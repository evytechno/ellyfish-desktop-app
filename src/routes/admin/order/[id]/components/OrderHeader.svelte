<script>
  import { statusNamesStore } from "$lib/stores/statusNames";

  export let order;
  export let statuses = [];
  export let togglePin;
  export let changeOrderStatus;
  export let piwotiOpen;
  export let piwotiType;
  export let orderVisits = [];
  export let openVisitModal;
  export let showVisitListModal;
  export let openFeedbackModal = () => {};

  const statusesColors = {
    "New Lead": "bg-blue",
    Contacted: "bg-purple",
    "Follow Up": "bg-yellow",
    Qualified: "bg-[#2ecc71]",
    Unqualified: "bg-[#e74c3c]",
    "Needs Assessment": "bg-orange",
    "Quotation Sent": "bg-teal",
    "Negotiation In Progress": "bg-[#FFBF00]",
    "Deal Won": "bg-green",
    "Deal Lost": "bg-red",
    Dispatched: "bg-indigo",
    Completed: "bg-success",
  };

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
          <h5 class="order-header-title capitalize mb-2">
            {order?.title}
          </h5>
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
          class="py-1 px-2 fs-12 bg-soft-danger rounded text-danger fw-medium border-0"
          on:click={() => togglePin(order?.id)}
        >
          {#if order?.pinStatus === "true"}
            <i class="ti ti-pinned me-1"></i>Pinned
          {:else}
            <i class="ti ti-pin me-1"></i>Pin
          {/if}
        </button>
        <div class="dropdown">
          <a
            href="#status"
            class={`btn btn-xs bg-success fs-12 py-1 px-2 fw-medium d-inline-flex align-items-center text-white text-nowrap ${statusesColors[order?.status] || "bg-gray"}`}
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            <i class="ti ti-thumb-up me-1"></i>
            {$statusNamesStore[order?.status]?.name
              ? $statusNamesStore[order?.status]?.name
              : order?.status}
            <i class="ti ti-chevron-down ms-1"></i>
          </a>
          <div class="dropdown-menu dropdown-menu-right">
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
        </div>
      </div>
    </div>

    <div class="order-header-docs">
      <div class="order-header-docs-label">
        <i class="ti ti-files"></i>Linked Documents
      </div>
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
              class="order-header-doc-action border-0 bg-transparent p-0"
              on:click={() => {
                piwotiType = "PI";
                piwotiOpen = true;
              }}
            >
              <i class="ti ti-plus me-1"></i>Create
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
              class="order-header-doc-action border-0 bg-transparent p-0"
              on:click={() => {
                piwotiType = "WO";
                piwotiOpen = true;
              }}
            >
              <i class="ti ti-plus me-1"></i>Create
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
              class="order-header-doc-action order-header-doc-action--warning border-0 bg-transparent p-0"
              on:click={() => {
                piwotiType = "TI";
                piwotiOpen = true;
              }}
            >
              <i class="ti ti-plus me-1"></i>Create
            </button>
          {:else}
            <span class="order-header-doc-muted">
              <i class="ti ti-lock me-1"></i>Needs PI &amp; WO
            </span>
          {/if}
        </div>

        <div class="order-header-doc-item ms-auto d-flex align-items-center gap-2">
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
        </div>
      </div>
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
    font-size: 1.125rem;
    font-weight: 600;
    color: #212529;
    line-height: 1.35;
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
    padding: 0.25rem 0.55rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: #495057;
    background: #f8fafc;
    border: 1px solid #e8edf2;
    border-radius: 999px;
    line-height: 1.2;
  }
  .order-header-chip i {
    font-size: 0.8125rem;
    color: #6c757d;
  }
  .order-header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .order-header-docs {
    padding-top: 0.875rem;
    border-top: 1px solid #eef1f4;
  }
  .order-header-docs-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6c757d;
    margin-bottom: 0.625rem;
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
    height: 1.75rem;
    padding: 0 0.375rem;
    font-size: 0.6875rem;
    font-weight: 700;
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
    font-size: 0.8125rem;
    font-weight: 500;
    text-decoration: none;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    line-height: 1.3;
  }
  .order-header-doc-link--success {
    color: #198754;
    background: #ecfdf3;
    border: 1px solid #bbf7d0;
  }
  .order-header-doc-link--success:hover {
    background: #dcfce7;
    color: #157347;
  }
  .order-header-doc-link--warning {
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fde68a;
  }
  .order-header-doc-link--warning:hover {
    background: #fef3c7;
    color: #92400e;
  }
  .order-header-doc-action {
    display: inline-flex;
    align-items: center;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--bs-primary, #3554d1);
    text-decoration: none;
    padding: 0.25rem 0.5rem;
    border: 1px dashed #c7d2fe;
    border-radius: 0.375rem;
    background: #f8faff;
  }
  .order-header-doc-action:hover {
    background: #eef2ff;
    color: #2a43a8;
  }
  .order-header-doc-action--warning {
    color: #b45309;
    border-color: #fde68a;
    background: #fffbeb;
  }
  .order-header-doc-action--warning:hover {
    background: #fef3c7;
    color: #92400e;
  }
  .order-header-doc-muted {
    display: inline-flex;
    align-items: center;
    font-size: 0.75rem;
    color: #adb5bd;
    font-style: italic;
  }
  .order-header-doc-badge {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.2em 0.45em;
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
