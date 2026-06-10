import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bookmark,
  Camera,
  Clapperboard,
  Grid3x3,
  Lock,
  SquareUser,
  UserX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { GridSkeleton, Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { cn } from '../utils/cn';
import { PostGrid } from '../features/explore/PostGrid';
import { HighlightsRow } from '../features/stories/HighlightsRow';
import { errorCode, errorMessage, profileApi } from '../features/profile/api';
import { shouldRetry, useInfiniteList } from '../features/profile/hooks';
import { FollowRequestsBanner } from '../features/profile/FollowRequestsBanner';
import { ProfileHeader } from '../features/profile/ProfileHeader';
import { ReelGrid } from '../features/profile/ReelGrid';
import { SavedTab } from '../features/profile/SavedTab';

type TabKey = 'posts' | 'reels' | 'tagged' | 'saved';

const TABS: { key: TabKey; label: string; icon: LucideIcon; ownOnly?: boolean }[] = [
  { key: 'posts', label: 'Posts', icon: Grid3x3 },
  { key: 'reels', label: 'Reels', icon: Clapperboard },
  { key: 'tagged', label: 'Tagged', icon: SquareUser },
  { key: 'saved', label: 'Saved', icon: Bookmark, ownOnly: true },
];

export default function ProfilePage() {
  const { username = '' } = useParams<{ username: string }>();
  const [tab, setTab] = useState<TabKey>('posts');

  // Reset the active tab when navigating between profiles.
  useEffect(() => setTab('posts'), [username]);

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => profileApi.profile(username),
    enabled: !!username,
    retry: shouldRetry,
  });
  const profile = profileQuery.data;

  if (profileQuery.isLoading) return <HeaderSkeleton />;

  if (profileQuery.isError || !profile) {
    const code = errorCode(profileQuery.error);
    const notFound = code === 'USER_NOT_FOUND' || code === 'NOT_FOUND';
    return (
      <main className="mx-auto w-full max-w-4xl">
        {notFound ? (
          <EmptyState
            icon={UserX}
            title="User not found"
            body="The link may be broken, or the profile may have been removed."
            action={<LinkButton to="/">Back to home</LinkButton>}
          />
        ) : (
          <EmptyState
            icon={UserX}
            title="Couldn't load this profile"
            body={errorMessage(profileQuery.error)}
            action={
              <Button variant="secondary" onClick={() => void profileQuery.refetch()}>
                Retry
              </Button>
            }
          />
        )}
      </main>
    );
  }

  const isOwn = profile.isOwnProfile;
  // Private accounts: only accepted followers (and the owner) see content.
  const locked = profile.isPrivate && !isOwn && profile.followStatus !== 'accepted';
  const visibleTabs = TABS.filter((t) => !t.ownOnly || isOwn);

  return (
    <main className="mx-auto w-full max-w-4xl pb-12">
      <ProfileHeader profile={profile} />

      {isOwn && <FollowRequestsBanner />}

      {locked ? (
        <PrivateLock username={profile.username} />
      ) : (
        <>
          <HighlightsRow username={profile.username} isOwnProfile={isOwn} />

          {/* Sticky tab bar */}
          <div
            role="tablist"
            aria-label="Profile content"
            className="sticky top-14 z-20 mt-2 flex border-t border-border-light bg-white dark:border-border-dark dark:bg-black md:top-0"
          >
            {visibleTabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`profile-tab-${key}`}
                aria-selected={tab === key}
                aria-controls={`profile-panel-${key}`}
                onClick={() => setTab(key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 border-t py-3 text-xs font-semibold uppercase tracking-wide transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                  tab === key
                    ? '-mt-px border-black text-black dark:border-white dark:text-white'
                    : 'border-transparent text-muted-light hover:text-black dark:text-muted-dark dark:hover:text-white'
                )}
              >
                <Icon size={14} aria-hidden />
                <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`profile-panel-${tab}`} aria-labelledby={`profile-tab-${tab}`}>
            {tab === 'posts' && (
              <GridTab
                queryKey={['profile', username, 'posts']}
                fetchPage={(cursor) => profileApi.posts(username, cursor)}
                username={profile.username}
                empty={
                  isOwn ? (
                    <EmptyState
                      icon={Camera}
                      title="Share photos"
                      body="When you share photos, they will appear on your profile."
                      action={<LinkButton to="/create">Share your first photo</LinkButton>}
                    />
                  ) : (
                    <EmptyState icon={Camera} title="No posts yet" />
                  )
                }
              />
            )}
            {tab === 'reels' && <ReelsTab username={profile.username} isOwn={isOwn} />}
            {tab === 'tagged' && (
              <GridTab
                queryKey={['profile', username, 'tagged']}
                fetchPage={(cursor) => profileApi.tagged(username, cursor)}
                username={profile.username}
                empty={
                  <EmptyState
                    icon={SquareUser}
                    title={isOwn ? 'Photos of you' : 'No tagged posts'}
                    body={
                      isOwn
                        ? "When people tag you in photos, they'll appear here."
                        : `When people tag @${profile.username}, the posts will appear here.`
                    }
                  />
                }
              />
            )}
            {tab === 'saved' && isOwn && <SavedTab />}
          </div>
        </>
      )}
    </main>
  );
}

/** Router link styled like the primary button (valid markup for actions). */
function LinkButton({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
      )}
    >
      {children}
    </Link>
  );
}

/** Lock view for private accounts the viewer doesn't follow. */
function PrivateLock({ username }: { username: string }) {
  return (
    <div className="mt-2 border-t border-border-light dark:border-border-dark">
      <EmptyState
        icon={Lock}
        title="This account is private"
        body={`Follow @${username} to see their photos and videos.`}
      />
    </div>
  );
}

/** Shared posts/tagged tab body: infinite grid + loading/error/lock states. */
function GridTab({
  queryKey,
  fetchPage,
  username,
  empty,
}: {
  queryKey: readonly unknown[];
  fetchPage: (cursor?: string) => ReturnType<typeof profileApi.posts>;
  username: string;
  empty: ReactNode;
}) {
  const { items, query, onEndReached } = useInfiniteList(queryKey, fetchPage);

  if (query.isLoading) return <GridSkeleton />;
  if (query.isError) {
    if (errorCode(query.error) === 'PRIVATE_ACCOUNT') return <PrivateLock username={username} />;
    return (
      <EmptyState
        icon={Camera}
        title="Couldn't load posts"
        body={errorMessage(query.error)}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PostGrid posts={items} onEndReached={onEndReached} emptyState={empty} />
      {query.isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Spinner size={24} />
        </div>
      )}
    </>
  );
}

function ReelsTab({ username, isOwn }: { username: string; isOwn: boolean }) {
  const { items, query, onEndReached } = useInfiniteList(
    ['profile', username, 'reels'],
    (cursor) => profileApi.reels(username, cursor)
  );

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-3 gap-0.5" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-none" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    if (errorCode(query.error) === 'PRIVATE_ACCOUNT') return <PrivateLock username={username} />;
    return (
      <EmptyState
        icon={Clapperboard}
        title="Couldn't load reels"
        body={errorMessage(query.error)}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ReelGrid
        reels={items}
        onEndReached={onEndReached}
        emptyState={
          <EmptyState
            icon={Clapperboard}
            title="No reels yet"
            body={
              isOwn ? 'Reels you share will appear on your profile.' : undefined
            }
          />
        }
      />
      {query.isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Spinner size={24} />
        </div>
      )}
    </>
  );
}

/** Header placeholder while the profile loads. */
function HeaderSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl" aria-busy="true" aria-label="Loading profile">
      <div className="flex items-center gap-5 px-4 pt-5 md:items-start md:gap-12 md:px-8 md:pt-8">
        <Skeleton className="h-[86px] w-[86px] shrink-0 rounded-full md:h-[150px] md:w-[150px]" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-56" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>
      <div className="mt-8 border-t border-border-light dark:border-border-dark">
        <GridSkeleton count={6} />
      </div>
    </main>
  );
}
