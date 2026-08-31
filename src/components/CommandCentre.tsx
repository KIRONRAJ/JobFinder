import { useMemo, useState } from 'react';
import { Icon } from './Icons';
import { api } from '../api';
import { pickPriorities } from '../lib/priorities';
import type { Application, Priority } from '../types';

interface Props {
  apps: Application[];
  onOpen: (app: Application) => void;
  onOpenTerminal: () => void;
  /** Called after an auto-pick succeeds so the parent can refresh the list. */
  onAutoPicked?: () => void;
}

const ACTION_LABEL: Record<Priority['action'], string> = {
  apply: 'Apply',
  'follow-up': 'Follow up',
  improve: 'Improve',
  prepare: 'Prepare',
};

const ACTION_ICON: Record<Priority['action'], (p: { className?: string }) => JSX.Element> = {
  apply: Icon.Paperplane,
  'follow-up': Icon.Mail,
  improve: Icon.Sparkles,
  prepare: Icon.Target,
};

/** Left accent bar per action, reusing the app's fixed status hues so the
 *  meaning stays consistent with everything else that uses them (apply/ready
 *  = grass, follow-up/in-flight = accent, prepare/interview-adjacent = amber,
 *  improve/blocking gap = rose — same step DeadlineTag uses for "closed"). */
const ACTION_ACCENT: Record<Priority['action'], string> = {
  apply: 'border-l-grass',
  'follow-up': 'border-l-accent',
  prepare: 'border-l-amber',
  improve: 'border-l-rose',
};

interface Row {
  app: Application;
  rank: number;
  reason: string;
  action: Priority['action'];
  computed: boolean;
}

/**
 * Top-of-page panel showing up to three ranked priorities. Priorities can be
 * set two ways: Claude drafts them from chat with judgement (setBy: 'claude'),
 * or the app auto-picks them from deterministic rules over deadlines +
 * readiness (setBy: 'app') when Kironraj hits "Auto-pick" below.
 *
 * A third case — nothing set at all — used to render an empty prompt box in
 * the single most valuable spot on the homepage. It hardly ever fired: only
 * 3 of 49 real entries ever had a `priority`. Now that case computes the same
 * deterministic ranking live (`pickPriorities`, unsaved) and shows it instead,
 * so this panel is never empty while any real application has something
 * genuinely owing. A live Claude-authored or already-persisted pick always
 * takes precedence over the computed fallback.
 */
export function CommandCentre({ apps, onOpen, onOpenTerminal, onAutoPicked }: Props) {
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const now = Date.now();
  const live = apps
    .filter((a) => a.priority && (!a.priority.expiresAt || a.priority.expiresAt > now))
    .sort((a, b) => (a.priority!.rank ?? 99) - (b.priority!.rank ?? 99))
    .slice(0, 3);

  // Only computed when nothing live exists — a persisted or Claude-drafted
  // priority always wins, never gets silently overridden by the fallback.
  const computed = useMemo(() => (live.length === 0 ? pickPriorities(apps) : []), [apps, live.length]);

  const rows: Row[] =
    live.length > 0
      ? live.map((app) => ({
          app,
          rank: app.priority!.rank,
          reason: app.priority!.reason,
          action: app.priority!.action,
          computed: false,
        }))
      : computed
          .map((p) => apps.find((a) => a.id === p.id))
          .map((app, i) =>
            app
              ? { app, rank: i + 1, reason: computed[i].reason, action: computed[i].action, computed: true }
              : null
          )
          .filter((r): r is Row => r !== null);

  async function handleAutoPick() {
    setPicking(true);
    setPickError(null);
    try {
      await api.autoPickPriorities();
      onAutoPicked?.();
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err));
    } finally {
      setPicking(false);
    }
  }

  const autoPickBtn = (
    <button
      onClick={handleAutoPick}
      disabled={picking}
      title="Rank up to 3 entries by deadline, follow-up date, and readiness — and save it, unlike the live preview below"
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-label
                 font-medium text-ink-soft transition hover:border-accent hover:text-accent
                 disabled:cursor-default disabled:opacity-60
                 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
    >
      {picking ? (
        <Icon.Clock className="h-3 w-3 animate-spin" />
      ) : (
        <Icon.Sparkles className="h-3 w-3" />
      )}
      {picking ? 'Picking…' : rows.length === 0 || rows[0]?.computed ? 'Save this ranking' : 'Re-pick'}
    </button>
  );

  if (rows.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-dashed border-line bg-panel/50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-micro uppercase tracking-wide text-ink-faint">
            <Icon.Zap className="h-3.5 w-3.5" />
            Today's priorities
          </div>
          <button onClick={onOpenTerminal} className="link-quiet">
            <Icon.Terminal className="h-3.5 w-3.5" />
            Ask Claude
          </button>
        </div>
        <p className="mt-2 text-meta text-ink-soft">
          Nothing owing right now, by deadline, follow-up, or readiness — genuinely nothing on
          the whole pipeline needs today's attention. Ask Claude in chat (
          <kbd className="font-mono text-micro">Ctrl J</kbd>) if you want a judgement call instead
          of a rule-based one.
        </p>
      </div>
    );
  }

  const allComputed = rows.every((r) => r.computed);

  return (
    <div className="mb-6 rounded-2xl border border-line bg-panel/70 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-micro font-semibold uppercase tracking-wide text-ink-soft">
          <Icon.Zap className="h-3.5 w-3.5 text-accent" />
          Today's priorities
          <span
            title={
              allComputed
                ? 'Computed live from deadlines, follow-ups and readiness — not saved'
                : 'At least one priority was auto-picked from deterministic rules'
            }
            className="rounded-full border border-line px-1.5 py-[1px] text-label font-medium
                       uppercase tracking-wide text-ink-faint"
          >
            {allComputed ? 'live preview' : 'auto'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-label text-ink-faint">{rows.length} shown</span>
          {autoPickBtn}
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const ActionIcon = ACTION_ICON[row.action];
          return (
            <li key={row.app.id}>
              <button
                onClick={() => onOpen(row.app)}
                className={`group flex w-full items-start gap-3 rounded-xl border-l-2 py-2.5 pl-2.5 pr-3
                            text-left transition hover:bg-panel-2/60 ${ACTION_ACCENT[row.action]}`}
              >
                <span className="mt-[2px] text-micro font-mono tabular-nums text-ink-faint">
                  {row.rank}.
                </span>
                <span className="mt-[2px] shrink-0 text-accent">
                  <ActionIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-meta font-medium text-ink">
                      {ACTION_LABEL[row.action]} — {row.app.role}
                    </span>
                    <span className="text-micro text-ink-soft">
                      {row.app.company}
                      {row.app.location ? ` · ${row.app.location}` : ''}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-micro text-ink-soft">{row.reason}</span>
                </span>
                <Icon.Arrow className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100" />
              </button>
            </li>
          );
        })}
      </ul>

      {pickError && <p className="mt-2 text-micro text-rose">Auto-pick failed — {pickError}</p>}
    </div>
  );
}
