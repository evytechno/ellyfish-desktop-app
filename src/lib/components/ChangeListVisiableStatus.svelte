<script>
  import { statusNamesStore } from "../stores/statusNames";

  // Convert object to array for iteration
  $: statusList = Object.entries($statusNamesStore).map(([key, value]) => ({
    id: key,
    ...value,
  }));

  function toggleVisibility(statusKey) {
    statusNamesStore.update((statusNames) => {
      const status = statusNames[statusKey];
      if (status) {
        status.visible = !status.visible;
      }
      return { ...statusNames };
    });
  }
</script>

<div class="access-wrap">
  {#if statusList.length}
    <ul>
      {#each statusList as orderStatus}
        <li class="select-people-checkbox">
          <div class="checkboxs d-flex justify-between align-items-center mb-3">
            <span class="people-profile">
              <span
                >{orderStatus.name}
                <span class="text-[10px]">({orderStatus.id})</span></span
              >
            </span>
            <button on:click={() => toggleVisibility(orderStatus.id)}>
              {#if orderStatus.visible}
                <div class="text-danger">Hide</div>
              {:else}
                <div class="text-success">Show</div>
              {/if}
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
