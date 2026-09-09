import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icons';
import { TabStrip } from '../components/TabStrip';
import { ReadinessBar } from '../components/ReadinessBar';
import { MarkdownLite } from '../components/MarkdownLite';
import { RoleRefreshers } from '../components/RoleRefreshers';
import { AssessmentPrep } from '../components/AssessmentPrep';
import { InterviewBank } from '../components/InterviewBank';
import { SkeletonPanels } from '../components/SkeletonRows';
import { api } from '../api';
import { copyText } from '../lib/clipboard';
import { gapLinkageFor } from '../lib/studyGuides';
import { studyGuideComplete } from '../types';
import type {
  Application,
  StudyData,
  StudyGuide,
  StudyGuideProgress,
  UpskillReport,
} from '../types';

const QUIZ_SCORES = [0, 1, 2, 3, 4, 5];

/** Per-guide readiness — the same 3-part model the plan describes: concepts
 *  read, exercise done, quiz passed (>=4/5). Deliberately not a weighted
 *  average of raw quiz score — a 3/5 quiz isn't "60% done with the quiz",
 *  it's "not yet passed", matching the index file's own retake rule. */
function guideReadiness(p: StudyGuideProgress | undefined) {
  const checks = [
    { key: 'concepts', done: Boolean(p?.conceptsRead), label: 'Concepts read' },
    { key: 'exercise', done: Boolean(p?.exerciseDone), label: 'Hands-on exercise done' },
    { key: 'quiz', done: (p?.quizScore ?? 0) >= 4, label: 'Quiz passed (4/5 or better)' },
  ];
  const done = checks.filter((c) => c.done).length;
  return { score: Math.round((done / checks.length) * 100), breakdown: checks };
}

import { SotHub } from '../components/SotHub';

type Tab = 'sot' | 'guides' | 'roles' | 'assessment' | 'questions';

const TABS: { key: Tab; label: string; sub: string; icon: (p: { className?: string }) => JSX.Element }[] = [
  { key: 'sot', label: 'Summer of Tech', sub: 'Meet & Greet & 27 Roles', icon: Icon.Handshake },
  { key: 'guides', label: 'Skill guides', sub: 'Learn a topic', icon: Icon.GradCap },
  { key: 'roles', label: 'Role refreshers', sub: 'Revise for an interview', icon: Icon.Target },
  { key: 'questions', label: 'Answer bank', sub: 'Rehearse the questions', icon: Icon.Chat },
  { key: 'assessment', label: 'Assessment prep', sub: 'Whatever is coming up', icon: Icon.Zap },
];

const TAB_KEYS = new Set<string>(TABS.map((t) => t.key));

/**
 * Study, split in two as of v2.1.
 *
 * The two halves answer genuinely different questions and were fighting each
 * other in one scroll: the guide pack is month-scale ("what should I learn"),
 * while the refreshers are evening-scale ("I have an interview on Thursday,
 * what vocabulary is in that ad"). Same page, same nav slot, one tab strip —
 * matching how Insights already folds four related views together rather than
 * spending another sidebar item.
 */
export function Study({ apps, onOpenTerminal }: { apps: Application[]; onOpenTerminal: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: Tab = tabParam && TAB_KEYS.has(tabParam) ? (tabParam as Tab) : 'sot';

  const setTab = (t: Tab) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === 'sot') next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true }
    );

  return (
    <div>
      <TabStrip
        items={TABS}
        active={tab}
        onPick={setTab}
        size="card"
        ariaLabel="Study section"
      />

      {tab === 'sot' ? (
        <SotHub />
      ) : tab === 'guides' ? (
        <SkillGuides />
      ) : tab === 'roles' ? (
        <RoleRefreshers apps={apps} onOpenTerminal={onOpenTerminal} />
      ) : tab === 'questions' ? (
        <InterviewBank />
      ) : (
        <AssessmentPrep />
      )}
    </div>
  );
}

/**
 * The Skill Guides pack (`Required Documents/Skill Guides/*.md`) surfaced
 * in-app, with progress that persists and gap linkage back to the roles
 * those guides could actually have helped with — the loop `upskill-report.json`
 * has been sitting unused for.
 *
 * Unchanged by the v2.1 split beyond the rename: this is exactly the component
 * that used to be the whole Study view.
 */
function SkillGuides() {
  const [data, setData] = useState<StudyData | null>(null);
  const [upskillReport, setUpskillReport] = useState<UpskillReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.study.get(), api.upskillReport().catch(() => null)])
      .then(([s, u]) => {
        if (!alive) return;
        setData(s);
        setUpskillReport(u);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, []);

  async function updateProgress(file: string, patch: Partial<StudyGuideProgress>) {
    if (!data) return;
    // Optimistic — the PATCH almost never fails, and waiting for the round
    // trip on every checkbox click would make the UI feel laggy.
    const prev = data.progress[file];
    const optimistic: StudyGuideProgress = {
      conceptsRead: prev?.conceptsRead ?? false,
      exerciseDone: prev?.exerciseDone ?? false,
      quizScore: prev?.quizScore,
      completedAt: prev?.completedAt,
      ...patch,
    };
    setData({ ...data, progress: { ...data.progress, [file]: optimistic } });
    try {
      const saved = await api.study.update(file, patch);
      setData((d) => d && { ...d, progress: { ...d.progress, [file]: saved } });
    } catch {
      setData((d) => d && { ...d, progress: { ...d.progress, [file]: prev ?? optimistic } });
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose/30 bg-panel p-5 text-meta text-rose">
        Couldn't load the guide pack — {error}
      </div>
    );
  }

  if (!data) {
    return <SkeletonPanels />;
  }

  if (data.guides.length === 0) {
    return (
      <div className="panel-empty px-6 py-16 text-center">
        <Icon.GradCap className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
        <p className="text-subhead text-ink">No guide pack found</p>
        <p className="mt-1.5 text-meta text-ink-soft">
          Expected markdown files in "Required Documents/Skill Guides/".
        </p>
      </div>
    );
  }

  const completedCount = data.guides.filter((g) => studyGuideComplete(data.progress[g.file])).length;
  const overall = {
    score: Math.round((completedCount / data.guides.length) * 100),
    breakdown: data.guides.map((g) => ({
      key: g.file,
      done: studyGuideComplete(data.progress[g.file]),
      label: g.title,
    })),
  };

  return (
    <div className="space-y-8">
      <ReadinessBar readiness={overall} variant="full" title="Skill guides completed" />

      {data.schedule.length > 0 && (
        <section className="panel px-5 py-4">
          <p className="mb-3 text-subhead font-medium text-ink">Suggested schedule</p>
          <ul className="divide-y divide-line-soft">
            {data.schedule.map((row) => {
              const guide = data.guides.find((g) => g.file === row.file);
              const complete = guide ? studyGuideComplete(data.progress[guide.file]) : false;
              return (
                <li key={row.file} className="flex items-center gap-3 py-2 text-meta">
                  {complete ? (
                    <Icon.CheckCircle className="h-3.5 w-3.5 shrink-0 text-grass" />
                  ) : (
                    <Icon.Circle className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                  )}
                  <span className="w-32 shrink-0 font-mono text-label text-ink-faint">{row.time}</span>
                  <span className={complete ? 'text-ink-soft line-through decoration-1' : 'text-ink'}>
                    {row.topic}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="space-y-6">
        {data.guides.map((guide) => (
          <GuideCard
            key={guide.file}
            guide={guide}
            progress={data.progress[guide.file]}
            gap={gapLinkageFor(guide.file, upskillReport)}
            onUpdate={(patch) => updateProgress(guide.file, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function GuideCard({
  guide,
  progress,
  gap,
  onUpdate,
}: {
  guide: StudyGuide;
  progress?: StudyGuideProgress;
  gap: ReturnType<typeof gapLinkageFor>;
  onUpdate: (patch: Partial<StudyGuideProgress>) => void;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const complete = studyGuideComplete(progress);
  const readiness = guideReadiness(progress);

  const toggleReveal = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const suggestedEntry =
    `Add my completed self-directed training to Candidate Key Facts.md: "${guide.title}" ` +
    `— a one-day hands-on introduction, completed ${new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}. ` +
    `Word it as self-directed training under "Self-directed training (Aug 2026)", not as professional or administration experience — ` +
    `same honesty standard as the rest of the file. If this ever needs an evidence-map state on a job analysis, it's ` +
    `needs-wording, not verified — a one-day crash course backs a claim of exposure, not of work-history experience.`;

  const copySuggestion = async () => {
    const ok = await copyText(suggestedEntry);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <section className="panel px-5 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-subhead font-medium text-ink">{guide.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-micro text-ink-soft">
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
        </div>
        <ReadinessBar readiness={readiness} variant="compact" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-meta">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(progress?.conceptsRead)}
            onChange={(e) => onUpdate({ conceptsRead: e.target.checked })}
            className="h-4 w-4 rounded border-line accent-accent"
          />
          Concepts read
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(progress?.exerciseDone)}
            onChange={(e) => onUpdate({ exerciseDone: e.target.checked })}
            className="h-4 w-4 rounded border-line accent-accent"
          />
          Hands-on exercise done
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-ink-soft">Quiz score</span>
          <div className="flex items-center gap-1" role="group" aria-label="Quiz score, out of 5">
            {QUIZ_SCORES.map((n) => (
              <button
                key={n}
                onClick={() => onUpdate({ quizScore: n })}
                aria-pressed={progress?.quizScore === n}
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-label font-medium transition
                            ${
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

      {complete && (
        <div className="mb-4 rounded-xl border border-grass/30 bg-grass/[0.06] px-4 py-3">
          <p className="flex items-center gap-1.5 text-meta font-medium text-grass">
            <Icon.CheckCircle className="h-3.5 w-3.5" />
            Complete — ready to log
          </p>
          <p className="mt-1 text-micro text-ink-soft">
            Worded honestly as self-directed training, not professional experience. Copy the
            suggestion below and ask Claude in chat to add it to Candidate Key Facts.md — the app
            doesn't write that file itself.
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
