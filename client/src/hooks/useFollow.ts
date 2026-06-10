import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { FollowStatus, Profile } from '../types';
import { toast } from '../stores/uiStore';

// Optimistic follow/unfollow keyed on the profile cache. Private targets land
// in 'pending'; the server response is authoritative and corrects the cache.
export function useFollow(username: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ follow }: { follow: boolean }): Promise<{ status: FollowStatus }> =>
      follow
        ? api.post<{ status: FollowStatus }>(`/users/${username}/follow`)
        : api.delete<{ status: FollowStatus }>(`/users/${username}/follow`),
    onMutate: async ({ follow }) => {
      await queryClient.cancelQueries({ queryKey: ['profile', username] });
      const prev = queryClient.getQueryData<Profile>(['profile', username]);
      if (prev) {
        const optimistic: FollowStatus = follow ? (prev.isPrivate ? 'pending' : 'accepted') : 'none';
        queryClient.setQueryData<Profile>(['profile', username], {
          ...prev,
          followStatus: optimistic,
          followerCount:
            prev.followerCount +
            (optimistic === 'accepted' ? 1 : prev.followStatus === 'accepted' && !follow ? -1 : 0),
        });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['profile', username], ctx.prev);
      toast(err instanceof Error ? err.message : 'Action failed', 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', username] });
    },
  });
}
