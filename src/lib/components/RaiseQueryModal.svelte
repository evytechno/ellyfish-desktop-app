<script>
  import { createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { statusNamesStore } from "$lib/stores/statusNames";
  import Swal from "sweetalert2";

  export let open = false;
  /** Prefill / lock to this order when opened from an order screen */
  export let linkedOrder = null;
  export let lockOrder = false;

  const dispatch = createEventDispatcher();

  const QUERY_TYPES = [
    { value: "order_issue", label: "Order Issue" },
    { value: "payment_issue", label: "Payment Issue" },
    { value: "invoice_issue", label: "Invoice Issue" },
    { value: "stock_issue", label: "Stock Issue" },
    { value: "technical", label: "Technical" },
    { value: "customer_complaint", label: "Customer Complaint" },
    { value: "access_issue", label: "Access Issue" },
    { value: "other", label: "Other" },
  ];

  let subject = "";
  let description = "";
  let type = "other";
  let priority = "medium";
  let orderId = null;
  let orderText = "";
  let orderSearch = "";
  let orderResults = [];
  let orderLoading = false;
  let showOrderDropdown = false;
  let orderSearchTimeout;
  let error = "";
  let raising = false;
  let openedFor = null;

  function orderLabel(o) {
    if (!o) return "";
    return o.title ? `#${o.pId} — ${o.title}` : `#${o.pId}`;
  }

  function resetForm() {
    subject = linkedOrder?.title ?? "";
    description = "";
    type = "other";
    priority = "medium";
    error = "";
    raising = false;
    orderResults = [];
    showOrderDropdown = false;
    if (linkedOrder?.id) {
      orderId = linkedOrder.id;
      orderText = orderLabel(linkedOrder);
      orderSearch = orderText;
    } else {
      orderId = null;
      orderText = "";
      orderSearch = "";
    }
  }

  $: if (open) {
    const key = `${linkedOrder?.id ?? "none"}`;
    if (openedFor !== key) {
      openedFor = key;
      resetForm();
    }
  } else {
    openedFor = null;
  }

  function close() {
    open = false;
    dispatch("close");
  }

  function onOrderInput() {
    if (lockOrder) return;
    orderId = null;
    orderText = orderSearch;
    clearTimeout(orderSearchTimeout);
    if (!orderSearch.trim()) {
      orderResults = [];
      showOrderDropdown = false;
      return;
    }
    orderSearchTimeout = setTimeout(async () => {
      orderLoading = true;
      showOrderDropdown = true;
      try {
        const res = await authApiFetch(
          `${API_ROUTES.ORDER}?search=${encodeURIComponent(orderSearch)}&limit=10`,
        );
        orderResults = res.data ?? [];
      } catch (_) {
        orderResults = [];
      } finally {
        orderLoading = false;
      }
    }, 300);
  }

  function selectOrder(o) {
    orderId = o.id;
    orderText = orderLabel(o);
    orderSearch = orderText;
    orderResults = [];
    showOrderDropdown = false;
    if (!subject.trim()) subject = o.title ?? "";
  }

  function clearOrder() {
    if (lockOrder) return;
    orderId = null;
    orderText = "";
    orderSearch = "";
    orderResults = [];
    showOrderDropdown = false;
  }

  async function submit() {
    error = "";
    if (!subject.trim()) {
      error = "Subject is required.";
      return;
    }
    raising = true;
    try {
      await authApiFetch(`${API_ROUTES.QUERY}`, {
        method: "POST",
        data: JSON.stringify({
          subject,
          description: description.trim() || null,
          type,
          priority,
          orderId: orderId ?? null,
        }),
      });
      Swal.fire({
        icon: "success",
        title: "Query raised successfully",
        timer: 1500,
        showConfirmButton: false,
      });
      close();
      dispatch("created");
    } catch (e) {
      const msg = e?.data?.message;
      if (typeof msg === "string") error = msg;
      else if (Array.isArray(msg))
        error = msg.flatMap((m) => Object.values(m.constraints ?? {})).join(" • ");
      else error = "Failed to raise query.";
    } finally {
      raising = false;
    }
  }
</script>

{#if open}
  <div
    class="rqm-backdrop"
    on:click|self={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="presentation"
  >
    <div class="card shadow-lg p-4 position-relative rqm-card">
      <button class="rqm-close" on:click={close} aria-label="Close"><i class="ti ti-x"></i></button>
      <h5 class="mb-3">Raise New Query</h5>
      {#if error}
        <div class="alert alert-danger py-2">{error}</div>
      {/if}
      <div class="mb-3">
        <label class="form-label">Subject <span class="text-danger">*</span></label>
        <input
          type="text"
          class="form-control"
          bind:value={subject}
          placeholder="Brief subject..."
          maxlength="150"
        />
      </div>
      <div class="mb-3">
        <label class="form-label">Type</label>
        <div class="d-flex flex-wrap gap-2">
          {#each QUERY_TYPES as t}
            <button
              type="button"
              class="badge-tab {type === t.value ? 'badge-tab--type-active' : ''}"
              on:click={() => (type = t.value)}>{t.label}</button
            >
          {/each}
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label">Priority</label>
        <div class="d-flex flex-wrap gap-2">
          {#each ["low", "medium", "high"] as p}
            <button
              type="button"
              class="badge-tab badge-tab--priority-{p} {priority === p ? 'badge-tab--active' : ''}"
              on:click={() => (priority = p)}
              >{p.charAt(0).toUpperCase() + p.slice(1)}</button
            >
          {/each}
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label"
          >Link to Order{#if !lockOrder}<span class="text-muted"> (optional)</span>{/if}</label
        >
        {#if lockOrder}
          <div class="small text-success">
            <i class="ti ti-circle-check me-1"></i>Linked: {orderText || orderLabel(linkedOrder)}
          </div>
        {:else}
          <div class="order-search-wrap">
            <div class="input-group">
              <input
                type="text"
                class="form-control"
                placeholder="Search by order title or ID..."
                bind:value={orderSearch}
                on:input={onOrderInput}
                on:focus={() => {
                  if (orderResults.length) showOrderDropdown = true;
                }}
                autocomplete="off"
              />
              {#if orderId}
                <button class="btn btn-outline-secondary" type="button" on:click={clearOrder}>
                  <i class="ti ti-x"></i>
                </button>
              {/if}
            </div>
            {#if orderId}
              <div class="mt-1 small text-success">
                <i class="ti ti-circle-check me-1"></i>Linked: {orderText}
              </div>
            {/if}
            {#if showOrderDropdown}
              <div class="order-dropdown shadow-sm border rounded bg-white">
                {#if orderLoading}
                  <div class="px-3 py-2 text-muted small">
                    <span class="spinner-border spinner-border-sm me-1"></span>Searching...
                  </div>
                {:else if orderResults.length === 0}
                  <div class="px-3 py-2 text-muted small">No orders found.</div>
                {:else}
                  {#each orderResults as o}
                    <button type="button" class="order-dropdown-item" on:click={() => selectOrder(o)}>
                      <span class="text-primary">#{o.pId}</span>
                      {#if o.title}<span class="ms-1">{o.title}</span>{/if}
                      {#if o.company}<span class="text-muted ms-1 small">· {o.company}</span>{/if}
                      <span class="badge bg-secondary ms-auto" style="font-size:10.5px;"
                        >{$statusNamesStore[o.status]?.name ?? o.status}</span
                      >
                    </button>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="mb-3">
        <label class="form-label">Requirement <span class="text-muted">(optional)</span></label>
        <textarea
          style="resize:vertical;"
          class="form-control"
          rows="3"
          bind:value={description}
          placeholder="Describe your requirement in detail..."
        ></textarea>
      </div>
      <div class="d-flex gap-2 justify-content-end">
        <button class="btn btn-secondary btn-sm" on:click={close}>Cancel</button>
        <button class="btn btn-primary btn-sm" on:click={submit} disabled={raising}>
          {raising ? "Submitting..." : "Submit Query"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .rqm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1080;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1rem;
  }
  .rqm-card {
    max-width: 540px;
    width: 100%;
    margin: 80px auto 0;
  }
  .rqm-close {
    position: absolute;
    top: 0.6rem;
    right: 0.75rem;
    background: none;
    border: none;
    font-size: 14px;
    line-height: 1;
    color: #6c757d;
    cursor: pointer;
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    z-index: 10;
  }
  .rqm-close:hover {
    color: #dc3545;
    background: rgba(220, 53, 69, 0.08);
  }
  .badge-tab {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 5px;
    border: 1px solid #dee2e6;
    background: transparent;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    color: #6c757d;
    line-height: 1.4;
    white-space: nowrap;
  }
  .badge-tab:hover {
    border-color: #adb5bd;
    background: #f8f9fa;
    color: #495057;
  }
  .badge-tab--type-active {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
  }
  .badge-tab--priority-low.badge-tab--active {
    background: #198754;
    color: #fff;
    border-color: #198754;
  }
  .badge-tab--priority-medium.badge-tab--active {
    background: #ffc107;
    color: #000;
    border-color: #ffc107;
  }
  .badge-tab--priority-high.badge-tab--active {
    background: #dc3545;
    color: #fff;
    border-color: #dc3545;
  }
  .order-search-wrap {
    position: relative;
  }
  .order-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 200;
    max-height: 220px;
    overflow-y: auto;
  }
  .order-dropdown-item {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    background: none;
    text-align: left;
    font-size: 12px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
  }
  .order-dropdown-item:hover {
    background: #f8f9fa;
  }
</style>
