<script>
  import { onDestroy, onMount } from "svelte";
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";
  import { searchIndiaPlaces } from "$lib/utils/placeSearch";
  import { mapPinIcon } from "$lib/utils/mapPins";

  export let latitude = "";
  export let longitude = "";
  export let city = "";
  export let state = "";
  export let searchHint = "";
  export let readonly = false;

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
  let searching = false;
  let locating = false;

  function parsedPoint() {
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

  async function searchPlace() {
    const query = searchText.trim();
    searchError = "";
    searchResults = [];
    if (!query) {
      searchError = "Type a place name.";
      return;
    }
    searching = true;
    try {
      searchResults = await searchIndiaPlaces(query);
      if (!searchResults.length) searchError = "No place found in India.";
    } catch {
      searchError = "Search failed. Try again.";
    } finally {
      searching = false;
    }
  }

  function choosePlace(hit) {
    searchResults = [];
    searchText = hit.label || [hit.name, hit.admin1].filter(Boolean).join(", ");
    searchError = "";
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

  function useMyLocation() {
    searchError = "";
    if (!navigator.geolocation) {
      searchError = "This browser cannot read your location.";
      return;
    }
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        setPoint(pos.coords.latitude, pos.coords.longitude, true);
      },
      () => {
        locating = false;
        searchError = "Location permission was denied.";
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
    } else if (String(city || "").trim()) {
      try {
        const hits = await searchIndiaPlaces(String(city).split(",")[0].trim());
        const hit = hits[0];
        if (hit && map) {
          if (hit.bounds) map.fitBounds(hit.bounds, { padding: [24, 24], maxZoom: 12 });
          else map.setView([hit.latitude, hit.longitude], 12);
        }
      } catch {
        /* keep the India view */
      }
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
</div>

<style>
  .site-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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
