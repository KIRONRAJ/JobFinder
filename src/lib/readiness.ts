import type { Application, FolderStatus } from '../types';
import { daysSince } from '../types';
import { deriveEvidenceMap, countByState } from './evidenceState';

export interface ReadinessCheck {
  key: string;
  done: boolean;
  label: string;
}

export interface Readiness {
  score: number;
  breakdown: ReadinessCheck[];
}

export type ReadinessTone = 'grass' | 'accent' | 'amber' | 'rose';

/**
 * `cvStatus: 'queued'` is set the instant a request is made, but flipping it
 * to 'drafted' depends on Claude editing applications.json directly outside
 * the API (see the MCP-server/audit-log write-path notes) — if that step is
 * skipped, races another writer, or just hasn't landed yet, cvStatus can get
 * stuck at 'queued' forever even though the CV/cover letter genuinely exist.
 * Real files on disk (folder-status, already deterministic — see
 * `/api/folder-status`) always win over a field an AI run might have missed.
 */
export function isCvActuallyQueued(app: Application, folder?: FolderStatus): boolean {
  if (app.cvStatus !== 'queued') return false;
  return !(folder?.cv && folder?.coverLetter);
}

/** The done-side mirror of `isCvActuallyQueued` — a stuck 'queued' cvStatus
 *  must not also hide the fact that both files already exist, or the UI
 *  offers to generate from scratch instead of showing what's already there. */
export function isCvActuallyDone(app: Application, folder?: FolderStatus): boolean {
  if (app.cvStatus === 'drafted' || app.cvStatus === 'sent') return true;
  return Boolean(folder?.cv && folder?.coverLetter);
}

/** The score→hue step, defined once here next to the function that produces
 *  the score. It used to be re-derived independently in two components, which
 *  is how they drifted into two different bar geometries. */
export function readinessTone(score: number): ReadinessTone {
  if (score >= 80) return 'grass';
  if (score >= 50) return 'accent';
  if (score >= 25) return 'amber';
  return 'rose';
}

/**
 * Deterministic readiness score. Pure `f(entry, folder)` — no LLM, no I/O.
 * A checklist rolled up to 0–100 so the UI can render both a headline number
 * and the list of what's still missing. Always fresh, but only ever as smart
 * as the last `analysis` Claude ran on the entry.
 *
 * The weighting is deliberately flat (one point per check that applies) rather
 * than trying to encode a nuanced model — the score's job is to point at what
 * to fix next, not to be a prediction.
 */
export function computeReadiness(app: Application, folder?: FolderStatus): Readiness {
  const checks: ReadinessCheck[] = [];

  // Only graded when the caller actually knows the folder state. Scoring a
  // missing `folder` as two failed checks made every caller that didn't have
  // it — EvidenceView, notably — report a systematically lower score than a
  // card did for the same entry. Not applicable is not the same as not done.
  if (folder) {
    checks.push({ key: 'cv', done: Boolean(folder.cv), label: 'CV drafted' });
    checks.push({
      key: 'cover',
      done: Boolean(folder.coverLetter),
      label: 'Cover letter drafted',
    });
  }

  // Source is a proxy for "we actually read the ad" — a role logged from a
  // pasted URL almost always has one, and its absence usually means a hand
  // entry that hasn't been fleshed out yet.
  checks.push({ key: 'source', done: Boolean(app.source), label: 'Source captured' });
  checks.push({
    key: 'contact',
    done: Boolean(app.contactName || app.contactEmail),
    label: 'Contact captured',
  });

  const map = app.evidenceMap ?? deriveEvidenceMap(app);
  const counts = countByState(map);
  const trackedKeywords = counts.verified + counts['needs-wording'] + counts['learning-gap'];
  const hasAnalysis = trackedKeywords > 0 || counts['do-not-claim'] > 0;

  // Only demand keyword coverage once there's actually an analysis to grade
  // against — an entry Claude hasn't looked at yet shouldn't be penalised
  // for it, just told that the check is pending.
  if (hasAnalysis) {
    const enoughMatched = trackedKeywords > 0 && counts.verified / Math.max(trackedKeywords, 1) >= 0.5;
    checks.push({
      key: 'ats-coverage',
      done: enoughMatched,
      label: `≥50% ATS keywords matched (${counts.verified}/${trackedKeywords})`,
    });
    checks.push({
      key: 'no-unsupported',
      done: counts['do-not-claim'] === 0,
      label:
        counts['do-not-claim'] === 0
          ? 'No unsupported claims'
          : `${counts['do-not-claim']} unsupported claim(s) to remove`,
    });
  } else {
    checks.push({ key: 'analysis', done: false, label: 'ATS analysis pending' });
  }

  // Added 20 Aug 2026 — a submission went out missing a mandatory video the
  // ad required beyond the CV/cover letter, while this meter still read
  // 100%. Any unmet `submissionRequirements` item now caps the score instead
  // of the meter silently ignoring what it doesn't model.
  const unmetRequirements = app.analysis?.submissionRequirements?.filter((r) => !r.done) ?? [];
  if (unmetRequirements.length > 0) {
    checks.push({
      key: 'submission-requirements',
      done: false,
      label: `${unmetRequirements.length} extra requirement(s) not yet done: ${unmetRequirements.map((r) => r.label).join('; ')}`,
    });
  }

  // Only demand these once the ad is close to actionable — no point flagging
  // a "no follow-up date set" against a role you haven't decided on yet.
  if (app.status === 'applied') {
    checks.push({
      key: 'follow-up',
      done: Boolean(app.followUpDue),
      label: 'Follow-up date set',
    });
    checks.push({
      key: 'applied-date',
      done: Boolean(app.date) && daysSince(app.date) !== null,
      label: 'Application date logged',
    });
  }

  const done = checks.filter((c) => c.done).length;
  const score = checks.length === 0 ? 0 : Math.round((done / checks.length) * 100);
  return { score, breakdown: checks };
}
