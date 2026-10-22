<script>
  import SiteLocationPicker from "$lib/components/SiteLocationPicker.svelte";
  import { reverseIndiaPlace } from "$lib/utils/placeSearch";

  export let latitude = "";
  export let longitude = "";
  export let city = "";
  export let state = "";
  export let address = "";
  export let pincode = "";
  export let addressHint = "";
  export let readonly = false;
  /** Work Order add: first open with no pin starts at the current location. */
  export let autoLocate = false;

  let open = false;
  let applying = false;
  let draft = { latitude: "", longitude: "" };

  $: pinSet = latitude !== "" && latitude != null && longitude !== "" && longitude != null;

  function openMap() {
    draft = {
      latitude: pinSet ? String(latitude) : "",
      longitude: pinSet ? String(longitude) : "",
    };
    open = true;
  }

  async function usePlace() {
    if (readonly) {
      open = false;
      return;
    }
    applying = true;
    try {
      latitude = draft.latitude;
      longitude = draft.longitude;
      try {
        const place = await reverseIndiaPlace(draft.latitude, draft.longitude);
        if (place?.city) city = place.city;
        if (place?.state) state = place.state;
        if (place?.address) address = place.address;
        if (place?.pincode) pincode = place.pincode;
      } catch {
        /* keep the city and state already chosen */
      }
      open = false;
    } finally {
      applying = false;
    }
  }
</script>

<div id="field-site-location">
  <div class="form-label fw-semibold">
    Site location {#if !readonly}<span class="text-danger">*</span>{/if}
    <span class="text-muted small fw-normal">(Installation site for this machine)</span>
  </div>
  {#if readonly}
    <button type="button" class="btn btn-link btn-sm px-0" on:click={openMap} disabled={!pinSet}>
      {pinSet ? `View on map${city || state ? ` — ${[city, state].filter(Boolean).join(", ")}` : ""}` : "Not set"}
    </button>
  {:else}
    <button type="button" class="btn btn-outline-primary btn-sm" on:click={openMap}>
      {pinSet ? `Pin set — change on map${city || state ? ` (${[city, state].filter(Boolean).join(", ")})` : ""}` : "Pick on map"}
    </button>
  {/if}
</div>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="wo-site-modal" on:click|self={() => (open = false)}>
    <div class="wo-site-card" on:click|stopPropagation>
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <h6 class="mb-0">Site location</h6>
          <p class="text-muted small mb-0">
            {readonly
              ? "Installation site on the map"
              : "Pick the pin. Address, pincode, city, and state are filled from that place."}
          </p>
        </div>
        <button type="button" class="btn-close" aria-label="Close" on:click={() => (open = false)}></button>
      </div>
      <SiteLocationPicker
        bind:latitude={draft.latitude}
        bind:longitude={draft.longitude}
        {city}
        {state}
        searchHint={addressHint}
        {readonly}
        autoLocate={autoLocate && !pinSet}
      />
      <div class="d-flex justify-content-end gap-2 mt-3">
        <button type="button" class="btn btn-light btn-sm" on:click={() => (open = false)}>
          {readonly ? "Close" : "Cancel"}
        </button>
        {#if !readonly}
          <button type="button" class="btn btn-primary btn-sm" disabled={applying} on:click={usePlace}>
            {applying ? "Saving place…" : "Use this location"}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .wo-site-modal {
    position: fixed;
    inset: 0;
    z-index: 2000;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .wo-site-card {
    width: min(52rem, 100%);
    background: #fff;
    border-radius: 0.75rem;
    padding: 1rem;
  }
</style>
