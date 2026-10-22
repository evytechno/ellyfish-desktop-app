<script>
  import { onDestroy, onMount } from "svelte";
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";
  import { nearbySearchQueries, searchIndiaPlaces } from "$lib/utils/placeSearch";
  import { mapPinIcon } from "$lib/utils/mapPins";

  export let latitude = "";
  export let longitude = "";
  export let city = "";
  export let state = "";
  export let searchHint = "";
  export let readonly = false;
  /** When there is no pin yet, ask for the current location and place it. */
  export let autoLocate = false;

  const INDIA_BOUNDS = [
    [6.5, 68.1],
    [35.7, 97.4],
  ];

  let mapEl;
  let map;
  let marker;
  let searchText = "";
  let searchResults = [];
  let searchError = "";
  let nearbyNote = "";
  let searching = false;
  let locating = false;
  let permissionOpen = false;
  let permissionDenied = false;
  let cityZoomToken = 0;

  function parsedPoint() {
    if (String(latitude ?? "").trim() === "" || String(longitude ?? "").trim() === "") return null;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return [lat, lng];
  }

  function setPoint(lat, lng, pan) {
    latitude = Number(lat).toFixed(6);
    longitude = Number(lng).toFixed(6);
    placeMarker([Number(lat), Number(lng)], pan);
  }

  function placeMarker(latlng, pan) {
    if (!map) return;
    if (!marker) {
      marker = L.marker(latlng, {
        icon: mapPinIcon("#2563eb"),
        draggable: !readonly,
        autoPan: true,
        zIndexOffset: 500,
      }).addTo(map);
      if (!readonly) {
        marker.on("dragend", () => {
          const point = marker.getLatLng();
          latitude = point.lat.toFixed(6);
          longitude = point.lng.toFixed(6);
        });
      }
    } else {
      marker.setLatLng(latlng);
    }
    if (pan) map.setView(latlng, Math.max(map.getZoom(), 14));
  }

  function showIndia() {
    if (!map) return;
    map.fitBounds(INDIA_BOUNDS, { padding: [12, 12] });
  }

  function focusPlace(hit) {
    cityZoomToken += 1;
    if (!readonly) {
      latitude = Number(hit.latitude).toFixed(6);
      longitude = Number(hit.longitude).toFixed(6);
      placeMarker([hit.latitude, hit.longitude], false);
    }
    if (map && hit.bounds) {
      map.fitBounds(hit.bounds, { padding: [24, 24], maxZoom: 14 });
    } else {
      map?.setView([hit.latitude, hit.longitude], 12);
    }
  }

  function samePlace(left, right) {
    return (
      Math.abs(Number(left.latitude) - Number(right.latitude)) < 0.02 &&
      Math.abs(Number(left.longitude) - Number(right.longitude)) < 0.02
    );
  }

  async function searchPlace() {
    const query = searchText.trim();
    searchError = "";
    nearbyNote = "";
    searchResults = [];
    if (!query) {
      searchError = "Type a place name.";
      return;
    }
    searching = true;
    try {
      const exact = await searchIndiaPlaces(query);
      if (exact.length) {
        searchResults = exact.slice(0, 5);
        return;
      }
      const hits = [];
      for (const part of nearbySearchQueries(query)) {
        let rows = [];
        try {
          rows = await searchIndiaPlaces(part);
        } catch {
          continue;
        }
        for (const hit of rows) {
          if (hits.some((item) => samePlace(item, hit))) continue;
          hits.push(hit);
          if (hits.length === 1) focusPlace(hit);
          if (hits.length >= 5) break;
        }
        searchResults = hits.slice(0, 5);
        if (hits.length >= 5) break;
      }
      if (!hits.length) searchError = "No place found in India.";
      else nearbyNote = "Exact address not found. Nearby places:";
    } catch {
      searchError = "Search failed. Try again.";
    } finally {
      searching = false;
    }
  }

  function choosePlace(hit) {
    searchResults = [];
    nearbyNote = "";
    searchText = hit.label || [hit.name, hit.admin1].filter(Boolean).join(", ");
    searchError = "";
    focusPlace(hit);
  }

  function readPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });
  }

  async function geolocationPermission() {
    try {
      if (!navigator.permissions?.query) return "unknown";
      const status = await navigator.permissions.query({ name: "geolocation" });
      return status.state;
    } catch {
      return "unknown";
    }
  }

  async function zoomToCity() {
    const token = ++cityZoomToken;
    const name = String(city || "").split(",")[0].trim();
    if (!name || !map) return;
    try {
      const hits = await searchIndiaPlaces(name);
      if (token !== cityZoomToken || !map || parsedPoint()) return;
      const hit = hits[0];
      if (!hit) return;
      if (hit.bounds) map.fitBounds(hit.bounds, { padding: [24, 24], maxZoom: 12 });
      else map.setView([hit.latitude, hit.longitude], 12);
    } catch {
      /* keep the India view */
    }
  }

  function dismissLocationPrompt() {
    permissionOpen = false;
    zoomToCity();
  }

  async function requestLocation() {
    searchError = "";
    if (!navigator.geolocation) {
      permissionOpen = false;
      searchError = "This browser cannot read your location.";
      return;
    }
    locating = true;
    try {
      const pos = await readPosition();
      cityZoomToken += 1;
      permissionOpen = false;
      permissionDenied = false;
      setPoint(pos.coords.latitude, pos.coords.longitude, true);
    } catch (err) {
      if (err?.code === 1) {
        permissionDenied = true;
        permissionOpen = true;
      } else {
        permissionOpen = false;
        searchError = "Could not read your location. Try again.";
        zoomToCity();
      }
    } finally {
      locating = false;
    }
  }

  async function openLocationPrompt() {
    if (!navigator.geolocation) {
      searchError = "This browser cannot read your location.";
      return;
    }
    const state = await geolocationPermission();
    if (state === "granted") {
      await requestLocation();
      return;
    }
    permissionDenied = state === "denied";
    permissionOpen = true;
  }

  function useMyLocation() {
    openLocationPrompt();
  }

  onMount(async () => {
    map = L.map(mapEl, {
      scrollWheelZoom: true,
      dragging: true,
      zoomControl: true,
    }).fitBounds(INDIA_BOUNDS, { padding: [8, 8] });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);

    if (!readonly) {
      map.on("click", (event) => {
        setPoint(event.latlng.lat, event.latlng.lng, false);
      });
    }

    if (String(searchHint || "").trim()) searchText = String(searchHint).trim();
    const existing = parsedPoint();
    if (existing) {
      placeMarker(existing, true);
    } else if (autoLocate && !readonly) {
      await openLocationPrompt();
    } else {
      await zoomToCity();
    }
    setTimeout(() => map?.invalidateSize(), 250);
  });

  $: if (map) {
    const point = parsedPoint();
    if (point) placeMarker(point, false);
  }

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

<div class="site-picker">
  <div class="site-tools">
    <form class="site-search" on:submit|preventDefault={searchPlace}>
      <input
        class="site-search-input"
        bind:value={searchText}
        placeholder="Search a place in India"
        aria-label="Search a place"
      />
      <button class="site-btn" type="submit" disabled={searching}>
        {searching ? "…" : "Search"}
      </button>
    </form>
    <button class="site-btn" type="button" on:click={showIndia}>India</button>
    {#if !readonly}
      <button class="site-btn" type="button" on:click={useMyLocation} disabled={locating}>
        {locating ? "…" : "My location"}
      </button>
    {/if}
  </div>
  {#if searchError}
    <p class="site-note site-note-error">{searchError}</p>
  {/if}
  {#if nearbyNote}
    <p class="site-note">{nearbyNote}</p>
  {/if}
  {#if searchResults.length}
    <ul class="site-results">
      {#each searchResults as hit}
        <li>
          <button type="button" on:click={() => choosePlace(hit)}>
            {hit.label || [hit.name, hit.admin1].filter(Boolean).join(", ")}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="site-map" bind:this={mapEl} role="application" aria-label="Pick installation site on the map"></div>
  {#if !readonly}
    <p class="site-note">Click the map or drag the pin. Scroll to zoom.</p>
  {/if}
  {#if permissionOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="loc-permit"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loc-permit-title"
      on:click|stopPropagation
    >
      <div class="loc-permit-card">
        <h6 id="loc-permit-title" class="loc-permit-title">Allow location</h6>
        {#if permissionDenied}
          <p class="loc-permit-copy">
            Location is blocked for this site. Allow it in the browser site settings, then try again.
            Until then the map stays on India and no pin is saved.
          </p>
        {:else}
          <p class="loc-permit-copy">
            Allow location so the pin starts at your current place. You can still move it before saving.
          </p>
        {/if}
        <div class="loc-permit-actions">
          <button type="button" class="site-btn" on:click={dismissLocationPrompt}>Not now</button>
          <button type="button" class="site-btn loc-permit-allow" on:click={requestLocation} disabled={locating}>
            {locating ? "…" : permissionDenied ? "Try again" : "Allow location"}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .site-picker {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .loc-permit {
    position: absolute;
    inset: 0;
    z-index: 30;
    background: rgba(17, 24, 39, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    padding: 1rem;
  }
  .loc-permit-card {
    width: min(22rem, 100%);
    background: #fff;
    border-radius: 0.75rem;
    padding: 1rem 1.1rem;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  }
  .loc-permit-title {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
    font-weight: 700;
    color: #111827;
  }
  .loc-permit-copy {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: #4b5563;
  }
  .loc-permit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    margin-top: 0.9rem;
  }
  .site-btn.loc-permit-allow {
    background: #e41f07;
    border-color: #e41f07;
    color: #fff;
  }
  .site-btn.loc-permit-allow:hover {
    background: #c81b06;
    color: #fff;
  }
  .site-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .site-search {
    display: flex;
    flex: 1 1 14rem;
    gap: 0.4rem;
    min-width: 0;
  }
  .site-search-input {
    flex: 1;
    min-width: 0;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 0.4rem 0.6rem;
    font-size: 0.75rem;
  }
  .site-btn {
    border: 1px solid #e5e7eb;
    background: #fff;
    border-radius: 0.5rem;
    padding: 0.4rem 0.65rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
  }
  .site-btn:hover {
    background: #f9fafb;
  }
  .site-btn:disabled {
    opacity: 0.6;
  }
  .site-results {
    list-style: none;
    margin: 0;
    padding: 0.25rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    max-height: 8rem;
    overflow: auto;
  }
  .site-results button {
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    padding: 0.35rem 0.5rem;
    font-size: 0.75rem;
    border-radius: 0.35rem;
  }
  .site-results button:hover {
    background: #eef2ff;
  }
  .site-map {
    height: 24rem;
    width: 100%;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
    z-index: 0;
    background: #dbe7f3;
  }
  .site-note {
    margin: 0;
    font-size: 0.7rem;
    color: #6b7280;
  }
  .site-note-error {
    color: #b91c1c;
  }
</style>
