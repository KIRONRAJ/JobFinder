import { Icon } from '../Icons';
import { ReadinessBar } from '../ReadinessBar';
import { MarkdownLite } from '../MarkdownLite';
import { fitsMatchaStyle } from '../../lib/matchaGlyphs';
import { QUIZ_SCORES, useGuideCard } from '../../lib/useGuideCard';
import type { StudyGuide, StudyGuideProgress } from '../../types';
import type { gapLinkageFor } from '../../lib/studyGuides';

interface Props {
  guide: StudyGuide;
  progress?: StudyGuideProgress;
  gap: ReturnType<typeof gapLinkageFor>;
  onUpdate: (patch: Partial<StudyGuideProgress>) => void;
}

/**
 * Matcha's skill-guide card: title, the real three-step progress (concepts read, exercise done, quiz passed at
 * 4 of 5) and a progress bar. The steps are the same checkboxes and quiz buttons the classic card has, wired to
 * the same onUpdate, with a drawn tick or circle beside each. The guide itself and its quiz open inside the card.
 */
export function MatchaGuideCard({ guide, progress, gap, onUpdate }: Props) {
  const { revealed, toggleReveal, copied, copySuggestion, complete, readiness } = useGuideCard(guide, progress);
  const [concepts, exercise, quiz] = readiness.breakdown;
  const StepIcon = ({ done }: { done: boolean }) =>
    done ? <Icon.CheckCircle className="h-[18px] w-[18px] shrink-0 text-applied" /> : <Icon.Circle className="h-[18px] w-[18px] shrink-0 text-ink-faint" />;

  return (
    <section className="mx-gcard panel flex h-full flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center gap-2">
        {guide.timeBudget && (
          <span className="chip">
            <Icon.Clock className="h-3 w-3" />
            {guide.timeBudget}
          </span>
        )}
        {gap && (
          <span className="chip border-amber/40 text-amber" title={gap.roles.join(', ')}>
            <Icon.Target className="h-3 w-3" />
            Closes a gap that cost you {gap.roleCount} role{gap.roleCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <h3
        className={
          fitsMatchaStyle(guide.title)
            ? 'mx-display-card break-words font-display-matcha font-normal'
            : 'break-words text-title font-semibold'
        }
      >
        {guide.title}
      </h3>

      <div className="flex flex-col gap-1 text-meta">
        <label className="mx-gstep flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(progress?.conceptsRead)}
            onChange={(e) => onUpdate({ conceptsRead: e.target.checked })}
            className="peer sr-only"
          />
          <span className="flex items-center gap-3 rounded-lg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
            <StepIcon done={concepts.done} />
            <span className={concepts.done ? 'text-ink' : 'text-ink-faint'}>{concepts.label}</span>
          </span>
        </label>
        <label className="mx-gstep flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(progress?.exerciseDone)}
            onChange={(e) => onUpdate({ exerciseDone: e.target.checked })}
            className="peer sr-only"
          />
          <span className="flex items-center gap-3 rounded-lg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
            <StepIcon done={exercise.done} />
            <span className={exercise.done ? 'text-ink' : 'text-ink-faint'}>{exercise.label}</span>
          </span>
        </label>
        <div className="mx-gstep flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex items-center gap-3">
            <StepIcon done={quiz.done} />
            <span className={quiz.done ? 'text-ink' : 'text-ink-faint'}>{quiz.label}</span>
          </span>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Quiz score, out of 5">
            {QUIZ_SCORES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onUpdate({ quizScore: n })}
                aria-pressed={progress?.quizScore === n}
                aria-label={`Quiz score ${n}`}
                className={`mx-qbtn flex h-8 w-8 items-center justify-center rounded-full border text-label font-medium transition ${
                  progress?.quizScore === n
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-ink-soft hover:border-accent hover:text-accent'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-3">
        <ReadinessBar readiness={readiness} variant="compact" />
      </div>

      {complete && (
        <div className="rounded-2xl border border-grass/30 bg-grass/[0.06] px-4 py-3">
          <p className="flex items-center gap-1.5 text-meta font-medium text-grass">
            <Icon.CheckCircle className="h-3.5 w-3.5" />
            Complete — ready to log
          </p>
          <p className="mt-1 text-micro text-ink-soft">
            Worded honestly as self-directed training, not professional experience. Copy the suggestion below and ask
            Claude in chat to add it to Candidate Key Facts.md — the app doesn't write that file itself.
          </p>
          <button onClick={copySuggestion} className="btn-quiet mt-2.5 px-3 py-1.5 text-micro">
            {copied ? (
              <>
                <Icon.Check className="h-3 w-3 text-grass" />
                Copied
              </>
            ) : (
              <>
                <Icon.Copy className="h-3.5 w-3.5" />
                Copy suggestion for Claude
              </>
            )}
          </button>
        </div>
      )}

      <details className="group/details">
        <summary className="link-quiet cursor-pointer list-none">
          <Icon.Chevron className="h-3.5 w-3.5 transition-transform group-open/details:rotate-180" />
          Read guide &amp; quiz
        </summary>
        <div className="mt-4 space-y-6">
          <MarkdownLite markdown={guide.bodyMarkdown} />
          {guide.quiz.length > 0 && (
            <div className="panel-inset px-4 py-3.5">
              <p className="mb-3 text-micro font-medium uppercase tracking-wide text-ink-faint">Quiz</p>
              <ol className="space-y-3">
                {guide.quiz.map((q, i) => (
                  <li key={i} className="text-meta">
                    <p className="text-ink">
                      {i + 1}. {q.question}
                    </p>
                    {revealed.has(i) ? (
                      <p className="mt-1 text-micro text-ink-soft">{q.answer}</p>
                    ) : (
                      <button onClick={() => toggleReveal(i)} className="link-quiet mt-1 text-micro">
                        Reveal answer
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
