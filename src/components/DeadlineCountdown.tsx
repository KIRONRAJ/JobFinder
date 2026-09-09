import { useEffect, useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import { useDismissed } from '../lib/dismissed';
import type { Application, ApplicationTask } from '../types';

interface Props {
  apps: Application[];
  onOpen: (app: Application) => void;
}

const DONE_VISIBLE_MS = 72 * 3_600_000;
const URGENT_MS = 24 * 3_600_000;

interface Resolved {
  app: Application;
  task: ApplicationTask;
  dueMs: number;
  completedMs: number | null;
}

function parseWhen(value: string | number | undefined): number | null {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

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

function pickTask(apps: Application[], now: number, isDismissed: (id: string) => boolean): Resolved | null {
  const all: Resolved[] = [];

  for (const app of apps) {
    if (app.status === 'rejected' || app.status === 'withdrawn') continue;
    for (const task of app.tasks ?? []) {
      const dueMs = Date.parse(task.dueAt);
      if (Number.isNaN(dueMs)) continue;
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
  const bannerRef = useRef<HTMLDivElement>(null);
  const resolved = pickTask(apps, now, isDismissed);
  const live = resolved !== null && resolved.completedMs === null;

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  useGSAP(
    () => {
      if (!bannerRef.current) return;
      const reduce = prefersReducedMotion();
      if (!reduce) {
        gsap.from(bannerRef.current, {
          y: -10,
          opacity: 0,
          duration: 0.35,
          ease: 'back.out(1.8)',
        });
      }
    },
    { scope: bannerRef, dependencies: [resolved?.task.id] }
  );

  if (!resolved) return null;

  const { app, task, dueMs, completedMs } = resolved;

  if (completedMs !== null) {
    return (
      <BannerShell
        containerRef={bannerRef}
        app={app}
        onOpen={onOpen}
        onDismiss={() => dismiss(taskBannerId(app.id, task.id))}
        badge="Task Completed"
        badgeStyle="border-grass/30 bg-grass/10 text-grass"
        tone="border-line bg-panel shadow-hardSm hover:shadow-hardMd"
        icon={<Icon.CheckCircle className="h-4 w-4 text-grass" />}
        label={`${task.label} — submitted`}
        trailing={
          <span className="rounded border border-line-soft bg-panel-2 px-2.5 py-1 text-micro font-mono text-ink-soft">
            Done {new Date(completedMs).toLocaleString('en-NZ', {
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
  const critical = !expired && remainingMs <= 6 * 3_600_000;

  return (
    <BannerShell
      containerRef={bannerRef}
      app={app}
      onOpen={onOpen}
      onDismiss={() => dismiss(taskBannerId(app.id, task.id))}
      badge={expired ? 'Overdue' : critical ? 'Critical Deadline' : urgent ? 'Urgent Deadline' : 'Upcoming Task'}
      badgeStyle={
        expired
          ? 'border-rose/30 bg-rose/10 text-rose'
          : critical
            ? 'border-rose/30 bg-rose/15 text-rose animate-pulse'
            : urgent
              ? 'border-amber/30 bg-amber/15 text-amber'
              : 'border-accent/30 bg-accent/10 text-accent'
      }
      tone="border-line bg-panel shadow-hardSm hover:shadow-hardMd"
      icon={
        expired ? (
          <Icon.Triangle className="h-4 w-4 text-rose" />
        ) : (
          <Icon.Clock className={`h-4 w-4 ${critical ? 'text-rose animate-pulse' : urgent ? 'text-amber' : 'text-accent'}`} />
        )
      }
      label={expired ? `${task.label} (Window passed)` : task.label}
      trailing={
        expired ? (
          <span className="rounded border border-rose/30 bg-rose/10 px-2 py-1 text-micro font-mono text-rose">
            Due {new Date(dueMs).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
        ) : (
          <div className="flex items-center gap-1 font-mono text-micro tabular-nums">
            {days > 0 && (
              <span className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-semibold text-ink shadow-hardXs">
                {days}<span className="ml-0.5 text-[10px] text-ink-faint">d</span>
              </span>
            )}
            <span className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-semibold text-ink shadow-hardXs">
              {pad(hours)}<span className="ml-0.5 text-[10px] text-ink-faint">h</span>
            </span>
            <span className="font-bold text-ink-faint">:</span>
            <span className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-semibold text-ink shadow-hardXs">
              {pad(minutes)}<span className="ml-0.5 text-[10px] text-ink-faint">m</span>
            </span>
            <span className="font-bold text-ink-faint">:</span>
            <span
              className={`rounded border px-1.5 py-0.5 font-semibold shadow-hardXs ${
                critical
                  ? 'border-rose bg-rose/10 text-rose animate-pulse'
                  : urgent
                    ? 'border-amber bg-amber/10 text-amber'
                    : 'border-accent/40 bg-accent/10 text-accent'
              }`}
            >
              {pad(seconds)}<span className="ml-0.5 text-[10px] opacity-70">s</span>
            </span>
          </div>
        )
      }
      note={task.note}
    />
  );
}

function BannerShell({
  containerRef,
  app,
  onOpen,
  onDismiss,
  badge,
  badgeStyle,
  tone,
  icon,
  label,
  trailing,
  note,
}: {
  containerRef?: React.Ref<HTMLDivElement>;
  app: Application;
  onOpen: (app: Application) => void;
  onDismiss: () => void;
  badge: string;
  badgeStyle: string;
  tone: string;
  icon: JSX.Element;
  label: string;
  trailing: JSX.Element;
  note?: string;
}) {
  return (
    <div
      ref={containerRef}
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border-2 p-3.5 transition-all ${tone}`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
        <span
          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeStyle}`}
        >
          {icon}
          {badge}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-meta font-medium">
          <span className="truncate text-ink">{label}</span>
          <span className="truncate text-ink-soft">
            <span className="text-ink-faint">for</span> {app.role}{' '}
            <span className="text-ink-faint">· {app.company}</span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        <button
          type="button"
          onClick={() => onOpen(app)}
          title={note || 'Open application'}
          className="btn-quiet rounded px-2 py-1 text-micro text-accent hover:bg-accent/10 transition"
        >
          View Role ➔
        </button>
        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss banner"
          aria-label={`Dismiss ${label}`}
          className="rounded p-1 text-ink-faint transition hover:bg-ink/10 hover:text-ink"
        >
          <Icon.Close className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
