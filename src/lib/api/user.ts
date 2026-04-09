import { API_ROUTES } from "../constants/apiRoutes";
import { apiFetch } from "./client";

export function loginUser(credentials: { email: string; password: string }) {
  return apiFetch(API_ROUTES.LOGIN, {
    method: "POST",
    data: credentials,
  });
}
