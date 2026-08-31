import type { Application } from '../types';
import { daysUntil, daysSinceInterviewSignal, INTERVIEW_SILENCE_COURTESY_DAYS } from '../types';

export interface PriorityPick {
  id: string;
  score: number;
  reason: string;
  action: 'apply' | 'follow-up' | 'improve' | 'prepare';
}

/**
 * A rough readiness estimate from the JSON alone — mirrors
 * `estimateReadiness()` in server/index.js exactly (same fields, same
 * thresholds), so the client-side fallback below produces the same numbers
 * the server's `/api/priorities/auto-pick` would. The more accurate
 * `computeReadiness()` in `lib/readiness.ts` needs `FolderStatus`, which
 * isn't available everywhere this runs.
 */
function estimateReadiness(entry: Application): number {
  let done = 0;
  const total = 5;
  if (entry.cvStatus === 'drafted' || entry.cvStatus === 'sent') done++;
  if (entry.contactEmail || entry.contactName) done++;
  if (entry.source) done++;
  const matched = entry.analysis?.ats?.matched?.length ?? 0;
  if (matched >= 3) done++;
  const unsupported = entry.analysis?.ats?.unsupported?.length ?? 0;
  if (unsupported === 0) done++;
  return Math.round((done / total) * 100);
}

/**
 * Deterministic priority picks — the same rules as server-side
 * `pickPriorities()`, ported here so the homepage's "needs attention" strip
 * never has to be empty. This is a **display-only** computation: unlike the
 * server function, it never writes `priority` back onto an entry. Hitting
 * "Auto-pick" in the UI still calls the real endpoint if Kironraj wants these
 * persisted (visible elsewhere, e.g. the Agenda) — this just means the
 * homepage doesn't need that click to stop being an empty prompt box.
 */
export function pickPriorities(list: Application[]): PriorityPick[] {
  const now = Date.now();
  const candidates: PriorityPick[] = [];

  for (const a of list) {
    // 1. Interview within 72h — prepare.
    if (a.status === 'interview' && a.interview?.when) {
      const when = new Date(a.interview.when).getTime();
      const hoursOff = (when - now) / 3_600_000;
      if (hoursOff > 0 && hoursOff <= 72) {
        candidates.push({
          id: a.id,
          score: 1000 - hoursOff,
          reason:
            hoursOff < 24
              ? `Interview in ${Math.max(1, Math.round(hoursOff))}h`
              : `Interview in ${Math.round(hoursOff / 24)}d`,
          action: 'prepare',
        });
      }
    }

    // 2. Applied, follow-up due today or overdue.
    if (a.status === 'applied' && a.followUpDue) {
      const d = daysUntil(a.followUpDue);
      if (d !== null && d <= 0) {
        candidates.push({
          id: a.id,
          score: 800 + Math.min(-d, 30),
          reason: d < 0 ? `Follow-up overdue by ${-d}d` : 'Follow-up due today',
          action: 'follow-up',
        });
      }
    }

    // 3. Researching + deadline within 5 days.
    if (a.status === 'researching' && a.deadline) {
      const d = daysUntil(a.deadline);
      if (d !== null && d >= 0 && d <= 5) {
        const readiness = estimateReadiness(a);
        candidates.push({
          id: a.id,
          score: 900 - d * 10 + (readiness >= 60 ? 20 : 0),
          reason:
            readiness >= 60
              ? `Closes ${d === 0 ? 'today' : `in ${d}d`} · ${readiness}% ready to apply`
              : `Closes ${d === 0 ? 'today' : `in ${d}d`} · only ${readiness}% ready`,
          action: readiness >= 60 ? 'apply' : 'improve',
        });
      }
    }

    // 4. Researching, no deadline — strong/good fit but weak readiness.
    if (a.status === 'researching' && !a.deadline) {
      const readiness = estimateReadiness(a);
      if (readiness < 60 && (a.fit === 'strong' || a.fit === 'good')) {
        candidates.push({
          id: a.id,
          score: 400 + (a.fit === 'strong' ? 40 : 20) - readiness,
          reason: `${a.fit === 'strong' ? 'Strong' : 'Good'} fit · only ${readiness}% ready`,
          action: 'improve',
        });
      }
    }

    // 5. Interview, gone quiet — no update since the last interview signal.
    if (a.status === 'interview') {
      const days = daysSinceInterviewSignal(a);
      if (days !== null && days >= INTERVIEW_SILENCE_COURTESY_DAYS) {
        candidates.push({
          id: a.id,
          score: 500 + Math.min(days - INTERVIEW_SILENCE_COURTESY_DAYS, 60),
          reason: `No update in ${days}d since interview — worth a follow-up`,
          action: 'follow-up',
        });
      }
    }
  }

  const byId = new Map<string, PriorityPick>();
  for (const c of candidates) {
    const prev = byId.get(c.id);
    if (!prev || c.score > prev.score) byId.set(c.id, c);
  }

  return Array.from(byId.values())
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);
}
