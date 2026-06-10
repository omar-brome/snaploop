import { useState } from 'react';
import { ChevronDown, Images, MapPin, UserPlus, X } from 'lucide-react';
import { Input, Textarea } from '../../components/ui/Input';
import { cn } from '../../utils/cn';
import { filterToCss, findPreset } from './canvas';
import type { MediaItem } from './media';
import type { TagDraft } from './api';
import { TagPeopleOverlay } from './TagPeopleOverlay';

interface DetailsStepProps {
  items: MediaItem[];
  caption: string;
  onCaption: (value: string) => void;
  location: string;
  onLocation: (value: string) => void;
  commentsOff: boolean;
  onCommentsOff: (value: boolean) => void;
  tags: TagDraft[];
  onAddTag: (tag: TagDraft) => void;
  onRemoveTag: (userId: string) => void;
  maxCaption: number;
  disabled?: boolean;
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-neutral-300 dark:bg-neutral-700'
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5'
        )}
      />
    </button>
  );
}

// Step 3 — caption (2200 max + counter), location name, tag people overlay,
// and the Advanced section with the comments-off toggle.
export function DetailsStep({
  items,
  caption,
  onCaption,
  location,
  onLocation,
  commentsOff,
  onCommentsOff,
  tags,
  onAddTag,
  onRemoveTag,
  maxCaption,
  disabled,
}: DetailsStepProps) {
  const [tagOpen, setTagOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const first = items[0];
  const firstCss = first ? filterToCss(first.edit.filter, first.edit.adjustments) : 'none';

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,240px)_1fr]">
      {/* Compact media recap */}
      {first && (
        <div className="mx-auto w-full max-w-[240px]">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-900">
            {first.mediaType === 'IMAGE' ? (
              <img
                src={first.url}
                alt="Post cover preview"
                draggable={false}
                className={cn('h-full w-full object-cover', findPreset(first.edit.filter).className)}
                style={{ filter: firstCss === 'none' ? undefined : firstCss }}
              />
            ) : (
              <video src={first.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            )}
            {items.length > 1 && (
              <span
                className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
                aria-label={`${items.length} items in this post`}
              >
                <Images size={12} aria-hidden /> {items.length}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-4">
        {/* Caption */}
        <div>
          <Textarea
            label="Caption"
            name="post-caption"
            rows={6}
            maxLength={maxCaption}
            value={caption}
            onChange={(e) => onCaption(e.target.value)}
            placeholder="Write a caption… use #hashtags and @mentions"
            disabled={disabled}
          />
          <p
            className={cn(
              'mt-1 text-right text-xs tabular-nums',
              caption.length >= maxCaption ? 'text-red-500' : 'text-muted-light dark:text-muted-dark'
            )}
            aria-live="polite"
          >
            {caption.length}/{maxCaption}
          </p>
        </div>

        {/* Location */}
        <div className="relative">
          <Input
            label="Location"
            name="post-location"
            value={location}
            maxLength={120}
            onChange={(e) => onLocation(e.target.value)}
            placeholder="Add a location (optional)"
            disabled={disabled}
            className="pr-9"
          />
          <MapPin
            size={16}
            aria-hidden
            className="pointer-events-none absolute bottom-2.5 right-3 text-muted-light dark:text-muted-dark"
          />
        </div>

        {/* Tag people */}
        <div className="border-y border-border-light py-1 dark:border-border-dark">
          <button
            type="button"
            onClick={() => setTagOpen(true)}
            disabled={disabled || !first}
            className="flex w-full items-center justify-between py-2 text-sm disabled:opacity-50"
            aria-haspopup="dialog"
          >
            <span className="flex items-center gap-2 font-medium">
              <UserPlus size={18} aria-hidden /> Tag people
            </span>
            <span className="text-xs text-muted-light dark:text-muted-dark">
              {tags.length > 0 ? `${tags.length} tagged` : 'None'}
            </span>
          </button>
          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-2 pb-2" aria-label="Tagged people">
              {tags.map((tag) => (
                <li
                  key={tag.userId}
                  className="flex items-center gap-1 rounded-full bg-neutral-100 py-1 pl-3 pr-1.5 text-xs font-medium dark:bg-neutral-800"
                >
                  @{tag.username}
                  <button
                    type="button"
                    onClick={() => onRemoveTag(tag.userId)}
                    disabled={disabled}
                    aria-label={`Remove tag for ${tag.username}`}
                    className="rounded-full p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Advanced settings */}
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
            aria-controls="post-advanced-settings"
            className="flex w-full items-center justify-between py-2 text-sm font-semibold"
          >
            Advanced settings
            <ChevronDown
              size={18}
              aria-hidden
              className={cn('transition-transform', advancedOpen && 'rotate-180')}
            />
          </button>
          {advancedOpen && (
            <div id="post-advanced-settings" className="flex items-start justify-between gap-4 py-2">
              <div>
                <p className="text-sm font-medium">Turn off commenting</p>
                <p className="text-xs text-muted-light dark:text-muted-dark">
                  You can change this later from the post menu.
                </p>
              </div>
              <Switch checked={commentsOff} onChange={onCommentsOff} disabled={disabled} label="Turn off commenting" />
            </div>
          )}
        </div>
      </div>

      {first && (
        <TagPeopleOverlay
          open={tagOpen}
          onClose={() => setTagOpen(false)}
          media={first}
          tags={tags}
          onAdd={onAddTag}
          onRemove={onRemoveTag}
        />
      )}
    </div>
  );
}
