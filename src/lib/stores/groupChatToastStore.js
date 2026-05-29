import { writable } from 'svelte/store';

export const gcToasts = writable([]);

export function pushGcToast(toast) {
  const id = `${Date.now()}-${Math.random()}`;
  gcToasts.update((list) => [...list, { id, ...toast }]);
  // auto-remove after 5 s
  setTimeout(() => removeGcToast(id), 5000);
  return id;
}

export function removeGcToast(id) {
  gcToasts.update((list) => list.filter((t) => t.id !== id));
}
