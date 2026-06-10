import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { toast } from '../../stores/uiStore';
import { apiErrorMessage } from '../../services/api';
import type { FollowStatus } from '../../types';
import { feedApi } from './api';

interface FollowButtonProps {
  username: string;
  initialStatus?: FollowStatus;
  size?: 'sm' | 'md';
  className?: string;
}

// Self-contained optimistic follow button for list rows (suggested users,
// likers). Server response is authoritative: private targets land in
// 'pending' → "Requested".
export function FollowButton({
  username,
  initialStatus = 'none',
  size = 'sm',
  className,
}: FollowButtonProps) {
  const [status, setStatus] = useState<FollowStatus>(initialStatus);
  const following = status !== 'none';

  const mutation = useMutation({
    mutationFn: (follow: boolean): Promise<{ status: FollowStatus }> =>
      follow
        ? feedApi.follow(username)
        : feedApi.unfollow(username).then(() => ({ status: 'none' as FollowStatus })),
    onMutate: (follow) => {
      const prev = status;
      setStatus(follow ? 'accepted' : 'none');
      return { prev };
    },
    onSuccess: (res) => setStatus(res.status ?? 'none'),
    onError: (err, _vars, ctx) => {
      if (ctx) setStatus(ctx.prev);
      toast(apiErrorMessage(err), 'error');
    },
  });

  return (
    <Button
      size={size}
      variant={following ? 'secondary' : 'primary'}
      className={className}
      onClick={() => mutation.mutate(!following)}
      aria-pressed={following}
      aria-label={`${following ? 'Unfollow' : 'Follow'} ${username}`}
    >
      {status === 'accepted' ? 'Following' : status === 'pending' ? 'Requested' : 'Follow'}
    </Button>
  );
}
