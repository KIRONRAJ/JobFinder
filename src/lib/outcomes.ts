import type { Application, Fit, RoleType, Source } from '../types';

/**
 * Outcome analytics — the questions AnalyticsView never answered. Every
 * existing chart there describes volume (how many, when). These describe
 * outcome: does this thing I already record (source, fit, ATS score)
 * actually predict a reply or an interview. Pure functions over the same
 * `apps` array the rest of Insights already has in memory — no server
 * round-trip, no new persisted state.
 */

const DAY_MS = 86_400_000;

/** A reply/interview signal: any status move past "applied", or the
 *  `progressing` flag Claude sets for a positive signal that hasn't earned a
 *  status change yet (e.g. psychometric testing). Rejections count as a
 *  reply — silence is the thing being measured, not a good outcome. */
function gotReply(a: Application): boolean {
  if (a.progressing) return true;
  return a.status === 'interview' || a.status === 'offer' || a.status === 'rejected';
}

function gotInterview(a: Application): boolean {
  return a.status === 'interview' || a.status === 'offer';
}

/** Only applications that have actually left "researching" count toward
 *  conversion — an unsent draft can't have a reply rate. */
function isSubmitted(a: Application): boolean {
  return a.status !== 'researching';
}

export interface ConversionRow<K extends string> {
  key: K;
  label: string;
  n: number;
  replyRate: number | null;
  interviewRate: number | null;
}

/** Guards a rate behind a minimum sample size — n=1 at 100% reads as a
 *  signal it isn't. Below the floor the rate is still returned as null so
 *  the UI can show "n=1" instead of a misleading bar. */
const MIN_N = 3;

function conversionRows<K extends string>(
  apps: Application[],
  keyOf: (a: Application) => K | null,
  labelOf: (k: K) => string
): ConversionRow<K>[] {
  const groups = new Map<K, Application[]>();
  for (const a of apps) {
    if (!isSubmitted(a)) continue;
    const k = keyOf(a);
    if (k === null) continue;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(a);
  }
  return Array.from(groups.entries())
    .map(([key, list]) => {
      const n = list.length;
      const replies = list.filter(gotReply).length;
      const interviews = list.filter(gotInterview).length;
      return {
        key,
        label: labelOf(key),
        n,
        replyRate: n >= MIN_N ? replies / n : null,
        interviewRate: n >= MIN_N ? interviews / n : null,
      };
    })
    .sort((a, b) => b.n - a.n);
}

export function conversionBySource(apps: Application[]): ConversionRow<Source>[] {
  return conversionRows(apps, (a) => a.source ?? null, (s) => s);
}

export function conversionByFit(apps: Application[]): ConversionRow<Fit>[] {
  const FIT_LABEL: Record<Fit, string> = { strong: 'Strong fit', good: 'Good fit', stretch: 'Stretch' };
  return conversionRows(apps, (a) => a.fit ?? null, (f) => FIT_LABEL[f]);
}

export function conversionByRoleType(apps: Application[]): ConversionRow<RoleType>[] {
  return conversionRows(apps, (a) => a.type ?? null, (t) => t);
}

/** Buckets on `analysis.score.overall` — the ATS protocol asserts an 80-point
 *  bar is "interview-ready". This is the check on whether that's actually
 *  true for this candidate's own results so far. */
export type AtsBucket = '<70' | '70–79' | '80+';

export function conversionByAtsScore(apps: Application[]): ConversionRow<AtsBucket>[] {
  return conversionRows(
    apps,
    (a) => {
      const score = a.analysis?.score?.overall;
      if (score === undefined) return null;
      if (score < 70) return '<70';
      if (score < 80) return '70–79';
      return '80+';
    },
    (b) => b
  );
}

function computeResponseDays(apps: Application[]): number[] {
  const days: number[] = [];
  for (const a of apps) {
    const hist = a.statusHistory;
    if (!hist || hist.length < 2) continue;
    const appliedIdx = hist.findIndex((h) => h.status === 'applied');
    if (appliedIdx === -1 || appliedIdx === hist.length - 1) continue;
    const diff = hist[appliedIdx + 1].at - hist[appliedIdx].at;
    if (diff >= 0) days.push(diff / DAY_MS);
  }
  return days;
}

/** Days from 'applied' to the next status move — same signal AnalyticsView's
 *  `responseDays` already computes, but returned as the full distribution
 *  (median + p90) instead of collapsed into one mean, which hides spread. */
export function responseTimeStats(apps: Application[]): { median: number; p90: number; n: number } | null {
  const days = computeResponseDays(apps);
  if (days.length === 0) return null;
  days.sort((a, b) => a - b);
  const pick = (p: number) => days[Math.min(days.length - 1, Math.floor(p * days.length))];
  return { median: pick(0.5), p90: pick(0.9), n: days.length };
}

/** Same underlying days-to-first-move data as `responseTimeStats`, bucketed
 *  for a histogram instead of collapsed to median/p90 — shows whether
 *  responses cluster at "same-day auto-filter" or spread out as genuine
 *  review, which a single median hides. */
const RESPONSE_BUCKETS: { label: string; max: number }[] = [
  { label: '0–1d', max: 1 },
  { label: '2–3d', max: 3 },
  { label: '4–7d', max: 7 },
  { label: '8–14d', max: 14 },
  { label: '15d+', max: Infinity },
];

export function responseTimeHistogram(apps: Application[]): { label: string; count: number }[] {
  const days = computeResponseDays(apps);
  return RESPONSE_BUCKETS.map((b, i) => {
    const min = i === 0 ? -1 : RESPONSE_BUCKETS[i - 1].max;
    return { label: b.label, count: days.filter((d) => d > min && d <= b.max).length };
  });
}

/** Applied, quiet past the p90 response window (or 21 days if there isn't
 *  enough data yet for a real p90), never heard back. These sit in `applied`
 *  forever today with nothing marking them as effectively over. */
export function ghostedApplications(apps: Application[]): { apps: Application[]; thresholdDays: number } {
  const stats = responseTimeStats(apps);
  const thresholdDays = stats && stats.n >= MIN_N ? Math.ceil(stats.p90) : 21;
  const now = Date.now();
  const ghosted = apps.filter((a) => {
    if (a.status !== 'applied' || a.progressing) return false;
    if (!a.date) return false;
    const applied = Date.parse(a.date);
    if (Number.isNaN(applied)) return false;
    return (now - applied) / DAY_MS >= thresholdDays;
  });
  return { apps: ghosted, thresholdDays };
}

/** One point per submitted, scored application — score against outcome, so a
 *  scatter can show whether the 80-point "interview-ready" bar actually
 *  predicts a reply for this candidate's own results, not just in the
 *  abstract. `outcome` is a small ordinal (0/1/2) rather than a string so it
 *  plots directly on a numeric Y axis; the label is what the tooltip shows. */
export type ScoreOutcome = 0 | 1 | 2;
export const SCORE_OUTCOME_LABEL: Record<ScoreOutcome, string> = {
  0: 'Rejected',
  1: 'No reply yet',
  2: 'Interview+',
};

export interface ScoreOutcomePoint {
  score: number;
  outcome: ScoreOutcome;
  company: string;
  role: string;
}

export function atsScoreOutcome(apps: Application[]): ScoreOutcomePoint[] {
  const points: ScoreOutcomePoint[] = [];
  for (const a of apps) {
    const score = a.analysis?.score?.overall;
    if (score === undefined || !isSubmitted(a)) continue;
    const outcome: ScoreOutcome = gotInterview(a) ? 2 : a.status === 'rejected' ? 0 : 1;
    points.push({ score, outcome, company: a.company, role: a.role });
  }
  return points;
}

/** Days between logging an entry and actually applying to it — the "did
 *  rushing this one to beat a deadline cost anything" question. Same
 *  ConversionRow shape as the other conversion breakdowns so it drops
 *  straight into <ConversionBars>. */
export type ApplyDelayBucket = 'Same day' | '1–2d' | '3–7d' | '8d+';

export function conversionByApplyDelay(apps: Application[]): ConversionRow<ApplyDelayBucket>[] {
  return conversionRows(
    apps,
    (a) => {
      if (!a.date || !a.created) return null;
      const applied = Date.parse(a.date);
      if (Number.isNaN(applied)) return null;
      const days = Math.max(0, (applied - a.created) / DAY_MS);
      if (days < 1) return 'Same day';
      if (days <= 2) return '1–2d';
      if (days <= 7) return '3–7d';
      return '8d+';
    },
    (b) => b
  );
}

/** Source x fit cross-tab — two existing bar charts collapsed into one grid,
 *  since "which source do I mostly log which fit through" is a question
 *  neither chart alone answers. Counts every logged entry with both fields
 *  set, not just submitted ones — this is about sourcing habits, not
 *  outcomes. */
export function sourceFitMatrix(apps: Application[]): { sources: string[]; fits: Fit[]; counts: Map<string, number> } {
  const fits: Fit[] = ['strong', 'good', 'stretch'];
  const sourceSet = new Set<string>();
  const counts = new Map<string, number>();
  for (const a of apps) {
    if (!a.source || !a.fit) continue;
    sourceSet.add(a.source);
    const key = `${a.source}|${a.fit}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sources = Array.from(sourceSet).sort(
    (x, y) => fits.reduce((s, f) => s + (counts.get(`${y}|${f}`) ?? 0), 0) - fits.reduce((s, f) => s + (counts.get(`${x}|${f}`) ?? 0), 0)
  );
  return { sources, fits, counts };
}
