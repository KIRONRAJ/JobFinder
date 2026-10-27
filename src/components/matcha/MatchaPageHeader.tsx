import { Link } from 'react-router-dom';
import { Icon } from '../Icons';
import { VIEW_META } from '../Sidebar';
import { heroFor, useGoHome } from '../PageHeader';
import { MatchaAppearance } from './MatchaAppearance';
import type { OutreachEntry, View } from '../../types';

interface Props {
  view: View;
  appCount: number;
  outreach: OutreachEntry[];
  pendingCount: number;
  onOpenTerminal: () => void;
  onGmailFetch: () => void;
  onPrimary: () => void;
  onHome?: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  dark: boolean;
  onToggleDark: () => void;
  wallpaper: boolean;
  onToggleWallpaper: () => void;
  wallpaperDim: number;
  onSetWallpaperDim: (v: number) => void;
}

/**
 * Matcha's slim top bar: breadcrumb, command box, Gmail, Terminal, light/dark and the primary action. Every
 * handler is the one PageHeader gets (same home transition via useGoHome, same primary label via heroFor).
 * The command box opens the existing command palette by sending the Ctrl+K it already listens for.
 */
export function MatchaPageHeader({
  view,
  appCount,
  outreach,
  pendingCount,
  onOpenTerminal,
  onGmailFetch,
  onPrimary,
  onHome,
  sidebarCollapsed,
  onToggleSidebar,
  dark,
  onToggleDark,
  wallpaper,
  onToggleWallpaper,
  wallpaperDim,
  onSetWallpaperDim,
}: Props) {
  const hero = heroFor(view, appCount, outreach);
  const goHome = useGoHome(onHome);
  const pageName = VIEW_META.find((v) => v.key === view)?.label ?? hero.title;
  const openPalette = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));

  return (
    <header className="glass-header sticky top-3 z-40 mb-6 flex w-full min-w-0 max-w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 sm:gap-3 sm:px-5 md:col-span-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Minimize sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            className="btn-quiet hidden h-9 w-9 shrink-0 p-0 md:inline-flex"
          >
            <Icon.Menu className="h-4 w-4" />
          </button>
        )}
        <nav aria-label="Breadcrumb" className="mx-mono flex min-w-0 items-center gap-2 text-ink-soft">
          <Link
            to="/"
            onClick={goHome}
            className="hidden shrink-0 hover:text-accent min-[430px]:inline"
            title="Job Search HQ — Return to Pipeline Home"
            aria-label="Job Search HQ — Pipeline Home"
          >
            Job Search HQ
          </Link>
          <span aria-hidden="true" className="hidden min-[430px]:inline">
            /
          </span>
          <span aria-current="page" className="truncate text-ink">
            {pageName}
          </span>
        </nav>
      </div>

      <button type="button" onClick={openPalette} className="mx-cmdbox hidden md:flex" aria-label="Open command palette">
        <Icon.Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search or run a command</span>
        <span className="mx-mono text-ink-faint">Ctrl K</span>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onGmailFetch}
          className="btn-quiet h-9 gap-1.5 px-2.5 text-xs font-semibold sm:px-3"
          title="Check your last 10 emails for job-tracker updates — runs in the background, no terminal"
          aria-label="Check Gmail"
        >
          <Icon.Gmail className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Gmail</span>
        </button>

        <button
          onClick={onOpenTerminal}
          className="btn-quiet relative h-9 gap-1.5 px-2.5 text-xs font-semibold sm:px-3"
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
              className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-line bg-amber px-1 text-label font-bold tabular-nums text-canvas"
              aria-hidden="true"
            >
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleDark}
          className="btn-quiet hidden h-9 w-9 p-0 md:inline-flex"
          title={dark ? 'Light mode' : 'Dark mode'}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? <Icon.Sun className="h-4 w-4" /> : <Icon.Moon className="h-4 w-4" />}
        </button>

        <MatchaAppearance
          dark={dark}
          onToggleDark={onToggleDark}
          wallpaper={wallpaper}
          onToggleWallpaper={onToggleWallpaper}
          wallpaperDim={wallpaperDim}
          onSetWallpaperDim={onSetWallpaperDim}
        />

        <button onClick={onPrimary} className="btn-primary h-9 gap-1.5 px-3 text-xs font-bold sm:px-4">
          <Icon.Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{hero.primaryLabel}</span>
          <span className="sr-only sm:hidden">{hero.primaryLabel}</span>
        </button>
      </div>
    </header>
  );
}
