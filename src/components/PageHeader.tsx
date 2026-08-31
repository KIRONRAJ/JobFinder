import { useEffect, useRef, type CSSProperties } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import { isOutreachView, VIEW_KIND, KIND_META, type OutreachEntry, type View } from '../types';

interface Props {
  view: View;
  appCount: number;
  outreach: OutreachEntry[];
  pendingCount: number;
  onOpenTerminal: () => void;
  onPrimary: () => void;
}

/**
 * The page hero. Every non-outreach view returns exactly what the header
 * always said, so no existing view can regress from this being made
 * section-aware — only the two outreach sections branch.
 */
function heroFor(view: View, appCount: number, outreach: OutreachEntry[]) {
  if (isOutreachView(view)) {
    const kind = VIEW_KIND[view];
    const meta = KIND_META[kind];
    const mine = outreach.filter((e) => e.kind === kind);
    const emailed = mine.filter((e) => (e.emails ?? []).length > 0).length;
    const replied = mine.filter(
      (e) => e.status === 'replied' || e.status === 'in-conversation'
    ).length;
    return {
      title: meta.title,
      subtitle:
        mine.length === 0
          ? kind === 'company'
            ? 'Approach cyber-security employers directly — including the ones not advertising'
            : 'IT recruitment agencies across NZ who place entry-level roles'
          : `${mine.length} ${mine.length === 1 ? meta.singular : meta.plural} · ${emailed} emailed · ${replied} replied`,
      primaryLabel: `Add ${meta.singular}`,
      emoji: kind === 'company' ? '🏢' : '🤝',
    };
  }
  return {
    title: 'Job Search HQ',
    subtitle: `${appCount} ${appCount === 1 ? 'application' : 'applications'} · SOC / GRC / Network Security · Wellington & wider NZ`,
    primaryLabel: 'Add',
    emoji: '🎯',
  };
}

export function PageHeader({
  view,
  appCount,
  outreach,
  pendingCount,
  onOpenTerminal,
  onPrimary,
}: Props) {
  const hero = heroFor(view, appCount, outreach);
  const markRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const prevTitle = useRef(hero.title);

  // Mount-only assembly of the three brand shapes, staggered — run once per
  // page load, never looped (DESIGN.md: a brand loop on a tool opened dozens
  // of times a day is noise).
  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.from('[data-mark-shape]', {
        scale: 0,
        opacity: 0,
        duration: reduce ? 0 : 0.4,
        ease: 'back.out(2)',
        stagger: reduce ? 0 : 0.07,
      });
    },
    { scope: markRef }
  );

  // `whileHover="poke"` replacement: each shape gets its own little flourish
  // on hover of the mark as a whole — "pokeable", costs nothing at rest.
  const poke = () => {
    if (prefersReducedMotion() || !markRef.current) return;
    const [circle, square, triangle] = markRef.current.querySelectorAll<HTMLElement>('[data-mark-shape]');
    if (circle) gsap.to(circle, { scale: 1.35, duration: 0.35, ease: 'elastic.out(1, 0.4)' });
    if (square) gsap.to(square, { rotate: 90, delay: 0.04, duration: 0.35, ease: 'elastic.out(1, 0.4)' });
    if (triangle) gsap.to(triangle, { y: -5, delay: 0.08, duration: 0.35, ease: 'elastic.out(1, 0.4)' });
  };
  const unpoke = () => {
    if (!markRef.current) return;
    markRef.current.querySelectorAll<HTMLElement>('[data-mark-shape]').forEach((el) => {
      gsap.to(el, { scale: 1, rotate: 0, y: 0, duration: 0.3, ease: 'power2.out' });
    });
  };

  // Title crossfade — no remount needed: exit the current text up, swap it,
  // enter the new text from below. Skipped on the very first render (nothing
  // to transition from yet).
  useEffect(() => {
    if (prevTitle.current === hero.title) return;
    const reduce = prefersReducedMotion();
    const node = titleRef.current;
    if (!node) {
      prevTitle.current = hero.title;
      return;
    }
    if (reduce) {
      prevTitle.current = hero.title;
      return;
    }
    gsap
      .timeline()
      .to(node, { opacity: 0, y: -8, duration: 0.14, ease: 'power2.in' })
      .call(() => {
        prevTitle.current = hero.title;
      })
      .set(node, { y: 10 })
      .to(node, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
  }, [hero.title]);

  useGSAP(
    () => {
      if (!badgeRef.current || pendingCount <= 0) return;
      const reduce = prefersReducedMotion();
      gsap.from(badgeRef.current, { scale: 0, duration: reduce ? 0 : 0.3, ease: 'back.out(2.2)' });
    },
    { dependencies: [pendingCount > 0] }
  );

  return (
    // Spans both columns so the title reads first on mobile, where the
    // sidebar would otherwise push the filters above it.
    <header className="mb-8 flex flex-wrap items-start justify-between gap-6 pt-4 md:col-span-2 md:mb-4 md:pt-10">
      <div>
        {/* The Bauhaus brand mark — circle/square/triangle, the spec's own
            "geometric logo" rule, in the three primaries. Purely decorative,
            so it's hidden from assistive tech; the h1 below carries the name. */}
        <div
          ref={markRef}
          className="group/mark mb-1.5 flex w-fit cursor-default items-center gap-2"
          aria-hidden="true"
          onMouseEnter={poke}
          onMouseLeave={unpoke}
        >
          <span data-mark-shape className="h-3 w-3 rounded-full bg-accent" />
          <span data-mark-shape className="h-3 w-3 rounded-sm bg-applied" />
          <span
            data-mark-shape
            className="h-3 w-3 bg-primary-yellow"
            style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}
          />
        </div>
        {/* Apple's large-title pattern scales down one step on a phone
            (~40px, DESIGN.md's existing `stat` token) rather than running
            the full 44px `display` size into a 375px-wide viewport. The
            section you're in is the single most important piece of state on
            the page, so switching sections crossfades the text (see the
            useEffect above) rather than silently swapping under a static
            heading. */}
        <h1
          ref={titleRef}
          className="flex items-center gap-3 text-stat font-black uppercase tracking-tighter sm:text-display"
        >
          {hero.title}
          <span aria-hidden="true" className="emoji text-[0.72em] leading-none">
            {hero.emoji}
          </span>
        </h1>
        <p className="mt-2.5 text-subhead text-ink-soft">{hero.subtitle}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenTerminal}
          className="btn-quiet relative"
          title={
            pendingCount > 0
              ? `Ask Claude (Ctrl+J) — ${pendingCount} pending request${pendingCount === 1 ? '' : 's'}`
              : 'Ask Claude (Ctrl+J)'
          }
          aria-label="Ask Claude"
        >
          <Icon.Terminal className="h-4 w-4" />
          <span className="hidden sm:inline">Claude</span>
          {/* A queued Claude run is the app's one genuinely in-flight state,
              so this is where the pulse ring belongs: the count says how
              many, the ring says it's moving right now. Spring-scales in when
              the first request lands rather than popping. */}
          {pendingCount > 0 && (
            <span
              ref={badgeRef}
              className="live-dot absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center
                         justify-center border-2 border-line bg-amber px-1 text-label
                         font-bold tabular-nums text-canvas"
              style={{ '--pulse': 'var(--amber)' } as CSSProperties}
              aria-hidden="true"
            >
              {pendingCount}
            </span>
          )}
        </button>
        <button onClick={onPrimary} className="btn-primary">
          <Icon.Plus className="h-4 w-4" />
          {hero.primaryLabel}
          <span aria-hidden="true" className="emoji text-[13px]">
            ✨
          </span>
        </button>
      </div>
    </header>
  );
}
