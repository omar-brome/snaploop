import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Notification, Page } from '../../types';

// Helpers for patching the ['notifications'] infinite cache in place
// (optimistic accept/decline, socket prepend, mark-read).

type NotificationsData = InfiniteData<Page<Notification>, string | undefined>;

export const NOTIFICATIONS_KEY = ['notifications'] as const;

export function patchNotificationsCache(
  queryClient: QueryClient,
  updater: (items: Notification[]) => Notification[]
): void {
  queryClient.setQueryData<NotificationsData>([...NOTIFICATIONS_KEY], (old) =>
    old ? { ...old, pages: old.pages.map((p) => ({ ...p, data: updater(p.data) })) } : old
  );
}

// Live prepend onto the first page; deduped by id.
export function prependNotification(queryClient: QueryClient, n: Notification): void {
  queryClient.setQueryData<NotificationsData>([...NOTIFICATIONS_KEY], (old) => {
    if (!old || old.pages.length === 0) return old;
    if (old.pages.some((p) => p.data.some((existing) => existing.id === n.id))) return old;
    const [first, ...rest] = old.pages;
    if (!first) return old;
    return { ...old, pages: [{ ...first, data: [n, ...first.data] }, ...rest] };
  });
}
