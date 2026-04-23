<script>
  import { onMount, createEventDispatcher } from "svelte";

  export let options = [];
  export let value = "";
  export let id = "";
  export let placeholder = "Select Option";
  // when true, options = [{label: string, options: string[]}]
  export let grouped = false;

  const dispatch = createEventDispatcher();
  let selectEl;

  onMount(async () => {
    const jQuery = (await import("jquery")).default;
    const select2Module = await import("select2");
    select2Module.default(jQuery);
    await import("select2/dist/css/select2.min.css");

    jQuery(selectEl).select2({
      tags: !grouped,
      width: "100%",
      placeholder,
    });

    jQuery(selectEl).on("change", (e) => {
      const val = jQuery(e.target).val();
      dispatch("change", val);
    });

    return () => {
      jQuery(selectEl).select2("destroy");
    };
  });

  $: if (!grouped && value && !options.includes(value)) {
    options = [...options, value];
  }
</script>

<select bind:this={selectEl} class="select form-control" {id} {value}>
  {#if grouped}
    <option value="" disabled selected>{placeholder}</option>
    {#each options as group}
      <optgroup label={group.label}>
        {#each group.options as opt}
          <option value={opt}>{opt}</option>
        {/each}
      </optgroup>
    {/each}
  {:else}
    <option value={null} disabled selected>{placeholder}</option>
    {#each options as option}
      <option value={option}>{option}</option>
    {/each}
  {/if}
</select>
