import { writable } from 'svelte/store';
import { authApiFetch } from '$lib/api/client';
import { API_ROUTES } from '$lib/constants/apiRoutes';

/** Full list of groups the current user belongs to */
export const groupListStore = writable([]);

/** Sort groups by most recent activity — latest message (or createdAt) first */
export function sortedByActivity(groups) {
  return [...groups].sort((a, b) => {
    const aTime = new Date(a.lastMessage?.createdAt ?? a.createdAt ?? 0).getTime();
    const bTime = new Date(b.lastMessage?.createdAt ?? b.createdAt ?? 0).getTime();
    return bTime - aTime;
  });
}

/** { [groupId]: unreadCount } */
export const groupUnreadStore = writable({});

/** Total unread across all groups */
export const totalGroupUnread = writable(0);

function recalcTotal(counts) {
  return Object.values(counts).reduce((s, n) => s + n, 0);
}

export function incrementGroupUnread(groupId) {
  groupUnreadStore.update((counts) => {
    const next = { ...counts, [groupId]: (counts[groupId] ?? 0) + 1 };
    totalGroupUnread.set(recalcTotal(next));
    return next;
  });
}

export function clearGroupUnread(groupId) {
  groupUnreadStore.update((counts) => {
    const next = { ...counts };
    delete next[groupId];
    totalGroupUnread.set(recalcTotal(next));
    return next;
  });
}

export async function loadGroupUnread() {
  try {
    const data = await authApiFetch(`${API_ROUTES.GROUP_CHAT}/unread`);
    const counts = data ?? {};
    groupUnreadStore.set(counts);
    totalGroupUnread.set(recalcTotal(counts));
  } catch (_) {}
}

export async function loadGroupList() {
  try {
    const data = await authApiFetch(API_ROUTES.GROUP_CHAT);
    groupListStore.set(sortedByActivity(data ?? []));
  } catch (_) {}
}
