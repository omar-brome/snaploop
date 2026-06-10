import { PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../utils/cn';
import {
  ADJUSTMENT_DEFAULT,
  ADJUSTMENT_MAX,
  ADJUSTMENT_MIN,
  ASPECT_PRESETS,
  FILTER_PRESETS,
  clamp01,
  filterToCss,
  findPreset,
  getCropRect,
  type Adjustments,
  type AspectId,
  type MediaEdit,
} from './canvas';
import type { MediaItem } from './media';

type EditTab = 'filters' | 'adjust' | 'crop';

interface EditStepProps {
  items: MediaItem[];
  activeIdx: number;
  onActiveIdx: (idx: number) => void;
  onPatchEdit: (idx: number, patch: Partial<MediaEdit>) => void;
  disabled?: boolean;
}

const ADJUSTMENT_FIELDS: { key: keyof Adjustments; label: string }[] = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'saturation', label: 'Saturation' },
];

/**
 * Live preview of an image inside its crop window. The container takes the
 * crop aspect; the <img> is oversized + offset in percentages so the crop
 * rect exactly fills the frame. When `pannable`, pointer-drag repositions
 * the photo within the window.
 */
function CropPreview({
  item,
  pannable,
  onOffset,
  disabled,
}: {
  item: MediaItem;
  pannable: boolean;
  onOffset: (offsetX: number, offsetY: number) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  const { edit, width: srcW, height: srcH } = item;
  const rect = getCropRect(srcW, srcH, edit.crop);
  const css = filterToCss(edit.filter, edit.adjustments);

  const startPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pannable || disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: edit.crop.offsetX,
      offsetY: edit.crop.offsetY,
    };
  };

  const movePan = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = containerRef.current;
    if (!d || !el) return;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || rect.width === 0 || rect.height === 0) return;
    const scale = box.width / rect.width; // container px per source px
    const overflowX = srcW - rect.width;
    const overflowY = srcH - rect.height;
    // Dragging the photo right reveals its left side → the crop x decreases.
    const dxSrc = (e.clientX - d.startX) / scale;
    const dySrc = (e.clientY - d.startY) / scale;
    onOffset(
      overflowX > 0 ? clamp01(d.offsetX - dxSrc / overflowX) : 0.5,
      overflowY > 0 ? clamp01(d.offsetY - dySrc / overflowY) : 0.5
    );
  };

  const endPan = () => {
    drag.current = null;
  };

  if (rect.width === 0 || rect.height === 0) return null;

  // Width capped so the frame never exceeds ~26rem tall on desktop.
  const widthCap = `min(100%, ${((26 * rect.width) / rect.height).toFixed(2)}rem)`;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={pannable ? 'Crop window — drag the photo to reposition it' : 'Edited photo preview'}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      style={{ aspectRatio: `${rect.width} / ${rect.height}`, width: widthCap, touchAction: pannable ? 'none' : undefined }}
      className={cn(
        'relative mx-auto max-w-md select-none overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-900',
        pannable && !disabled && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <img
        src={item.url}
        alt=""
        draggable={false}
        className="pointer-events-none absolute max-w-none"
        style={{
          width: `${(srcW / rect.width) * 100}%`,
          left: `${(-rect.x / rect.width) * 100}%`,
          top: `${(-rect.y / rect.height) * 100}%`,
          filter: css === 'none' ? undefined : css,
        }}
      />
      {pannable && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-60"
        >
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="border border-white/30" />
          ))}
        </span>
      )}
    </div>
  );
}

// Step 2 — per-media editing: 12-filter carousel, brightness/contrast/
// saturation sliders, and aspect-preset crop with drag-to-pan. Videos pass
// through untouched.
export function EditStep({ items, activeIdx, onActiveIdx, onPatchEdit, disabled }: EditStepProps) {
  const [tab, setTab] = useState<EditTab>('filters');
  const item = items[activeIdx];
  if (!item) return null;

  const isVideo = item.mediaType === 'VIDEO';
  const patch = (p: Partial<MediaEdit>) => onPatchEdit(activeIdx, p);
  const setAdjust = (key: keyof Adjustments, value: number) =>
    patch({ adjustments: { ...item.edit.adjustments, [key]: value } });
  const setAspect = (aspect: AspectId) => patch({ crop: { aspect, offsetX: 0.5, offsetY: 0.5 } });
  const setOffset = (offsetX: number, offsetY: number) =>
    patch({ crop: { ...item.edit.crop, offsetX, offsetY } });

  const adjustmentsAtDefault = ADJUSTMENT_FIELDS.every(
    ({ key }) => item.edit.adjustments[key] === ADJUSTMENT_DEFAULT
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Which media is being edited */}
      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none" role="tablist" aria-label="Media to edit">
          {items.map((m, idx) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={idx === activeIdx}
              aria-label={`Edit media ${idx + 1} of ${items.length}${m.mediaType === 'VIDEO' ? ' (video)' : ''}`}
              onClick={() => onActiveIdx(idx)}
              disabled={disabled}
              className={cn(
                'h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2',
                idx === activeIdx ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
              )}
            >
              {m.mediaType === 'IMAGE' ? (
                <img
                  src={m.url}
                  alt=""
                  draggable={false}
                  className={cn('h-full w-full object-cover', findPreset(m.edit.filter).className)}
                />
              ) : (
                <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {isVideo ? (
        <>
          <video
            key={item.id}
            src={item.url}
            controls
            playsInline
            className="mx-auto max-h-[26rem] w-full max-w-md rounded-xl bg-black object-contain"
          />
          <p className="text-center text-sm text-muted-light dark:text-muted-dark">
            Filters and cropping aren&rsquo;t available for videos — this clip is shared as is.
          </p>
        </>
      ) : (
        <>
          <CropPreview item={item} pannable={tab === 'crop'} onOffset={setOffset} disabled={disabled} />

          {/* Tool tabs */}
          <div
            role="tablist"
            aria-label="Edit tools"
            className="flex justify-center gap-8 border-b border-border-light dark:border-border-dark"
          >
            {(['filters', 'adjust', 'crop'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                disabled={disabled}
                className={cn(
                  'border-b-2 px-1 pb-2 text-sm font-semibold capitalize transition-colors',
                  tab === t
                    ? 'border-current'
                    : 'border-transparent text-muted-light hover:text-current dark:text-muted-dark'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'filters' && (
            <div
              className="flex gap-3 overflow-x-auto pb-2 scrollbar-none"
              role="radiogroup"
              aria-label="Filter presets"
            >
              {FILTER_PRESETS.map((f) => {
                const active = item.edit.filter === f.id;
                return (
                  <button
                    key={f.id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => patch({ filter: f.id })}
                    disabled={disabled}
                    className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        'block h-16 w-16 overflow-hidden rounded-lg border-2',
                        active ? 'border-primary' : 'border-transparent'
                      )}
                    >
                      <img
                        src={item.url}
                        alt=""
                        draggable={false}
                        className={cn('h-full w-full object-cover', f.className)}
                      />
                    </span>
                    <span
                      className={cn(
                        'text-xs',
                        active ? 'font-semibold text-primary' : 'text-muted-light dark:text-muted-dark'
                      )}
                    >
                      {f.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'adjust' && (
            <div className="mx-auto w-full max-w-md space-y-4">
              {ADJUSTMENT_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor={`adjust-${key}`}
                      className="text-xs font-medium text-muted-light dark:text-muted-dark"
                    >
                      {label}
                    </label>
                    <span className="text-xs tabular-nums">{item.edit.adjustments[key]}%</span>
                  </div>
                  <input
                    id={`adjust-${key}`}
                    type="range"
                    min={ADJUSTMENT_MIN}
                    max={ADJUSTMENT_MAX}
                    step={1}
                    value={item.edit.adjustments[key]}
                    onChange={(e) => setAdjust(key, Number(e.target.value))}
                    disabled={disabled}
                    className="w-full accent-primary"
                  />
                </div>
              ))}
              <div className="text-right">
                <Button
                  variant="text"
                  size="sm"
                  onClick={() =>
                    patch({
                      adjustments: {
                        brightness: ADJUSTMENT_DEFAULT,
                        contrast: ADJUSTMENT_DEFAULT,
                        saturation: ADJUSTMENT_DEFAULT,
                      },
                    })
                  }
                  disabled={disabled || adjustmentsAtDefault}
                  className="text-sm disabled:opacity-50"
                >
                  Reset adjustments
                </Button>
              </div>
            </div>
          )}

          {tab === 'crop' && (
            <div className="space-y-3">
              <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Aspect ratio">
                {ASPECT_PRESETS.map((a) => {
                  const active = item.edit.crop.aspect === a.id;
                  return (
                    <button
                      key={a.id}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setAspect(a.id)}
                      disabled={disabled}
                      className={cn(
                        'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                        active
                          ? 'border-transparent bg-primary text-white'
                          : 'border-border-light hover:bg-neutral-100 dark:border-border-dark dark:hover:bg-neutral-800'
                      )}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-xs text-muted-light dark:text-muted-dark">
                {item.edit.crop.aspect === 'original'
                  ? 'Pick a ratio, then drag the photo to frame it.'
                  : 'Drag the photo to reposition it inside the frame.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
