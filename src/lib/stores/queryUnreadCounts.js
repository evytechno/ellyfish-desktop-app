import { writable } from 'svelte/store';
import { authApiFetch } from '$lib/api/client';
import { API_ROUTES } from '$lib/constants/apiRoutes';

export const queryUnreadCounts = writable({});

/** Fetch unread counts from backend and populate the store (tech/telecaller only). */
export async function loadUnreadCounts() {
  try {
    const data = await authApiFetch(`${API_ROUTES.QUERY}/chat-unread`);
    queryUnreadCounts.set(data ?? {});
  } catch (_) {}
}

export function incrementUnread(queryId) {
  queryUnreadCounts.update((counts) => ({
    ...counts,
    [queryId]: (counts[queryId] ?? 0) + 1,
  }));
}

export function clearUnread(queryId) {
  queryUnreadCounts.update((counts) => {
    const next = { ...counts };
    delete next[queryId];
    return next;
  });
}
