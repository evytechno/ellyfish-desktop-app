import { writable } from 'svelte/store';

export const queryUnreadCounts = writable({});

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
