import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Find the element that actually scrolls the sentinel, to use as the
 * observer root. The scrollability check matters twice over: an
 * `overflow: auto` container that grows with its content must not become the
 * root — the sentinel would always intersect it and fetch every page in a
 * loop. Such containers may have a few pixels of incidental overflow, so an
 * element taller than the viewport is also rejected. With the viewport as
 * root, an intermediate real scroller clips the intersection so rootMargin
 * still gives the intended lead time. The +1 tolerates sub-pixel rounding.
 */
function findScrollContainer(node: HTMLElement): Element | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    const extendsBeyondViewport = el.clientHeight > window.innerHeight + 1;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      !extendsBeyondViewport &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
  }
  return null;
}

/**
 * Custom hook for intersection observer (infinite scroll trigger).
 *
 * Returns a callback ref to attach to the sentinel element. Using a callback
 * ref (rather than a ref object) lets the observer reconnect when the sentinel
 * node is replaced — e.g. when a layout switch unmounts one sentinel and
 * mounts another.
 */
export function useIntersectionObserver(
  callback: () => void,
  options?: {
    enabled?: boolean;
    rootMargin?: string;
  },
) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const { enabled = true, rootMargin = "100px" } = options ?? {};

  // Update during the layout phase so a queued observer entry cannot use a
  // stale closure between commit and passive-effect cleanup.
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled || !node) return;

    // Resolved on every effect run on purpose: `enabled` flips false→true
    // across each fetch cycle, so once loaded content makes an ancestor
    // scrollable the root upgrades from the viewport to the real scroller
    // (restoring the full rootMargin lead time).
    const root = findScrollContainer(node);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          callbackRef.current();
        }
      },
      { root, rootMargin },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [node, enabled, rootMargin]);

  return setNode;
}
