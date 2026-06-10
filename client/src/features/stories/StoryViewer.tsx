import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Trash2, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../../stores/uiStore';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { formatCount, timeAgo } from '../../utils/timeAgo';
import {
  deleteStory,
  fetchStoryViews,
  fetchUserStories,
  markStoryViewed,
  reactToStory,
  sendStoryMessage,
} from './api';
import { SlideShow } from './SlideShow';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'] as const;

/**
 * Fullscreen viewer for one user's active stories. Marks views on first show
 * (skipped for own stories), supports replies (DM), quick emoji reactions and
 * — for own stories — a viewers sheet plus delete.
 */
export function StoryViewer({ username, onClose }: { username: string; onClose: () => void }) {
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const {
    data: stories,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['stories', 'user', username],
    queryFn: () => fetchUserStories(username),
    staleTime: 30_000,
  });

  const [index, setIndex] = useState(0);
  const initialized = useRef(false);

  const [replyText, setReplyText] = useState('');
  const [replyFocused, setReplyFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [bigEmoji, setBigEmoji] = useState<{ emoji: string; key: number } | null>(null);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const markedIds = useRef(new Set<string>());

  const isOwn = !!me && me.username.toLowerCase() === username.toLowerCase();
  const current = stories?.[index];

  // Start at the first unseen story.
  useEffect(() => {
    if (!stories || initialized.current) return;
    initialized.current = true;
    const firstUnseen = stories.findIndex((s) => !s.isViewed);
    if (firstUnseen > 0) setIndex(firstUnseen);
  }, [stories]);

  // Clamp the index if stories shrink (e.g. after deleting one).
  useEffect(() => {
    if (stories && stories.length > 0 && index >= stories.length) setIndex(stories.length - 1);
  }, [stories, index]);

  // Mark each slide viewed the first time it's shown (never for own stories).
  useEffect(() => {
    if (!current || isOwn) return;
    if (current.isViewed || markedIds.current.has(current.id)) return;
    markedIds.current.add(current.id);
    markStoryViewed(current.id).catch(() => {});
  }, [current, isOwn]);

  // Refresh the tray rings once the viewer closes.
  useEffect(
    () => () => {
      queryClient.invalidateQueries({ queryKey: ['stories', 'tray'] });
    },
    [queryClient]
  );

  // Auto-clear the big reaction emoji.
  useEffect(() => {
    if (!bigEmoji) return;
    const t = window.setTimeout(() => setBigEmoji(null), 900);
    return () => window.clearTimeout(t);
  }, [bigEmoji]);

  // Nothing to show: inform and close.
  useEffect(() => {
    if (isError || (stories && stories.length === 0)) {
      toast('No active stories', 'error');
      onClose();
    }
  }, [isError, stories, onClose]);

  const react = (emoji: string) => {
    if (!current || sending) return;
    setBigEmoji({ emoji, key: Date.now() });
    reactToStory(current.id, emoji)
      .then(() => toast('Reaction sent'))
      .catch((err) =>
        toast(err instanceof Error ? err.message : 'Could not send reaction', 'error')
      );
  };

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    const text = replyText.trim();
    if (!text || !current || sending) return;
    setSending(true);
    try {
      await sendStoryMessage(current.user.id, text);
      setReplyText('');
      toast('Message sent');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not send message', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!current || !stories) return;
    try {
      await deleteStory(current.id);
      toast('Story deleted');
      if (stories.length <= 1) onClose();
      else setIndex((i) => Math.min(i, stories.length - 2));
      await queryClient.invalidateQueries({ queryKey: ['stories'] });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete story', 'error');
    }
  };

  if (isLoading) {
    return createPortal(
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 text-white"
        role="dialog"
        aria-modal="true"
        aria-label="Loading stories"
      >
        <Spinner size={32} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close story viewer"
          className="absolute right-4 top-4 rounded-full p-2 hover:bg-white/10"
        >
          <X size={24} />
        </button>
      </div>,
      document.body
    );
  }

  if (!stories || stories.length === 0 || !current) return null;

  const paused = viewersOpen || confirmDelete || replyFocused || sending;

  return (
    <>
      <SlideShow
        slides={stories}
        index={index}
        onIndexChange={setIndex}
        onClose={onClose}
        paused={paused}
        label={`Stories by ${current.user.username}`}
        headerLeft={
          <>
            <Avatar src={current.user.avatarUrl} alt={current.user.username} size={32} />
            <span className="truncate text-sm font-semibold">{current.user.username}</span>
            <span className="shrink-0 text-sm text-white/70">{timeAgo(current.createdAt)}</span>
          </>
        }
        headerActions={
          isOwn ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete this story"
              className="rounded-full p-1.5 hover:bg-white/10"
            >
              <Trash2 size={20} />
            </button>
          ) : undefined
        }
        overlay={
          <AnimatePresence>
            {bigEmoji && (
              <motion.span
                key={bigEmoji.key}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1.6, opacity: 1 }}
                exit={{ scale: 2.2, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                style={{ x: '-50%', y: '-50%' }}
                className="pointer-events-none absolute left-1/2 top-1/2 z-20 text-6xl"
                aria-hidden
              >
                {bigEmoji.emoji}
              </motion.span>
            )}
          </AnimatePresence>
        }
        footer={
          isOwn ? (
            <div className="flex items-center justify-between text-white">
              <button
                type="button"
                onClick={() => setViewersOpen(true)}
                aria-label="See who viewed this story"
                className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-semibold hover:bg-white/10"
              >
                <Eye size={18} aria-hidden />
                {typeof current.viewCount === 'number'
                  ? `${formatCount(current.viewCount)} viewer${current.viewCount === 1 ? '' : 's'}`
                  : 'Viewers'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-2" role="group" aria-label="Quick reactions">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => react(emoji)}
                    aria-label={`React with ${emoji}`}
                    className="text-2xl transition-transform hover:scale-125 focus-visible:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <form onSubmit={sendReply} className="flex items-center gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onFocus={() => setReplyFocused(true)}
                  onBlur={() => setReplyFocused(false)}
                  maxLength={1000}
                  placeholder={`Reply to ${current.user.username}…`}
                  aria-label={`Reply to ${current.user.username}`}
                  className="min-w-0 flex-1 rounded-full border border-white/40 bg-transparent px-4 py-2 text-sm text-white outline-none placeholder:text-white/60 focus:border-white"
                />
                {replyText.trim() && (
                  <button
                    type="submit"
                    disabled={sending}
                    aria-label="Send message"
                    className="shrink-0 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                )}
              </form>
            </div>
          )
        }
      />

      {isOwn && (
        <ViewersSheet storyId={current.id} open={viewersOpen} onClose={() => setViewersOpen(false)} />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete story?"
        body="This story will be removed for everyone."
        confirmLabel="Delete"
      />
    </>
  );
}

/** Bottom sheet listing who viewed an own story, with their reactions. */
function ViewersSheet({
  storyId,
  open,
  onClose,
}: {
  storyId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['stories', 'views', storyId],
    queryFn: ({ pageParam }) => fetchStoryViews(storyId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta?.hasMore ? ((last.meta.nextCursor as string | undefined) ?? undefined) : undefined,
    enabled: open,
  });

  const rows = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Viewers" variant="sheet">
      <div className="min-h-[40vh] px-4 py-2">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-light dark:text-muted-dark">
            No views yet
          </p>
        ) : (
          <ul className="divide-y divide-border-light dark:divide-border-dark">
            {rows.map((row) => (
              <li key={row.viewer.id} className="flex items-center gap-3 py-2.5">
                <Avatar src={row.viewer.avatarUrl} alt={row.viewer.username} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.viewer.username}</p>
                  <p className="truncate text-xs text-muted-light dark:text-muted-dark">
                    {row.viewer.fullName} · {timeAgo(row.viewedAt)}
                  </p>
                </div>
                {row.reaction && (
                  <span className="text-xl" aria-label={`Reacted with ${row.reaction}`}>
                    {row.reaction}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            loading={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            Load more
          </Button>
        )}
      </div>
    </Modal>
  );
}
