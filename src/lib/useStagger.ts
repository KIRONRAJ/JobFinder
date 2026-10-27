import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from './gsapSetup';

/** Mount-time staggered rise for the `[data-stagger]` children of the returned
 *  ref's element. GSAP replacement for the old motion/react variants. */
export function useStagger<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion() || !ref.current) return;
      gsap.from(ref.current.querySelectorAll('[data-stagger]'), {
        opacity: 0,
        y: 12,
        duration: 0.4,
        ease: 'power2.out',
        stagger: 0.08,
        clearProps: 'opacity,transform',
      });
    },
    { scope: ref }
  );
  return ref;
}
