import { api } from '../../services/api';
import type { Notification, Page } from '../../types';

// Notifications domain calls (docs/API.md /api/notifications + the follow
// request accept/decline endpoints that notification rows act on).

export function nextPageCursor<T>(last: Page<T>): string | undefined {
  return last.meta?.hasMore && last.meta.nextCursor ? last.meta.nextCursor : undefined;
}

export function fetchNotificationsPage(cursor?: string): Promise<Page<Notification>> {
  return api.page<Notification>('/notifications', { cursor });
}

// Empty body = mark everything read.
export function markAllNotificationsRead(): Promise<unknown> {
  return api.post('/notifications/read', {});
}

export function acceptFollowRequest(username: string): Promise<unknown> {
  return api.post(`/users/${encodeURIComponent(username)}/follow/accept`);
}

export function declineFollowRequest(username: string): Promise<unknown> {
  return api.post(`/users/${encodeURIComponent(username)}/follow/decline`);
}
