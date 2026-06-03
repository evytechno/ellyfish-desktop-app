import { localStore } from "./localStore";

export const companiesAllStore = localStore("companiesAll", []);
export const categoriesAllStore = localStore("categoriesAll", []);
export const usersAllStore = localStore("usersAll", []);
export const ordersAllStore = localStore("ordersAll", []);
export const settingStore = localStore("setting", null);
export const dispatchedDetailsStore = localStore("dispatchedDetails", null);

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

export function saveToLocalStorage(keyObj, data) {
    const key = 'data_' + JSON.stringify(keyObj);

    // Update access timestamp for LRU tracking
    const lruKey = '__lru_' + key;
    try { localStorage.setItem(lruKey, Date.now().toString()); } catch (_) {}

    const trySet = () => localStorage.setItem(key, JSON.stringify(data));

    try {
        trySet();
    } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
            // LRU eviction: remove the oldest single data_ entry and retry
            // Repeat until it fits or nothing left to evict
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
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
}
