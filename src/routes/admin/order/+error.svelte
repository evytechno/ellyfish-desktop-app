<script>
  import { page } from "$app/stores";
</script>

<div class="page-wrapper">
  <div class="content">
    <div
      class="d-flex flex-column align-items-center justify-content-center text-center"
      style="min-height: 60vh; gap: 1rem;"
    >
      <div style="font-size: 3.5rem; line-height: 1; margin-bottom: 0.5rem;">
        {#if $page.status === 404}📋{:else}⚠️{/if}
      </div>

      <h3 class="fw-bold mb-1">
        {#if $page.status === 404}
          Order Not Found
        {:else if $page.status === 403}
          Access Denied
        {:else}
          Failed to Load Order
        {/if}
      </h3>

      <p class="text-muted mb-4" style="max-width: 400px;">
        {#if $page.error?.message && $page.error.message !== "Not Found"}
          {$page.error.message}
        {:else if $page.status === 404}
          This order doesn't exist or may have been deleted.
        {:else if $page.status === 403}
          You don't have permission to view this order.
        {:else}
          Something went wrong while loading this order. Please try again.
        {/if}
      </p>

      <div class="d-flex gap-2 justify-content-center flex-wrap">
        <button class="btn btn-primary" on:click={() => location.reload()}>
          <i class="ti ti-refresh me-1"></i>Retry
        </button>
        <a href="/admin/order" class="btn btn-outline-secondary">
          <i class="ti ti-arrow-left me-1"></i>Back to Orders
        </a>
        <a href="/admin/dashboard" class="btn btn-outline-secondary">
          <i class="ti ti-home me-1"></i>Dashboard
        </a>
      </div>
    </div>
  </div>
</div>
