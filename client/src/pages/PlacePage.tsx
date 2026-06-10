import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { GridSkeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { fetchPlacePosts, nextPageCursor } from '../features/explore/api';
import { PostGrid } from '../features/explore/PostGrid';

export default function PlacePage() {
  // React Router decodes the segment; api.ts passes it as a query param.
  const { name = '' } = useParams<{ name: string }>();

  const postsQuery = useInfiniteQuery({
    queryKey: ['place', name, 'posts'],
    queryFn: ({ pageParam }) => fetchPlacePosts(name, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageCursor,
    enabled: !!name,
  });

  const posts = useMemo(() => {
    const all = postsQuery.data?.pages.flatMap((p) => p.data) ?? [];
    const seen = new Set<string>();
    return all.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [postsQuery.data]);

  // First page meta carries { name, lat, lng } for the header.
  const meta = postsQuery.data?.pages[0]?.meta;
  const placeName = typeof meta?.name === 'string' && meta.name ? meta.name : name;
  const lat = typeof meta?.lat === 'number' ? meta.lat : null;
  const lng = typeof meta?.lng === 'number' ? meta.lng : null;

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = postsQuery;
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <main className="mx-auto w-full max-w-[935px] pb-16 md:px-4 md:py-6" aria-label="Place">
      <header className="px-4 py-6 md:px-0">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border-light text-neutral-700 md:h-20 md:w-20 dark:border-border-dark dark:text-neutral-300"
          >
            <MapPin size={28} strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold md:text-2xl">{placeName}</h1>
            {lat !== null && lng !== null && (
              <p className="mt-0.5 text-sm text-muted-light dark:text-muted-dark">
                {lat.toFixed(4)}, {lng.toFixed(4)}
              </p>
            )}
          </div>
        </div>

        {/* Decorative static-map placeholder. */}
        <div
          aria-hidden
          className="relative mt-4 h-32 overflow-hidden rounded-xl bg-gradient-to-br from-sky-100 via-emerald-100 to-sky-200 md:h-44 dark:from-sky-950 dark:via-emerald-950 dark:to-sky-900"
        >
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(transparent_31px,rgba(255,255,255,0.6)_32px),linear-gradient(90deg,transparent_31px,rgba(255,255,255,0.6)_32px)] [background-size:32px_32px] dark:[background-image:linear-gradient(transparent_31px,rgba(255,255,255,0.12)_32px),linear-gradient(90deg,transparent_31px,rgba(255,255,255,0.12)_32px)]" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-like drop-shadow-md">
            <MapPin size={36} fill="currentColor" className="text-like" />
          </span>
        </div>
      </header>

      {postsQuery.isLoading && <GridSkeleton count={9} />}

      {postsQuery.isError && (
        <EmptyState
          icon={MapPin}
          title="Couldn't load this place"
          body="Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => void postsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {postsQuery.isSuccess && (
        <PostGrid
          posts={posts}
          onEndReached={handleEndReached}
          emptyState={
            <EmptyState
              icon={MapPin}
              title="No posts yet"
              body={`Be the first to share a post from ${placeName}.`}
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
