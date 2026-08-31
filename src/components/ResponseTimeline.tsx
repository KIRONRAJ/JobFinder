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
  const pos = (t: number) => `${Math.max(0, Math.min(100, ((t - min) / range) * 100))}%`;

  const todayPos = pos(now);

  // Two points landing within a few days of each other map to nearly the same
  // `left`, so their labels sit on top of each other and render as garbled
  // overlapping text (e.g. a deadline and an overdue follow-up close together).
  // Resolved points, sorted left-to-right, so a close pair can be staggered.
  const resolved = points
    .map((p) => {
      const t = p.kind === 'today' ? now : dateMs(p.date);
      return t === null ? null : { ...p, t, leftPct: ((t - min) / range) * 100 };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.leftPct - b.leftPct);

  const COLLISION_THRESHOLD = 10; // percentage points
  let lastLeft = -Infinity;
  let stagger = false;
  const withStagger = resolved.map((p) => {
    const collides = p.leftPct - lastLeft < COLLISION_THRESHOLD;
    stagger = collides ? !stagger : false;
    lastLeft = p.leftPct;
    return { ...p, stagger };
  });

  return (
    <div className="rounded-2xl border border-line bg-panel-2/50 px-4 py-4">
      <div className="mb-3 text-micro font-medium text-ink-soft">Response timeline</div>
      <div className="relative h-[4.5rem]">
        {/* Base line */}
        <div className="absolute inset-x-0 top-6 h-px bg-line" />
        {/* Today marker as a subtle vertical guide */}
        <div className="absolute top-2 h-9 w-px bg-accent/40" style={{ left: todayPos }} />
        {withStagger.map((p, i) => {
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
              className="absolute top-6 -translate-x-1/2 -translate-y-1/2"
              style={{ left }}
            >
              <div className={`rounded-full ${dot}`} />
              <div
                className={`-translate-x-1/2 whitespace-nowrap text-label text-ink-soft ${p.stagger ? 'mt-6' : 'mt-1.5'}`}
                style={{ marginLeft: '50%' }}
              >
                {p.label}
                {p.date && (
                  <div className="tabular-nums text-ink-faint">{relative(p.date)}</div>
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
