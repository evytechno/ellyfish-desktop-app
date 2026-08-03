<script>
  import "../../app.css";
  import "../../styles/main.css";
  import "../../styles/typography.css";
  import { onMount } from "svelte";
  import jQuery from "jquery";
  import { goto } from "$app/navigation";

  import { setupBootstrapHandlers } from "$lib/utils/js/bootstrapHandlers.js";

  onMount(() => {
    window.$ = jQuery;
    window.jQuery = jQuery;
    setupBootstrapHandlers();
  });
</script>

<main class="main-wrapper min-h-screen bg-gray-50">
  <slot />
</main>
