import { writable } from "svelte/store";
import { authApiFetch } from "$lib/api/client";
import { API_ROUTES } from "$lib/constants/apiRoutes";

const userStored =
  typeof localStorage !== "undefined"
    ? JSON.parse(localStorage.getItem("user") || "null")
    : null;

const defaultStatuses = {
  "New Lead":                { name: "New Lead",                      visible: true },
  Contacted:                 { name: "Contacted",                     visible: true },
  "Quotation Sent":          { name: "Quotation Sent",                visible: true },
  "Follow Up":               { name: "Follow Up [Fast Conversion]",   visible: true },
  "Needs Assessment":        { name: "Follow Up [Slow Conversion]",   visible: true },
  Qualified:                 { name: "Qualified",                     visible: true },
  "Negotiation In Progress": { name: "Negotiation In Progress",       visible: true },
  "Deal Won":                { name: "Deal Won",                      visible: true },
  Unqualified:               { name: "Unqualified",                   visible: true },
  "Deal Lost":               { name: "Deal Lost",                     visible: true },
};

// Version history:
// 1 → original
// 2 → "Follow Up" renamed to "Follow Up [Fast Conversion]"
//      "Needs Assessment" renamed to "Follow Up [Slow Conversion]"
const CURRENT_VERSION = 2;
const VERSION_KEY = "statusNames_version";

function migrateStatuses(stored) {
  if (!stored) return null;

  const storedVersion = parseInt(
    typeof localStorage !== "undefined"
      ? localStorage.getItem(VERSION_KEY) || "1"
      : "1"
  );

  if (storedVersion >= CURRENT_VERSION) return stored;

  const migrated = { ...stored };

  // v1 → v2: rename display names if user hasn't customized them
  if (storedVersion < 2) {
    if (migrated["Follow Up"]?.name === "Follow Up") {
      migrated["Follow Up"] = { ...migrated["Follow Up"], name: "Follow Up [Fast Conversion]" };
    }
    if (migrated["Needs Assessment"]?.name === "Needs Assessment") {
      migrated["Needs Assessment"] = { ...migrated["Needs Assessment"], name: "Follow Up [Slow Conversion]" };
    }
    // Add any keys that exist in defaults but not in stored
    for (const [key, val] of Object.entries(defaultStatuses)) {
      if (!(key in migrated)) {
        migrated[key] = val;
      }
    }
  }

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(VERSION_KEY, String(CURRENT_VERSION));
    localStorage.setItem("statusNames", JSON.stringify(migrated));
  }

  return migrated;
}

let stored = null;
if (typeof localStorage !== "undefined") {
  stored = JSON.parse(localStorage.getItem("statusNames") || "null");
  stored = migrateStatuses(stored);
}

let initialStatuses = stored;

if (!initialStatuses && userStored?.orderData) {
  try {
    const fromDb = JSON.parse(userStored.orderData);
    initialStatuses = migrateStatuses(fromDb) ?? fromDb;
  } catch {
    initialStatuses = defaultStatuses;
  }
}

if (!initialStatuses) {
  initialStatuses = defaultStatuses;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(VERSION_KEY, String(CURRENT_VERSION));
  }
}

export const statusNamesStore = writable(initialStatuses);

statusNamesStore.subscribe(async (value) => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("statusNames", JSON.stringify(value));
  }

  try {
    const currentUser = userStored;
    if (!currentUser?.id) return;

    const updatedUser = {
      orderData: JSON.stringify(value),
    };

    await authApiFetch(`${API_ROUTES.USER}/${currentUser.id}`, {
      method: "PUT",
      data: JSON.stringify(updatedUser),
    });
  } catch (error) {
    console.error("Error saving statusNames to user details:", error);
  }
});
