import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from '../../stores/uiStore';
import { compressImage, uploadFiles } from '../../services/upload';
import { Button } from '../../components/ui/Button';
import { cn } from '../../utils/cn';
import { uploadApi, type CreatePostMedia, type TagDraft } from './api';
import { bakeImage, getCropRect, isNoopEdit, type MediaEdit } from './canvas';
import {
  clearDraft,
  hasDraftContent,
  loadDraft,
  saveDraft,
  type DraftStep,
  type PostDraft,
} from './draft';
import { MAX_FILES, moveItem, toMediaItem, type MediaItem } from './media';
import { SelectStep } from './SelectStep';
import { EditStep } from './EditStep';
import { DetailsStep } from './DetailsStep';

const MAX_CAPTION = 2200;
/** compressImage caps the longest side at this many px (keep in sync). */
const COMPRESS_MAX_DIM = 1080;

type Phase = 'idle' | 'processing' | 'uploading' | 'posting';

const STEP_TITLES: Record<DraftStep, string> = {
  select: 'New post',
  edit: 'Edit',
  details: 'New post',
};

function asJpegName(name: string): string {
  return `${name.replace(/\.[^.]+$/, '')}.jpg`;
}

/** Best local guess at the published dimensions (fallback when the server omits them). */
function localDims(item: MediaItem): { width: number; height: number } {
  if (item.mediaType === 'VIDEO') return { width: item.width, height: item.height };
  const rect = getCropRect(item.width, item.height, item.edit.crop);
  const scale = Math.min(1, COMPRESS_MAX_DIM / Math.max(rect.width, rect.height, 1));
  return { width: Math.max(1, Math.round(rect.width * scale)), height: Math.max(1, Math.round(rect.height * scale)) };
}

// Orchestrates the three post steps (select → edit → details) plus the draft
// banner and the publish pipeline: bake edits on canvas → compress → upload
// with aggregate progress → POST /posts.
export function PostComposer({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<DraftStep>('select');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [commentsOff, setCommentsOff] = useState(false);
  const [tags, setTags] = useState<TagDraft[]>([]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);

  // Stale draft found on return — held until the user restores or discards it.
  const [pendingDraft, setPendingDraft] = useState<PostDraft | null>(() => {
    const d = loadDraft();
    return d && hasDraftContent(d) ? d : null;
  });

  const busy = phase !== 'idle';
  const safeActiveIdx = Math.min(activeIdx, Math.max(0, items.length - 1));

  // Object URLs live for the session only — revoke whatever is left on unmount.
  const itemsRef = useRef<MediaItem[]>(items);
  itemsRef.current = items;
  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    },
    []
  );

  // People-tags are placed on the first media — drop them if it changes.
  const firstId = items[0]?.id;
  useEffect(() => {
    setTags([]);
  }, [firstId]);

  // Draft autosave (text fields + lightweight media descriptors). Paused while
  // the restore banner is open so we don't clobber the saved draft.
  useEffect(() => {
    if (pendingDraft) return;
    const draft: PostDraft = {
      caption,
      location,
      commentsOff,
      step,
      media: items.map((i) => ({ name: i.file.name, mediaType: i.mediaType })),
      savedAt: Date.now(),
    };
    if (hasDraftContent(draft)) saveDraft(draft);
    else clearDraft();
  }, [caption, location, commentsOff, step, items, pendingDraft]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setCaption(pendingDraft.caption.slice(0, MAX_CAPTION));
    setLocation(pendingDraft.location);
    setCommentsOff(pendingDraft.commentsOff);
    setStep('select');
    setPendingDraft(null);
    if (pendingDraft.media.length > 0) {
      toast('Draft restored — re-add your photos and videos to continue');
    } else {
      toast('Draft restored');
    }
  };

  const discardDraft = () => {
    clearDraft();
    setPendingDraft(null);
  };

  const addFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0 || busy) return;
    const settled = await Promise.allSettled(incoming.map(toMediaItem));
    const added: MediaItem[] = [];
    let firstError: string | null = null;
    for (const result of settled) {
      if (result.status === 'fulfilled') added.push(result.value);
      else if (!firstError)
        firstError = result.reason instanceof Error ? result.reason.message : 'Could not read a file';
    }
    if (firstError) toast(firstError, 'error');
    if (added.length === 0) return;

    const room = MAX_FILES - itemsRef.current.length;
    const take = added.slice(0, Math.max(0, room));
    const overflow = added.slice(take.length);
    overflow.forEach((item) => URL.revokeObjectURL(item.url));
    if (overflow.length > 0) toast(`Up to ${MAX_FILES} photos and videos per post`, 'error');
    if (take.length > 0) setItems((prev) => [...prev, ...take]);
  };

  const removeItem = (idx: number) => {
    const item = items[idx];
    if (!item || busy) return;
    URL.revokeObjectURL(item.url);
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setActiveIdx((a) => Math.max(0, Math.min(a, items.length - 2)));
  };

  const patchEdit = (idx: number, patch: Partial<MediaEdit>) =>
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, edit: { ...item.edit, ...patch } } : item)));

  const goBack = () => {
    if (busy) return;
    if (step === 'details') setStep('edit');
    else if (step === 'edit') setStep('select');
  };

  const goNext = () => {
    if (busy || items.length === 0) return;
    if (step === 'select') setStep('edit');
    else if (step === 'edit') setStep('details');
    else void publish();
  };

  const publish = async () => {
    if (items.length === 0 || busy) return;
    try {
      // 1) Bake edits + compress (images only; videos pass through untouched).
      setPhase('processing');
      setProgress(0);
      const prepared: (File | Blob)[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.mediaType === 'VIDEO') {
          prepared.push(item.file);
        } else {
          const baked = isNoopEdit(item.edit) ? item.file : await bakeImage(item.file, item.edit);
          const file =
            baked instanceof File ? baked : new File([baked], asJpegName(item.file.name), { type: 'image/jpeg' });
          prepared.push(await compressImage(file));
        }
        setProgress(Math.round(((i + 1) / items.length) * 35));
      }

      // 2) Upload everything in one multipart request with progress.
      setPhase('uploading');
      const uploaded = await uploadFiles(prepared, {
        onProgress: (pct) => setProgress(35 + Math.round(pct * 0.6)),
      });
      if (uploaded.length !== items.length) throw new Error('Upload failed — please try again');

      // 3) Create the post.
      setPhase('posting');
      setProgress(97);
      const media: CreatePostMedia[] = uploaded.map((up, idx) => {
        const fallback = localDims(items[idx]);
        return {
          url: up.url,
          mediaType: items[idx].mediaType,
          width: up.width ?? fallback.width,
          height: up.height ?? fallback.height,
          displayOrder: idx,
        };
      });
      await uploadApi.createPost({
        caption: caption.trim() || undefined,
        locationName: location.trim() || undefined,
        commentsOff: commentsOff || undefined,
        media,
        tagUserIds: tags.length > 0 ? tags.map(({ userId, x, y }) => ({ userId, x, y })) : undefined,
      });

      setProgress(100);
      clearDraft();
      toast('Your post has been shared');
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not share the post', 'error');
      setPhase('idle');
      setProgress(0);
    }
  };

  const nextLabel = step === 'details' ? 'Share' : 'Next';
  const nextDisabled = items.length === 0 || busy;
  const progressLabel =
    phase === 'processing' ? 'Preparing media…' : phase === 'uploading' ? `Uploading… ${progress}%` : 'Sharing…';

  return (
    <section aria-label="Create a post">
      {/* Draft restore/discard banner */}
      {pendingDraft && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light bg-neutral-50 px-4 py-3 dark:border-border-dark dark:bg-neutral-900"
        >
          <p className="text-sm">
            You have an unfinished draft
            {pendingDraft.media.length > 0 &&
              ` (${pendingDraft.media.length} media ${pendingDraft.media.length === 1 ? 'item' : 'items'} will need re-adding)`}
            .
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={restoreDraft}>
              Restore
            </Button>
            <Button size="sm" variant="secondary" onClick={discardDraft}>
              Discard
            </Button>
          </div>
        </div>
      )}

      {/* Step header */}
      <header className="sticky top-14 z-30 flex items-center justify-between border-b border-border-light bg-white px-2 py-2 dark:border-border-dark dark:bg-black md:static md:px-4">
        {step !== 'select' ? (
          <button
            type="button"
            onClick={goBack}
            disabled={busy}
            aria-label={step === 'details' ? 'Back to edit' : 'Back to select'}
            className="rounded-full p-2 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
          >
            <ArrowLeft size={22} />
          </button>
        ) : (
          <span className="h-[38px] w-[38px]" aria-hidden />
        )}
        <h2 className="text-base font-semibold">{STEP_TITLES[step]}</h2>
        <Button
          variant="text"
          onClick={goNext}
          disabled={nextDisabled}
          loading={busy}
          aria-label={step === 'details' ? 'Share post' : 'Go to next step'}
          className="px-2 py-2 text-sm disabled:opacity-50"
        >
          {nextLabel}
        </Button>
      </header>

      {/* Aggregate publish progress */}
      {busy && (
        <div className="px-4 pt-3" aria-live="polite">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Publishing progress"
            className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-light dark:text-muted-dark">{progressLabel}</p>
        </div>
      )}

      <div className={cn('px-4 py-4', busy && 'pointer-events-none opacity-80')}>
        {step === 'select' && (
          <SelectStep
            items={items}
            onAddFiles={(files) => void addFiles(files)}
            onRemove={removeItem}
            onMove={(from, to) => setItems((prev) => moveItem(prev, from, to))}
            disabled={busy}
          />
        )}

        {step === 'edit' && (
          <EditStep
            items={items}
            activeIdx={safeActiveIdx}
            onActiveIdx={setActiveIdx}
            onPatchEdit={patchEdit}
            disabled={busy}
          />
        )}

        {step === 'details' && (
          <DetailsStep
            items={items}
            caption={caption}
            onCaption={setCaption}
            location={location}
            onLocation={setLocation}
            commentsOff={commentsOff}
            onCommentsOff={setCommentsOff}
            tags={tags}
            onAddTag={(tag) => setTags((prev) => [...prev.filter((t) => t.userId !== tag.userId), tag])}
            onRemoveTag={(userId) => setTags((prev) => prev.filter((t) => t.userId !== userId))}
            maxCaption={MAX_CAPTION}
            disabled={busy}
          />
        )}
      </div>
    </section>
  );
}
