import { useCallback, useRef } from 'react';

// Infinite-scroll sentinel. Returns a callback ref — attach it to a small
// element after the list; when it scrolls near the viewport the latest
// `onEndReached` fires. Callback-ref form so it works for nodes that mount
// conditionally (e.g. after the first page loads) and cleans up on detach.
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
      { rootMargin: '600px 0px' }
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);
}
