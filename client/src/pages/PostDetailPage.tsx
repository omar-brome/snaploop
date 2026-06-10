import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ImageOff, MoreHorizontal } from 'lucide-react';
import { feedApi } from '../features/feed/api';
import { MediaCarousel } from '../features/feed/MediaCarousel';
import { PostCard, PostActions, PostOptionsMenu } from '../features/feed/PostCard';
import { CommentSection } from '../features/comments/CommentSection';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PostSkeleton } from '../components/ui/Skeleton';
import { RichText } from '../components/RichText';
import { timeAgo } from '../utils/timeAgo';
import type { Post } from '../types';

// Render exactly one layout so CommentSection (socket room + cache writes)
// mounts once, instead of hiding the other branch with CSS.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

function DesktopPost({ post }: { post: Post }) {
  const navigate = useNavigate();
  const [optionsOpen, setOptionsOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <article
        className="flex h-[min(820px,calc(100vh-8rem))] overflow-hidden rounded-xl border border-border-light dark:border-border-dark"
        aria-label={`Post by ${post.user.username}`}
      >
        <div className="min-w-0 flex-1 bg-black">
          <MediaCarousel media={post.media} fit="fill" className="h-full" />
        </div>

        <div className="flex w-[380px] shrink-0 flex-col border-l border-border-light dark:border-border-dark">
          <header className="flex items-center gap-3 border-b border-border-light px-4 py-3 dark:border-border-dark">
            <Link to={`/${post.user.username}`} className="shrink-0">
              <Avatar src={post.user.avatarUrl} alt={post.user.username} size={32} />
            </Link>
            <div className="min-w-0 flex-1 leading-tight">
              <Link
                to={`/${post.user.username}`}
                className="flex items-center gap-1 text-sm font-semibold hover:opacity-70"
              >
                <span className="truncate">{post.user.username}</span>
                {post.user.isVerified && (
                  <BadgeCheck size={14} aria-label="Verified" className="shrink-0 text-primary" />
                )}
              </Link>
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

          {post.caption && (
            <div className="flex max-h-44 items-start gap-3 overflow-y-auto border-b border-border-light px-4 py-3 dark:border-border-dark">
              <Avatar src={post.user.avatarUrl} alt="" size={32} className="shrink-0" />
              <div className="min-w-0 break-words text-sm">
                <Link to={`/${post.user.username}`} className="font-semibold hover:opacity-70">
                  {post.user.username}
                </Link>{' '}
                <RichText text={post.caption} />
                <p className="mt-1 text-xs text-muted-light dark:text-muted-dark">
                  <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
                </p>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1">
            <CommentSection
              targetType="post"
              targetId={post.id}
              ownerId={post.user.id}
              commentsOff={post.commentsOff}
            />
          </div>

          <div className="border-t border-border-light px-4 py-3 dark:border-border-dark">
            <PostActions post={post} onComment={() => undefined} />
            <p className="mt-1 text-xs text-muted-light dark:text-muted-dark">
              <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
            </p>
          </div>
        </div>
      </article>

      <PostOptionsMenu
        post={post}
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        onDeleted={() => navigate('/', { replace: true })}
      />
    </div>
  );
}

export default function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const { data: post, isPending, isError } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => feedApi.post(postId as string),
    enabled: !!postId,
  });

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-[470px] pt-4 md:max-w-4xl">
        <PostSkeleton />
      </div>
    );
  }

  if (isError || !post) {
    return (
      <EmptyState
        icon={ImageOff}
        title="Post unavailable"
        body="This post may have been deleted, or you may not have permission to view it."
        action={<Button onClick={() => navigate('/')}>Back to feed</Button>}
      />
    );
  }

  if (isDesktop) return <DesktopPost post={post} />;

  // Mobile: stacked card + full comment section.
  return (
    <div className="mx-auto w-full max-w-[470px]">
      <PostCard post={post} />
      <CommentSection
        targetType="post"
        targetId={post.id}
        ownerId={post.user.id}
        commentsOff={post.commentsOff}
      />
    </div>
  );
}
