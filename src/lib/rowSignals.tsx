import { AppliedTag, CvTag, DeadlineTag, EvidenceTag, FollowUpTag, NextActionTag, PriorityTag } from '../components/Badges';
import { resolveEvidenceMap, countByState } from './evidenceState';
import { isCvActuallyQueued } from './readiness';
import { DEADLINE_SOON_DAYS, STALE_APPLIED_DAYS, daysSince, daysUntil } from '../types';
import type { Application, FolderStatus } from '../types';

export type SignalTone = 'blocking' | 'urgent' | 'priority' | 'inflight';

export interface RowSignal {
  key: string;
  weight: number;
  tone: SignalTone;
  render: () => JSX.Element;
}

/** A closed-out entry doesn't owe anything further, regardless of what its
 *  deadline/follow-up fields still say — same rule DeadlineTag already uses. */
const CLOSED_STATUSES: Application['status'][] = ['rejected', 'withdrawn', 'offer'];

/**
 * Ranks what's actually owing on a role, so the row can show the 3 things
 * that matter instead of all 13 fields it might have. One signal per
 * underlying fact (a deadline is either blocking, urgent, or absent from this
 * list — never more than one of those at once), each rendered with the exact
 * chip component the app already uses elsewhere, so a chip means the same
 * thing here as it does on `/role/:id`.
 *
 * Callers filter/cap the result themselves (`AppCard` renders the top 3 and
 * a "+N" for the rest) — this only ranks, it doesn't truncate, so a caller
 * that wants to know the true overflow count still can.
 */
export function rowSignals(app: Application, folder?: FolderStatus): RowSignal[] {
  const signals: RowSignal[] = [];

  // Blocking: CV wording the evidence doesn't back — the one evidence state
  // that's a "fix this before you send it" problem, not just incomplete.
  const evidence = countByState(resolveEvidenceMap(app));
  if (evidence['do-not-claim'] > 0) {
    signals.push({
      key: 'evidence',
      weight: 100,
      tone: 'blocking',
      render: () => <EvidenceTag app={app} />,
    });
  }

  // Deadline: passed is blocking, closing soon is urgent. Never both.
  if (app.deadline && !CLOSED_STATUSES.includes(app.status)) {
    const left = daysUntil(app.deadline);
    if (left !== null && left < 0) {
      signals.push({
        key: 'deadline',
        weight: 100,
        tone: 'blocking',
        render: () => <DeadlineTag app={app} />,
      });
    } else if (left !== null && left <= DEADLINE_SOON_DAYS) {
      signals.push({
        key: 'deadline',
        weight: 90,
        tone: 'urgent',
        render: () => <DeadlineTag app={app} />,
      });
    }
  }

  // Follow-up: overdue is urgent, due today/tomorrow is merely in-flight —
  // worth knowing, not yet something to be alarmed about.
  if (app.followUpDue && app.status === 'applied') {
    const left = daysUntil(app.followUpDue);
    if (left !== null && left < 0) {
      signals.push({
        key: 'followup',
        weight: 90,
        tone: 'urgent',
        render: () => <FollowUpTag app={app} />,
      });
    } else if (left !== null && left <= 1) {
      signals.push({
        key: 'followup',
        weight: 60,
        tone: 'inflight',
        render: () => <FollowUpTag app={app} />,
      });
    }
  }

  // A next action with a date in the past is the same shape of "owed" as an
  // overdue follow-up; one not yet due isn't row-worthy.
  if (app.nextAction && app.nextActionDue) {
    const left = daysUntil(app.nextActionDue);
    if (left !== null && left < 0) {
      signals.push({
        key: 'nextaction',
        weight: 90,
        tone: 'urgent',
        render: () => <NextActionTag app={app} />,
      });
    }
  }

  // Priority: Claude's own pick for today, while it's still live.
  if (app.priority && (!app.priority.expiresAt || app.priority.expiresAt > Date.now())) {
    signals.push({
      key: 'priority',
      weight: 80,
      tone: 'priority',
      render: () => <PriorityTag app={app} />,
    });
  }

  // In-flight: a CV draft in progress. Real files on disk (folder) win over
  // a stale cvStatus — see isCvActuallyQueued.
  if (isCvActuallyQueued(app, folder)) {
    signals.push({
      key: 'cv',
      weight: 60,
      tone: 'inflight',
      render: () => <CvTag cvStatus={app.cvStatus!} />,
    });
  }

  // In-flight: gone quiet since applying, same threshold AppliedTag itself uses.
  if (app.status === 'applied') {
    const days = daysSince(app.date);
    if (days !== null && days >= STALE_APPLIED_DAYS) {
      signals.push({
        key: 'applied',
        weight: 60,
        tone: 'inflight',
        render: () => <AppliedTag app={app} />,
      });
    }
  }

  return signals.filter((s) => s.weight >= 60).sort((a, b) => b.weight - a.weight);
}
