import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import type { Application, InterviewPack } from '../types';

/**
 * Shown once `entry.interview` has been drafted by Claude — replaces the
 * generic `InterviewPrep` for that entry. Everything here is rendered from
 * stored data; the countdown is the only live piece.
 */
export function InterviewWarRoom({ app }: { app: Application }) {
  const pack = app.interview;
  if (!pack) return null;

  const drafted = pack.draftedAt
    ? new Date(pack.draftedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null;

  return (
    <div className="rounded-2xl border border-amber/30 bg-amber/[0.04] px-4 py-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-meta font-medium text-amber">
          <Icon.Chat className="h-4 w-4" />
          Interview war room
        </div>
        <div className="flex items-center gap-4 text-micro text-ink-soft">
          {pack.medium && <span>{pack.medium}</span>}
          <Countdown when={pack.when} />
        </div>
      </header>

      {pack.companyResearch && (
        <Section title="Company research">
          <p className="whitespace-pre-wrap text-meta leading-relaxed text-ink-soft">
            {pack.companyResearch}
          </p>
        </Section>
      )}

      {pack.starAnswers && pack.starAnswers.length > 0 && (
        <Section title="STAR stories">
          <ol className="space-y-3">
            {pack.starAnswers.map((s, i) => (
              <li key={i} className="rounded-xl border border-line bg-panel-2/60 px-3 py-2.5">
                <p className="text-meta font-medium text-ink">{s.question}</p>
                <p className="mt-1.5 whitespace-pre-wrap text-micro leading-relaxed text-ink-soft">
                  {s.answer}
                </p>
                {s.evidenceKeys && s.evidenceKeys.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1.5 text-label text-ink-faint">
                    Backed by:
                    {s.evidenceKeys.map((k) => (
                      <span key={k} className="rounded-full bg-panel-2 px-2 py-[1px]">
                        {k}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {pack.technicalQs && pack.technicalQs.length > 0 && (
        <Section title="Technical questions">
          <QuestionList items={pack.technicalQs} />
        </Section>
      )}

      {pack.behaviouralQs && pack.behaviouralQs.length > 0 && (
        <Section title="Behavioural questions">
          <QuestionList items={pack.behaviouralQs} />
        </Section>
      )}

      {pack.questionsToAsk && pack.questionsToAsk.length > 0 && (
        <Section title="Ask them">
          <QuestionList items={pack.questionsToAsk} />
        </Section>
      )}

      {pack.weakAnswerFlags && pack.weakAnswerFlags.length > 0 && (
        <Section title="Weak-answer flags">
          <ul className="space-y-1.5">
            {pack.weakAnswerFlags.map((flag, i) => (
              <li key={i} className="flex gap-2 text-micro leading-relaxed">
                <Icon.Warning className="mt-[3px] h-3 w-3 shrink-0 text-amber" />
                <span className="text-ink-soft">{flag}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {drafted && (
        <p className="mt-4 text-label text-ink-faint">Drafted {drafted} by Claude</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-1.5 text-micro font-medium uppercase tracking-wide text-ink-faint">
        {title}
      </p>
      {children}
    </div>
  );
}

function QuestionList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((q, i) => (
        <li key={i} className="flex gap-2 text-meta leading-snug text-ink-soft">
          <span className="mt-[2px] w-4 shrink-0 font-mono text-label tabular-nums text-ink-faint">
            {i + 1}.
          </span>
          <span>{q}</span>
        </li>
      ))}
    </ol>
  );
}

/** Ticks every 60s once mounted; only re-renders itself, not the whole pack. */
function Countdown({ when }: { when?: InterviewPack['when'] }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!when) return null;
  const target = new Date(when).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - Date.now();
  const absMin = Math.round(Math.abs(diffMs) / 60_000);
  const absHr = Math.round(absMin / 60);
  const absDay = Math.round(absHr / 24);

  const label =
    absMin < 60
      ? `${absMin}m`
      : absHr < 48
        ? `${absHr}h ${absMin % 60}m`
        : `${absDay}d`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${diffMs < 0 ? 'text-ink-faint' : 'text-amber'}`}
      title={new Date(when).toLocaleString()}
    >
      <Icon.Clock className="h-3 w-3" />
      {diffMs < 0 ? `Interview was ${label} ago` : `In ${label}`}
    </span>
  );
}
