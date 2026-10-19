<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";
  import clusterSrc from "leaflet.markercluster/dist/leaflet.markercluster-src.js?raw";
  import { authApiFetch } from "$lib/api/client";
  import { API_ROUTES } from "$lib/constants/apiRoutes";
  import { checkAuth, canAccess } from "$lib/utils/auth";
  import { searchIndiaPlaces } from "$lib/utils/placeSearch";
  import { mapPinIcon, mapHeadIcon } from "$lib/utils/mapPins";
  import Loader from "$lib/components/Loader.svelte";
  import InstallTrackQuickView from "$lib/components/InstallTrackQuickView.svelte";
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
  let clusterLayer;
  let tileLayers = [];
  let basemap = "light";
  let locateLayer;
  let homeLayer;
  let headLayer;
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
  let toolsOpen = false;
  let statusMenuOpen = false;
  let listQuery = "";
  let fromHits = [];
  let toHits = [];
  let fromTimer;
  let toTimer;
  let fromSeq = 0;
  let toSeq = 0;
  let lockedRoute = null;
  let siteListEl;
  let detailSite = null;
  let detailRoot = null;
  let headTimer;
  let headsRefreshing = false;
  let helpOpen = false;
  const WO_LABEL_MIN_ZOOM = 7;
  const HEAD_ONLINE_MS = 3 * 60 * 60 * 1000;

  const ESRI = "Tiles &copy; Esri";
  const BASEMAPS = {
    light: {
      maxNativeZoom: 16,
      layers: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      ],
    },
    streets: {
      maxNativeZoom: 19,
      layers: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      ],
    },
    satellite: {
      maxNativeZoom: 19,
      layers: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
    },
  };

  onMount(() => {
    currentUser = checkAuth();
    if (
      !["master", "admin", "manager"].includes(currentUser?.role) ||
      !canAccess("installation_track", "view", currentUser)
    ) {
      denied = true;
      Swal.fire({
        icon: "warning",
        title: "Access Denied",
        text: "You do not have access to Installation track.",
        confirmButtonText: "Go Back",
      }).then(() => window.history.back());
      return;
    }
    if (!mapEl) return;
    try {
      const saved = localStorage.getItem("install-track-basemap");
      if (saved && BASEMAPS[saved]) basemap = saved;
    } catch {
      // ignore
    }
    ensureClusterPlugin();
    mountMap();
  });

  function ensureClusterPlugin() {
    if (typeof L.markerClusterGroup === "function") return;
    new Function("L", clusterSrc)(L);
  }

  function mountMap() {
    map = L.map(mapEl, { scrollWheelZoom: true }).setView([22.5, 79], 5);
    setBasemap("light");
    L.control.scale({ imperial: false }).addTo(map);
    overlay = L.layerGroup().addTo(map);
    clusterLayer = createClusterLayer().addTo(map);
    locateLayer = L.layerGroup().addTo(map);
    homeLayer = L.layerGroup().addTo(map);
    headLayer = L.layerGroup().addTo(map);
    tick().then(() => map?.invalidateSize());
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
    headTimer = setInterval(refreshHeads, 2 * 60 * 1000);
    map.on("zoomend", syncWoLabelMode);
    detailRoot = mapEl;
    detailRoot.addEventListener("click", onDetailClick);
    window.addEventListener("keydown", onMapKey);
    window.addEventListener("pointerdown", onDocPointer);
    window.addEventListener("resize", onMapResize);
  }

  function syncWoLabelMode() {
    if (!map) return;
    const permanent = map.getZoom() >= WO_LABEL_MIN_ZOOM;
    Object.values(markersById).forEach((marker) => {
      const tip = marker.getTooltip?.();
      if (!tip) return;
      const el = tip.getElement?.();
      if (el) el.style.display = permanent ? "" : "none";
    });
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatKm(km) {
    if (!Number.isFinite(km)) return "";
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  }

  function headForSite(site) {
    if (!site) return null;
    const wo = String(site.workOrder || "");
    return (result?.heads || []).find((h) => String(h.workOrder) === wo) || null;
  }

  function isHeadOnline(head) {
    if (!head?.lastSeenAt) return false;
    const t = new Date(head.lastSeenAt).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() - t <= HEAD_ONLINE_MS;
  }

  function headDistanceKm(site, head) {
    if (!site || !head) return null;
    const sLat = Number(site.latitude);
    const sLng = Number(site.longitude);
    const hLat = Number(head.latitude);
    const hLng = Number(head.longitude);
    if (![sLat, sLng, hLat, hLng].every(Number.isFinite)) return null;
    return haversineKm(sLat, sLng, hLat, hLng);
  }

  function siteActivityLine(site) {
    const head = headForSite(site);
    if (head && isHeadOnline(head)) {
      const ago = seenAgo(head.lastSeenAt);
      const dist = headDistanceKm(site, head);
      return [
        `Head online${ago ? ` · ${ago}` : ""}`,
        dist != null ? `${formatKm(dist)} from site` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (head?.lastSeenAt) {
      return `Head last seen ${seenAgo(head.lastSeenAt)} (may be outdated)`;
    }
    if (site.lastVisitAt) {
      return [
        site.lastVisitStatus || "Update",
        seenAgo(site.lastVisitAt) || "",
        site.lastVisitRemark || "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (site.hasHead) return "Head assigned — no location yet";
    return "";
  }

  function setBasemap(id) {
    const spec = BASEMAPS[id];
    if (!map || !spec) return;
    basemap = id;
    try {
      localStorage.setItem("install-track-basemap", id);
    } catch {
      // ignore
    }
    tileLayers.forEach((layer) => map.removeLayer(layer));
    tileLayers = spec.layers.map((url) =>
      L.tileLayer(url, {
        attribution: ESRI,
        maxZoom: 19,
        maxNativeZoom: spec.maxNativeZoom,
      }).addTo(map),
    );
  }

  function chooseBasemap(id) {
    setBasemap(id);
    toolsOpen = false;
  }

  function createClusterLayer() {
    if (typeof L.markerClusterGroup !== "function") return L.layerGroup();
    return L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 9,
      zoomToBoundsOnClick: true,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
          className: "track-cluster",
          html: `<span>${count}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
      },
    });
  }

  onDestroy(() => {
    detailRoot?.removeEventListener("click", onDetailClick);
    window.removeEventListener("keydown", onMapKey);
    window.removeEventListener("pointerdown", onDocPointer);
    window.removeEventListener("resize", onMapResize);
    clearTimeout(fromTimer);
    clearTimeout(toTimer);
    clearInterval(headTimer);
    document.body.classList.remove("track-map-full");
    if (map) map.remove();
  });

  function onMapResize() {
    map?.invalidateSize();
  }

  function onDocPointer(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (toolsOpen && !target.closest(".map-tools")) toolsOpen = false;
    if (statusMenuOpen && !target.closest(".status-more")) statusMenuOpen = false;
    if (fromHits.length && !target.closest(".field-from")) fromHits = [];
    if (toHits.length && !target.closest(".field-to")) toHits = [];
  }

  function onMapKey(event) {
    if (event.key !== "Escape") return;
    if (detailSite) {
      detailSite = null;
      return;
    }
    if (mapFull) toggleMapFull();
  }

  function openDetail(site) {
    detailSite = site;
    map?.closePopup();
  }

  function onDetailClick(event) {
    const trigger = event.target?.closest?.("[data-track-detail]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const id = trigger.getAttribute("data-track-detail");
    const site = (result?.sites || []).find((row) => String(row.id) === String(id));
    if (site) openDetail(site);
  }

  function toggleMapFull() {
    mapFull = !mapFull;
    document.body.classList.toggle("track-map-full", mapFull);
    setTimeout(() => map?.invalidateSize(), 120);
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
      icon: mapPinIcon("#0f766e", false, 18),
      zIndexOffset: 900,
    })
      .bindTooltip(homePin.name, { direction: "right" })
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

  function seenAgo(val) {
    if (!val) return "";
    const t = new Date(val).getTime();
    if (Number.isNaN(t)) return "";
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 36) return `${hours}h ago`;
    return formatWhen(val);
  }

  function drawHeads(heads) {
    if (!headLayer) return;
    headLayer.clearLayers();
    const sites = result?.sites || [];
    for (const head of heads || []) {
      const lat = Number(head.latitude);
      const lng = Number(head.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const ago = seenAgo(head.lastSeenAt);
      const stale = !isHeadOnline(head);
      const site = sites.find((s) => String(s.workOrder) === String(head.workOrder));
      const dist = site ? headDistanceKm(site, head) : null;
      const distText = dist != null ? `${formatKm(dist)} from site` : "";
      const label = [
        head.name || "Head",
        head.workOrder,
        ago,
        stale ? "outdated" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      L.marker([lat, lng], {
        icon: mapHeadIcon(stale ? "#64748b" : "#7c3aed", 20),
        zIndexOffset: 850,
      })
        .bindTooltip(escapeHtml(label), {
          permanent: true,
          direction: "right",
          opacity: 0.95,
          className: "track-wo-tip",
        })
        .bindPopup(
          `<strong>${escapeHtml(head.name || "Head")}</strong><br/>${escapeHtml(head.workOrder)}<br/>Last seen ${escapeHtml(ago || "—")}${stale ? " <em>(may be outdated)</em>" : ""}${distText ? `<br/>${escapeHtml(distText)}` : ""}`,
        )
        .addTo(headLayer);
    }
  }

  async function refreshHeads() {
    if (!result || headsRefreshing) return;
    headsRefreshing = true;
    try {
      const resp = await authApiFetch(API_ROUTES.DISPATCH_HEADS, { method: "GET" });
      const heads = Array.isArray(resp?.data) ? resp.data : [];
      result = { ...result, heads };
    } catch {
      // keep the last pins
    } finally {
      headsRefreshing = false;
    }
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

  const PIN_COLOR = {
    woInProgress: "#4f46e5",
    woCompleted: "#16a34a",
    dispatchInProgress: "#ca8a04",
    dispatched: "#ea580c",
    inTransit: "#9333ea",
    delivered: "#0891b2",
    installationInProgress: "#2563eb",
    installed: "#be123c",
  };

  const STATUS_FILTERS = [
    { id: "all", label: "All" },
    { id: "woInProgress", label: "WO in progress", color: PIN_COLOR.woInProgress },
    { id: "woCompleted", label: "WO completed", color: PIN_COLOR.woCompleted },
    { id: "dispatching", label: "Dispatching", color: PIN_COLOR.dispatchInProgress },
    { id: "dispatched", label: "Dispatched", color: PIN_COLOR.dispatched },
    { id: "transit", label: "In transit", color: PIN_COLOR.inTransit },
    { id: "delivered", label: "Delivered", color: PIN_COLOR.delivered },
    { id: "progress", label: "In progress", color: PIN_COLOR.installationInProgress },
    { id: "installed", label: "Installed", color: PIN_COLOR.installed },
    { id: "route", label: "On route", color: "#1d4ed8" },
    { id: "headOnline", label: "Head online", color: "#7c3aed" },
    { id: "hasHead", label: "Has Head", color: "#7c3aed" },
    { id: "missingLocation", label: "Missing location", color: "#dc2626" },
  ];

  const STATUS_HINTS = {
    woInProgress: "Work order open, not yet dispatched",
    woCompleted: "Work order finished",
    dispatching: "Dispatch being prepared",
    dispatched: "Left workshop",
    transit: "On the way to site",
    delivered: "Reached site, install not started",
    progress: "Installation started on site",
    installed: "Installation finished",
    route: "Along the From–To corridor",
    headOnline: "Head GPS seen in the last 3 hours",
    hasHead: "A Head is assigned on the job",
    missingLocation: "City/state pin could not be placed",
  };

  function siteMatches(site, filter) {
    if (filter === "woInProgress") return site.status === "woInProgress";
    if (filter === "woCompleted") return site.status === "woCompleted";
    if (filter === "dispatching") return site.status === "dispatchInProgress";
    if (filter === "dispatched") return site.status === "dispatched";
    if (filter === "transit") return site.status === "inTransit";
    if (filter === "delivered") return site.status === "delivered";
    if (filter === "progress") return site.status === "installationInProgress";
    if (filter === "installed") return site.status === "installed";
    if (filter === "route") return !!site.onRoute;
    if (filter === "hasHead") return !!site.hasHead;
    if (filter === "missingLocation") return !!site.missingLocation;
    if (filter === "headOnline") {
      const head = headForSite(site);
      return !!head && isHeadOnline(head);
    }
    return true;
  }

  function siteMatchesList(site) {
    if (!listNeedle) return true;
    return [site.workOrder, sitePlace(site), site.statusLabel]
      .join(" ")
      .toLowerCase()
      .includes(listNeedle);
  }

  function matchesPinFilter(site) {
    return siteMatches(site, pinFilter);
  }

  function filterCount(id) {
    const sites = result?.sites || [];
    if (id === "all") return sites.length;
    return sites.filter((site) => siteMatches(site, id)).length;
  }

  const FREQUENT_STATUS_IDS = ["woInProgress", "progress"];

  function pickVisibleStatuses(activeId) {
    const all = STATUS_FILTERS.find((filter) => filter.id === "all");
    const rest = STATUS_FILTERS.filter(
      (filter) => filter.id !== "all" && !["headOnline", "hasHead", "missingLocation"].includes(filter.id),
    );
    const extras = STATUS_FILTERS.filter((filter) =>
      ["headOnline", "hasHead", "missingLocation"].includes(filter.id),
    );
    const visible = FREQUENT_STATUS_IDS.map((id) => rest.find((filter) => filter.id === id)).filter(
      Boolean,
    );
    if (activeId !== "all" && !visible.some((filter) => filter.id === activeId)) {
      const active =
        rest.find((filter) => filter.id === activeId) ||
        extras.find((filter) => filter.id === activeId);
      if (active) visible.push(active);
    }
    return [all, ...visible].filter(Boolean);
  }

  function chooseStatus(id) {
    pinFilter = id;
    statusMenuOpen = false;
  }

  function schedulePlaceSearch(which) {
    const query = (which === "from" ? fromPlace : toPlace).trim();
    clearTimeout(which === "from" ? fromTimer : toTimer);
    if (query.length < 2) {
      if (which === "from") fromHits = [];
      else toHits = [];
      return;
    }
    const timer = setTimeout(() => lookupEndpoint(which, query), 280);
    if (which === "from") fromTimer = timer;
    else toTimer = timer;
  }

  async function lookupEndpoint(which, query) {
    const seq = which === "from" ? ++fromSeq : ++toSeq;
    try {
      const hits = await searchIndiaPlaces(query);
      if (which === "from") {
        if (seq !== fromSeq) return;
        fromHits = hits;
      } else if (seq === toSeq) {
        toHits = hits;
      }
    } catch {
      if (which === "from" && seq === fromSeq) fromHits = [];
      if (which === "to" && seq === toSeq) toHits = [];
    }
  }

  function pickEndpoint(which, hit) {
    const label = [hit.name, hit.admin1].filter(Boolean).join(", ") || hit.label;
    usePoint(which, label, hit.latitude, hit.longitude);
    if (which === "from") fromHits = [];
    else toHits = [];
  }

  function runMapTool(action) {
    toolsOpen = false;
    action();
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
    return (data?.sites || []).filter(
      (site) => siteOnMap(site) && matchesPinFilter(site) && siteMatchesList(site),
    );
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
          icon: mapPinIcon("#7c3aed", false, 18),
          zIndexOffset: 800,
        })
          .bindTooltip("You are here", { direction: "top" })
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
    if (!map || !overlay || !clusterLayer) return;
    overlay.clearLayers();
    clusterLayer.clearLayers();
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
    const siteMarkers = [];
    for (const site of visibleSites(data)) {
      const marker = L.marker([site.latitude, site.longitude], {
        icon: mapPinIcon(PIN_COLOR[site.status] || "#64748b", !!site.isNext, site.isNext ? 22 : 18),
        zIndexOffset: site.isNext ? 600 : 400,
      });
      const place = sitePlace(site);
      const head = headForSite(site);
      const dist = head ? headDistanceKm(site, head) : null;
      const headLine = head
        ? `Head ${isHeadOnline(head) ? "online" : "last seen"} ${seenAgo(head.lastSeenAt) || ""}${dist != null ? ` · ${formatKm(dist)} away` : ""}`
        : site.hasHead
          ? "Head assigned — no GPS yet"
          : "";
      marker.bindTooltip(escapeHtml(site.workOrder || ""), {
        permanent: true,
        direction: "right",
        opacity: 0.95,
        className: "track-wo-tip",
      });
      marker.bindPopup(
        pinPopup(
          `<strong>${escapeHtml(site.workOrder)}</strong><br/>${escapeHtml(place)}<br/>${escapeHtml(site.statusLabel)}${site.isNext ? "<br/>Next stop" : ""}${site.onRoute ? `<br/>${site.alongKm} km along route` : ""}${headLine ? `<br/>${escapeHtml(headLine)}` : ""}<br/><button type="button" class="track-detail-open" data-track-detail="${escapeHtml(site.id)}">View details</button>`,
          place || site.workOrder,
          site.latitude,
          site.longitude,
        ),
      );
      marker.on("click", () => revealSite(site.id));
      siteMarkers.push(marker);
      markersById[site.id] = marker;
    }
    if (typeof clusterLayer.addLayers === "function") clusterLayer.addLayers(siteMarkers);
    else siteMarkers.forEach((marker) => marker.addTo(clusterLayer));
    syncWoLabelMode();

    if (data.from?.lat != null) {
      L.marker([data.from.lat, data.from.lng], {
        icon: mapPinIcon("#059669", false, 18),
        zIndexOffset: 700,
      })
        .bindTooltip(data.from.query, { permanent: true, direction: "right" })
        .addTo(overlay);
    }
    if (data.to?.lat != null) {
      L.marker([data.to.lat, data.to.lng], {
        icon: mapPinIcon("#dc2626", false, 18),
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
    if (!map || !marker) return;
    const open = () => {
      const zoom = Math.max(map.getZoom(), 8);
      if (map.getZoom() < zoom) {
        map.once("moveend", () => marker.openPopup());
        map.flyTo(marker.getLatLng(), zoom, { duration: 0.5 });
        return;
      }
      marker.openPopup();
    };
    if (typeof clusterLayer?.zoomToShowLayer === "function") clusterLayer.zoomToShowLayer(marker, open);
    else open();
  }

  $: listNeedle = listQuery.trim().toLowerCase();
  $: drawMap(result, pinFilter, listNeedle, result?.heads);
  $: if (homeLayer) drawHome(homePin);
  $: if (headLayer) drawHeads(result?.heads);
  $: hasRoute = !!result?.route?.length;
  $: liveHeadCount = (result?.heads || []).filter((h) => isHeadOnline(h)).length;
  $: headPinCount = (result?.heads || []).length;
  $: recentActivity = result?.activity || [];
  $: statusFiltered = (result?.sites || []).filter((site) => matchesPinFilter(site));
  $: tableSites = statusFiltered.filter((site) => siteMatchesList(site));
  $: visibleStatusFilters = pickVisibleStatuses(pinFilter);
  $: overflowStatusFilters = STATUS_FILTERS.filter((filter) => {
    if (visibleStatusFilters.some((shown) => shown.id === filter.id)) return false;
    if (filter.id === pinFilter) return true;
    return filterCount(filter.id) > 0;
  });
  $: detailHead = detailSite ? headForSite(detailSite) : null;

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
    fromHits = [];
    toHits = [];
    toolsOpen = false;
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

<div class="page-wrapper track-shell">
  <div class="content track-page">
    <header class="track-head">
      <h4>Installation track</h4>
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 p-0">
          <li class="breadcrumb-item"><a href="/admin/dashboard">Home</a></li>
          <li class="breadcrumb-item active" aria-current="page">Installation track</li>
        </ol>
      </nav>
      <p class="lede">
        Dispatch through installed, on one map.
        <button type="button" class="help-link" on:click={() => (helpOpen = !helpOpen)}>
          {helpOpen ? "Hide tips" : "How this map works"}
        </button>
      </p>
      {#if helpOpen}
        <ul class="help-list">
          <li><strong>Teardrop pins</strong> are job sites. The round purple pin is the Head (person GPS).</li>
          <li><strong>Refresh heads</strong> pulls the latest phone locations without reloading the whole map.</li>
          <li>A daily update is a site note. It is not the same as live Head GPS (unless the update includes location).</li>
          <li>If no Head pin appears: phone location off, outside India, or the app was in the background.</li>
        </ul>
      {/if}
    </header>

    {#if !denied}
      <div class="track-row" class:track-full={mapFull}>
        <section class="map-shell">
          <div class="command-bar">
            <form class="route-fields" on:submit|preventDefault={() => loadTrack(true)}>
              <label class="field field-from">
                <span>From</span>
                <input
                  id="track-from"
                  class="form-control form-control-sm"
                  bind:value={fromPlace}
                  placeholder="Start place"
                  autocomplete="off"
                  on:input={() => schedulePlaceSearch("from")}
                />
                {#if fromHits.length}
                  <ul class="suggest">
                    {#each fromHits as hit}
                      <li>
                        <button type="button" on:click={() => pickEndpoint("from", hit)}>
                          {hit.label || [hit.name, hit.admin1].filter(Boolean).join(", ")}
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </label>
              <label class="field field-to">
                <span>To</span>
                <input
                  id="track-to"
                  class="form-control form-control-sm"
                  bind:value={toPlace}
                  placeholder="End place"
                  autocomplete="off"
                  on:input={() => schedulePlaceSearch("to")}
                />
                {#if toHits.length}
                  <ul class="suggest">
                    {#each toHits as hit}
                      <li>
                        <button type="button" on:click={() => pickEndpoint("to", hit)}>
                          {hit.label || [hit.name, hit.admin1].filter(Boolean).join(", ")}
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </label>
              <button class="btn btn-sm btn-primary" type="submit" disabled={loading}>
                {loading ? "Loading…" : "Show route"}
              </button>
              {#if hasRoute}
                <button class="link-btn" type="button" on:click={clearRoute} disabled={loading}>
                  Clear route
                </button>
              {/if}
            </form>

            <div class="map-actions">
              <form class="search-form" on:submit|preventDefault={searchMapPlace}>
                <input
                  class="form-control form-control-sm"
                  bind:value={mapQuery}
                  placeholder="Search India"
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
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                on:click={refreshHeads}
                disabled={!result || headsRefreshing}
                title="Refresh Head locations"
              >
                {#if headsRefreshing}
                  …
                {:else}
                  Refresh heads{#if result}
                    <span class="head-count">({liveHeadCount}/{headPinCount})</span>
                  {/if}
                {/if}
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                on:click={toggleMapFull}
                title={mapFull ? "Exit full view" : "Full view"}
              >
                <i class="ti {mapFull ? 'ti-minimize' : 'ti-maximize'} me-1"></i>
                {mapFull ? "Exit" : "Full view"}
              </button>
              <div class="map-tools">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  aria-expanded={toolsOpen}
                  aria-haspopup="menu"
                  on:click={() => (toolsOpen = !toolsOpen)}
                >
                  View
                </button>
                {#if toolsOpen}
                  <div class="tools-menu" role="menu">
                    <p class="tools-label">Map</p>
                    <button type="button" class:is-on={basemap === "light"} on:click={() => chooseBasemap("light")}>Light</button>
                    <button type="button" class:is-on={basemap === "streets"} on:click={() => chooseBasemap("streets")}>Streets</button>
                    <button type="button" class:is-on={basemap === "satellite"} on:click={() => chooseBasemap("satellite")}>Satellite</button>
                    <p class="tools-label">View</p>
                    <button type="button" on:click={() => runMapTool(fitRoute)} disabled={!hasRoute}>Fit route</button>
                    <button type="button" on:click={() => runMapTool(showIndia)}>Show India</button>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          {#if errorText}
            <p class="text-danger text-sm mb-2">{errorText}</p>
          {/if}
          {#if mapSearchError}
            <p class="text-danger text-xs mb-2">{mapSearchError}</p>
          {/if}
          {#if mapHits.length}
            <div class="hit-row">
              {#each mapHits as hit}
                <button type="button" class="btn btn-sm btn-light border" on:click={() => goToPlace(hit)}>
                  {hit.label || [hit.name, hit.admin1].filter(Boolean).join(", ")}
                </button>
              {/each}
            </div>
          {/if}

          <div class="status-row" role="toolbar" aria-label="Filter sites by status">
            {#each visibleStatusFilters as filter (filter.id)}
              <button
                type="button"
                class="status-chip"
                class:active={pinFilter === filter.id}
                style="--chip: {filter.color || '#111827'}"
                aria-pressed={pinFilter === filter.id}
                on:click={() => chooseStatus(filter.id)}
              >
                {#if filter.color}<i class="dot"></i>{/if}
                {filter.label}
                <span class="count">{filterCount(filter.id)}</span>
              </button>
            {/each}
            {#if overflowStatusFilters.length}
              <div class="status-more">
                <button
                  type="button"
                  class="status-chip more-chip"
                  aria-label="More statuses"
                  aria-expanded={statusMenuOpen}
                  on:click={() => (statusMenuOpen = !statusMenuOpen)}
                >
                  ···
                </button>
                {#if statusMenuOpen}
                  <div class="status-menu" role="menu">
                    {#each overflowStatusFilters as filter (filter.id)}
                      <button
                        type="button"
                        class:is-on={pinFilter === filter.id}
                        on:click={() => chooseStatus(filter.id)}
                        title={STATUS_HINTS[filter.id] || ""}
                      >
                        {#if filter.color}<i class="dot" style="background: {filter.color}"></i>{/if}
                        <span class="menu-label">
                          {filter.label}
                          {#if STATUS_HINTS[filter.id]}
                            <small>{STATUS_HINTS[filter.id]}</small>
                          {/if}
                        </span>
                        <span>{filterCount(filter.id)}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          {#if result && !headPinCount}
            <p class="map-hint">
              No Head pins yet. Keep ShipMate open in the foreground with location allowed, then tap Refresh heads.
            </p>
          {/if}

          <div class="map-frame">
            <div class="india-map" bind:this={mapEl} role="img" aria-label="India installation map"></div>
            <div class="map-key">
              <span><i class="key start"></i> Start</span>
              <span><i class="key end"></i> End</span>
              <span><i class="key home"></i> Home</span>
              <span><i class="key head"></i> Head</span>
            </div>
          </div>
        </section>

        <aside class="site-panel">
          <div class="site-head">
            <div class="site-head-row">
              <h6>Sites ({tableSites.length})</h6>
            </div>
            <input
              class="form-control form-control-sm list-search"
              bind:value={listQuery}
              placeholder="Search work order or place"
              aria-label="Search sites"
            />
            {#if hasRoute}
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
                  <strong>{result?.onRouteCount || 0}</strong>
                </div>
              </div>
            {:else}
              <p class="route-hint">Choose a start and end to see the path and return time.</p>
            {/if}
            {#if recentActivity.length}
              <div class="activity-feed">
                <p class="activity-title">Recent activity</p>
                {#each recentActivity as item}
                  <button
                    type="button"
                    class="activity-row"
                    on:click={() => {
                      const site = (result?.sites || []).find(
                        (s) => String(s.workOrder) === String(item.workOrder),
                      );
                      if (site) {
                        if (siteOnMap(site)) focusSite(site.id);
                        else openDetail(site);
                      }
                    }}
                  >
                    <span class="activity-kind" class:head={item.type === "head"}>{item.type === "head" ? "Head" : "Update"}</span>
                    <span class="activity-body">
                      <strong>{item.workOrder}</strong>
                      {item.detail || item.title}
                    </span>
                    <span class="activity-ago">{seenAgo(item.at)}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <div class="site-list" bind:this={siteListEl}>
            {#if !result}
              <p class="empty">{loading ? "Loading sites…" : "No sites yet."}</p>
            {:else if !statusFiltered.length}
              <p class="empty">
                {#if pinFilter === "headOnline"}
                  No Head online right now. Keep the phone app open with location on, then Refresh heads.
                {:else if pinFilter === "hasHead"}
                  No jobs with an assigned Head in this list.
                {:else if pinFilter === "missingLocation"}
                  Every site has a map pin.
                {:else}
                  No jobs match this filter.
                {/if}
              </p>
            {:else if !tableSites.length}
              <p class="empty">No sites match that search.</p>
            {:else}
              {#each tableSites as site (site.id)}
                {@const head = headForSite(site)}
                {@const activity = siteActivityLine(site)}
                <article
                  class="site-card"
                  class:active={selectedId === site.id}
                  data-site-id={site.id}
                  style="--pin: {PIN_COLOR[site.status] || '#64748b'}"
                  role="button"
                  tabindex="0"
                  on:click={() => focusSite(site.id)}
                  on:keydown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      focusSite(site.id);
                    }
                  }}
                >
                  <div class="site-card-top">
                    <button type="button" class="site-link" on:click|stopPropagation={() => openDetail(site)}>
                      {site.workOrder}
                    </button>
                    <div class="flag-row">
                      {#if head && isHeadOnline(head)}
                        <span class="flag head-on">Head online</span>
                      {:else if site.hasHead}
                        <span class="flag head-off">Has Head</span>
                      {/if}
                      {#if site.isNext}
                        <span class="flag next">Next</span>
                      {:else if site.onRoute}
                        <span class="flag route">On route</span>
                      {/if}
                    </div>
                  </div>
                  <div class="place-line">
                    {#if sitePlace(site)}
                      {sitePlace(site)}
                    {:else}
                      <span class="text-danger">Missing location</span>
                    {/if}
                  </div>
                  <div class="status-line">
                    <i class="dot" style="background: {PIN_COLOR[site.status] || '#64748b'}"></i>
                    <span>{site.statusLabel}</span>
                  </div>
                  {#if activity}
                    <div class="quiet-line activity-line">{activity}</div>
                  {/if}
                  {#if site.onRoute || (site.status === "installed" && site.installedAt)}
                    <div class="quiet-line">
                      {#if site.onRoute}
                        <span>{site.alongKm} km along route</span>
                      {/if}
                      {#if site.status === "installed" && site.installedAt}
                        <span>
                          Installed {formatWhen(site.installedAt)}{site.installedDays != null ? ` (${site.installedDays}d)` : ""}
                        </span>
                      {/if}
                    </div>
                  {/if}
                </article>
              {/each}
            {/if}
          </div>
        </aside>
      </div>
    {/if}
  </div>
</div>

<InstallTrackQuickView
  site={detailSite}
  headPin={detailHead}
  color={PIN_COLOR[detailSite?.status] || "#64748b"}
  on:close={() => (detailSite = null)}
/>

<style>
  :global(main:has(.track-shell) > footer.footer) {
    display: none;
  }
  .track-shell {
    height: calc(100vh - var(--crms-topbar-height));
    min-height: 0;
  }
  :global(.page-wrapper.track-shell) .track-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 0.75rem 1rem;
    overflow: hidden;
  }
  :global(body.track-map-full .sidebar),
  :global(body.track-map-full .navbar-header) {
    visibility: hidden;
  }
  .track-head {
    flex: 0 0 auto;
    margin-bottom: 0.55rem;
  }
  .track-head h4 {
    margin: 0;
    font-size: 1.15rem;
  }
  .lede {
    margin: 0.15rem 0 0;
    color: #6b7280;
    font-size: 0.8rem;
  }
  .help-link {
    border: 0;
    background: transparent;
    color: #2563eb;
    font-size: inherit;
    padding: 0;
    margin-left: 0.35rem;
    text-decoration: underline;
  }
  .help-list {
    margin: 0.4rem 0 0;
    padding: 0.55rem 0.75rem 0.55rem 1.35rem;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    color: #475569;
    font-size: 0.75rem;
    line-height: 1.45;
  }
  .help-list li + li {
    margin-top: 0.25rem;
  }
  .head-count {
    margin-left: 0.15rem;
    color: #6b7280;
    font-variant-numeric: tabular-nums;
  }
  .map-hint {
    margin: 0 0 0.4rem;
    padding: 0.4rem 0.55rem;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 0.4rem;
    color: #92400e;
    font-size: 0.72rem;
  }
  .track-row {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    gap: 0.75rem;
    align-items: stretch;
  }
  .map-shell {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-radius: 0.75rem;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    padding: 0.55rem 0.7rem 0.7rem;
  }
  .command-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 0.45rem;
  }
  .route-fields,
  .map-actions,
  .search-form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    align-items: flex-end;
  }
  .field {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 11rem;
  }
  .field span {
    font-size: 0.7rem;
    color: #6b7280;
  }
  .suggest {
    position: absolute;
    z-index: 30;
    top: calc(100% + 0.2rem);
    left: 0;
    width: 18rem;
    max-height: 14rem;
    overflow: auto;
    margin: 0;
    padding: 0.25rem;
    list-style: none;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  }
  .suggest button {
    display: block;
    width: 100%;
    text-align: left;
    border: 0;
    background: transparent;
    border-radius: 0.35rem;
    padding: 0.35rem 0.45rem;
    font-size: 0.75rem;
    color: #111827;
  }
  .suggest button:hover {
    background: #f3f4f6;
  }
  .link-btn {
    border: 0;
    background: transparent;
    color: #4b5563;
    font-size: 0.8rem;
    padding: 0.3rem 0.1rem;
    text-decoration: underline;
  }
  .link-btn:disabled {
    color: #9ca3af;
  }
  .search-form .form-control {
    width: 11rem;
  }
  .map-tools {
    position: relative;
  }
  .tools-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.25rem);
    z-index: 40;
    min-width: 10.5rem;
    padding: 0.25rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
    display: flex;
    flex-direction: column;
  }
  .tools-menu button {
    text-align: left;
    border: 0;
    background: transparent;
    border-radius: 0.35rem;
    padding: 0.4rem 0.55rem;
    font-size: 0.8rem;
  }
  .tools-menu button:hover:not(:disabled) {
    background: #f3f4f6;
  }
  .tools-menu button:disabled {
    color: #9ca3af;
  }
  .tools-label {
    margin: 0.15rem 0 0;
    padding: 0.3rem 0.55rem 0.1rem;
    font-size: 0.65rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9ca3af;
  }
  .tools-menu button.is-on {
    background: #eef2ff;
    color: #1e3a8a;
  }
  :global(.leaflet-container .leaflet-div-icon.track-cluster) {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #111827;
    color: #fff;
    border: 2px solid #fff;
    border-radius: 999px;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35);
    font-size: 12px;
    font-weight: 600;
  }
  :global(.track-cluster span) {
    line-height: 1;
  }
  :global(.leaflet-tooltip.track-wo-tip) {
    padding: 1px 6px;
    border: 0;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
    font-size: 11px;
    font-weight: 600;
    color: #111827;
  }
  :global(.leaflet-tooltip.track-wo-tip::before) {
    display: none;
  }
  .hit-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 0.4rem;
  }
  .status-row {
    display: flex;
    gap: 0.35rem;
    overflow: visible;
    position: relative;
    z-index: 6;
    flex: 0 0 auto;
    padding-bottom: 0.45rem;
  }
  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid #e5e7eb;
    background: #fff;
    color: #374151;
    border-radius: 999px;
    padding: 0.15rem 0.55rem;
    font-size: 0.75rem;
    line-height: 1.4;
    white-space: nowrap;
  }
  .status-chip .dot,
  .status-line .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--chip, currentColor);
    flex: 0 0 auto;
  }
  .status-chip .count {
    color: #6b7280;
    font-variant-numeric: tabular-nums;
  }
  .status-chip.active {
    border-color: var(--chip, #111827);
    background: color-mix(in srgb, var(--chip, #111827) 14%, white);
    color: #111827;
  }
  .status-chip.active .count {
    color: #111827;
  }
  .status-more {
    position: relative;
  }
  .more-chip {
    letter-spacing: 0.08em;
    padding-inline: 0.65rem;
  }
  .status-menu {
    position: absolute;
    left: 0;
    top: calc(100% + 0.25rem);
    z-index: 80;
    min-width: 16rem;
    max-height: 18rem;
    overflow: auto;
    padding: 0.25rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
    display: flex;
    flex-direction: column;
  }
  .status-menu button {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    text-align: left;
    border: 0;
    background: transparent;
    border-radius: 0.35rem;
    padding: 0.4rem 0.5rem;
    font-size: 0.78rem;
  }
  .status-menu .menu-label {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
    flex: 1;
  }
  .status-menu .menu-label small {
    color: #9ca3af;
    font-size: 0.65rem;
    line-height: 1.3;
    white-space: normal;
  }
  .status-menu button .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    flex: 0 0 auto;
    margin-top: 0.25rem;
  }
  .status-menu button > .count,
  .status-menu button > span:last-child:not(.menu-label) {
    margin-left: auto;
    color: #6b7280;
    font-variant-numeric: tabular-nums;
    flex: 0 0 auto;
  }
  .status-menu button:hover,
  .status-menu button.is-on {
    background: #f3f4f6;
  }
  .map-frame {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
  }
  .india-map {
    flex: 1;
    width: 100%;
    height: auto;
    min-height: 0;
    border-radius: 0.5rem;
    z-index: 0;
    background: #e8eef4;
  }
  .map-key {
    position: absolute;
    top: 0.55rem;
    right: 0.55rem;
    z-index: 2;
    display: flex;
    gap: 0.55rem;
    padding: 0.3rem 0.5rem;
    background: rgba(255, 255, 255, 0.94);
    border-radius: 0.45rem;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    font-size: 0.7rem;
    color: #374151;
  }
  .key {
    display: inline-block;
    width: 0.55rem;
    height: 0.55rem;
    margin-right: 0.2rem;
    vertical-align: middle;
  }
  .key.start {
    background: #059669;
  }
  .key.end {
    background: #dc2626;
  }
  .key.home {
    background: #0f766e;
  }
  .key.head {
    background: #7c3aed;
    border-radius: 999px;
  }
  .site-panel {
    flex: 0 0 24rem;
    width: 24rem;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-radius: 0.75rem;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    overflow: hidden;
  }
  .site-head {
    flex: 0 0 auto;
    padding: 0.7rem 0.8rem 0.6rem;
    border-bottom: 1px solid #eef2f6;
    background: #fff;
  }
  .site-head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .site-head h6 {
    margin: 0;
    font-size: 0.9rem;
  }
  .list-search {
    width: 100%;
    margin-top: 0.45rem;
  }
  .site-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
    margin-top: 0.55rem;
  }
  .site-stats span {
    display: block;
    color: #6b7280;
    font-size: 0.65rem;
  }
  .site-stats strong {
    display: block;
    font-size: 0.92rem;
    font-weight: 600;
    word-break: break-word;
  }
  .route-hint,
  .empty {
    margin: 0.45rem 0 0;
    color: #6b7280;
    font-size: 0.78rem;
  }
  .empty {
    text-align: center;
    padding: 1.5rem 0.5rem;
  }
  .site-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem;
  }
  .site-card {
    text-align: left;
    border: 1px solid #e5e7eb;
    background: #fff;
    border-radius: 0.65rem;
    padding: 0.5rem 0.65rem 0.5rem 0.7rem;
    cursor: pointer;
    box-shadow: inset 3px 0 0 var(--pin, #64748b);
  }
  .site-card.active {
    background: #f8fafc;
    border-color: #dbe3ee;
  }
  .site-card-top {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .site-card-top a,
  .site-card-top strong,
  .site-link {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .site-link {
    border: 0;
    background: transparent;
    padding: 0;
    color: #0d6efd;
    text-align: left;
  }
  .site-link:hover {
    text-decoration: underline;
  }
  :global(.track-detail-open) {
    margin-top: 0.35rem;
    border: 0;
    background: transparent;
    padding: 0;
    color: #0d6efd;
    font-size: 0.8rem;
    text-decoration: underline;
  }
  .flag {
    font-size: 0.65rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 0.05rem 0.4rem;
  }
  .flag.next {
    background: #fef3c7;
    color: #92400e;
  }
  .flag.route {
    background: #dbeafe;
    color: #1d4ed8;
  }
  .flag.head-on {
    background: #ede9fe;
    color: #5b21b6;
  }
  .flag.head-off {
    background: #f3f4f6;
    color: #6b7280;
  }
  .flag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-left: auto;
  }
  .activity-line {
    color: #5b21b6;
  }
  .activity-feed {
    margin-top: 0.55rem;
    padding-top: 0.45rem;
    border-top: 1px solid #eef2f6;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 9.5rem;
    overflow: auto;
  }
  .activity-title {
    margin: 0;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9ca3af;
  }
  .activity-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.35rem;
    align-items: start;
    border: 0;
    background: transparent;
    padding: 0.25rem 0;
    text-align: left;
    font-size: 0.7rem;
    color: #374151;
  }
  .activity-row:hover {
    background: #f8fafc;
  }
  .activity-kind {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #6b7280;
    padding-top: 0.1rem;
  }
  .activity-kind.head {
    color: #7c3aed;
  }
  .activity-body {
    min-width: 0;
    line-height: 1.3;
  }
  .activity-body strong {
    display: block;
    font-size: 0.72rem;
  }
  .activity-ago {
    color: #9ca3af;
    white-space: nowrap;
  }
  .place-line {
    margin-top: 0.1rem;
    font-size: 0.78rem;
    color: #374151;
  }
  .status-line {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.2rem;
    font-size: 0.72rem;
    color: #4b5563;
  }
  .quiet-line {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.7rem;
    margin-top: 0.2rem;
    color: #6b7280;
    font-size: 0.7rem;
  }
  .track-row.track-full {
    position: fixed;
    inset: 0;
    z-index: 11000;
    height: 100vh;
    margin: 0;
    padding: 0.75rem;
    background: #f3f4f6;
    flex-wrap: nowrap;
  }
  .track-row.track-full .map-shell,
  .track-row.track-full .site-panel {
    height: 100%;
  }
  .track-row.track-full .site-panel {
    flex-basis: 24rem;
  }
  .track-row.track-full .india-map {
    border-radius: 0.35rem;
  }
  @media (max-width: 991.98px) {
    .track-shell {
      height: auto;
      min-height: calc(100vh - var(--crms-topbar-height));
    }
    :global(.page-wrapper.track-shell) .track-page {
      height: auto;
      overflow: visible;
    }
    .track-row:not(.track-full) {
      flex-direction: column;
    }
    .map-frame {
      min-height: 22rem;
    }
    .site-panel {
      width: 100%;
      flex-basis: auto;
      max-height: 28rem;
    }
  }
</style>
