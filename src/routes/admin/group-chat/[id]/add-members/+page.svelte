<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";

  onMount(() => {
    goto(`/admin/group-chat/${$page.params.id}`, { replaceState: true });
  });
</script>
