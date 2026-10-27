export interface FunnelRow {
  /** Stage name as the funnel already words it, e.g. "2. Response Received". */
  stage: string;
  count: number;
  /** Share of submitted roles, already formatted by the funnel (e.g. "28.6%"). */
  rate: string;
  desc: string;
  tooltip: string;
}

interface Props {
  rows: FunnelRow[];
  submitted: number;
  responded: number;
  avgDays: number | null;
  avgN: number;
  medianDays: number | null;
  p90Days: number | null;
}

// A status hue per funnel stage, from the same fixed meanings used everywhere else in the app.
const STAGE_FILL = ['bg-applied', 'bg-accent', 'bg-neutral', 'bg-amber', 'bg-grass'];

/**
 * Matcha's headline block for Insights > Pipeline: the funnel as a bar list, beside an accent response-rate
 * tile and an average-days-to-reply tile. Every figure is one AnalyticsView already computes for the funnel and
 * the KPI row; nothing here fetches or derives anything new except the response share (responded / submitted).
 */
export function MatchaInsightsHero({ rows, submitted, responded, avgDays, avgN, medianDays, p90Days }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="panel flex flex-col gap-5 p-6 sm:p-7" aria-labelledby="mx-funnel-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="mx-funnel-title" className="mx-mono text-accent">
            Pipeline conversion funnel
          </h3>
          <span className="mx-mono text-ink-faint">{submitted} submitted</span>
        </div>
        <ul className="flex flex-col gap-5">
          {rows.map((r, i) => {
            const pct = submitted > 0 ? (r.count / submitted) * 100 : 0;
            return (
              <li
                key={r.stage}
                title={r.tooltip}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto]"
              >
                <span className="col-start-1 row-start-1 min-w-0">
                  <span className="block text-meta font-medium text-ink">{r.stage.replace(/^\d+\.\s*/, '')}</span>
                  <span className="block truncate text-micro text-ink-faint">{r.desc}</span>
                </span>
                <span className="mx-numeral-md col-start-2 row-start-1 text-right font-display-matcha sm:col-start-3">{r.count}</span>
                <span className="col-span-2 row-start-2 h-3.5 overflow-hidden rounded-full bg-line sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <span
                    className={`block h-full rounded-full ${STAGE_FILL[i] ?? 'bg-accent'}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col gap-4">
        {submitted > 0 && (
          <div className="flex flex-col gap-2 rounded-3xl bg-accent p-6 text-on-accent sm:p-7">
            <span className="mx-mono">Response rate</span>
            <span className="mx-numeral-lg font-display-matcha">{Math.round((responded / submitted) * 100)}%</span>
            <span className="text-meta">
              {responded} of {submitted} submitted roles got a response
            </span>
          </div>
        )}
        <div className="panel flex flex-col gap-2 p-6 sm:p-7">
          <span className="mx-mono text-ink-soft">Average days to reply</span>
          {avgDays === null ? (
            <span className="text-body text-ink-soft">Not enough data yet.</span>
          ) : (
            <>
              <span className="mx-numeral-lg font-display-matcha">{avgDays.toFixed(1)}</span>
              <span className="text-meta text-ink-soft">
                across {avgN} {avgN === 1 ? 'reply' : 'replies'}
                {medianDays !== null && p90Days !== null && `, median ${medianDays.toFixed(1)} days, p90 ${p90Days.toFixed(1)}`}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
