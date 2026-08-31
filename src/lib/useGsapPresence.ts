import { useEffect, useRef, useState } from 'react';

/**
 * GSAP has no equivalent of framer-motion's `AnimatePresence` — nothing
 * delays a React unmount for an exit animation to finish. This is the one
 * shared replacement every modal/toast/dropdown in the app uses instead of
 * hand-rolling the same mounted-state dance at each call site.
 *
 * `enter`/`exit` receive the live DOM node and return the GSAP animation
 * they started (or `undefined` to skip straight to unmount).
 */
export function useGsapPresence<T extends HTMLElement>(
  show: boolean,
  enter: (el: T) => gsap.core.Tween | gsap.core.Timeline | undefined,
  exit: (el: T) => gsap.core.Tween | gsap.core.Timeline | undefined
) {
  const [mounted, setMounted] = useState(show);
  const ref = useRef<T>(null);
  const wasShown = useRef(show);

  useEffect(() => {
    if (show) {
      wasShown.current = true;
      setMounted(true);
      return;
    }
    if (!wasShown.current) return; // never shown yet — nothing to exit
    wasShown.current = false;
    const node = ref.current;
    if (!node) {
      setMounted(false);
      return;
    }
    const anim = exit(node);
    if (!anim) {
      setMounted(false);
      return;
    }
    anim.eventCallback('onComplete', () => setMounted(false));
    return () => {
      anim.eventCallback('onComplete', null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  useEffect(() => {
    if (show && mounted && ref.current) enter(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, mounted]);

  return { mounted, ref };
}
