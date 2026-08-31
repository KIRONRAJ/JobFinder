import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { api } from '../api';
import type { UpskillReport } from '../types';

/**
 * First client for `/api/upskill-report` — Claude writes this file during
 * `/eod` (aggregated `learningTasks` across every application, ranked by
 * recurrence) and nothing in the app ever read it back. Same fetch-on-mount,
 * render-nothing-if-absent shape as LearningLoopReportPanel, since both
 * answer the same underlying question: what should Kironraj go learn.
 */
export function UpskillReportPanel() {
  const [report, setReport] = useState<UpskillReport | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    api
      .upskillReport()
      .then((r) => alive && setReport(r))
      .catch(() => alive && setReport(null));
    return () => {
      alive = false;
    };
  }, []);

  if (!report) return null;

  const generated = new Date(report.generatedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <section className="mb-6 rounded-2xl border border-line bg-panel p-5">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-micro font-medium uppercase tracking-wide text-ink-soft">
          <Icon.GradCap className="h-3.5 w-3.5 text-accent" />
          Upskill report
        </div>
        <span className="text-label text-ink-faint">Generated {generated}</span>
      </header>

      <p className="text-meta leading-relaxed text-ink">{report.headline}</p>

      {report.recurringGaps.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {report.recurringGaps.map((g) => (
            <li
              key={g.skill}
              className="rounded-xl border border-line-soft bg-panel-2/50 px-3.5 py-3"
            >
              <p className="flex items-baseline justify-between gap-2 text-meta font-medium text-ink">
                {g.skill}
                <span className="shrink-0 text-micro font-normal text-ink-faint">
                  {g.count} {g.count === 1 ? 'role' : 'roles'}
                </span>
              </p>
              <p className="mt-1 text-micro text-ink-soft">{g.roles.join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}

      {report.recommendations.length > 0 && (
        <div className="mt-4 border-t border-line-soft pt-3.5">
          <p className="mb-2 text-label font-medium uppercase tracking-wide text-ink-faint">
            Recommendations
          </p>
          <ul className="space-y-1.5">
            {report.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-micro text-ink-soft">
                <Icon.Check className="mt-1 h-3 w-3 shrink-0 text-accent" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
