<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth, canAccess } from "$lib/utils/auth";
  import { searchIndiaPlaces } from "$lib/utils/placeSearch";
  import { mapPinIcon } from "$lib/utils/mapPins";
  import Loader from "$lib/components/Loader.svelte";
  import Swal from "sweetalert2";

  let currentUser;
  let denied = false;
  let loading = false;
  let fromPlace = "";
  let toPlace = "";
  let errorText = "";
  let result = null;
  let selectedId = null;
  let mapEl;
  let map;
  let overlay;
  let locateLayer;
  let homeLayer;
  let homePin = null;
  let markersById = {};
  let fittedKey = "";
  let pinFilter = "all";
  let mapQuery = "";
  let mapHits = [];
  let mapSearchError = "";
  let mapSearching = false;
  let locating = false;
  let mapFull = false;
  let lockedRoute = null;
  let siteListEl;

  onMount(() => {
    currentUser = checkAuth();
    if (
      !["master", "admin", "manager"].includes(currentUser?.role) ||
      !canAccess("installation", "view", currentUser)
    ) {
      denied = true;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "You do not have access to the Installation module.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return;
    }
    map = L.map(mapEl, { scrollWheelZoom: true }).setView([22.5, 79], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18,
    }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    overlay = L.layerGroup().addTo(map);
    locateLayer = L.layerGroup().addTo(map);
    homeLayer = L.layerGroup().addTo(map);
    loadHome();
    const q = $page.url.searchParams;
    const qFrom = q.get("from");
    const qTo = q.get("to");
    if (qFrom) fromPlace = qFrom;
    if (qTo) toPlace = qTo;
    if (qFrom && qTo) {
      lockedRoute = {
        from: qFrom,
        to: qTo,
        fromLat: q.get("fromLat") || "",
        fromLng: q.get("fromLng") || "",
        toLat: q.get("toLat") || "",
        toLng: q.get("toLng") || "",
      };
    }
    loadTrack(Boolean(qFrom && qTo));
    window.addEventListener("keydown", onMapKey);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", onMapKey);
    if (map) map.remove();
  });

  function onMapKey(event) {
    if (event.key === "Escape" && mapFull) toggleMapFull();
  }

  function toggleMapFull() {
    mapFull = !mapFull;
    setTimeout(() => map?.invalidateSize(), 60);
  }

  async function loadHome() {
    try {
      const settings = await authApiFetch(API_ROUTES.SETTING);
      const lat = Number(settings?.homeLatitude);
      const lng = Number(settings?.homeLongitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        homePin = null;
        return;
      }
      homePin = {
        name: settings?.homeName || "Home",
        latitude: lat,
        longitude: lng,
      };
    } catch {
      homePin = null;
    }
  }

  function usePoint(which, name, lat, lng) {
    const label = String(name || "").trim() || (which === "from" ? "Start" : "End");
    const prev = lockedRoute || {
      from: fromPlace,
      to: toPlace,
      fromLat: "",
      fromLng: "",
      toLat: "",
      toLng: "",
    };
    if (which === "from") {
      fromPlace = label;
      lockedRoute = {
        ...prev,
        from: label,
        fromLat: String(lat),
        fromLng: String(lng),
      };
      return;
    }
    toPlace = label;
    lockedRoute = {
      ...prev,
      to: label,
      toLat: String(lat),
      toLng: String(lng),
    };
  }

  function endpointActions(name, lat, lng) {
    const actions = document.createElement("div");
    actions.className = "mt-1 d-flex gap-1";
    const start = document.createElement("button");
    start.type = "button";
    start.className = "btn btn-sm btn-outline-success";
    start.textContent = "Set as start";
    start.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      usePoint("from", name, lat, lng);
    });
    const end = document.createElement("button");
    end.type = "button";
    end.className = "btn btn-sm btn-outline-danger";
    end.textContent = "Set as end";
    end.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      usePoint("to", name, lat, lng);
    });
    actions.append(start, end);
    return actions;
  }

  function pinPopup(titleHtml, name, lat, lng) {
    const root = document.createElement("div");
    root.innerHTML = titleHtml;
    root.append(endpointActions(name, lat, lng));
    return root;
  }

  function drawHome() {
    if (!homeLayer) return;
    homeLayer.clearLayers();
    if (!homePin) return;
    L.marker([homePin.latitude, homePin.longitude], {
      icon: mapPinIcon("#0f766e"),
      zIndexOffset: 900,
    })
      .bindTooltip(homePin.name, { permanent: true, direction: "right" })
      .bindPopup(
        pinPopup(
          `<strong>${escapeHtml(homePin.name)}</strong>`,
          homePin.name,
          homePin.latitude,
          homePin.longitude,
        ),
      )
      .addTo(homeLayer);
  }

  function showIndia() {
    if (!map) return;
    map.setView([22.5, 79], 5);
    fittedKey = "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const NOT_STARTED = ["dispatchInProgress", "dispatched", "inTransit", "delivered"];
  const PIN_COLOR = {
    preparing: "#4f46e5",
    dispatchInProgress: "#ca8a04",
    dispatched: "#ea580c",
    inTransit: "#9333ea",
    delivered: "#0891b2",
    installationInProgress: "#2563eb",
    installed: "#d97706",
  };

  function matchesPinFilter(site) {
    if (pinFilter === "preparing") return site.status === "preparing";
    if (pinFilter === "notStarted") return NOT_STARTED.includes(site.status);
    if (pinFilter === "dispatching") return site.status === "dispatchInProgress";
    if (pinFilter === "dispatched") return site.status === "dispatched";
    if (pinFilter === "transit") return site.status === "inTransit";
    if (pinFilter === "delivered") return site.status === "delivered";
    if (pinFilter === "progress") return site.status === "installationInProgress";
    if (pinFilter === "installed") return site.status === "installed";
    if (pinFilter === "route") return !!site.onRoute;
    return true;
  }

  function sitePlace(site) {
    return [site?.city, site?.state]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  function siteOnMap(site) {
    if (!site || site.missingLocation || !sitePlace(site)) return false;
    const lat = Number(site.latitude);
    const lng = Number(site.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return lat >= 6.4 && lat <= 37.1 && lng >= 68.1 && lng <= 97.5;
  }

  function visibleSites(data) {
    return (data?.sites || []).filter((site) => siteOnMap(site) && matchesPinFilter(site));
  }

  function revealSite(id) {
    selectedId = id;
    tick().then(() => {
      siteListEl?.querySelector(`[data-site-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }

  function fitPins() {
    const points = visibleSites(result).map((site) => [site.latitude, site.longitude]);
    if (homePin) points.push([homePin.latitude, homePin.longitude]);
    if (!map || !points.length) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 8 });
  }

  function fitRoute() {
    if (!map || !result?.route?.length) return;
    const latlngs = result.route
      .filter((pair) => Array.isArray(pair) && pair.length >= 2)
      .map((pair) => [Number(pair[1]), Number(pair[0])]);
    if (latlngs.length < 2) return;
    map.fitBounds(L.latLngBounds(latlngs), { padding: [36, 36], maxZoom: 6 });
  }

  async function searchMapPlace() {
    const query = mapQuery.trim();
    mapSearchError = "";
    mapHits = [];
    if (!query) {
      mapSearchError = "Type a place name.";
      return;
    }
    mapSearching = true;
    try {
      mapHits = await searchIndiaPlaces(query);
      if (!mapHits.length) mapSearchError = "No place found in India.";
    } catch {
      mapSearchError = "Search failed. Try again.";
    } finally {
      mapSearching = false;
    }
  }

  function goToPlace(hit) {
    mapHits = [];
    mapQuery = hit.label || [hit.name, hit.admin1].filter(Boolean).join(", ");
    mapSearchError = "";
    if (map && hit.bounds) {
      map.fitBounds(hit.bounds, { padding: [24, 24], maxZoom: 12 });
    } else {
      map?.flyTo([hit.latitude, hit.longitude], 10, { duration: 0.6 });
    }
  }

  function useMyLocation() {
    mapSearchError = "";
    if (!navigator.geolocation) {
      mapSearchError = "This browser cannot read your location.";
      return;
    }
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        if (!map || !locateLayer) return;
        locateLayer.clearLayers();
        L.marker([pos.coords.latitude, pos.coords.longitude], {
          icon: mapPinIcon("#7c3aed"),
          zIndexOffset: 800,
        })
          .bindTooltip("You are here", { permanent: true, direction: "right" })
          .addTo(locateLayer);
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 10, { duration: 0.6 });
      },
      () => {
        locating = false;
        mapSearchError = "Location permission was denied.";
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function drawMap(data) {
    if (!map || !overlay) return;
    overlay.clearLayers();
    if (!data) {
      map.invalidateSize();
      return;
    }

    let routeLine = null;
    if (data.route?.length > 1) {
      const latlngs = data.route
        .filter((pair) => Array.isArray(pair) && pair.length >= 2)
        .map((pair) => [Number(pair[1]), Number(pair[0])]);
      routeLine = L.polyline(latlngs, {
        color: "#2563eb",
        weight: 4,
        opacity: 0.85,
      }).addTo(overlay);
    }

    markersById = {};
    for (const site of visibleSites(data)) {
      const marker = L.marker([site.latitude, site.longitude], {
        icon: mapPinIcon(PIN_COLOR[site.status] || "#64748b", !!site.isNext),
        zIndexOffset: site.isNext ? 600 : 400,
      });
      const place = sitePlace(site);
      const link =
        site.status === "preparing" && site.workOrderRecordId
          ? `<br/><a href="/admin/workorder/${site.workOrderRecordId}">Open work order</a>`
          : site.orderId
            ? `<br/><a href="/admin/order/${site.orderId}/dispatch">Open job</a>`
            : "";
      marker.bindPopup(
        pinPopup(
          `<strong>${escapeHtml(site.workOrder)}</strong><br/>${escapeHtml(place)}<br/>${escapeHtml(site.statusLabel)}${site.isNext ? "<br/>Next stop" : ""}${site.onRoute ? `<br/>${site.alongKm} km along route` : ""}${link}`,
          place || site.workOrder,
          site.latitude,
          site.longitude,
        ),
      );
      marker.on("click", () => revealSite(site.id));
      marker.addTo(overlay);
      markersById[site.id] = marker;
    }

    if (data.from?.lat != null) {
      L.marker([data.from.lat, data.from.lng], {
        icon: mapPinIcon("#059669"),
        zIndexOffset: 700,
      })
        .bindTooltip(data.from.query, { permanent: true, direction: "right" })
        .addTo(overlay);
    }
    if (data.to?.lat != null) {
      L.marker([data.to.lat, data.to.lng], {
        icon: mapPinIcon("#dc2626"),
        zIndexOffset: 700,
      })
        .bindTooltip(data.to.query, { permanent: true, direction: "right" })
        .addTo(overlay);
    }

    const routeKey = data.route?.length
      ? `${data.from?.query || ""}>${data.to?.query || ""}`
      : "";
    if (routeLine && routeKey !== fittedKey) {
      map.fitBounds(routeLine.getBounds(), { padding: [36, 36], maxZoom: 6 });
      fittedKey = routeKey;
    }
    map.invalidateSize();
  }

  function focusSite(id) {
    selectedId = id;
    const marker = markersById[id];
    if (map && marker) {
      marker.openPopup();
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 8), { duration: 0.5 });
    }
  }

  $: drawMap(result, pinFilter);
  $: if (homeLayer) drawHome(homePin);
  $: tableSites = (result?.sites || []).filter((site) => matchesPinFilter(site));

  function formatWhen(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function loadTrack(withRoute) {
    const from = fromPlace.trim();
    const to = toPlace.trim();
    if (withRoute && (!from || !to)) {
      errorText = "Enter a start and an end.";
      return;
    }
    loading = true;
    errorText = "";
    try {
      const params = withRoute ? { from, to } : {};
      if (withRoute && lockedRoute) {
        if (lockedRoute.from === from && lockedRoute.fromLat && lockedRoute.fromLng) {
          params.fromLat = lockedRoute.fromLat;
          params.fromLng = lockedRoute.fromLng;
        }
        if (lockedRoute.to === to && lockedRoute.toLat && lockedRoute.toLng) {
          params.toLat = lockedRoute.toLat;
          params.toLng = lockedRoute.toLng;
        }
      }
      const resp = await authApiFetch(API_ROUTES.DISPATCH_ROUTE, {
        method: "GET",
        params,
        timeout: 60000,
      });
      result = resp?.data ?? null;
      selectedId = result?.next?.id ?? result?.sites?.[0]?.id ?? null;
    } catch (err) {
      if (withRoute) {
        errorText = err?.message || err?.data?.message || "Could not load the route.";
      } else {
        result = null;
        errorText = err?.message || err?.data?.message || "Could not load installations.";
      }
    } finally {
      loading = false;
    }
  }

  function clearRoute() {
    if (pinFilter === "route") pinFilter = "all";
    fittedKey = "";
    if ($page.url.search) {
      goto($page.url.pathname, { replaceState: true, noScroll: true, keepFocus: true });
    }
    loadTrack(false);
  }

</script>

{#if loading && !result}<Loader />{/if}

<div class="page-wrapper">
  <div class="content pb-0">
    <div class="mb-4">
      <div class="flex items-center gap-2 mb-1">
        <h4 class="mb-0">Installation track</h4>
        <span class="badge bg-soft-primary text-primary">Master</span>
      </div>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item active" aria-current="page">Installation track</li>
        </ol>
      </nav>
      <p class="text-muted mb-0 mt-2 text-sm" style="max-width: 46rem;">
        Jobs from dispatch through installed are listed. Filter by status, then choose a start and end to draw the path and return time.
      </p>
    </div>

    {#if !denied}
      <div class="card border-0 shadow-sm rounded-3 mb-3">
        <div class="card-body">
          <form
            class="d-flex flex-wrap gap-2 align-items-end"
            on:submit|preventDefault={() => loadTrack(true)}
          >
            <div>
              <label class="form-label text-xs mb-1" for="track-from">From</label>
              <input
                id="track-from"
                class="form-control form-control-sm"
                style="min-width: 12rem;"
                bind:value={fromPlace}
                placeholder="Start place"
              />
            </div>
            <div>
              <label class="form-label text-xs mb-1" for="track-to">To</label>
              <input
                id="track-to"
                class="form-control form-control-sm"
                style="min-width: 12rem;"
                bind:value={toPlace}
                placeholder="End place"
              />
            </div>
            <button class="btn btn-sm btn-primary" type="submit" disabled={loading}>
              {loading ? "Loading…" : "Show route"}
            </button>
            <button
              class="btn btn-sm btn-outline-secondary"
              type="button"
              on:click={clearRoute}
              disabled={loading || !result?.route?.length}
            >
              Clear route
            </button>
          </form>
          {#if errorText}
            <p class="text-danger text-sm mb-0 mt-3">{errorText}</p>
          {/if}
        </div>
      </div>

      <div class="row g-3 mb-3 track-row">
        <div class="col-lg-8">
      <div class="card border-0 shadow-sm rounded-3 overflow-hidden map-shell h-100" class:map-full={mapFull}>
        <div class="card-body p-2">
          <div class="d-flex flex-wrap gap-2 px-2 pt-2 pb-2 align-items-center">
            <form class="d-flex gap-2 flex-grow-1" style="min-width: 16rem;" on:submit|preventDefault={searchMapPlace}>
              <input
                class="form-control form-control-sm"
                bind:value={mapQuery}
                placeholder="Search a place in India"
                aria-label="Search the map"
              />
              <button class="btn btn-sm btn-outline-primary" type="submit" disabled={mapSearching}>
                {mapSearching ? "…" : "Search"}
              </button>
            </form>
            <button type="button" class="btn btn-sm btn-outline-secondary" on:click={useMyLocation} disabled={locating}>
              {locating ? "…" : "My location"}
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" on:click={fitPins}>Fit pins</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" on:click={fitRoute} disabled={!result?.route?.length}>
              Fit route
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" on:click={showIndia}>Show India</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" on:click={toggleMapFull}>
              {mapFull ? "Exit full view" : "Full view"}
            </button>
          </div>
          {#if mapSearchError}
            <p class="text-danger text-xs px-2 mb-2">{mapSearchError}</p>
          {/if}
          {#if mapHits.length}
            <div class="d-flex flex-wrap gap-2 px-2 pb-2">
              {#each mapHits as hit}
                <button type="button" class="btn btn-sm btn-light border" on:click={() => goToPlace(hit)}>
                  {hit.label || [hit.name, hit.admin1].filter(Boolean).join(", ")}
                </button>
              {/each}
            </div>
          {/if}
          <div class="india-map" bind:this={mapEl} role="img" aria-label="India installation map"></div>
          <div class="d-flex flex-wrap gap-2 px-2 py-2 text-xs text-muted align-items-center">
            <button type="button" class="btn btn-sm {pinFilter === 'all' ? 'btn-dark' : 'btn-outline-secondary'}" on:click={() => (pinFilter = "all")}>All</button>
            <button type="button" class="btn btn-sm {pinFilter === 'preparing' ? 'btn-primary' : 'btn-outline-secondary'}" on:click={() => (pinFilter = "preparing")}>
              <i class="legend preparing"></i> Preparing
            </button>
            <button type="button" class="btn btn-sm {pinFilter === 'notStarted' ? 'btn-secondary' : 'btn-outline-secondary'}" on:click={() => (pinFilter = "notStarted")}>
              <i class="legend not-started"></i> Not started
            </button>
            <button type="button" class="btn btn-sm {pinFilter === 'dispatching' ? 'btn-warning' : 'btn-outline-secondary'}" on:click={() => (pinFilter = "dispatching")}>
              <i class="legend dispatching"></i> Dispatching
            </button>
            <button type="button" class="btn btn-sm {pinFilter === 'dispatched' ? 'btn-warning' : 'btn-outline-secondary'}" on:click={() => (pinFilter = "dispatched")}>
              <i class="legend dispatched"></i> Dispatched
            </button>
            <button type="button" class="btn btn-sm {pinFilter === 'transit' ? 'btn-primary' : 'btn-outline-secondary'}" on:click={() => (pinFilter = "transit")}>
              <i class="legend transit"></i> In transit
            </button>
            <button type="button" class="btn btn-sm {pinFilter === 'delivered' ? 'btn-info' : 'btn-outline-secondary'}" on:click={() => (pinFilter = "delivered")}>
              <i class="legend delivered"></i> Delivered
            </button>
            <button type="button" class="btn btn-sm {pinFilter === 'progress' ? 'btn-primary' : 'btn-outline-secondary'}" on:click={() => (pinFilter = "progress")}>
              <i class="legend in-progress"></i> In progress
            </button>
            <button type="button" class="btn btn-sm {pinFilter === 'installed' ? 'btn-warning' : 'btn-outline-secondary'}" on:click={() => (pinFilter = "installed")}>
              <i class="legend installed"></i> Installed
            </button>
            <button type="button" class="btn btn-sm {pinFilter === 'route' ? 'btn-primary' : 'btn-outline-secondary'}" on:click={() => (pinFilter = "route")}>On route</button>
            <span class="ms-1"><i class="legend start"></i> Start</span>
            <span><i class="legend end"></i> End</span>
            <span><i class="legend home"></i> Home</span>
          </div>
        </div>
      </div>
        </div>
        <div class="col-lg-4 d-flex">
          <div class="card border-0 shadow-sm rounded-3 overflow-hidden site-list-card w-100 d-flex flex-column">
            <div class="card-header bg-white border-bottom py-3">
              <h6 class="mb-1">Sites ({tableSites.length})</h6>
              <div class="site-stats">
                <div>
                  <span>Return time</span>
                  <strong>{result?.returnTimeLabel || "—"}</strong>
                </div>
                <div>
                  <span>Next</span>
                  <strong>{result?.next?.workOrder || "—"}</strong>
                </div>
                <div>
                  <span>On route</span>
                  <strong>{result?.route?.length ? result.onRouteCount || 0 : "—"}</strong>
                </div>
              </div>
            </div>
            <div class="table-responsive site-list-scroll" bind:this={siteListEl}>
              <table class="table table-hover mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Work order</th>
                    <th>Place</th>
                    <th>Status</th>
                    <th>Along route</th>
                    <th>Installed</th>
                  </tr>
                </thead>
                <tbody>
                  {#if !result}
                    <tr>
                      <td colspan="5" class="text-muted text-center py-4">
                        {loading ? "Loading sites…" : "No sites yet."}
                      </td>
                    </tr>
                  {:else if !tableSites.length}
                    <tr>
                      <td colspan="5" class="text-muted text-center py-4">
                        No jobs match this filter.
                      </td>
                    </tr>
                  {:else}
                    {#each tableSites as site (site.id)}
                      <tr
                        data-site-id={site.id}
                        class:table-active={selectedId === site.id}
                        on:click={() => focusSite(site.id)}
                      >
                        <td>
                          {#if site.status === "preparing" && site.workOrderRecordId}
                            <a href="/admin/workorder/{site.workOrderRecordId}">{site.workOrder}</a>
                          {:else if site.orderId}
                            <a href="/admin/order/{site.orderId}/dispatch">{site.workOrder}</a>
                          {:else}
                            {site.workOrder}
                          {/if}
                          {#if site.isNext}
                            <span class="badge bg-warning text-dark ms-1">Next</span>
                          {:else if site.onRoute}
                            <span class="badge bg-primary ms-1">On route</span>
                          {/if}
                        </td>
                        <td>
                          {#if sitePlace(site)}
                            {sitePlace(site)}
                          {:else}
                            <span class="text-danger">Missing location</span>
                          {/if}
                        </td>
                        <td>
                          <i class="legend" style="background: {PIN_COLOR[site.status] || '#64748b'}"></i>
                          {site.statusLabel}
                        </td>
                        <td>{site.onRoute ? `${site.alongKm} km` : "—"}</td>
                        <td>
                          {site.status === "installed"
                            ? `${formatWhen(site.installedAt)}${site.installedDays != null ? ` (${site.installedDays}d)` : ""}`
                            : "—"}
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    {/if}

  </div>
</div>

<style>
  .india-map {
    height: 32rem;
    width: 100%;
    border-radius: 0.5rem;
    z-index: 0;
    background: #e8eef4;
  }
  .map-shell.map-full {
    position: fixed;
    inset: 0;
    z-index: 2000;
    margin: 0;
    border-radius: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
  }
  .map-shell.map-full :global(.card-body) {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .map-shell.map-full .india-map {
    flex: 1;
    height: auto;
    min-height: 0;
    border-radius: 0;
  }
  .site-list-card {
    min-height: 0;
    height: 100%;
  }
  .site-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
  }
  .site-stats span {
    display: block;
    color: #6b7280;
    font-size: 0.65rem;
  }
  .site-stats strong {
    display: block;
    font-size: 0.75rem;
    word-break: break-word;
  }
  .site-list-scroll tr {
    cursor: pointer;
  }
  .site-list-scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: 44rem;
    overflow: auto;
  }
  .site-list-scroll :global(thead th) {
    position: sticky;
    top: 0;
    background: #fff;
    z-index: 1;
  }
  .legend {
    display: inline-block;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    margin-right: 0.25rem;
    vertical-align: middle;
  }
  .legend.preparing {
    background: #4f46e5;
  }
  .legend.not-started {
    background: #64748b;
  }
  .legend.dispatching {
    background: #ca8a04;
  }
  .legend.dispatched {
    background: #ea580c;
  }
  .legend.transit {
    background: #9333ea;
  }
  .legend.delivered {
    background: #0891b2;
  }
  .legend.in-progress {
    background: #2563eb;
  }
  .legend.installed {
    background: #d97706;
  }
  .legend.start {
    background: #059669;
    border-radius: 2px;
  }
  .legend.end {
    background: #dc2626;
    border-radius: 2px;
  }
  .legend.home {
    background: #0f766e;
    border-radius: 2px;
  }
</style>
