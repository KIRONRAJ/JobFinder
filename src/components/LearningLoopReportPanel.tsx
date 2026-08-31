import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Icon } from './Icons';
import { api } from '../api';
import { chartTooltipStyle, chartsShouldAnimate, useChartTheme, CHART_ANIM_DURATION, CHART_ANIM_EASING } from './charts';
import type { LearningLoopReport } from '../types';

/** Truncates a theme title for the Y-axis label — the full text is still in
 *  the tooltip and the prose list below, this is just the chart's own space
 *  constraint. */
function shortTitle(title: string): string {
  return title.length > 38 ? `${title.slice(0, 37)}…` : title;
}

/** The narrative counterpart to LearningLoopPanel's live regex buckets —
 *  fetched once from disk, since Claude writes this file directly rather
 *  than the app computing it. Absent entirely until Claude has run one. */
export function LearningLoopReportPanel() {
  const [report, setReport] = useState<LearningLoopReport | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    api
      .learningLoop()
      .then((r) => alive && setReport(r))
      .catch(() => alive && setReport(null));
    return () => {
      alive = false;
    };
  }, []);

  const theme = useChartTheme();
  const animate = chartsShouldAnimate();

  if (!report) return null;

  const generated = new Date(report.generatedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const themeChartData = [...report.themes]
    .map((t) => ({ title: shortTitle(t.title), fullTitle: t.title, count: t.evidence.length }))
    .sort((a, b) => b.count - a.count);

  return (
    <section className="mb-6 rounded-2xl border border-line bg-panel p-5">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-micro font-medium uppercase tracking-wide text-ink-soft">
          <Icon.Target className="h-3.5 w-3.5 text-accent" />
          Detailed retrospective — {report.rejectionCount} rejections
        </div>
        <span className="text-label text-ink-faint">Generated {generated}</span>
      </header>

      <p className="text-meta leading-relaxed text-ink">{report.headline}</p>

      {themeChartData.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-label font-medium uppercase tracking-wide text-ink-faint">
            Most-recurring gaps
          </p>
          <ResponsiveContainer width="100%" height={Math.max(120, themeChartData.length * 36)}>
            <BarChart data={themeChartData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.axis }} />
              <YAxis type="category" dataKey="title" width={180} tick={{ fontSize: 11, fill: theme.axis }} />
              <Tooltip
                contentStyle={chartTooltipStyle(theme)}
                formatter={(value) => [`${value} confirming ${value === 1 ? 'instance' : 'instances'}`, '']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTitle ?? ''}
              />
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
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-grass/25 bg-grass/5 px-3.5 py-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-label font-medium uppercase tracking-wide text-grass">
            <Icon.CheckCircle className="h-3.5 w-3.5" />
            Real signal
          </p>
          <ul className="space-y-1.5 text-micro text-ink-soft">
            {report.signalStrength.highSignal.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-line-soft bg-panel-2/50 px-3.5 py-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-label font-medium uppercase tracking-wide text-ink-faint">
            <Icon.Circle className="h-3.5 w-3.5" />
            No real signal
          </p>
          <ul className="space-y-1.5 text-micro text-ink-soft">
            {report.signalStrength.noSignal.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {report.themes.map((t, i) => (
          <li key={i} className="rounded-xl border border-line-soft bg-panel-2/50 px-4 py-3.5">
            <p className="text-meta font-medium text-ink">{t.title}</p>
            <p className="mt-1 text-micro leading-relaxed text-ink-soft">{t.detail}</p>
            <ul className="mt-2 space-y-1 text-micro text-ink-faint">
              {t.evidence.map((e, j) => (
                <li key={j} className="pl-3 -indent-3">
                  · {e}
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-start gap-1.5 text-micro text-accent">
              <Icon.Arrow className="mt-0.5 h-3 w-3 shrink-0" />
              {t.action}
            </p>
          </li>
        ))}
      </ul>

      {report.outliers && report.outliers.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber/25 bg-amber/5 px-3.5 py-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-label font-medium uppercase tracking-wide text-amber">
            <Icon.Triangle className="h-3.5 w-3.5" />
            Not a real "no"
          </p>
          {report.outliers.map((o, i) => (
            <p key={i} className="text-micro leading-relaxed text-ink-soft">
              <span className="font-medium text-ink">
                {o.company} — {o.role}:
              </span>{' '}
              {o.note}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-line-soft pt-3.5">
        <p className="mb-2 text-label font-medium uppercase tracking-wide text-ink-faint">
          Recommendations
        </p>
        <ul className="space-y-1.5">
          {report.recommendations.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-micro text-ink-soft">
              <Icon.Check className="mt-1 h-3 w-3 shrink-0 text-accent" />
              {r}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
