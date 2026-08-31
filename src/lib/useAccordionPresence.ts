import { gsap, prefersReducedMotion } from './gsapSetup';
import { useGsapPresence } from './useGsapPresence';

/**
 * Expand/collapse to the content's own natural height — framer-motion's
 * `height: 'auto'` had a real trick for this (it measures layout); GSAP has
 * no equivalent shortcut, so this measures `scrollHeight` itself and
 * animates to that pixel value. The one deliberate exception to "never
 * animate height" in this codebase's GSAP migration: there is no
 * transform-only way to reveal content of an unknown height. Caller's
 * element needs `overflow-hidden` in its className.
 */
export function useAccordionPresence(show: boolean) {
  return useGsapPresence<HTMLDivElement>(
    show,
    (el) => {
      const reduce = prefersReducedMotion();
      const target = el.scrollHeight;
      return gsap.fromTo(
        el,
        { height: 0, opacity: 0 },
        {
          height: target,
          opacity: 1,
          duration: reduce ? 0 : 0.24,
          ease: 'power2.out',
          onComplete: () => gsap.set(el, { height: 'auto' }),
        }
      );
    },
    (el) => {
      const reduce = prefersReducedMotion();
      gsap.set(el, { height: el.scrollHeight });
      return gsap.to(el, { height: 0, opacity: 0, duration: reduce ? 0 : 0.2, ease: 'power2.in' });
    }
  );
}
