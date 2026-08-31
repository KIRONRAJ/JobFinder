import { Icon } from './Icons';
import type { AtsScore } from '../types';

/** Same gradient-by-tone convention as ReadinessBar — kept as a separate
 *  literal map since Tailwind's scanner needs the class strings verbatim. */
const SCORE_GRADIENT: Record<'grass' | 'accent' | 'amber' | 'rose', string> = {
  grass: 'bg-gradient-to-r from-grass/60 to-grass',
  accent: 'bg-gradient-to-r from-accent/60 to-accent',
  amber: 'bg-gradient-to-r from-amber/60 to-amber',
  rose: 'bg-gradient-to-r from-rose/60 to-rose',
};

function toneFor(score: number): 'grass' | 'accent' | 'amber' | 'rose' {
  return score >= 80 ? 'grass' : score >= 60 ? 'accent' : score >= 40 ? 'amber' : 'rose';
}

const DIMENSIONS: { key: keyof AtsScore; label: string }[] = [
  { key: 'keywordMatch', label: 'Keyword match' },
  { key: 'semanticMatch', label: 'Semantic match' },
  { key: 'technicalMatch', label: 'Technical match' },
  { key: 'experienceMatch', label: 'Experience match' },
  { key: 'industryMatch', label: 'Industry match' },
  { key: 'recruiterReadability', label: 'Recruiter readability' },
];

const RISK_META = {
  low: { label: 'Low parsing risk', tone: 'text-grass', Icon: Icon.CheckCircle },
  medium: { label: 'Medium parsing risk', tone: 'text-amber', Icon: Icon.Triangle },
  high: { label: 'High parsing risk', tone: 'text-rose', Icon: Icon.Octagon },
} as const;

/**
 * The ATS match score, forced onto every tailored CV/cover-letter generation
 * as of 6 Aug 2026 — see the jobhq skill's "ATS keyword + gap analysis + Match
 * Score" section. `parsingRisk` is shown as a gate, not folded into the bars:
 * a real parsing failure means the ATS may never see the content at all, so
 * it's called out on its own rather than averaged away.
 */
export function AtsScorePanel({ score }: { score: AtsScore }) {
  const tone = toneFor(score.overall);
  const risk = RISK_META[score.parsingRisk];

  return (
    <div className="rounded-2xl border border-line bg-panel-2/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-micro font-medium uppercase tracking-wide text-ink-faint">
          <Icon.Target className="h-3.5 w-3.5" />
          ATS match score
        </p>
        <span className={`flex items-center gap-1.5 text-micro font-medium ${risk.tone}`}>
          <risk.Icon className="h-3.5 w-3.5" />
          {risk.label}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-stat tabular-nums text-ink">{score.overall}</span>
        <span className="text-meta text-ink-soft">
          / 100 · {score.overall >= 80 ? 'interview-ready' : 'below the 80 bar'}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full ${SCORE_GRADIENT[tone]}`}
          style={{ width: `${Math.min(100, Math.max(0, score.overall))}%` }}
        />
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {DIMENSIONS.map((d) => {
          const value = score[d.key] as number;
          const t = toneFor(value);
          return (
            <li key={d.key}>
              <div className="mb-1 flex items-center justify-between text-micro text-ink-soft">
                <span>{d.label}</span>
                <span className="tabular-nums text-ink">{value}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full rounded-full ${SCORE_GRADIENT[t]}`}
                  style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {score.explanation && (
        <p className="mt-4 border-t border-line-soft pt-3 text-meta leading-relaxed text-ink-soft">
          {score.explanation}
        </p>
      )}
    </div>
  );
}
