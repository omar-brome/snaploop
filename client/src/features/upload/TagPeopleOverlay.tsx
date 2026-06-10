import { MouseEvent, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { cn } from '../../utils/cn';
import { clamp01, filterToCss, getCropRect } from './canvas';
import type { MediaItem } from './media';
import { uploadApi, type TagDraft } from './api';

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface TagPeopleOverlayProps {
  open: boolean;
  onClose: () => void;
  /** First media of the post — tags are placed on it. */
  media: MediaItem;
  tags: TagDraft[];
  onAdd: (tag: TagDraft) => void;
  onRemove: (userId: string) => void;
}

// Tag mode: click a spot on the first image → debounced user search →
// picking a result drops a {userId, x, y} chip at that spot.
export function TagPeopleOverlay({ open, onClose, media, tags, onAdd, onRemove }: TagPeopleOverlayProps) {
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const { data: results, isFetching } = useQuery({
    queryKey: ['upload', 'tag-user-search', debouncedQuery],
    queryFn: () => uploadApi.searchUsers(debouncedQuery),
    enabled: open && pending !== null && debouncedQuery.length > 0,
    staleTime: 30_000,
  });

  // Drop transient state whenever the overlay closes.
  useEffect(() => {
    if (!open) {
      setPending(null);
      setQuery('');
    }
  }, [open]);

  const handleImageClick = (e: MouseEvent<HTMLButtonElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    setPending({
      x: clamp01((e.clientX - box.left) / box.width),
      y: clamp01((e.clientY - box.top) / box.height),
    });
    setQuery('');
  };

  const pick = (user: { id: string; username: string }) => {
    if (!pending) return;
    onAdd({
      userId: user.id,
      username: user.username,
      x: Number(pending.x.toFixed(4)),
      y: Number(pending.y.toFixed(4)),
    });
    setPending(null);
    setQuery('');
  };

  const isImage = media.mediaType === 'IMAGE';
  const rect = getCropRect(media.width, media.height, media.edit.crop);
  const css = filterToCss(media.edit.filter, media.edit.adjustments);

  return (
    <Modal open={open} onClose={onClose} title="Tag people">
      <div className="space-y-3 px-4 pb-4 pt-3">
        <p className="text-xs text-muted-light dark:text-muted-dark">
          {isImage ? 'Click the photo to tag someone at that spot.' : 'Click the video frame to tag someone.'}
        </p>

        {/* Tagging surface — rendered with the same crop/filter as the final post */}
        <div className="relative">
          <button
            type="button"
            onClick={handleImageClick}
            aria-label="Pick a spot to tag someone"
            style={
              isImage && rect.width > 0 && rect.height > 0
                ? { aspectRatio: `${rect.width} / ${rect.height}` }
                : undefined
            }
            className="relative block w-full cursor-crosshair overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900"
          >
            {isImage ? (
              <img
                src={media.url}
                alt="Post photo"
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  width: `${(media.width / Math.max(1, rect.width)) * 100}%`,
                  left: `${(-rect.x / Math.max(1, rect.width)) * 100}%`,
                  top: `${(-rect.y / Math.max(1, rect.height)) * 100}%`,
                  filter: css === 'none' ? undefined : css,
                }}
              />
            ) : (
              <video src={media.url} muted playsInline preload="metadata" className="pointer-events-none block w-full" />
            )}
          </button>

          {tags.map((tag) => (
            <span
              key={tag.userId}
              className="absolute flex max-w-[60%] -translate-x-1/2 items-center gap-1 rounded-full bg-black/75 py-1 pl-2.5 pr-1 text-xs font-medium text-white"
              style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}
            >
              <span className="truncate">{tag.username}</span>
              <button
                type="button"
                onClick={() => onRemove(tag.userId)}
                aria-label={`Remove tag for ${tag.username}`}
                className="rounded-full p-0.5 hover:bg-white/20"
              >
                <X size={12} />
              </button>
            </span>
          ))}

          {pending && (
            <span
              aria-hidden
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
              style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}
            />
          )}
        </div>

        {pending ? (
          <div className="space-y-2">
            <Input
              name="tag-user-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a person…"
              aria-label="Search users to tag"
              autoFocus
              autoComplete="off"
            />
            <div
              className="max-h-48 overflow-y-auto rounded-lg border border-border-light dark:border-border-dark"
              aria-live="polite"
            >
              {isFetching ? (
                <div className="flex justify-center p-4">
                  <Spinner />
                </div>
              ) : debouncedQuery.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-light dark:text-muted-dark">
                  Type a name or username
                </p>
              ) : (results?.length ?? 0) === 0 ? (
                <p className="p-4 text-center text-sm text-muted-light dark:text-muted-dark">
                  No people found for &ldquo;{debouncedQuery}&rdquo;
                </p>
              ) : (
                <ul>
                  {results?.map((user) => {
                    const alreadyTagged = tags.some((t) => t.userId === user.id);
                    return (
                      <li key={user.id}>
                        <button
                          type="button"
                          onClick={() => pick(user)}
                          disabled={alreadyTagged}
                          className={cn(
                            'flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800',
                            alreadyTagged && 'cursor-not-allowed opacity-50'
                          )}
                        >
                          <Avatar src={user.avatarUrl} alt={user.username} size={32} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {user.username}
                              {alreadyTagged && ' · already tagged'}
                            </span>
                            <span className="block truncate text-xs text-muted-light dark:text-muted-dark">
                              {user.fullName}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPending(null);
                setQuery('');
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-light dark:text-muted-dark">
              {tags.length > 0 ? `${tags.length} ${tags.length === 1 ? 'person' : 'people'} tagged` : 'No one tagged yet'}
            </p>
            <Button onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
