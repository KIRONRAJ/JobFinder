import { useEffect, useState } from 'react';
import { MarkdownLite } from './MarkdownLite';
import { SkeletonPanels } from './SkeletonRows';
import { Icon } from './Icons';
import { TabStrip } from './TabStrip';
import { api } from '../api';
import type { AssessmentItem, AssessmentOutcome, AssessmentStore, AssessmentVisual } from '../types';

/**
 * Assessment prep — Study's fourth tab, rebuilt dynamic in v2.4.
 *
 * It used to be a single hardcoded component transcribed for exactly one
 * deadline (the NZ Police Sova test), which went stale the moment that test
 * was sat and had a comment on it saying "generalise this if a second one
 * appears". A second one appeared. Prep now lives in `data/assessments.json`,
 * one entry per real test, authored by Claude from the actual invite email
 * plus Candidate Key Facts — the app renders it and owns the lifecycle.
 *
 * Sat assessments are **archived, never deleted**: the prep written for a
 * test worth sitting is the best starting point for the next one of its kind,
 * and the outcome is part of the application's history.
 */

const KIND_META: Record<string, { label: string; icon: (p: { className?: string }) => JSX.Element }> = {
  psychometric: { label: 'Psychometric', icon: Icon.Gauge },
  'video-interview': { label: 'Video interview', icon: Icon.Chat },
  technical: { label: 'Technical', icon: Icon.Zap },
  interview: { label: 'Interview', icon: Icon.Chat },
  other: { label: 'Assessment', icon: Icon.Zap },
};

const OUTCOME_META: Record<
  Exclude<AssessmentOutcome, null>,
  { label: string; tone: string; icon: (p: { className?: string }) => JSX.Element }
> = {
  passed: { label: 'Passed', tone: 'border-grass/40 text-grass', icon: Icon.CheckCircle },
  failed: { label: 'Did not progress', tone: 'border-rose/40 text-rose', icon: Icon.Close },
  'no-result': { label: 'No result recorded', tone: 'text-ink-faint', icon: Icon.Circle },
};

/** Deadline urgency, from the ISO-with-offset dueAt. Hours matter here —
 *  these windows are routinely 72h, so a day-granularity chip would round a
 *  "due tomorrow morning" into a comfortable-looking "1 day". */
function dueLabel(dueAt?: string): { text: string; urgent: boolean; past: boolean } | null {
  if (!dueAt) return null;
  const t = Date.parse(dueAt);
  if (Number.isNaN(t)) return null;
  const ms = t - Date.now();
  const past = ms < 0;
  const hours = Math.abs(ms) / 3_600_000;
  if (past) return { text: 'Deadline passed', urgent: false, past: true };
  if (hours < 24) return { text: `Due in ${Math.max(1, Math.round(hours))}h`, urgent: true, past: false };
  const days = Math.round(hours / 24);
  return { text: `Due in ${days}d`, urgent: days <= 2, past: false };
}

export function AssessmentPrep() {
  const [store, setStore] = useState<AssessmentStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'archive'>('upcoming');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.assessments
      .get()
      .then((s) => {
        if (!alive) return;
        setStore(s);
        // Open the soonest upcoming one by default — on this tab there is
        // almost always exactly one thing that matters right now.
        const next = s.items.filter((a) => a.status === 'upcoming')[0];
        if (next) setOpenId(next.id);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, []);

  const archive = async (item: AssessmentItem, outcome: AssessmentOutcome) => {
    setBusyId(item.id);
    try {
      const s = await api.assessments.archive(item.id, outcome);
      setStore(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (item: AssessmentItem) => {
    setBusyId(item.id);
    try {
      const s = await api.assessments.restore(item.id);
      setStore(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-rose/30 bg-panel p-5 text-meta text-rose">
        Couldn't load assessments — {error}
      </div>
    );
  }
  if (!store) return <SkeletonPanels count={2} />;

  const upcoming = store.items.filter((a) => a.status === 'upcoming');
  const archived = store.items.filter((a) => a.status === 'archived');
  const shown = tab === 'upcoming' ? upcoming : archived;

  return (
    <div className="space-y-5">
      <TabStrip
        items={[
          { key: 'upcoming', label: 'Upcoming', count: upcoming.length, icon: Icon.Clock },
          { key: 'archive', label: 'Archive', count: archived.length, icon: Icon.CheckCircle },
        ]}
        active={tab}
        onPick={setTab}
        ariaLabel="Assessment status"
      />

      {shown.length === 0 ? (
        <div className="panel-empty px-6 py-16 text-center">
          <Icon.Zap className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
          <p className="text-subhead text-ink">
            {tab === 'upcoming' ? 'No assessment coming up' : 'Nothing archived yet'}
          </p>
          <p className="mt-1.5 text-meta text-ink-soft">
            {tab === 'upcoming'
              ? 'When an employer sends an assessment or interview invite, ask Claude in chat to add it — prep gets written from the actual invite email.'
              : 'Assessments you have sat are kept here with their outcome, not deleted.'}
          </p>
        </div>
      ) : (
        shown.map((item) => {
          const meta = KIND_META[item.kind] ?? KIND_META.other;
          const KindIcon = meta.icon;
          const due = dueLabel(item.dueAt);
          const open = openId === item.id;
          const outcome = item.outcome ? OUTCOME_META[item.outcome] : null;
          const OutcomeIcon = outcome?.icon;

          return (
            <section key={item.id} className="panel px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    onClick={() => setOpenId(open ? null : item.id)}
                    aria-expanded={open}
                    className="flex items-center gap-1.5 text-left text-subhead font-medium text-ink transition hover:text-accent"
                  >
                    <Icon.Chevron
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                    {item.title}
                  </button>
                  <p className="mt-0.5 text-meta text-ink-soft">
                    {item.role} · {item.company}
                    {item.platform ? ` · ${item.platform}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span className="chip">
                    <KindIcon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  {item.status === 'upcoming' && due && (
                    <span
                      className={`chip whitespace-nowrap ${
                        due.past ? 'border-rose/40 text-rose' : due.urgent ? 'border-amber/40 text-amber' : ''
                      }`}
                      title={item.dueAt}
                    >
                      {due.urgent || due.past ? (
                        <Icon.Warning className="h-3 w-3" />
                      ) : (
                        <Icon.Clock className="h-3 w-3" />
                      )}
                      {due.text}
                    </span>
                  )}
                  {outcome && OutcomeIcon && (
                    <span className={`chip whitespace-nowrap ${outcome.tone}`} title={item.outcomeNote}>
                      <OutcomeIcon className="h-3 w-3" />
                      {outcome.label}
                    </span>
                  )}
                </div>
              </div>

              {item.status === 'archived' && item.outcomeNote && (
                <p className="mt-2 text-micro text-ink-soft">{item.outcomeNote}</p>
              )}

              {/* Lifecycle controls. Archiving asks for the outcome inline
                  rather than in a modal — it's two clicks either way, and the
                  outcome is the only thing worth capturing at that moment. */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-3">
                {item.status === 'upcoming' ? (
                  <>
                    <span className="mr-1 text-micro text-ink-faint">Sat it? Archive with the outcome:</span>
                    <button
                      onClick={() => archive(item, 'passed')}
                      disabled={busyId === item.id}
                      className="btn-ghost"
                    >
                      <Icon.CheckCircle className="h-3.5 w-3.5 text-grass" />
                      Passed
                    </button>
                    <button
                      onClick={() => archive(item, 'failed')}
                      disabled={busyId === item.id}
                      className="btn-ghost"
                    >
                      <Icon.Close className="h-3.5 w-3.5 text-rose" />
                      Didn't progress
                    </button>
                    <button
                      onClick={() => archive(item, 'no-result')}
                      disabled={busyId === item.id}
                      className="btn-ghost"
                    >
                      <Icon.Circle className="h-3.5 w-3.5" />
                      Awaiting result
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => restore(item)}
                    disabled={busyId === item.id}
                    className="btn-ghost"
                    title="Move back to Upcoming"
                  >
                    <Icon.Arrow className="h-3.5 w-3.5 rotate-180" />
                    Restore to upcoming
                  </button>
                )}
                {item.links?.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost"
                  >
                    <Icon.External className="h-3.5 w-3.5" />
                    {l.label}
                  </a>
                ))}
              </div>

              {open && (
                <div className="mt-4 space-y-4 border-t border-line-soft pt-4">
                  {item.sections.map((s, i) => (
                    <div key={i} className="panel-inset px-4 py-3.5">
                      <MarkdownLite markdown={`## ${s.heading}\n\n${s.markdown}`} />
                    </div>
                  ))}

                  {item.showSpokeDiagram && <SpokeSequence />}

                  {item.visuals?.map((v, i) => <Visual key={i} itemId={item.id} visual={v} index={i} />)}

                  {item.practice && item.practice.length > 0 && (
                    <PracticeBlock practice={item.practice} />
                  )}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

/** Frame count → radial lines drawn at evenly spaced angles starting from
 *  12 o'clock, matching the Sova hub's "add one more spoke" sequence. Kept as
 *  a formula rather than hand-drawn SVGs so the sequence stays consistent. */
function SpokeFrame({ n, size = 64 }: { n: number; size?: number }) {
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const lines = Array.from({ length: n }, (_, i) => {
    const angle = -90 + (360 / Math.max(n, 1)) * i;
    const rad = (angle * Math.PI) / 180;
    return { x2: cx + r * Math.cos(rad), y2: cy + r * Math.sin(rad) };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-accent" />
      {lines.map((l, i) => (
        <line key={i} x1={cx} y1={cy} x2={l.x2} y2={l.y2} stroke="currentColor" strokeWidth={1.5} className="text-accent" />
      ))}
      <circle cx={cx} cy={cy} r={2.5} fill="currentColor" className="text-accent" />
    </svg>
  );
}

function SpokeSequence() {
  return (
    <div className="panel-inset px-4 py-3.5">
      <p className="mb-1 text-subhead font-medium text-ink">Logical reasoning — worked example</p>
      <p className="mb-3 text-micro text-ink-faint">
        The rotating-spoke sequence from Sova's own Candidate Preparation Hub, redrawn.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {[1, 2, 3].map((n) => (
          <SpokeFrame key={n} n={n} />
        ))}
        <span className="text-title text-ink-faint">?</span>
      </div>
      <p className="mt-3 text-meta text-ink-soft">
        One spoke is added each frame, evenly redistributed around the circle — so the next frame
        has four. The rule is <em>count</em>, not position: checking it against every frame rather
        than the last transition alone is what stops a rotation-based trap answer from looking right.
      </p>
    </div>
  );
}

/** Dispatches a generic visual spec to its renderer. */
function Visual({ itemId, visual, index }: { itemId: string; visual: AssessmentVisual; index: number }) {
  switch (visual.type) {
    case 'competency-wheel':
      return <CompetencyWheel title={visual.title} items={visual.items} />;
    case 'checklist':
      return (
        <PrepChecklist storageKey={`assessment-checklist:${itemId}:${index}`} title={visual.title} items={visual.items} />
      );
    case 'timer-bar':
      return <TimerBar title={visual.title} segments={visual.segments} />;
    default:
      return null;
  }
}

/** A ring of competency themes around a centre hub. Click a spoke to reveal
 *  the candidate's real, already-evidenced answer for that theme — this is
 *  the "which story goes with which question" map made visual and clickable,
 *  rather than a wall of prose the interview nerves will flatten on the day. */
function CompetencyWheel({
  title,
  items,
}: {
  title?: string;
  items: { label: string; evidence: string }[];
}) {
  const [active, setActive] = useState(0);
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 54;
  const n = items.length;

  return (
    <div className="panel-inset px-4 py-3.5">
      {title && <p className="mb-3 text-subhead font-medium text-ink">{title}</p>}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={1} className="text-line-soft" />
          {items.map((it, i) => {
            const angle = -90 + (360 / n) * i;
            const rad = (angle * Math.PI) / 180;
            const x = cx + r * Math.cos(rad);
            const y = cy + r * Math.sin(rad);
            const isActive = active === i;
            return (
              <g key={i}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={isActive ? 2 : 1}
                  className={isActive ? 'text-accent' : 'text-line-soft'}
                />
                <circle
                  cx={x}
                  cy={y}
                  r={isActive ? 28 : 24}
                  fill="currentColor"
                  className={isActive ? 'cursor-pointer text-accent/15' : 'cursor-pointer text-panel-2'}
                  stroke="currentColor"
                  strokeWidth={isActive ? 1.5 : 1}
                  onClick={() => setActive(i)}
                />
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={9}
                  className={`cursor-pointer select-none ${isActive ? 'fill-accent font-medium' : 'fill-current text-ink-soft'}`}
                  onClick={() => setActive(i)}
                >
                  {wrapLabel(it.label).map((line, li) => (
                    <tspan key={li} x={x} dy={li === 0 ? -((wrapLabel(it.label).length - 1) * 5) : 10}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={3} fill="currentColor" className="text-accent" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-meta font-medium text-ink">{items[active]?.label}</p>
          <p className="mt-1.5 text-meta text-ink-soft">{items[active]?.evidence}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {items.map((it, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`chip ${active === i ? 'border-accent/40 text-accent' : ''}`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Splits a short label onto up to two lines so it fits inside a spoke node. */
function wrapLabel(label: string): string[] {
  if (label.length <= 12) return [label];
  const words = label.split(' ');
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

/** An interactive prep checklist. State persists in localStorage per item —
 *  it isn't application data, just a "did I do this yet" scratch pad, so it
 *  doesn't need to round-trip through the server store. */
function PrepChecklist({
  storageKey,
  title,
  items,
}: {
  storageKey: string;
  title?: string;
  items: { label: string; note?: string }[];
}) {
  const [checked, setChecked] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const done = checked.size;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="panel-inset px-4 py-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        {title && <p className="text-subhead font-medium text-ink">{title}</p>}
        <span className="text-micro text-ink-faint">
          {done}/{items.length} ready
        </span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-2">
        {items.map((it, i) => {
          const isChecked = checked.has(i);
          return (
            <li key={i}>
              <button
                onClick={() => toggle(i)}
                className="flex w-full items-start gap-2.5 text-left"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition
                    ${isChecked ? 'border-accent bg-accent text-panel' : 'border-line text-transparent'}`}
                >
                  <Icon.Check className="h-2.5 w-2.5" />
                </span>
                <span className="min-w-0">
                  <span className={`text-meta ${isChecked ? 'text-ink-faint line-through' : 'text-ink'}`}>
                    {it.label}
                  </span>
                  {it.note && <span className="block text-micro text-ink-faint">{it.note}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A proportional horizontal time-budget bar — makes a spoken time limit
 *  ("30s to read, 90s to answer") legible as a shape, not just a number. */
function TimerBar({ title, segments }: { title?: string; segments: { label: string; seconds: number }[] }) {
  const total = segments.reduce((s, seg) => s + seg.seconds, 0) || 1;
  const palette = ['bg-accent', 'bg-grass', 'bg-amber', 'bg-rose'];
  return (
    <div className="panel-inset px-4 py-3.5">
      {title && <p className="mb-3 text-subhead font-medium text-ink">{title}</p>}
      <div className="flex h-6 w-full overflow-hidden rounded-full">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`${palette[i % palette.length]} flex items-center justify-center`}
            style={{ width: `${(seg.seconds / total) * 100}%` }}
            title={`${seg.label} — ${seg.seconds}s`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1.5 text-micro text-ink-soft">
            <span className={`h-2 w-2 rounded-full ${palette[i % palette.length]}`} />
            {seg.label} <span className="tabular-nums text-ink-faint">({seg.seconds}s)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PracticeBlock({ practice }: { practice: NonNullable<AssessmentItem['practice']> }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <div className="panel-inset px-4 py-3.5">
      <p className="mb-3 text-subhead font-medium text-ink">Practice questions</p>
      <ol className="space-y-4">
        {practice.map((q, i) => (
          <li key={i} className="border-t border-line-soft pt-4 first:border-t-0 first:pt-0">
            <span className="chip mb-1.5 border-line text-ink-faint">{q.kind}</span>
            {q.passage && <p className="mb-2 text-meta text-ink-soft">{q.passage}</p>}
            <p className="text-meta font-medium text-ink">{q.prompt}</p>
            {revealed.has(i) ? (
              <div className="mt-2">
                <p className="text-meta text-grass">Answer: {q.answer}</p>
                <p className="mt-1 text-micro text-ink-soft">{q.why}</p>
              </div>
            ) : (
              <button onClick={() => toggle(i)} className="link-quiet mt-2">
                Reveal answer
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
