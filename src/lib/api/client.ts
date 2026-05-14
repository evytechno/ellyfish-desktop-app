import axios, { AxiosRequestConfig } from "axios";
import { logoutUser } from "../utils/auth";
import { goto } from "$app/navigation";

const BASE_URL = import.meta.env.VITE_PUBLIC_API_URL;

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Generic API fetch (no auth)
export async function apiFetch(
  endpoint: string,
  options: AxiosRequestConfig = {}
) {
  try {
    const response = await axiosInstance.request({
      url: endpoint,
      ...options,
    });
    return response.data;
  } catch (err: any) {
    const errorData = err.response?.data || {
      message: "Unknown error occurred",
    };
    const error = new Error(errorData.message || "API request failed");
    (error as any).status = err.response?.status || 500;
    (error as any).data = errorData;
    throw error;
  }
}

// Authenticated API fetch
export async function authApiFetch1(
  endpoint: string,
  options: AxiosRequestConfig = {}
) {
  const authToken = localStorage.getItem("access_token");
  const isFormData = options.data instanceof FormData;
  try {
    const response = await axiosInstance.request({
      url: endpoint,
      headers: {
        ...(authToken
          ? {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": isFormData
                ? undefined
                : "application/json",
            }
          : {}),
        ...(options.headers || {}),
      },
      data: options.data,
      ...options,
    });
    return response.data;
  } catch (err: any) {
    const errorData = err.response?.data || {
      message: "Unknown error occurred",
    };
    const error = new Error(errorData.message || "API request failed");
    (error as any).status = err.response?.status || 500;
    (error as any).data = errorData;
    throw error;
  }
}

// Authenticated API fetch with refresh token handling
export async function authApiFetch(
  endpoint: string,
  options: AxiosRequestConfig = {}
) {
  let authToken = localStorage.getItem("access_token");
  const isFormData = options.data instanceof FormData;

  try {
    const response = await axiosInstance.request({
      url: endpoint,
      headers: {
        ...(authToken
          ? {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": isFormData
                ? undefined
                : "application/json",
            }
          : {}),
        ...(options.headers || {}),
      },
      data: options.data,
      ...options,
    });
    return response.data;
  } catch (err: any) {
    const errorData = err.response?.data || {
      message: "Unknown error occurred",
    };

    // Handle token expiration (401)
    if (err.response?.status === 401) {
      // Try to refresh the token
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          // Call the API to refresh the token
          const refreshResponse = await apiFetch("/auth/refresh", {
            method: "POST",
            data: { refresh_token: refreshToken },
          });

          // Store refreshed token securely + mirror to localStorage
          const { secureStorage } = await import('$lib/utils/secureStorage');
          await secureStorage.set('access_token', refreshResponse.access_token);
          localStorage.setItem("access_token", refreshResponse.access_token);

          // Retry the original request with the new access token
          authToken = refreshResponse.access_token;
          const retryResponse = await axiosInstance.request({
            url: endpoint,
            headers: {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": isFormData
                ? undefined
                : "application/json",
            },
            data: options.data,
            ...options,
          });

          return retryResponse.data;
        } catch (refreshError) {
          logoutUser();
          goto("/login");
          throw refreshError;
        }
      } else {
        logoutUser();
        goto("/login");
      }
    }

    const error = new Error(errorData.message || "API request failed");
    (error as any).status = err.response?.status || 500;
    (error as any).data = errorData;
    throw error;
  }
}
