import { localStore, clearScopedLocalStore } from "./localStore";

const MIN = 60 * 1000;

// Dropdown data — changes when admin adds/edits. 10 min TTL.
export const companiesAllStore  = localStore("companiesAll",  [], 10 * MIN);
export const categoriesAllStore = localStore("categoriesAll", [], 10 * MIN);
export const usersAllStore      = localStore("usersAll",      [], 10 * MIN, { scopeByUser: true });

export function resetUsersAllStore() {
  try { usersAllStore.set([]); } catch (_) {}
  clearScopedLocalStore("usersAll");
}

// Order board state — refreshed on page load anyway. 5 min TTL.
export const ordersAllStore     = localStore("ordersAll", [], 5 * MIN);

// App settings — rarely change. 60 min TTL.
export const settingStore       = localStore("setting", null, 60 * MIN);

// Dispatched details — order-specific, keep fresh. 5 min TTL.
export const dispatchedDetailsStore = localStore("dispatchedDetails", null, 5 * MIN);

// export function saveToLocalStorage(keyObj, data) {
//     const key = 'data_' + JSON.stringify(keyObj);
//     localStorage.setItem(key, JSON.stringify(data));
//     try {
//         localStorage.setItem(key, JSON.stringify(data));
//     } catch (e) {
//         if (e instanceof DOMException && e.name === "QuotaExceededError") {
//             console.warn("Storage full, clearing old items...");
//             localStorage.clear();
//         }
//     }
// }

// export function getFromLocalStorage(keyObj) {
//     const key = 'data_' + JSON.stringify(keyObj);
//     const cached = localStorage.getItem(key);
//     return cached ? JSON.parse(cached) : null;
// }

const PAGINATED_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for paginated order lists

export function saveToLocalStorage(keyObj, data) {
    const key = 'data_' + JSON.stringify(keyObj);

    // Wrap with timestamp for TTL check on read
    const payload = { value: data, timestamp: Date.now() };

    // Update access timestamp for LRU tracking
    const lruKey = '__lru_' + key;
    try { localStorage.setItem(lruKey, Date.now().toString()); } catch (_) {}

    const trySet = () => localStorage.setItem(key, JSON.stringify(payload));

    try {
        trySet();
    } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
            // LRU eviction: remove the oldest single data_ entry and retry
            let evicted = true;
            while (evicted) {
                evicted = false;
                let oldestKey = null;
                let oldestTime = Infinity;

                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (!k || !k.startsWith('data_')) continue;
                    const lru = localStorage.getItem('__lru_' + k);
                    const t = lru ? parseInt(lru, 10) : 0;
                    if (t < oldestTime) { oldestTime = t; oldestKey = k; }
                }

                if (oldestKey && oldestKey !== key) {
                    localStorage.removeItem(oldestKey);
                    localStorage.removeItem('__lru_' + oldestKey);
                    evicted = true;
                    try { trySet(); return; } catch (_) { /* try next oldest */ }
                }
            }
            // Nothing left to evict — give up silently
        }
    }
}

export function getFromLocalStorage(keyObj) {
    const key = 'data_' + JSON.stringify(keyObj);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);

        // New format: { value, timestamp } — check TTL
        if (parsed && typeof parsed === 'object' && 'timestamp' in parsed) {
            if (Date.now() - parsed.timestamp > PAGINATED_CACHE_TTL) {
                localStorage.removeItem(key);
                localStorage.removeItem('__lru_' + key);
                return null; // expired
            }
            return parsed.value;
        }

        // Old format (no timestamp) — treat as expired, remove it
        localStorage.removeItem(key);
        localStorage.removeItem('__lru_' + key);
        return null;
    } catch (_) {
        return null;
    }
}
