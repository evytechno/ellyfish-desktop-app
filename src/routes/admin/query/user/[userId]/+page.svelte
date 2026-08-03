<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";

  // Keep old /admin/query/user/:id links working — open split view with that user selected
  onMount(() => {
    const id = $page.params.userId;
    goto(`/admin/query/user?id=${id}`, { replaceState: true });
  });
</script>

<div class="d-flex align-items-center justify-content-center py-5">
  <span class="spinner-border spinner-border-sm text-primary"></span>
</div>
