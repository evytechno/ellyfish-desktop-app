import { writable } from "svelte/store";

function currentUserId() {
  if (typeof window === "undefined") return null;
  try {
    const u = JSON.parse(localStorage.getItem("user") || "null");
    return u?.id ?? null;
  } catch {
    return null;
  }
}

export function localStore(key, initialValue, ttl = 24 * 60 * 60 * 1000, options = {}) {
  const resolveKey = () => {
    if (!options.scopeByUser) return key;
    const id = currentUserId();
    return id != null ? `${key}:${id}` : null;
  };

  let storedValue = null;
  let timestamp = null;

  if (typeof window !== "undefined") {
    // Drop the old unscoped key so a previous admin session cannot leak.
    if (options.scopeByUser) {
      try { localStorage.removeItem(key); } catch (_) {}
    }

    let skipRestore = false;
    if (options.scopeByUser) {
      try {
        skipRestore = JSON.parse(localStorage.getItem("user") || "null")?.role === "user";
      } catch (_) {}
    }

    const storageKey = skipRestore ? null : resolveKey();
    if (storageKey) {
      const item = localStorage.getItem(storageKey);
      if (item) {
        try {
          const data = JSON.parse(item);
          const now = Date.now();
          if (now - data.timestamp < ttl) {
            storedValue = data.value;
            timestamp = data.timestamp;
          } else {
            localStorage.removeItem(storageKey);
          }
        } catch (_) {
          localStorage.removeItem(storageKey);
        }
      }
    }
  }

  const parsed = storedValue ?? initialValue;
  const store = writable(parsed);

  if (typeof window !== "undefined") {
    store.subscribe((value) => {
      if (options.scopeByUser) {
        try {
          const u = JSON.parse(localStorage.getItem("user") || "null");
          if (u?.role === "user") return;
        } catch (_) {}
      }
      const storageKey = resolveKey();
      if (!storageKey) return;
      const data = {
        value,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch (_) {}
    });

    const now = Date.now();
    const delay = timestamp ? Math.max(ttl - (now - timestamp), 0) : ttl;

    setTimeout(() => {
      store.set(initialValue);
      const storageKey = resolveKey();
      if (!storageKey) return;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ value: initialValue, timestamp: Date.now() }),
        );
      } catch (_) {}
    }, delay);
  }

  return store;
}

export function clearScopedLocalStore(keyPrefix) {
  if (typeof window === "undefined") return;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k === keyPrefix || (k && k.startsWith(`${keyPrefix}:`))) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}
