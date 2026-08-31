import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { useDismissed } from '../lib/dismissed';
import type { Application, ApplicationTask } from '../types';

interface Props {
  apps: Application[];
  onOpen: (app: Application) => void;
}

/**
 * The task banner above the list.
 *
 * This used to be a hardcoded countdown to one date constant (the NZ Police
 * Sova assessment, 17 Aug 2026 23:59 AEST). That design had two faults, and
 * both bit on the same day: it couldn't know the assessment had actually been
 * sat, so it kept counting down after the work was done, and the only way to
 * correct it was to edit the component.
 *
 * It now reads `entry.tasks` instead. Two rules make it useful rather than
 * decorative:
 *
 *  - It shows only things Kironraj still has to DO. An ad's closing `deadline`
 *    is deliberately NOT eligible — every outstanding closing date in the
 *    tracker belongs to a role already applied to, so counting down to one is
 *    noise dressed up as urgency.
 *  - A task that's been completed shows a short, calm acknowledgement instead
 *    of vanishing instantly, then retires itself after DONE_VISIBLE_MS. Going
 *    straight to nothing reads like the app lost the thing you just did.
 */

const DONE_VISIBLE_MS = 72 * 3_600_000;
const URGENT_MS = 24 * 3_600_000;

interface Resolved {
  app: Application;
  task: ApplicationTask;
  dueMs: number;
  completedMs: number | null;
}

/**
 * `ApplicationTask.completedAt` is typed as an ISO string, but these entries are
 * written by hand-rolled scripts that bypass the type system, and one wrote an
 * epoch number instead (the ARG assessment, 20 Aug 2026). `Date.parse` returns
 * NaN for that, so a finished task read as outstanding and the banner kept
 * nagging about work already done. Accept both rather than trusting the type.
 */
function parseWhen(value: string | number | undefined): number | null {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** What a dismissal is *about* — this exact task, not "the countdown banner",
 *  so a new task still gets to interrupt after this one is dismissed. */
export const taskBannerId = (appId: string, taskId: string) => `task:${appId}:${taskId}`;

function splitRemaining(ms: number) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Outstanding work first, soonest due; if there is none, the most recently
 *  completed task, so the banner can acknowledge it before retiring. */
function pickTask(apps: Application[], now: number, isDismissed: (id: string) => boolean): Resolved | null {
  const all: Resolved[] = [];

  for (const app of apps) {
    if (app.status === 'rejected' || app.status === 'withdrawn') continue;
    for (const task of app.tasks ?? []) {
      const dueMs = Date.parse(task.dueAt);
      if (Number.isNaN(dueMs)) continue; // a malformed date shouldn't blank the banner
      if (isDismissed(taskBannerId(app.id, task.id))) continue;
      const parsedDone = parseWhen(task.completedAt);
      all.push({
        app,
        task,
        dueMs,
        completedMs: parsedDone,
      });
    }
  }

  const outstanding = all
    .filter((r) => r.completedMs === null)
    .sort((a, b) => a.dueMs - b.dueMs);
  if (outstanding.length > 0) return outstanding[0];

  const recentlyDone = all
    .filter((r) => r.completedMs !== null && now - r.completedMs! < DONE_VISIBLE_MS)
    .sort((a, b) => b.completedMs! - a.completedMs!);
  return recentlyDone[0] ?? null;
}

export function DeadlineCountdown({ apps, onOpen }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const { isDismissed, dismiss } = useDismissed();
  const resolved = pickTask(apps, now, isDismissed);
  const live = resolved !== null && resolved.completedMs === null;

  // Only tick for a live countdown. A completed banner shows a fixed date, so
  // re-rendering it every second would be pure waste.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  if (!resolved) return null;

  const { app, task, dueMs, completedMs } = resolved;

  if (completedMs !== null) {
    return (
      <BannerShell
        app={app}
        onOpen={onOpen}
        onDismiss={() => dismiss(taskBannerId(app.id, task.id))}
        tone="border-grass/40 bg-grass/[0.06]"
        icon={<Icon.CheckCircle className="h-3.5 w-3.5" />}
        accent="text-grass"
        label={`${task.label} — submitted`}
        trailing={
          <span className="text-micro text-ink-soft">
            {new Date(completedMs).toLocaleString('en-NZ', {
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        }
        note={task.note}
      />
    );
  }

  const remainingMs = dueMs - now;
  const expired = remainingMs <= 0;
  const { days, hours, minutes, seconds } = splitRemaining(remainingMs);
  const urgent = !expired && remainingMs <= URGENT_MS;

  return (
    <BannerShell
      app={app}
      onOpen={onOpen}
      onDismiss={() => dismiss(taskBannerId(app.id, task.id))}
      tone={
        expired
          ? 'border-rose/40 bg-rose/[0.06]'
          : urgent
            ? 'border-rose/40 bg-rose/[0.06]'
            : 'border-amber/40 bg-amber/[0.06]'
      }
      icon={expired ? <Icon.Triangle className="h-3.5 w-3.5" /> : <Icon.Clock className="h-3.5 w-3.5" />}
      accent={expired || urgent ? 'text-rose' : 'text-amber'}
      label={expired ? `${task.label} — window closed, not marked done` : task.label}
      trailing={
        expired ? (
          <span className="text-micro text-rose">
            Due {new Date(dueMs).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
        ) : (
          <span className="flex items-center gap-1 font-mono text-meta tabular-nums text-ink">
            {days > 0 && <span>{days}d</span>}
            <span>{pad(hours)}h</span>
            <span>{pad(minutes)}m</span>
            <span>{pad(seconds)}s</span>
          </span>
        )
      }
      note={task.note}
    />
  );
}

function BannerShell({
  app,
  onOpen,
  onDismiss,
  tone,
  icon,
  accent,
  label,
  trailing,
  note,
}: {
  app: Application;
  onOpen: (app: Application) => void;
  onDismiss: () => void;
  tone: string;
  icon: JSX.Element;
  accent: string;
  label: string;
  trailing: JSX.Element;
  note?: string;
}) {
  // The shell is a div, not a button: the dismiss control has to be a real
  // button and nesting one inside another is invalid HTML (and breaks the
  // click target in practice). The open action gets its own button instead.
  return (
    <div className={`mb-4 flex items-center gap-2 rounded-2xl border px-4 py-2.5 transition ${tone}`}>
      <button
        onClick={() => onOpen(app)}
        title={note}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5 text-left
                   focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                   rounded-lg hover:brightness-[1.03]"
      >
        <span className={`flex items-center gap-1.5 text-micro font-medium ${accent}`}>
          {icon}
          {label}
        </span>
        <span className="text-ink-soft">
          <span className="text-ink">{app.role}</span>
          <span className="text-ink-faint"> · {app.company}</span>
        </span>
        <span className="ml-auto">{trailing}</span>
      </button>
      <button
        onClick={onDismiss}
        title="Dismiss this banner"
        aria-label={`Dismiss ${label}`}
        className="shrink-0 rounded-lg p-1 text-ink-faint transition hover:bg-ink/10 hover:text-ink
                   focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
      >
        <Icon.Close className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
