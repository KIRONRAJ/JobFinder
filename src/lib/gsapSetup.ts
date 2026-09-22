import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Flip } from 'gsap/Flip';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';

// Registered once, at import time, before any component calls useGSAP or
// uses a plugin — framer-motion -> GSAP migration, 30 Aug 2026.
gsap.registerPlugin(useGSAP, Flip, Draggable, InertiaPlugin);

/** Equivalent of the removed `<MotionConfig reducedMotion="user">` in
 *  main.tsx: every framer-motion animation in the app used to read that
 *  context automatically. GSAP has no global context for this — each
 *  animation site calls this directly (usually to skip to duration: 0 /
 *  the end state) or wraps its setup in `gsap.matchMedia()`'s
 *  `prefers-reduced-motion` condition per gsap-core's guidance. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export { gsap, useGSAP, Flip, Draggable };
