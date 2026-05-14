import { writable } from 'svelte/store';

// Live count of unassigned (open/reopened) queries — updated via SSE in Notification.svelte
export const openQueryCount = writable(0);
