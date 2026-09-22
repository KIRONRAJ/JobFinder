import { useMemo } from 'react';
import { Icon } from '../Icons';
import { useSpotlight } from './useSpotlight';
import { daysUntil, daysSince, type Application } from '../../types';

interface Props {
  apps: Application[];
  onOpenApp: (app: Application) => void;
  onSwitchToPipeline?: () => void;
  onAddNew?: () => void;
}

interface UrgentItem {
  id: string;
  app: Application;
  type: 'deadline' | 'followup' | 'stalled';
  urgency: number; // 0: critical, 1: high, 2: medium, 3: normal
  badge: string;
  badgeClass: string;
  dotClass: string;
  message: string;
  actionText: string;
}

export function UrgentRadarTile({
  apps,
  onOpenApp,
  onSwitchToPipeline,
  onAddNew,
}: Props) {
  const { onMouseMove } = useSpotlight();

  const items = useMemo(() => {
    const list: UrgentItem[] = [];

    for (const app of apps) {
      // 1. Closing Deadlines (0 to 7 days, or overdue researching)
      if (app.deadline && (app.status === 'researching' || app.status === 'applied')) {
        const left = daysUntil(app.deadline);
        if (left !== null && left <= 7) {
          if (left < 0 && app.status === 'researching') {
            list.push({
              id: `dl-overdue-${app.id}`,
              app,
              type: 'deadline',
              urgency: 0,
              badge: 'DEADLINE PASSED',
              badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
              dotClass: 'bg-rose-500',
              message: `Closed ${Math.abs(left)}d ago · Decide to archive or apply`,
              actionText: 'Review',
            });
          } else if (left === 0) {
            list.push({
              id: `dl-today-${app.id}`,
              app,
              type: 'deadline',
              urgency: 0,
              badge: 'CLOSING TODAY',
              badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
              dotClass: 'bg-rose-500 animate-ping',
              message: 'Final day to submit application',
              actionText: 'Apply Now',
            });
          } else if (left === 1) {
            list.push({
              id: `dl-tmrw-${app.id}`,
              app,
              type: 'deadline',
              urgency: 1,
              badge: 'CLOSES TOMORROW',
              badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
              dotClass: 'bg-amber-500',
              message: 'Closing in 24 hours · Finalize CV & letter',
              actionText: 'Prepare',
            });
          } else if (left <= 7) {
            list.push({
              id: `dl-week-${app.id}`,
              app,
              type: 'deadline',
              urgency: left <= 3 ? 2 : 3,
              badge: `${left} DAYS LEFT`,
              badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
              dotClass: 'bg-amber-400',
              message: `Closing on ${app.deadline}`,
              actionText: 'Draft',
            });
          }
        }
      }

      // 2. Follow-ups Due
      if (app.followUpDue && app.status === 'applied') {
        const left = daysUntil(app.followUpDue);
        if (left !== null && left <= 2) {
          if (left <= 0) {
            list.push({
              id: `fu-due-${app.id}`,
              app,
              type: 'followup',
              urgency: 0,
              badge: left === 0 ? 'FOLLOW-UP TODAY' : 'FOLLOW-UP OVERDUE',
              badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
              dotClass: 'bg-blue-500',
              message: left === 0 ? 'Scheduled for today' : `Overdue by ${Math.abs(left)}d`,
              actionText: 'Follow Up',
            });
          } else {
            list.push({
              id: `fu-soon-${app.id}`,
              app,
              type: 'followup',
              urgency: 1,
              badge: `FOLLOW-UP IN ${left}D`,
              badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25',
              dotClass: 'bg-blue-400',
              message: `Due on ${app.followUpDue}`,
              actionText: 'Prepare Email',
            });
          }
        }
      }

      // 3. Stalled Applications (>14 days without update)
      if (app.status === 'applied' && !app.progressing && !app.followUpDue) {
        const age = daysSince(app.date);
        if (age !== null && age >= 14 && age <= 30) {
          list.push({
            id: `stalled-${app.id}`,
            app,
            type: 'stalled',
            urgency: 3,
            badge: `${age}D AWAITING REPLY`,
            badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
            dotClass: 'bg-purple-400',
            message: 'No response received yet · Consider gentle follow-up',
            actionText: 'Check Status',
          });
        }
      }
    }

    // Sort by urgency ascending (0 critical first), then by date/deadline
    return list.sort((a, b) => a.urgency - b.urgency).slice(0, 4);
  }, [apps]);

  return (
    <div
      onMouseMove={onMouseMove}
      className="studio-tile md:col-span-12 lg:col-span-6 p-7 flex flex-col justify-between"
    >
      <div className="studio-spotlight" />

      <div>
        {/* Header with Eyebrow and Live Alert Counter */}
        <div className="flex items-center justify-between gap-2 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            <span className="text-xs font-mono font-bold tracking-widest text-rose-500 uppercase">
              06 — DEADLINES & ACTION RADAR
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-mono font-bold uppercase ${
              items.length > 0
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
            }`}
          >
            {items.length > 0 ? `${items.length} Action${items.length === 1 ? '' : 's'} Due` : 'Clear Runway'}
          </span>
        </div>

        {/* Tactical Action List */}
        <div className="mt-4 space-y-2.5">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/[0.08] dark:border-white/[0.1] bg-panel/40 p-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Icon.Check className="h-5 w-5" />
              </div>
              <h4 className="mt-2 text-sm font-bold text-ink">All Deadlines In Sync</h4>
              <p className="mt-1 text-xs text-ink-soft">
                No closing deadlines in the next 7 days and all follow-ups are up to date.
              </p>
              <div className="mt-3.5 flex items-center justify-center gap-2">
                {onAddNew && (
                  <button
                    type="button"
                    onClick={onAddNew}
                    className="inline-flex items-center gap-1.5 rounded-full bg-panel border border-black/[0.08] dark:border-white/[0.1] px-3 py-1.5 text-xs font-mono font-bold text-ink hover:border-accent transition-colors"
                  >
                    <Icon.Plus className="h-3 w-3 text-accent" />
                    <span>Log Opportunity</span>
                  </button>
                )}
                {onSwitchToPipeline && (
                  <button
                    type="button"
                    onClick={onSwitchToPipeline}
                    className="inline-flex items-center gap-1.5 rounded-full bg-panel border border-black/[0.08] dark:border-white/[0.1] px-3 py-1.5 text-xs font-mono text-ink-soft hover:text-ink transition-colors"
                  >
                    <span>View Pipeline</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                onClick={() => onOpenApp(item.app)}
                className="group/radar relative flex items-center justify-between gap-3 rounded-2xl border border-black/[0.05] dark:border-white/[0.07] bg-panel/70 p-3 transition-all duration-200 hover:bg-panel hover:border-black/[0.12] dark:hover:border-white/[0.15] hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${item.dotClass}`} />
                    <h4 className="truncate text-xs sm:text-sm font-bold text-ink group-hover/radar:text-blue-500 transition-colors">
                      {item.app.company}
                    </h4>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.2 text-[9px] font-mono font-bold uppercase tracking-wider ${item.badgeClass}`}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <p className="truncate text-xs text-ink-soft mt-0.5 pl-4">
                    {item.app.role}
                  </p>
                  <p className="text-[11px] text-ink-faint mt-0.5 pl-4 flex items-center gap-1 font-mono truncate">
                    <span>{item.message}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenApp(item.app);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-3 py-1 text-xs font-mono font-bold text-ink hover:border-accent hover:text-accent transition-all group-hover/radar:border-accent/40"
                >
                  <span>{item.actionText}</span>
                  <Icon.Arrow className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-5 pt-3.5 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-xs font-mono text-ink-faint">
        <span>7-Day Lookahead Engine</span>
        <span className="text-rose-500 font-semibold">Live Monitoring</span>
      </div>
    </div>
  );
}
