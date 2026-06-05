import { writable } from 'svelte/store';

export const queryToasts = writable([]);

export function pushQueryToast(toast) {
  const id = `${Date.now()}-${Math.random()}`;
  queryToasts.update((list) => [...list, { id, ...toast }]);
  setTimeout(() => removeQueryToast(id), 5000);
  return id;
}

export function removeQueryToast(id) {
  queryToasts.update((list) => list.filter((t) => t.id !== id));
}
