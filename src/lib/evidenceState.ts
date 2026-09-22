import type { Application, EvidenceMap, EvidenceState } from '../types';
import { asList } from './asList';

/**
 * Auto-derives an evidence map from an entry's stored `analysis.ats` when no
 * hand-refined map exists yet. This is the fallback the UI reads via
 * `resolveEvidenceMap()` — Claude's job is to *refine* it (attach a `source`,
 * fix wrong states) via the jobhq skill.
 *
 * The 1:1 bucket→state mapping is deliberate: the ATS analysis already puts
 * each keyword in the right category, so re-classifying here would just add
 * a second place to keep in sync.
 */
export function deriveEvidenceMap(app: Application): EvidenceMap {
  const out: EvidenceMap = {};
  const ats = app.analysis?.ats;
  if (!ats) return out;

  // asList, not `?? []` — these are AI-authored and a string here would iterate
  // its own characters, filling the map with single letters instead of crashing.
  for (const k of asList(ats.matched)) out[k] = { state: 'verified' };
  for (const k of asList(ats.toEvidence)) out[k] = { state: 'needs-wording' };
  for (const k of asList(ats.missing)) out[k] = { state: 'learning-gap' };
  for (const k of asList(ats.unsupported)) out[k] = { state: 'do-not-claim' };
  return out;
}

/**
 * Prefer the hand-refined map when present, fall back to the auto-derived one.
 * Merging isn't useful here — a refined map is a superset by construction.
 */
export function resolveEvidenceMap(app: Application): EvidenceMap {
  if (app.evidenceMap && Object.keys(app.evidenceMap).length > 0) return app.evidenceMap;
  return deriveEvidenceMap(app);
}

export function countByState(map: EvidenceMap): Record<EvidenceState, number> {
  const counts: Record<EvidenceState, number> = {
    verified: 0,
    'needs-wording': 0,
    'learning-gap': 0,
    'do-not-claim': 0,
  };
  for (const item of Object.values(map)) counts[item.state]++;
  return counts;
}
