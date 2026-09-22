import { gsap, prefersReducedMotion } from './gsapSetup';
import { useGsapPresence } from './useGsapPresence';

/**
 * Shared backdrop+panel choreography for every modal in the app (Edit,
 * ConfirmDelete, AppliedModal, OutreachModal) — fade the backdrop, pop+settle
 * the panel, coordinated on one timeline, mirrored on the way out. The panel
 * element (the thing that scales/pops, as opposed to the full-screen backdrop
 * div this hook's `ref` attaches to) must carry `data-modal-panel`.
 */
export function useModalPresence(show: boolean) {
  return useGsapPresence<HTMLDivElement>(
    show,
    (el) => {
      const reduce = prefersReducedMotion();
      const panel = el.querySelector<HTMLElement>('[data-modal-panel]');
      const tl = gsap.timeline();
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: reduce ? 0 : 0.2, ease: 'power2.out' }, 0);
      if (panel) {
        tl.fromTo(
          panel,
          { autoAlpha: 0, scale: 0.97, y: 8 },
          { autoAlpha: 1, scale: 1, y: 0, duration: reduce ? 0 : 0.32, ease: 'back.out(1.4)' },
          0
        );
      }
      return tl;
    },
    (el) => {
      const reduce = prefersReducedMotion();
      const panel = el.querySelector<HTMLElement>('[data-modal-panel]');
      const tl = gsap.timeline();
      tl.to(el, { autoAlpha: 0, duration: reduce ? 0 : 0.18, ease: 'power2.in' }, 0);
      if (panel) {
        tl.to(panel, { autoAlpha: 0, scale: 0.98, y: 4, duration: reduce ? 0 : 0.18, ease: 'power2.in' }, 0);
      }
      return tl;
    }
  );
}
