import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Search, Users } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { FollowButton } from '../feed/FollowButton';
import { errorCode, profileApi } from './api';
import { useEndReached, useInfiniteList } from './hooks';

interface FollowListModalProps {
  username: string;
  type: 'followers' | 'following';
  open: boolean;
  onClose: () => void;
}

/**
 * Followers / following modal: infinite list with a client-side search
 * filter, follow buttons per row and a private-account (403) fallback.
 */
export function FollowListModal({ username, type, open, onClose }: FollowListModalProps) {
  const me = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState('');

  const { items, query, onEndReached } = useInfiniteList(
    ['profile', username, type],
    (cursor) =>
      type === 'followers'
        ? profileApi.followers(username, cursor)
        : profileApi.following(username, cursor),
    open
  );
  const sentinelRef = useEndReached(onEndReached);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (u) => u.username.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q)
    );
  }, [items, filter]);

  const isPrivate = query.isError && errorCode(query.error) === 'PRIVATE_ACCOUNT';
  const title = type === 'followers' ? 'Followers' : 'Following';

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-sm">
      <div className="flex min-h-[18rem] flex-col">
        {!query.isError && (
          <div className="relative px-4 pt-3">
            <Search
              size={16}
              className="pointer-events-none absolute left-7 top-1/2 mt-1.5 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search"
              aria-label={`Search ${title.toLowerCase()}`}
              className="w-full rounded-lg bg-neutral-100 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-neutral-400 focus:ring-1 focus:ring-neutral-300 dark:bg-neutral-800 dark:focus:ring-neutral-600"
            />
          </div>
        )}

        <div className="flex-1 px-2 py-2">
          {query.isLoading && (
            <div className="space-y-1 px-2" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isPrivate && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <Lock size={28} aria-hidden />
              <p className="text-sm font-semibold">This account is private</p>
              <p className="text-xs text-muted-light dark:text-muted-dark">
                Follow @{username} to see their {type}.
              </p>
            </div>
          )}

          {query.isError && !isPrivate && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-muted-light dark:text-muted-dark">
                Couldn't load {type}.
              </p>
              <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                Retry
              </Button>
            </div>
          )}

          {query.isSuccess && filtered.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <Users size={28} aria-hidden />
              <p className="text-sm text-muted-light dark:text-muted-dark">
                {filter.trim()
                  ? 'No people found.'
                  : type === 'followers'
                    ? 'No followers yet.'
                    : 'Not following anyone yet.'}
              </p>
            </div>
          )}

          {query.isSuccess && filtered.length > 0 && (
            <ul aria-label={title}>
              {filtered.map((u) => (
                <li key={u.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <Link to={`/${u.username}`} onClick={onClose} className="shrink-0">
                    <Avatar src={u.avatarUrl} alt={u.username} size={44} />
                  </Link>
                  <Link to={`/${u.username}`} onClick={onClose} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{u.username}</span>
                    <span className="block truncate text-xs text-muted-light dark:text-muted-dark">
                      {u.fullName}
                    </span>
                  </Link>
                  {me && u.id !== me.id && (
                    <FollowButton username={u.username} initialStatus={u.followStatus} size="sm" />
                  )}
                </li>
              ))}
            </ul>
          )}

          {query.isFetchingNextPage && (
            <div className="flex justify-center py-3">
              <Spinner size={20} />
            </div>
          )}
          {query.isSuccess && <div ref={sentinelRef} className="h-px" aria-hidden />}
        </div>
      </div>
    </Modal>
  );
}
