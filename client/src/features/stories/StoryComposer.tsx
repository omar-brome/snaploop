import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2, Type, X } from 'lucide-react';
import { toast } from '../../stores/uiStore';
import { compressImage, uploadFiles } from '../../services/upload';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { cn } from '../../utils/cn';
import type { MediaType } from '../../types';
import { createStory, type StickerText } from './api';

const MAX_VIDEO_SECONDS = 15;
const MAX_CAPTION = 500;
const MIN_TEXT_SIZE = 14;
const MAX_TEXT_SIZE = 64;
const TEXT_COLORS = ['#ffffff', '#262626', '#ff3040', '#0095f6', '#fdcb5c', '#2ecc71', '#a307ba'];

type Phase = 'idle' | 'uploading' | 'posting';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Story creation: pick an image or ≤15s video, add draggable text overlays
 * (color + size), caption, then upload and POST /stories.
 */
export function StoryComposer({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('IMAGE');
  const [duration, setDuration] = useState(0);

  const [texts, setTexts] = useState<StickerText[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const [caption, setCaption] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);

  const previewRef = useRef<HTMLDivElement>(null);
  const dragIdx = useRef<number | null>(null);

  const busy = phase !== 'idle';

  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const reset = () => {
    setFile(null);
    setSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setMediaType('IMAGE');
    setDuration(0);
    setTexts([]);
    setSelected(null);
    setCaption('');
    setPhase('idle');
    setProgress(0);
  };

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    const isImage = picked.type.startsWith('image/');
    const isVideo = picked.type.startsWith('video/');
    if (!isImage && !isVideo) {
      toast('Please choose an image or a video', 'error');
      return;
    }
    reset();
    setFile(picked);
    setMediaType(isImage ? 'IMAGE' : 'VIDEO');
    setSrc(URL.createObjectURL(picked));
  };

  // Video length gate via metadata.
  const handleLoadedMetadata = (e: SyntheticEvent<HTMLVideoElement>) => {
    const videoDuration = e.currentTarget.duration;
    if (videoDuration > MAX_VIDEO_SECONDS + 0.5) {
      toast(`Story videos must be ${MAX_VIDEO_SECONDS} seconds or shorter`, 'error');
      reset();
      return;
    }
    setDuration(videoDuration);
  };

  // ---- Text overlays ----

  const addText = () => {
    setTexts((ts) => [...ts, { text: 'Tap to edit', x: 0.5, y: 0.4, color: '#ffffff', size: 28 }]);
    setSelected(texts.length);
  };

  const updateSelected = (patch: Partial<StickerText>) => {
    if (selected === null) return;
    setTexts((ts) => ts.map((t, i) => (i === selected ? { ...t, ...patch } : t)));
  };

  const removeSelected = () => {
    if (selected === null) return;
    setTexts((ts) => ts.filter((_, i) => i !== selected));
    setSelected(null);
  };

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, idx: number) => {
    if (busy) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragIdx.current = idx;
    setSelected(idx);
  };

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const idx = dragIdx.current;
    if (idx === null || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    setTexts((ts) => ts.map((t, i) => (i === idx ? { ...t, x, y } : t)));
  };

  const endDrag = () => {
    dragIdx.current = null;
  };

  // ---- Submit ----

  const submit = async () => {
    if (!file || busy) return;
    if (mediaType === 'VIDEO' && duration === 0) return;
    try {
      setPhase('uploading');
      setProgress(0);
      const payload = mediaType === 'IMAGE' ? await compressImage(file) : file;
      const [media] = await uploadFiles([payload], {
        onProgress: (p) => setProgress(Math.round(p * 0.9)),
      });
      if (!media) throw new Error('Upload failed');

      setPhase('posting');
      setProgress(95);
      const cleanTexts = texts
        .map((t) => ({
          ...t,
          text: t.text.trim(),
          x: Number(t.x.toFixed(4)),
          y: Number(t.y.toFixed(4)),
        }))
        .filter((t) => t.text.length > 0);
      await createStory({
        mediaUrl: media.url,
        mediaType,
        durationSeconds: mediaType === 'VIDEO' ? Math.max(1, Math.round(duration)) : undefined,
        caption: caption.trim() || undefined,
        stickerData: cleanTexts.length > 0 ? { texts: cleanTexts } : undefined,
      });
      setProgress(100);
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      toast('Story shared');
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not share story', 'error');
      setPhase('idle');
      setProgress(0);
    }
  };

  if (!file || !src) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border-light px-6 py-16 dark:border-border-dark">
        <ImagePlus size={48} strokeWidth={1.25} aria-hidden />
        <p className="text-center text-sm text-muted-light dark:text-muted-dark">
          Share a photo or a video up to {MAX_VIDEO_SECONDS} seconds — it disappears after 24 hours
        </p>
        <label className="cursor-pointer">
          <span className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">
            Select photo or video
          </span>
          <input
            type="file"
            accept="image/*,video/*"
            className="sr-only"
            onChange={handlePick}
            aria-label="Select story media"
          />
        </label>
      </div>
    );
  }

  const selectedText = selected !== null ? texts[selected] : undefined;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
      {/* Preview with draggable overlays */}
      <div
        ref={previewRef}
        className="relative mx-auto aspect-[9/16] w-full max-w-[320px] select-none overflow-hidden rounded-xl bg-black"
        style={{ touchAction: 'none' }}
      >
        {mediaType === 'IMAGE' ? (
          <img
            src={src}
            alt="Story preview"
            draggable={false}
            className="pointer-events-none h-full w-full object-contain"
          />
        ) : (
          <video
            src={src}
            autoPlay
            loop
            muted
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            className="pointer-events-none h-full w-full object-contain"
          />
        )}

        {texts.map((t, i) => (
          <div
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`Text overlay: ${t.text || 'empty'}. Drag to move.`}
            onPointerDown={(e) => startDrag(e, i)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelected(i);
              }
            }}
            className={cn(
              'absolute max-w-[90%] cursor-grab whitespace-pre-wrap text-center font-bold active:cursor-grabbing',
              selected === i && 'rounded px-1 ring-2 ring-white/80'
            )}
            style={{
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              color: t.color,
              fontSize: t.size,
              textShadow: '0 1px 4px rgba(0,0,0,0.7)',
            }}
          >
            {t.text || 'Tap to edit'}
          </div>
        ))}

        <button
          type="button"
          onClick={reset}
          disabled={busy}
          aria-label="Remove media"
          className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
        >
          <X size={16} />
        </button>
        {mediaType === 'VIDEO' && duration > 0 && (
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
            {Math.round(duration)}s
          </span>
        )}
      </div>

      {/* Tools */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-light dark:text-muted-dark">
            Text
          </span>
          <Button variant="secondary" size="sm" onClick={addText} disabled={busy}>
            <Type size={14} aria-hidden /> Add text
          </Button>
        </div>

        {selectedText ? (
          <div className="space-y-3 rounded-xl border border-border-light p-3 dark:border-border-dark">
            <div className="flex items-end gap-2">
              <Input
                label="Text"
                name="story-overlay-text"
                value={selectedText.text}
                maxLength={120}
                onChange={(e) => updateSelected({ text: e.target.value })}
                disabled={busy}
                autoFocus
              />
              <button
                type="button"
                onClick={removeSelected}
                disabled={busy}
                aria-label="Remove text overlay"
                className="mb-0.5 rounded-md p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2" role="group" aria-label="Text color">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateSelected({ color })}
                  disabled={busy}
                  aria-label={`Text color ${color}`}
                  aria-pressed={selectedText.color === color}
                  className={cn(
                    'h-6 w-6 rounded-full border border-black/10 dark:border-white/20',
                    selectedText.color === color && 'ring-2 ring-primary ring-offset-2 dark:ring-offset-neutral-900'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <div>
              <label
                htmlFor="story-text-size"
                className="mb-1 block text-xs font-medium text-muted-light dark:text-muted-dark"
              >
                Size — {selectedText.size}px
              </label>
              <input
                id="story-text-size"
                type="range"
                min={MIN_TEXT_SIZE}
                max={MAX_TEXT_SIZE}
                step={1}
                value={selectedText.size}
                onChange={(e) => updateSelected({ size: Number(e.target.value) })}
                disabled={busy}
                className="w-full accent-primary"
              />
            </div>

            <p className="text-xs text-muted-light dark:text-muted-dark">
              Drag the text on the preview to position it.
            </p>
          </div>
        ) : (
          texts.length > 0 && (
            <p className="text-xs text-muted-light dark:text-muted-dark">
              Tap a text on the preview to edit it.
            </p>
          )
        )}

        <Input
          label="Caption"
          name="story-caption"
          value={caption}
          maxLength={MAX_CAPTION}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption…"
          disabled={busy}
        />

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
          <Button variant="secondary" onClick={reset} disabled={busy}>
            Discard
          </Button>
          <Button
            onClick={submit}
            loading={busy}
            disabled={busy || (mediaType === 'VIDEO' && duration === 0)}
          >
            Share to story
          </Button>
        </div>
      </div>
    </div>
  );
}
