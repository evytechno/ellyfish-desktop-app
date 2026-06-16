<script>
  import { onMount, createEventDispatcher } from "svelte";

  export let options = [];
  export let value = "";
  export let id = "";
  export let placeholder = "Select Option";
  // when true, options = [{label: string, options: string[]}]
  export let grouped = false;
  // object mode: options = [{value: any, label: string}], emits the `value` field on change
  export let objectMode = false;
  export let disabled = false;

  const dispatch = createEventDispatcher();
  let selectEl;
  let jqSelect;

  onMount(async () => {
    const jQuery = (await import("jquery")).default;
    const select2Module = await import("select2");
    select2Module.default(jQuery);
    await import("select2/dist/css/select2.min.css");

    jqSelect = jQuery(selectEl);

    jqSelect.select2({
      tags: !grouped && !objectMode,
      width: "100%",
      placeholder,
    });

    if (disabled) jqSelect.prop("disabled", true);

    jqSelect.on("change", (e) => {
      const val = jQuery(e.target).val();
      if (objectMode) {
        const parsed = val === "" || val === null ? null : (isNaN(Number(val)) ? val : Number(val));
        dispatch("change", parsed);
      } else {
        dispatch("change", val);
      }
    });

    return () => {
      jqSelect.select2("destroy");
    };
  });

  // Sync select2 display when value changes from parent after initialization
  $: if (jqSelect) {
    const val = objectMode ? String(value ?? "") : (value ?? "");
    if (jqSelect.val() !== val) {
      jqSelect.val(val).trigger("change.select2");
    }
  }

  $: if (!grouped && !objectMode && value && !options.includes(value)) {
    options = [...options, value];
  }
</script>

<select bind:this={selectEl} class="select form-control" {id} {disabled} value={objectMode ? String(value ?? "") : value}>
  {#if grouped}
    <option value="" disabled selected>{placeholder}</option>
    {#each options as group}
      <optgroup label={group.label}>
        {#each group.options as opt}
          <option value={opt}>{opt}</option>
        {/each}
      </optgroup>
    {/each}
  {:else if objectMode}
    <option value="">— {placeholder} —</option>
    {#each options as opt}
      <option value={String(opt.value)}>{opt.label}</option>
    {/each}
  {:else}
    <option value={null} disabled selected>{placeholder}</option>
    {#each options as option}
      <option value={option}>{option}</option>
    {/each}
  {/if}
</select>
