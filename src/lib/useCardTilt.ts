import { useRef, useEffect } from 'react';

interface CardTiltOptions {
  maxRotation?: number; // max tilt angle in degrees, default 6
  perspective?: number; // 3d perspective in px, default 800
  disabled?: boolean;
}

/**
 * High-performance 3D card tilt and mouse coordinate tracking.
 * Strictly gated by (pointer: fine) so touch/mobile devices remain 100% native.
 */
export function useCardTilt<T extends HTMLElement = HTMLDivElement>(options: CardTiltOptions = {}) {
  const ref = useRef<T | null>(null);
  const { maxRotation = 6, perspective = 800, disabled = false } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    // Only apply on fine-pointer devices (mouse/trackpad), not touchscreens
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reducedMotion) return;

    let rafId: number | null = null;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let isHovered = false;

    const onPointerMove = (e: PointerEvent) => {
      isHovered = true;
      const rect = el.getBoundingClientRect();
      const pxX = e.clientX - rect.left;
      const pxY = e.clientY - rect.top;

      // Normalized from -1 to 1 (0 at center)
      targetX = ((pxX / rect.width) - 0.5) * 2;
      targetY = ((pxY / rect.height) - 0.5) * 2;

      // Set specular light position directly
      el.style.setProperty('--mouse-x', `${pxX}px`);
      el.style.setProperty('--mouse-y', `${pxY}px`);

      if (!rafId) {
        rafId = requestAnimationFrame(updateSpring);
      }
    };

    const onPointerLeave = () => {
      isHovered = false;
      targetX = 0;
      targetY = 0;
      if (!rafId) {
        rafId = requestAnimationFrame(updateSpring);
      }
    };

    const updateSpring = () => {
      // Spring interpolation
      currentX += (targetX - currentX) * 0.15;
      currentY += (targetY - currentY) * 0.15;

      const rotY = currentX * maxRotation;
      const rotX = -currentY * maxRotation;

      el.style.setProperty('--tilt-x', `${rotX.toFixed(2)}deg`);
      el.style.setProperty('--tilt-y', `${rotY.toFixed(2)}deg`);

      // Continue animating until settled
      if (isHovered || Math.abs(targetX - currentX) > 0.005 || Math.abs(targetY - currentY) > 0.005) {
        rafId = requestAnimationFrame(updateSpring);
      } else {
        el.style.removeProperty('--tilt-x');
        el.style.removeProperty('--tilt-y');
        rafId = null;
      }
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerleave', onPointerLeave);

    return () => {
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerleave', onPointerLeave);
      if (rafId) cancelAnimationFrame(rafId);
      el.style.removeProperty('--tilt-x');
      el.style.removeProperty('--tilt-y');
      el.style.removeProperty('--mouse-x');
      el.style.removeProperty('--mouse-y');
    };
  }, [disabled, maxRotation, perspective]);

  return ref;
}
