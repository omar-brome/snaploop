import { useState } from 'react';
import { Heart, MessageCircle, MoreHorizontal, Send } from 'lucide-react';
import type { Reel } from '../../types';
import { formatCount } from '../../utils/timeAgo';
import { cn } from '../../utils/cn';
import { useLikeReel } from './hooks';
import { ShareSheet } from './ShareSheet';
import { MoreSheet } from './MoreSheet';

interface ReelActionRailProps {
  reel: Reel;
  onComment: () => void;
}

// Vertical action stack pinned to the bottom-right of a reel.
export function ReelActionRail({ reel, onComment }: ReelActionRailProps) {
  const likeMutation = useLikeReel();
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bouncing, setBouncing] = useState(false);

  const toggleLike = () => {
    if (!reel.isLiked) {
      setBouncing(true);
      setTimeout(() => setBouncing(false), 400);
    }
    likeMutation.mutate({ reelId: reel.id, like: !reel.isLiked });
  };

  return (
    <>
      <div className="absolute bottom-4 right-2 z-10 flex flex-col items-center gap-5 text-white">
        <button
          type="button"
          onClick={toggleLike}
          aria-label={reel.isLiked ? 'Unlike' : 'Like'}
          aria-pressed={reel.isLiked}
          className="flex flex-col items-center gap-1"
        >
          <Heart
            size={28}
            className={cn(
              'drop-shadow transition-colors',
              reel.isLiked && 'fill-like text-like',
              bouncing && 'animate-like-bounce'
            )}
          />
          <span className="text-xs font-semibold drop-shadow">{formatCount(reel.likeCount)}</span>
        </button>

        <button
          type="button"
          onClick={onComment}
          aria-label={`View comments (${formatCount(reel.commentCount)})`}
          className="flex flex-col items-center gap-1"
        >
          <MessageCircle size={28} className="drop-shadow" />
          <span className="text-xs font-semibold drop-shadow">{formatCount(reel.commentCount)}</span>
        </button>

        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label="Share reel"
          className="flex flex-col items-center gap-1"
        >
          <Send size={26} className="drop-shadow" />
        </button>

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
          className="flex flex-col items-center gap-1"
        >
          <MoreHorizontal size={26} className="drop-shadow" />
        </button>
      </div>

      <ShareSheet reelId={reel.id} open={shareOpen} onClose={() => setShareOpen(false)} />
      <MoreSheet reelId={reel.id} open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
