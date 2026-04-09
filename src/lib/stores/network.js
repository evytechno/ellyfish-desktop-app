import { writable } from 'svelte/store';

export const isOnline = writable(true);
export const isServerReachable = writable(true);

const API_URL = import.meta.env.VITE_PUBLIC_API_URL;

let checkInterval = null;

async function checkServer() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${API_URL}/auth/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    isServerReachable.set(res.ok || res.status === 401 || res.status === 404);
  } catch {
    isServerReachable.set(false);
  }
}

export function startNetworkMonitor() {
  // Browser online/offline events
  window.addEventListener('online',  () => { isOnline.set(true);  checkServer(); });
  window.addEventListener('offline', () => { isOnline.set(false); isServerReachable.set(false); });

  // Initial check
  checkServer();

  // Poll every 15 seconds
  checkInterval = setInterval(checkServer, 15000);
}

export function stopNetworkMonitor() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
