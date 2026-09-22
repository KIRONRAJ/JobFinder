import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';

/**
 * One "N of 10" segment meter for the app. Readiness (ReadinessBar) and the
 * market-skill strength meter (MarketView) each rendered this independently —
 * different segment widths, and MarketView used a flat fill where Readiness
 * used a gradient, for what reads as the same idea in both places: how full
 * is this out of ten. This is that one geometry with a size variant.
 *
 * Colour is never the only carrier where this is used stand-alone — callers
 * pair it with a number or a labelled icon alongside (see ReadinessBar's
 * `%` label, MarketView's strength icon+label next to the meter).
 */
const METER_GRADIENT: Record<'grass' | 'accent' | 'amber' | 'rose', string> = {
  grass: 'bg-gradient-to-r from-grass/60 to-grass',
  accent: 'bg-gradient-to-r from-accent/60 to-accent',
  amber: 'bg-gradient-to-r from-amber/60 to-amber',
  rose: 'bg-gradient-to-r from-rose/60 to-rose',
};

export function Meter({
  filled,
  total = 10,
  tone,
  size = 'sm',
}: {
  filled: number;
  total?: number;
  tone: 'grass' | 'accent' | 'amber' | 'rose';
  /** sm: card-row scale (3px segments). md: standalone-row scale (6px). */
  size?: 'sm' | 'md';
}) {
  const segments = Array.from({ length: total }, (_, i) => i < filled);
  const gradient = METER_GRADIENT[tone];
  const width = size === 'sm' ? 'w-[3px]' : 'w-[6px]';
  return (
    <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
      {segments.map((on, i) => (
        <span key={i} className={`h-2 ${width} rounded-sm ${on ? gradient : 'bg-line'}`} />
      ))}
    </span>
  );
}

/** Full-width variant for the expanded readiness card — flexes to fill.
 *
 *  This one animates its fill and the compact `Meter` above deliberately
 *  doesn't: `MeterFull` appears once, on a card the user has opened to look
 *  at, so the segments landing left-to-right actually reads as the score
 *  being counted. `Meter` renders ten segments per row across the whole
 *  pipeline list — animating that is 600 elements moving on every mount, on
 *  the exact list DESIGN.md's memo/reconcile work exists to keep still. */
export function MeterFull({ filled, total = 10, tone }: { filled: number; total?: number; tone: 'grass' | 'accent' | 'amber' | 'rose' }) {
  const segments = Array.from({ length: total }, (_, i) => i < filled);
  const gradient = METER_GRADIENT[tone];
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.from('[data-on="true"]', {
        scaleY: 0.25,
        opacity: 0.3,
        duration: reduce ? 0 : 0.4,
        ease: 'back.out(1.4)',
        stagger: reduce ? 0 : 0.035,
      });
    },
    { scope: containerRef, dependencies: [filled, tone] }
  );

  return (
    <div ref={containerRef} className="flex gap-[3px]" aria-hidden="true">
      {segments.map((on, i) => (
        <span key={i} data-on={on} className={`h-2 flex-1 rounded-sm ${on ? gradient : 'bg-line'}`} />
      ))}
    </div>
  );
}
