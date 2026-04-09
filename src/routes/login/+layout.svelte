<script>
  import "../../app.css";
  import "../../styles/main.css";
  import { onMount } from "svelte";
  import jQuery from "jquery";
  import { goto } from "$app/navigation";

  onMount(() => {
    window.$ = jQuery;
    window.jQuery = jQuery;
  });
  import { setupBootstrapHandlers } from "$lib/utils/js/bootstrapHandlers.js";

  onMount(() => {
    setupBootstrapHandlers();
  });
</script>

<main class="main-wrapper min-h-screen bg-gray-50">
  <slot />
</main>
