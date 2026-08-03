<script>
  /** @type {'order' | 'auth'} */
  export let activeTab = "order";
  export let totalItems = 0;
  export let authTotalItems = 0;
  export let orderCriticalCount = 0;
  export let authCriticalCount = 0;
  /** @type {(tab: string) => void} */
  export let onSwitch = () => {};
</script>

<div class="hx-tabs" role="tablist">
  <button
    type="button"
    class="hx-tab"
    class:active={activeTab === "order"}
    on:click={() => onSwitch("order")}
  >
    <i class="ti ti-activity"></i>
    Order activities
    <span class="hx-tab-count">{totalItems}</span>
    {#if orderCriticalCount > 0}
      <span class="hx-tab-alert" title="{orderCriticalCount} critical on this page"
        >{orderCriticalCount}</span
      >
    {/if}
  </button>
  <button
    type="button"
    class="hx-tab"
    class:active={activeTab === "auth"}
    on:click={() => onSwitch("auth")}
  >
    <i class="ti ti-shield-lock"></i>
    Auth history
    <span class="hx-tab-count">{authTotalItems}</span>
    {#if authCriticalCount > 0}
      <span class="hx-tab-alert" title="{authCriticalCount} critical on this page"
        >{authCriticalCount}</span
      >
    {/if}
  </button>
</div>
