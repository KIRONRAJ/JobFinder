import { useMemo } from 'react';
import { Icon } from '../Icons';
import { AnimatedCounter } from '../AnimatedCounter';
import { useSpotlight } from './useSpotlight';
import { playSound } from '../../lib/sound';
import type { Application } from '../../types';

interface Props {
  apps: Application[];
  onSelectStage: (stage: string) => void;
}

export function FunnelRadarTile({ apps, onSelectStage }: Props) {
  const { onMouseMove } = useSpotlight();

  const stages = useMemo(() => {
    const researching = apps.filter((a) => a.status === 'researching').length;
    const applied = apps.filter((a) => a.status === 'applied' && !a.progressing).length;
    const progressing = apps.filter(
      (a) => a.status === 'interview' || a.status === 'offer' || Boolean(a.progressing)
    ).length;
    const interviewOnly = apps.filter((a) => a.status === 'interview').length;
    const offer = apps.filter((a) => a.status === 'offer').length;
    const rejected = apps.filter((a) => a.status === 'rejected').length;

    return [
      {
        key: 'researching',
        label: 'Wishlist',
        count: researching,
        color: 'border-cyan-500/30 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10',
        barColor: 'bg-cyan-500',
        icon: Icon.Search,
        hint: 'Under research',
      },
      {
        key: 'applied',
        label: 'Applied',
        count: applied,
        color: 'border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10',
        barColor: 'bg-blue-500',
        icon: Icon.Paperplane,
        hint: 'Awaiting reply',
      },
      {
        key: 'progressing',
        label: 'Progressing',
        count: progressing,
        color: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10',
        barColor: 'bg-amber-500',
        icon: Icon.Zap,
        hint: `${interviewOnly} in interview stage`,
      },
      {
        key: 'offer',
        label: 'Offers',
        count: offer,
        color: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
        barColor: 'bg-emerald-500',
        icon: Icon.Trophy,
        hint: 'Final victory',
      },
      {
        key: 'rejected',
        label: 'Archived',
        count: rejected,
        color: 'border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10',
        barColor: 'bg-rose-500/60',
        icon: Icon.Close,
        hint: 'Closed or passed',
      },
    ];
  }, [apps]);

  const totalCount = apps.length;

  return (
    <div
      onMouseMove={onMouseMove}
      className="studio-tile md:col-span-12 lg:col-span-6 p-7 flex flex-col justify-between"
    >
      <div className="studio-spotlight" />

      <div>
        {/* Header with Eyebrow and Count */}
        <div className="flex items-center justify-between gap-2 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold tracking-widest text-emerald-500 uppercase">
              05 — CONVERSION FUNNEL
            </span>
          </div>
          <span className="text-xs font-mono text-ink-faint">
            {totalCount} total opportunities
          </span>
        </div>

        {/* Proportional Segmented Funnel Bar */}
        <div className="mt-5 flex h-3.5 w-full overflow-hidden rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-panel-2 p-0.5">
          {stages.map((st) => {
            const pct = totalCount > 0 ? (st.count / totalCount) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={st.key}
                style={{ width: `${pct}%` }}
                className={`h-full ${st.barColor} transition-all duration-300 first:rounded-l-full last:rounded-r-full hover:brightness-110`}
                title={`${st.label}: ${st.count} (${Math.round(pct)}%)`}
              />
            );
          })}
        </div>

        {/* Interactive Stage Pods */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stages.map((st) => {
            const StIcon = st.icon;
            return (
              <button
                key={st.key}
                type="button"
                onClick={() => {
                  playSound('tick');
                  onSelectStage(st.key);
                }}
                className="candy-pod group/stage flex flex-col justify-between rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-panel/70 p-3.5 text-left transition-all duration-200 hover:bg-panel hover:border-black/[0.14] dark:hover:border-white/[0.16] hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink">
                    {st.label}
                  </span>
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${st.color} transition-transform group-hover/stage:scale-110`}
                  >
                    <StIcon className="h-3 w-3" />
                  </span>
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-sans text-ink">
                    <AnimatedCounter value={st.count} />
                  </span>
                  <span className="text-xs font-mono text-ink-faint">
                    {totalCount > 0 ? Math.round((st.count / totalCount) * 100) : 0}%
                  </span>
                </div>

                <p className="mt-1 truncate text-[11px] text-ink-soft font-sans">
                  {st.hint}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 pt-3.5 border-t border-black/[0.06] dark:border-white/[0.08] text-xs font-mono text-ink-faint flex items-center justify-between">
        <span>Click any stage pod to filter full pipeline</span>
        <span className="font-semibold text-blue-500 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
          Inspect ➔
        </span>
      </div>
    </div>
  );
}
