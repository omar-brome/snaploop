import { useEffect, useRef } from 'react';

// Infinite-scroll sentinel: attach the returned ref to a div near the end of
// the list; `onIntersect` fires whenever it scrolls into view.
export function useIntersection(onIntersect: () => void, enabled = true) {
  const ref = useRef<HTMLDivElement | null>(null);
  const callback = useRef(onIntersect);
  callback.current = onIntersect;

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) callback.current();
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return ref;
}
