import { useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { useFlipPill } from '../lib/useFlipPill';
import { useGsapPresence } from '../lib/useGsapPresence';
import { Icon } from './Icons';
import { Sidebar, VIEW_META, NavEmoji } from './Sidebar';
import { useDialog } from '../useDialog';
import type { SortKey, View } from '../types';

/** The four most-reached views get a thumb-reach slot; everything else
 *  (Outreach, filters, appearance, sign out) lives one tap away behind
 *  "More" — a phone's width doesn't fit all six nav items at a legible size. */
const PRIMARY: View[] = ['list', 'agenda', 'study', 'insights'];

interface Props {
  view: View;
  onSetView: (v: View) => void;
  sort: SortKey;
  onSetSort: (s: SortKey) => void;
  typeF: string;
  onSetTypeF: (t: string) => void;
  employmentF: string;
  onSetEmploymentF: (e: string) => void;
  dark: boolean;
  onToggleDark: () => void;
  theme: 'bauhaus' | 'pulse';
  onToggleTheme: () => void;
  wallpaper: boolean;
  onToggleWallpaper: () => void;
  wallpaperDim: number;
  onSetWallpaperDim: (v: number) => void;
  sound: boolean;
  onToggleSound: () => void;
}

/**
 * Mobile-only (`md:hidden`) bottom tab bar replacing the desktop rail, which
 * DESIGN.md's Sidebar now hides below `md`. Native-app shape: fixed to the
 * viewport bottom, safe-area aware for the home-indicator inset, primary
 * verbs get a persistent icon+label slot. "More" opens a bottom sheet that
 * reuses <Sidebar mode="sheet"> rather than duplicating its filters/
 * appearance/sign-out sections.
 */
export function MobileNav(props: Props) {
  const { view, onSetView } = props;
  const [moreOpen, setMoreOpen] = useState(false);
  const close = () => setMoreOpen(false);
  const dialogRef = useDialog(moreOpen, close);

  const items = VIEW_META.filter((v) => PRIMARY.includes(v.key));
  const activeKey = moreOpen ? 'more' : view;

  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  useFlipPill(activeKey, navRef, pillRef);

  const moreIconRef = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      if (!moreIconRef.current) return;
      const reduce = prefersReducedMotion();
      gsap.to(moreIconRef.current, { rotate: moreOpen ? 90 : 0, duration: reduce ? 0 : 0.3, ease: 'back.out(1.8)' });
    },
    { dependencies: [moreOpen] }
  );

  const presence = useGsapPresence<HTMLDivElement>(
    moreOpen,
    (el) => {
      const reduce = prefersReducedMotion();
      const panel = el.querySelector<HTMLElement>('[data-sheet-panel]');
      const tl = gsap.timeline();
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: reduce ? 0 : 0.2, ease: 'power2.out' }, 0);
      if (panel) tl.fromTo(panel, { y: '100%' }, { y: 0, duration: reduce ? 0 : 0.32, ease: 'power3.out' }, 0);
      return tl;
    },
    (el) => {
      const reduce = prefersReducedMotion();
      const panel = el.querySelector<HTMLElement>('[data-sheet-panel]');
      const tl = gsap.timeline();
      tl.to(el, { autoAlpha: 0, duration: reduce ? 0 : 0.2, ease: 'power2.in' }, 0);
      if (panel) tl.to(panel, { y: '100%', duration: reduce ? 0 : 0.22, ease: 'power2.in' }, 0);
      return tl;
    }
  );

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Primary"
        // Opaque, not translucent+blurred: this bar is visible the entire
        // time the page scrolls behind it, and `backdrop-filter` forces a
        // re-composite of everything under it every frame that happens —
        // a real, continuous cost on mobile GPUs. A modal's blur (below)
        // only pays that cost while the modal is open, which is fine.
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-panel md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* A tab bar with no moving part gives no feedback that the tap
            landed — the label just recolours. This accent bar slides to
            the tapped tab, so the bar itself is the confirmation. */}
        <span ref={pillRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 -z-10 h-[3px] rounded-b-full bg-accent" />
        {items.map(({ key, label, icon: IconEl, emoji }) => {
          const active = view === key && !moreOpen;
          return (
            <button
              key={key}
              data-pill-key={key}
              onClick={() => {
                close();
                onSetView(key);
              }}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1
                          py-1.5 text-label transition-colors
                          ${active ? 'font-bold text-accent' : 'text-ink-faint'}`}
            >
              {/* Same rule as the rail: emoji only on the active tab, where
                  the label is right underneath it; the drawn icon carries
                  every inactive tab. */}
              {active ? (
                <NavEmoji emoji={emoji} />
              ) : (
                <IconEl className="h-5 w-5" />
              )}
              {label === 'All roles' ? 'Roles' : label}
            </button>
          );
        })}
        <button
          data-pill-key="more"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1
                      py-1.5 text-label transition-colors
                      ${moreOpen ? 'font-bold text-accent' : 'text-ink-faint'}`}
        >
          <span ref={moreIconRef} className="inline-block">
            <Icon.Menu className="h-5 w-5" />
          </span>
          More
        </button>
      </nav>

      {presence.mounted && (
        <div
          ref={presence.ref}
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div
            ref={dialogRef}
            data-sheet-panel
            role="dialog"
            aria-modal="true"
            aria-label="More views &amp; settings"
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-3xl
                       border-t border-line bg-panel px-5 pt-3 shadow-float outline-none"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-subhead font-medium text-ink">More</h2>
              <button onClick={close} aria-label="Close" className="btn-ghost h-9 w-9 justify-center p-0">
                <Icon.Close className="h-4 w-4" />
              </button>
            </div>
            <Sidebar {...props} mode="sheet" />
          </div>
        </div>
      )}
    </>
  );
}
