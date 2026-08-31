import { useEffect, useRef, useState } from 'react';
import { gsap, prefersReducedMotion } from '../lib/gsapSetup';
import { useGsapPresence } from '../lib/useGsapPresence';
import { Icon } from './Icons';
import type { Application } from '../types';

/** Short enough to just sit inline like Salary/Work arrangement do — anything
 *  longer (or genuinely multi-line, e.g. different hours per day) collapses
 *  behind a click/hover-to-expand panel instead of blowing out the row. */
const INLINE_LIMIT = 26;

export const WorkHoursTag = ({ app }: { app: Application }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const popover = useGsapPresence<HTMLDivElement>(
    open,
    (el) => {
      const reduce = prefersReducedMotion();
      return gsap.fromTo(
        el,
        { autoAlpha: 0, y: -4, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: reduce ? 0 : 0.28, ease: 'back.out(1.5)' }
      );
    },
    (el) => {
      const reduce = prefersReducedMotion();
      return gsap.to(el, { autoAlpha: 0, y: -4, scale: 0.98, duration: reduce ? 0 : 0.16, ease: 'power2.in' });
    }
  );

  if (!app.workHours) return null;
  const text = app.workHours.trim();
  const inline = text.length <= INLINE_LIMIT && !text.includes('\n');

  if (inline) {
    return (
      <span className="chip">
        <Icon.Clock className="h-3 w-3" />
        {text}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // Not a toggle: hover already opens this on desktop, so a click
          // right after a hover-open must not immediately close it again.
          // Touch devices (no hover) rely on this to open; closing happens
          // via mouseleave, Escape, or a click outside.
          setOpen(true);
        }}
        aria-expanded={open}
        title={text}
        className="chip cursor-pointer hover:border-accent hover:text-accent"
      >
        <Icon.Clock className="h-3 w-3" />
        Hours
        <Icon.Chevron className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {popover.mounted && (
        <div
          ref={popover.ref}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-20 mt-1.5 w-64 whitespace-pre-line rounded-xl
                     border border-line bg-panel px-3.5 py-3 text-micro leading-relaxed text-ink shadow-float"
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-label font-medium uppercase tracking-wide text-ink-faint">
            <Icon.Clock className="h-3 w-3" />
            Hours of work
          </div>
          {text}
        </div>
      )}
    </div>
  );
};
