import { useState } from 'react';
import type { Reel } from '../../types';
import { CommentSheet } from '../comments/CommentSheet';
import { trackView } from './api';
import { ReelVideo } from './ReelVideo';
import { ReelInfo } from './ReelInfo';
import { ReelActionRail } from './ReelActionRail';

interface ReelSectionProps {
  reel: Reel;
  // Extra hook for the page (e.g. infinite prefetch); view tracking is built in.
  onVisible?: () => void;
}

// One full-viewport reel cell: video + info overlay + action rail + comments.
// Used by the snap feed and the mobile detail view.
export function ReelSection({ reel, onVisible }: ReelSectionProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);

  const handleVisible = () => {
    trackView(reel.id);
    onVisible?.();
  };

  return (
    <section
      className="relative flex h-full w-full snap-start items-center justify-center bg-black"
      aria-label={`Reel by ${reel.user.username}`}
    >
      {/* Centered 9:16 stage on desktop, full-bleed on mobile. */}
      <div className="relative h-full w-full md:aspect-[9/16] md:w-auto md:max-w-full md:overflow-hidden md:rounded-lg">
        <ReelVideo src={reel.videoUrl} poster={reel.thumbnailUrl} onVisible={handleVisible} />
        <ReelInfo reel={reel} />
        <ReelActionRail reel={reel} onComment={() => setCommentsOpen(true)} />
      </div>

      <CommentSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        targetType="reel"
        targetId={reel.id}
        ownerId={reel.user.id}
      />
    </section>
  );
}
