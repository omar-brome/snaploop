import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../../stores/uiStore';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { cn } from '../../utils/cn';
import { timeAgo } from '../../utils/timeAgo';
import {
  createHighlight,
  deleteHighlight,
  fetchHighlight,
  fetchUserHighlights,
  fetchUserStories,
} from './api';
import { SlideShow } from './SlideShow';

/**
 * Profile highlights: circles row (GET /highlights/user/:username), click
 * opens a slideshow viewer; owners get a "New" circle (create from own active
 * stories) and can delete a highlight from inside the viewer.
 */
export function HighlightsRow({
  username,
  isOwnProfile,
}: {
  username: string;
  isOwnProfile: boolean;
}) {
  const { data: highlights, isLoading } = useQuery({
    queryKey: ['highlights', username],
    queryFn: () => fetchUserHighlights(username),
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-hidden px-4 py-3" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-2 w-12" />
          </div>
        ))}
      </div>
    );
  }

  const items = highlights ?? [];
  if (items.length === 0 && !isOwnProfile) return null;

  return (
    <>
      <div
        className="scrollbar-none flex gap-4 overflow-x-auto px-4 py-3"
        role="list"
        aria-label="Story highlights"
      >
        {isOwnProfile && (
          <div className="flex w-20 shrink-0 flex-col items-center gap-1" role="listitem">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              aria-label="Create a new highlight"
              className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-neutral-400 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-900"
            >
              <Plus size={24} aria-hidden />
            </button>
            <span className="w-full truncate text-center text-xs">New</span>
          </div>
        )}

        {items.map((h) => (
          <div key={h.id} className="flex w-20 shrink-0 flex-col items-center gap-1" role="listitem">
            <button
              type="button"
              onClick={() => setOpenId(h.id)}
              aria-label={`Open highlight ${h.title}`}
              className="flex h-16 w-16 items-center justify-center rounded-full border border-border-light p-[3px] dark:border-border-dark"
            >
              <span className="block h-full w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                {h.coverUrl ? (
                  <img src={h.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-neutral-500 dark:text-neutral-400">
                    {h.title.charAt(0).toUpperCase() || '•'}
                  </span>
                )}
              </span>
            </button>
            <span className="w-full truncate text-center text-xs">{h.title}</span>
          </div>
        ))}
      </div>

      {openId && (
        <HighlightViewer
          id={openId}
          canDelete={isOwnProfile}
          profileUsername={username}
          onClose={() => setOpenId(null)}
        />
      )}

      {isOwnProfile && (
        <CreateHighlightModal
          open={createOpen}
          profileUsername={username}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </>
  );
}

/** Fullscreen slideshow over a highlight's stories, with owner delete. */
function HighlightViewer({
  id,
  canDelete,
  profileUsername,
  onClose,
}: {
  id: string;
  canDelete: boolean;
  profileUsername: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: highlight, isLoading, isError } = useQuery({
    queryKey: ['highlights', 'detail', id],
    queryFn: () => fetchHighlight(id),
  });

  const [index, setIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stories = highlight?.stories ?? [];
  const current = stories[index];

  useEffect(() => {
    if (isError || (highlight && stories.length === 0)) {
      toast('Could not open highlight', 'error');
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, highlight, stories.length]);

  const handleDelete = async () => {
    try {
      await deleteHighlight(id);
      toast('Highlight deleted');
      queryClient.invalidateQueries({ queryKey: ['highlights', profileUsername] });
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete highlight', 'error');
    }
  };

  if (isLoading) {
    return createPortal(
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 text-white"
        role="dialog"
        aria-modal="true"
        aria-label="Loading highlight"
      >
        <Spinner size={32} />
      </div>,
      document.body
    );
  }

  if (!highlight || !current) return null;

  return (
    <>
      <SlideShow
        slides={stories}
        index={index}
        onIndexChange={setIndex}
        onClose={onClose}
        paused={confirmDelete}
        label={`Highlight ${highlight.title}`}
        headerLeft={
          <>
            <span className="truncate text-sm font-semibold">{highlight.title}</span>
            <span className="shrink-0 text-sm text-white/70">{timeAgo(current.createdAt)}</span>
          </>
        }
        headerActions={
          canDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete this highlight"
              className="rounded-full p-1.5 hover:bg-white/10"
            >
              <Trash2 size={20} />
            </button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete highlight?"
        body="The highlight will be removed from your profile. Its stories are not deleted."
        confirmLabel="Delete"
      />
    </>
  );
}

/** Pick from own active stories + title → POST /highlights. */
function CreateHighlightModal({
  open,
  profileUsername,
  onClose,
}: {
  open: boolean;
  profileUsername: string;
  onClose: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data: stories, isLoading } = useQuery({
    queryKey: ['stories', 'user', me?.username ?? ''],
    queryFn: () => fetchUserStories(me?.username ?? ''),
    enabled: open && !!me,
  });

  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Reset on each open.
  useEffect(() => {
    if (open) {
      setTitle('');
      setSelectedIds(new Set());
      setSaving(false);
    }
  }, [open]);

  const toggle = (storyId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || selectedIds.size === 0 || saving) return;
    setSaving(true);
    try {
      const ordered = (stories ?? []).filter((s) => selectedIds.has(s.id));
      const cover = ordered.find((s) => s.mediaType === 'IMAGE');
      await createHighlight({
        title: cleanTitle,
        storyIds: ordered.map((s) => s.id),
        coverUrl: cover?.mediaUrl,
      });
      queryClient.invalidateQueries({ queryKey: ['highlights', profileUsername] });
      toast('Highlight created');
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create highlight', 'error');
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New highlight" className="max-w-lg">
      <div className="space-y-4 p-4">
        <Input
          label="Title"
          name="highlight-title"
          value={title}
          maxLength={50}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Highlights"
          disabled={saving}
        />

        <div>
          <p className="mb-2 text-xs font-medium text-muted-light dark:text-muted-dark">
            Choose from your active stories
          </p>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size={24} />
            </div>
          ) : !stories || stories.length === 0 ? (
            <p className="rounded-lg bg-neutral-50 px-4 py-8 text-center text-sm text-muted-light dark:bg-neutral-800 dark:text-muted-dark">
              No active stories — stories you post stay available here for 24 hours.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Select stories">
              {stories.map((story) => {
                const isSelected = selectedIds.has(story.id);
                return (
                  <button
                    key={story.id}
                    type="button"
                    onClick={() => toggle(story.id)}
                    disabled={saving}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? 'Deselect' : 'Select'} story from ${timeAgo(story.createdAt)} ago`}
                    className={cn(
                      'relative aspect-[9/16] overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-800',
                      isSelected && 'ring-2 ring-primary'
                    )}
                  >
                    {story.mediaType === 'IMAGE' ? (
                      <img
                        src={story.mediaUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video
                        src={story.mediaUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    )}
                    <span
                      className={cn(
                        'absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white',
                        isSelected ? 'bg-primary' : 'bg-black/30'
                      )}
                      aria-hidden
                    >
                      {isSelected && <Check size={12} strokeWidth={3} className="text-white" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={saving}
            disabled={saving || !title.trim() || selectedIds.size === 0}
          >
            Create highlight
          </Button>
        </div>
      </div>
    </Modal>
  );
}
