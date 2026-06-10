import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { GridSkeleton, Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { fetchHashtag, fetchHashtagPosts, nextPageCursor } from '../features/explore/api';
import { PostGrid } from '../features/explore/PostGrid';
import { formatCount } from '../utils/timeAgo';

export default function HashtagPage() {
  // React Router decodes the segment; api.ts re-encodes it for requests.
  const { name = '' } = useParams<{ name: string }>();

  const tag = useQuery({
    queryKey: ['hashtag', name],
    queryFn: () => fetchHashtag(name),
    enabled: !!name,
    retry: false,
  });

  const postsQuery = useInfiniteQuery({
    queryKey: ['hashtag', name, 'posts'],
    queryFn: ({ pageParam }) => fetchHashtagPosts(name, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageCursor,
    enabled: !!name && tag.isSuccess,
  });

  const posts = useMemo(() => {
    const all = postsQuery.data?.pages.flatMap((p) => p.data) ?? [];
    const seen = new Set<string>();
    return all.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [postsQuery.data]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = postsQuery;
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Unknown/blocked hashtag → 404 from the server.
  if (tag.isError) {
    return (
      <main className="mx-auto w-full max-w-[935px] pb-16 md:px-4 md:py-6" aria-label="Hashtag">
        <EmptyState
          icon={Hash}
          title="Hashtag not found"
          body={`No posts have been tagged with #${name} yet.`}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[935px] pb-16 md:px-4 md:py-6" aria-label="Hashtag">
      <header className="flex items-center gap-5 px-4 py-6 md:gap-8 md:px-0 md:py-8">
        <span
          aria-hidden
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-border-light text-4xl font-light text-neutral-700 md:h-32 md:w-32 md:text-6xl dark:border-border-dark dark:text-neutral-300"
        >
          #
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold md:text-2xl">#{name}</h1>
          {tag.isLoading ? (
            <Skeleton className="mt-2 h-4 w-24" />
          ) : (
            tag.data && (
              <p className="mt-1 text-sm text-muted-light dark:text-muted-dark">
                <span className="font-semibold text-black dark:text-white">
                  {formatCount(tag.data.postCount)}
                </span>{' '}
                posts
              </p>
            )
          )}
        </div>
      </header>

      {(tag.isLoading || postsQuery.isLoading) && <GridSkeleton count={9} />}

      {postsQuery.isSuccess && (
        <PostGrid
          posts={posts}
          onEndReached={handleEndReached}
          emptyState={
            <EmptyState
              icon={Hash}
              title="No posts yet"
              body={`Be the first to share a post with #${name}.`}
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
