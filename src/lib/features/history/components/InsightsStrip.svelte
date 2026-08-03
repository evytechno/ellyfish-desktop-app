<script>
  /** @type {Array<{ id: string, label: string, count: number, level: string, flag?: string, event?: string, action: string }>} */
  export let insights = [];
  export let label = "Decision flags";
  export let icon = "ti-flag";
  export let flagFilter = "";
  export let eventFilter = "";
  /** @type {(id: string) => string} */
  export let flagFilterLabel = (id) => id;
  /** @type {(insight: any) => void} */
  export let onApply = () => {};
  /** @type {() => void} */
  export let onClear = () => {};
  /** Match active state: flag only, or flag/event (auth). */
  export let matchEvent = false;
</script>

{#if insights.length}
  <div class="hx-insights">
    <div class="hx-insights-label">
      <i class="ti {icon}"></i>
      {label}
      {#if flagFilter}
        <button type="button" class="hx-clear-flag" on:click={onClear}>
          Clear · {flagFilterLabel(flagFilter)}
        </button>
      {/if}
    </div>
    <div class="hx-insight-row">
      {#each insights as insight}
        <button
          type="button"
          class="hx-insight hx-insight--{insight.level}"
          class:active={matchEvent
            ? flagFilter === insight.flag || (insight.event && eventFilter === insight.event)
            : flagFilter === insight.flag}
          on:click={() => onApply(insight)}
          title={insight.action}
        >
          <span class="hx-insight-count">{insight.count}</span>
          <span class="hx-insight-text">
            <strong>{insight.label}</strong>
            <small>{insight.action}</small>
          </span>
        </button>
      {/each}
    </div>
  </div>
{/if}
