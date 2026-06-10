import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { PostMedia } from '../../types';

interface MediaCarouselProps {
  media: PostMedia[];
  onDoubleTap?: () => void;
  // 'feed' renders at the media's natural ratio (capped 4:5 … 1.91:1);
  // 'fill' stretches to the parent pane (post-detail two-pane layout).
  fit?: 'feed' | 'fill';
  className?: string;
}

const DOUBLE_TAP_MS = 300;

export function MediaCarousel({ media, onDoubleTap, fit = 'feed', className }: MediaCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const [index, setIndex] = useState(0);

  const first = media[0];
  const ratio =
    first?.width && first.height
      ? Math.min(Math.max(first.width / first.height, 0.8), 1.91)
      : 1;

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  // Custom double-tap detection works for both touch taps and mouse clicks
  // (a double-click fires two click events inside the window).
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      onDoubleTap?.();
    } else {
      lastTap.current = now;
    }
  };

  const itemClass = cn('h-full w-full', fit === 'fill' ? 'object-contain' : 'object-cover');

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={`Media, ${media.length} item${media.length === 1 ? '' : 's'}`}
      className={cn('group relative w-full select-none overflow-hidden bg-black', className)}
      style={fit === 'feed' ? { aspectRatio: String(ratio) } : undefined}
    >
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scrollbar-none"
      >
        {media.map((m, i) => (
          <div
            key={m.id}
            className="relative h-full w-full shrink-0 snap-center"
            onClick={handleTap}
            aria-hidden={i !== index}
          >
            {m.mediaType === 'VIDEO' ? (
              <video
                src={m.mediaUrl}
                poster={m.thumbnailUrl ?? undefined}
                muted
                loop
                autoPlay
                playsInline
                className={itemClass}
              />
            ) : (
              <img src={m.mediaUrl} alt="" draggable={false} loading="lazy" className={itemClass} />
            )}
          </div>
        ))}
      </div>

      {media.length > 1 && index > 0 && (
        <button
          onClick={() => goTo(index - 1)}
          aria-label="Previous media"
          className="absolute left-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100 md:flex"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {media.length > 1 && index < media.length - 1 && (
        <button
          onClick={() => goTo(index + 1)}
          aria-label="Next media"
          className="absolute right-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100 md:flex"
        >
          <ChevronRight size={18} />
        </button>
      )}

      {media.length > 1 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5"
          aria-hidden
        >
          {media.map((m, i) => (
            <span
              key={m.id}
              className={cn(
                'h-1.5 w-1.5 rounded-full bg-white/50 shadow transition-colors',
                i === index && 'bg-white'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
