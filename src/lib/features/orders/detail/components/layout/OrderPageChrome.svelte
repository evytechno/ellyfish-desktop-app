<script>
  import { goto } from "$app/navigation";

  export let order = null;
  export let currentUser = null;
  export let canMutateOrder = true;
  export let deleteOrder = async (_id) => {};
  export let openQueryModal = () => {};

  function goBack() {
    if (history.length > 2) history.back();
    else goto("/admin/order");
  }
</script>

<div class="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
  <div class="d-flex align-items-center gap-2">
    <button class="btn btn-warning btn-sm" on:click={goBack}>
      <i class="ti ti-arrow-left me-1"></i>Back
    </button>
    <div>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item"><a href="/admin/order">Orders</a></li>
          <li class="breadcrumb-item active" aria-current="page">{order?.title || "Order"}</li>
        </ol>
      </nav>
    </div>
  </div>
  <div class="d-flex align-items-center gap-2 flex-wrap">
    {#if canMutateOrder && ["master", "admin", "manager"].includes(currentUser?.role)}
      <button class="btn btn-sm btn-warning" on:click={() => deleteOrder(order?.id)}>
        <i class="ti ti-archive me-1"></i>Archive Order
      </button>
    {/if}
    {#if canMutateOrder}
      <a
        href="#offcanvas_add"
        class="btn btn-sm btn-primary"
        data-bs-toggle="offcanvas"
        data-bs-target="#offcanvas_add"
      >
        <i class="ti ti-square-rounded-plus-filled me-1"></i>Edit Order
      </a>
    {/if}
    {#if canMutateOrder && (currentUser?.subRole === "telecaller" || currentUser?.subRole === "tech" || (currentUser?.role === "user" && !currentUser?.subRole))}
      <button class="btn btn-sm btn-info text-white" on:click={openQueryModal}>
        <i class="ti ti-help-circle me-1"></i>Raise Query
      </button>
    {/if}
  </div>
</div>
