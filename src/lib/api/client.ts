import axios, { AxiosRequestConfig } from "axios";
import { logoutUser } from "../utils/auth";
import { goto } from "$app/navigation";
import { AUTH_REDIRECT_ERROR } from "../utils/errorHandle";

function throwAuthRedirect(): never {
  const err = new Error("Session expired. Redirecting to login.");
  (err as any).code = AUTH_REDIRECT_ERROR;
  throw err;
}

const BASE_URL = import.meta.env.VITE_PUBLIC_API_URL;

// ── Axios instance ────────────────────────────────────────────────────────────
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 12000,                      // 12s per request — handles weak networks
  headers: { "Content-Type": "application/json" },
});

// ── Retry helpers ─────────────────────────────────────────────────────────────
const MAX_RETRIES    = 2;
const RETRY_DELAYS   = [1000, 2500];  // 1s then 2.5s between retries

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Returns true for errors worth retrying (network drop, timeout, no response) */
function isRetryable(err: any): boolean {
  if (err.code === 'ECONNABORTED') return true;  // axios timeout
  if (err.code === 'ERR_NETWORK')  return true;
  if (!err.response)               return true;  // no response at all
  return false;
}

/** Wraps an axios config with automatic retry on retryable failures */
async function requestWithRetry(config: AxiosRequestConfig): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1]);
      return await axiosInstance.request(config);
    } catch (err: any) {
      lastErr = err;
      // Stop retrying if it's a real HTTP error or we've used all attempts
      if (!isRetryable(err) || attempt === MAX_RETRIES) break;
    }
  }
  throw lastErr;
}

/** Normalise any axios/network error into a consistent shape */
function normaliseError(err: any): never {
  // Network-level failure (no response received, or timed out after retries)
  if (!err.response) {
    const isTimeout = err.code === 'ECONNABORTED';
    const msg = isTimeout
      ? "Request timed out. Your connection may be slow — please try again."
      : "Server is unreachable. Please check your connection or try again later.";
    const netErr = new Error(msg);
    (netErr as any).status          = 0;
    (netErr as any).isNetworkError  = true;
    (netErr as any).isTimeout       = isTimeout;
    (netErr as any).data            = { message: msg };
    throw netErr;
  }

  // Normal HTTP error response
  const errorData = err.response.data || {};
  const error     = new Error(errorData.message || "API request failed");
  (error as any).status = err.response.status;
  (error as any).data   = errorData;
  throw error;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Unauthenticated fetch — used for login, refresh, health check */
export async function apiFetch(
  endpoint: string,
  options: AxiosRequestConfig = {}
) {
  try {
    const response = await requestWithRetry({ url: endpoint, ...options });
    return response.data;
  } catch (err: any) {
    normaliseError(err);
  }
}

/** Authenticated fetch with automatic token refresh + retry on network errors */
export async function authApiFetch(
  endpoint: string,
  options: AxiosRequestConfig = {}
) {
  let authToken      = localStorage.getItem("access_token");
  const isFormData   = options.data instanceof FormData;

  const buildHeaders = (token: string | null) => ({
    ...(token ? {
      Authorization:  `Bearer ${token}`,
      "Content-Type": isFormData ? undefined : "application/json",
    } : {}),
    ...(options.headers || {}),
  });

  try {
    const response = await requestWithRetry({
      url:     endpoint,
      headers: buildHeaders(authToken),
      data:    options.data,
      ...options,
    });
    return response.data;
  } catch (err: any) {
    // ── 401 → try token refresh ──────────────────────────────────────────────
    if (err.response?.status === 401) {
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          const refreshResponse = await apiFetch("/auth/refresh", {
            method: "POST",
            data:   { refresh_token: refreshToken },
          });

          const { secureStorage } = await import('$lib/utils/secureStorage');
          await secureStorage.set('access_token', refreshResponse.access_token);
          localStorage.setItem("access_token", refreshResponse.access_token);

          authToken = refreshResponse.access_token;
          const retryResponse = await requestWithRetry({
            url:     endpoint,
            headers: buildHeaders(authToken),
            data:    options.data,
            ...options,
          });
          return retryResponse.data;
        } catch {
          logoutUser();
          goto("/login");
          throwAuthRedirect();
        }
      } else {
        logoutUser();
        goto("/login");
        throwAuthRedirect();
      }
    }

    // ── All other errors ─────────────────────────────────────────────────────
    normaliseError(err);
  }
}
