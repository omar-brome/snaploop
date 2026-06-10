import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Clapperboard } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { useReelsFeed } from '../features/reels/hooks';
import { ReelSection } from '../features/reels/ReelSection';

// Mobile: viewport minus the 56px bottom tab bar; md+: full height beside the
// sidebar (AppShell already applies md:pl-[72px] xl:pl-60).
const SURFACE_HEIGHT = 'h-[calc(100dvh-56px)] md:h-dvh';

export default function ReelsPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } =
    useReelsFeed();
  const containerRef = useRef<HTMLDivElement>(null);

  const reels = useMemo(() => {
    const all = data?.pages.flatMap((p) => p.data) ?? [];
    const seen = new Set<string>();
    return all.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  }, [data]);

  // ArrowUp/ArrowDown page through reels (snap container scroll).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const el = containerRef.current;
      if (!el) return;
      e.preventDefault();
      el.scrollBy({
        top: e.key === 'ArrowDown' ? el.clientHeight : -el.clientHeight,
        behavior: 'smooth',
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleVisible = useCallback(
    (index: number) => {
      if (index >= reels.length - 2 && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    },
    [reels.length, hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-black text-white ${SURFACE_HEIGHT}`}>
        <Spinner size={32} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={`flex items-center justify-center bg-black text-white ${SURFACE_HEIGHT}`}>
        <EmptyState
          icon={Clapperboard}
          title="Couldn't load reels"
          body="Check your connection and try again."
          action={
            <Button variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-black text-white ${SURFACE_HEIGHT}`}>
        <EmptyState
          icon={Clapperboard}
          title="No reels yet"
          body="When people share reels, they'll show up here."
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="feed"
      aria-label="Reels"
      aria-busy={isFetchingNextPage}
      className={`snap-y snap-mandatory overflow-y-scroll bg-black scrollbar-none ${SURFACE_HEIGHT}`}
    >
      {reels.map((reel, i) => (
        <ReelSection key={reel.id} reel={reel} onVisible={() => handleVisible(i)} />
      ))}
      {isFetchingNextPage && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-20 -translate-x-1/2 text-white md:bottom-8">
          <Spinner size={24} />
        </div>
      )}
    </div>
  );
}
