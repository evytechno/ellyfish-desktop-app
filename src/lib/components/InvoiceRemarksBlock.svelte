<script>
  import HtmlOrPlain from "$lib/components/HtmlOrPlain.svelte";
  import { splitRemarksTitle } from "$lib/utils/remarksDisplay.js";

  export let value = "";
  /** "inline" kept for API compat — HTML always renders as a block under the label */
  export let layout = "inline";

  $: parsed = splitRemarksTitle(value);
</script>

{#if parsed.body}
  <div class="invoice-remarks-block text-left text-xs" class:block-layout={layout === "block"}>
    {#if layout === "block"}
      <h6 class="mb-1 fs-14 fw-semibold">{parsed.label}</h6>
    {:else}
      <div class="font-semibold remarks-label">{parsed.label}:</div>
    {/if}
    <HtmlOrPlain value={parsed.body} class="remarks-body" />
  </div>
{/if}

<style>
  .invoice-remarks-block {
    margin-top: 0.25rem;
  }
  .remarks-label {
    margin-bottom: 0.15rem;
  }
  .block-layout .remarks-body {
    font-size: inherit;
  }
</style>
