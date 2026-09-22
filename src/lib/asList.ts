/**
 * Coerces an AI-authored "list" field into an actual list.
 *
 * Everything under an entry's `analysis` is written by an assistant straight
 * into applications.json, never through the API — so nothing validates it on
 * the way in, and the `string[]` in our types is a promise about data we don't
 * control, erased by the time anything reads it. A bare string where a list
 * belongs has now broken the UI twice: `gap.learningTasks` on 4 Sep 2026, and
 * `gap.theyWant`/`gap.youHave` on 11 Sep, both with "x.map is not a function"
 * taking out the whole role page.
 *
 * Guarding one read site at a time is what let the second one through, so both
 * readers of this data route through here instead: AnalysisPanel (which would
 * crash) and lib/evidenceState (which would quietly iterate a string's
 * *characters* and write 180 single-letter keywords into the evidence map — the
 * same bug with a much worse failure mode, because nobody notices).
 *
 * A stray string is wrapped rather than dropped: it's real content that's
 * merely mis-shaped, and one wrong-looking bullet beats silently losing it.
 *
 * `scripts/check-data.mjs` is the other half — it fails on a bad shape so the
 * file gets repaired rather than carrying it forever behind this coercion.
 */
export function asList<T>(value: T[] | T | undefined | null): T[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}
