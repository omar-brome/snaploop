import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Compass } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { GridSkeleton, Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { fetchExplorePage, fetchTrendingHashtags, nextPageCursor } from '../features/explore/api';
import { PostGrid } from '../features/explore/PostGrid';
import { formatCount } from '../utils/timeAgo';

export default function ExplorePage() {
  const trending = useQuery({
    queryKey: ['trending-hashtags'],
    queryFn: fetchTrendingHashtags,
    staleTime: 5 * 60 * 1000,
  });

  const explore = useInfiniteQuery({
    queryKey: ['explore'],
    queryFn: ({ pageParam }) => fetchExplorePage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageCursor,
  });

  const posts = useMemo(() => {
    const all = explore.data?.pages.flatMap((p) => p.data) ?? [];
    const seen = new Set<string>();
    return all.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [explore.data]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = explore;
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <main className="mx-auto w-full max-w-[935px] pb-16 md:px-4 md:py-6" aria-label="Explore">
      {/* Trending hashtag chips */}
      <nav
        aria-label="Trending hashtags"
        className="scrollbar-none flex gap-2 overflow-x-auto px-3 py-3 md:px-0"
      >
        {trending.isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
          ))}
        {trending.data?.map((tag) => (
          <Link
            key={tag.name}
            to={`/explore/tags/${encodeURIComponent(tag.name)}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-light bg-elevated-light px-3.5 py-1.5 text-sm font-semibold transition-colors hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-border-dark dark:bg-elevated-dark dark:hover:bg-neutral-800"
          >
            #{tag.name}
            <span className="font-normal text-muted-light dark:text-muted-dark">
              {formatCount(tag.postCount)}
            </span>
          </Link>
        ))}
      </nav>

      {explore.isLoading && <GridSkeleton count={12} />}

      {explore.isError && (
        <EmptyState
          icon={Compass}
          title="Couldn't load explore"
          body="Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => void explore.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {explore.isSuccess && (
        <PostGrid
          posts={posts}
          featuredEvery={7}
          onEndReached={handleEndReached}
          emptyState={
            <EmptyState
              icon={Compass}
              title="Nothing to explore yet"
              body="When people share public posts, they'll show up here."
            />
          }
        />
      )}

      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Spinner size={28} />
        </div>
      )}
    </main>
  );
}
