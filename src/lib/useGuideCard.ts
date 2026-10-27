import { useState } from 'react';
import { copyText } from './clipboard';
import { studyGuideComplete } from '../types';
import type { StudyGuide, StudyGuideProgress } from '../types';

export const QUIZ_SCORES = [0, 1, 2, 3, 4, 5];

/** Per-guide readiness — the same 3-part model the plan describes: concepts
 *  read, exercise done, quiz passed (>=4/5). Deliberately not a weighted
 *  average of raw quiz score — a 3/5 quiz isn't "60% done with the quiz",
 *  it's "not yet passed", matching the index file's own retake rule. */
export function guideReadiness(p: StudyGuideProgress | undefined) {
  const checks = [
    { key: 'concepts', done: Boolean(p?.conceptsRead), label: 'Concepts read' },
    { key: 'exercise', done: Boolean(p?.exerciseDone), label: 'Hands-on exercise done' },
    { key: 'quiz', done: (p?.quizScore ?? 0) >= 4, label: 'Quiz passed (4/5 or better)' },
  ];
  const done = checks.filter((c) => c.done).length;
  return { score: Math.round((done / checks.length) * 100), breakdown: checks };
}

/** Everything a skill-guide card needs besides its markup: which quiz answers are revealed, the "copy suggestion
 *  for Claude" text and its copied flag, completion and readiness. Shared by the classic card and Matcha's. */
export function useGuideCard(guide: StudyGuide, progress: StudyGuideProgress | undefined) {
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

  return { revealed, toggleReveal, copied, copySuggestion, complete, readiness };
}
