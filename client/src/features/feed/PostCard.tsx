import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BadgeCheck,
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Plus,
  User,
} from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { RichText } from '../../components/RichText';
import { useLikePost, useSavePost } from '../../hooks/useLike';
import { useAuthStore } from '../../stores/authStore';
import { toast } from '../../stores/uiStore';
import { apiErrorMessage } from '../../services/api';
import { timeAgo, formatCount } from '../../utils/timeAgo';
import { cn } from '../../utils/cn';
import type { Post } from '../../types';
import { CommentSheet } from '../comments/CommentSheet';
import { feedApi, type PostUpdate } from './api';
import { patchPostCaches, removePostFromCaches } from './cache';
import { LikesModal } from './LikesModal';
import { MediaCarousel } from './MediaCarousel';
import { ShareMenu, copyPostLink } from './ShareMenu';

// ---------------------------------------------------------------------------
// Edit caption (own posts)

function EditCaptionModal({ post, open, onClose }: { post: Post; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState(post.caption ?? '');

  useEffect(() => {
    if (open) setCaption(post.caption ?? '');
  }, [open, post.caption]);

  const save = useMutation({
    mutationFn: () => feedApi.updatePost(post.id, { caption }),
    onSuccess: (updated) => {
      patchPostCaches(queryClient, post.id, (p) => ({ ...p, caption: updated.caption ?? caption }));
      toast('Caption updated');
      onClose();
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Edit caption" className="max-w-md">
      <form
        className="space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          maxLength={2200}
          aria-label="Caption"
          placeholder="Write a caption…"
        />
        <Button type="submit" loading={save.isPending} className="w-full">
          Save
        </Button>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Report (other posts)

const REPORT_REASONS = [
  'Spam',
  'Nudity or sexual activity',
  'Hate speech or symbols',
  'Bullying or harassment',
  'Scam or fraud',
  'False information',
  "I just don't like it",
];

function ReportModal({ postId, open, onClose }: { postId: string; open: boolean; onClose: () => void }) {
  const report = useMutation({
    mutationFn: (reason: string) => feedApi.report(postId, reason),
    onSuccess: () => {
      toast('Thanks for reporting. We will review this post.');
      onClose();
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Report" className="max-w-xs">
      <p className="px-4 pt-3 text-sm font-semibold">Why are you reporting this post?</p>
      <div className="mt-2 flex flex-col divide-y divide-border-light dark:divide-border-dark">
        {REPORT_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            disabled={report.isPending}
            onClick={() => report.mutate(reason)}
            className="px-4 py-3 text-left text-sm hover:bg-neutral-50 disabled:opacity-50 dark:hover:bg-neutral-800"
          >
            {reason}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Options menu — own posts vs other posts. Exported for PostDetailPage.

export function PostOptionsMenu({
  post,
  open,
  onClose,
  onDeleted,
}: {
  post: Post;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const isOwn = me?.id === post.user.id;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const update = useMutation({
    mutationFn: (body: PostUpdate) => feedApi.updatePost(post.id, body),
    onSuccess: (_updated, body) => {
      if (body.isArchived) {
        removePostFromCaches(queryClient, post.id);
        toast('Post archived');
        onDeleted?.();
      } else {
        patchPostCaches(queryClient, post.id, (p) => ({ ...p, ...body }));
        if (body.commentsOff !== undefined) {
          toast(body.commentsOff ? 'Commenting turned off' : 'Commenting turned on');
        }
      }
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const del = useMutation({
    mutationFn: () => feedApi.deletePost(post.id),
    onSuccess: () => {
      removePostFromCaches(queryClient, post.id);
      toast('Post deleted');
      onDeleted?.();
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const unfollow = useMutation({
    mutationFn: () => feedApi.unfollow(post.user.username),
    onSuccess: () => {
      toast(`Unfollowed @${post.user.username}`);
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const item = 'w-full py-3 text-center text-sm';

  return (
    <>
      <Modal open={open} onClose={onClose} showClose={false} className="max-w-xs">
        <div className="flex flex-col divide-y divide-border-light dark:divide-border-dark" role="menu">
          {isOwn ? (
            <>
              <button
                type="button"
                role="menuitem"
                className={cn(item, 'font-bold text-red-500')}
                onClick={() => {
                  onClose();
                  setConfirmDelete(true);
                }}
              >
                Delete
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  onClose();
                  setConfirmArchive(true);
                }}
              >
                Archive
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  onClose();
                  setEditOpen(true);
                }}
              >
                Edit caption
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  onClose();
                  update.mutate({ commentsOff: !post.commentsOff });
                }}
              >
                {post.commentsOff ? 'Turn on commenting' : 'Turn off commenting'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className={cn(item, 'font-bold text-red-500')}
                onClick={() => {
                  onClose();
                  setReportOpen(true);
                }}
              >
                Report
              </button>
              <button
                type="button"
                role="menuitem"
                className={cn(item, 'font-bold text-red-500')}
                onClick={() => {
                  onClose();
                  setConfirmUnfollow(true);
                }}
              >
                Unfollow
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              copyPostLink(post.id);
              onClose();
            }}
          >
            Copy link
          </button>
          <button type="button" role="menuitem" className={item} onClick={onClose}>
            Cancel
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate()}
        title="Delete post?"
        body="This will permanently delete this post."
        confirmLabel="Delete"
      />
      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => update.mutate({ isArchived: true })}
        title="Archive post?"
        body="Only you will see it, from your archive."
        confirmLabel="Archive"
        destructive={false}
      />
      <ConfirmDialog
        open={confirmUnfollow}
        onClose={() => setConfirmUnfollow(false)}
        onConfirm={() => unfollow.mutate()}
        title={`Unfollow @${post.user.username}?`}
        body="Their posts will no longer show up in your feed."
        confirmLabel="Unfollow"
      />
      <EditCaptionModal post={post} open={editOpen} onClose={() => setEditOpen(false)} />
      <ReportModal postId={post.id} open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Save button + collections popover

function SaveButton({ post }: { post: Post }) {
  const queryClient = useQueryClient();
  const savePost = useSavePost();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
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

  const { data: collections, isPending } = useQuery({
    queryKey: ['collections'],
    queryFn: feedApi.collections,
    enabled: open,
  });

  const createCollection = useMutation({
    mutationFn: (name: string) => feedApi.createCollection(name),
    onSuccess: (collection) => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
      savePost.mutate({ postId: post.id, save: true, collectionId: collection.id });
      toast(`Saved to ${collection.name}`);
      setNewName('');
      setOpen(false);
    },
    onError: (err) => toast(apiErrorMessage(err), 'error'),
  });

  const toggle = () => {
    if (post.isSaved) {
      savePost.mutate({ postId: post.id, save: false });
      setOpen(false);
    } else {
      savePost.mutate({ postId: post.id, save: true });
      setOpen(true);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={post.isSaved ? 'Unsave post' : 'Save post'}
        aria-pressed={post.isSaved}
        className="block transition-transform hover:opacity-60 active:scale-90"
      >
        <Bookmark size={24} className={cn(post.isSaved && 'fill-current')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full right-0 z-20 mb-2 w-60 rounded-xl border border-border-light bg-white p-2 shadow-lg dark:border-border-dark dark:bg-neutral-900"
          >
            <p className="px-2 py-1 text-xs font-semibold text-muted-light dark:text-muted-dark">
              Save to collection
            </p>
            {isPending && (
              <div className="flex justify-center py-3">
                <Spinner size={16} />
              </div>
            )}
            <div className="max-h-40 overflow-y-auto">
              {collections?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    savePost.mutate({ postId: post.id, save: true, collectionId: c.id });
                    toast(`Saved to ${c.name}`);
                    setOpen(false);
                  }}
                  className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  {c.name}
                </button>
              ))}
              {collections && collections.length === 0 && (
                <p className="px-2 py-1.5 text-sm text-muted-light dark:text-muted-dark">
                  No collections yet.
                </p>
              )}
            </div>
            <form
              className="mt-1 flex items-center gap-1 border-t border-border-light pt-2 dark:border-border-dark"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newName.trim();
                if (name) createCollection.mutate(name);
              }}
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New collection"
                aria-label="New collection name"
                maxLength={50}
                className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-neutral-400"
              />
              <button
                type="submit"
                disabled={!newName.trim() || createCollection.isPending}
                aria-label="Create collection"
                className="rounded p-1 text-primary disabled:opacity-40"
              >
                {createCollection.isPending ? <Spinner size={14} /> : <Plus size={16} />}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action row (like / comment / share / save) + like count. Exported for
// PostDetailPage's desktop pane.

export function PostActions({
  post,
  onComment,
  className,
}: {
  post: Post;
  onComment: () => void;
  className?: string;
}) {
  const likePost = useLikePost();
  const [bounce, setBounce] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);

  const toggleLike = () => {
    if (!post.isLiked) {
      setBounce(true);
      window.setTimeout(() => setBounce(false), 400);
    }
    likePost.mutate({ postId: post.id, like: !post.isLiked });
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggleLike}
          aria-label={post.isLiked ? 'Unlike' : 'Like'}
          aria-pressed={post.isLiked}
          className="block transition-transform hover:opacity-60 active:scale-90"
        >
          <Heart size={24} className={cn(post.isLiked && 'fill-like text-like', bounce && 'animate-like-bounce')} />
        </button>
        <button
          type="button"
          onClick={onComment}
          aria-label={`Comments (${formatCount(post.commentCount)})`}
          className="block transition-transform hover:opacity-60 active:scale-90"
        >
          <MessageCircle size={24} />
        </button>
        <ShareMenu postId={post.id} />
        <div className="ml-auto">
          <SaveButton post={post} />
        </div>
      </div>

      <div className="pt-2">
        {post.likeCount > 0 ? (
          <button
            type="button"
            onClick={() => setLikesOpen(true)}
            className="text-sm font-semibold hover:opacity-70"
          >
            {formatCount(post.likeCount)} {post.likeCount === 1 ? 'like' : 'likes'}
          </button>
        ) : (
          <p className="text-sm">
            Be the first to{' '}
            <button type="button" onClick={toggleLike} className="font-semibold hover:opacity-70">
              like this
            </button>
          </p>
        )}
      </div>

      <LikesModal postId={post.id} open={likesOpen} onClose={() => setLikesOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Caption with a 3-line clamp and a "more" expander

function CaptionClamp({ username, caption }: { username: string; caption: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [caption]);

  return (
    <div className="text-sm">
      <div ref={ref} className={cn('break-words', !expanded && 'line-clamp-3')}>
        <Link to={`/${username}`} className="font-semibold hover:opacity-70">
          {username}
        </Link>{' '}
        <RichText text={caption} />
      </div>
      {clamped && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-muted-light hover:opacity-70 dark:text-muted-dark"
        >
          more
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostCard

// Tag coordinates may arrive as 0..1 fractions or 0..100 percents.
const tagPct = (v: number) => `${Math.min(Math.max(v <= 1 ? v * 100 : v, 4), 96)}%`;

export function PostCard({ post }: { post: Post }) {
  const navigate = useNavigate();
  const likePost = useLikePost();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const heartTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (heartTimer.current !== null) clearTimeout(heartTimer.current);
    },
    []
  );

  const openComments = () => {
    if (window.matchMedia('(min-width: 768px)').matches) navigate(`/p/${post.id}`);
    else setCommentsOpen(true);
  };

  const handleDoubleTap = () => {
    setShowHeart(true);
    if (heartTimer.current !== null) clearTimeout(heartTimer.current);
    heartTimer.current = window.setTimeout(() => setShowHeart(false), 900);
    if (!post.isLiked) likePost.mutate({ postId: post.id, like: true });
  };

  return (
    <article
      className="mb-4 border-b border-border-light pb-4 dark:border-border-dark"
      aria-label={`Post by ${post.user.username}`}
    >
      <header className="flex items-center gap-3 px-3 py-2.5">
        <Link to={`/${post.user.username}`} className="shrink-0">
          <Avatar src={post.user.avatarUrl} alt={post.user.username} size={32} />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex items-center gap-1 text-sm">
            <Link to={`/${post.user.username}`} className="truncate font-semibold hover:opacity-70">
              {post.user.username}
            </Link>
            {post.user.isVerified && (
              <BadgeCheck size={14} aria-label="Verified" className="shrink-0 text-primary" />
            )}
            <span className="shrink-0 text-muted-light dark:text-muted-dark">
              · <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
            </span>
          </p>
          {post.locationName && (
            <Link
              to={`/explore/places/${encodeURIComponent(post.locationName)}`}
              className="block truncate text-xs text-muted-light hover:underline dark:text-muted-dark"
            >
              {post.locationName}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOptionsOpen(true)}
          aria-label="Post options"
          aria-haspopup="dialog"
          className="shrink-0 p-1 hover:opacity-60"
        >
          <MoreHorizontal size={20} />
        </button>
      </header>

      <div className="relative">
        <MediaCarousel media={post.media} onDoubleTap={handleDoubleTap} />

        {showHeart && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
            <Heart size={96} className="animate-heart-pop fill-white text-white drop-shadow-lg" />
          </div>
        )}

        {post.tags.length > 0 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTags((v) => !v);
              }}
              aria-label={showTags ? 'Hide tagged people' : 'Show tagged people'}
              aria-pressed={showTags}
              className="absolute bottom-3 left-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
            >
              <User size={14} />
            </button>
            <AnimatePresence>
              {showTags &&
                post.tags.map((tag) => (
                  <motion.div
                    key={tag.user.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.12 }}
                    className="absolute z-10 -translate-x-1/2"
                    style={{ left: tagPct(tag.x), top: tagPct(tag.y) }}
                  >
                    <Link
                      to={`/${tag.user.username}`}
                      className="block rounded-lg bg-black/80 px-2.5 py-1.5 text-xs font-semibold text-white"
                    >
                      {tag.user.username}
                    </Link>
                  </motion.div>
                ))}
            </AnimatePresence>
          </>
        )}
      </div>

      <PostActions post={post} onComment={openComments} className="px-3 pt-2.5" />

      <div className="space-y-1 px-3 pt-1.5">
        {post.caption && <CaptionClamp username={post.user.username} caption={post.caption} />}
        {post.commentCount > 0 && (
          <button
            type="button"
            onClick={openComments}
            className="block text-sm text-muted-light hover:opacity-70 dark:text-muted-dark"
          >
            View all {formatCount(post.commentCount)} comments
          </button>
        )}
      </div>

      <CommentSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        targetType="post"
        targetId={post.id}
        ownerId={post.user.id}
        commentsOff={post.commentsOff}
      />
      <PostOptionsMenu post={post} open={optionsOpen} onClose={() => setOptionsOpen(false)} />
    </article>
  );
}
