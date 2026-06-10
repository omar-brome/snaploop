import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { formatCount } from '../../utils/timeAgo';
import type { ReelGridItem } from './api';
import { useEndReached } from './hooks';

interface ReelGridProps {
  reels: ReelGridItem[];
  onEndReached?: () => void;
  emptyState?: ReactNode;
}

/** 3-col grid of reel thumbnails with a play icon + view count overlay. */
export function ReelGrid({ reels, onEndReached, emptyState }: ReelGridProps) {
  const sentinelRef = useEndReached(onEndReached);

  if (reels.length === 0) return <>{emptyState ?? null}</>;

  return (
    <>
      <div role="list" aria-label="Reels" className="grid grid-cols-3 gap-0.5">
        {reels.map((reel) => (
          <Link
            key={reel.id}
            role="listitem"
            to={`/reels/${reel.id}`}
            aria-label={`Reel with ${formatCount(reel.viewCount)} views`}
            className="group relative block aspect-[9/16] overflow-hidden bg-neutral-100 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary dark:bg-neutral-900"
          >
            {reel.thumbnailUrl ? (
              <img
                src={reel.thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
              />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-neutral-400 dark:text-neutral-600"
                aria-hidden
              >
                <Play size={28} fill="currentColor" />
              </span>
            )}
            <span
              className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/50 to-transparent"
              aria-hidden
            />
            <span
              className="absolute bottom-2 left-2 flex items-center gap-1 text-xs font-semibold text-white drop-shadow"
              aria-hidden
            >
              <Play size={13} fill="currentColor" />
              {formatCount(reel.viewCount)}
            </span>
          </Link>
        ))}
      </div>
      {onEndReached && <div ref={sentinelRef} className="h-px" aria-hidden />}
    </>
  );
}
