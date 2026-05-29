import { writable } from 'svelte/store';

export const uiToasts = writable([]);

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const ACCENTS = {
  success: '#2f9e44',
  error:   '#dc3545',
  warning: '#f59f00',
  info:    '#3b5bdb',
};

export function showToast({ type = 'info', message, duration = 4000 }) {
  const id = `${Date.now()}-${Math.random()}`;
  uiToasts.update((list) => [
    ...list,
    { id, type, message, icon: ICONS[type] ?? 'ℹ', accent: ACCENTS[type] ?? '#6c757d', createdAt: new Date() },
  ]);
  setTimeout(() => dismissToast(id), duration);
  return id;
}

export function dismissToast(id) {
  uiToasts.update((list) => list.filter((t) => t.id !== id));
}
