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

    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
            console.warn("Storage full, clearing old items that start with 'data_' ...");

            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('data_')) {
                    keysToRemove.push(k);
                }
            }

            keysToRemove.forEach(k => localStorage.removeItem(k));
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (e2) {
                console.error("Failed to save even after clearing 'data_' items:", e2);
            }
        } else {
            console.error("LocalStorage error:", e);
        }
    }
}

export function getFromLocalStorage(keyObj) {
    const key = 'data_' + JSON.stringify(keyObj);
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
}
