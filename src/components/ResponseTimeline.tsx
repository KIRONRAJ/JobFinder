import { daysSince, daysUntil } from '../types';
import type { Application } from '../types';

/**
 * A compact horizontal strip visualising an entry's timeline: application
 * date → today → follow-up window → closing/interview date. Purely visual,
 * driven by the same helpers the badge chips use — no new date logic here.
 *
 * Rendered inside the expanded card only, so it's fine for it to be a bit
 * dense; it complements the badge chips rather than duplicating them.
 */
export function ResponseTimeline({ app }: { app: Application }) {
  const points: { date?: string; label: string; kind: 'past' | 'today' | 'future' | 'window' }[] = [];

  if (app.date) points.push({ date: app.date, label: 'Applied', kind: 'past' });
  points.push({ label: 'Today', kind: 'today' });
  if (app.followUpDue) points.push({ date: app.followUpDue, label: 'Follow up', kind: 'window' });
  if (app.deadline) points.push({ date: app.deadline, label: 'Closes', kind: 'future' });

  // Nothing meaningful to render if we don't have at least one dated point
  // besides "today".
  if (points.filter((p) => p.date).length === 0) return null;

  // Build a time axis: min = earliest date (or today), max = latest date (or today+14d).
  const now = Date.now();
  const dateMs = (d?: string) => (d ? new Date(`${d}T00:00:00`).getTime() : null);
  const timestamps = points.map((p) => (p.kind === 'today' ? now : dateMs(p.date))).filter((t): t is number => t !== null);
  const min = Math.min(...timestamps, now);
  const max = Math.max(...timestamps, now + 14 * 86_400_000);
  const range = Math.max(max - min, 86_400_000);

  // Two points landing within a few days of each other map to nearly the same
  // `left`, so their labels sit on top of each other and render as garbled
  // overlapping text (e.g. a deadline and an overdue follow-up close together).
  // Resolved points, sorted left-to-right, clamped within 6%-94% to prevent edge clipping
  const resolved = points
    .map((p) => {
      const t = p.kind === 'today' ? now : dateMs(p.date);
      return t === null ? null : { ...p, t, leftPct: Math.max(6, Math.min(94, ((t - min) / range) * 100)) };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.leftPct - b.leftPct);

  // Smart alternating positioning: if two points are close to each other (< 16%),
  // place one above the baseline and one below so they never overlap
  const COLLISION_THRESHOLD = 16;
  let lastPos: 'above' | 'below' = 'below';
  let lastLeft = -999;
  const positioned = resolved.map((p) => {
    const isClose = p.leftPct - lastLeft < COLLISION_THRESHOLD;
    const pos: 'above' | 'below' = isClose ? (lastPos === 'below' ? 'above' : 'below') : 'below';
    lastPos = pos;
    lastLeft = p.leftPct;
    return { ...p, pos };
  });

  return (
    <div className="rounded-2xl border border-line bg-panel-2/50 px-4 py-3.5 min-w-0">
      <div className="mb-2 text-micro font-medium text-ink-soft">Response timeline</div>
      <div className="relative h-20 select-none">
        {/* Base line centered vertically */}
        <div className="absolute inset-x-0 top-10 h-px bg-line" />
        {/* Today marker as a vertical guide */}
        <div
          className="absolute top-2 h-16 w-px bg-accent/30 pointer-events-none"
          style={{ left: `${Math.max(6, Math.min(94, ((now - min) / range) * 100))}%` }}
        />
        {positioned.map((p, i) => {
          const left = `${p.leftPct}%`;
          const dot =
            p.kind === 'today'
              ? 'h-2.5 w-2.5 bg-accent ring-2 ring-panel-2'
              : p.kind === 'past'
                ? 'h-2 w-2 bg-ink-soft'
                : p.kind === 'window'
                  ? 'h-2 w-2 bg-amber'
                  : 'h-2 w-2 bg-ink-faint';

          return (
            <div
              key={i}
              className="absolute top-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left }}
            >
              <div className={`rounded-full ${dot} shrink-0`} />
              <div
                className={`absolute whitespace-nowrap text-center text-label text-ink-soft ${
                  p.pos === 'above' ? 'bottom-3 pb-1' : 'top-3 pt-1'
                }`}
              >
                <div className="font-semibold text-ink leading-tight">{p.label}</div>
                {p.date && p.kind !== 'today' && (
                  <div className="tabular-nums text-micro text-ink-faint leading-tight mt-0.5">
                    {relative(p.date)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function relative(dateStr: string): string {
  const past = daysSince(dateStr);
  const future = daysUntil(dateStr);
  if (past === null || future === null) return dateStr;
  if (past === 0) return 'today';
  if (past > 0) return `${past}d ago`;
  if (future === 1) return 'tomorrow';
  return `in ${future}d`;
}
