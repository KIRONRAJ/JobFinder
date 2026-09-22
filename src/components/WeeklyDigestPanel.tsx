import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { api } from '../api';
import { computeWeeklyDigest } from '../lib/weeklyDigest';
import type { Application, AssessmentItem } from '../types';

interface Props {
  apps: Application[];
}

/**
 * Zero-LLM weekly rollup of interview-stage activity — computed entirely
 * client-side from data already loaded, nothing for Claude to draft. Hidden
 * entirely when the week was quiet, same as the other on-demand panels.
 */
export function WeeklyDigestPanel({ apps }: Props) {
  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);

  useEffect(() => {
    let alive = true;
    api.assessments
      .get()
      .then((store) => alive && setAssessments(store.items))
      .catch(() => alive && setAssessments([]));
    return () => {
      alive = false;
    };
  }, []);

  const digest = computeWeeklyDigest(apps, assessments);

  if (digest.companies.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-line bg-panel p-5">
      <header className="mb-3 flex items-center gap-2 text-micro font-medium uppercase tracking-wide text-ink-soft">
        <Icon.Calendar className="h-3.5 w-3.5 text-accent" />
        This week's interview activity
      </header>

      <ul className="space-y-3">
        {digest.companies.map((c) => (
          <li key={c.entryId} className="rounded-xl border border-line-soft bg-panel-2/50 px-3.5 py-3">
            <p className="text-meta font-medium text-ink">
              {c.company} <span className="font-normal text-ink-faint">· {c.role}</span>
            </p>
            <ul className="mt-1.5 space-y-1">
              {c.events.map((e, i) => (
                <li key={i} className="flex gap-2 text-micro text-ink-soft">
                  <span className="text-ink-faint">
                    {new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                  {e.label}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {digest.recurringGaps.length > 0 && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <p className="mb-1.5 text-micro font-medium text-ink-soft">Recurring gaps this week</p>
          <ul className="space-y-1">
            {digest.recurringGaps.map((g) => (
              <li key={g.skill} className="text-micro text-ink-soft">
                <span className="text-rose">{g.skill}</span> — flagged across{' '}
                {g.companies.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
