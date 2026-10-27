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
    <section className="mb-6 rounded-md border-2 border-line bg-panel p-5 shadow-hardSm">
      <header className="mb-3 flex items-center justify-between border-b border-line-soft pb-2.5">
        <div className="flex items-center gap-2 text-micro font-bold uppercase tracking-wider text-ink-soft">
          <Icon.GradCap className="h-3.5 w-3.5 text-accent" />
          <span>Upskill Recommendations</span>
        </div>
        <span className="text-micro font-mono text-ink-faint">Updated {generated}</span>
      </header>

      <p className="text-meta leading-relaxed text-ink font-medium">{report.headline}</p>

      {report.recurringGaps.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {report.recurringGaps.map((g) => (
            <div
              key={g.skill}
              className="rounded-md border border-line bg-panel-2/40 p-3.5 shadow-hardXs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-meta font-bold text-ink">{g.skill}</span>
                  <span className="rounded border border-line bg-panel px-1.5 py-0.5 text-micro font-mono font-semibold text-accent shadow-hardXs">
                    {g.count} {g.count === 1 ? 'role' : 'roles'}
                  </span>
                </div>
                <p className="mt-1.5 text-micro text-ink-soft">{g.roles.join(' · ')}</p>
              </div>
            </div>
          ))}
        </div>
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
