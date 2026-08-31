import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Recharts renders to plain SVG attributes, which don't resolve
 * `rgb(var(--x))` — so rather than duplicating hex values per theme (which
 * silently rots the moment a token or an accent theme changes), the tokens are
 * read off the document at runtime and re-read whenever the theme moves.
 *
 * Watches BOTH `class` (light/dark) and `data-theme` (accent) — filtering to
 * `class` alone would leave every chart on a stale accent after a theme switch.
 */
function readToken(name: string, fallback: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `rgb(${raw})` : fallback;
}

function snapshotTheme() {
  return {
    grid: readToken('--line', '#E0D9CD'),
    axis: readToken('--ink-soft', '#6C6458'),
    tooltipBg: readToken('--panel', '#FFFEFB'),
    tooltipText: readToken('--ink', '#1F1B17'),
    accent: readToken('--accent', '#087482'),
    neutral: readToken('--neutral', '#8D8478'),
    amber: readToken('--amber', '#C26C0F'),
    rose: readToken('--rose', '#D6322A'),
    grass: readToken('--grass', '#15945C'),
  };
}

export type ChartTheme = ReturnType<typeof snapshotTheme>;

/** Shared by every Recharts consumer (AnalyticsView, SkillsMatchChart) so the
 *  token-reading/observer logic lives in exactly one place. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(snapshotTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(snapshotTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/**
 * Shared chart infrastructure. The tooltip style object used to be
 * hand-copied verbatim at four call sites in AnalyticsView — one change to a
 * token meant four edits, and they'd already started drifting. This is the
 * one place it's defined now.
 */
export interface ChartTokens {
  grid: string;
  tooltipBg: string;
  tooltipText: string;
}

export function chartTooltipStyle(t: ChartTokens): CSSProperties {
  return {
    fontSize: 12,
    borderRadius: 10,
    background: t.tooltipBg,
    border: `1px solid ${t.grid}`,
    color: t.tooltipText,
  };
}

/** Recharts' `isAnimationActive` doesn't read the CSS
 *  `prefers-reduced-motion` block the rest of the app respects via
 *  `MotionConfig` — that block only silences CSS/framer transitions, not
 *  Recharts' own animation engine. This is the one place that gets checked
 *  for chart series specifically. */
export function chartsShouldAnimate(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** genjutsu:cast, 30 Aug 2026 — the "data-driven reveal" thesis for Insights:
 *  bars/lines draw in fast and precisely (240-320ms, ease-out, no bounce) so
 *  the chart reads as the numbers computing themselves, not as decoration.
 *  Recharts' own defaults (1500ms, 'ease') were built for a slower, more
 *  decorative feel and never revisited — one shared constant so every series
 *  across the view lands on the same timing instead of drifting per chart. */
export const CHART_ANIM_DURATION = 300;
export const CHART_ANIM_EASING = 'ease-out' as const;

/**
 * A minimal inline trend line — used sparingly, only where a number already
 * sits (a stat tile, a conversion row), never scattered across list rows.
 * No axes, no tooltip: it's a shape, not a chart in its own right.
 */
export function Sparkline({
  values,
  color,
  width = 72,
  height = 22,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${height - ((v - min) / span) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
