import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Music2 } from 'lucide-react';
import type { Reel } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../../components/ui/Avatar';
import { RichText } from '../../components/RichText';
import { cn } from '../../utils/cn';
import { useFollowFromReel } from './hooks';

// Bottom-left overlay: author row (+ Follow), expandable caption, audio marquee.
export function ReelInfo({ reel }: { reel: Reel }) {
  const me = useAuthStore((s) => s.user);
  const followMutation = useFollowFromReel();
  const [expanded, setExpanded] = useState(false);
  const [justFollowed, setJustFollowed] = useState(false);

  const isOwn = me?.id === reel.user.id;
  const following = !!reel.user.isFollowing || justFollowed;
  // Keep the button visible (reading "Following") right after an optimistic
  // follow; reels already followed never show it.
  const showFollowButton = !isOwn && (!reel.user.isFollowing || justFollowed);

  const handleFollow = () => {
    if (following) return;
    setJustFollowed(true);
    followMutation.mutate(
      { username: reel.user.username },
      { onError: () => setJustFollowed(false) }
    );
  };

  const audioText = `${reel.audioName || 'Original audio'} • ${reel.audioArtist || reel.user.username}`;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 text-white">
      {/* Legibility gradient behind the overlay text. */}
      <div className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" aria-hidden />

      <div className="relative flex flex-col gap-2.5 p-4 pr-16">
        <div className="flex items-center gap-2.5">
          <Link
            to={`/${reel.user.username}`}
            className="flex items-center gap-2.5 font-semibold"
            aria-label={`View ${reel.user.username}'s profile`}
          >
            <Avatar src={reel.user.avatarUrl} alt={reel.user.username} size={32} />
            <span className="text-sm">{reel.user.username}</span>
          </Link>
          {showFollowButton && (
            <button
              type="button"
              onClick={handleFollow}
              disabled={following}
              className={cn(
                'rounded-md border border-white/80 px-2.5 py-1 text-xs font-semibold transition-colors',
                following ? 'opacity-80' : 'hover:bg-white/15'
              )}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        {reel.caption && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse caption' : 'Expand caption'}
            className={cn('block max-w-md text-left text-sm', expanded && 'max-h-40 overflow-y-auto scrollbar-none')}
          >
            <RichText text={reel.caption} className={cn('block', !expanded && 'line-clamp-2')} />
          </button>
        )}

        <div className="flex items-center gap-2 text-xs">
          <Music2 size={14} aria-hidden />
          <div className="w-44 overflow-hidden" aria-label={`Audio: ${audioText}`}>
            <div className="flex w-max animate-marquee whitespace-nowrap">
              <span className="pr-10">{audioText}</span>
              <span className="pr-10" aria-hidden>
                {audioText}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
