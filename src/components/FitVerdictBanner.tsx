import { useState } from 'react';
import { Icon } from './Icons';
import type { Analysis } from '../types';

type Verdict = NonNullable<Analysis['recommendation']>['verdict'];

const VERDICT_META: Record<
  Verdict,
  {
    label: string;
    tone: 'grass' | 'amber' | 'rose';
    icon: (p: { className?: string }) => JSX.Element;
    wash: string;
    border: string;
    text: string;
  }
> = {
  'strong-apply': {
    label: 'Strong match — worth applying',
    tone: 'grass',
    icon: Icon.CheckCircle,
    wash: 'bg-grass/[0.06]',
    border: 'border-grass/30',
    text: 'text-grass',
  },
  apply: {
    label: 'Good match — worth applying',
    tone: 'grass',
    icon: Icon.Check,
    wash: 'bg-grass/[0.06]',
    border: 'border-grass/30',
    text: 'text-grass',
  },
  borderline: {
    label: 'Borderline — read the gaps first',
    tone: 'amber',
    icon: Icon.Triangle,
    wash: 'bg-amber/[0.06]',
    border: 'border-amber/30',
    text: 'text-amber',
  },
  skip: {
    label: 'Skip — a real blocker',
    tone: 'rose',
    icon: Icon.Octagon,
    wash: 'bg-rose/[0.06]',
    border: 'border-rose/30',
    text: 'text-rose',
  },
};

/**
 * The direct "does this job suit me" answer, front and centre on the role
 * page (v2.5, 19 Aug 2026) — distinct from AnalysisPanel/AtsScorePanel below
 * it, which explain the score. This is the verdict plus the two actions that
 * follow from it: generate the CV/cover letter, or skip the role outright.
 */
export function FitVerdictBanner({
  recommendation,
  onGenerateCv,
  onCancelCv,
  cvBusy,
  cvQueued,
  cvDone,
  onSkip,
  skipBusy,
  skipConfirming,
  onDeleteLocal,
  deleteLocalBusy,
  userFacts,
  onSaveFacts,
}: {
  recommendation: NonNullable<Analysis['recommendation']>;
  onGenerateCv: () => void;
  onCancelCv: () => void;
  cvBusy: boolean;
  cvQueued: boolean;
  /** True once a CV/cover letter genuinely exists for this entry (see
   *  `isCvActuallyDone` — `cvStatus`, or real files on disk if `cvStatus`
   *  never caught up), so the primary action becomes a re-queue rather
   *  than a first generate. */
  cvDone: boolean;
  /** First click arms the confirm, second click (within RoleDetail's own
   *  timeout) actually fires — deliberately not a native `confirm()`, per
   *  this app's existing convention of in-page confirms over browser dialogs. */
  onSkip: () => void;
  skipBusy: boolean;
  skipConfirming: boolean;
  /** One click, no confirm — unlike the Edit page's full Delete, this only
   *  drops the local applications.json row. The Notion row stays as the
   *  dedupe log, so it's cheap to reverse the impact of a misclick: nothing
   *  outside this app's own list is lost. */
  onDeleteLocal: () => void;
  deleteLocalBusy: boolean;
  /** Kironraj's own corrections to this verdict — see Application.userFacts.
   *  The verdict is Claude reading an ad; this is the candidate reading it
   *  back. A wrong "skip" used to be a dead end: the only two actions were
   *  accept it or drop the role, with nowhere to say "I *am* eligible, here's
   *  the clause you misread". */
  userFacts: string;
  onSaveFacts: (facts: string) => Promise<void>;
}) {
  const meta = VERDICT_META[recommendation.verdict] ?? VERDICT_META.borderline;
  const VerdictIcon = meta.icon;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(userFacts);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSaveFacts(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const openEditor = () => {
    setDraft(userFacts);
    setEditing(true);
  };

  return (
    <div className={`rounded-2xl border ${meta.border} ${meta.wash} p-4 sm:p-5`}>
      <div className="flex items-start gap-2.5">
        <VerdictIcon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.text}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-subhead font-semibold ${meta.text}`}>{meta.label}</p>
          <p className="mt-1.5 text-meta leading-relaxed text-ink-soft">{recommendation.reasoning}</p>
        </div>
      </div>

      {/* Saved corrections, shown whenever they exist — the point of the
          field is that Claude is acting on it, so it has to be visible that
          it's in play rather than buried in a collapsed editor. */}
      {userFacts && !editing && (
        <div className="mt-4 rounded-xl border border-accent/40 bg-accent/[0.05] px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-micro font-medium text-accent">
              <Icon.Note className="h-3.5 w-3.5" />
              Your corrections — Claude uses these
            </span>
            <button onClick={openEditor} className="text-micro text-ink-faint underline hover:text-ink">
              Edit
            </button>
          </div>
          <p className="whitespace-pre-wrap text-meta leading-relaxed text-ink-soft">{userFacts}</p>
        </div>
      )}

      {editing && (
        <div className="mt-4">
          <label className="field-label" htmlFor="fit-user-facts">
            What did this verdict get wrong?
          </label>
          <textarea
            id="fit-user-facts"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="field-input mt-1.5 min-h-[110px] resize-y"
            placeholder={
              "Facts about you that the ad or the CV doesn't spell out. For example:\n" +
              '· I am eligible — the ad allows work-visa holders in this stream\n' +
              '· I have hands-on Docker experience from my homelab\n' +
              '· I ran the telecom CRM rollout at Height8, not just supported it'
            }
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
              <Icon.Check className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} className="btn-ghost">
              Cancel
            </button>
            <span className="text-micro text-ink-faint">
              Rides along with the next CV or fit-check request.
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {cvDone ? (
          <>
            <span className="chip border-grass/40 text-grass">
              <Icon.CheckCircle className="h-3.5 w-3.5" />
              CV & cover letter generated
            </span>
            <button
              onClick={cvQueued ? onCancelCv : onGenerateCv}
              disabled={cvBusy}
              className="btn-ghost disabled:opacity-50"
            >
              <Icon.Doc className="h-3.5 w-3.5" />
              {cvQueued ? 'Re-queued — click to cancel' : 'Re-queue'}
            </button>
          </>
        ) : (
          <button
            onClick={cvQueued ? onCancelCv : onGenerateCv}
            disabled={cvBusy}
            className="btn-primary disabled:opacity-50"
          >
            <Icon.Doc className="h-3.5 w-3.5" />
            {cvQueued ? 'CV queued — click to cancel' : 'Generate CV & cover letter'}
          </button>
        )}
        <button
          onClick={onSkip}
          disabled={skipBusy}
          className={`btn-ghost disabled:opacity-50 ${skipConfirming ? 'border-rose/50 text-rose' : ''}`}
        >
          <Icon.Withdrawn className="h-3.5 w-3.5" />
          {skipConfirming ? 'Click again to confirm' : 'Skip this role'}
        </button>
        <button
          onClick={onDeleteLocal}
          disabled={deleteLocalBusy}
          title="Removes it from this app's list only — the Notion row stays, so re-logging the same job gets caught as a duplicate."
          className="btn-ghost disabled:opacity-50"
        >
          <Icon.Trash className="h-3.5 w-3.5" />
          {deleteLocalBusy ? 'Deleting…' : 'Delete'}
        </button>
        {/* The third option the banner was missing: disagree with it. Sits
            beside accept/skip because that's where the dead end was. */}
        {!editing && !userFacts && (
          <button onClick={openEditor} className="btn-ghost">
            <Icon.Note className="h-3.5 w-3.5" />
            Add context / correct this
          </button>
        )}
      </div>
    </div>
  );
}
