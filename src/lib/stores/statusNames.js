import { get, writable } from "svelte/store";
import { authApiFetch } from "$lib/api/client";
import { API_ROUTES } from "$lib/constants/apiRoutes";

// Get user data from localStorage
const userStored =
  typeof localStorage !== "undefined"
    ? JSON.parse(localStorage.getItem("user") || "null")
    : null;

// Try to get statusNames from localStorage first
let stored = null;
if (typeof localStorage !== "undefined") {
  stored = JSON.parse(localStorage.getItem("statusNames") || "null");
}

// Default fallback statuses
const defaultStatuses = {
  "New Lead": { name: "New Lead", visible: true },
  Contacted: { name: "Contacted", visible: true },
  "Follow Up": { name: "Follow Up", visible: true },
  Qualified: { name: "Qualified", visible: true },
  Unqualified: { name: "Unqualified", visible: true },
  "Needs Assessment": { name: "Needs Assessment", visible: true },
  "Quotation Sent": { name: "Quotation Sent", visible: true },
  "Negotiation In Progress": { name: "Negotiation In Progress", visible: true },
  "Deal Won": { name: "Deal Won", visible: true },
  "Deal Lost": { name: "Deal Lost", visible: true },
};

// Try localStorage → user.orderData → defaultStatuses
let initialStatuses = stored;

if (!initialStatuses && userStored?.orderData) {
  try {
    initialStatuses = JSON.parse(userStored.orderData);
  } catch {
    initialStatuses = defaultStatuses;
  }
}

if (!initialStatuses) {
  initialStatuses = defaultStatuses;
}

export const statusNamesStore = writable(initialStatuses);

// Subscribe to store updates
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
