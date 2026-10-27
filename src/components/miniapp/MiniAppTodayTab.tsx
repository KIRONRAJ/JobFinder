import { useMemo } from 'react';
import type { Application } from '../../types';
import { Icon } from '../Icons';
import { tgHaptic } from '../../lib/telegramWebapp';

interface Props {
  apps: Application[];
  onOpenFollowUp: (app: Application) => void;
  onOpenPreview: (app: Application) => void;
  onAdvanceStatus: (app: Application) => void;
}

export function MiniAppTodayTab({
  apps,
  onOpenFollowUp,
  onOpenPreview,
  onAdvanceStatus,
}: Props) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Deadlines closing in the next 7 days
  const closingSoon = useMemo(() => {
    const now = new Date();
    const limit = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return apps
      .filter((a) => {
        if (!a.deadline || a.status === 'rejected' || a.status === 'withdrawn' || a.status === 'skipped') return false;
        try {
          const d = new Date(a.deadline);
          return d >= new Date(now.toISOString().slice(0, 10)) && d <= limit;
        } catch {
          return false;
        }
      })
      .sort((a, b) => (a.deadline! > b.deadline! ? 1 : -1));
  }, [apps]);

  // Follow-ups due today or overdue
  const followUpsDue = useMemo(() => {
    return apps
      .filter((a) => {
        if (!a.followUpDue || a.status === 'rejected' || a.status === 'withdrawn' || a.status === 'skipped') return false;
        return a.followUpDue <= todayStr;
      })
      .sort((a, b) => (a.followUpDue! > b.followUpDue! ? 1 : -1));
  }, [apps, todayStr]);

  // Active interviews
  const activeInterviews = useMemo(() => {
    return apps.filter((a) => a.status === 'interview');
  }, [apps]);

  // Tasks due
  const pendingTasks = useMemo(() => {
    const list: { app: Application; task: string; id: string }[] = [];
    for (const a of apps) {
      if (a.status === 'rejected' || a.status === 'withdrawn' || a.status === 'skipped') continue;
      if (Array.isArray(a.tasks)) {
        for (const t of a.tasks) {
          if (!t.completedAt) {
            list.push({ app: a, task: t.label, id: t.id });
          }
        }
      }
    }
    return list;
  }, [apps]);

  const isEmpty =
    closingSoon.length === 0 &&
    followUpsDue.length === 0 &&
    activeInterviews.length === 0 &&
    pendingTasks.length === 0;

  if (isEmpty) {
    return (
      <div className="text-center py-20 px-6 rounded-2xl border border-line bg-panel p-6 shadow-hardXs">
        <div className="text-3xl mb-3">☀️</div>
        <h3 className="text-sm font-bold text-ink">All Clear For Today</h3>
        <p className="text-xs text-ink-soft mt-1.5 max-w-xs mx-auto leading-relaxed">
          No urgent closing deadlines or overdue follow-ups due right now. You can focus on interview
          practice or researching new leads.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Active Interviews Section */}
      {activeInterviews.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-ink uppercase tracking-wider px-1">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Active Interview Pipeline ({activeInterviews.length})</span>
          </div>
          <div className="space-y-2.5">
            {activeInterviews.map((app) => (
              <div
                key={app.id}
                className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 shadow-hardXs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-ink">{app.company}</h4>
                    <p className="text-xs text-ink-soft mt-0.5">{app.role}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-hardXs">
                    Interviewing
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2 pt-2 border-t border-emerald-500/20">
                  <button
                    onClick={() => {
                      tgHaptic.impact('light');
                      onOpenPreview(app);
                    }}
                    className="flex-1 py-1.5 px-2.5 text-xs font-semibold rounded-lg bg-panel border border-line text-ink hover:border-emerald-500 transition text-center"
                  >
                    📄 View Dossier
                  </button>
                  <button
                    onClick={() => {
                      tgHaptic.impact('light');
                      onOpenFollowUp(app);
                    }}
                    className="flex-1 py-1.5 px-2.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white shadow-hardXs hover:opacity-90 transition text-center"
                  >
                    💬 Follow-up
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. Deadlines Closing This Week */}
      {closingSoon.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500 uppercase tracking-wider px-1">
            <Icon.Clock className="h-3.5 w-3.5" />
            <span>Deadlines Closing This Week ({closingSoon.length})</span>
          </div>
          <div className="space-y-2.5">
            {closingSoon.map((app) => {
              const daysLeft = Math.ceil(
                (new Date(app.deadline!).getTime() - new Date(todayStr).getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              return (
                <div
                  key={app.id}
                  className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 shadow-hardXs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-ink">{app.company}</h4>
                      <p className="text-xs text-ink-soft mt-0.5">{app.role}</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                      {daysLeft === 0 ? 'Closes Today' : `${daysLeft}d left`}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-ink-soft">
                    <span>Deadline: {app.deadline}</span>
                    <button
                      onClick={() => {
                        tgHaptic.impact('medium');
                        onAdvanceStatus(app);
                      }}
                      className="text-xs font-semibold text-accent hover:underline"
                    >
                      Advance Stage &rarr;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Follow-Ups Due */}
      {followUpsDue.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-sky-500 uppercase tracking-wider px-1">
            <Icon.Mail className="h-3.5 w-3.5" />
            <span>Follow-Ups Due ({followUpsDue.length})</span>
          </div>
          <div className="space-y-2.5">
            {followUpsDue.map((app) => (
              <div
                key={app.id}
                className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-3.5 shadow-hardXs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-ink">{app.company}</h4>
                    <p className="text-xs text-ink-soft mt-0.5">{app.role}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-500/20 text-sky-600 dark:text-sky-400">
                    Due: {app.followUpDue}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-sky-500/20">
                  <span className="text-[11px] text-ink-soft">
                    Contact: {app.contactName || 'Hiring Team'}
                  </span>
                  <button
                    onClick={() => {
                      tgHaptic.impact('medium');
                      onOpenFollowUp(app);
                    }}
                    className="flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-lg bg-sky-600 text-white shadow-hardXs hover:opacity-90 transition"
                  >
                    <span>Draft Email</span>
                    <Icon.Arrow className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Action Tasks */}
      {pendingTasks.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-ink uppercase tracking-wider px-1">
            <Icon.Check className="h-3.5 w-3.5" />
            <span>Actionable Items ({pendingTasks.length})</span>
          </div>
          <div className="rounded-2xl border border-line bg-panel divide-y divide-line shadow-hardXs overflow-hidden">
            {pendingTasks.slice(0, 8).map((item) => (
              <div key={item.id} className="p-3 flex items-start gap-2.5">
                <span className="mt-0.5 text-accent">📌</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ink leading-snug">{item.task}</p>
                  <p className="text-[10px] text-ink-soft mt-0.5">
                    {item.app.company} — {item.app.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
