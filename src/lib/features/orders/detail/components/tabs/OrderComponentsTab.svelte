<script>
  import { convertDate, getAvatarText } from "../../utils/index.js";

  export let order;
  export let cerateChildOrder;
  export let editChildOrder;
  export let deleteComponent;
  export let editComponent;

  let orderTitle = "";
  let orderWorkOrderNumber = "";
  let formErrors = {};
  let loading = false;

  async function handleEditComponent(e) {
    e.preventDefault();
    formErrors = {};
    if (!orderTitle) { formErrors.orderTitle = ["Title is required."]; return; }
    loading = true;
    try {
      await editComponent({ orderTitle, orderWorkOrderNumber });
      orderTitle = ""; orderWorkOrderNumber = "";
      const $ = window.jQuery || window.$;
      if ($) { $("#edit_component").modal("hide"); }
    } catch {}
    finally { loading = false; }
  }

  function handleEditChildOrder(component) {
    orderTitle = component?.title ?? "";
    orderWorkOrderNumber = component?.workOrderNumber ?? "";
    editChildOrder(component);
  }
</script>

<div class="tab-pane active show" id="tab_8">
  <div class="card">
    <div class="card-header d-flex align-items-center justify-content-between flex-wrap row-gap-3">
      <h5 class="fw-semibold mb-0">Multiple Orders</h5>
      <div class="d-inline-flex align-items-center">
        {#if order?.status === "Deal Won"}
          <button on:click={() => cerateChildOrder()} class="link-primary fw-medium flex items-center">
            <i class="ti ti-circle-plus me-1"></i>Create New
          </button>
        {/if}
      </div>
    </div>
    <div class="card-body">
      {#if order?.childOrders?.length}
        {#each order.childOrders as component}
          <div class="card mb-3 relative">
            {#if component?.deletedAt}
              <div class="ribbon ribbon-top-left"><span class="bg-red-500">Deleted</span></div>
            {/if}
            <div class="card-body">
              <div class="absolute top-5 right-14">
                <a href="#edit_component" data-bs-toggle="modal" data-bs-target="#edit_component"
                  on:click={() => handleEditChildOrder(component)}
                  class="bg-secondary text-white text-md px-1.5 py-1.5 rounded">
                  <i class="ti ti-pencil"></i>
                </a>
              </div>
              {#if !component?.deletedAt}
                <div class="absolute top-4 right-5">
                  <button on:click={deleteComponent(component?.id)} class="bg-red-500 text-white text-md px-1.5 py-1 rounded">
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              {/if}
              <div class="d-sm-flex align-items-center justify-content-between">
                <div class="d-flex align-items-center">
                  <div class="avatar avatar-lg avatar-rounded border border-warning bg-soft-warning me-1 flex-shrink-0">
                    <h6 class="mb-0 text-warning">{getAvatarText(component?.title)}</h6>
                  </div>
                  <div>
                    <h6 class="fw-medium fs-14 mb-1">{component?.title} ({component?.workOrderNumber})</h6>
                    <p class="mb-0 fs-13">
                      {component?.createdAt && convertDate(component?.createdAt, {
                        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit", hour12: true,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/each}
      {:else}
        <div>No components found.</div>
      {/if}
    </div>
  </div>
</div>

<!-- Edit Component Modal -->
<div class="modal fade" id="edit_component" role="dialog">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Update Order</h5>
        <button type="button" class="btn-close custom-btn-close border p-1 me-0 text-dark" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <form on:submit={handleEditComponent} class="needs-validation space-y-4" novalidate>
        <div class="modal-body">
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="form-label" for="orderTitle">Title <span class="text-danger">*</span></label>
              <input type="text" name="orderTitle" class="form-control"
                class:is-invalid={formErrors.orderTitle} bind:value={orderTitle}
                required id="orderTitle" placeholder="Title" />
              {#if formErrors.orderTitle}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.orderTitle[0]}</li></ul>
              {/if}
            </div>
            <div>
              <label class="form-label" for="orderWorkOrderNumber">Work Order Number</label>
              <input type="text" name="orderWorkOrderNumber" class="form-control"
                class:is-invalid={formErrors.orderWorkOrderNumber} bind:value={orderWorkOrderNumber}
                id="orderWorkOrderNumber" placeholder="Work Order Number" />
              {#if formErrors.orderWorkOrderNumber}
                <ul class="text-danger mt-1 text-xs capitalize"><li>{formErrors.orderWorkOrderNumber[0]}</li></ul>
              {/if}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
          <button class="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Updating..." : "Update Now"}
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
