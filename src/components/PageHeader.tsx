import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import { isOutreachView, VIEW_KIND, KIND_META, type OutreachEntry, type View } from '../types';

interface Props {
  view: View;
  appCount: number;
  outreach: OutreachEntry[];
  pendingCount: number;
  onOpenTerminal: () => void;
  onGmailFetch: () => void;
  onPrimary: () => void;
  onHome?: () => void;
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
  onGmailFetch,
  onPrimary,
  onHome,
}: Props) {
  const navigate = useNavigate();
  const hero = heroFor(view, appCount, outreach);
  const markRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const prevTitle = useRef(hero.title);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleHomeClick = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (onHome) {
      onHome();
    } else {
      navigate('/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
    // Spans both columns so the title reads first on mobile.
    // Floating glassmorphic header capsule with rounded edges and backdrop blur.
    <header
      className={`sticky top-3 z-40 md:col-span-2 w-full transition-all duration-300 ${
        scrolled
          ? 'glass-header rounded-full py-2 px-4 sm:px-6 shadow-xl mb-4'
          : 'glass-header rounded-2xl md:rounded-3xl p-3.5 sm:px-6 sm:py-3.5 mb-6'
      } flex items-center justify-between gap-3`}
    >
      <div className="min-w-0">
        <Link
          to="/"
          onClick={handleHomeClick}
          className={`group/homelink flex ${
            scrolled ? 'flex-row items-center gap-2.5' : 'flex-col items-start'
          } focus:outline-none transition`}
          title="Job Search HQ — Return to Pipeline Home"
          aria-label="Job Search HQ — Pipeline Home"
        >
          {/* Brand mark — circle/square/triangle */}
          <div
            ref={markRef}
            className={`group/mark flex w-fit cursor-pointer items-center gap-1.5 ${
              scrolled ? '' : 'mb-0.5'
            }`}
            aria-hidden="true"
            onMouseEnter={poke}
            onMouseLeave={unpoke}
          >
            <span
              data-mark-shape
              className={`${
                scrolled ? 'h-2 w-2' : 'h-2.5 w-2.5'
              } rounded-full bg-accent transition-transform duration-200 group-hover/homelink:scale-110 shadow-sm`}
            />
            <span
              data-mark-shape
              className={`${
                scrolled ? 'h-2 w-2' : 'h-2.5 w-2.5'
              } rounded-[3px] bg-applied transition-transform duration-200 group-hover/homelink:scale-110 shadow-sm`}
            />
            <span
              data-mark-shape
              className={`${
                scrolled ? 'h-2 w-2' : 'h-2.5 w-2.5'
              } bg-primary-yellow transition-transform duration-200 group-hover/homelink:scale-110 shadow-sm`}
              style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}
            />
            <span
              className={`rounded-full border border-accent/25 bg-accent/10 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-accent font-mono transition-opacity ${
                scrolled ? 'opacity-100' : 'opacity-0 group-hover/homelink:opacity-100'
              }`}
            >
              Home
            </span>
          </div>
          <h1
            ref={titleRef}
            className={`flex items-center gap-2 font-black uppercase tracking-tight text-ink group-hover/homelink:text-accent transition-all ${
              scrolled
                ? 'text-sm sm:text-base'
                : 'text-base sm:text-lg md:text-xl'
            }`}
          >
            {hero.title}
            <span aria-hidden="true" className="emoji text-[0.8em] leading-none">
              {hero.emoji}
            </span>
          </h1>
        </Link>
        {!scrolled && (
          <p className="mt-0.5 text-xs text-ink-soft font-medium truncate max-w-[260px] sm:max-w-none">
            {hero.subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onGmailFetch}
          className="btn-quiet h-8.5 sm:h-9 rounded-full px-2.5 sm:px-3 text-xs font-semibold gap-1.5"
          title="Check your last 10 emails for job-tracker updates"
          aria-label="Check Gmail"
        >
          <Icon.Gmail className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Gmail</span>
        </button>

        <button
          onClick={onOpenTerminal}
          className="btn-quiet h-8.5 sm:h-9 rounded-full px-2.5 sm:px-3 text-xs font-semibold gap-1.5 relative"
          title={
            pendingCount > 0
              ? `Terminal (Ctrl+J) — ${pendingCount} pending request${pendingCount === 1 ? '' : 's'}`
              : 'Terminal (Ctrl+J)'
          }
          aria-label="Terminal"
        >
          <Icon.Terminal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Terminal</span>
          {pendingCount > 0 && (
            <span
              ref={badgeRef}
              className="live-dot absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center
                         justify-center rounded-full border border-line bg-amber px-1 text-[10px]
                         font-bold tabular-nums text-canvas shadow-sm"
              style={{ '--pulse': 'var(--amber)' } as CSSProperties}
              aria-hidden="true"
            >
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={onPrimary}
          className="btn-primary h-8.5 sm:h-9 rounded-full px-3 sm:px-4 text-xs font-bold gap-1.5 shadow-md"
        >
          <Icon.Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{hero.primaryLabel}</span>
          <span aria-hidden="true" className="emoji text-[11px]">
            ✨
          </span>
        </button>
      </div>
    </header>
  );
}
