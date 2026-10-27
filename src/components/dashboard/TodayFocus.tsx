import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icons';
import { api } from '../../api';
import { todayActions, type TodayActionKind } from '../../lib/priorities';
import type { Application } from '../../types';

type IconC = (p: { className?: string }) => JSX.Element;

// Hue follows meaning, same mapping as CommandCentre: grass = ready to go,
// accent = in flight, amber = prepare, rose = blocked.
export const KIND: Record<TodayActionKind, { label: string; button: string; icon: IconC; tone: string; hash?: string }> = {
  task: { label: 'Task due', button: 'Open task', icon: Icon.Clock, tone: 'text-rose border-rose/30 bg-rose/[0.06]' },
  prepare: { label: 'Interview', button: 'Prep now', icon: Icon.Target, tone: 'text-amber border-amber/30 bg-amber/[0.06]', hash: 'interview' },
  'follow-up': { label: 'Follow up', button: 'Follow up', icon: Icon.Mail, tone: 'text-accent border-accent/30 bg-accent/[0.06]' },
  'paste-ad': { label: 'Ad text', button: 'Paste ad', icon: Icon.Doc, tone: 'text-rose border-rose/30 bg-rose/[0.06]', hash: 'job-ad' },
  'create-cv': { label: 'No CV yet', button: 'Create CV', icon: Icon.Sparkles, tone: 'text-accent border-accent/30 bg-accent/[0.06]' },
  requirements: { label: 'Extras needed', button: 'See what', icon: Icon.Warning, tone: 'text-amber border-amber/30 bg-amber/[0.06]', hash: 'overview' },
  apply: { label: 'Ready', button: 'Open ad', icon: Icon.Paperplane, tone: 'text-grass border-grass/30 bg-grass/[0.06]' },
  improve: { label: 'Improve', button: 'Open', icon: Icon.Gauge, tone: 'text-amber border-amber/30 bg-amber/[0.06]', hash: 'fit' },
};

/** The Today list's data and handlers, shared by TodayFocus and the Matcha layout so both rank and act identically. */
export function useTodayActions(apps: Application[], onChanged: () => void) {
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      todayActions(apps)
        .map((t) => ({ ...t, app: apps.find((a) => a.id === t.id)! }))
        .filter((r) => r.app),
    [apps]
  );

  async function markTaskDone(app: Application, taskId: string) {
    setError(null);
    setBusyId(app.id);
    try {
      await api.tasks.update(app.id, taskId, { completedAt: new Date().toISOString() });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function act(kind: TodayActionKind, app: Application) {
    setError(null);
    if (kind === 'create-cv') {
      setBusyId(app.id);
      try {
        await api.requestCv(app.id);
        onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    } else if (kind === 'apply' && app.link) {
      window.open(app.link, '_blank', 'noopener,noreferrer');
    } else {
      navigate(`/role/${app.id}${KIND[kind].hash ? `#${KIND[kind].hash}` : ''}`);
    }
  }

  return { rows, busyId, error, act, markTaskDone };
}

export function TodayFocus({ apps, onChanged }: { apps: Application[]; onChanged: () => void }) {
  const navigate = useNavigate();
  const { rows, busyId, error, act, markTaskDone } = useTodayActions(apps, onChanged);

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section aria-labelledby="today-heading" className="studio-tile mb-6 p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft pb-4">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-accent">00 — Today</p>
          <h2 id="today-heading" className="mt-1 text-subhead font-semibold text-ink">
            {rows.length === 0 ? 'Nothing owing. Go find the next role.' : rows.length === 1 ? 'One thing to do.' : `${rows.length} things, in order.`}
          </h2>
        </div>
        <p className="font-mono text-micro text-ink-faint">{today}</p>
      </div>

      {rows.length > 0 && (
        <ol className="mt-2 divide-y divide-line-soft">
          {rows.map((r, i) => {
            const k = KIND[r.action];
            const disabled = busyId === r.app.id || (r.action === 'create-cv' && r.app.cvStatus === 'queued');
            return (
              <li key={r.app.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${i === 0 ? 'py-5' : 'py-3.5'}`}>
                <span
                  aria-hidden
                  className={`w-8 shrink-0 font-mono font-bold tabular-nums ${i === 0 ? 'text-3xl text-accent' : 'text-xl text-ink-faint'}`}
                >
                  {i + 1}
                </span>
                <button
                  onClick={() => navigate(`/role/${r.app.id}`)}
                  className="min-w-0 flex-1 basis-56 text-left"
                >
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-label font-semibold uppercase tracking-wide ${k.tone}`}>
                    <k.icon className="h-3 w-3" />
                    {k.label}
                  </span>
                  <span className={`mt-1 block truncate font-medium text-ink ${i === 0 ? 'text-body' : 'text-meta'}`}>
                    {r.app.role} <span className="font-normal text-ink-soft">· {r.app.company}</span>
                  </span>
                  <span className="mt-0.5 block text-micro text-ink-soft">{r.reason}</span>
                </button>
                <button
                  onClick={() => act(r.action, r.app)}
                  disabled={disabled}
                  className={`${i === 0 ? 'btn-primary' : 'btn-ghost'} shrink-0 text-micro disabled:opacity-50`}
                >
                  {busyId === r.app.id ? <Icon.Clock className="h-3.5 w-3.5 animate-spin" /> : <k.icon className="h-3.5 w-3.5" />}
                  {r.action === 'create-cv' && r.app.cvStatus === 'queued' ? 'Queued' : k.button}
                </button>
                {r.action === 'task' && r.taskId && (
                  <button
                    onClick={() => markTaskDone(r.app, r.taskId!)}
                    disabled={disabled}
                    className="btn-ghost shrink-0 text-micro disabled:opacity-50"
                  >
                    <Icon.Check className="h-3.5 w-3.5" />
                    Done
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {error && <p className="mt-2 text-micro text-rose">{error}</p>}
    </section>
  );
}
