import L from "leaflet";

function pinSvg(color, size) {
  const width = size;
  const height = Math.round(size * 1.45);
  return `<svg width="${width}" height="${height}" viewBox="0 0 28 40" aria-hidden="true">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="5" fill="#fff"/>
  </svg>`;
}

export function mapPinIcon(color, next = false) {
  const width = next ? 34 : 28;
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
