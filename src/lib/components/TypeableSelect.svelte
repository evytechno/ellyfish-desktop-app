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
  export let dropdownParent = null; // CSS selector or DOM element
  /**
   * Optional remote search. Called with the typed term.
   * Return: string[] or { id, text }[]
   * When set, Select2 uses AJAX instead of local-only filtering.
   */
  export let ajaxSearch = null;
  export let ajaxDelay = 300;
  export let minimumInputLength = 0;

  const dispatch = createEventDispatcher();
  let selectEl;
  let jqSelect;
  let jQueryRef = null;
  let ready = false;

  function optionsSignature(opts) {
    try {
      return JSON.stringify(opts ?? []);
    } catch (_) {
      return String((opts || []).length);
    }
  }

  function normalizeAjaxResults(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((item) => {
        if (item == null) return null;
        if (typeof item === "string") return { id: item, text: item };
        if (typeof item === "object") {
          const id = item.id ?? item.value ?? item.name ?? item.text;
          const text = item.text ?? item.label ?? item.name ?? String(id);
          if (id == null || id === "") return null;
          return { id: String(id), text: String(text) };
        }
        return { id: String(item), text: String(item) };
      })
      .filter(Boolean);
  }

  let lastOptionsSig = "";

  function initSelect2() {
    if (!selectEl || !jQueryRef) return;
    const jQuery = jQueryRef;

    if (jqSelect) {
      try {
        jqSelect.off("change");
        if (jqSelect.hasClass("select2-hidden-accessible")) {
          jqSelect.select2("destroy");
        }
      } catch (_) {}
    }

    jqSelect = jQuery(selectEl);
    const useAjax = typeof ajaxSearch === "function";

    const s2opts = {
      tags: !useAjax && !grouped && !objectMode,
      width: "100%",
      placeholder,
      allowClear: true,
    };

    if (dropdownParent) {
      s2opts.dropdownParent =
        typeof dropdownParent === "string"
          ? jQuery(dropdownParent)
          : jQuery(dropdownParent);
    }

    if (useAjax) {
      s2opts.minimumInputLength = minimumInputLength;
      s2opts.ajax = {
        delay: ajaxDelay,
        transport: (params, success, failure) => {
          const term = params?.data?.q ?? "";
          Promise.resolve(ajaxSearch(term))
            .then((raw) => {
              success({ results: normalizeAjaxResults(raw) });
            })
            .catch((err) => failure(err));
          return { abort() {} };
        },
        processResults: (data) => data,
      };
    }

    jqSelect.select2(s2opts);
    if (disabled) jqSelect.prop("disabled", true);

    const val = objectMode ? String(value ?? "") : (value ?? "");
    if (val) {
      // Ensure current value exists as an option for Select2 display
      if (jqSelect.find(`option[value="${CSS.escape(String(val))}"]`).length === 0) {
        const opt = new Option(String(val), String(val), true, true);
        jqSelect.append(opt);
      }
    }
    jqSelect.val(val || null).trigger("change.select2");

    jqSelect.on("change", (e) => {
      const next = jQuery(e.target).val();
      if (objectMode) {
        const parsed =
          next === "" || next === null
            ? null
            : isNaN(Number(next))
              ? next
              : Number(next);
        dispatch("change", parsed);
      } else {
        dispatch("change", next || "");
      }
    });
  }

  onMount(async () => {
    const jQuery = (await import("jquery")).default;
    const select2Module = await import("select2");
    select2Module.default(jQuery);
    await import("select2/dist/css/select2.min.css");
    jQueryRef = jQuery;
    ready = true;
    lastOptionsSig = optionsSignature(options);
    initSelect2();

    return () => {
      if (jqSelect) {
        try {
          jqSelect.off("change");
          if (jqSelect.hasClass("select2-hidden-accessible")) {
            jqSelect.select2("destroy");
          }
        } catch (_) {}
      }
    };
  });

  // Re-init when static option list changes (not used for ajax mode)
  $: if (ready && typeof ajaxSearch !== "function") {
    const sig = optionsSignature(options);
    if (sig !== lastOptionsSig) {
      lastOptionsSig = sig;
      queueMicrotask(() => initSelect2());
    }
  }

  $: if (jqSelect && ready) {
    const val = objectMode ? String(value ?? "") : (value ?? "");
    if ((jqSelect.val() || "") !== (val || "")) {
      if (val && jqSelect.find(`option[value="${CSS.escape(String(val))}"]`).length === 0) {
        const opt = new Option(String(val), String(val), true, true);
        jqSelect.append(opt);
      }
      jqSelect.val(val || null).trigger("change.select2");
    }
  }

  $: if (!grouped && !objectMode && typeof ajaxSearch !== "function" && value && !options.includes(value)) {
    options = [...options, value];
  }
</script>

<select
  bind:this={selectEl}
  class="select form-control"
  {id}
  {disabled}
  value={objectMode ? String(value ?? "") : value}
>
  {#if typeof ajaxSearch === "function"}
    <option value="">{placeholder}</option>
    {#if value}
      <option value={value} selected>{value}</option>
    {/if}
  {:else if grouped}
    <option value="">{placeholder}</option>
    {#each options as group}
      <optgroup label={group.label}>
        {#each group.options || [] as opt}
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
    <option value="">{placeholder}</option>
    {#each options as option}
      <option value={option}>{option}</option>
    {/each}
  {/if}
</select>
