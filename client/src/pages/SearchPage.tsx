import { ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { BadgeCheck, Hash, MapPin, Search, SearchX, X } from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import {
  nextPageCursor,
  searchAll,
  searchHashtags,
  searchPlaces,
  searchUsers,
} from '../features/explore/api';
import {
  RecentSearch,
  clearRecentSearches,
  getRecentSearches,
  removeRecentSearch,
  saveRecentSearch,
} from '../features/explore/recentSearches';
import { useDebouncedValue } from '../features/explore/useDebouncedValue';
import { useEndReached } from '../features/explore/useEndReached';
import type { HashtagResult, PlaceResult, UserSearchResult } from '../types';
import { cn } from '../utils/cn';
import { formatCount } from '../utils/timeAgo';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'tags', label: 'Tags' },
  { id: 'places', label: 'Places' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const rowClass =
  'flex items-center gap-3 px-3 py-2 transition-colors hover:bg-neutral-50 focus-visible:bg-neutral-100 focus-visible:outline-none dark:hover:bg-neutral-900 dark:focus-visible:bg-neutral-800';

function userEntry(u: UserSearchResult): RecentSearch {
  return { type: 'user', label: u.username, href: `/${u.username}`, avatarUrl: u.avatarUrl ?? undefined };
}
function tagEntry(t: HashtagResult): RecentSearch {
  return { type: 'tag', label: t.name, href: `/explore/tags/${encodeURIComponent(t.name)}` };
}
function placeEntry(p: PlaceResult): RecentSearch {
  return { type: 'place', label: p.name, href: `/explore/places/${encodeURIComponent(p.name)}` };
}

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const debouncedQ = useDebouncedValue(q.trim(), 300);
  const active = debouncedQ.length > 0;
  const [recents, setRecents] = useState<RecentSearch[]>(() => getRecentSearches());

  const remember = (entry: RecentSearch) => setRecents(saveRecentSearch(entry));

  const allQuery = useQuery({
    queryKey: ['search', debouncedQ],
    queryFn: () => searchAll(debouncedQ),
    enabled: active && tab === 'all',
  });

  const usersQuery = useInfiniteQuery({
    queryKey: ['search', 'users', debouncedQ],
    queryFn: ({ pageParam }) => searchUsers(debouncedQ, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageCursor,
    enabled: active && tab === 'accounts',
  });
  const tagsQuery = useInfiniteQuery({
    queryKey: ['search', 'hashtags', debouncedQ],
    queryFn: ({ pageParam }) => searchHashtags(debouncedQ, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageCursor,
    enabled: active && tab === 'tags',
  });
  const placesQuery = useInfiniteQuery({
    queryKey: ['search', 'places', debouncedQ],
    queryFn: ({ pageParam }) => searchPlaces(debouncedQ, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageCursor,
    enabled: active && tab === 'places',
  });

  const users = useMemo(() => dedupeBy(usersQuery.data?.pages.flatMap((p) => p.data) ?? [], (u) => u.id), [usersQuery.data]);
  const tags = useMemo(() => dedupeBy(tagsQuery.data?.pages.flatMap((p) => p.data) ?? [], (t) => t.name), [tagsQuery.data]);
  const places = useMemo(() => dedupeBy(placesQuery.data?.pages.flatMap((p) => p.data) ?? [], (p) => p.name), [placesQuery.data]);

  // One sentinel serves whichever paginated tab is active.
  const sentinelRef = useEndReached(() => {
    const query = tab === 'accounts' ? usersQuery : tab === 'tags' ? tagsQuery : tab === 'places' ? placesQuery : null;
    if (query && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  });

  const allEmpty =
    allQuery.isSuccess &&
    allQuery.data.users.length === 0 &&
    allQuery.data.hashtags.length === 0 &&
    allQuery.data.places.length === 0;

  return (
    <main className="mx-auto w-full max-w-2xl pb-16 md:px-4 md:py-6" aria-label="Search">
      <form role="search" className="px-3 pt-4 md:px-0 md:pt-0" onSubmit={(e) => e.preventDefault()}>
        <div className="relative">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <Input
            type="text"
            name="q"
            aria-label="Search"
            placeholder="Search"
            autoComplete="off"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-lg pl-9 pr-9"
          />
          {q.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQ('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-neutral-300 p-0.5 text-white hover:bg-neutral-400 dark:bg-neutral-600 dark:hover:bg-neutral-500"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </form>

      {!active && (
        <section aria-label="Recent searches" className="mt-2">
          <div className="flex items-center justify-between px-3 py-2">
            <h2 className="text-base font-semibold">Recent</h2>
            {recents.length > 0 && (
              <Button
                variant="text"
                onClick={() => {
                  clearRecentSearches();
                  setRecents([]);
                }}
              >
                Clear all
              </Button>
            )}
          </div>
          {recents.length === 0 ? (
            <p className="px-3 py-12 text-center text-sm text-muted-light dark:text-muted-dark">
              No recent searches.
            </p>
          ) : (
            <ul>
              {recents.map((r) => (
                <li key={r.href} className="flex items-center">
                  <Link
                    to={r.href}
                    onClick={() => remember(r)}
                    className={cn(rowClass, 'min-w-0 flex-1')}
                  >
                    {r.type === 'user' ? (
                      <Avatar src={r.avatarUrl} alt={r.label} size={44} />
                    ) : (
                      <IconCircle>{r.type === 'tag' ? <Hash size={20} /> : <MapPin size={20} />}</IconCircle>
                    )}
                    <span className="truncate text-sm font-semibold">
                      {r.type === 'tag' ? `#${r.label}` : r.label}
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Remove ${r.label} from recent searches`}
                    onClick={() => setRecents(removeRecentSearch(r.href))}
                    className="p-3 text-muted-light hover:text-black dark:text-muted-dark dark:hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {active && (
        <>
          <div
            role="tablist"
            aria-label="Result types"
            className="mt-3 flex border-b border-border-light dark:border-border-dark"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex-1 border-b-2 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                  tab === t.id
                    ? 'border-current'
                    : 'border-transparent text-muted-light hover:text-black dark:text-muted-dark dark:hover:text-white'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="pt-1">
            {tab === 'all' && (
              <>
                {allQuery.isLoading && <RowSkeletons />}
                {allQuery.isError && <SearchError onRetry={() => void allQuery.refetch()} />}
                {allEmpty && <NoResults q={debouncedQ} />}
                {allQuery.isSuccess && !allEmpty && (
                  <>
                    {allQuery.data.users.length > 0 && (
                      <Section title="Accounts" onSeeAll={() => setTab('accounts')}>
                        {allQuery.data.users.map((u) => (
                          <UserRow key={u.id} user={u} onPick={remember} />
                        ))}
                      </Section>
                    )}
                    {allQuery.data.hashtags.length > 0 && (
                      <Section title="Tags" onSeeAll={() => setTab('tags')}>
                        {allQuery.data.hashtags.map((t) => (
                          <TagRow key={t.name} tag={t} onPick={remember} />
                        ))}
                      </Section>
                    )}
                    {allQuery.data.places.length > 0 && (
                      <Section title="Places" onSeeAll={() => setTab('places')}>
                        {allQuery.data.places.map((p) => (
                          <PlaceRow key={p.name} place={p} onPick={remember} />
                        ))}
                      </Section>
                    )}
                  </>
                )}
              </>
            )}

            {tab === 'accounts' && (
              <>
                {usersQuery.isLoading && <RowSkeletons />}
                {usersQuery.isError && <SearchError onRetry={() => void usersQuery.refetch()} />}
                {usersQuery.isSuccess &&
                  (users.length === 0 ? (
                    <NoResults q={debouncedQ} />
                  ) : (
                    users.map((u) => <UserRow key={u.id} user={u} onPick={remember} />)
                  ))}
              </>
            )}

            {tab === 'tags' && (
              <>
                {tagsQuery.isLoading && <RowSkeletons />}
                {tagsQuery.isError && <SearchError onRetry={() => void tagsQuery.refetch()} />}
                {tagsQuery.isSuccess &&
                  (tags.length === 0 ? (
                    <NoResults q={debouncedQ} />
                  ) : (
                    tags.map((t) => <TagRow key={t.name} tag={t} onPick={remember} />)
                  ))}
              </>
            )}

            {tab === 'places' && (
              <>
                {placesQuery.isLoading && <RowSkeletons />}
                {placesQuery.isError && <SearchError onRetry={() => void placesQuery.refetch()} />}
                {placesQuery.isSuccess &&
                  (places.length === 0 ? (
                    <NoResults q={debouncedQ} />
                  ) : (
                    places.map((p) => <PlaceRow key={p.name} place={p} onPick={remember} />)
                  ))}
              </>
            )}

            {tab !== 'all' && <div ref={sentinelRef} className="h-px" aria-hidden />}
            {(usersQuery.isFetchingNextPage ||
              tagsQuery.isFetchingNextPage ||
              placesQuery.isFetchingNextPage) && (
              <div className="flex justify-center py-4">
                <Spinner size={24} />
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(key(item)) ? false : (seen.add(key(item)), true)));
}

function IconCircle({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-light text-neutral-700 dark:border-border-dark dark:text-neutral-300"
    >
      {children}
    </span>
  );
}

function Section({ title, onSeeAll, children }: { title: string; onSeeAll: () => void; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between px-3 pb-1 pt-4">
        <h2 className="text-sm font-semibold text-muted-light dark:text-muted-dark">{title}</h2>
        <Button variant="text" onClick={onSeeAll} className="text-sm">
          See all
        </Button>
      </div>
      {children}
    </section>
  );
}

function UserRow({ user, onPick }: { user: UserSearchResult; onPick: (entry: RecentSearch) => void }) {
  const subtitle = [
    user.fullName,
    `${formatCount(user.followerCount)} followers`,
    user.mutualCount ? `Followed by ${user.mutualCount} you follow` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link to={`/${user.username}`} onClick={() => onPick(userEntry(user))} className={rowClass}>
      <Avatar src={user.avatarUrl} alt={user.username} size={44} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold">
          <span className="truncate">{user.username}</span>
          {user.isVerified && (
            <BadgeCheck size={14} aria-label="Verified" className="shrink-0 fill-primary text-white dark:text-black" />
          )}
        </span>
        <span className="block truncate text-sm text-muted-light dark:text-muted-dark">{subtitle}</span>
      </span>
    </Link>
  );
}

function TagRow({ tag, onPick }: { tag: HashtagResult; onPick: (entry: RecentSearch) => void }) {
  return (
    <Link
      to={`/explore/tags/${encodeURIComponent(tag.name)}`}
      onClick={() => onPick(tagEntry(tag))}
      className={rowClass}
    >
      <IconCircle>
        <Hash size={20} />
      </IconCircle>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">#{tag.name}</span>
        <span className="block text-sm text-muted-light dark:text-muted-dark">
          {formatCount(tag.postCount)} posts
        </span>
      </span>
    </Link>
  );
}

function PlaceRow({ place, onPick }: { place: PlaceResult; onPick: (entry: RecentSearch) => void }) {
  return (
    <Link
      to={`/explore/places/${encodeURIComponent(place.name)}`}
      onClick={() => onPick(placeEntry(place))}
      className={rowClass}
    >
      <IconCircle>
        <MapPin size={20} />
      </IconCircle>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{place.name}</span>
        <span className="block text-sm text-muted-light dark:text-muted-dark">
          {formatCount(place.postCount)} posts
        </span>
      </span>
    </Link>
  );
}

function RowSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden className="pt-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoResults({ q }: { q: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title="No results found"
      body={`Couldn't find anything for "${q}". Try searching for something else.`}
    />
  );
}

function SearchError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title="Something went wrong"
      body="Check your connection and try again."
      action={
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}
