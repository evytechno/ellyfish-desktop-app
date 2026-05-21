import { writable } from "svelte/store";

const KEY = "query_privacy_v1";
const defaults = { telecaller: false, tech: false };

function readStorage() {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch (_) {
    return defaults;
  }
}

function createStore() {
  const { subscribe, update } = writable(readStorage());

  function persist(fn) {
    update((v) => {
      const next = fn(v);
      if (typeof window !== "undefined") {
        localStorage.setItem(KEY, JSON.stringify(next));
      }
      return next;
    });
  }

  return {
    subscribe,
    toggleTelecaller() { persist((v) => ({ ...v, telecaller: !v.telecaller })); },
    toggleTech()       { persist((v) => ({ ...v, tech: !v.tech })); },
  };
}

export const queryPrivacy = createStore();
