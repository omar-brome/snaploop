import { useCallback, useMemo, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Page } from '../../types';
import { errorCode, nextPageCursor } from './api';

// Error codes that won't get better by retrying.
const TERMINAL_CODES = new Set(['PRIVATE_ACCOUNT', 'USER_NOT_FOUND', 'NOT_FOUND']);

export function shouldRetry(failureCount: number, error: unknown): boolean {
  const code = errorCode(error);
  if (code && TERMINAL_CODES.has(code)) return false;
  return failureCount < 2;
}

/**
 * Infinite-scroll sentinel. Returns a callback ref — attach it to a small
 * element after the list; when it scrolls near the viewport the latest
 * handler fires. Callback-ref form so it works for nodes that mount
 * conditionally and cleans up on detach.
 */
export function useEndReached(onEndReached?: () => void) {
  const handlerRef = useRef(onEndReached);
  handlerRef.current = onEndReached;
  const observerRef = useRef<IntersectionObserver | null>(null);

  return useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) handlerRef.current?.();
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);
}

/**
 * Cursor-paginated list boilerplate: flattens pages, dedupes by id and
 * exposes a throttled "load next page" callback for grid/list sentinels.
 */
export function useInfiniteList<T extends { id: string }>(
  queryKey: readonly unknown[],
  fetchPage: (cursor?: string) => Promise<Page<T>>,
  enabled = true
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageCursor,
    enabled,
    retry: shouldRetry,
  });

  const items = useMemo(() => {
    const all = query.data?.pages.flatMap((p) => p.data) ?? [];
    const seen = new Set<string>();
    return all.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  }, [query.data]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return { items, query, onEndReached };
}
