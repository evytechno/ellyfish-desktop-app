<script>
  import { fade } from "svelte/transition";

  /** @type {Array<{ count: number, label: string }>} */
  export let items = [];
  /** @type {'warn' | 'critical'} */
  export let variant = "warn";
  export let title = "Review recommended";
  export let hint = "Click a flag below to focus the list.";
  export let icon = "ti-alert-triangle";
</script>

{#if items.length}
  <div
    class="hx-attention"
    class:hx-attention--critical={variant === "critical"}
    class:hx-attention--warn={variant === "warn"}
    transition:fade={{ duration: 120 }}
  >
    <i class="ti {icon}"></i>
    <div>
      <strong>{title}</strong>
      <span>
        {items.map((i) => `${i.count} ${i.label.toLowerCase()}`).join(" · ")} on this page.
        {hint}
      </span>
    </div>
  </div>
{/if}
