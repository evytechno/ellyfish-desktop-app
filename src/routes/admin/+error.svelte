<script>
  import { page } from "$app/stores";
</script>

<div class="page-wrapper">
  <div class="content">
    <div
      class="d-flex flex-column align-items-center justify-content-center"
      style="min-height: 60vh; gap: 1rem;"
    >
      <div class="text-center">
        <div style="font-size: 4rem; line-height: 1; margin-bottom: 1rem;">
          {#if $page.status === 404}
            🔍
          {:else if $page.status === 403}
            🔒
          {:else}
            ⚠️
          {/if}
        </div>

        <h2 class="fw-bold mb-2">
          {#if $page.status === 404}
            Page Not Found
          {:else if $page.status === 403}
            Access Denied
          {:else if $page.status === 500}
            Server Error
          {:else}
            Something Went Wrong
          {/if}
        </h2>

        <p class="text-muted mb-4" style="max-width: 400px; margin: 0 auto;">
          {#if $page.error?.message && $page.error.message !== "Not Found"}
            {$page.error.message}
          {:else if $page.status === 404}
            The page you're looking for doesn't exist or has been moved.
          {:else if $page.status === 403}
            You don't have permission to view this page.
          {:else}
            An unexpected error occurred. Please try again.
          {/if}
        </p>

        <div class="d-flex gap-2 justify-content-center flex-wrap">
          <button
            class="btn btn-primary"
            on:click={() => history.back()}
          >
            <i class="ti ti-arrow-left me-1"></i>Go Back
          </button>
          <a href="/admin/dashboard" class="btn btn-outline-secondary">
            <i class="ti ti-home me-1"></i>Dashboard
          </a>
          <button
            class="btn btn-outline-primary"
            on:click={() => location.reload()}
          >
            <i class="ti ti-refresh me-1"></i>Retry
          </button>
        </div>

        {#if $page.status >= 500}
          <div class="alert alert-warning mt-4 text-start" style="max-width: 400px; font-size: 0.8125rem;">
            <i class="ti ti-alert-triangle me-1"></i>
            Error {$page.status} — The server encountered a problem. Try refreshing or contact support if it persists.
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
