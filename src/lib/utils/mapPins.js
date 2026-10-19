import L from "leaflet";

function pinSvg(color, size) {
  const width = size;
  const height = Math.round(size * 1.45);
  return `<svg width="${width}" height="${height}" viewBox="0 0 28 40" aria-hidden="true">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="5" fill="#fff"/>
  </svg>`;
}

export function mapPinIcon(color, next = false, size) {
  const width = size || (next ? 34 : 28);
  const height = Math.round(width * 1.45);
  return L.divIcon({
    className: "crm-pin",
    html: pinSvg(color, width),
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height + 4],
    tooltipAnchor: [width / 2, -height + 16],
  });
}

/** Round person marker — distinct from job teardrop pins. */
export function mapHeadIcon(color, size = 20) {
  const s = Math.max(16, size);
  const html = `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="12" cy="9" r="3.2" fill="#fff"/>
    <path d="M5.8 18.8c1.9-3.1 4.1-4.6 6.2-4.6s4.3 1.5 6.2 4.6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
  return L.divIcon({
    className: "crm-pin crm-head-pin",
    html,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    popupAnchor: [0, -s / 2 + 2],
    tooltipAnchor: [s / 2, 0],
  });
}
