import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { useAuthStore } from '../../stores/authStore';
import { feedApi } from './api';
import { FollowButton } from './FollowButton';
import { useIntersection } from './useIntersection';

interface LikesModalProps {
  postId: string;
  open: boolean;
  onClose: () => void;
}

export function LikesModal({ postId, open, onClose }: LikesModalProps) {
  const me = useAuthStore((s) => s.user);

  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['post-likes', postId],
    queryFn: ({ pageParam }) => feedApi.likes(postId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta?.hasMore ? (last.meta.nextCursor as string | undefined) ?? undefined : undefined,
    enabled: open,
  });

  const sentinelRef = useIntersection(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, open && !!hasNextPage);

  const likers = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Likes" className="max-w-sm">
      <div className="max-h-[60vh] min-h-[200px] overflow-y-auto overscroll-contain">
        {isPending &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5" aria-hidden>
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
          ))}

        {!isPending && likers.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Heart size={32} strokeWidth={1.5} />
            <p className="text-sm text-muted-light dark:text-muted-dark">No likes yet.</p>
          </div>
        )}

        {likers.map((liker) => (
          <div key={liker.id} className="flex items-center gap-3 px-4 py-2.5">
            <Link to={`/${liker.username}`} onClick={onClose}>
              <Avatar src={liker.avatarUrl} alt={liker.username} size={44} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                to={`/${liker.username}`}
                onClick={onClose}
                className="block truncate text-sm font-semibold hover:opacity-70"
              >
                {liker.username}
              </Link>
              <p className="truncate text-sm text-muted-light dark:text-muted-dark">
                {liker.fullName}
              </p>
            </div>
            {me?.id !== liker.id && (
              <FollowButton
                username={liker.username}
                initialStatus={liker.isFollowing ? 'accepted' : 'none'}
              />
            )}
          </div>
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
