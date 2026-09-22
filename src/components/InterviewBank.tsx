import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccordionPresence } from '../lib/useAccordionPresence';
import { Icon } from './Icons';
import { ReadinessBar } from './ReadinessBar';
import { api } from '../api';
import { copyText } from '../lib/clipboard';
import type { InterviewBank as Bank, InterviewCategory, InterviewQuestion } from '../types';

/**
 * Interview answer bank — third half of the Study split, shipped in v2.2.
 *
 * Skill Guides is month-scale ("what should I learn"). Role Refreshers is
 * evening-scale ("what vocabulary is in that specific ad"). This is the third
 * question neither of them answers: "someone is going to ask me to tell them
 * about myself, and I need to not fumble it."
 *
 * Two deliberate structural choices:
 *
 *  - Hints and the full answer are separate fields, not one blob. Reading a
 *    polished paragraph is how you end up reciting it; the hints are what you
 *    actually want in your head walking in, so they're what the card shows
 *    first and the paragraph is behind a reveal.
 *  - Practice mode hides both by default and forces you to answer out loud
 *    before revealing anything, because recognising an answer and being able
 *    to produce one are very different skills and only the second is tested.
 */

const CATEGORY_META: Record<
  InterviewCategory,
  { label: string; short: string; icon: (p: { className?: string }) => JSX.Element; blurb: string }
> = {
  behavioural: {
    label: 'Behavioural / STAR',
    short: 'Behavioural',
    icon: Icon.Chat,
    blurb: 'The universal set. Asked in almost every interview regardless of the role.',
  },
  servicedesk: {
    label: 'Service desk & IT support',
    short: 'Service desk',
    icon: Icon.Terminal,
    blurb: 'Technical support questions, L1 through L2. Method matters more than trivia here.',
  },
  police: {
    label: 'NZ Police & emergency comms',
    short: 'Police',
    icon: Icon.Shield,
    blurb:
      'Mapped to the competencies Police actually interviews against: Communicate, Partner, Solve, Resilience, Conflict Resolution.',
  },
  motivation: {
    label: 'Motivation, visa & logistics',
    short: 'Motivation',
    icon: Icon.Map,
    blurb: 'Why you, why here, what you cost, and when you can start. Easy to prepare, costly to fumble.',
  },
  experience: {
    label: 'Your own history',
    short: 'Your history',
    icon: Icon.User,
    blurb: 'Drawn from your actual CV — the projects, the gaps and the incidents you will be asked about.',
  },
};

const CATEGORY_ORDER: InterviewCategory[] = [
  'behavioural',
  'servicedesk',
  'police',
  'motivation',
  'experience',
];

/** NZ Police publishes the framework it interviews against even though it
 *  never publishes the questions. Worth showing verbatim rather than making
 *  the reader infer it from the answers. */
const POLICE_VALUES = [
  'Professionalism',
  'Respect',
  'Integrity',
  'Commitment to Māori and the Treaty',
  'Empathy',
  'Valuing Diversity',
];
const POLICE_COMPETENCIES = ['Communicate', 'Partner', 'Solve', 'Resilience', 'Conflict Resolution'];

export function InterviewBank() {
  const [bank, setBank] = useState<Bank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InterviewCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [practiceMode, setPracticeMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const addingPresence = useAccordionPresence(adding);

  useEffect(() => {
    let alive = true;
    api.interviewBank
      .get()
      .then((b) => alive && setBank(b))
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, []);

  const refresh = () => api.interviewBank.get().then(setBank).catch(() => {});

  const patch = async (id: string, body: Parameters<typeof api.interviewBank.update>[1]) => {
    // Optimistic: a checkbox that waits on a round trip feels broken, and this
    // PATCH is a whole-file rewrite server-side so it's never instant.
    setBank((prev) =>
      prev
        ? { ...prev, questions: prev.questions.map((q) => (q.id === id ? { ...q, ...body } : q)) }
        : prev
    );
    try {
      setBank(await api.interviewBank.update(id, body));
    } catch {
      refresh();
    }
  };

  const questions = bank?.questions ?? [];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return questions.filter((q) => {
      if (filter !== 'all' && q.category !== filter) return false;
      if (!needle) return true;
      return (
        q.question.toLowerCase().includes(needle) ||
        q.answer.toLowerCase().includes(needle) ||
        q.hints.some((h) => h.toLowerCase().includes(needle))
      );
    });
  }, [questions, filter, query]);

  const counts = useMemo(() => {
    const map = new Map<InterviewCategory, number>();
    for (const q of questions) map.set(q.category, (map.get(q.category) ?? 0) + 1);
    return map;
  }, [questions]);

  const practisedCount = questions.filter((q) => q.practised).length;
  const overall = {
    score: questions.length ? Math.round((practisedCount / questions.length) * 100) : 0,
    breakdown: CATEGORY_ORDER.filter((c) => counts.get(c)).map((c) => {
      const inCat = questions.filter((q) => q.category === c);
      const done = inCat.filter((q) => q.practised).length;
      return {
        key: c,
        done: done === inCat.length,
        label: `${CATEGORY_META[c].short} — ${done}/${inCat.length} practised`,
      };
    }),
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-rose/30 bg-panel p-5 text-meta text-rose">
        Couldn't load the question bank — {error}
      </div>
    );
  }

  if (!bank) {
    return <div className="py-24 text-center text-body text-ink-faint">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <ReadinessBar readiness={overall} variant="full" title="Questions you can answer out loud" />

      {/* Toolbar. Search and filters stay pinned above the list rather than
          living in a collapsed menu — with 39 questions the filter is the
          primary navigation, not a secondary refinement. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search questions</span>
            <Icon.Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions, hints or answers…"
              className="field-input pl-9"
            />
          </label>

          <button
            onClick={() => setPracticeMode((v) => !v)}
            aria-pressed={practiceMode}
            className={`btn-quiet cursor-pointer ${
              practiceMode ? 'border-accent bg-accent/10 text-accent' : ''
            }`}
          >
            <Icon.Target className="h-4 w-4" />
            {practiceMode ? 'Practice mode on' : 'Practice mode'}
          </button>

          <button onClick={() => setAdding((v) => !v)} className="btn-primary cursor-pointer">
            <Icon.Plus className="h-4 w-4" />
            Add question
          </button>
        </div>

        {practiceMode && (
          <p className="rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-2.5 text-micro text-ink-soft">
            Everything is hidden. Answer each one <strong className="text-ink">out loud</strong>{' '}
            before you reveal anything — being able to recognise a good answer is not the same
            skill as producing one under pressure.
          </p>
        )}

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <FilterPill
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            label="All"
            count={questions.length}
          />
          {CATEGORY_ORDER.map((c) => (
            <FilterPill
              key={c}
              active={filter === c}
              onClick={() => setFilter(c)}
              label={CATEGORY_META[c].short}
              count={counts.get(c) ?? 0}
              icon={CATEGORY_META[c].icon}
            />
          ))}
        </div>
      </div>

      {addingPresence.mounted && (
        <div ref={addingPresence.ref} className="overflow-hidden">
          <AddQuestionForm
            onCancel={() => setAdding(false)}
            onAdded={(next) => {
              setBank(next);
              setAdding(false);
            }}
          />
        </div>
      )}

      {filter !== 'all' && (
        <p className="text-meta text-ink-soft">{CATEGORY_META[filter].blurb}</p>
      )}

      {filter === 'police' && (
        <section className="panel-inset px-5 py-4">
          <p className="mb-2 text-meta font-medium text-ink">What Police actually scores you on</p>
          <p className="mb-3 text-micro text-ink-faint">
            Police never publishes its interview questions, but it does publish the framework it
            interviews against. Map every answer below onto one of these rather than guessing at
            the question wording.
          </p>
          <div className="space-y-2.5">
            <div>
              <span className="section-label">Competencies</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {POLICE_COMPETENCIES.map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="section-label">Core values</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {POLICE_VALUES.map((v) => (
                  <span key={v} className="chip">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {visible.length === 0 ? (
        <div className="panel-empty px-6 py-16 text-center">
          <p className="text-subhead text-ink">Nothing matches</p>
          <p className="mt-1.5 text-meta text-ink-soft">
            {query ? `No question mentions "${query}".` : 'No questions in this category yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              practiceMode={practiceMode}
              onTogglePractised={() => patch(q.id, { practised: !q.practised })}
              onDeleted={setBank}
              onGenerated={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  icon: IconEl,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: (p: { className?: string }) => JSX.Element;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5
                  text-micro font-medium transition-colors duration-200
                  focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                  ${
                    active
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line text-ink-soft hover:bg-panel-2 hover:text-ink'
                  }`}
    >
      {IconEl && <IconEl className="h-3.5 w-3.5" />}
      {label}
      <span className={active ? 'text-accent/70' : 'text-ink-faint'}>{count}</span>
    </button>
  );
}

function QuestionCard({
  q,
  practiceMode,
  onTogglePractised,
  onDeleted,
  onGenerated,
}: {
  q: InterviewQuestion;
  practiceMode: boolean;
  onTogglePractised: () => void;
  onDeleted: (bank: Bank) => void;
  onGenerated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const openPresence = useAccordionPresence(open);
  const [showAnswer, setShowAnswer] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genLine, setGenLine] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  // Practice mode collapses everything back down when it's switched on, so
  // toggling it mid-session actually resets you rather than leaving whatever
  // you'd already revealed on screen.
  useEffect(() => {
    if (practiceMode) {
      setOpen(false);
      setShowAnswer(false);
    }
  }, [practiceMode]);

  useEffect(() => () => sourceRef.current?.close(), []);

  const Meta = CATEGORY_META[q.category];
  const answered = Boolean(q.answer);

  const copy = async () => {
    if (await copyText(q.answer)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setGenError(null);
    setGenLine('Starting Claude…');
    try {
      const { runId } = await api.interviewBank.generate(q.id);
      const source = new EventSource(`/api/claude/stream/${runId}`);
      sourceRef.current = source;
      source.onmessage = (event) => {
        const payload: { stream: string; line: string } = JSON.parse(event.data);
        if (payload.stream === 'done') {
          source.close();
          sourceRef.current = null;
          setGenerating(false);
          setGenLine(null);
          onGenerated();
          return;
        }
        setGenLine(payload.line.slice(0, 120));
      };
      source.onerror = () => {
        source.close();
        sourceRef.current = null;
        setGenerating(false);
        setGenLine(null);
        setGenError('Lost connection to the Claude process.');
      };
    } catch (err) {
      setGenerating(false);
      setGenLine(null);
      setGenError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async () => {
    try {
      onDeleted(await api.interviewBank.remove(q.id));
    } catch {
      /* the row simply stays — nothing destructive happened */
    }
  };

  return (
    <section
      className={`panel px-5 py-4 transition-colors duration-200 ${
        q.practised ? 'border-grass/30' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onTogglePractised}
          aria-pressed={Boolean(q.practised)}
          aria-label={q.practised ? 'Mark as not yet practised' : 'Mark as practised'}
          title={q.practised ? 'Practised' : 'Not practised yet'}
          className="mt-0.5 shrink-0 cursor-pointer rounded-full transition
                     focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
        >
          {q.practised ? (
            <Icon.CheckCircle className="h-5 w-5 text-grass" />
          ) : (
            <Icon.Circle className="h-5 w-5 text-ink-faint transition-colors hover:text-accent" />
          )}
        </button>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none
                     focus-visible:ring-[3px] focus-visible:ring-accent/30 rounded-lg"
        >
          <h3 className="text-subhead font-medium text-ink">{q.question}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="chip">
              <Meta.icon className="h-3 w-3" />
              {Meta.short}
            </span>
            {!answered && (
              <span className="chip border-amber/40 text-amber">
                <Icon.Warning className="h-3 w-3" />
                No answer yet
              </span>
            )}
            {q.source === 'user' && (
              <span className="chip border-line text-ink-faint">
                <Icon.Note className="h-3 w-3" />
                Added by you
              </span>
            )}
          </div>
        </button>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse' : 'Expand'}
          className="mt-0.5 shrink-0 cursor-pointer text-ink-faint transition hover:text-accent
                     focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30 rounded-full"
        >
          <Icon.Chevron className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {openPresence.mounted && (
        <div ref={openPresence.ref} className="overflow-hidden">
            <div className="mt-4 space-y-4 border-t border-line-soft pt-4">
              {q.hints.length > 0 && (
                <div>
                  <p className="section-label mb-2">How to approach it</p>
                  <ul className="space-y-1.5">
                    {q.hints.map((h, i) => (
                      <li key={i} className="flex gap-2 text-meta text-ink-soft">
                        <Icon.Arrow className="mt-[3px] h-3 w-3 shrink-0 text-accent" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {answered ? (
                showAnswer ? (
                  <div className="panel-inset px-4 py-3.5">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="section-label">Full answer</p>
                      <div className="flex gap-2">
                        <button onClick={copy} className="btn-ghost cursor-pointer">
                          {copied ? (
                            <>
                              <Icon.Check className="h-3 w-3 text-grass" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Icon.Copy className="h-3.5 w-3.5" />
                              Copy
                            </>
                          )}
                        </button>
                        <button onClick={() => setShowAnswer(false)} className="btn-ghost cursor-pointer">
                          Hide
                        </button>
                      </div>
                    </div>
                    <p className="text-meta leading-relaxed text-ink-soft">{q.answer}</p>
                    <p className="mt-3 text-micro text-ink-faint">
                      Say it in your own words. Reciting this verbatim will sound rehearsed, and an
                      interviewer can hear the difference.
                    </p>
                  </div>
                ) : (
                  <button onClick={() => setShowAnswer(true)} className="btn-quiet cursor-pointer">
                    <Icon.Doc className="h-3.5 w-3.5" />
                    Show full answer
                  </button>
                )
              ) : (
                <div className="panel-inset px-4 py-3.5">
                  <p className="text-meta text-ink-soft">
                    No answer written yet. Generating hands this question to Claude, which reads
                    your Candidate Key Facts and CV first so the answer only uses things you can
                    actually back up.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={generate}
                      disabled={generating}
                      className="btn-primary cursor-pointer disabled:cursor-wait disabled:opacity-60"
                    >
                      <Icon.Sparkles className="h-4 w-4" />
                      {generating ? 'Writing…' : 'Generate with Claude'}
                    </button>
                    {q.source === 'user' && !generating && (
                      <button onClick={remove} className="btn-ghost cursor-pointer text-rose">
                        <Icon.Trash className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                  {generating && (
                    <div className="mt-3">
                      {/* Existing app-wide indeterminate-progress class
                          (index.css) — reused instead of a second, GSAP
                          version of the same sliding-stripe loop. */}
                      <div className="progress-indeterminate h-1 w-full rounded-full" />
                      <p className="mt-1.5 truncate font-mono text-micro text-ink-faint">{genLine}</p>
                    </div>
                  )}
                  {genError && <p className="mt-2 text-micro text-rose">{genError}</p>}
                </div>
              )}

              {answered && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={generate}
                    disabled={generating}
                    className="btn-ghost cursor-pointer disabled:cursor-wait disabled:opacity-60"
                  >
                    <Icon.Sparkles className="h-3.5 w-3.5" />
                    {generating ? 'Rewriting…' : 'Rewrite with Claude'}
                  </button>
                  {q.source === 'user' && !generating && (
                    <button onClick={remove} className="btn-ghost cursor-pointer text-rose">
                      <Icon.Trash className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                  {generating && (
                    <span className="truncate font-mono text-micro text-ink-faint">{genLine}</span>
                  )}
                  {genError && <span className="text-micro text-rose">{genError}</span>}
                </div>
              )}
            </div>
        </div>
      )}
    </section>
  );
}

function AddQuestionForm({
  onAdded,
  onCancel,
}: {
  onAdded: (bank: Bank) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState<InterviewCategory>('behavioural');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = question.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { bank } = await api.interviewBank.add(text, category);
      onAdded(bank);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form onSubmit={submit} className="panel space-y-3 px-5 py-4">
      <div>
        <label className="field-label" htmlFor="new-question">
          The question, worded the way an interviewer would ask it
        </label>
        <input
          id="new-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Tell me about a time you had to say no to a customer."
          className="field-input"
          autoFocus
        />
      </div>

      <div>
        <span className="field-label">Category</span>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5
                          text-micro font-medium transition-colors duration-200
                          focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                          ${
                            category === c
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-line text-ink-soft hover:bg-panel-2 hover:text-ink'
                          }`}
            >
              {CATEGORY_META[c].short}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-micro text-rose">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={!question.trim() || saving} className="btn-primary cursor-pointer disabled:opacity-50">
          <Icon.Plus className="h-4 w-4" />
          {saving ? 'Adding…' : 'Add question'}
        </button>
        <button type="button" onClick={onCancel} className="btn-quiet cursor-pointer">
          Cancel
        </button>
      </div>
      <p className="text-micro text-ink-faint">
        Added with no answer. Open the card afterwards and hit Generate to have Claude write one
        from your real history.
      </p>
    </form>
  );
}
