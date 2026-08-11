import { writable } from "svelte/store";

export const token = writable<string | null>(null);
export const isLoggedIn = writable(false);

// Persist token in localStorage
if (typeof localStorage !== "undefined") {
  const stored = localStorage.getItem("access_token");
  if (stored) token.set(stored);

  token.subscribe((value) => {
    if (value) localStorage.setItem("access_token", value);
    else localStorage.removeItem("access_token");
  });
}

// Writable store — populated after restoreSession() completes in layout onMount.
// Never read directly from localStorage at module load; that value may be stale
// or empty before the keychain restore has run.
export const authUser = writable<any>(null);

export function setAuthUser(userData: any) {
  authUser.set(userData);
}
