import { authApiFetch } from "$lib/api/client";
import { API_ROUTES } from "$lib/constants/apiRoutes";

/** @param {URLSearchParams|string} query */
export async function fetchOrderActivities(query) {
  const qs = typeof query === "string" ? query : query.toString();
  return authApiFetch(`${API_ROUTES.ORDER_ACTIVITY}?${qs}`, { method: "GET" });
}

/** @param {URLSearchParams|string} query */
export async function fetchAuthActivities(query) {
  const qs = typeof query === "string" ? query : query.toString();
  return authApiFetch(`${API_ROUTES.AUTH_ACTIVITY}?${qs}`, { method: "GET" });
}

export async function fetchUsers() {
  return authApiFetch(API_ROUTES.USER + "/all");
}

export async function fetchCompanies() {
  return authApiFetch(API_ROUTES.COMPANY + "/all");
}
