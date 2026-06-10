import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Post } from '../types';

// Optimistic like/unlike for posts. Patches every cached query that may hold
// the post (feed pages, post detail) and rolls back on error.
// Reference implementation for the optimistic-update pattern used app-wide.

function patchPost(data: unknown, postId: string, patch: (post: Post) => Post): unknown {
  if (!data) return data;
  // Single post cache entry
  if (typeof data === 'object' && (data as Post).id === postId) {
    return patch(data as Post);
  }
  // Infinite query: { pages: [{ data: Post[] }] }
  const inf = data as { pages?: { data?: Post[] }[] };
  if (inf.pages) {
    return {
      ...inf,
      pages: inf.pages.map((page) => ({
        ...page,
        data: page.data?.map((p) => (p.id === postId ? patch(p) : p)),
      })),
    };
  }
  return data;
}

export function useLikePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, like }: { postId: string; like: boolean }) =>
      like ? api.post(`/posts/${postId}/like`) : api.delete(`/posts/${postId}/like`),
    onMutate: async ({ postId, like }) => {
      await queryClient.cancelQueries();
      const snapshots = queryClient.getQueriesData({ type: 'active' });
      for (const [key, data] of snapshots) {
        queryClient.setQueryData(
          key,
          patchPost(data, postId, (p) => ({
            ...p,
            isLiked: like,
            likeCount: Math.max(0, p.likeCount + (like ? 1 : -1)),
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

export function useSavePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, save, collectionId }: { postId: string; save: boolean; collectionId?: string }) =>
      save
        ? api.post(`/posts/${postId}/save`, collectionId ? { collectionId } : {})
        : api.delete(`/posts/${postId}/save`),
    onMutate: async ({ postId, save }) => {
      await queryClient.cancelQueries();
      const snapshots = queryClient.getQueriesData({ type: 'active' });
      for (const [key, data] of snapshots) {
        queryClient.setQueryData(
          key,
          patchPost(data, postId, (p) => ({ ...p, isSaved: save }))
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
