import { writable } from 'svelte/store';

export const isOnline          = writable(true);
export const isServerReachable = writable(true);
export const isSlowNetwork     = writable(false);

const API_URL      = import.meta.env.VITE_PUBLIC_API_URL;
const HEALTH_TIMEOUT  = 5000;   // abort health fetch after 5s
const SLOW_THRESHOLD  = 2500;   // >2.5s response time = slow network
const POLL_HEALTHY    = 15000;  // poll every 15s when all is good
const POLL_DEGRADED   = 5000;   // poll every 5s when unreachable / slow

// Local shadow of store values — avoids nested subscribe calls
let _reachable = true;
let _slow      = false;
isServerReachable.subscribe(v => (_reachable = v));
isSlowNetwork.subscribe(v     => (_slow      = v));

let _pollTimer = null;

/** Single health check — exported so the retry button can call it directly */
export async function checkServer() {
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
    const start      = Date.now();

    const res = await fetch(`${API_URL}/auth/health`, {
      method: 'GET',
      signal: controller.signal,
      cache:  'no-store',
    });

    clearTimeout(timeoutId);
    const elapsed   = Date.now() - start;
    const reachable = res.ok || res.status === 401 || res.status === 404;

    isServerReachable.set(reachable);
    // Only mark slow when server is actually up
    isSlowNetwork.set(reachable && elapsed > SLOW_THRESHOLD);
    return reachable;
  } catch {
    isServerReachable.set(false);
    isSlowNetwork.set(false);
    return false;
  }
}

/** Schedule next poll — shorter interval when degraded, longer when healthy */
function scheduleNext() {
  const delay = (_reachable && !_slow) ? POLL_HEALTHY : POLL_DEGRADED;
  _pollTimer = setTimeout(async () => {
    await checkServer();
    scheduleNext();
  }, delay);
}

export function startNetworkMonitor() {
  // Browser online / offline events
  window.addEventListener('online', () => {
    isOnline.set(true);
    checkServer();
  });
  window.addEventListener('offline', () => {
    isOnline.set(false);
    isServerReachable.set(false);
    isSlowNetwork.set(false);
  });

  // Run immediately, then start adaptive polling
  checkServer().then(() => scheduleNext());
}

export function stopNetworkMonitor() {
  if (_pollTimer) {
    clearTimeout(_pollTimer);
    _pollTimer = null;
  }
}
