import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Plus, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { MAX_FILES, formatDuration, type MediaItem } from './media';

interface SelectStepProps {
  items: MediaItem[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemove: (idx: number) => void;
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
}

// Step 1 — pick 1–10 photos/videos: dropzone + file input, large preview,
// thumbnail strip with HTML5 drag-to-reorder, arrow buttons and remove.
export function SelectStep({ items, onAddFiles, onRemove, onMove, disabled }: SelectStepProps) {
  const [fileDragOver, setFileDragOver] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const reorderIdx = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = items[Math.min(previewIdx, items.length - 1)];

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onAddFiles(e.target.files);
    e.target.value = '';
  };

  const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setFileDragOver(false);
    if (!disabled && e.dataTransfer.files.length > 0) onAddFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        if (!isFileDrag(e) || reorderIdx.current !== null) return;
        e.preventDefault();
        setFileDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setFileDragOver(false);
      }}
      onDrop={handleFileDrop}
      className={cn(
        'flex flex-col gap-4 rounded-xl transition-colors',
        fileDragOver && 'bg-primary/5 outline-dashed outline-2 outline-primary'
      )}
      aria-label="Media drop zone"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleInput}
        aria-label="Select photos and videos"
        disabled={disabled}
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border-light px-6 py-16 dark:border-border-dark">
          <ImagePlus size={48} strokeWidth={1.25} aria-hidden />
          <p className="text-center text-sm text-muted-light dark:text-muted-dark">
            Drag photos and videos here — up to {MAX_FILES} per post
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            Select from device
          </button>
        </div>
      ) : (
        <>
          {/* Large preview of the selected thumbnail */}
          {preview && (
            <div className="relative mx-auto flex max-h-[26rem] w-full max-w-md items-center justify-center overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-900">
              {preview.mediaType === 'IMAGE' ? (
                <img
                  src={preview.url}
                  alt={`Preview of selected media ${Math.min(previewIdx, items.length - 1) + 1}`}
                  className="max-h-[26rem] w-full object-contain"
                  draggable={false}
                />
              ) : (
                <video
                  key={preview.id}
                  src={preview.url}
                  controls
                  playsInline
                  className="max-h-[26rem] w-full bg-black object-contain"
                />
              )}
            </div>
          )}

          {/* Reorderable thumbnail strip */}
          <ul
            className="flex gap-2 overflow-x-auto py-1 scrollbar-none"
            aria-label="Selected media — drag a thumbnail or use the arrow buttons to reorder"
          >
            {items.map((item, idx) => (
              <li
                key={item.id}
                draggable={!disabled}
                onDragStart={(e) => {
                  reorderIdx.current = idx;
                  e.dataTransfer.effectAllowed = 'move';
                  // Some browsers need data set for DnD to start.
                  e.dataTransfer.setData('text/plain', String(idx));
                }}
                onDragOver={(e) => {
                  if (reorderIdx.current === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDropTarget(idx);
                }}
                onDrop={(e) => {
                  if (reorderIdx.current === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (reorderIdx.current !== idx) onMove(reorderIdx.current, idx);
                  setPreviewIdx(idx);
                  reorderIdx.current = null;
                  setDropTarget(null);
                }}
                onDragEnd={() => {
                  reorderIdx.current = null;
                  setDropTarget(null);
                }}
                className={cn(
                  'relative h-24 w-20 shrink-0 cursor-grab overflow-hidden rounded-lg border-2 active:cursor-grabbing',
                  Math.min(previewIdx, items.length - 1) === idx
                    ? 'border-primary'
                    : 'border-border-light dark:border-border-dark',
                  dropTarget === idx && 'ring-2 ring-primary ring-offset-1 dark:ring-offset-black'
                )}
              >
                <button
                  type="button"
                  onClick={() => setPreviewIdx(idx)}
                  disabled={disabled}
                  aria-label={`Preview media ${idx + 1} of ${items.length}`}
                  className="block h-full w-full"
                >
                  {item.mediaType === 'IMAGE' ? (
                    <img src={item.url} alt="" className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  )}
                </button>

                <span
                  className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/60 px-1 text-[10px] font-semibold text-white"
                  aria-hidden
                >
                  {idx + 1}
                </span>

                {item.mediaType === 'VIDEO' && item.duration !== null && (
                  <span className="absolute bottom-6 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                    {formatDuration(item.duration)}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  disabled={disabled}
                  aria-label={`Remove media ${idx + 1}`}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                >
                  <X size={12} />
                </button>

                <span className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent px-0.5 pb-0.5 pt-2">
                  <button
                    type="button"
                    onClick={() => onMove(idx, idx - 1)}
                    disabled={disabled || idx === 0}
                    aria-label={`Move media ${idx + 1} earlier`}
                    className="rounded-full p-0.5 text-white hover:bg-white/20 disabled:opacity-30"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(idx, idx + 1)}
                    disabled={disabled || idx === items.length - 1}
                    aria-label={`Move media ${idx + 1} later`}
                    className="rounded-full p-0.5 text-white hover:bg-white/20 disabled:opacity-30"
                  >
                    <ChevronRight size={14} />
                  </button>
                </span>
              </li>
            ))}

            {items.length < MAX_FILES && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled}
                  aria-label="Add more photos or videos"
                  className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-light text-muted-light hover:border-neutral-400 hover:text-current dark:border-border-dark dark:text-muted-dark"
                >
                  <Plus size={20} />
                  <span className="text-[10px] font-medium">
                    {items.length}/{MAX_FILES}
                  </span>
                </button>
              </li>
            )}
          </ul>

          <p className="text-xs text-muted-light dark:text-muted-dark">
            The first item is your cover. Drag thumbnails (or use the arrows) to reorder.
          </p>
        </>
      )}
    </div>
  );
}
