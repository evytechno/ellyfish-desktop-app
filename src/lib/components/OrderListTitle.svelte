<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { statusNamesStore } from "../stores/statusNames";
  export let statusKey;
  let isEditing = false;
  let title = "";
  let inputEl;
  let containerEl;

  function toggleVisibility() {
    toggleStatusVisibility(statusKey);
  }
  function toggleStatusVisibility(statusKey) {
    console.log("statusKey : ", statusKey);

    statusNamesStore.update((statusNames) => {
      const status = statusNames[statusKey];
    console.log("status : ", status);
      if (status) {
        status.visible = !status.visible;
      }
      return { ...statusNames };
    });
  }

  function startEditing() {
    title = $statusNamesStore[statusKey]?.name ?? statusKey;
    isEditing = true;
    tick().then(() => inputEl?.focus());
  }

  function handleBlur() {
    isEditing = false;
    if (title !== $statusNamesStore[statusKey]?.name) {
      if (title.length) {
        statusNamesStore.update((s) => ({
          ...s,
          [statusKey]: { ...s[statusKey], name: title },
        }));
      } else {
        statusNamesStore.update((s) => ({
          ...s,
          [statusKey]: { ...s[statusKey], name: statusKey },
        }));
      }
    }
  }

  function handleKeydown(e) {
    if (e.key === "Enter") e.target.blur();
    if (e.key === "Escape") {
      title = $statusNamesStore[statusKey]?.name ?? statusKey;
      isEditing = false;
    }
  }

  function handleClickOutside(event) {
    if (isEditing && containerEl && !containerEl.contains(event.target)) {
      handleBlur();
    }
  }

  onMount(() => {
    if (typeof window !== "undefined") {
      document.addEventListener("mousedown", handleClickOutside);
    }
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      document.removeEventListener("mousedown", handleClickOutside);
    }
  });
</script>

<h6
  bind:this={containerEl}
  class={`flex items-center mb-1 w-full truncate 
    border rounded-md py-1 
    ${isEditing ? "border-gray-400" : "border-white"}`}
>
  <i class="ti ti-circle-filled fs-10 text-info me-1"></i>

  {#if isEditing}
    <input
      bind:this={inputEl}
      bind:value={title}
      on:keydown={handleKeydown}
      class="outline-none w-full"
    />
  {:else}
    <div
      on:dblclick={startEditing}
      class="w-full overflow-hidden truncate whitespace-nowrap"
      title={$statusNamesStore[statusKey]?.name ?? statusKey}
    >
      {$statusNamesStore[statusKey]?.name ?? statusKey}
    </div>
  {/if}

  <!-- Toggle Visibility Button -->
  <button on:click={toggleVisibility} class="ml-2 text-gray-500">
    {#if $statusNamesStore[statusKey]?.visible}
      <i class="ti ti-eye-off text-info ms-1"></i>
    {:else}
      <i class="ti ti-eye text-info ms-1"></i>
    {/if}
  </button>
</h6>
