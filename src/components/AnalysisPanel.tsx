import { Icon } from './Icons';
import { AtsScorePanel } from './AtsScorePanel';
import type { Analysis, LearningTask } from '../types';
import { asList } from '../lib/asList';

/** Every group carries an icon and an explicit heading, so the four keyword
 *  buckets never rely on chip colour alone to tell them apart. */
function KeywordGroup({
  title,
  hint,
  words,
  tone,
  icon: IconEl,
}: {
  title: string;
  hint: string;
  words: string[];
  tone: 'good' | 'missing' | 'evidence' | 'warn';
  icon: (p: { className?: string }) => JSX.Element;
}) {
  if (words.length === 0) return null;
  const chipClass =
    tone === 'good'
      ? 'border-grass/40 text-grass'
      : tone === 'warn'
        ? 'border-rose/40 text-rose'
        : tone === 'evidence'
          ? 'border-amber/40 text-amber'
          : 'border-line text-ink-soft';
  return (
    <div className="min-w-0 max-w-full">
      <p className="flex items-center gap-1.5 text-micro font-medium text-ink flex-wrap">
        <IconEl className="h-3 w-3 shrink-0" />
        <span>{title}</span>
        <span className="font-normal text-ink-faint">· {hint}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5 min-w-0 max-w-full">
        {words.map((w) => (
          <span key={w} className={`chip max-w-full text-left whitespace-normal break-words leading-snug ${chipClass}`}>
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The richer `{title, reason, priority, proof}` shape a learning task can
 *  take — see the type comment for why the plain-string shape isn't the only
 *  one. `reason`/`priority`/`proof` are all optional, so this degrades to
 *  just the title if that's all a given task carries. */
function LearningTaskItem({ task }: { task: LearningTask }) {
  return (
    <li className="text-meta text-ink-soft">
      <span className="text-ink">· {task.title}</span>
      {task.priority && <span className="ml-1.5 chip border-line text-micro">{task.priority}</span>}
      {task.reason && <div className="ml-3 mt-0.5 text-label text-ink-faint">{task.reason}</div>}
      {task.proof && (
        <div className="ml-3 mt-0.5 text-label italic text-ink-faint">Proof: {task.proof}</div>
      )}
    </li>
  );
}

export function AnalysisPanel({ analysis }: { analysis: Analysis }) {
  // An analysis missing `ats`/`gap` entirely is the same failure one level up.
  const ats = analysis.ats ?? ({} as Analysis['ats']);
  const gap = analysis.gap ?? ({} as Analysis['gap']);
  const ran = new Date(analysis.at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="space-y-5">
      {analysis.score && <AtsScorePanel score={analysis.score} />}

      <div className="space-y-4">
        <p className="text-micro uppercase tracking-wide text-ink-faint">ATS keywords</p>
        <KeywordGroup
          title="Matched"
          hint="already evidenced on the CV"
          words={asList(ats.matched)}
          tone="good"
          icon={Icon.Check}
        />
        <KeywordGroup
          title="Missing"
          hint="the ad asks, the CV doesn't say"
          words={asList(ats.missing)}
          tone="missing"
          icon={Icon.Close}
        />
        <KeywordGroup
          title="Evidence more strongly"
          hint="true, but stated too weakly to score"
          words={asList(ats.toEvidence)}
          tone="evidence"
          icon={Icon.Arrow}
        />
        <KeywordGroup
          title="Unsupported — fix these"
          hint="CV wording the evidence doesn't back"
          words={asList(ats.unsupported)}
          tone="warn"
          icon={Icon.Warning}
        />
      </div>

      <div className="border-t border-line-soft pt-4">
        <p className="text-micro uppercase tracking-wide text-ink-faint">Gap analysis</p>

        <div className="mt-3 grid gap-4 sm:grid-cols-2 min-w-0">
          <div className="min-w-0">
            <p className="text-micro font-medium text-ink">They're asking for</p>
            <ul className="mt-1.5 space-y-1">
              {asList(gap.theyWant).map((t) => (
                <li key={t} className="text-meta text-ink-soft break-words">
                  · {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <p className="text-micro font-medium text-ink">You actually have</p>
            <ul className="mt-1.5 space-y-1">
              {asList(gap.youHave).map((t) => (
                <li key={t} className="text-meta text-ink-soft break-words">
                  · {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {gap.positioning && (
          <div className="mt-4 rounded-xl border border-line bg-panel-2 p-4 min-w-0">
            <p className="text-micro font-medium text-ink">Honest positioning</p>
            <p className="mt-1.5 text-meta leading-relaxed text-ink-soft break-words">{gap.positioning}</p>
          </div>
        )}

        {asList(gap.learningTasks).length > 0 && (
          <div className="mt-4">
            <p className="text-micro font-medium text-ink">Worth learning</p>
            <ul className="mt-1.5 space-y-1.5">
              {asList(gap.learningTasks).map((t, i) =>
                typeof t === 'string' ? (
                  <li key={i} className="text-meta text-ink-soft">
                    · {t}
                  </li>
                ) : (
                  <LearningTaskItem key={i} task={t} />
                )
              )}
            </ul>
          </div>
        )}
      </div>

      <p className="text-label text-ink-faint">Analysis run {ran} by Claude</p>
    </div>
  );
}
