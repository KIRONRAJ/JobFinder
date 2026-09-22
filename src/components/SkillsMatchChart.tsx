import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartTooltipStyle, chartsShouldAnimate, useChartTheme } from './charts';
import { EVIDENCE_STATE_META } from './EvidenceRow';
import { countByState } from '../lib/evidenceState';
import type { EvidenceMap, EvidenceState } from '../types';

const STATE_ORDER: EvidenceState[] = ['verified', 'needs-wording', 'learning-gap', 'do-not-claim'];

function wordsByState(map: EvidenceMap): Record<EvidenceState, string[]> {
  const out: Record<EvidenceState, string[]> = {
    verified: [],
    'needs-wording': [],
    'learning-gap': [],
    'do-not-claim': [],
  };
  for (const [keyword, item] of Object.entries(map)) out[item.state].push(keyword);
  return out;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { label: string; count: number; words: string[] } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="max-w-[260px]">
      <p className="text-micro font-medium">
        {d.label} · {d.count}
      </p>
      {d.words.length > 0 && (
        <p className="mt-1 text-micro opacity-80">{d.words.join(', ')}</p>
      )}
    </div>
  );
}

/**
 * "Which of my skills meet their requirements" as one glance — aggregates
 * the same evidence map EvidenceRow already lists keyword-by-keyword lower on
 * the page (v2.5, 19 Aug 2026), rather than duplicating that list. Bar colour
 * always follows the fixed status hues (grass/amber/neutral/rose), never the
 * themeable accent — same convention as Meter/AtsScorePanel/EvidenceRow.
 */
export function SkillsMatchChart({ evidenceMap }: { evidenceMap: EvidenceMap }) {
  const theme = useChartTheme();
  const animate = chartsShouldAnimate();
  const counts = countByState(evidenceMap);
  const words = wordsByState(evidenceMap);

  const STATE_COLOR: Record<EvidenceState, string> = {
    verified: theme.grass,
    'needs-wording': theme.amber,
    'learning-gap': theme.neutral,
    'do-not-claim': theme.rose,
  };

  const data = STATE_ORDER.map((state) => ({
    state,
    label: EVIDENCE_STATE_META[state].label,
    count: counts[state],
    words: words[state],
    fill: STATE_COLOR[state],
  }));

  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-line bg-panel-2/50 p-4">
      <p className="flex items-center gap-1.5 text-micro font-medium uppercase tracking-wide text-ink-faint">
        Skills match — {total} keywords from the ad
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, top: 8 }}>
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tick={{ fontSize: 11, fill: theme.axis }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} contentStyle={chartTooltipStyle(theme)} cursor={{ fill: theme.grid, opacity: 0.3 }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={animate} barSize={18}>
            {data.map((d) => (
              <Cell key={d.state} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
