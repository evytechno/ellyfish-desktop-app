<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import DispatchProcess from "$lib/components/DispatchProcess.svelte";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth } from "$lib/utils/auth";
  import Swal from "sweetalert2";

  $: orderId = $page.params.id;

  let currentUser = null;
  let order = null;
  let loading = true;
  let errorMessage = "";

  onMount(async () => {
    currentUser = checkAuth();
    await loadOrder();
  });

  async function loadOrder() {
    if (!orderId) return;
    loading = true;
    errorMessage = "";
    try {
      const data = await authApiFetch(`${API_ROUTES.ORDER}/${orderId}/basic`);
      order = data;

      const status = String(data?.status || "");
      if (!["Dispatched", "Completed"].includes(status)) {
        await Swal.fire({
          icon: "info",
          title: "Dispatch not available",
          text: "Dispatch management opens when the order is Dispatched or Completed.",
        });
        goto(`/admin/order/${orderId}`);
        return;
      }
      if (!data?.workOrderNumber) {
        await Swal.fire({
          icon: "warning",
          title: "Work order required",
          text: "Add a work order number on this order before managing dispatch.",
        });
        goto(`/admin/order/${orderId}`);
      }
    } catch (err) {
      errorMessage = err?.message || "Failed to load order.";
      order = null;
    } finally {
      loading = false;
    }
  }
</script>

<div class="page-wrapper">
  <div class="content container-fluid py-3">
    <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
      <div>
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-1" style="font-size:12px;">
            <li class="breadcrumb-item"><a href="/admin">Home</a></li>
            <li class="breadcrumb-item"><a href="/admin/order">Orders</a></li>
            <li class="breadcrumb-item">
              <a href="/admin/order/{orderId}">{order?.title || `Order #${orderId}`}</a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">Dispatch</li>
          </ol>
        </nav>
        <h4 class="mb-0 d-flex align-items-center gap-2" style="font-size:20px;">
          <i class="ti ti-truck-delivery"></i>
          Dispatch management
        </h4>
        {#if order}
          <div class="text-muted mt-1" style="font-size:13px;">
            <span class="fw-semibold text-dark">{order.title || "—"}</span>
            {#if order.orderNo}
              <span class="mx-1">·</span>
              <span class="font-monospace">{order.orderNo}</span>
            {/if}
            {#if order.workOrderNumber}
              <span class="mx-1">·</span>
              <span class="badge bg-light text-dark border">{order.workOrderNumber}</span>
            {/if}
            {#if order.status}
              <span class="mx-1">·</span>
              <span class="badge bg-primary-subtle text-primary border">{order.status}</span>
            {/if}
          </div>
        {/if}
      </div>
      <div class="d-flex flex-wrap gap-2">
        <a href="/admin/order/{orderId}" class="btn btn-outline-secondary btn-sm">
          <i class="ti ti-arrow-left me-1"></i>Back to order
        </a>
      </div>
    </div>

    {#if loading}
      <div class="card border-0 shadow-sm">
        <div class="card-body py-5">
          <Loader />
        </div>
      </div>
    {:else if errorMessage}
      <div class="alert alert-danger mb-0">{errorMessage}</div>
    {:else if order}
      <div class="card border-0 shadow-sm">
        <div class="card-body p-3 p-md-4">
          <DispatchProcess {order} />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .font-monospace {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
</style>
