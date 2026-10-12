<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import DispatchProcess from "$lib/components/DispatchProcess.svelte";
  import Loader from "$lib/components/Loader.svelte";
  import { checkAuth, canAccess } from "$lib/utils/auth";
  import { dispatchedDetailsStore } from "$lib/stores/dataStores";
  import Swal from "sweetalert2";

  $: orderId = $page.params.id;

  let currentUser = null;
  let order = null;
  let loading = true;
  let refreshing = false;
  let processKey = 0;
  let errorMessage = "";
  let openingHomeRoute = false;

  onMount(async () => {
    currentUser = checkAuth();
    await loadOrder();
  });

  $: hasOrdersAccess = canAccess("orders", "view", currentUser);
  $: hasInstallationAccess = canAccess("installation", "view", currentUser);

  function leaveDispatch() {
    const ordersOk = canAccess("orders", "view", currentUser);
    goto(ordersOk ? `/admin/order/${orderId}` : "/admin/installation");
  }

  async function loadOrder({ soft = false } = {}) {
    if (!orderId) return;
    if (!soft) loading = true;
    errorMessage = "";
    const ordersOk = canAccess("orders", "view", currentUser);
    const installOk = canAccess("installation", "view", currentUser);
    try {
      if (!ordersOk && !installOk) {
        errorMessage = "You do not have access to this installation.";
        order = null;
        return;
      }
      const path = ordersOk
        ? `${API_ROUTES.ORDER}/${orderId}/basic`
        : `${API_ROUTES.DISPATCH}/order/${orderId}`;
      const data = await authApiFetch(path);
      order = data;

      const status = String(data?.status || "");
      if (!["Dispatched", "Completed"].includes(status)) {
        await Swal.fire({
          icon: "info",
          title: "Dispatch not available",
          text: "Dispatch management opens when the order is Dispatched or Completed.",
        });
        leaveDispatch();
        return;
      }
      if (!data?.workOrderNumber) {
        await Swal.fire({
          icon: "warning",
          title: "Work order required",
          text: "Add a work order number on this order before managing dispatch.",
        });
        leaveDispatch();
      }
    } catch (err) {
      errorMessage = err?.message || "Failed to load order.";
      order = null;
    } finally {
      if (!soft) loading = false;
    }
  }

  async function openSiteToHome() {
    if (!order?.workOrderNumber || openingHomeRoute) return;
    openingHomeRoute = true;
    try {
      const stored = $dispatchedDetailsStore;
      let details = stored?.workOrder === order.workOrderNumber ? stored : null;
      if (!details) {
        const loaded = await authApiFetch(
          `${API_ROUTES.DISPATCH_BY_WO}/${encodeURIComponent(order.workOrderNumber)}`,
        );
        details = loaded?.data ?? loaded;
      }
      const settings = await authApiFetch(API_ROUTES.SETTING);
      const homeLat = settings?.homeLatitude;
      const homeLng = settings?.homeLongitude;
      if (homeLat == null || homeLng == null || homeLat === "" || homeLng === "") {
        await Swal.fire({
          icon: "info",
          title: "Home not set",
          text: "Save the company home on the Settings page, then open this route again.",
        });
        return;
      }
      const fromName =
        [details?.city, details?.state].filter(Boolean).join(", ") ||
        "Installation site";
      const hasPin =
        details?.siteLatitude != null &&
        details?.siteLatitude !== "" &&
        details?.siteLongitude != null &&
        details?.siteLongitude !== "";
      if (!hasPin && !details?.city) {
        await Swal.fire({
          icon: "info",
          title: "Site not set",
          text: "Add the dispatch city, or pick the installation site on the map.",
        });
        return;
      }
      const params = new URLSearchParams({
        from: fromName,
        to: settings?.homeName || "Home",
        toLat: String(homeLat),
        toLng: String(homeLng),
      });
      if (hasPin) {
        params.set("fromLat", String(details.siteLatitude));
        params.set("fromLng", String(details.siteLongitude));
      }
      goto(`/admin/installation-track?${params.toString()}`);
    } catch (err) {
      await Swal.fire({
        icon: "error",
        title: "Could not open the route",
        text: err?.message || "Try again.",
      });
    } finally {
      openingHomeRoute = false;
    }
  }

  async function refreshPage(e) {
    e?.preventDefault?.();
    if (refreshing || loading) return;
    refreshing = true;
    try {
      await loadOrder({ soft: true });
      processKey += 1;
    } finally {
      refreshing = false;
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
            {#if hasOrdersAccess}
              <li class="breadcrumb-item"><a href="/admin/order">Orders</a></li>
              <li class="breadcrumb-item">
                <a href="/admin/order/{orderId}">{order?.title || `Order #${orderId}`}</a>
              </li>
            {:else}
              <li class="breadcrumb-item"><a href="/admin/installation">Installation</a></li>
              <li class="breadcrumb-item">{order?.title || `Order #${orderId}`}</li>
            {/if}
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
      <div class="d-flex flex-wrap align-items-center gap-2">
        {#if ["master", "admin", "manager"].includes(currentUser?.role) && hasInstallationAccess && order}
          <button
            type="button"
            class="btn btn-outline-primary btn-sm"
            on:click={openSiteToHome}
            disabled={openingHomeRoute || loading}
          >
            <i class="ti ti-route me-1"></i>
            {openingHomeRoute ? "Opening…" : "Site to home route"}
          </button>
        {/if}
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          on:click={refreshPage}
          disabled={refreshing || loading}
          aria-label="Refresh"
          title="Refresh"
        >
          <i class="ti ti-refresh" class:ti-spin={refreshing}></i>
          <span class="ms-1">Refresh</span>
        </button>
        <a
          href={hasOrdersAccess ? `/admin/order/${orderId}` : "/admin/installation"}
          class="btn btn-outline-secondary btn-sm"
        >
          <i class="ti ti-arrow-left me-1"></i>{hasOrdersAccess ? "Back to order" : "Back to installation"}
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
          {#key processKey}
            <DispatchProcess {order} />
          {/key}
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
