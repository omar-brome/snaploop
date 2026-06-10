import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Send } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { toast } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { apiErrorMessage } from '../../services/api';
import type { Conversation } from '../../types';
import { feedApi } from './api';
import { useIntersection } from './useIntersection';

export function copyPostLink(postId: string) {
  void navigator.clipboard
    .writeText(`${window.location.origin}/p/${postId}`)
    .then(() => toast('Link copied to clipboard'))
    .catch(() => toast('Could not copy link', 'error'));
}

function conversationLabel(c: Conversation, meId?: string) {
  if (c.isGroup) return c.groupName ?? 'Group';
  const other = c.participants.find((p) => p.id !== meId) ?? c.participants[0];
  return other?.username ?? 'Conversation';
}

function conversationAvatar(c: Conversation, meId?: string) {
  if (c.isGroup) return c.groupAvatarUrl;
  const other = c.participants.find((p) => p.id !== meId) ?? c.participants[0];
  return other?.avatarUrl ?? null;
}

function ShareToModal({
  postId,
  open,
  onClose,
}: {
  postId: string;
  open: boolean;
  onClose: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['conversations'],
    queryFn: ({ pageParam }) => feedApi.conversations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta?.hasMore ? (last.meta.nextCursor as string | undefined) ?? undefined : undefined,
    enabled: open,
  });

  const send = useMutation({
    mutationFn: (conversationId: string) => feedApi.shareToConversation(conversationId, postId),
    onMutate: (conversationId) => setSendingId(conversationId),
    onSuccess: () => {
      toast('Sent');
      onClose();
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
    onSettled: () => setSendingId(null),
  });

  const sentinelRef = useIntersection(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, open && !!hasNextPage);

  const conversations = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Share" variant="sheet" className="sm:max-w-sm">
      <div className="max-h-[60vh] min-h-[200px] overflow-y-auto overscroll-contain pb-2">
        {isPending &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5" aria-hidden>
              <Skeleton className="h-11 w-11 rounded-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}

        {!isPending && conversations.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-muted-light dark:text-muted-dark">
            No conversations yet. Start one from Messages.
          </p>
        )}

        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => send.mutate(c.id)}
            disabled={send.isPending}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 disabled:opacity-60 dark:hover:bg-neutral-800"
          >
            <Avatar src={conversationAvatar(c, me?.id)} alt={conversationLabel(c, me?.id)} size={44} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {conversationLabel(c, me?.id)}
            </span>
            {sendingId === c.id ? (
              <Spinner size={16} />
            ) : (
              <span className="text-sm font-semibold text-primary">Send</span>
            )}
          </button>
        ))}

        <div ref={sentinelRef} />
        {isFetchingNextPage && (
          <div className="flex justify-center py-3">
            <Spinner size={20} />
          </div>
        )}
      </div>
    </Modal>
  );
}

// Paper-plane action button: popover with "Copy link" / "Share to…" (DM picker).
export function ShareMenu({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Share post"
        aria-haspopup="menu"
        aria-expanded={open}
        className="block transition-transform hover:opacity-60 active:scale-90"
      >
        <Send size={24} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-xl border border-border-light bg-white shadow-lg dark:border-border-dark dark:bg-neutral-900"
          >
            <button
              role="menuitem"
              onClick={() => {
                copyPostLink(postId);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <Link2 size={16} /> Copy link
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setShareOpen(true);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <Send size={16} /> Share to…
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareToModal postId={postId} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
