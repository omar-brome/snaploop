import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Heart, MessageCircle, Play } from 'lucide-react';
import type { GridPost } from '../../types';
import { cn } from '../../utils/cn';
import { formatCount } from '../../utils/timeAgo';
import { useEndReached } from './useEndReached';

// Shared square-tile grid (explore, hashtag, place, profile tabs).
// `featuredEvery` makes every Nth tile span 2x2; with a 3-col grid and
// grid-flow-dense the remaining singles backfill the column next to it.
interface PostGridProps {
  posts: GridPost[];
  onEndReached?: () => void;
  emptyState?: ReactNode;
  featuredEvery?: number;
}

export function PostGrid({ posts, onEndReached, emptyState, featuredEvery }: PostGridProps) {
  const sentinelRef = useEndReached(onEndReached);

  if (posts.length === 0) return <>{emptyState ?? null}</>;

  return (
    <>
      <div
        role="list"
        aria-label="Posts"
        className={cn('grid grid-cols-3 gap-0.5', featuredEvery && 'grid-flow-dense')}
      >
        {posts.map((post, index) => (
          <GridTile
            key={post.id}
            post={post}
            featured={!!featuredEvery && featuredEvery > 0 && (index + 1) % featuredEvery === 0}
          />
        ))}
      </div>
      {onEndReached && <div ref={sentinelRef} className="h-px" aria-hidden />}
    </>
  );
}

function GridTile({ post, featured }: { post: GridPost; featured: boolean }) {
  const cover = post.media[0];
  const isVideo = cover?.mediaType === 'VIDEO';
  const imgSrc = cover ? (cover.thumbnailUrl ?? (isVideo ? null : cover.mediaUrl)) : null;
  const isMulti = post.mediaCount > 1;

  return (
    <Link
      role="listitem"
      to={`/p/${post.id}`}
      aria-label={`Post with ${formatCount(post.likeCount)} likes and ${formatCount(post.commentCount)} comments`}
      className={cn(
        'group relative block aspect-square overflow-hidden bg-neutral-100 dark:bg-neutral-900',
        'focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
        featured && 'col-span-2 row-span-2'
      )}
    >
      {imgSrc ? (
        <img src={imgSrc} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : cover ? (
        // Video without a generated thumbnail: paint the first frame.
        <video
          src={cover.mediaUrl}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : null}

      {(isMulti || isVideo) && (
        <span className="absolute right-2 top-2 text-white drop-shadow-md" aria-hidden>
          {isMulti ? <Copy size={16} /> : <Play size={16} fill="currentColor" />}
        </span>
      )}

      {/* Like/comment counts on hover (and keyboard focus). */}
      <span
        className="absolute inset-0 hidden items-center justify-center gap-5 bg-black/40 text-sm font-bold text-white group-hover:flex group-focus-visible:flex"
        aria-hidden
      >
        <span className="flex items-center gap-1.5">
          <Heart size={18} fill="currentColor" />
          {formatCount(post.likeCount)}
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle size={18} fill="currentColor" />
          {formatCount(post.commentCount)}
        </span>
      </span>
    </Link>
  );
}
