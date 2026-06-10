import { Fragment, useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import type { Notification } from '../types';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { getSocket } from '../services/socket';
import { toast } from '../stores/uiStore';
import {
  fetchNotificationsPage,
  markAllNotificationsRead,
  nextPageCursor,
} from '../features/notifications/api';
import {
  NOTIFICATIONS_KEY,
  patchNotificationsCache,
  prependNotification,
} from '../features/notifications/cache';
import { groupNotifications, sectionLabel } from '../features/notifications/notificationUtils';
import { NotificationRow } from '../features/notifications/NotificationRow';
import { PushBanner } from '../features/notifications/PushBanner';
import { initPushNotifications } from '../features/notifications/push';

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-20" />
      </div>
      <Skeleton className="h-11 w-11 shrink-0 rounded-md" />
    </div>
  );
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_KEY],
    queryFn: ({ pageParam }) => fetchNotificationsPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageCursor,
  });

  // Mark-all-read. The auto-fire on mount keeps the unread tint visible for
  // this visit (updateRows: false); the header button clears it too.
  const markRead = useMutation({
    mutationFn: (_vars: { updateRows: boolean }) => markAllNotificationsRead(),
    onSuccess: (_data, vars) => {
      if (vars.updateRows) {
        patchNotificationsCache(queryClient, (items) =>
          items.map((n) => (n.isRead ? n : { ...n, isRead: true }))
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
    },
    onError: (err, vars) => {
      if (vars.updateRows) {
        toast(err instanceof Error ? err.message : 'Could not mark as read', 'error');
      }
    },
  });

  // Clear the unread badge once the first page is in.
  const markedOnMount = useRef(false);
  const { isSuccess } = query;
  const { mutate: mutateMarkRead } = markRead;
  useEffect(() => {
    if (isSuccess && !markedOnMount.current) {
      markedOnMount.current = true;
      mutateMarkRead({ updateRows: false });
    }
  }, [isSuccess, mutateMarkRead]);

  // Live prepend (deduped) + badge invalidation.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = (n: Notification) => {
      prependNotification(queryClient, n);
      void queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
    };
    socket.on('new_notification', onNew);
    return () => {
      socket.off('new_notification', onNew);
    };
  }, [queryClient]);

  // If push permission was granted on a previous visit, attach the
  // module-level local-notification listener.
  useEffect(() => {
    initPushNotifications();
  }, []);

  const notifications = useMemo(() => {
    const all = query.data?.pages.flatMap((p) => p.data) ?? [];
    const seen = new Set<string>();
    return all.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  }, [query.data]);

  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  // Infinite scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <section className="mx-auto w-full max-w-[600px] pb-16 md:py-6" aria-label="Notifications">
      <header className="flex items-center justify-between px-4 py-4 md:px-0">
        <h1 className="text-xl font-bold">Notifications</h1>
        <Button
          variant="text"
          size="sm"
          onClick={() => markRead.mutate({ updateRows: true })}
          loading={markRead.isPending}
          disabled={!query.isSuccess || notifications.length === 0}
        >
          Mark all as read
        </Button>
      </header>

      <PushBanner />

      {query.isLoading && (
        <div aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      )}

      {query.isError && (
        <EmptyState
          icon={Heart}
          title="Couldn't load notifications"
          body="Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {query.isSuccess && groups.length === 0 && (
        <EmptyState
          icon={Heart}
          title="Activity on your posts"
          body="When someone likes or comments on one of your posts, you'll see it here."
        />
      )}

      {query.isSuccess && groups.length > 0 && (
        <div aria-busy={isFetchingNextPage} aria-label="Notifications list">
          {groups.map((group, i) => {
            const label = sectionLabel(group.head.createdAt);
            const prevGroup = i > 0 ? groups[i - 1] : undefined;
            const showHeader = !prevGroup || sectionLabel(prevGroup.head.createdAt) !== label;
            return (
              <Fragment key={group.key}>
                {showHeader && (
                  <h2 className="border-b border-border-light px-4 pb-2 pt-4 text-base font-bold dark:border-border-dark">
                    {label}
                  </h2>
                )}
                <NotificationRow group={group} />
              </Fragment>
            );
          })}
        </div>
      )}

      <div ref={sentinelRef} aria-hidden />
      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Spinner size={28} />
        </div>
      )}
    </section>
  );
}
