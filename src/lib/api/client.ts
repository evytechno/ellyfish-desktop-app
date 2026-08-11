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
  timeout: 12000,
  headers: { "Content-Type": "application/json" },
});

// ── Retry helpers ─────────────────────────────────────────────────────────────
const MAX_RETRIES    = 2;
const RETRY_DELAYS   = [1000, 2500];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function isRetryable(err: any): boolean {
  if (err.code === 'ECONNABORTED') return true;
  if (err.code === 'ERR_NETWORK')  return true;
  if (!err.response)               return true;
  return false;
}

async function requestWithRetry(config: AxiosRequestConfig): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1]);
      return await axiosInstance.request(config);
    } catch (err: any) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES) break;
    }
  }
  throw lastErr;
}

function normaliseError(err: any): never {
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
  const errorData = err.response.data || {};
  const error     = new Error(errorData.message || "API request failed");
  (error as any).status = err.response.status;
  (error as any).data   = errorData;
  throw error;
}

// ── Token refresh — shared promise prevents parallel refresh races ─────────────
// If two requests both get 401 simultaneously, only one refresh call is made.
// Both requests wait on the same promise and get the new token.
let _refreshPromise: Promise<string> | null = null;

async function getRefreshedToken(): Promise<string> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const { secureStorage } = await import('$lib/utils/secureStorage');

    // Prefer localStorage (fast sync read). Fall back to keychain in case
    // localStorage was cleared while the keychain still holds the token.
    let refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      refreshToken = await secureStorage.get('refresh_token').catch(() => null);
    }
    if (!refreshToken) throw new Error("no refresh token");

    const res = await apiFetch("/auth/refresh", {
      method: "POST",
      data:   { refresh_token: refreshToken },
    });
    await secureStorage.set('access_token', res.access_token);
    localStorage.setItem("access_token", res.access_token);
    return res.access_token as string;
  })().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

// ── Public API ────────────────────────────────────────────────────────────────

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

export async function authApiFetch(
  endpoint: string,
  options: AxiosRequestConfig = {}
) {
  let authToken    = localStorage.getItem("access_token");
  const isFormData = options.data instanceof FormData;

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
    // ── 401 → shared token refresh (race-safe) ───────────────────────────────
    if (err.response?.status === 401) {
      try {
        authToken = await getRefreshedToken();
        const retryResponse = await requestWithRetry({
          url:     endpoint,
          headers: buildHeaders(authToken),
          data:    options.data,
          ...options,
        });
        return retryResponse.data;
      } catch (refreshErr: any) {
        await logoutUser();
        // Surface the server's reason (e.g. "logged in on another device") so
        // users understand why they were logged out rather than seeing a blank redirect.
        const reason = refreshErr?.data?.message || refreshErr?.message || '';
        const query  = reason ? `?reason=${encodeURIComponent(reason)}` : '';
        goto(`/login${query}`);
        throwAuthRedirect();
      }
    }

    normaliseError(err);
  }
}
