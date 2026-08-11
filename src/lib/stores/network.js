import { writable } from 'svelte/store';

export const isOnline          = writable(true);
export const isServerReachable = writable(true);
export const isSlowNetwork     = writable(false);

const API_URL         = import.meta.env.VITE_PUBLIC_API_URL;
const HEALTH_TIMEOUT  = 8000;   // abort health fetch after 8s (live server has real latency)
const SLOW_THRESHOLD  = 3000;   // >3s response time = slow network
const POLL_HEALTHY    = 20000;  // poll every 20s when all is good
const POLL_DEGRADED   = 5000;   // poll every 5s when unreachable / slow

// How many consecutive failures before showing the blocking modal.
// Prevents a single packet-drop / momentary server GC pause from blocking the UI.
const FAILURE_THRESHOLD = 2;
let _failCount = 0;

// Local shadow of store values — avoids nested subscribe calls
let _reachable = true;
let _slow      = false;
let _online    = true;
isServerReachable.subscribe(v => (_reachable = v));
isSlowNetwork.subscribe(v     => (_slow      = v));
isOnline.subscribe(v          => (_online    = v));

let _pollTimer = null;
let _started   = false;

// Listener refs stored so stopNetworkMonitor can remove them cleanly
let _onOnline     = null;
let _onOffline    = null;
let _onVisibility = null;

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

    if (reachable) {
      // Success — reset failure counter and restore reachable state immediately
      _failCount = 0;
      if (!_reachable) isServerReachable.set(true);
      const slow = elapsed > SLOW_THRESHOLD;
      if (slow !== _slow) isSlowNetwork.set(slow);
    } else {
      // HTTP error (5xx etc.) — count as a failure
      _failCount++;
      if (_failCount >= FAILURE_THRESHOLD) {
        isServerReachable.set(false);
        isSlowNetwork.set(false);
      }
    }

    return reachable;
  } catch {
    // Network-level failure (timeout, DNS, refused)
    _failCount++;
    if (_failCount >= FAILURE_THRESHOLD) {
      isServerReachable.set(false);
      isSlowNetwork.set(false);
    }
    return false;
  }
}

/** Schedule next poll — shorter interval when degraded, longer when healthy */
function scheduleNext() {
  const delay = (_reachable && !_slow) ? POLL_HEALTHY : POLL_DEGRADED;
  _pollTimer = setTimeout(async () => {
    if (_online) await checkServer();  // skip poll when browser reports offline
    scheduleNext();
  }, delay);
}

export function startNetworkMonitor() {
  if (_started) return;
  _started = true;

  _onOnline = () => {
    isOnline.set(true);
    _failCount = 0;
    checkServer();
  };
  _onOffline = () => {
    isOnline.set(false);
    isServerReachable.set(false);
    isSlowNetwork.set(false);
  };
  _onVisibility = () => {
    if (document.visibilityState === 'visible') checkServer();
  };

  window.addEventListener('online',           _onOnline);
  window.addEventListener('offline',          _onOffline);
  document.addEventListener('visibilitychange', _onVisibility);

  // Run immediately, then start adaptive polling
  checkServer().then(() => scheduleNext());
}

export function stopNetworkMonitor() {
  _started = false;
  if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
  if (_onOnline)     window.removeEventListener('online',             _onOnline);
  if (_onOffline)    window.removeEventListener('offline',            _onOffline);
  if (_onVisibility) document.removeEventListener('visibilitychange', _onVisibility);
  _onOnline = _onOffline = _onVisibility = null;
}
