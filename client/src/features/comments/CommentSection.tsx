import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, MoreHorizontal, Pin, Plus, Smile, X } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { RichText } from '../../components/RichText';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../../stores/uiStore';
import { apiErrorMessage } from '../../services/api';
import { connectSocket } from '../../services/socket';
import { timeAgo, formatCount } from '../../utils/timeAgo';
import { cn } from '../../utils/cn';
import type { Comment, Page, UserSearchResult } from '../../types';
import { commentsApi, type CommentTargetType } from './api';

interface CommentSectionProps {
  targetType: CommentTargetType;
  targetId: string;
  ownerId: string;
  commentsOff?: boolean;
}

type InfComments = InfiniteData<Page<Comment>>;

const getNext = (last: Page<Comment>) =>
  last.meta?.hasMore ? last.meta.nextCursor ?? undefined : undefined;

function patchComment(
  data: InfComments | undefined,
  id: string,
  patch: (c: Comment) => Comment
): InfComments | undefined {
  if (!data?.pages) return data;
  return {
    ...data,
    pages: data.pages.map((pg) => ({
      ...pg,
      data: pg.data.map((c) => (c.id === id ? patch(c) : c)),
    })),
  };
}

function removeComment(data: InfComments | undefined, id: string): InfComments | undefined {
  if (!data?.pages) return data;
  return {
    ...data,
    pages: data.pages.map((pg) => ({ ...pg, data: pg.data.filter((c) => c.id !== id) })),
  };
}

function uniqueById(list: Comment[]): Comment[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

// Patches commentCount on the target post/reel everywhere it is cached
// (single entries and infinite pages) — same walk as feed/cache.ts.
function patchTargetCount(data: unknown, targetId: string, delta: number): unknown {
  if (!data || typeof data !== 'object') return data;
  const single = data as { id?: string; commentCount?: number };
  if (single.id === targetId && typeof single.commentCount === 'number') {
    return { ...single, commentCount: Math.max(0, single.commentCount + delta) };
  }
  const inf = data as { pages?: { data?: { id?: string; commentCount?: number }[] }[] };
  if (inf.pages) {
    return {
      ...inf,
      pages: inf.pages.map((pg) => ({
        ...pg,
        data: pg.data?.map((item) =>
          item.id === targetId && typeof item.commentCount === 'number'
            ? { ...item, commentCount: Math.max(0, item.commentCount + delta) }
            : item
        ),
      })),
    };
  }
  return data;
}

interface RowActions {
  canDelete: (c: Comment) => boolean;
  canPin: (c: Comment) => boolean;
  onReply: (c: Comment) => void;
  onToggleLike: (c: Comment) => void;
  onDelete: (c: Comment) => void;
  onTogglePin: (c: Comment) => void;
}

const LONG_PRESS_MS = 500;

function CommentRow({ comment, actions }: { comment: Comment; actions: RowActions }) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pressTimer = useRef<number | null>(null);

  const canDelete = actions.canDelete(comment);
  const canPin = actions.canPin(comment);
  const hasOptions = canDelete || canPin;

  const startPress = () => {
    if (!hasOptions) return;
    pressTimer.current = window.setTimeout(() => setOptionsOpen(true), LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  useEffect(
    () => () => {
      if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    },
    []
  );

  return (
    <div
      className="group flex items-start gap-3 px-4 py-3"
      onTouchStart={startPress}
      onTouchMove={cancelPress}
      onTouchEnd={cancelPress}
    >
      <Link to={`/${comment.user.username}`} className="shrink-0">
        <Avatar src={comment.user.avatarUrl} alt={comment.user.username} size={32} />
      </Link>

      <div className="min-w-0 flex-1">
        {comment.isPinned && (
          <p className="mb-0.5 flex items-center gap-1 text-xs text-muted-light dark:text-muted-dark">
            <Pin size={12} aria-hidden /> Pinned
          </p>
        )}
        <p className="break-words text-sm">
          <Link to={`/${comment.user.username}`} className="font-semibold hover:opacity-70">
            {comment.user.username}
          </Link>{' '}
          <RichText text={comment.content} />
        </p>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-light dark:text-muted-dark">
          <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
          {comment.likeCount > 0 && (
            <span>
              {formatCount(comment.likeCount)} {comment.likeCount === 1 ? 'like' : 'likes'}
            </span>
          )}
          <button
            type="button"
            onClick={() => actions.onReply(comment)}
            className="font-semibold hover:opacity-70"
          >
            Reply
          </button>
          {hasOptions && (
            <button
              type="button"
              onClick={() => setOptionsOpen(true)}
              aria-label="Comment options"
              aria-haspopup="dialog"
              className="p-0.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <MoreHorizontal size={14} />
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => actions.onToggleLike(comment)}
        aria-label={comment.isLiked ? 'Unlike comment' : 'Like comment'}
        aria-pressed={comment.isLiked}
        className="mt-1 shrink-0 p-1 transition-transform hover:opacity-60 active:scale-90"
      >
        <Heart size={14} className={cn(comment.isLiked && 'fill-like text-like')} />
      </button>

      <Modal
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        showClose={false}
        className="max-w-xs text-center"
      >
        <div className="flex flex-col divide-y divide-border-light dark:divide-border-dark">
          {canPin && (
            <button
              type="button"
              onClick={() => {
                actions.onTogglePin(comment);
                setOptionsOpen(false);
              }}
              className="py-3 text-sm font-semibold"
            >
              {comment.isPinned ? 'Unpin comment' : 'Pin comment'}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => {
                setOptionsOpen(false);
                setConfirmDelete(true);
              }}
              className="py-3 text-sm font-bold text-red-500"
            >
              Delete
            </button>
          )}
          <button type="button" onClick={() => setOptionsOpen(false)} className="py-3 text-sm">
            Cancel
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => actions.onDelete(comment)}
        title="Delete comment?"
        body="This cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}

function RepliesList({
  topKey,
  parentId,
  actions,
}: {
  topKey: QueryKey;
  parentId: string;
  actions: RowActions;
}) {
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: [...(topKey as unknown[]), 'replies', parentId],
    queryFn: ({ pageParam }) => commentsApi.replies(parentId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: getNext,
  });

  const replies = uniqueById(data?.pages.flatMap((p) => p.data) ?? []);

  return (
    <div>
      {isPending && (
        <div className="flex justify-center py-2">
          <Spinner size={16} />
        </div>
      )}
      {replies.map((r) => (
        <CommentRow key={r.id} comment={r} actions={actions} />
      ))}
      {hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mb-2 ml-4 flex items-center gap-2 text-xs font-semibold text-muted-light disabled:opacity-50 dark:text-muted-dark"
        >
          <span className="h-px w-6 bg-current opacity-50" aria-hidden />
          {isFetchingNextPage ? 'Loading…' : 'View more replies'}
        </button>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  topKey,
  actions,
}: {
  comment: Comment;
  topKey: QueryKey;
  actions: RowActions;
}) {
  const [showReplies, setShowReplies] = useState(false);
  return (
    <div>
      <CommentRow comment={comment} actions={actions} />
      {comment.replyCount > 0 && (
        <button
          type="button"
          onClick={() => setShowReplies((v) => !v)}
          aria-expanded={showReplies}
          className="mb-2 ml-[60px] flex items-center gap-2 text-xs font-semibold text-muted-light hover:opacity-70 dark:text-muted-dark"
        >
          <span className="h-px w-6 bg-current opacity-50" aria-hidden />
          {showReplies ? 'Hide replies' : `View replies (${formatCount(comment.replyCount)})`}
        </button>
      )}
      {showReplies && (
        <div className="pl-10">
          <RepliesList topKey={topKey} parentId={comment.id} actions={actions} />
        </div>
      )}
    </div>
  );
}

const EMOJIS = [
  '❤️', '🙌', '🔥', '👏', '😂', '😮',
  '😍', '😢', '👍', '😊', '🎉', '💯',
  '🤣', '😭', '😅', '🙏', '😘', '🥰',
  '😎', '✨', '🤔', '👀', '💪', '🙈',
];

function EmojiPopover({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
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
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Add emoji"
        aria-haspopup="menu"
        aria-expanded={open}
        className="block p-1 text-muted-light hover:opacity-70 dark:text-muted-dark"
      >
        <Smile size={20} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Emoji"
          className="absolute bottom-full left-0 z-20 mb-2 grid w-60 grid-cols-6 gap-0.5 rounded-xl border border-border-light bg-white p-2 shadow-lg dark:border-border-dark dark:bg-neutral-900"
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
              className="rounded p-1 text-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MentionAutocomplete({
  users,
  onPick,
}: {
  users: UserSearchResult[];
  onPick: (u: UserSearchResult) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Mention suggestions"
      className="absolute bottom-full left-2 right-2 z-20 mb-1 max-h-56 overflow-y-auto rounded-xl border border-border-light bg-white shadow-lg dark:border-border-dark dark:bg-neutral-900"
    >
      {users.map((u) => (
        <button
          key={u.id}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(u)}
          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800"
        >
          <Avatar src={u.avatarUrl} alt={u.username} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{u.username}</span>
            <span className="block truncate text-xs text-muted-light dark:text-muted-dark">
              {u.fullName}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function CommentSection({ targetType, targetId, ownerId, commentsOff }: CommentSectionProps) {
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const topKey = useMemo(() => ['comments', targetType, targetId], [targetType, targetId]);

  const [value, setValue] = useState('');
  const [replyTo, setReplyTo] = useState<{ parentId: string; username: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Ids already ingested into the cache — dedupes the socket echo of our own
  // comments (POST response + `new_comment` event both arrive).
  const ingested = useRef(new Set<string>());

  const listQ = useInfiniteQuery({
    queryKey: topKey,
    queryFn: ({ pageParam }) => commentsApi.list(targetType, targetId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: getNext,
    enabled: !commentsOff,
  });

  const comments = uniqueById(listQ.data?.pages.flatMap((p) => p.data) ?? []);

  const bumpTargetCount = (delta: number) => {
    queryClient.setQueriesData({ type: 'active' }, (data: unknown) =>
      patchTargetCount(data, targetId, delta)
    );
  };

  const bumpReplyCount = (parentId: string, delta: number) => {
    queryClient.setQueryData<InfComments>(topKey, (data) =>
      patchComment(data, parentId, (c) => ({
        ...c,
        replyCount: Math.max(0, c.replyCount + delta),
      }))
    );
  };

  const insertTopLevel = (c: Comment) => {
    queryClient.setQueryData<InfComments>(topKey, (data) => {
      if (!data || data.pages.length === 0) return data;
      const [first, ...rest] = data.pages;
      // Newest-first list: insert right after the pinned block.
      const pinnedCount = first.data.filter((x) => x.isPinned).length;
      const next = [...first.data];
      next.splice(pinnedCount, 0, c);
      return { ...data, pages: [{ ...first, data: next }, ...rest] };
    });
  };

  const insertReply = (c: Comment) => {
    if (!c.parentId) return;
    const repliesKey = [...topKey, 'replies', c.parentId];
    const existing = queryClient.getQueryData<InfComments>(repliesKey);
    if (!existing || existing.pages.length === 0) return;
    const lastIdx = existing.pages.length - 1;
    queryClient.setQueryData<InfComments>(repliesKey, {
      ...existing,
      // Oldest-first replies: append to the last loaded page.
      pages: existing.pages.map((pg, i) =>
        i === lastIdx ? { ...pg, data: [...pg.data, c] } : pg
      ),
    });
  };

  const ingest = (c: Comment) => {
    if (ingested.current.has(c.id)) return;
    ingested.current.add(c.id);
    if (c.parentId) {
      insertReply(c);
      bumpReplyCount(c.parentId, 1);
    } else {
      insertTopLevel(c);
    }
    bumpTargetCount(1);
  };
  const ingestRef = useRef(ingest);
  ingestRef.current = ingest;

  // Live comments: join the content room and append new arrivals (deduped).
  useEffect(() => {
    if (commentsOff) return;
    const socket = connectSocket();
    socket.emit('post:join', targetId);
    const onNewComment = (c: Comment) => {
      if (!c?.id || (c.postId !== targetId && c.reelId !== targetId)) return;
      ingestRef.current(c);
    };
    socket.on('new_comment', onNewComment);
    return () => {
      socket.emit('post:leave', targetId);
      socket.off('new_comment', onNewComment);
    };
  }, [targetId, commentsOff]);

  const create = useMutation({
    mutationFn: (vars: { content: string; parentId?: string }) =>
      commentsApi.create({ targetType, targetId, content: vars.content, parentId: vars.parentId }),
    onSuccess: (c) => {
      ingestRef.current(c);
      setValue('');
      setReplyTo(null);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const restoreSnapshots = (snapshots?: [QueryKey, InfComments | undefined][]) => {
    for (const [key, data] of snapshots ?? []) queryClient.setQueryData(key, data);
  };

  const likeMutation = useMutation({
    mutationFn: ({ id, like }: { id: string; like: boolean }) =>
      like ? commentsApi.like(id) : commentsApi.unlike(id),
    onMutate: ({ id, like }) => {
      // Prefix match covers the top-level list and every replies cache.
      const snapshots = queryClient.getQueriesData<InfComments>({ queryKey: topKey });
      queryClient.setQueriesData<InfComments>({ queryKey: topKey }, (data) =>
        patchComment(data, id, (c) => ({
          ...c,
          isLiked: like,
          likeCount: Math.max(0, c.likeCount + (like ? 1 : -1)),
        }))
      );
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      restoreSnapshots(ctx?.snapshots);
      toast(apiErrorMessage(err), 'error');
    },
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: boolean }) =>
      pin ? commentsApi.pin(id) : commentsApi.unpin(id),
    onMutate: ({ id, pin }) => {
      const snapshots = queryClient.getQueriesData<InfComments>({ queryKey: topKey });
      queryClient.setQueriesData<InfComments>({ queryKey: topKey }, (data) =>
        patchComment(data, id, (c) => ({ ...c, isPinned: pin }))
      );
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      restoreSnapshots(ctx?.snapshots);
      toast(apiErrorMessage(err), 'error');
    },
    // Refetch to pick up the server's pinned-first ordering.
    onSettled: () => queryClient.invalidateQueries({ queryKey: topKey, exact: true }),
  });

  const deleteMutation = useMutation({
    mutationFn: (c: Comment) => commentsApi.remove(c.id),
    onMutate: (c) => {
      const snapshots = queryClient.getQueriesData<InfComments>({ queryKey: topKey });
      queryClient.setQueriesData<InfComments>({ queryKey: topKey }, (data) =>
        removeComment(data, c.id)
      );
      if (c.parentId) bumpReplyCount(c.parentId, -1);
      const removed = 1 + (c.parentId ? 0 : c.replyCount);
      bumpTargetCount(-removed);
      return { snapshots, removed };
    },
    onSuccess: () => toast('Comment deleted'),
    onError: (err, _c, ctx) => {
      restoreSnapshots(ctx?.snapshots);
      if (ctx) bumpTargetCount(ctx.removed);
      toast(apiErrorMessage(err), 'error');
    },
  });

  const actions: RowActions = {
    canDelete: (c) => !!me && (me.id === c.user.id || me.id === ownerId),
    canPin: (c) => !!me && me.id === ownerId && c.parentId === null,
    onReply: (c) => {
      setReplyTo({ parentId: c.parentId ?? c.id, username: c.user.username });
      setValue(`@${c.user.username} `);
      inputRef.current?.focus();
    },
    onToggleLike: (c) => likeMutation.mutate({ id: c.id, like: !c.isLiked }),
    onDelete: (c) => deleteMutation.mutate(c),
    onTogglePin: (c) => pinMutation.mutate({ id: c.id, pin: !c.isPinned }),
  };

  // @mention autocomplete on the trailing token, debounced 300ms.
  const mentionToken = useMemo(() => {
    const m = /(?:^|\s)@([\w.]{1,30})$/.exec(value);
    return m ? m[1] : null;
  }, [value]);
  const [debouncedMention, setDebouncedMention] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedMention(mentionToken), 300);
    return () => clearTimeout(t);
  }, [mentionToken]);

  const mentionQ = useQuery({
    queryKey: ['mention-users', debouncedMention],
    queryFn: () => commentsApi.searchUsers(debouncedMention as string),
    enabled: !!debouncedMention,
  });
  const mentionUsers =
    mentionToken && mentionToken === debouncedMention ? mentionQ.data?.data ?? [] : [];

  const pickMention = (u: UserSearchResult) => {
    setValue((v) => v.replace(/@[\w.]*$/, `@${u.username} `));
    inputRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const content = value.trim();
    if (!content || create.isPending) return;
    create.mutate({ content, parentId: replyTo?.parentId });
  };

  if (commentsOff) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <MessageCircle size={32} strokeWidth={1.5} aria-hidden />
        <p className="font-semibold">Comments are turned off</p>
        <p className="text-sm text-muted-light dark:text-muted-dark">
          The author has limited who can comment on this {targetType}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Comments">
        {listQ.isPending &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3" aria-hidden>
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <Skeleton className="h-3 w-44" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
          ))}

        {!listQ.isPending && comments.length === 0 && (
          <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
            <p className="text-lg font-semibold">No comments yet</p>
            <p className="text-sm text-muted-light dark:text-muted-dark">
              Start the conversation.
            </p>
          </div>
        )}

        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} topKey={topKey} actions={actions} />
        ))}

        {listQ.hasNextPage && (
          <div className="flex justify-center py-3">
            <button
              type="button"
              onClick={() => void listQ.fetchNextPage()}
              disabled={listQ.isFetchingNextPage}
              aria-label="Load more comments"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border-light hover:bg-neutral-50 disabled:opacity-50 dark:border-border-dark dark:hover:bg-neutral-800"
            >
              {listQ.isFetchingNextPage ? <Spinner size={14} /> : <Plus size={16} />}
            </button>
          </div>
        )}
      </div>

      <div className="sticky bottom-14 z-10 border-t border-border-light bg-white dark:border-border-dark dark:bg-neutral-900 md:bottom-0">
        {replyTo && (
          <div className="flex items-center justify-between bg-neutral-50 px-4 py-1.5 text-xs text-muted-light dark:bg-neutral-800 dark:text-muted-dark">
            <span>Replying to @{replyTo.username}</span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="p-0.5 hover:opacity-70"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <form onSubmit={submit} className="relative flex items-center gap-2 px-3 py-2">
          {mentionUsers.length > 0 && (
            <MentionAutocomplete users={mentionUsers} onPick={pickMention} />
          )}
          <EmojiPopover
            onPick={(emoji) => {
              setValue((v) => v + emoji);
              inputRef.current?.focus();
            }}
          />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Add a comment…"
            aria-label="Add a comment"
            maxLength={2200}
            className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-neutral-400"
          />
          <button
            type="submit"
            disabled={!value.trim() || create.isPending}
            className="text-sm font-semibold text-primary hover:text-primary-hover disabled:opacity-40"
          >
            {create.isPending ? <Spinner size={14} /> : 'Post'}
          </button>
        </form>
      </div>
    </div>
  );
}
