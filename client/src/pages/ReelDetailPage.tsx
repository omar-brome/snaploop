import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Clapperboard,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Send,
} from 'lucide-react';
import type { Reel } from '../types';
import { useAuthStore } from '../stores/authStore';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { RichText } from '../components/RichText';
import { CommentSection } from '../features/comments/CommentSection';
import { trackView } from '../features/reels/api';
import { useFollowFromReel, useLikeReel, useReel } from '../features/reels/hooks';
import { MoreSheet } from '../features/reels/MoreSheet';
import { ReelSection } from '../features/reels/ReelSection';
import { ReelVideo } from '../features/reels/ReelVideo';
import { ShareSheet } from '../features/reels/ShareSheet';
import { cn } from '../utils/cn';
import { formatCount, timeAgo } from '../utils/timeAgo';

// AppShell hides its chrome padding on /reels/*: mobile gets the viewport
// minus the 56px bottom tab bar, md+ the full height beside the sidebar
// (same surface as ReelsPage).
const MOBILE_SURFACE = 'h-[calc(100dvh-56px)]';
const SURFACE_HEIGHT = `${MOBILE_SURFACE} md:h-dvh`;
const PANE_BORDER = 'border-border-light dark:border-border-dark';

// Inline "Follow"/"Following" for the desktop header — same optimistic
// semantics as the ReelInfo overlay button (hidden when own/already followed).
function FollowButton({ reel }: { reel: Reel }) {
  const me = useAuthStore((s) => s.user);
  const followMutation = useFollowFromReel();
  const [justFollowed, setJustFollowed] = useState(false);

  const isOwn = me?.id === reel.user.id;
  if (isOwn || (reel.user.isFollowing && !justFollowed)) return null;

  const following = !!reel.user.isFollowing || justFollowed;
  const handleFollow = () => {
    if (following) return;
    setJustFollowed(true);
    followMutation.mutate(
      { username: reel.user.username },
      { onError: () => setJustFollowed(false) }
    );
  };

  return (
    <>
      <span aria-hidden className="text-muted-light dark:text-muted-dark">
        •
      </span>
      <button
        type="button"
        onClick={handleFollow}
        disabled={following}
        className={cn(
          'text-sm font-semibold',
          following
            ? 'text-muted-light dark:text-muted-dark'
            : 'text-primary hover:text-primary-hover'
        )}
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </>
  );
}

// Like / comment count / share / more row + counts for the desktop pane.
function DesktopActionRow({
  reel,
  onShare,
  onMore,
}: {
  reel: Reel;
  onShare: () => void;
  onMore: () => void;
}) {
  const likeMutation = useLikeReel();
  const [bouncing, setBouncing] = useState(false);

  const toggleLike = () => {
    if (!reel.isLiked) {
      setBouncing(true);
      setTimeout(() => setBouncing(false), 400);
    }
    likeMutation.mutate({ reelId: reel.id, like: !reel.isLiked });
  };

  return (
    <div className={`border-b px-4 py-3 ${PANE_BORDER}`}>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggleLike}
          aria-label={reel.isLiked ? 'Unlike' : 'Like'}
          aria-pressed={reel.isLiked}
          className="transition-opacity hover:opacity-70"
        >
          <Heart
            size={26}
            className={cn(
              'transition-colors',
              reel.isLiked && 'fill-like text-like',
              bouncing && 'animate-like-bounce'
            )}
          />
        </button>
        <span
          className="flex items-center gap-1.5 text-sm font-semibold"
          aria-label={`${formatCount(reel.commentCount)} comments`}
        >
          <MessageCircle size={26} aria-hidden />
          {formatCount(reel.commentCount)}
        </span>
        <button
          type="button"
          onClick={onShare}
          aria-label="Share reel"
          className="transition-opacity hover:opacity-70"
        >
          <Send size={24} />
        </button>
        <button
          type="button"
          onClick={onMore}
          aria-label="More options"
          className="ml-auto transition-opacity hover:opacity-70"
        >
          <MoreHorizontal size={24} />
        </button>
      </div>
      <p className="mt-2 text-sm font-semibold">{formatCount(reel.likeCount)} likes</p>
      <p className="mt-0.5 text-xs text-muted-light dark:text-muted-dark">
        {formatCount(reel.viewCount)} views • {timeAgo(reel.createdAt)}
      </p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading reel">
      {/* Mobile */}
      <div className={`bg-black md:hidden ${MOBILE_SURFACE}`}>
        <Skeleton className="h-full w-full rounded-none" />
      </div>
      {/* Desktop */}
      <div className="hidden h-dvh md:flex">
        <div className="flex min-w-0 flex-1 items-center justify-center bg-black">
          <Skeleton className="aspect-[9/16] h-[88%]" />
        </div>
        <aside className={`flex w-[400px] flex-col border-l lg:w-[440px] ${PANE_BORDER}`}>
          <div className={`flex items-center gap-3 border-b p-4 ${PANE_BORDER}`}>
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
          <div className="space-y-4 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function ReelDetailPage() {
  const { reelId } = useParams<{ reelId: string }>();
  const navigate = useNavigate();
  const { data: reel, isLoading, isError } = useReel(reelId);

  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/reels');
  };

  if (isLoading) return <DetailSkeleton />;

  if (isError || !reel) {
    return (
      <div className={`flex items-center justify-center bg-black text-white ${SURFACE_HEIGHT}`}>
        <EmptyState
          icon={Clapperboard}
          title="Reel not found"
          body="This reel may have been deleted, or the link may be broken."
          action={
            <Button variant="secondary" onClick={() => navigate('/reels')}>
              Browse reels
            </Button>
          }
        />
      </div>
    );
  }

  const audioText = `${reel.audioName || 'Original audio'} • ${reel.audioArtist || reel.user.username}`;

  return (
    <>
      {/* Mobile: full-height reel (video + info overlay + action rail + CommentSheet). */}
      <div className={`relative bg-black md:hidden ${MOBILE_SURFACE}`}>
        <ReelSection reel={reel} />
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="absolute left-3 top-3 z-20 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* Desktop: video stage | author + caption + actions + comments. */}
      <div className="hidden h-dvh md:flex">
        <div className="relative flex min-w-0 flex-1 items-center justify-center bg-black">
          <div className="relative aspect-[9/16] h-full max-w-full overflow-hidden">
            <ReelVideo
              src={reel.videoUrl}
              poster={reel.thumbnailUrl}
              onVisible={() => trackView(reel.id)}
            />
          </div>
        </div>

        <aside
          aria-label={`Reel by ${reel.user.username}`}
          className={`flex w-[400px] flex-col border-l bg-white dark:bg-black lg:w-[440px] ${PANE_BORDER}`}
        >
          <header className={`flex items-center gap-3 border-b p-4 ${PANE_BORDER}`}>
            <Link to={`/${reel.user.username}`} aria-label={`View ${reel.user.username}'s profile`}>
              <Avatar src={reel.user.avatarUrl} alt={reel.user.username} size={40} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Link
                  to={`/${reel.user.username}`}
                  className="truncate text-sm font-semibold hover:underline"
                >
                  {reel.user.username}
                </Link>
                {reel.user.isVerified && (
                  <BadgeCheck
                    size={16}
                    aria-label="Verified"
                    className="shrink-0 fill-primary text-white"
                  />
                )}
                <FollowButton reel={reel} />
              </div>
              {reel.user.fullName && (
                <p className="truncate text-xs text-muted-light dark:text-muted-dark">
                  {reel.user.fullName}
                </p>
              )}
            </div>
          </header>

          {reel.caption && (
            <div className={`max-h-44 overflow-y-auto border-b px-4 py-3 text-sm ${PANE_BORDER}`}>
              <Link to={`/${reel.user.username}`} className="mr-1.5 font-semibold hover:underline">
                {reel.user.username}
              </Link>
              <RichText text={reel.caption} />
            </div>
          )}

          <div
            className={`flex items-center gap-2 border-b px-4 py-2.5 text-xs text-muted-light dark:text-muted-dark ${PANE_BORDER}`}
            aria-label={`Audio: ${audioText}`}
          >
            <Music2 size={14} aria-hidden />
            <span className="truncate">{audioText}</span>
          </div>

          <DesktopActionRow
            reel={reel}
            onShare={() => setShareOpen(true)}
            onMore={() => setMoreOpen(true)}
          />

          <div className="min-h-0 flex-1 overflow-y-auto">
            <CommentSection targetType="reel" targetId={reel.id} ownerId={reel.user.id} />
          </div>
        </aside>
      </div>

      {/* Desktop action-row sheets (the mobile rail renders its own). */}
      <ShareSheet reelId={reel.id} open={shareOpen} onClose={() => setShareOpen(false)} />
      <MoreSheet reelId={reel.id} open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
