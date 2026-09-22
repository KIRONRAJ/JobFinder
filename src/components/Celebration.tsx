import { useRef } from 'react';
import { gsap, prefersReducedMotion } from '../lib/gsapSetup';
import { useGsapPresence } from '../lib/useGsapPresence';
import { Icon } from './Icons';

interface Props {
  celebration: { company: string; role: string } | null;
}

/** A dozen small dots on fixed trajectories — no external confetti library,
 *  no sound, fires once per Offer transition (never on load, never on repeat
 *  status re-saves — see the diff guard in App.tsx). Respects reduced-motion
 *  via prefersReducedMotion() below, which skips the particle burst entirely.
 *  Stakes match the moment: this is the one milestone in the whole app that
 *  gets a flourish. */
const BURSTS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
  const distance = 70 + (i % 4) * 22;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance - 10,
    hue: [142, 45, 200, 25][i % 4],
    delay: (i % 5) * 0.02,
  };
});

export function Celebration({ celebration }: Props) {
  // App.tsx nulls `celebration` the instant the 2.6s window is up, but the
  // card still needs its role/company text while it plays its exit tween —
  // the last non-null value stays around for exactly that long.
  const lastCelebration = useRef(celebration);
  if (celebration) lastCelebration.current = celebration;

  const presence = useGsapPresence<HTMLDivElement>(
    celebration !== null,
    (el) => {
      const reduce = prefersReducedMotion();
      const card = el.querySelector<HTMLElement>('[data-celebration-card]');
      const tl = gsap.timeline();
      if (card) {
        tl.fromTo(
          card,
          { autoAlpha: 0, y: -10, scale: 0.95 },
          { autoAlpha: 1, y: 0, scale: 1, duration: reduce ? 0 : 0.4, ease: 'back.out(1.5)' },
          0
        );
      }
      if (!reduce) {
        el.querySelectorAll<HTMLElement>('[data-celebration-particle]').forEach((p, i) => {
          const b = BURSTS[i];
          tl.fromTo(
            p,
            { x: 0, y: 0, opacity: 1, scale: 1 },
            { x: b.x, y: b.y, opacity: 0, scale: 0.4, duration: 0.9, ease: 'power3.out' },
            b.delay
          );
        });
      }
      return tl;
    },
    (el) => {
      const reduce = prefersReducedMotion();
      const card = el.querySelector<HTMLElement>('[data-celebration-card]');
      if (!card) return undefined;
      return gsap.to(card, { autoAlpha: 0, y: -6, scale: 0.97, duration: reduce ? 0 : 0.25, ease: 'power2.in' });
    }
  );

  const data = celebration ?? lastCelebration.current;
  if (!presence.mounted || !data) return null;

  return (
    <div ref={presence.ref} className="pointer-events-none fixed inset-x-0 top-16 z-[70] flex justify-center">
      <div className="relative">
        {BURSTS.map((b, i) => (
          <span
            key={i}
            data-celebration-particle
            className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full opacity-0"
            style={{ background: `hsl(${b.hue} 70% 55%)` }}
          />
        ))}
        <div
          data-celebration-card
          className="flex items-center gap-2.5 rounded-full border border-grass/30 bg-panel px-5 py-3 shadow-float opacity-0"
        >
          <Icon.Trophy className="h-5 w-5 text-grass" />
          <div className="text-meta">
            <span className="font-semibold text-grass">Offer</span>
            <span className="text-ink-soft"> — {data.role} at {data.company}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
