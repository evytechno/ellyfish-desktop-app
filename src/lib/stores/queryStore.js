import { writable } from 'svelte/store';
import { authApiFetch } from '$lib/api/client';
import { API_ROUTES } from '$lib/constants/apiRoutes';

// Live count of unassigned (open/reopened) queries — updated via SSE in Notification.svelte
export const openQueryCount = writable(0);

/** Active closed/resolved training assignments for the current user. Sidebar Training is shown only when > 0. */
export const trainingQueryCount = writable(0);

export async function loadTrainingQueryCount() {
  try {
    const res = await authApiFetch(`${API_ROUTES.QUERY}/training`);
    const list = Array.isArray(res) ? res : [];
    const now = Date.now();
    trainingQueryCount.set(
      list.filter((q) => new Date(q.trainingExpiresAt).getTime() > now).length,
    );
  } catch (_) {
    trainingQueryCount.set(0);
  }
}
