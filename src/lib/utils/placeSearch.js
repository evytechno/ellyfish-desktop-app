export async function reverseIndiaPlace(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url =
    "https://nominatim.openstreetmap.org/reverse?" +
    new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "json",
      addressdetails: "1",
    });
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Lookup failed");
  const row = await response.json();
  const address = row?.address || {};
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.county ||
    address.state_district ||
    "";
  const state = address.state || "";
  const pincode = String(address.postcode || "").trim();
  const seen = new Set();
  const line = [
    [address.house_number, address.road].filter(Boolean).join(" "),
    address.neighbourhood,
    address.suburb,
    address.quarter,
    address.hamlet,
    address.residential,
    city,
    address.city_district,
    address.county,
    address.state_district,
    state,
  ]
    .map((part) => String(part || "").trim())
    .filter((part) => {
      if (!part) return false;
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
  const fallback = String(row?.display_name || "")
    .replace(/,?\s*India\s*$/i, "")
    .replace(pincode ? new RegExp(`,?\\s*${pincode}\\s*$`) : /$^/, "")
    .trim();
  const placeAddress = line || fallback;
  if (!city && !state && !placeAddress && !pincode) return null;
  return { city, state, address: placeAddress, pincode };
}

const ROAD_RE = /\b(road|rd|marg|street|st|lane|gali|path|chowk|circle)\b/i;
const AREA_RE = /\b(nagar|colony|vihar|puram|bagh|ganj|pura|ward|sector|phase)\b/i;

/** Shorter place names to try when the full address is not mapped. */
export function nearbySearchQueries(raw) {
  const q = String(raw || "").replace(/\s+/g, " ").trim();
  if (!q) return [];
  const parts = q.split(",").map((part) => part.trim()).filter(Boolean);
  const pin = (q.match(/\b(\d{6})\b/) || [])[1] || "";
  const cleaned = parts
    .map((part) => part.replace(/\b\d{6}\b/g, " ").replace(/^\d+[a-zA-Z]?\b/, " ").replace(/\s+/g, " ").trim())
    .filter((part) => part && !/^\d+$/.test(part));
  const roads = cleaned.filter((part) => ROAD_RE.test(part));
  const areas = cleaned.filter((part) => AREA_RE.test(part) && !ROAD_RE.test(part));
  const places = cleaned.filter((part) => !ROAD_RE.test(part) && !AREA_RE.test(part));
  const city = places.length >= 2 ? places[places.length - 2] : places[0] || "";
  const queries = [];
  const seen = new Set([q.toLowerCase()]);

  function add(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim().replace(/^,|,$/g, "");
    const key = text.toLowerCase();
    if (text.length < 3 || seen.has(key)) return;
    seen.add(key);
    queries.push(text);
  }

  if (pin) add(pin);
  if (areas[0] && city) add(`${areas[0]}, ${city}`);
  if (roads[0] && city) add(`${roads[0]}, ${city}`);
  if (city) add(city);
  if (areas[0]) add(areas[0]);
  return queries.slice(0, 4);
}

/** Cities, districts, and states in India. */
export async function searchIndiaPlaces(query) {
  const q = String(query || "").trim();
  if (!q) return [];

  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q,
      format: "json",
      countrycodes: "in",
      limit: "5",
      addressdetails: "1",
    });
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Search failed");
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const latitude = Number(row.lat);
      const longitude = Number(row.lon);
      const box = Array.isArray(row.boundingbox)
        ? row.boundingbox.map(Number)
        : null;
      const state = row.address?.state || "";
      const name = row.name || row.display_name || q;
      return {
        name,
        admin1: state && state !== name ? state : "",
        label: row.display_name || name,
        latitude,
        longitude,
        bounds:
          box && box.length === 4
            ? [
                [box[0], box[2]],
                [box[1], box[3]],
              ]
            : null,
      };
    })
    .filter(
      (hit) => Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude),
    );
}
