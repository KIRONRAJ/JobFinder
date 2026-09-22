import { useCallback } from 'react';

/**
 * Provides an interactive mouse-tracking spotlight handler for Bento Grid cards.
 * Sets CSS custom properties `--mouse-x` and `--mouse-y` on the card element,
 * enabling GPU-accelerated radial spotlight highlights on hover without re-rendering.
 */
export function useSpotlight() {
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    target.style.setProperty('--mouse-x', `${x}px`);
    target.style.setProperty('--mouse-y', `${y}px`);
  }, []);

  return { onMouseMove: handleMouseMove };
}
