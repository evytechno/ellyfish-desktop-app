import { writable } from 'svelte/store';

export const uiToasts = writable([]);

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'i',
};

const TITLES = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

const ACCENTS = {
  success: '#2f9e44',
  error:   '#e03131',
  warning: '#e67700',
  info:    '#3b5bdb',
};

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const timers = new Map();

export function showToast({ type = 'info', message, duration = 3800, title } = {}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const toast = {
    id,
    type,
    message: String(message ?? ''),
    title: title ?? TITLES[type] ?? 'Info',
    icon: ICONS[type] ?? 'i',
    accent: ACCENTS[type] ?? '#6c757d',
    duration,
    createdAt: new Date(),
  };

  uiToasts.update((list) => [...list.slice(-4), toast]);

  if (duration > 0) {
    const timer = setTimeout(() => dismissToast(id), duration);
    timers.set(id, timer);
  }
  return id;
}

export function dismissToast(id) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  uiToasts.update((list) => list.filter((t) => t.id !== id));
}
