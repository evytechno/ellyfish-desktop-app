<script>
  import { onMount, createEventDispatcher } from "svelte";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";

  // Pass the order that should be pre-selected at mount time (edit mode).
  // Use {#key someToken} in the parent to remount when the selection must reset.
  export let initialValue = null;   // orderId (number)
  export let initialTitle = "";     // display title for the pre-selected option
  export let id = "orderId";
  export let placeholder = "Search Order...";
  export let isInvalid = false;

  const dispatch = createEventDispatcher();
  let selectEl;

  onMount(async () => {
    const jQuery = (await import("jquery")).default;
    const select2Module = await import("select2");
    select2Module.default(jQuery);
    await import("select2/dist/css/select2.min.css");

    const $el = jQuery(selectEl);

    // Pre-populate the selected option for edit mode
    if (initialValue != null && initialTitle) {
      $el.append(new Option(initialTitle, String(initialValue), true, true));
    }

    $el.select2({
      width: "100%",
      placeholder,
      allowClear: true,
      minimumInputLength: 0,
      ajax: {
        delay: 300,
        transport: async (params, success, failure) => {
          try {
            const q = new URLSearchParams();
            if (params.data.term) q.set("search", params.data.term);
            q.set("limit", "20");
            q.set("page", "1");
            const data = await authApiFetch(
              `${API_ROUTES.ORDER}/all-search-for-inquiry?${q.toString()}`,
              { method: "GET" },
            );
            success({
              results: (data.data || []).map((o) => ({
                id: String(o.id),
                text: o.title,
              })),
            });
          } catch (e) {
            failure(e);
          }
        },
      },
    });

    $el.on("change", () => {
      const selected = $el.select2("data")[0];
      dispatch("change", {
        id: selected?.id ? Number(selected.id) : null,
        text: selected?.text ?? "",
      });
    });

    return () => {
      $el.select2("destroy");
    };
  });
</script>

<select bind:this={selectEl} {id} class="select form-control" class:is-invalid={isInvalid}></select>
