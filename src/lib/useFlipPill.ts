import { useRef, type RefObject } from 'react';
import { gsap, useGSAP, Flip } from './gsapSetup';

/**
 * Replaces framer-motion's `layoutId` shared-element trick for a single pill
 * that slides between sibling buttons — Sidebar's active-nav highlight,
 * TabStrip's active-tab underline. Position the pill absolutely inside a
 * `position: relative` container; give every candidate target
 * `data-pill-key="<key>"`.
 */
export function useFlipPill(
  activeKey: string,
  containerRef: RefObject<HTMLElement>,
  pillRef: RefObject<HTMLElement>
) {
  const prevKey = useRef<string | null>(null);

  useGSAP(() => {
    const container = containerRef.current;
    const pill = pillRef.current;
    if (!container || !pill) return;
    const target = container.querySelector<HTMLElement>(`[data-pill-key="${CSS.escape(activeKey)}"]`);
    if (!target) {
      gsap.set(pill, { autoAlpha: 0 });
      prevKey.current = activeKey;
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const isFirstPlacement = prevKey.current === null;
    const state = isFirstPlacement ? null : Flip.getState(pill);

    gsap.set(pill, {
      autoAlpha: 1,
      position: 'absolute',
      top: rect.top - containerRect.top,
      left: rect.left - containerRect.left,
      width: rect.width,
      height: rect.height,
    });

    if (state && prevKey.current !== activeKey) {
      Flip.from(state, { duration: 0.32, ease: 'power2.inOut', scale: true });
    }
    prevKey.current = activeKey;
  }, [activeKey]);
}
