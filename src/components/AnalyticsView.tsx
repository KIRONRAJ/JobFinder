import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEffect, useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import {
  chartTooltipStyle,
  chartsShouldAnimate,
  Sparkline,
  useChartTheme,
  CHART_ANIM_DURATION,
  CHART_ANIM_EASING,
  type ChartTheme,
} from './charts';
import {
  conversionBySource,
  conversionByFit,
  conversionByAtsScore,
  conversionByApplyDelay,
  responseTimeStats,
  responseTimeHistogram,
  ghostedApplications,
  sourceFitMatrix,
  type ConversionRow,
} from '../lib/outcomes';
import { ROLE_TYPES, type Application, type Fit } from '../types';

interface Props {
  apps: Application[];
}
const fitColors = (t: ChartTheme): Record<Fit, string> => ({
  strong: t.grass,
  good: t.accent,
  stretch: t.amber,
});

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-5">
      <h3 className="mb-4 section-label">{title}</h3>
      {children}
    </div>
  );
}

function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKS_SHOWN = 26;

/** GitHub-style contribution grid — every activity timestamp across every
 *  application (status changes, notes, CV requests, contacts) counted per
 *  day. Reuses the chart accent already used as the sole data colour in the
 *  funnel/timeline charts above, just varied by opacity for intensity —
 *  matches the "one accent, varied not multiplied" restraint rather than
 *  introducing a new multi-hue scale. */
function ActivityHeatmap({ apps, theme }: { apps: Application[]; theme: ChartTheme }) {
  const counts = new Map<string, number>();
  for (const a of apps) {
    for (const e of a.activity ?? []) {
      const k = dayKey(e.at);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Start on a Sunday so the grid's rows line up with the weekday labels.
  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKS_SHOWN * 7 - 1) - start.getDay());

  const weeks: { key: string; date: Date; count: number }[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < WEEKS_SHOWN + 1; w++) {
    const col: { key: string; date: Date; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const key = dayKey(cursor.getTime());
      col.push({ key, date: new Date(cursor), count: cursor > today ? -1 : (counts.get(key) ?? 0) });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(col);
  }

  const max = Math.max(1, ...Array.from(counts.values()));
  const opacityFor = (count: number) => {
    if (count <= 0) return 0;
    return 0.22 + 0.68 * Math.min(1, count / Math.max(2, max * 0.6));
  };

  const totalDays = Array.from(counts.keys()).length;
  const activeLast26w = weeks.flat().filter((d) => d.count > 0).length;

  return (
    <div className="panel p-5 md:col-span-2">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="section-label">Search activity</h3>
        <span className="text-label text-ink-faint">
          {activeLast26w} active {activeLast26w === 1 ? 'day' : 'days'} in the last {WEEKS_SHOWN} weeks
          {totalDays > 0 ? ` · ${totalDays} total` : ''}
        </span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]" style={{ width: 'max-content' }}>
          {weeks.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.map((d) =>
                d.count < 0 ? (
                  <div key={d.key} className="h-[11px] w-[11px]" />
                ) : (
                  <div
                    key={d.key}
                    title={`${d.count} ${d.count === 1 ? 'action' : 'actions'} · ${d.date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    className="h-[11px] w-[11px] rounded-[2px]"
                    style={{
                      background:
                        d.count > 0 ? theme.accent : 'rgb(var(--line))',
                      opacity: d.count > 0 ? opacityFor(d.count) : 1,
                    }}
                  />
                )
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-label text-ink-faint">
        Less
        {[0, 0.3, 0.55, 0.8, 1].map((o, i) => (
          <span
            key={i}
            className="h-[10px] w-[10px] rounded-[2px]"
            style={{ background: o === 0 ? 'rgb(var(--line))' : theme.accent, opacity: o === 0 ? 1 : o }}
          />
        ))}
        More
      </div>
    </div>
  );
}

const DAY_MS = 86_400_000;

/** Days from the 'applied' status entry to whatever came next — the first
 *  real signal of response speed. Apps with no statusHistory (older entries,
 *  predating that field) or that never moved on from Applied are excluded
 *  rather than counted as zero, which would understate the real average. */
function responseDays(a: Application): number | null {
  const hist = a.statusHistory;
  if (!hist || hist.length < 2) return null;
  const appliedIdx = hist.findIndex((h) => h.status === 'applied');
  if (appliedIdx === -1 || appliedIdx === hist.length - 1) return null;
  const diff = hist[appliedIdx + 1].at - hist[appliedIdx].at;
  return diff >= 0 ? diff / DAY_MS : null;
}

const WEEKS_FOR_SPARKLINE = 8;

/** A single glanceable number, its unit, and an optional trend cue — the
 *  compact shape a KPI row needs (as opposed to ChartCard, which is sized for
 *  a chart). Kept small on purpose: `p-4` not `p-5`, no header/body split, so
 *  four of these read as one dashboard strip on a phone instead of four
 *  full-size cards stacked vertically. */
/** genjutsu:cast, 30 Aug 2026 — "data-driven reveal" thesis: KPI numbers
 *  compute themselves in front of you rather than just appearing. Only
 *  animates plain numeric text (int or one-decimal, e.g. "26" / "5.6") —
 *  anything else (the "—" empty state) renders as-is, no false animation.
 *  Respects reduced-motion via the same check the charts below already use. */
function CountUpValue({ text }: { text: string }) {
  const match = text.match(/^-?\d+(\.\d+)?$/);
  const ref = useRef<HTMLSpanElement>(null);
  const shouldAnimate = chartsShouldAnimate();

  useEffect(() => {
    if (!match || !ref.current || !shouldAnimate) return;
    const target = parseFloat(text);
    const decimals = match[1] ? match[1].length - 1 : 0;
    const obj = { v: 0 };
    const tween = gsap.to(obj, {
      v: target,
      duration: 0.35,
      ease: 'power3.out',
      onUpdate: () => {
        if (ref.current) ref.current.textContent = obj.v.toFixed(decimals);
      },
    });
    return () => {
      tween.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!match) return <span>{text}</span>;
  return <span ref={ref}>{shouldAnimate ? '0' : text}</span>;
}

function KpiTile({
  label,
  value,
  unit,
  trend,
  empty,
}: {
  label: string;
  value: string;
  unit: string;
  trend?: { node: React.ReactNode };
  empty?: string;
}) {
  return (
    <div className="kpi-tile panel p-4">
      <h3 className="mb-1 truncate section-label">{label}</h3>
      {empty ? (
        <div className="flex h-11 items-center text-meta text-ink-soft">{empty}</div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-title font-semibold tabular-nums tracking-[-0.02em]">
              <CountUpValue text={value} />
            </span>
            <span className="truncate text-micro text-ink-faint">{unit}</span>
          </div>
          {trend && <div className="mt-1">{trend.node}</div>}
        </>
      )}
    </div>
  );
}

/** The dashboard's top-of-page KPI strip — the four numbers Kironraj checks
 *  first, before any chart. 2-up on mobile so it stays a glance, not a full
 *  screen of tiles; 4-up once there's room. Values were previously split
 *  between a "This week vs last"/"Average response time" pair and a separate
 *  "Response time spread"/"Likely gone quiet" section further down the page —
 *  merged here so the headline numbers aren't buried below "What's working". */
function KpiRow({ apps, theme }: { apps: Application[]; theme: ChartTheme }) {
  const now = Date.now();
  const thisWeek = apps.filter((a) => a.created && now - a.created < 7 * DAY_MS).length;
  const lastWeek = apps.filter(
    (a) => a.created && now - a.created >= 7 * DAY_MS && now - a.created < 14 * DAY_MS
  ).length;
  const delta = thisWeek - lastWeek;

  // Weekly counts, oldest first, for the sparkline — a shape beside the
  // number instead of a text arrow being the only trend signal.
  const weeklyCounts = Array.from({ length: WEEKS_FOR_SPARKLINE }, (_, i) => {
    const weeksAgo = WEEKS_FOR_SPARKLINE - 1 - i;
    return apps.filter(
      (a) =>
        a.created &&
        now - a.created >= weeksAgo * 7 * DAY_MS &&
        now - a.created < (weeksAgo + 1) * 7 * DAY_MS
    ).length;
  });

  const responses = apps.map(responseDays).filter((d): d is number => d !== null);
  const avgResponse =
    responses.length > 0 ? responses.reduce((s, d) => s + d, 0) / responses.length : null;

  const responseStats = responseTimeStats(apps);
  const { apps: ghosts, thresholdDays } = ghostedApplications(apps);
  const rowRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.from('.kpi-tile', {
        opacity: 0,
        y: 10,
        duration: reduce ? 0 : 0.28,
        ease: 'power2.out',
        stagger: reduce ? 0 : 0.06,
      });
      // Once on mount, not keyed on `apps` — a fix for a real bug (30 Aug
      // 2026): `apps` gets a brand-new top-level array reference on every
      // ~12s poll even when nothing changed (reconcileApps only stabilises
      // individual entries, not the array wrapper), so this replayed the
      // whole KPI row's entrance every poll — the "random refreshing /
      // weird animation" report. This was always meant as a one-time
      // page-load reveal, never a live-updating meter.
    },
    { scope: rowRef, dependencies: [] }
  );

  return (
    <div ref={rowRef} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiTile
        label="This week"
        value={String(thisWeek)}
        unit="logged"
        trend={{
          node: (
            <div className="flex items-center gap-2">
              <Sparkline values={weeklyCounts} color={delta >= 0 ? theme.grass : theme.rose} />
              <span
                className={`text-micro font-medium ${delta > 0 ? 'text-grass' : 'text-ink-faint'}`}
              >
                {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {Math.abs(delta)} vs last wk
              </span>
            </div>
          ),
        }}
      />
      <KpiTile
        label="Avg response"
        value={avgResponse === null ? '—' : avgResponse.toFixed(1)}
        unit={avgResponse === null ? '' : `days · n=${responses.length}`}
        empty={avgResponse === null ? 'Not enough data yet' : undefined}
      />
      <KpiTile
        label="Response spread"
        value={responseStats === null ? '—' : responseStats.median.toFixed(1)}
        unit={responseStats === null ? '' : `days median (p90 ${responseStats.p90.toFixed(1)})`}
        empty={responseStats === null ? 'Not enough data yet' : undefined}
      />
      <KpiTile
        label="Gone quiet"
        value={String(ghosts.length)}
        unit={`applied, no reply > ${thresholdDays}d`}
        empty={ghosts.length === 0 ? `Nothing past ${thresholdDays}d yet` : undefined}
      />
    </div>
  );
}

/** One conversion row: label, sample size, and a reply-rate bar. Used for
 *  source/fit/ATS-bucket breakdowns — same shape, different grouping. Rows
 *  below the sample-size floor show "n=" instead of a bar, so a 1-of-1 never
 *  reads as a confident 100%. */
function ConversionBars<K extends string>({ rows, theme }: { rows: ConversionRow<K>[]; theme: ChartTheme }) {
  const listRef = useRef<HTMLUListElement>(null);

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.from('.conv-row', {
        opacity: 0,
        x: -6,
        duration: reduce ? 0 : 0.24,
        ease: 'power2.out',
        delay: reduce ? 0 : (i: number) => Math.min(i, 8) * 0.04,
      });
      gsap.from('.conv-bar-fill', {
        scaleX: 0,
        duration: reduce ? 0 : 0.3,
        ease: 'power2.out',
        delay: reduce ? 0 : (i: number) => Math.min(i, 8) * 0.04 + 0.08,
      });
      // Once on mount — same fix and same reason as KpiRow above: `rows` is
      // recomputed fresh on every ~12s poll regardless of whether the
      // underlying conversion numbers actually moved.
    },
    { scope: listRef, dependencies: [] }
  );

  if (rows.length === 0) {
    return <p className="py-6 text-center text-micro text-ink-soft">Not enough data yet.</p>;
  }
  return (
    <ul ref={listRef} className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="conv-row flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-micro text-ink-soft">{r.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft">
            {r.replyRate !== null && (
              // Final width is set statically; scaleX (transform, composite-
              // only) does the growing — animating `width` directly forces a
              // layout recalc every frame, which the loaded motion-principles
              // sub-skill flags as a hard "never" for exactly this reason.
              <div
                className="conv-bar-fill h-full origin-left rounded-full"
                style={{ width: `${Math.round(r.replyRate * 100)}%`, background: theme.accent }}
              />
            )}
          </div>
          <span className="w-24 shrink-0 text-right text-micro tabular-nums text-ink-faint">
            {r.replyRate === null ? `n=${r.n}` : `${Math.round(r.replyRate * 100)}% · n=${r.n}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AnalyticsView({ apps }: Props) {
  // Called before the early return — hooks must not run conditionally.
  const theme = useChartTheme();

  if (apps.length === 0) {
    return (
      <div className="panel-empty px-6 py-16 text-center">
        <Icon.Chart className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
        <p className="text-subhead text-ink">Nothing to chart yet</p>
        <p className="mt-1.5 text-meta text-ink-soft">Add an application first, and this fills in.</p>
      </div>
    );
  }

  const animate = chartsShouldAnimate();
  const FIT_COLOR = fitColors(theme);

  const sourceRows = conversionBySource(apps);
  const fitRows = conversionByFit(apps);
  const atsRows = conversionByAtsScore(apps);
  const delayRows = conversionByApplyDelay(apps);
  const responseHistogram = responseTimeHistogram(apps);
  const matrix = sourceFitMatrix(apps);
  const matrixMax = Math.max(1, ...Array.from(matrix.counts.values()));

  const fitKeys: Fit[] = ['strong', 'good', 'stretch'];
  const fitData = fitKeys
    .map((f) => ({ name: f, value: apps.filter((a) => a.fit === f).length, fill: FIT_COLOR[f] }))
    .filter((d) => d.value > 0);

  const typeData = ROLE_TYPES.map((t) => ({
    label: t,
    count: apps.filter((a) => (a.type ?? 'Other') === t).length,
  })).filter((d) => d.count > 0);

  // Always bucket by day, never by month — a month-level bucket collapses to
  // as few as 2 points the moment activity spans a calendar boundary (e.g.
  // 100+ apps in August, 2 in September), which renders as a flat, useless
  // line even though the code isn't broken. Daily buckets stay meaningful at
  // any data volume this tracker will ever reach.
  const buckets = Array.from(
    new Set(apps.filter((a) => a.created).map((a) => dayKey(a.created!)))
  ).sort();
  let running = 0;
  const overTimeData = buckets.map((b) => {
    const created = apps.filter((a) => a.created && dayKey(a.created) === b).length;
    running += created;
    return { month: b, added: created, total: running };
  });

  // Pipeline Conversion Funnel
  const appliedCount = apps.filter((a) => a.status !== 'researching').length;
  const respondedCount = apps.filter((a) => a.status === 'rejected' || a.status === 'interview' || a.status === 'offer').length;
  const interviewCount = apps.filter((a) => a.status === 'interview' || a.status === 'offer').length;
  const offerCount = apps.filter((a) => a.status === 'offer').length;

  const funnelStages = [
    {
      stage: '1. Applied',
      count: appliedCount,
      rate: '100%',
      desc: 'All submitted roles',
      fill: theme.accent,
    },
    {
      stage: '2. Response Received',
      count: respondedCount,
      rate: `${appliedCount ? Math.round((respondedCount / appliedCount) * 100) : 0}%`,
      desc: 'Decision or contact received',
      fill: theme.amber,
    },
    {
      stage: '3. Interview Stage',
      count: interviewCount,
      rate: `${appliedCount ? ((interviewCount / appliedCount) * 100).toFixed(1) : 0}%`,
      desc: 'Advanced to interview',
      fill: '#8b5cf6',
    },
    {
      stage: '4. Offer',
      count: offerCount,
      rate: `${appliedCount ? ((offerCount / appliedCount) * 100).toFixed(1) : 0}%`,
      desc: 'Offer extended',
      fill: theme.grass,
    },
  ];

  // Weekly Momentum (Last 10 weeks)
  const now = Date.now();
  const ONE_WEEK_MS = 7 * 24 * 3600 * 1000;
  const weeklyData: { week: string; count: number; target: number }[] = [];
  let currentStreak = 0;
  let streakActive = true;
  for (let i = 9; i >= 0; i--) {
    const end = now - i * ONE_WEEK_MS;
    const start = end - ONE_WEEK_MS;
    const count = apps.filter((a) => {
      const t = a.created ?? (a.date ? Date.parse(a.date) : 0);
      return t >= start && t < end;
    }).length;
    const startD = new Date(start);
    weeklyData.push({
      week: `${startD.getDate()} ${startD.toLocaleString('en-NZ', { month: 'short' })}`,
      count,
      target: 10,
    });
  }
  for (let i = weeklyData.length - 1; i >= 0; i--) {
    if (weeklyData[i].count > 0 && streakActive) {
      currentStreak++;
    } else {
      streakActive = false;
    }
  }

  return (
    <div className="space-y-8">
      <KpiRow apps={apps} theme={theme} />

      <section>
        <header className="mb-4">
          <h2 className="text-subhead font-medium text-ink">What's working</h2>
          <p className="mt-1 text-meta text-ink-soft">
            Reply rate by group — hidden below n={3} so a single data point never reads as a trend.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="panel p-5">
            <h3 className="mb-3 section-label">By source</h3>
            <ConversionBars rows={sourceRows} theme={theme} />
          </div>
          <div className="panel p-5">
            <h3 className="mb-3 section-label">By your own fit call</h3>
            <ConversionBars rows={fitRows} theme={theme} />
          </div>
          <div className="panel p-5">
            <h3 className="mb-1 section-label">By ATS score</h3>
            <p className="mb-3 text-label text-ink-faint">Does the 80-point bar actually predict a reply?</p>
            <ConversionBars rows={atsRows} theme={theme} />
          </div>
          <div className="panel p-5">
            <h3 className="mb-1 section-label">By apply delay</h3>
            <p className="mb-3 text-label text-ink-faint">Does rushing to beat a deadline cost anything?</p>
            <ConversionBars rows={delayRows} theme={theme} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <ActivityHeatmap apps={apps} theme={theme} />

      <ChartCard title="Pipeline conversion funnel">
        <div className="mb-3 flex items-center justify-between text-micro text-ink-soft">
          <span>Stage-by-stage progression from Applied to Offer</span>
          <span className="font-mono text-label text-accent font-semibold">{appliedCount} Total Submitted</span>
        </div>
        <div className="space-y-3 pt-1">
          {funnelStages.map((stage) => {
            const pct = appliedCount > 0 ? (stage.count / appliedCount) * 100 : 0;
            return (
              <div key={stage.stage} className="space-y-1">
                <div className="flex items-center justify-between text-meta font-medium">
                  <span className="flex items-center gap-2 text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.fill }} />
                    <span>{stage.stage}</span>
                    <span className="text-micro font-normal text-ink-faint hidden sm:inline">({stage.desc})</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-ink tabular-nums">{stage.count}</span>
                    <span className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-micro font-mono font-semibold text-ink-soft">
                      {stage.rate}
                    </span>
                  </div>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-panel-2 border border-line-soft">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.max(3, pct)}%`,
                      background: stage.fill,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>

      <ChartCard title="Applications over time">
        {overTimeData.length < 1 ? (
          <div className="flex h-[220px] items-center justify-center text-micro text-ink-soft">
            No applications logged yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={overTimeData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: theme.axis }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.axis }} />
              <Tooltip contentStyle={chartTooltipStyle(theme)} />
              <Line
                type="monotone"
                dataKey="total"
                stroke={theme.accent}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                isAnimationActive={animate}
                animationDuration={CHART_ANIM_DURATION}
                animationEasing={CHART_ANIM_EASING}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Fit distribution">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={fitData}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              isAnimationActive={animate}
              animationDuration={CHART_ANIM_DURATION}
              animationEasing={CHART_ANIM_EASING}
            >
              {fitData.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Pie>
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Tooltip contentStyle={chartTooltipStyle(theme)} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Role type breakdown">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={typeData} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.axis }} />
            <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: theme.axis }} />
            <Tooltip contentStyle={chartTooltipStyle(theme)} />
            <Bar
              dataKey="count"
              fill={theme.accent}
              radius={[0, 4, 4, 0]}
              isAnimationActive={animate}
              animationDuration={CHART_ANIM_DURATION}
              animationEasing={CHART_ANIM_EASING}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Time to first response">
        {responseHistogram.every((b) => b.count === 0) ? (
          <div className="flex h-[220px] items-center justify-center text-micro text-ink-soft">
            No status changes to measure yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={responseHistogram} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.axis }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.axis }} />
              <Tooltip contentStyle={chartTooltipStyle(theme)} />
              <Bar
                dataKey="count"
                fill={theme.accent}
                radius={[4, 4, 0, 0]}
                isAnimationActive={animate}
                animationDuration={CHART_ANIM_DURATION}
                animationEasing={CHART_ANIM_EASING}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Weekly application momentum">
        <div className="mb-2 flex items-center justify-between text-micro text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" /> Submitted
            <span className="ml-2 h-0.5 w-3 bg-amber inline-block border-t border-dashed border-amber" /> Goal: 10/wk
          </span>
          {currentStreak > 0 && (
            <span className="rounded border border-amber/40 bg-amber/15 px-2 py-0.5 text-micro font-semibold text-amber">
              🔥 {currentStreak} week active streak
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weeklyData} margin={{ left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: theme.axis }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.axis }} />
            <Tooltip
              contentStyle={chartTooltipStyle(theme)}
              formatter={(val) => [`${val} applications`, 'Volume']}
            />
            <ReferenceLine y={10} stroke={theme.amber} strokeDasharray="3 3" />
            <Bar
              dataKey="count"
              fill={theme.accent}
              radius={[4, 4, 0, 0]}
              isAnimationActive={animate}
              animationDuration={CHART_ANIM_DURATION}
              animationEasing={CHART_ANIM_EASING}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      </div>

      <div className="panel p-5">
        <h3 className="mb-1 section-label">Source × fit</h3>
        <p className="mb-4 text-label text-ink-faint">Which sources tend to surface which fit calls.</p>
        {matrix.sources.length < 1 ? (
          <div className="flex h-[100px] items-center justify-center text-micro text-ink-soft">
            No sourced, fit-assessed applications yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-micro">
              <thead>
                <tr>
                  <th className="p-1.5 text-left font-medium text-ink-faint">Source</th>
                  {matrix.fits.map((f) => (
                    <th key={f} className="p-1.5 text-center font-medium capitalize text-ink-faint">
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.sources.map((s) => (
                  <tr key={s}>
                    <td className="p-1.5 text-ink">{s}</td>
                    {matrix.fits.map((f) => {
                      const count = matrix.counts.get(`${s}|${f}`) ?? 0;
                      return (
                        <td key={f} className="p-1.5 text-center">
                          <div
                            className="mx-auto flex h-7 w-full min-w-[44px] items-center justify-center rounded-md tabular-nums"
                            style={{
                              background: count > 0 ? theme.accent : 'rgb(var(--line))',
                              opacity: count > 0 ? 0.22 + 0.68 * Math.min(1, count / matrixMax) : 1,
                              color: count > 0 ? '#fff' : 'transparent',
                            }}
                          >
                            {count > 0 ? count : ''}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
