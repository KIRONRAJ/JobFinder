import { useLayoutEffect, useRef, type RefObject } from 'react';
import { gsap, Flip, prefersReducedMotion } from './gsapSetup';

/**
 * Reflows a list's remaining items into their new positions whenever the
 * item set changes (filter, sort, status change) and gives brand-new items
 * an entrance — the GSAP Flip equivalent of framer-motion's `layout` prop +
 * `AnimatePresence mode="popLayout"` this replaced (App.tsx's role list,
 * BoardView's columns).
 *
 * One conscious simplification: a REMOVED item just disappears rather than
 * playing its own fade-out first. Flip can't animate a DOM node React has
 * already unmounted without a separate "keep it mounted, remove it later"
 * state dance (a second whole subsystem) — the reflow of everything ELSE
 * sliding into the gap is the effect actually worth the engineering here.
 *
 * Capture-before/animate-after via effect cleanup: `container.children` at
 * cleanup time is the DOM as it's ABOUT to be replaced by the next render —
 * the one moment Flip needs a snapshot of "before".
 *
 * `items` + `getKey` — NOT the bare array reference — decide when the effect
 * actually re-fires. Bug fixed 30 Aug 2026: this used to take the array
 * itself as the dependency, and AppDataProvider's ~12s poll always hands back
 * a brand-new top-level array (`reconcileApps`'s `next.map(...)`) even when
 * every entry inside it is unchanged and reference-stable. A new array
 * reference every poll meant the reflow animation replayed every ~12s with
 * nothing having actually moved — the "random refreshing" bug. Joining the
 * keys into one string gives React a primitive to compare, so the effect
 * only fires when the rendered id order genuinely changes.
 */
export function useFlipList<T>(
  containerRef: RefObject<HTMLElement>,
  items: T[],
  getKey: (item: T) => string = (item) => (item as { id: string }).id
) {
  const flipStateRef = useRef<Flip.FlipState | null>(null);
  const isFirstRun = useRef(true);
  const signature = items.map(getKey).join('␟');

  useLayoutEffect(() => {
    const container = containerRef.current;
    const reduce = prefersReducedMotion();

    if (isFirstRun.current) {
      isFirstRun.current = false;
    } else if (container && flipStateRef.current && !reduce) {
      Flip.from(flipStateRef.current, {
        duration: 0.28,
        ease: 'power2.out',
        absolute: true,
        onEnter: (els) =>
          gsap.fromTo(
            els,
            { opacity: 0, y: 8, scale: 0.98 },
            { opacity: 1, y: 0, scale: 1, duration: 0.24, ease: 'power2.out', stagger: 0.02 }
          ),
      });
    }

    return () => {
      if (container && !reduce) {
        flipStateRef.current = Flip.getState(Array.from(container.children) as HTMLElement[]);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
