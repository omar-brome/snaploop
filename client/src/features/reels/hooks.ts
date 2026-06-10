import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { Reel } from '../../types';
import { toast } from '../../stores/uiStore';
import { reelsApi } from './api';

// Mute state shared by every reel video (feed + detail). Default muted so
// autoplay is never blocked.
interface MuteState {
  muted: boolean;
  toggle: () => void;
}

export const useMuteStore = create<MuteState>((set) => ({
  muted: true,
  toggle: () => set((s) => ({ muted: !s.muted })),
}));

export function useReelsFeed() {
  return useInfiniteQuery({
    queryKey: ['reels'],
    queryFn: ({ pageParam }) => reelsApi.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta?.hasMore ? ((last.meta.nextCursor ?? undefined) as string | undefined) : undefined,
  });
}

export function useReel(reelId: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['reel', reelId],
    queryFn: () => reelsApi.get(reelId!),
    enabled: !!reelId,
    // Seed from the feed cache for an instant paint, but refetch immediately.
    initialData: () => {
      const feed = queryClient.getQueryData<{ pages?: { data?: Reel[] }[] }>(['reels']);
      return feed?.pages?.flatMap((p) => p.data ?? []).find((r) => r.id === reelId);
    },
    initialDataUpdatedAt: 0,
  });
}

function isReel(value: unknown): value is Reel {
  return !!value && typeof value === 'object' && 'videoUrl' in value && 'id' in value;
}

// Applies `patch` to a reel wherever it may be cached: a single ['reel', id]
// entry or inside infinite pages ({ pages: [{ data: Reel[] }] }).
function patchReelIn(data: unknown, reelId: string, patch: (reel: Reel) => Reel): unknown {
  if (!data) return data;
  if (isReel(data) && data.id === reelId) return patch(data);
  const inf = data as { pages?: { data?: unknown[] }[] };
  if (inf.pages) {
    return {
      ...inf,
      pages: inf.pages.map((page) => ({
        ...page,
        data: page.data?.map((r) => (isReel(r) && r.id === reelId ? patch(r) : r)),
      })),
    };
  }
  return data;
}

export function useLikeReel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reelId, like }: { reelId: string; like: boolean }) =>
      like ? reelsApi.like(reelId) : reelsApi.unlike(reelId),
    onMutate: async ({ reelId, like }) => {
      await queryClient.cancelQueries();
      const snapshots = queryClient.getQueriesData({ type: 'active' });
      for (const [key, data] of snapshots) {
        queryClient.setQueryData(
          key,
          patchReelIn(data, reelId, (r) => ({
            ...r,
            isLiked: like,
            likeCount: Math.max(0, r.likeCount + (like ? 1 : -1)),
          }))
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
  });
}

// Patches `user.isFollowing` on every cached reel authored by `username`.
function patchReelAuthor(data: unknown, username: string, isFollowing: boolean): unknown {
  const patch = (r: Reel): Reel =>
    r.user.username === username ? { ...r, user: { ...r.user, isFollowing } } : r;
  if (!data) return data;
  if (isReel(data)) return patch(data);
  const inf = data as { pages?: { data?: unknown[] }[] };
  if (inf.pages) {
    return {
      ...inf,
      pages: inf.pages.map((page) => ({
        ...page,
        data: page.data?.map((r) => (isReel(r) ? patch(r) : r)),
      })),
    };
  }
  return data;
}

export function useFollowFromReel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username }: { username: string }) => reelsApi.follow(username),
    onMutate: async ({ username }) => {
      await queryClient.cancelQueries();
      const snapshots = queryClient.getQueriesData({ type: 'active' });
      for (const [key, data] of snapshots) {
        queryClient.setQueryData(key, patchReelAuthor(data, username, true));
      }
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      for (const [key, data] of ctx?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast(err instanceof Error ? err.message : 'Could not follow', 'error');
    },
  });
}
