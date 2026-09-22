import { Icon } from '../Icons';
import { useSpotlight } from './useSpotlight';
import { playSound } from '../../lib/sound';

interface Props {
  onAddNew: () => void;
  onGmailFetch: () => void;
  onOpenTerminal: () => void;
  onGoToInsights: () => void;
}

export function CommandDockTile({
  onAddNew,
  onGmailFetch,
  onOpenTerminal,
  onGoToInsights,
}: Props) {
  const { onMouseMove } = useSpotlight();

  return (
    <div
      onMouseMove={onMouseMove}
      className="studio-tile md:col-span-12 lg:col-span-4 p-7 flex flex-col justify-between"
    >
      <div className="studio-spotlight" />

      <div>
        {/* Header with Eyebrow and Shortcut Hint */}
        <div className="flex items-center justify-between gap-2 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold tracking-widest text-amber-500 uppercase">
              02 — QUICK ACTION DOCK
            </span>
          </div>
          <span className="text-xs font-mono text-ink-faint">Tactile Shortcuts</span>
        </div>

        {/* Quick Action Candy Buttons */}
        <div className="mt-4 space-y-2.5">
          {/* 1. Log New Opportunity (Electric Iris) */}
          <button
            type="button"
            onClick={() => {
              playSound('tick');
              onAddNew();
            }}
            className="candy-pod group/btn w-full flex items-center justify-between rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-transparent p-3 text-left transition-all hover:border-blue-500/40 hover:bg-blue-500/15"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25 text-base shadow-sm transition-transform group-hover/btn:scale-110">
                <span aria-hidden="true">🚀</span>
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold font-sans text-ink group-hover/btn:text-blue-500 transition-colors flex items-center gap-1.5">
                  <Icon.Plus className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <span className="truncate">Log Opportunity</span>
                </div>
                <div className="text-[11px] text-ink-soft truncate">Create new role or lead</div>
              </div>
            </div>
            <kbd className="hidden sm:inline-block shrink-0 rounded-md border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2 py-0.5 font-mono text-[10px] text-ink-faint">
              N
            </kbd>
          </button>

          {/* 2. Sync Gmail (Rose Coral) */}
          <button
            type="button"
            onClick={() => {
              playSound('tick');
              onGmailFetch();
            }}
            className="candy-pod group/btn w-full flex items-center justify-between rounded-2xl border border-rose-500/20 bg-gradient-to-r from-rose-500/10 to-transparent p-3 text-left transition-all hover:border-rose-500/40 hover:bg-rose-500/15"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25 text-base shadow-sm transition-transform group-hover/btn:scale-110">
                <span aria-hidden="true">📬</span>
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold font-sans text-ink group-hover/btn:text-rose-500 transition-colors flex items-center gap-1.5">
                  <Icon.Mail className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  <span className="truncate">Sync Gmail Inquiries</span>
                </div>
                <div className="text-[11px] text-ink-soft truncate">Fetch correspondence</div>
              </div>
            </div>
            <kbd className="hidden sm:inline-block shrink-0 rounded-md border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2 py-0.5 font-mono text-[10px] text-ink-faint">
              G
            </kbd>
          </button>

          {/* 3. Claude Console (Violet Lavender) */}
          <button
            type="button"
            onClick={() => {
              playSound('tick');
              onOpenTerminal();
            }}
            className="candy-pod group/btn w-full flex items-center justify-between rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-transparent p-3 text-left transition-all hover:border-purple-500/40 hover:bg-purple-500/15"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25 text-base shadow-sm transition-transform group-hover/btn:scale-110">
                <span aria-hidden="true">🤖</span>
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold font-sans text-ink group-hover/btn:text-purple-500 transition-colors flex items-center gap-1.5">
                  <Icon.Terminal className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                  <span className="truncate">Claude AI Console</span>
                </div>
                <div className="text-[11px] text-ink-soft truncate">Query radar & generate CVs</div>
              </div>
            </div>
            <kbd className="hidden sm:inline-block shrink-0 rounded-md border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2 py-0.5 font-mono text-[10px] text-ink-faint">
              Ctrl+J
            </kbd>
          </button>

          {/* 4. Deep Market Analytics (Fresh Mint) */}
          <button
            type="button"
            onClick={() => {
              playSound('tick');
              onGoToInsights();
            }}
            className="candy-pod group/btn w-full flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-transparent p-3 text-left transition-all hover:border-emerald-500/40 hover:bg-emerald-500/15"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-base shadow-sm transition-transform group-hover/btn:scale-110">
                <span aria-hidden="true">📊</span>
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold font-sans text-ink group-hover/btn:text-emerald-500 transition-colors flex items-center gap-1.5">
                  <Icon.Chart className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">Market Analytics</span>
                </div>
                <div className="text-[11px] text-ink-soft truncate">Skill matrix & radar</div>
              </div>
            </div>
            <kbd className="hidden sm:inline-block shrink-0 rounded-md border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2 py-0.5 font-mono text-[10px] text-ink-faint">
              I
            </kbd>
          </button>
        </div>
      </div>

      <div className="mt-5 pt-3.5 border-t border-black/[0.06] dark:border-white/[0.08] text-xs font-mono text-ink-faint flex items-center justify-between">
        <span>Global Command Palette:</span>
        <kbd className="rounded-md border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2 py-0.5 text-[10px] font-mono font-bold text-ink">
          Ctrl+K
        </kbd>
      </div>
    </div>
  );
}
