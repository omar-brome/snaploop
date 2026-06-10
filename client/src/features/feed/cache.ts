import type { QueryClient } from '@tanstack/react-query';
import type { Post } from '../../types';

// Cache surgery helpers following the patchPost pattern in hooks/useLike.ts:
// walk every active cached query that may hold the post — single entries
// (['post', id]) and infinite pages (['feed'], ['suggested-posts'], …) — and
// patch immutably via setQueriesData.

type InfinitePosts = { pages?: { data?: Post[] }[] };

function patchData(data: unknown, postId: string, patch: (post: Post) => Post): unknown {
  if (!data) return data;
  if (typeof data === 'object' && (data as Post).id === postId) {
    return patch(data as Post);
  }
  const inf = data as InfinitePosts;
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

export function patchPostCaches(
  queryClient: QueryClient,
  postId: string,
  patch: (post: Post) => Post
) {
  queryClient.setQueriesData({ type: 'active' }, (data: unknown) =>
    patchData(data, postId, patch)
  );
}

// Drops the post from every cached infinite list (archive / delete).
export function removePostFromCaches(queryClient: QueryClient, postId: string) {
  queryClient.setQueriesData({ type: 'active' }, (data: unknown) => {
    if (!data) return data;
    const inf = data as InfinitePosts;
    if (!inf.pages) return data;
    return {
      ...inf,
      pages: inf.pages.map((page) => ({
        ...page,
        data: page.data?.filter((p) => p.id !== postId),
      })),
    };
  });
}
