<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  onMount(() => {
    goto("/admin/group-chat", { replaceState: true });
  });
</script>
