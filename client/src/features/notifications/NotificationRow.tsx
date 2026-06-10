import { KeyboardEvent, MouseEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '../../types';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { useFollow } from '../../hooks/useFollow';
import { toast } from '../../stores/uiStore';
import { timeAgo } from '../../utils/timeAgo';
import { cn } from '../../utils/cn';
import { acceptFollowRequest, declineFollowRequest } from './api';
import { NOTIFICATIONS_KEY, patchNotificationsCache } from './cache';
import { actionText, targetPath, type NotificationGroup } from './notificationUtils';

// One activity row: avatar(s) + "username action time" + per-type right side
// (Accept/Decline, Follow back, target thumbnail). The whole row taps through
// to the target; inner controls stop propagation.

const stop = (e: MouseEvent) => e.stopPropagation();

// Local-toggle follow-back: we don't know the follow state from the
// notification payload, so the button simply flips on click (v1).
function FollowBackButton({ username }: { username: string }) {
  const [following, setFollowing] = useState(false);
  const follow = useFollow(username);

  return (
    <Button
      size="sm"
      variant={following ? 'secondary' : 'primary'}
      onClick={(e) => {
        e.stopPropagation();
        const next = !following;
        setFollowing(next);
        follow.mutate({ follow: next });
      }}
      className="shrink-0"
    >
      {following ? 'Following' : 'Follow back'}
    </Button>
  );
}

// Accept flips the row to a FOLLOW ("started following you") optimistically;
// decline removes it. Both roll back the cache on error.
function FollowRequestActions({ notification }: { notification: Notification }) {
  const queryClient = useQueryClient();
  const username = notification.sender.username;

  const snapshot = async () => {
    await queryClient.cancelQueries({ queryKey: [...NOTIFICATIONS_KEY] });
    return { prev: queryClient.getQueryData([...NOTIFICATIONS_KEY]) };
  };
  const rollback = (err: unknown, ctx?: { prev: unknown }) => {
    if (ctx?.prev !== undefined) queryClient.setQueryData([...NOTIFICATIONS_KEY], ctx.prev);
    toast(err instanceof Error ? err.message : 'Action failed', 'error');
  };

  const accept = useMutation({
    mutationFn: () => acceptFollowRequest(username),
    onMutate: async () => {
      const ctx = await snapshot();
      patchNotificationsCache(queryClient, (items) =>
        items.map((n) =>
          n.id === notification.id ? { ...n, type: 'FOLLOW' as const, isRead: true } : n
        )
      );
      return ctx;
    },
    onError: (err, _vars, ctx) => rollback(err, ctx),
  });

  const decline = useMutation({
    mutationFn: () => declineFollowRequest(username),
    onMutate: async () => {
      const ctx = await snapshot();
      patchNotificationsCache(queryClient, (items) => items.filter((n) => n.id !== notification.id));
      return ctx;
    },
    onError: (err, _vars, ctx) => rollback(err, ctx),
  });

  const busy = accept.isPending || decline.isPending;
  return (
    <span className="flex shrink-0 items-center gap-2">
      <Button
        size="sm"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          accept.mutate();
        }}
        aria-label={`Accept follow request from ${username}`}
      >
        Accept
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          decline.mutate();
        }}
        aria-label={`Decline follow request from ${username}`}
      >
        Decline
      </Button>
    </span>
  );
}

export function NotificationRow({ group }: { group: NotificationGroup }) {
  const navigate = useNavigate();
  const { head, senders } = group;
  const others = senders.length - 1;
  const unread = !group.isRead;
  const thumbnail = head.preview?.thumbnailUrl ?? null;

  const text = `${head.sender.username}${others > 0 ? ` and ${others} other${others > 1 ? 's' : ''}` : ''} ${actionText(head.type)}`;

  const go = () => navigate(targetPath(head));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Only when the row itself is focused — inner buttons/links handle their own keys.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go();
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={onKeyDown}
      aria-label={`${text}, ${timeAgo(head.createdAt)}${unread ? ', unread' : ''}`}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 px-4 py-3 transition-colors',
        'hover:bg-neutral-50 dark:hover:bg-neutral-900',
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
        unread && 'bg-primary/5 dark:bg-primary/10'
      )}
    >
      {/* Avatar(s) — stacked pair for grouped rows */}
      {senders.length > 1 ? (
        <span className="relative h-11 w-11 shrink-0" aria-hidden>
          <Avatar src={senders[1]?.avatarUrl} alt="" size={30} className="absolute bottom-0 right-0" />
          <Avatar
            src={senders[0]?.avatarUrl}
            alt=""
            size={30}
            className="absolute left-0 top-0 ring-2 ring-white dark:ring-black"
          />
        </span>
      ) : (
        <Link
          to={`/${head.sender.username}`}
          onClick={stop}
          className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={`${head.sender.username}'s profile`}
        >
          <Avatar src={head.sender.avatarUrl} alt={head.sender.username} size={44} />
        </Link>
      )}

      {/* Action text */}
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <Link
          to={`/${head.sender.username}`}
          onClick={stop}
          className="font-semibold hover:opacity-70"
        >
          {head.sender.username}
        </Link>
        {others > 0 && (
          <>
            {' '}
            and {others} other{others > 1 ? 's' : ''}
          </>
        )}{' '}
        {actionText(head.type)}{' '}
        <span className="whitespace-nowrap text-muted-light dark:text-muted-dark">
          {timeAgo(head.createdAt)}
        </span>
      </p>

      {/* Right side: per-type action, target thumbnail, unread dot */}
      {head.type === 'FOLLOW_REQUEST' && <FollowRequestActions notification={head} />}
      {head.type === 'FOLLOW' && <FollowBackButton username={head.sender.username} />}
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          width={44}
          height={44}
          loading="lazy"
          className="h-11 w-11 shrink-0 rounded-md object-cover"
        />
      )}
      {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
    </div>
  );
}
