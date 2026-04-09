<script>
  import { onMount, createEventDispatcher } from "svelte";

  export let options = [];
  export let value = "";
  export let id = "";
  export let placeholder = "Select Option";

  const dispatch = createEventDispatcher();
  let selectEl;

  onMount(async () => {
    const jQuery = (await import("jquery")).default;
    const select2Module = await import("select2");
    select2Module.default(jQuery);
    await import("select2/dist/css/select2.min.css");

    jQuery(selectEl).select2({
      tags: true,
      width: "100%",
    });

    jQuery(selectEl).on("change", (e) => {
      const val = jQuery(e.target).val();
      dispatch("change", val);
    });

    return () => {
      jQuery(selectEl).select2("destroy");
    };
  });

  $: if (value && !options.includes(value)) {
    options = [...options, value];
  }
</script>

<select bind:this={selectEl} class="select form-control" {id} {value}>
  <option value={null} disabled selected>{placeholder}</option>
  {#each options as option}
    <option value={option}>{option}</option>
  {/each}
</select>
