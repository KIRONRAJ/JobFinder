import { useMemo } from 'react';
import { Icon } from '../Icons';
import { AnimatedCounter } from '../AnimatedCounter';
import { useSpotlight } from './useSpotlight';
import { daysUntil, daysSince, type Application } from '../../types';

interface Props {
  apps: Application[];
  notionOn: boolean;
  notionError: string | null;
  onSelectMetric?: (filterType: string) => void;
  onReplayLoader?: () => void;
}

export function MissionBriefingTile({
  apps,
  notionOn,
  notionError,
  onSelectMetric,
  onReplayLoader,
}: Props) {
  const { onMouseMove } = useSpotlight();

  // Polished greeting & New Zealand Pacific time
  const { greeting, timeStr } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    let greet = 'Good morning, Jordan';
    if (hour >= 12 && hour < 17) greet = 'Good afternoon, Jordan';
    else if (hour >= 17) greet = 'Good evening, Jordan';

    const time = now.toLocaleTimeString('en-NZ', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Pacific/Auckland',
    });
    return { greeting: greet, timeStr: `${time} NZT · Auckland` };
  }, []);

  // Velocity KPIs calculation
  const metrics = useMemo(() => {
    const activeInFlight = apps.filter(
      (a) => a.status === 'applied' || a.status === 'interview' || a.status === 'offer'
    );

    const appliedCount = apps.filter(
      (a) =>
        a.status === 'applied' ||
        a.status === 'interview' ||
        a.status === 'offer' ||
        a.status === 'rejected'
    ).length;

    const interviewCount = apps.filter(
      (a) => a.status === 'interview' || a.status === 'offer' || Boolean(a.progressing)
    ).length;

    const conversionRate = appliedCount > 0 ? Math.round((interviewCount / appliedCount) * 100) : 0;

    let sentPast7d = 0;
    let sentPrior7d = 0;
    for (const a of apps) {
      const d = daysSince(a.date);
      if (d !== null) {
        if (d <= 7) sentPast7d++;
        else if (d <= 14) sentPrior7d++;
      }
    }
    const weeklyDelta = sentPast7d - sentPrior7d;

    let urgentCount = 0;
    for (const a of apps) {
      if (a.status === 'researching' && a.deadline) {
        const left = daysUntil(a.deadline);
        if (left !== null && left >= 0 && left <= 2) urgentCount++;
      }
      if (a.followUpDue && a.status === 'applied') {
        const left = daysUntil(a.followUpDue);
        if (left !== null && left <= 1) urgentCount++;
      }
    }

    return {
      activeCount: activeInFlight.length,
      conversionRate,
      sentPast7d,
      weeklyDelta,
      urgentCount,
    };
  }, [apps]);

  return (
    <div
      onMouseMove={onMouseMove}
      className="studio-tile md:col-span-12 lg:col-span-8 p-7 flex flex-col justify-between"
    >
      <div className="studio-spotlight" />

      <div>
        {/* Top Header: Eyebrow, Greeting, Auckland Clock & Telemetry Badges */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-widest text-blue-500 uppercase">
                01 — CAMPAIGN OVERVIEW
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            </div>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-ink font-sans">
              {greeting}
            </h2>
            <div className="mt-1 flex items-center gap-3 text-xs text-ink-soft font-mono">
              <span className="flex items-center gap-1.5">
                <Icon.Clock className="h-3.5 w-3.5 text-blue-500" />
                <span>{timeStr}</span>
              </span>
            </div>
          </div>

          {/* Right Status Capsule */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Production Node Beacon */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-panel-2/60 px-3 py-1 font-mono text-xs text-ink-soft backdrop-blur-sm"
              title="Authoritative 24/7 Node, port 5178"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="font-semibold text-ink">Node:5178</span>
              <span className="text-emerald-500 font-bold">ONLINE</span>
            </div>

            {/* Notion Status */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-panel-2/60 px-3 py-1 font-mono text-xs text-ink-soft backdrop-blur-sm"
              title={
                notionError
                  ? `Notion sync error: ${notionError}`
                  : notionOn
                  ? 'Notion mirror online'
                  : 'Notion not configured'
              }
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  notionError ? 'bg-rose-500' : notionOn ? 'bg-emerald-500' : 'bg-neutral'
                }`}
              />
              <span>Notion</span>
              <span
                className={`font-semibold ${
                  notionError
                    ? 'text-rose-500'
                    : notionOn
                    ? 'text-emerald-500'
                    : 'text-neutral'
                }`}
              >
                {notionError ? 'ERR' : notionOn ? 'SYNCED' : 'OFF'}
              </span>
            </div>

            {/* Replay Entrance Trigger */}
            {onReplayLoader && (
              <button
                type="button"
                onClick={onReplayLoader}
                title="Replay Kinetic Entrance Preloader"
                className="inline-flex items-center gap-1 rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-panel px-2.5 py-1 text-xs font-mono text-ink-soft hover:text-blue-500 hover:border-blue-500/40 transition-colors"
              >
                <Icon.Zap className="h-3 w-3 text-blue-500" />
                <span className="hidden sm:inline">Intro</span>
              </button>
            )}
          </div>
        </div>

        {/* Four Vibrant Candy Pods */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {/* 1. In-Flight Active Pursuits (Electric Iris) */}
          <button
            type="button"
            onClick={() => onSelectMetric?.('applied')}
            className="candy-pod group/kpi text-left p-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/5 dark:from-blue-500/15 dark:to-indigo-500/10 border-blue-500/25 hover:border-blue-500/50 hover:shadow-[0_8px_20px_-4px_rgba(59,130,246,0.25)]"
          >
            <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <span>In-Flight</span>
              <Icon.Paperplane className="h-4 w-4 transition-transform group-hover/kpi:scale-125" />
            </div>
            <div className="mt-3 text-3xl font-bold font-sans text-ink flex items-baseline gap-1.5">
              <AnimatedCounter value={metrics.activeCount} />
              <span className="text-xs font-normal text-ink-faint font-mono">active</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft truncate font-sans">
              Applied & Interviewing
            </p>
          </button>

          {/* 2. Conversion Rate (Fresh Mint) */}
          <button
            type="button"
            onClick={() => onSelectMetric?.('progressing')}
            className="candy-pod group/kpi text-left p-4 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 dark:from-emerald-500/15 dark:to-teal-500/10 border-emerald-500/25 hover:border-emerald-500/50 hover:shadow-[0_8px_20px_-4px_rgba(16,185,129,0.25)]"
          >
            <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <span>Conversion</span>
              <Icon.Trophy className="h-4 w-4 transition-transform group-hover/kpi:scale-125" />
            </div>
            <div className="mt-3 text-3xl font-bold font-sans text-emerald-600 dark:text-emerald-400 flex items-baseline gap-1">
              <AnimatedCounter value={metrics.conversionRate} suffix="%" />
            </div>
            <p className="mt-1 text-xs text-ink-soft truncate font-sans">
              To interview stage
            </p>
          </button>

          {/* 3. 7-Day Velocity (Vibrant Violet) */}
          <div className="candy-pod p-4 bg-gradient-to-br from-purple-500/10 to-fuchsia-500/5 dark:from-purple-500/15 dark:to-fuchsia-500/10 border-purple-500/25 hover:border-purple-500/50 hover:shadow-[0_8px_20px_-4px_rgba(168,85,247,0.25)]">
            <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              <span>7D Velocity</span>
              <Icon.Zap className="h-4 w-4" />
            </div>
            <div className="mt-3 text-3xl font-bold font-sans text-ink flex items-baseline gap-1.5">
              <AnimatedCounter value={metrics.sentPast7d} />
              <span className="text-xs font-normal text-ink-faint font-mono">sent</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft flex items-center gap-1 font-sans">
              {metrics.weeklyDelta >= 0 ? (
                <span className="text-emerald-500 font-bold font-mono">
                  +{metrics.weeklyDelta}
                </span>
              ) : (
                <span className="text-rose-500 font-bold font-mono">
                  {metrics.weeklyDelta}
                </span>
              )}
              <span>vs prior 7d</span>
            </p>
          </div>

          {/* 4. Action Required (Solar Amber / Coral) */}
          <button
            type="button"
            onClick={() => onSelectMetric?.('attention')}
            className={`candy-pod group/kpi text-left p-4 transition-all ${
              metrics.urgentCount > 0
                ? 'bg-gradient-to-br from-amber-500/15 to-rose-500/10 border-amber-500/35 hover:border-amber-500/60 hover:shadow-[0_8px_20px_-4px_rgba(245,158,11,0.3)]'
                : 'bg-gradient-to-br from-zinc-500/5 to-zinc-500/5 border-black/[0.06] dark:border-white/[0.08]'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider">
              <span
                className={
                  metrics.urgentCount > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-ink-faint'
                }
              >
                Action Due
              </span>
              <Icon.Target
                className={`h-4 w-4 transition-transform group-hover/kpi:scale-125 ${
                  metrics.urgentCount > 0
                    ? 'text-amber-500 animate-pulse'
                    : 'text-ink-faint'
                }`}
              />
            </div>
            <div className="mt-3 text-3xl font-bold font-sans flex items-baseline gap-1.5">
              <span
                className={
                  metrics.urgentCount > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-ink'
                }
              >
                <AnimatedCounter value={metrics.urgentCount} />
              </span>
              <span className="text-xs font-normal text-ink-faint font-mono">items</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft truncate font-sans">
              Deadlines & Follow-ups
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
