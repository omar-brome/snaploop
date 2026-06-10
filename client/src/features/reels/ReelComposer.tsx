import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clapperboard, ImageUp, Play, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../../stores/uiStore';
import { uploadFiles } from '../../services/upload';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { cn } from '../../utils/cn';
import { reelsApi } from './api';

const MAX_DURATION_SECONDS = 90;
const MAX_CAPTION = 2200;

type Phase = 'idle' | 'uploading' | 'posting';

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Reel creation flow: pick a ≤90s video, choose a cover (timeline scrub frame
// capture or custom image), caption + audio credits, then upload and POST.
export function ReelComposer({ onDone }: { onDone: () => void }) {
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [scrub, setScrub] = useState(0);
  const [frameBlob, setFrameBlob] = useState<Blob | null>(null);
  const [framePreview, setFramePreview] = useState<string | null>(null);
  const [customThumb, setCustomThumb] = useState<File | null>(null);
  const [customThumbUrl, setCustomThumbUrl] = useState<string | null>(null);

  const [caption, setCaption] = useState('');
  const [audioName, setAudioName] = useState('Original audio');
  const [audioArtist, setAudioArtist] = useState(me?.username ?? '');

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Revoke object URLs on unmount.
  useEffect(
    () => () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
      if (framePreview) URL.revokeObjectURL(framePreview);
      if (customThumbUrl) URL.revokeObjectURL(customThumbUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const resetVideo = () => {
    setFile(null);
    setVideoSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFramePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCustomThumbUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFrameBlob(null);
    setCustomThumb(null);
    setDuration(0);
    setScrub(0);
    setPlaying(false);
  };

  const handleVideoPick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    if (!picked.type.startsWith('video/')) {
      toast('Please choose a video file', 'error');
      return;
    }
    resetVideo();
    setFile(picked);
    setVideoSrc(URL.createObjectURL(picked));
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.duration > MAX_DURATION_SECONDS) {
      toast('Reels must be 90 seconds or shorter', 'error');
      resetVideo();
      return;
    }
    setDuration(video.duration);
    // Seek slightly in so the default cover isn't a black first frame.
    video.currentTime = Math.min(0.1, video.duration);
  };

  // Draw the video's current frame to the canvas → cover blob.
  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setFrameBlob(blob);
        setFramePreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      },
      'image/jpeg',
      0.85
    );
  };

  const handleScrub = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setScrub(value);
    video.currentTime = value;
    // Scrubbing picks a frame cover; drop any custom image.
    setCustomThumb(null);
  };

  const handleCustomThumb = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    if (!picked.type.startsWith('image/')) {
      toast('Cover must be an image', 'error');
      return;
    }
    setCustomThumb(picked);
    setCustomThumbUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(picked);
    });
  };

  const togglePreview = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const coverPreview = customThumb ? customThumbUrl : framePreview;
  const busy = phase !== 'idle';

  const submit = async () => {
    if (!file || busy) return;
    try {
      setPhase('uploading');
      setProgress(0);
      videoRef.current?.pause();

      const [video] = await uploadFiles([file], {
        onProgress: (p) => setProgress(Math.round(p * 0.9)),
      });
      if (!video) throw new Error('Video upload failed');

      let thumbnailUrl: string | undefined;
      const thumbSource: Blob | null = customThumb ?? frameBlob;
      if (thumbSource) {
        setProgress(92);
        const [thumb] = await uploadFiles([thumbSource]);
        thumbnailUrl = thumb?.url;
      }

      setPhase('posting');
      setProgress(97);
      await reelsApi.create({
        videoUrl: video.url,
        thumbnailUrl,
        caption: caption.trim() || undefined,
        audioName: audioName.trim() || 'Original audio',
        audioArtist: audioArtist.trim() || undefined,
        durationSeconds: Math.round(duration),
      });
      setProgress(100);
      queryClient.invalidateQueries({ queryKey: ['reels'] });
      toast('Reel shared');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not share reel', 'error');
      setPhase('idle');
      setProgress(0);
    }
  };

  if (!file || !videoSrc) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border-light px-6 py-16 dark:border-border-dark">
        <Clapperboard size={48} strokeWidth={1.25} aria-hidden />
        <p className="text-center text-sm text-muted-light dark:text-muted-dark">
          Share a video up to 90 seconds long
        </p>
        <label className="cursor-pointer">
          <span className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">
            Select video
          </span>
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={handleVideoPick}
            aria-label="Select reel video"
          />
        </label>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      {/* Preview + cover picker */}
      <div className="flex flex-col gap-3">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            src={videoSrc}
            playsInline
            loop
            onLoadedMetadata={handleLoadedMetadata}
            onSeeked={captureFrame}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => {
              if (!e.currentTarget.paused) setScrub(e.currentTarget.currentTime);
            }}
            className="h-full w-full object-contain"
          />
          <button
            type="button"
            onClick={togglePreview}
            aria-label={playing ? 'Pause preview' : 'Play preview'}
            className="absolute inset-0 flex items-center justify-center text-white"
          >
            {!playing && (
              <span className="rounded-full bg-black/50 p-3">
                <Play size={28} fill="currentColor" />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={resetVideo}
            disabled={busy}
            aria-label="Remove video"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
          >
            <X size={16} />
          </button>
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
            {formatClock(duration)}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-light dark:text-muted-dark">
              Cover
            </span>
            <label className="cursor-pointer text-xs font-semibold text-primary hover:text-primary-hover">
              <span className="inline-flex items-center gap-1">
                <ImageUp size={14} /> Upload image
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleCustomThumb}
                aria-label="Upload custom cover image"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={cn(
                'h-20 w-12 shrink-0 overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-800',
                customThumb && 'ring-2 ring-primary'
              )}
            >
              {coverPreview && (
                <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={0}
                max={Math.max(duration, 0.1)}
                step={0.1}
                value={scrub}
                onChange={(e) => handleScrub(Number(e.target.value))}
                disabled={busy || duration === 0}
                aria-label="Scrub video to choose a cover frame"
                className="w-full accent-primary"
              />
              <p className="mt-1 text-xs text-muted-light dark:text-muted-dark">
                {customThumb
                  ? 'Using custom cover — drag to pick a frame instead'
                  : `Frame at ${formatClock(scrub)}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-col gap-4">
        <div>
          <Textarea
            label="Caption"
            name="reel-caption"
            rows={5}
            maxLength={MAX_CAPTION}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write a caption…"
            disabled={busy}
          />
          <p className="mt-1 text-right text-xs text-muted-light dark:text-muted-dark">
            {caption.length}/{MAX_CAPTION}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Audio name"
            name="reel-audio-name"
            value={audioName}
            onChange={(e) => setAudioName(e.target.value)}
            placeholder="Original audio"
            maxLength={120}
            disabled={busy}
          />
          <Input
            label="Audio artist"
            name="reel-audio-artist"
            value={audioArtist}
            onChange={(e) => setAudioArtist(e.target.value)}
            placeholder={me?.username ?? 'Artist'}
            maxLength={120}
            disabled={busy}
          />
        </div>

        {busy && (
          <div className="space-y-1.5">
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
              className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-light dark:text-muted-dark">
              {phase === 'uploading' ? `Uploading… ${progress}%` : 'Publishing…'}
            </p>
          </div>
        )}

        <div className="mt-auto flex justify-end gap-2">
          <Button variant="secondary" onClick={resetVideo} disabled={busy}>
            Discard
          </Button>
          <Button onClick={submit} loading={busy} disabled={busy || duration === 0}>
            Share reel
          </Button>
        </div>
      </div>
    </div>
  );
}
