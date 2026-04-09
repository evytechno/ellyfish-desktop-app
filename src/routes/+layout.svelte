<script>
  import { onMount } from 'svelte';

  onMount(() => {
    // Hide splash screen once SvelteKit has fully mounted
    if (typeof window.hideSplash === 'function') {
      window.hideSplash();
    }
  });
</script>

<slot />
