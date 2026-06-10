import {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, X } from 'lucide-react';
import { Spinner } from '../../components/ui/Spinner';
import type { Story } from '../../types';
import { parseStickerTexts } from './api';

const IMAGE_DURATION_MS = 5000;
const HOLD_DELAY_MS = 220;
const SWIPE_DISMISS_PX = 80;
const TAP_MAX_MS = 350;
const TAP_MAX_MOVE_PX = 10;

export interface SlideShowProps {
  slides: Story[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Called when "next" is requested past the final slide. Defaults to onClose. */
  onEnd?: () => void;
  /** External pause (open sheets/dialogs, focused reply input). Also disables key nav. */
  paused?: boolean;
  /** Left side of the header row (avatar, username, timestamp…). */
  headerLeft?: ReactNode;
  /** Extra header buttons rendered between the mute toggle and the close button. */
  headerActions?: ReactNode;
  /** Rendered below the media (reply bar, viewers row…). */
  footer?: ReactNode;
  /** Absolute overlay rendered above the media (e.g. big reaction emoji). */
  overlay?: ReactNode;
  label?: string;
}

/**
 * Internal fullscreen slideshow shared by StoryViewer (live stories) and the
 * highlight viewer. Handles per-slide progress timing (5s images, video
 * duration for videos), hold-to-pause, tap zones, swipe-down + Escape dismiss,
 * sticker text overlays and captions.
 */
export function SlideShow({
  slides,
  index,
  onIndexChange,
  onClose,
  onEnd,
  paused = false,
  headerLeft,
  headerActions,
  footer,
  overlay,
  label,
}: SlideShowProps) {
  const current: Story | undefined = slides[index];

  const [progress, setProgress] = useState(0); // 0–1 for the current slide
  const progressRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [holdPaused, setHoldPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [dragY, setDragY] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; t: number; moved: boolean } | null>(
    null
  );
  const holdTimer = useRef<number | undefined>(undefined);
  const holdActive = useRef(false);

  const isPaused = paused || holdPaused;

  const goNext = useCallback(() => {
    if (index < slides.length - 1) onIndexChange(index + 1);
    else (onEnd ?? onClose)();
  }, [index, slides.length, onIndexChange, onEnd, onClose]);

  const goPrev = useCallback(() => {
    if (index > 0) {
      onIndexChange(index - 1);
    } else {
      // First slide: restart it.
      progressRef.current = 0;
      setProgress(0);
      const video = videoRef.current;
      if (video) video.currentTime = 0;
    }
  }, [index, onIndexChange]);

  // Reset timing whenever the slide changes.
  useEffect(() => {
    progressRef.current = 0;
    setProgress(0);
    setReady(false);
  }, [current?.id]);

  // Keyboard: Escape dismisses, arrows navigate. Disabled while externally
  // paused so open sub-dialogs (viewers sheet, confirm) own the keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [paused, onClose, goNext, goPrev]);

  // Progress driver: rAF accumulator for images, video currentTime for videos.
  useEffect(() => {
    if (!current || !ready || isPaused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (current.mediaType === 'IMAGE') {
        progressRef.current = Math.min(1, progressRef.current + (now - last) / IMAGE_DURATION_MS);
        last = now;
        setProgress(progressRef.current);
        if (progressRef.current >= 1) {
          goNext();
          return;
        }
      } else {
        const video = videoRef.current;
        if (video && video.duration > 0) {
          progressRef.current = Math.min(1, video.currentTime / video.duration);
          setProgress(progressRef.current);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [current, ready, isPaused, goNext]);

  // Keep the video element in sync with the pause state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPaused) video.pause();
    else video.play().catch(() => {});
  }, [isPaused, ready, current?.id]);

  const clearHoldTimer = () => {
    if (holdTimer.current !== undefined) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = undefined;
    }
  };

  // Gestures on the media area: short tap = prev/next zones, press-and-hold =
  // pause, downward drag past the threshold = dismiss.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    holdActive.current = false;
    holdTimer.current = window.setTimeout(() => {
      holdActive.current = true;
      setHoldPaused(true);
    }, HOLD_DELAY_MS);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) > TAP_MAX_MOVE_PX || Math.abs(dy) > TAP_MAX_MOVE_PX) {
      g.moved = true;
      clearHoldTimer();
    }
    setDragY(dy > 0 ? dy : 0);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    clearHoldTimer();
    const wasHold = holdActive.current;
    holdActive.current = false;
    setHoldPaused(false);
    const dy = e.clientY - g.y;
    setDragY(0);
    if (dy > SWIPE_DISMISS_PX) {
      onClose();
      return;
    }
    if (wasHold || g.moved || performance.now() - g.t > TAP_MAX_MS) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 1;
    if (ratio < 1 / 3) goPrev();
    else goNext();
  };

  const onPointerCancel = () => {
    gesture.current = null;
    clearHoldTimer();
    holdActive.current = false;
    setHoldPaused(false);
    setDragY(0);
  };

  if (!current) return null;

  const stickerTexts = parseStickerTexts(current.stickerData);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={label ?? 'Story viewer'}
    >
      <div
        className="mx-auto flex h-full w-full max-w-md flex-col sm:py-4"
        style={{
          transform: dragY ? `translateY(${dragY * 0.5}px)` : undefined,
          opacity: dragY ? Math.max(0.5, 1 - dragY / 600) : 1,
          transition: dragY ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
        }}
      >
        <div className="relative flex-1 overflow-hidden bg-neutral-950 sm:rounded-xl">
          {/* Media + gesture layer */}
          <div
            className="absolute inset-0 select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            {current.mediaType === 'IMAGE' ? (
              <img
                key={current.id}
                src={current.mediaUrl}
                alt={current.caption ?? 'Story'}
                draggable={false}
                onLoad={() => setReady(true)}
                onError={() => setReady(true)}
                className="h-full w-full object-contain"
              />
            ) : (
              <video
                key={current.id}
                ref={videoRef}
                src={current.mediaUrl}
                playsInline
                autoPlay
                muted={muted}
                onCanPlay={() => setReady(true)}
                onEnded={goNext}
                className="h-full w-full object-contain"
              />
            )}

            {/* Legibility scrims */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />

            {/* Sticker text overlays (defensively parsed) */}
            {stickerTexts.map((t, i) => (
              <span
                key={i}
                className="pointer-events-none absolute z-10 max-w-[90%] whitespace-pre-wrap text-center font-bold"
                style={{
                  left: `${t.x * 100}%`,
                  top: `${t.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  color: t.color,
                  fontSize: t.size,
                  textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                }}
              >
                {t.text}
              </span>
            ))}

            {current.caption && (
              <p
                className="pointer-events-none absolute inset-x-0 bottom-4 z-10 mx-auto max-w-[90%] text-center text-sm text-white"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
              >
                {current.caption}
              </p>
            )}

            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <Spinner size={28} />
              </div>
            )}
          </div>

          {overlay}

          {/* Per-slide progress bars */}
          <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-2 pt-2" aria-hidden>
            {slides.map((s, i) => (
              <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: i < index ? '100%' : i === index ? `${progress * 100}%` : '0%' }}
                />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className="absolute inset-x-0 top-2 z-20 flex items-center gap-1 px-3 pt-2 text-white">
            <div className="flex min-w-0 flex-1 items-center gap-2">{headerLeft}</div>
            {current.mediaType === 'VIDEO' && (
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute video' : 'Mute video'}
                className="rounded-full p-1.5 hover:bg-white/10"
              >
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            )}
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close story viewer"
              className="rounded-full p-1.5 hover:bg-white/10"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {footer && <div className="shrink-0 px-3 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
