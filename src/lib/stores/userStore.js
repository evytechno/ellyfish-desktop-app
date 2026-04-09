import { writable } from "svelte/store";
import { browser } from "$app/environment";

let initialUser = null;

if (browser) {
  const storedUser = localStorage.getItem("user");
  if (storedUser) {
    initialUser = JSON.parse(storedUser);
  }
}

export const user = writable(initialUser);

export const setUser = (userData) => {
  user.set(userData);
  if (browser) {
    if (userData) {
      localStorage.setItem("user", JSON.stringify(userData));
    } else {
      localStorage.removeItem("user");
    }
  }
};

export const clearUser = () => {
  user.set(null);
  if (browser) {
    localStorage.removeItem("user");
  }
};
