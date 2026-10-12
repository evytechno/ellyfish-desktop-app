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
