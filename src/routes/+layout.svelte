<script>
  import { onMount } from 'svelte';

  onMount(() => {
    // Hide the app.html splash screen once SvelteKit has fully mounted
    if (typeof window.hideSplash === 'function') {
      window.hideSplash();
    }
  });
</script>

<slot />
