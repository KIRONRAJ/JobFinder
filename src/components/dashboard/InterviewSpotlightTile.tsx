import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { useSpotlight } from './useSpotlight';
import { daysUntil, type Application } from '../../types';

interface Props {
  apps: Application[];
  onOpenApp: (app: Application) => void;
  onOpenFolder?: (app: Application) => void;
}

export function InterviewSpotlightTile({ apps, onOpenApp, onOpenFolder }: Props) {
  const { onMouseMove } = useSpotlight();

  // Find the soonest scheduled interview
  const activeInterviewApp = useMemo(() => {
    const interviewApps = apps.filter((a) => a.status === 'interview');
    if (interviewApps.length === 0) return null;

    return interviewApps.sort((a, b) => {
      const ta = a.interview?.when ? new Date(a.interview.when).getTime() : a.updated ?? 0;
      const tb = b.interview?.when ? new Date(b.interview.when).getTime() : b.updated ?? 0;
      return ta - tb;
    })[0];
  }, [apps]);

  // If no interview, find top target opportunity
  const targetOpportunity = useMemo(() => {
    if (activeInterviewApp) return null;
    const pending = apps.filter(
      (a) => a.status === 'researching' || (a.status === 'applied' && a.progressing)
    );
    if (pending.length === 0) return apps[0] ?? null;

    return pending.sort((a, b) => {
      const da = a.deadline ? daysUntil(a.deadline) ?? 999 : 999;
      const db = b.deadline ? daysUntil(b.deadline) ?? 999 : 999;
      return da - db;
    })[0];
  }, [apps, activeInterviewApp]);

  // Find interview time from interview.when, or from interview task, or nextActionDue
  const scheduledTime = useMemo(() => {
    if (!activeInterviewApp) return null;
    if (activeInterviewApp.interview?.when) return activeInterviewApp.interview.when;
    const task = activeInterviewApp.tasks?.find(
      (t) =>
        !t.completedAt &&
        (t.label.toLowerCase().includes('interview') ||
          t.label.toLowerCase().includes('assessment centre'))
    );
    if (task?.dueAt) return task.dueAt;
    if (activeInterviewApp.nextActionDue) return `${activeInterviewApp.nextActionDue}T09:25:00+12:00`;
    return null;
  }, [activeInterviewApp]);

  // Live countdown clock state
  const [countdown, setCountdown] = useState<{ d: number; h: number; m: number; s: number } | null>(
    null
  );

  useEffect(() => {
    if (!scheduledTime) {
      setCountdown(null);
      return;
    }

    const targetTime = new Date(scheduledTime).getTime();

    const update = () => {
      const now = Date.now();
      const diff = targetTime - now;
      if (diff <= 0) {
        setCountdown({ d: 0, h: 0, m: 0, s: 0 });
        return;
      }
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);
      setCountdown({ d, h, m, s });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [scheduledTime]);

  return (
    <div
      onMouseMove={onMouseMove}
      className={`studio-tile md:col-span-12 lg:col-span-6 p-7 flex flex-col justify-between ${
        activeInterviewApp
          ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/[0.04] to-transparent'
          : ''
      }`}
    >
      <div className="studio-spotlight" />

      {activeInterviewApp ? (
        // Interview Spotlight Active
        <div>
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
              <span className="text-xs font-mono font-bold tracking-widest text-amber-600 dark:text-amber-400 uppercase">
                04 — INTERVIEW WAR ROOM
              </span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-0.5 text-xs font-mono font-bold uppercase text-amber-600 dark:text-amber-400">
              {activeInterviewApp.interview?.medium || 'Stage In Progress'}
            </span>
          </div>

          <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h4 className="text-2xl font-bold text-ink tracking-tight font-sans">
                {activeInterviewApp.company}
              </h4>
              <p className="text-sm font-medium text-ink-soft">
                {activeInterviewApp.role}
              </p>
            </div>

            {scheduledTime && (
              <div className="text-right font-mono">
                <span className="text-[11px] text-ink-faint uppercase">Scheduled For</span>
                <p className="text-xs font-bold text-ink">
                  {new Date(scheduledTime).toLocaleDateString('en-NZ', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            )}
          </div>

          {/* Live countdown timer display */}
          {countdown && (
            <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
                <Icon.Clock className="h-3.5 w-3.5" />
                <span>T-Minus Countdown</span>
              </div>
              <div className="grid grid-cols-4 gap-2.5 text-center font-mono">
                <div className="rounded-xl bg-panel/90 border border-black/[0.05] dark:border-white/[0.07] p-2.5 shadow-sm">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{countdown.d}</div>
                  <div className="text-[10px] text-ink-faint uppercase mt-0.5">Days</div>
                </div>
                <div className="rounded-xl bg-panel/90 border border-black/[0.05] dark:border-white/[0.07] p-2.5 shadow-sm">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {String(countdown.h).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] text-ink-faint uppercase mt-0.5">Hours</div>
                </div>
                <div className="rounded-xl bg-panel/90 border border-black/[0.05] dark:border-white/[0.07] p-2.5 shadow-sm">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {String(countdown.m).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] text-ink-faint uppercase mt-0.5">Mins</div>
                </div>
                <div className="rounded-xl bg-panel/90 border border-black/[0.05] dark:border-white/[0.07] p-2.5 shadow-sm">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 animate-pulse">
                    {String(countdown.s).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] text-ink-faint uppercase mt-0.5">Secs</div>
                </div>
              </div>
            </div>
          )}

          {/* Quick action buttons */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenApp(activeInterviewApp)}
              className="inline-flex items-center gap-2 rounded-full bg-amber-400 hover:bg-amber-300 dark:bg-amber-500 dark:hover:bg-amber-400 px-4 py-2 text-xs font-mono font-bold text-neutral-950 dark:text-neutral-950 shadow-[0_4px_14px_rgba(245,158,11,0.35)] hover:-translate-y-0.5 transition-all"
            >
              <Icon.Sparkles className="h-3.5 w-3.5 text-neutral-950" />
              <span>Interview War Room</span>
            </button>

            {activeInterviewApp.folderPath && onOpenFolder && (
              <button
                type="button"
                onClick={() => onOpenFolder(activeInterviewApp)}
                className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-panel px-4 py-2 text-xs font-mono text-ink-soft hover:text-ink hover:border-black/[0.2] transition-colors"
              >
                <Icon.Folder className="h-3.5 w-3.5 text-ink-soft" />
                <span>Open Folder</span>
              </button>
            )}
          </div>
        </div>
      ) : targetOpportunity ? (
        // Target Role Spotlight Fallback
        <div>
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-widest text-blue-500 uppercase">
                04 — TARGET OPPORTUNITY
              </span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-0.5 text-xs font-mono font-bold uppercase text-blue-600 dark:text-blue-400">
              High Priority
            </span>
          </div>

          <div className="mt-5">
            <h4 className="text-2xl font-bold text-ink tracking-tight font-sans">
              {targetOpportunity.company}
            </h4>
            <p className="text-sm font-medium text-ink-soft mt-0.5">
              {targetOpportunity.role}
            </p>
            {targetOpportunity.deadline && (
              <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-semibold">
                <Icon.Clock className="h-3.5 w-3.5" />
                <span>Closing Date: {targetOpportunity.deadline}</span>
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenApp(targetOpportunity)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-mono font-bold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:brightness-110 hover:-translate-y-0.5 transition-all"
            >
              <Icon.Sparkles className="h-3.5 w-3.5" />
              <span>Prepare Application</span>
            </button>
          </div>
        </div>
      ) : (
        <div>
          <span className="text-xs font-mono font-bold tracking-widest text-ink-faint uppercase">
            04 — TARGET SPOTLIGHT
          </span>
          <p className="mt-3 text-xs text-ink-soft">No active roles in tracking.</p>
        </div>
      )}

      <div className="mt-5 pt-3.5 border-t border-black/[0.06] dark:border-white/[0.08] text-xs font-mono text-ink-faint flex items-center justify-between">
        <span>Tactical focus milestone</span>
        <span className="font-semibold text-amber-500">Active Stage</span>
      </div>
    </div>
  );
}
