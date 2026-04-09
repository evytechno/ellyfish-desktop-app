import { writable } from "svelte/store";

export function localStore(key, initialValue, ttl = 24 * 60 * 60 * 1000) {
  let storedValue = null;
  let timestamp = null;

  if (typeof window !== "undefined") {
    const item = localStorage.getItem(key);
    if (item) {
      const data = JSON.parse(item);
      const now = Date.now();

      if (now - data.timestamp < ttl) {
        storedValue = data.value;
        timestamp = data.timestamp;
      } else {
        localStorage.removeItem(key);
      }
    }
  }

  const parsed = storedValue ?? initialValue;
  const store = writable(parsed);

  if (typeof window !== "undefined") {
    store.subscribe((value) => {
      const data = {
        value,
        timestamp: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(data));
    });

    const now = Date.now();
    const delay = timestamp ? Math.max(ttl - (now - timestamp), 0) : ttl;

    setTimeout(() => {
      store.set(initialValue);
      localStorage.setItem(
        key,
        JSON.stringify({ value: initialValue, timestamp: Date.now() })
      );
    }, delay);
  }

  return store;
}
