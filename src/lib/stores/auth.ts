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

export const authUser = localStorage.getItem("user");
