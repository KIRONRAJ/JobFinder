import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icons';
import { TabStrip } from '../components/TabStrip';
import { ThemeSelector, type VisualTheme } from '../components/ThemeSelector';
import { AuditView } from '../components/AuditView';
import { ServerLogView } from '../components/ServerLogView';
import { playSound, setSoundEnabled } from '../lib/sound';

type Tab = 'appearance' | 'audit' | 'server';

const TABS: { key: Tab; label: string; icon: (p: { className?: string }) => JSX.Element }[] = [
  { key: 'appearance', label: 'Appearance', icon: Icon.Palette },
  { key: 'audit', label: 'Audit log', icon: Icon.Scroll },
  { key: 'server', label: 'Server log', icon: Icon.Server },
];

export interface AppearanceProps {
  dark: boolean;
  onToggleDark: () => void;
  theme: VisualTheme;
  onSelectTheme: (t: VisualTheme) => void;
  wallpaper: boolean;
  onToggleWallpaper: () => void;
  wallpaperDim: number;
  onSetWallpaperDim: (v: number) => void;
  sound: boolean;
  onToggleSound: () => void;
}

/** One settings row: label + description on the left, control on the right.
 *  Three rows shared a shape, so they share a component. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-meta font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-micro leading-snug text-ink-soft">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A plain on/off control. The app had no switch primitive — these toggles
 *  were sidebar buttons whose label changed — so this is the smallest thing
 *  that reads as a setting rather than an action. */
function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 rounded-full border-2 transition-colors duration-200
                  ${on ? 'border-accent bg-accent/25' : 'border-line bg-panel-2'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full transition-all duration-200
                    ${on ? 'left-[22px] bg-accent' : 'left-0.5 bg-ink-faint'}`}
      />
    </button>
  );
}

function Appearance({
  dark,
  onToggleDark,
  theme,
  onSelectTheme,
  wallpaper,
  onToggleWallpaper,
  wallpaperDim,
  onSetWallpaperDim,
  sound,
  onToggleSound,
}: AppearanceProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <Row label="Dark mode" hint="Also available as a one-click toggle in the sidebar.">
        <Toggle on={dark} onChange={onToggleDark} label="Dark mode" />
      </Row>

      <Row
        label="Theme"
        hint="Bauhaus is architectural and red; Pulse is violet and soft; Cyber Obsidian is neon on black. Independent of light/dark."
      >
        <ThemeSelector theme={theme} onSelectTheme={onSelectTheme} />
      </Row>

      <Row
        label="Background photo"
        hint="A new random Pexels photo behind the app each day. Works under any theme."
      >
        <Toggle on={wallpaper} onChange={onToggleWallpaper} label="Background photo" />
      </Row>

      {/* Only meaningful while a photo is actually showing. */}
      {wallpaper && (
        <Row label="Photo dim" hint="How far the photo is pushed behind the interface.">
          <div className="flex w-44 items-center gap-3">
            <input
              id="wallpaper-dim"
              type="range"
              min={0}
              max={100}
              value={wallpaperDim}
              onChange={(e) => onSetWallpaperDim(Number(e.target.value))}
              aria-label="Background photo dim"
              className="w-full accent-accent"
            />
            <span className="w-10 shrink-0 text-right font-mono text-micro text-ink-soft">
              {wallpaperDim}%
            </span>
          </div>
        </Row>
      )}

      <Row label="Sound" hint="Short confirmation notes on saves, status changes and celebrations.">
        <Toggle
          on={sound}
          // Playing a note on the click that turns it on is the toggle's own
          // confirmation. The module flag has to flip synchronously or this
          // note races the App-level effect that mirrors it and fires silently.
          onChange={() => {
            const next = !sound;
            onToggleSound();
            if (next) {
              setSoundEnabled(true);
              playSound('success');
            }
          }}
          label="Sound"
        />
      </Row>
    </div>
  );
}

/**
 * Appearance controls used to live in the sidebar rail, where they sat under
 * the nav and filters as a permanent column of switches — fine when there were
 * two, cluttered at five, and with nowhere to explain what any of them did.
 * They're rows on a page now, which also gives the two log views a home: the
 * audit log (what changed, permanently) and the server log (whether the process
 * was healthy, live) are both tracing surfaces, not analysis, so they belong
 * here rather than under Insights.
 */
export function Settings(props: AppearanceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = (searchParams.get('tab') as Tab) || 'appearance';

  const setTab = (t: Tab) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === 'appearance') next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true }
    );

  return (
    <div>
      <TabStrip items={TABS} active={tab} onPick={setTab} ariaLabel="Settings section" />

      {tab === 'appearance' && <Appearance {...props} />}
      {tab === 'audit' && <AuditView />}
      {tab === 'server' && <ServerLogView />}
    </div>
  );
}
