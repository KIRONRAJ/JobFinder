import type { Application, AssessmentItem } from '../types';

export interface WeeklyDigestEvent {
  at: number;
  label: string;
}

export interface WeeklyDigestCompany {
  entryId: string;
  company: string;
  role: string;
  events: WeeklyDigestEvent[];
}

export interface WeeklyDigestGap {
  skill: string;
  count: number;
  companies: string[];
}

export interface WeeklyDigest {
  weekStart: number;
  weekEnd: number;
  companies: WeeklyDigestCompany[];
  recurringGaps: WeeklyDigestGap[];
}

const WEEK_MS = 7 * 86_400_000;

/**
 * Zero-LLM, mechanical rollup of the last 7 days' interview activity —
 * "which companies did I talk to this week, and what's recurring across
 * them." Same idea as career-ops' weekly-digest.mjs: front-matter/field
 * parsing and tag counting only, no judgement calls. Computed entirely from
 * data already in applications.json + assessments.json, nothing new to log.
 */
export function computeWeeklyDigest(
  apps: Application[],
  assessments: AssessmentItem[],
  now = Date.now()
): WeeklyDigest {
  const weekStart = now - WEEK_MS;
  const companies: WeeklyDigestCompany[] = [];
  const gapCounts = new Map<string, { count: number; companies: Set<string> }>();

  for (const a of apps) {
    const events: WeeklyDigestEvent[] = [];

    for (const h of a.statusHistory ?? []) {
      if (h.at < weekStart || h.at > now) continue;
      if (h.status === 'interview') events.push({ at: h.at, label: 'Moved to interview' });
      else if (h.status === 'offer') events.push({ at: h.at, label: 'Offer received' });
      else if (h.status === 'rejected') events.push({ at: h.at, label: 'Rejected' });
    }

    if (a.interview?.when) {
      const when = new Date(a.interview.when).getTime();
      if (!Number.isNaN(when) && when >= weekStart && when <= now) {
        events.push({ at: when, label: `Interview (${a.interview.medium ?? 'held'})` });
      }
    }

    for (const item of assessments) {
      if (item.entryId !== a.id || !item.archivedAt) continue;
      const at = new Date(item.archivedAt).getTime();
      if (Number.isNaN(at) || at < weekStart || at > now) continue;
      events.push({ at, label: `Assessment completed: ${item.title}` });
    }

    if (events.length === 0) continue;
    events.sort((x, y) => x.at - y.at);
    companies.push({ entryId: a.id, company: a.company, role: a.role, events });

    for (const [skill, item] of Object.entries(a.evidenceMap ?? {})) {
      if (item.state !== 'learning-gap') continue;
      const rec = gapCounts.get(skill) ?? { count: 0, companies: new Set<string>() };
      rec.count++;
      rec.companies.add(a.company);
      gapCounts.set(skill, rec);
    }
  }

  companies.sort((x, y) => y.events[y.events.length - 1].at - x.events[x.events.length - 1].at);

  const recurringGaps: WeeklyDigestGap[] = Array.from(gapCounts.entries())
    .filter(([, v]) => v.count >= 2)
    .map(([skill, v]) => ({ skill, count: v.count, companies: Array.from(v.companies) }))
    .sort((x, y) => y.count - x.count);

  return { weekStart, weekEnd: now, companies, recurringGaps };
}
