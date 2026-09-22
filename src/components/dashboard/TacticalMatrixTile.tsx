import { useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { api } from '../../api';
import { pickPriorities } from '../../lib/priorities';
import { useSpotlight } from './useSpotlight';
import type { Application, Priority } from '../../types';

interface Props {
  apps: Application[];
  onOpenApp: (app: Application) => void;
  onOpenTerminal: () => void;
  onRefresh?: () => void;
}

const ACTION_LABEL: Record<Priority['action'], string> = {
  apply: 'Apply',
  'follow-up': 'Follow Up',
  improve: 'Improve CV',
  prepare: 'Prep Interview',
};

const ACTION_COLOR: Record<Priority['action'], { bg: string; text: string; border: string }> = {
  apply: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/30',
  },
  'follow-up': {
    bg: 'bg-blue-500/10 dark:bg-blue-500/15',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/30',
  },
  prepare: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/30',
  },
  improve: {
    bg: 'bg-rose-500/10 dark:bg-rose-500/15',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-500/30',
  },
};

export function TacticalMatrixTile({ apps, onOpenApp, onOpenTerminal, onRefresh }: Props) {
  const { onMouseMove } = useSpotlight();
  const [ranking, setRanking] = useState(false);

  const now = Date.now();
  const live = apps
    .filter((a) => a.priority && (!a.priority.expiresAt || a.priority.expiresAt > now))
    .sort((a, b) => (a.priority!.rank ?? 99) - (b.priority!.rank ?? 99))
    .slice(0, 3);

  const computed = useMemo(
    () => (live.length === 0 ? pickPriorities(apps).slice(0, 3) : []),
    [apps, live.length]
  );

  const rows = useMemo(() => {
    if (live.length > 0) {
      return live.map((app) => ({
        app,
        rank: app.priority!.rank,
        reason: app.priority!.reason,
        action: app.priority!.action,
        computed: false,
      }));
    }
    return computed
      .map((p, i) => {
        const app = apps.find((a) => a.id === p.id);
        return app
          ? { app, rank: i + 1, reason: p.reason, action: p.action, computed: true }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [live, computed, apps]);

  async function handleAutoRank() {
    setRanking(true);
    try {
      await api.autoPickPriorities();
      onRefresh?.();
    } catch {
      // Ignored; fallback computation remains active
    } finally {
      setRanking(false);
    }
  }

  return (
    <div
      onMouseMove={onMouseMove}
      className="studio-tile md:col-span-12 lg:col-span-6 p-7 flex flex-col justify-between"
    >
      <div className="studio-spotlight" />

      <div>
        {/* Header with Eyebrow and AI Auto-Rank pill */}
        <div className="flex items-center justify-between gap-2 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold tracking-widest text-indigo-500 uppercase">
              03 — TACTICAL MATRIX
            </span>
          </div>

          <button
            type="button"
            onClick={handleAutoRank}
            disabled={ranking}
            title="Auto-rank tactical priorities with Claude AI"
            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-all disabled:opacity-50"
          >
            <Icon.Sparkles className={`h-3 w-3 ${ranking ? 'animate-spin' : ''}`} />
            <span>{ranking ? 'Ranking…' : 'Auto-Rank'}</span>
          </button>
        </div>

        {/* Priority items list */}
        <div className="mt-4 space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/[0.08] dark:border-white/[0.1] p-6 text-center">
              <Icon.Check className="mx-auto h-6 w-6 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-ink">Clear runway!</p>
              <p className="mt-1 text-xs text-ink-soft">
                No pressing deadlines or follow-ups today.
              </p>
              <button
                type="button"
                onClick={onOpenTerminal}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-3 py-1.5 text-xs font-mono text-ink hover:border-accent transition-colors"
              >
                <Icon.Terminal className="h-3.5 w-3.5 text-accent" />
                Ask Claude Console
              </button>
            </div>
          ) : (
            rows.map(({ app, rank, reason, action }) => {
              const theme = ACTION_COLOR[action];
              return (
                <div
                  key={app.id}
                  onClick={() => onOpenApp(app)}
                  className="group/item relative flex items-start justify-between gap-3 rounded-2xl border border-black/[0.05] dark:border-white/[0.07] bg-panel/70 p-3.5 transition-all duration-200 hover:bg-panel hover:border-black/[0.12] dark:hover:border-white/[0.15] hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel-2 font-mono text-[10px] font-bold text-ink-soft">
                        0{rank}
                      </span>
                      <h4 className="truncate text-sm font-bold text-ink group-hover/item:text-blue-500 transition-colors">
                        {app.company}
                      </h4>
                    </div>
                    <p className="truncate text-xs text-ink-soft mt-0.5 pl-7">
                      {app.role}
                    </p>
                    <p className="text-[11px] text-ink-faint mt-1 pl-7 flex items-center gap-1.5 font-mono">
                      <span className="inline-block h-1 w-1 rounded-full bg-blue-500" />
                      <span className="truncate">{reason}</span>
                    </p>
                  </div>

                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${theme.bg} ${theme.text} ${theme.border}`}
                  >
                    {ACTION_LABEL[action]}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-5 pt-3.5 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-xs font-mono text-ink-faint">
        <span>Deterministic + Claude AI</span>
        <button
          type="button"
          onClick={onOpenTerminal}
          className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 transition-colors"
        >
          <Icon.Terminal className="h-3.5 w-3.5" />
          <span>Console (Ctrl+J)</span>
        </button>
      </div>
    </div>
  );
}
