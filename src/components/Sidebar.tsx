import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { gsap, prefersReducedMotion } from '../lib/gsapSetup';
import { useFlipPill } from '../lib/useFlipPill';
import { playSound, setSoundEnabled } from '../lib/sound';
import { Icon } from './Icons';

/**
 * Icon-swap toggles (dark/light, Bauhaus/Pulse): rotate the current icon out,
 * swap which icon is rendered, rotate the new one in — framer-motion's
 * `AnimatePresence mode="wait"` used to sequence this; GSAP has no
 * presence-swap primitive, so this drives a local "displayed" value one beat
 * behind the real value via a timeline `.call()`, same technique as
 * PageHeader's title crossfade.
 */
function useIconSwap<T>(value: T) {
  const [displayed, setDisplayed] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (displayed === value) return;
    const reduce = prefersReducedMotion();
    const node = ref.current;
    if (!node || reduce) {
      setDisplayed(value);
      return;
    }
    gsap
      .timeline()
      .to(node, { rotate: 90, scale: 0, opacity: 0, duration: 0.15, ease: 'power2.in' })
      .call(() => setDisplayed(value))
      .set(node, { rotate: -90, scale: 0, opacity: 0 })
      .to(node, { rotate: 0, scale: 1, opacity: 1, duration: 0.28, ease: 'back.out(1.8)' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return { displayed, ref };
}
import { api } from '../api';
import { ROLE_TYPES, SORTS, type SortKey, type View } from '../types';

/**
 * The single source of truth for what views exist, how they're labelled, and
 * what URL each one lives at. Used to define three things that used to drift
 * independently — the sidebar nav, the CommandPalette's "go to" list, and the
 * app's route table (`viewRoutes.tsx`) — from one array.
 */
export const VIEW_META: {
  key: View;
  path: string;
  label: string;
  group: 'Pipeline' | 'Outreach';
  icon: (p: { className?: string }) => JSX.Element;
  /** Personality layer only. The drawn `icon` above stays the icon system —
   *  consistent stroke, consistent weight, and the thing that actually
   *  identifies a view when the label is truncated. The emoji rides alongside
   *  it on the active item, and is `aria-hidden` at every call site. Never
   *  the sole carrier of what a nav item means. */
  emoji: string;
}[] = [
  { key: 'list', path: '/', label: 'Pipeline', group: 'Pipeline', icon: Icon.Home, emoji: '🏠' },
  { key: 'agenda', path: '/agenda', label: 'Agenda', group: 'Pipeline', icon: Icon.Calendar, emoji: '🗓️' },
  { key: 'study', path: '/study', label: 'Study', group: 'Pipeline', icon: Icon.GradCap, emoji: '🎓' },
  { key: 'insights', path: '/insights', label: 'Insights', group: 'Pipeline', icon: Icon.Chart, emoji: '📊' },
  { key: 'companies', path: '/companies', label: 'Direct approach', group: 'Outreach', icon: Icon.Building, emoji: '🏢' },
  { key: 'recruiters', path: '/recruiters', label: 'Recruiters', group: 'Outreach', icon: Icon.Handshake, emoji: '🤝' },
];

const NAV_GROUPS: ('Pipeline' | 'Outreach')[] = ['Pipeline', 'Outreach'];

/** The emoji that swaps in for the drawn icon on the active nav item —
 *  mount-only entrance (it's freshly mounted each time its item becomes
 *  active, no exit needed since there's nothing to animate out to). Also
 *  used by MobileNav's bottom tab bar, same rule. */
export function NavEmoji({ emoji }: { emoji: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const reduce = prefersReducedMotion();
    gsap.fromTo(
      ref.current,
      { scale: 0.4, rotate: -18, opacity: 0 },
      { scale: 1, rotate: 0, opacity: 1, duration: reduce ? 0 : 0.3, ease: 'back.out(2)' }
    );
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="emoji h-4 w-4 shrink-0 text-center text-[15px] group-hover/nav:animate-wiggle"
    >
      {emoji}
    </span>
  );
}

interface Props {
  view: View;
  onSetView: (v: View) => void;
  sort: SortKey;
  onSetSort: (s: SortKey) => void;
  typeF: string;
  onSetTypeF: (t: string) => void;
  employmentF: string;
  onSetEmploymentF: (e: string) => void;
  tagF?: string;
  onSetTagF?: (t: string) => void;
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
  /** 'rail' (default): the sticky desktop column, hidden below md — the
   *  bottom nav + its "More" sheet cover mobile instead. 'sheet': the same
   *  content rendered inside that sheet, so it must stay visible at any
   *  width and not carry the rail's sticky/scroll behaviour. */
  mode?: 'rail' | 'sheet';
}

export function Sidebar({
  view,
  onSetView,
  sort,
  onSetSort,
  typeF,
  onSetTypeF,
  employmentF,
  onSetEmploymentF,
  tagF,
  onSetTagF,
  dark,
  onToggleDark,
  theme,
  onToggleTheme,
  wallpaper,
  onToggleWallpaper,
  wallpaperDim,
  onSetWallpaperDim,
  sound,
  onToggleSound,
  mode = 'rail',
}: Props) {
  const navRef = useRef<HTMLUListElement>(null);
  const navPillRef = useRef<HTMLSpanElement>(null);
  useFlipPill(view, navRef, navPillRef);

  const darkIcon = useIconSwap(dark);
  const themeIcon = useIconSwap(theme);

  return (
    // min-w-0 is load-bearing on the rail: without it the grid column sizes
    // to the nav's full content width on mobile, so the row stretches the
    // page instead of scrolling inside itself. The rail is hidden below md —
    // MobileNav's bottom bar + "More" sheet own navigation on small screens.
    <aside
      className={
        mode === 'rail'
          ? 'hidden min-w-0 md:sticky md:top-[72px] md:block md:max-h-[calc(100vh-72px)] md:overflow-y-auto md:py-2'
          : 'min-w-0'
      }
    >
      <nav aria-label="Views">
        {/* One flat <ul> across both groups so the Flip pill (useFlipPill)
            still animates the accent rail between them. Group headings are
            desktop-only on the rail — on mobile this is a horizontal pill
            scroller, where a non-interactive heading would just read as a
            dead button. */}
        <ul ref={navRef} className="relative flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          <span ref={navPillRef} aria-hidden="true" className="nav-active-pill pointer-events-none absolute left-0 top-0 -z-10 rounded-md border-2 border-line bg-panel shadow-hardXs" />
          {NAV_GROUPS.map((group) => (
            <li key={group} className="contents">
              <ul className="contents">
                <li className="hidden md:block" aria-hidden="true">
                  <p className="px-3 pb-1 pt-4 section-label">
                    {group}
                  </p>
                </li>
                {VIEW_META.filter((v) => v.group === group).map(
                  ({ key, label, icon: IconEl, emoji }) => {
                    const active = view === key;
                    return (
                      <li key={key} className="shrink-0">
                        <button
                          data-pill-key={key}
                          onClick={() => onSetView(key)}
                          aria-current={active ? 'page' : undefined}
                          className={`group/nav relative flex w-full items-center gap-2.5 whitespace-nowrap
                                      rounded-md px-3 py-2 text-meta transition duration-150
                                      focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                                      ${
                                        active
                                          ? 'font-bold text-ink'
                                          : 'text-ink-soft hover:translate-x-1 hover:text-ink'
                                      }`}
                        >
                          {/* Emoji swaps in for the drawn icon only while
                              active, where the label is fully visible and
                              carrying the meaning; every inactive item keeps
                              the consistent SVG. */}
                          {active ? (
                            <NavEmoji emoji={emoji} />
                          ) : (
                            <IconEl className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover/nav:scale-110" />
                          )}
                          {label}
                        </button>
                      </li>
                    );
                  }
                )}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      {/* Filters only shape the list; on the aggregate views they'd read as
          controls that do nothing. */}
      {view === 'list' && (
        <div className="mt-8 space-y-3">
          <p className="px-3 section-label">Filter</p>
          <div className="relative">
            <Icon.Sort className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <select
              value={sort}
              onChange={(e) => onSetSort(e.target.value as SortKey)}
              className="field-input pl-8"
              aria-label="Sort by"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Icon.Target className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <select
              value={typeF}
              onChange={(e) => onSetTypeF(e.target.value)}
              className="field-input pl-8"
              aria-label="Filter by role type"
            >
              <option value="">All role types</option>
              {ROLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Icon.GradCap className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <select
              value={employmentF}
              onChange={(e) => onSetEmploymentF(e.target.value)}
              className="field-input pl-8"
              aria-label="Filter by employment type"
            >
              <option value="">Jobs + Internships</option>
              <option value="job">Jobs only</option>
              <option value="internship">Internships only</option>
            </select>
          </div>
          {onSetTagF && (
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs">🏷️</span>
              <select
                value={tagF ?? ''}
                onChange={(e) => onSetTagF(e.target.value)}
                className="field-input pl-8"
                aria-label="Filter by tag"
              >
                <option value="">All tags</option>
                <option value="SOT">🕊️ Summer of Tech (SOT)</option>
                <option value="Internship">Internship</option>
                <option value="Graduate">Graduate</option>
                <option value="Cyber">Cyber</option>
                <option value="Govt">Govt</option>
              </select>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 space-y-3 md:mt-10">
        <p className="px-3 section-label">Appearance</p>
        {/* The theme toggle is the one control in the app whose whole job is
            to change how everything looks, so the icon actually performs the
            change: it rotates out and the replacement rotates in, rather than
            swapping instantly (see useIconSwap above). */}
        <button
          onClick={onToggleDark}
          className="group/appearance flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-meta
                     text-ink-soft transition duration-150 hover:translate-x-1 hover:text-ink"
        >
          <span ref={darkIcon.ref} className="relative h-4 w-4 shrink-0">
            {darkIcon.displayed ? <Icon.Sun className="h-4 w-4" /> : <Icon.Moon className="h-4 w-4" />}
          </span>
          {dark ? 'Light mode' : 'Dark mode'}
          <span aria-hidden="true" className="emoji ml-auto text-[13px] opacity-0 transition-opacity group-hover/appearance:opacity-100">
            {dark ? '☀️' : '🌙'}
          </span>
        </button>
        {/* Second theme (genjutsu:paint, 30 Aug 2026): Pulse is a whole
            different shape/motion language, not just a colour swap, so this
            sits as its own toggle rather than folding into dark/light. */}
        <button
          onClick={onToggleTheme}
          className="group/theme flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-meta
                     text-ink-soft transition duration-150 hover:translate-x-1 hover:text-ink"
        >
          <span ref={themeIcon.ref} className="relative h-4 w-4 shrink-0">
            {themeIcon.displayed === 'pulse' ? <Icon.Sparkle className="h-4 w-4" /> : <Icon.Square className="h-4 w-4" />}
          </span>
          {theme === 'pulse' ? 'Bauhaus theme' : 'Pulse theme'}
          <span aria-hidden="true" className="emoji ml-auto text-[13px] opacity-0 transition-opacity group-hover/theme:opacity-100">
            {theme === 'pulse' ? '◼️' : '✨'}
          </span>
        </button>
        {/* A new random Pexels photo behind the app each day (30 Aug 2026) —
            independent of light/dark and Bauhaus/Pulse, works under either. */}
        <button
          onClick={onToggleWallpaper}
          className="group/wallpaper flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-meta
                     text-ink-soft transition duration-150 hover:translate-x-1 hover:text-ink"
        >
          <Icon.Image className={`h-4 w-4 shrink-0 ${wallpaper ? 'text-accent' : ''}`} />
          Daily wallpaper
          <span aria-hidden="true" className="emoji ml-auto text-[13px] opacity-0 transition-opacity group-hover/wallpaper:opacity-100">
            {wallpaper ? '✅' : '🖼️'}
          </span>
        </button>
        {wallpaper && (
          <div className="px-3 py-1.5">
            <label htmlFor="wallpaper-dim" className="mb-1 flex items-center justify-between text-label text-ink-faint">
              Dim
              <span className="font-mono">{wallpaperDim}%</span>
            </label>
            <input
              id="wallpaper-dim"
              type="range"
              min={0}
              max={100}
              value={wallpaperDim}
              onChange={(e) => onSetWallpaperDim(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
        )}
        {/* On by default. Playing a note right on the click that turns it on
            is the toggle's own confirmation — no separate "test sound"
            control needed. */}
        <button
          onClick={() => {
            const next = !sound;
            onToggleSound();
            // Flip the module flag synchronously too, rather than waiting on
            // the App-level effect that mirrors it — otherwise this demo note
            // races that effect and can fire silently the instant sound is
            // switched on.
            if (next) {
              setSoundEnabled(true);
              playSound('success');
            }
          }}
          className="group/sound flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-meta
                     text-ink-soft transition duration-150 hover:translate-x-1 hover:text-ink"
        >
          {sound ? (
            <Icon.Volume className="h-4 w-4 shrink-0 text-accent" />
          ) : (
            <Icon.Mute className="h-4 w-4 shrink-0" />
          )}
          Sound
          <span aria-hidden="true" className="emoji ml-auto text-[13px] opacity-0 transition-opacity group-hover/sound:opacity-100">
            {sound ? '🔊' : '🔇'}
          </span>
        </button>
        <button
          onClick={async () => {
            await api.logout().catch(() => {});
            window.location.reload();
          }}
          className="group/out flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-meta
                     text-ink-soft transition duration-150 hover:translate-x-1 hover:text-rose"
        >
          <Icon.SignOut className="h-4 w-4 transition-transform duration-200 group-hover/out:translate-x-0.5" />
          Sign out
        </button>
      </div>

      <div className="mt-8 space-y-2 md:mt-10">
        <p className="px-3 section-label">AI processing</p>
        <div className="panel-inset px-3 py-2.5 text-micro">
          <p className="flex items-center gap-2 font-medium text-ink">
            {/* Genuinely live — the CLI is either reachable or it isn't, and
                this dot is the only place that says so. Earns the ring. */}
            <span
              className="live-dot h-2 w-2 bg-grass"
              style={{ '--pulse': 'var(--grass)' } as CSSProperties}
              aria-hidden="true"
            />
            Claude via CLI
          </p>
          <p className="mt-1 text-label leading-snug text-ink-soft">
            Runs claude.exe on this PC · reads applications.json and job-ad URLs only.
          </p>
          <a
            href="/api/open-folder"
            onClick={(e) => e.preventDefault()}
            title="See Career and Job/AI Providers.md for the full picture"
            className="mt-2 inline-flex items-center gap-1 text-label text-accent"
          >
            <Icon.External className="h-3 w-3" />
            AI Providers.md
          </a>
        </div>
      </div>
    </aside>
  );
}
