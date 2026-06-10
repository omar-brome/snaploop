import { TouchEvent, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2 } from 'lucide-react';
import { StoryTray } from '../features/stories/StoryTray';
import { feedApi } from '../features/feed/api';
import { PostCard } from '../features/feed/PostCard';
import { FollowButton } from '../features/feed/FollowButton';
import { useIntersection } from '../features/feed/useIntersection';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PostSkeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { formatCount } from '../utils/timeAgo';
import type { Page, Post } from '../types';

const getNext = (last: Page<Post>) =>
  last.meta?.hasMore ? last.meta.nextCursor ?? undefined : undefined;

const PULL_THRESHOLD = 64;

export default function FeedPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const feedQ = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => feedApi.home(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: getNext,
  });

  const posts = feedQ.data?.pages.flatMap((p) => p.data) ?? [];
  const feedDone = !feedQ.isPending && !feedQ.isError && !feedQ.hasNextPage;

  const feedSentinel = useIntersection(() => {
    if (feedQ.hasNextPage && !feedQ.isFetchingNextPage) void feedQ.fetchNextPage();
  }, !!feedQ.hasNextPage);

  // End-of-feed extras: suggested users + an infinite suggested-posts tail.
  const { data: suggestedUsers } = useQuery({
    queryKey: ['suggested-users'],
    queryFn: () => feedApi.suggestedUsers(10),
    enabled: feedDone,
  });

  const suggestedQ = useInfiniteQuery({
    queryKey: ['suggested-posts'],
    queryFn: ({ pageParam }) => feedApi.suggestedPosts(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: getNext,
    enabled: feedDone,
  });

  const suggestedPosts = suggestedQ.data?.pages.flatMap((p) => p.data) ?? [];

  const suggestedSentinel = useIntersection(() => {
    if (suggestedQ.hasNextPage && !suggestedQ.isFetchingNextPage) void suggestedQ.fetchNextPage();
  }, feedDone && !!suggestedQ.hasNextPage);

  // Pull-to-refresh (touch only, when scrolled to the top).
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = (e: TouchEvent) => {
    startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0 && window.scrollY <= 0) setPull(Math.min(Math.round(delta * 0.4), 96));
    else setPull(0);
  };
  const onTouchEnd = () => {
    startY.current = null;
    if (pull >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      void Promise.all([
        queryClient.refetchQueries({ queryKey: ['feed'] }),
        queryClient.invalidateQueries({ queryKey: ['stories'] }),
      ]).finally(() => setRefreshing(false));
    }
    setPull(0);
  };

  return (
    <div
      className="mx-auto w-full max-w-[470px] pb-8"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {(pull > 0 || refreshing) && (
        <div
          style={{ height: refreshing ? 56 : pull }}
          className="flex items-end justify-center overflow-hidden transition-[height] duration-150"
          role="status"
          aria-label="Refreshing feed"
        >
          <div className="pb-3">
            <Spinner size={22} className={pull < PULL_THRESHOLD && !refreshing ? 'opacity-40' : undefined} />
          </div>
        </div>
      )}

      <StoryTray />

      {feedQ.isPending && (
        <div className="pt-2">
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </div>
      )}

      {feedQ.isError && (
        <EmptyState
          icon={Camera}
          title="Couldn't load your feed"
          body="Something went wrong. Check your connection and try again."
          action={<Button onClick={() => void feedQ.refetch()}>Retry</Button>}
        />
      )}

      <div className="pt-2">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      <div ref={feedSentinel} />
      {feedQ.isFetchingNextPage && <PostSkeleton />}

      {feedDone && (
        <>
          {posts.length === 0 ? (
            <EmptyState
              icon={Camera}
              title="Welcome to Snaploop"
              body="Follow people to see their photos and videos here."
              action={<Button onClick={() => navigate('/explore')}>Explore</Button>}
            />
          ) : (
            <div className="my-6 flex flex-col items-center gap-2 border-y border-border-light py-8 text-center dark:border-border-dark">
              <CheckCircle2 size={40} strokeWidth={1.25} className="text-primary" aria-hidden />
              <p className="font-semibold">You're all caught up</p>
              <p className="text-sm text-muted-light dark:text-muted-dark">
                You've seen all new posts from people you follow.
              </p>
            </div>
          )}

          {suggestedUsers && suggestedUsers.length > 0 && (
            <section aria-label="Suggested for you" className="mb-6">
              <h2 className="mb-3 px-3 text-sm font-semibold text-muted-light dark:text-muted-dark">
                Suggested for you
              </h2>
              <div className="flex gap-3 overflow-x-auto px-3 pb-1 scrollbar-none">
                {suggestedUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex w-40 shrink-0 flex-col items-center gap-1.5 rounded-xl border border-border-light p-4 text-center dark:border-border-dark"
                  >
                    <Link to={`/${u.username}`}>
                      <Avatar src={u.avatarUrl} alt={u.username} size={64} />
                    </Link>
                    <Link
                      to={`/${u.username}`}
                      className="max-w-full truncate text-sm font-semibold hover:opacity-70"
                    >
                      {u.username}
                    </Link>
                    <p className="max-w-full truncate text-xs text-muted-light dark:text-muted-dark">
                      {formatCount(u.followerCount)} followers
                    </p>
                    <FollowButton
                      username={u.username}
                      initialStatus={u.isFollowing ? 'accepted' : 'none'}
                      className="mt-1 w-full"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {(suggestedQ.isPending || suggestedPosts.length > 0) && (
            <section aria-label="Suggested posts">
              <h2 className="mb-2 px-3 text-sm font-semibold text-muted-light dark:text-muted-dark">
                Suggested posts
              </h2>
              {suggestedPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
              <div ref={suggestedSentinel} />
              {(suggestedQ.isPending || suggestedQ.isFetchingNextPage) && <PostSkeleton />}
            </section>
          )}
        </>
      )}
    </div>
  );
}
