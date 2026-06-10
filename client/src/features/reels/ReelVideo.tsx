import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useMuteStore } from './hooks';

interface ReelVideoProps {
  src: string;
  poster?: string | null;
  // Fired every time the video becomes ≥60% visible (view tracking, prefetch).
  onVisible?: () => void;
  className?: string;
  showMuteButton?: boolean;
}

// Autoplaying looped reel video: IntersectionObserver (threshold .6) plays
// when on screen and pauses + rewinds when scrolled away. Click toggles
// play/pause with a brief center icon; mute is shared across all reels.
export function ReelVideo({ src, poster, onVisible, className, showMuteButton = true }: ReelVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  const muted = useMuteStore((s) => s.muted);
  const toggleMute = useMuteStore((s) => s.toggle);

  const [paused, setPaused] = useState(true);
  const [flash, setFlash] = useState<'play' | 'pause' | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  // React's `muted` prop is unreliable on first render; set the property.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          onVisibleRef.current?.();
          video.play().catch(() => {});
        } else {
          video.pause();
          video.currentTime = 0;
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [src]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setFlash('play');
    } else {
      video.pause();
      setFlash('pause');
    }
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 600);
  };

  return (
    <div className={cn('absolute inset-0 bg-black', className)}>
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        loop
        playsInline
        muted
        preload="metadata"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        className="h-full w-full object-cover"
      />

      {/* Click target covering the video (under the overlays). */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={paused ? 'Play reel' : 'Pause reel'}
        className="absolute inset-0 z-[5] h-full w-full cursor-pointer outline-none"
      />

      {/* Brief center icon on toggle + persistent play glyph while paused. */}
      <div className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center">
        <AnimatePresence>
          {flash === 'pause' && (
            <motion.span
              key="flash-pause"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.3, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-full bg-black/50 p-4 text-white"
            >
              <Pause size={36} fill="currentColor" />
            </motion.span>
          )}
          {paused && flash !== 'pause' && (
            <motion.span
              key="paused"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.3, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-full bg-black/50 p-4 text-white"
            >
              <Play size={36} fill="currentColor" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {showMuteButton && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted}
          className="absolute right-3 top-3 z-20 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      )}
    </div>
  );
}
