import { useRef } from 'react';
import { useFlipPill } from '../lib/useFlipPill';

/**
 * One tab-strip geometry for the app. Pipeline, Insights and Study each grew
 * their own copy of this — two matching `pill` strips (rounded-full) and one
 * `card` strip (rounded-2xl, two-line label) that was really the same
 * interaction at a different size, not a different component. This is that
 * one component with a size variant, so Study keeps its larger two-line
 * cards without a third hand-rolled implementation.
 *
 * The active pill (GSAP Flip, framer-motion -> GSAP migration 30 Aug 2026)
 * is a single element owned by this component instance, positioned to match
 * whichever button carries `data-pill-key={active}` — no cross-instance id
 * needed any more, unlike framer-motion's `layoutId` this replaced.
 */
export interface TabStripItem<K extends string> {
  key: K;
  label: string;
  /** Card size only — the second line under the label. */
  sub?: string;
  icon: (p: { className?: string }) => JSX.Element;
  /** Optional trailing count, shown for pill size only. */
  count?: number;
}

export function TabStrip<K extends string>({
  items,
  active,
  onPick,
  size = 'pill',
  ariaLabel,
}: {
  items: TabStripItem<K>[];
  active: K;
  onPick: (key: K) => void;
  size?: 'pill' | 'card';
  ariaLabel: string;
}) {
  const isCard = size === 'card';
  const containerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  useFlipPill(active, containerRef, pillRef);

  return (
    <div
      ref={containerRef}
      className="relative mb-8 flex gap-2 overflow-x-auto pb-1"
      role="tablist"
      aria-label={ariaLabel}
    >
      <span
        ref={pillRef}
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 -z-10 border-2 border-accent bg-accent/10 ${isCard ? 'rounded-md' : 'rounded-full'}`}
      />
      {items.map(({ key, label, sub, icon: IconEl, count }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            data-pill-key={key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onPick(key)}
            className={`group/tab relative flex min-h-11 shrink-0 items-center whitespace-nowrap border-2
                        transition duration-150
                        focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                        ${isCard ? 'gap-2 rounded-md px-4 py-2.5 text-left' : 'gap-1.5 rounded-full px-4 py-2.5 text-meta font-medium md:py-2'}
                        ${
                          isActive
                            ? 'tab-active-pill border-accent text-accent shadow-hardXs'
                            : 'border-line text-ink-soft hover:-translate-y-px hover:bg-panel-2 hover:text-ink hover:shadow-hardXs'
                        }`}
          >
            <IconEl
              className={`shrink-0 transition-transform duration-200 group-hover/tab:scale-110
                          ${isCard ? 'h-4 w-4' : 'h-3.5 w-3.5'}`}
            />
            {isCard ? (
              <span>
                <span className="block text-meta font-medium">{label}</span>
                {sub && (
                  <span className={`block text-label ${isActive ? 'text-accent/70' : 'text-ink-faint'}`}>
                    {sub}
                  </span>
                )}
              </span>
            ) : (
              <>
                {label}
                {count !== undefined && <span className="ml-0.5 tabular-nums opacity-70">{count}</span>}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
