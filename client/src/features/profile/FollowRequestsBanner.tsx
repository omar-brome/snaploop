import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ChevronDown, UserPlus } from 'lucide-react';
import type { Author, Page } from '../../types';
import { toast } from '../../stores/uiStore';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { cn } from '../../utils/cn';
import { errorMessage, profileApi } from './api';
import { useEndReached, useInfiniteList } from './hooks';

const REQUESTS_KEY = ['follow-requests'] as const;

/**
 * Own-profile banner for incoming follow requests. Hidden while loading or
 * when there are none; expands into Accept/Decline rows.
 */
export function FollowRequestsBanner() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { items, query, onEndReached } = useInfiniteList(REQUESTS_KEY, (cursor) =>
    profileApi.followRequests(cursor)
  );
  const sentinelRef = useEndReached(onEndReached);

  const respond = useMutation({
    mutationFn: ({ username, accept }: { username: string; accept: boolean }) =>
      accept
        ? profileApi.acceptFollowRequest(username)
        : profileApi.declineFollowRequest(username),
    onMutate: async ({ username }) => {
      await queryClient.cancelQueries({ queryKey: REQUESTS_KEY });
      const prev = queryClient.getQueryData<InfiniteData<Page<Author>>>(REQUESTS_KEY);
      queryClient.setQueryData<InfiniteData<Page<Author>>>(REQUESTS_KEY, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                data: page.data.filter((u) => u.username !== username),
              })),
            }
          : data
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(REQUESTS_KEY, ctx.prev);
      toast(errorMessage(err, 'Could not update the request'), 'error');
    },
    onSuccess: (_data, { accept }) => {
      // Accepting changes the follower count on the own profile.
      if (accept) queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
    },
  });

  if (!query.isSuccess || items.length === 0) return null;

  return (
    <section
      aria-label="Follow requests"
      className="border-b border-border-light dark:border-border-dark"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
      >
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800"
          aria-hidden
        >
          <UserPlus size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Follow requests</span>
          <span className="block text-xs text-muted-light dark:text-muted-dark">
            {items.length} pending {items.length === 1 ? 'request' : 'requests'}
          </span>
        </span>
        <ChevronDown
          size={20}
          aria-hidden
          className={cn('transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <ul className="pb-2">
          {items.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-2">
              <Link to={`/${u.username}`} className="shrink-0">
                <Avatar src={u.avatarUrl} alt={u.username} size={44} />
              </Link>
              <Link to={`/${u.username}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{u.username}</span>
                <span className="block truncate text-xs text-muted-light dark:text-muted-dark">
                  {u.fullName}
                </span>
              </Link>
              <Button
                size="sm"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ username: u.username, accept: true })}
                aria-label={`Accept follow request from ${u.username}`}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ username: u.username, accept: false })}
                aria-label={`Decline follow request from ${u.username}`}
              >
                Decline
              </Button>
            </li>
          ))}
          {query.isFetchingNextPage && (
            <li className="flex justify-center py-2">
              <Spinner size={18} />
            </li>
          )}
          <li ref={sentinelRef} className="h-px" aria-hidden />
        </ul>
      )}
    </section>
  );
}
