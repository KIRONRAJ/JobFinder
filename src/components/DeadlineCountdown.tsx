import { useEffect, useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import { useDismissed } from '../lib/dismissed';
import { api } from '../api';
import type { Application, ApplicationTask, EventItem } from '../types';

interface Props {
  apps: Application[];
  events?: EventItem[];
  onOpen: (app: Application) => void;
  maxQueue?: number;
}

const DONE_VISIBLE_MS = 24 * 3_600_000;
const URGENT_MS = 24 * 3_600_000;

export interface ResolvedItem {
  kind: 'task' | 'event';
  id: string;
  app?: Application;
  task?: ApplicationTask;
  event?: EventItem;
  title: string;
  dueMs: number;
  endMs?: number;
  completedMs: number | null;
  badge?: string;
  location?: string;
  url?: string;
  note?: string;
  statusText?: string;
}

function parseWhen(value: string | number | undefined): number | null {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export const taskBannerId = (appId: string, taskId: string) => `task:${appId}:${taskId}`;
export const eventBannerId = (eventId: string) => `event:${eventId}`;

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

function pickQueue(
  apps: Application[],
  events: EventItem[],
  now: number,
  isDismissed: (id: string) => boolean,
  limit: number = 3
): { queue: ResolvedItem[]; recentlyDone: ResolvedItem | null } {
  const all: ResolvedItem[] = [];

  // 1. Gather application tasks
  for (const app of apps) {
    if (app.status === 'rejected' || app.status === 'withdrawn') continue;
    for (const task of app.tasks ?? []) {
      const dueMs = Date.parse(task.dueAt);
      if (Number.isNaN(dueMs)) continue;
      const bId = taskBannerId(app.id, task.id);
      if (isDismissed(bId)) continue;
      const parsedDone = parseWhen(task.completedAt);
      const isInterview =
        task.label.toLowerCase().includes('interview') ||
        task.label.toLowerCase().includes('assessment centre');
      all.push({
        kind: 'task',
        id: bId,
        app,
        task,
        title: task.label,
        dueMs,
        completedMs: parsedDone,
        badge: isInterview ? 'INTERVIEW / ASSESSMENT' : 'SKILLS ASSESSMENT',
        note: task.note,
      });
    }
  }

  // 2. Gather standalone calendar events (e.g. Summer of Tech Online Meet & Greet)
  for (const event of events) {
    const dueMs = Date.parse(event.start);
    if (Number.isNaN(dueMs)) continue;
    const bId = eventBannerId(event.id);
    if (isDismissed(bId)) continue;

    const endMs = event.end ? Date.parse(event.end) : dueMs + 2 * 3_600_000;
    const isCompleted =
      event.status?.toLowerCase().includes('completed') ||
      event.status?.toLowerCase().includes('debriefed') ||
      now > endMs;

    all.push({
      kind: 'event',
      id: bId,
      event,
      title: event.title,
      dueMs,
      endMs,
      completedMs: isCompleted ? endMs : null,
      badge: event.badge || 'CONFIRMED EVENT',
      location: event.location,
      url: event.url,
      note: event.notes,
      statusText: event.status,
    });
  }

  // Chronologically sort outstanding (incomplete) items
  const outstanding = all
    .filter((r) => r.completedMs === null)
    .sort((a, b) => a.dueMs - b.dueMs);

  if (outstanding.length > 0) {
    return {
      queue: outstanding.slice(0, Math.max(3, limit)),
      recentlyDone: null,
    };
  }

  // Fallback: recently completed task (within 24h)
  const recentlyDone = all
    .filter((r) => r.completedMs !== null && now - r.completedMs! < DONE_VISIBLE_MS)
    .sort((a, b) => b.completedMs! - a.completedMs!);

  return {
    queue: [],
    recentlyDone: recentlyDone[0] ?? null,
  };
}

export function DeadlineCountdown({ apps, events: propEvents, onOpen, maxQueue = 3 }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [loadedEvents, setLoadedEvents] = useState<EventItem[]>([]);
  const { isDismissed, dismiss } = useDismissed();
  const queueRef = useRef<HTMLDivElement>(null);

  // Fetch events on mount if not passed in props
  useEffect(() => {
    if (propEvents && propEvents.length > 0) return;
    api.events
      .get()
      .then((res) => {
        if (res?.items) setLoadedEvents(res.items);
      })
      .catch(() => {});
  }, [propEvents]);

  const activeEvents = propEvents && propEvents.length > 0 ? propEvents : loadedEvents;
  const { queue, recentlyDone } = pickQueue(apps, activeEvents, now, isDismissed, maxQueue);
  const live = queue.length > 0;

  // 1-second live countdown ticker
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  useGSAP(
    () => {
      if (!queueRef.current) return;
      const reduce = prefersReducedMotion();
      if (!reduce) {
        gsap.from(queueRef.current, {
          y: -10,
          opacity: 0,
          duration: 0.35,
          ease: 'back.out(1.8)',
        });
      }
    },
    { scope: queueRef, dependencies: [queue[0]?.id] }
  );

  // Mark event complete & close
  const handleCompleteEvent = async (evt: EventItem) => {
    try {
      await api.events.update(evt.id, { status: 'Completed & Closed' });
      setLoadedEvents((prev) =>
        prev.map((e) => (e.id === evt.id ? { ...e, status: 'Completed & Closed' } : e))
      );
    } catch {
      dismiss(eventBannerId(evt.id));
    }
  };

  // Mark task complete & close
  const handleCompleteTask = async (appId: string, taskId: string) => {
    try {
      await api.tasks.update(appId, taskId, {
        completedAt: new Date().toISOString(),
      });
      dismiss(taskBannerId(appId, taskId));
    } catch {
      dismiss(taskBannerId(appId, taskId));
    }
  };

  // Nothing upcoming or recently completed
  if (queue.length === 0 && !recentlyDone) return null;

  // Fallback: recently completed task banner
  if (queue.length === 0 && recentlyDone) {
    return (
      <div
        ref={queueRef}
        className="mb-5 rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-panel p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-grass/30 bg-grass/10 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase text-grass">
              <Icon.CheckCircle className="h-3.5 w-3.5 text-grass" />
              Task Completed
            </span>
            <span className="font-semibold text-ink text-sm">{recentlyDone.title}</span>
            {recentlyDone.app && (
              <button
                type="button"
                onClick={() => onOpen(recentlyDone.app!)}
                className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2.5 py-0.5 text-xs font-mono font-semibold text-ink hover:text-accent transition"
                title="Open full detailed view for this role"
              >
                <span>View Role ➔</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(recentlyDone.id)}
            className="rounded-full p-1 text-ink-faint hover:text-ink transition"
          >
            <Icon.Close className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const primaryItem = queue[0];
  const secondaryItems = queue.slice(1);

  return (
    <div ref={queueRef} className="mb-6 space-y-3">
      {/* Queue HUD Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-xs font-mono font-bold tracking-widest text-ink uppercase">
            00 — UPCOMING ACTION & EVENT QUEUE
          </span>
          <span className="rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2.5 py-0.5 text-[11px] font-mono font-bold text-accent">
            {queue.length} UPCOMING
          </span>
        </div>

        <div className="text-[11px] font-mono text-ink-faint flex items-center gap-1.5">
          <Icon.Clock className="h-3 w-3" />
          <span>NZST Live Horizon · Next {queue.length} milestones queued</span>
        </div>
      </div>

      {/* #1 Primary Hero Card (Top Priority / Imminent) */}
      <PrimaryHeroCard
        item={primaryItem}
        now={now}
        onOpen={onOpen}
        onCompleteEvent={handleCompleteEvent}
        onCompleteTask={handleCompleteTask}
        onDismiss={() => dismiss(primaryItem.id)}
      />

      {/* #2 & #3 Queued Sub-Cards (Next Milestones in Sequence) */}
      {secondaryItems.length > 0 && (
        <div className={`grid grid-cols-1 ${secondaryItems.length > 1 ? 'md:grid-cols-2' : ''} gap-3.5`}>
          {secondaryItems.map((item, idx) => (
            <QueuedSubCard
              key={item.id}
              rank={idx + 2}
              item={item}
              now={now}
              onOpen={onOpen}
              onCompleteEvent={handleCompleteEvent}
              onCompleteTask={handleCompleteTask}
              onDismiss={() => dismiss(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Primary Hero Milestone Card */
function PrimaryHeroCard({
  item,
  now,
  onOpen,
  onCompleteEvent,
  onCompleteTask,
  onDismiss,
}: {
  item: ResolvedItem;
  now: number;
  onOpen: (app: Application) => void;
  onCompleteEvent: (evt: EventItem) => void;
  onCompleteTask: (appId: string, taskId: string) => void;
  onDismiss: () => void;
}) {
  const { kind, app, task, event, title, dueMs, endMs, badge, location, url, note } = item;
  const remainingMs = dueMs - now;
  const isHappeningNow = kind === 'event' && endMs && now >= dueMs && now <= endMs;
  const expired = !isHappeningNow && remainingMs <= 0;
  const { days, hours, minutes, seconds } = splitRemaining(remainingMs);
  const urgent = !expired && !isHappeningNow && remainingMs <= URGENT_MS;
  const critical = !expired && !isHappeningNow && remainingMs <= 6 * 3_600_000;

  const badgeText = isHappeningNow
    ? 'HAPPENING NOW'
    : expired
      ? 'WINDOW PASSED'
      : critical
        ? 'CRITICAL IMMINENT'
        : urgent
          ? 'URGENT (NEXT 24H)'
          : badge || 'UPCOMING EVENT';

  const isEvent = kind === 'event';

  return (
    <div
      className={`rounded-2xl border-2 p-4 sm:p-5 transition-all shadow-sm ${
        isHappeningNow
          ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-500/[0.08] via-panel to-panel'
          : isEvent
            ? 'border-red-500/35 bg-gradient-to-r from-red-500/[0.06] via-amber-500/[0.02] to-panel'
            : 'border-amber-500/30 bg-gradient-to-r from-amber-500/[0.05] via-panel to-panel'
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left info stack */}
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white">
              #01 IMMINENT
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${
                isHappeningNow
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse'
                  : 'bg-panel-2 border border-black/[0.08] dark:border-white/[0.1] text-ink-soft'
              }`}
            >
              {badgeText}
            </span>
            <span className="text-xs font-mono text-ink-faint">
              {new Date(dueMs).toLocaleDateString('en-NZ', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <h3 className="text-lg sm:text-xl font-bold text-ink tracking-tight font-sans">
            {title}
          </h3>

          <div className="flex flex-wrap items-center gap-x-3 text-xs text-ink-soft">
            {kind === 'task' && app && (
              <span>
                <span className="text-ink-faint">Target Role:</span>{' '}
                <button
                  type="button"
                  onClick={() => onOpen(app)}
                  className="font-bold text-ink hover:text-accent underline decoration-dotted transition text-left cursor-pointer"
                  title="Open full detailed view for this role"
                >
                  {app.role} ({app.company})
                </button>
              </span>
            )}
            {location && (
              <span className="flex items-center gap-1 text-ink-soft">
                <Icon.Map className="h-3 w-3 text-red-500" />
                <span>{location}</span>
              </span>
            )}
            {note && (
              <span className="truncate max-w-xl text-ink-faint hidden sm:inline" title={note}>
                · {note.replace(/[*#]/g, '')}
              </span>
            )}
          </div>
        </div>

        {/* Right countdown & action controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Ticking countdown timer */}
          {isHappeningNow ? (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 animate-pulse">
              ● LIVE SESSION ACTIVE
            </span>
          ) : expired ? (
            <span className="rounded border border-rose/30 bg-rose/10 px-2 py-1 text-micro font-mono text-rose">
              Past Due
            </span>
          ) : (
            <div className="flex items-center gap-1 font-mono text-xs tabular-nums">
              {days > 0 && (
                <span className="rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2 py-1 font-bold text-ink shadow-sm">
                  {days}
                  <span className="ml-0.5 text-[10px] text-ink-faint">d</span>
                </span>
              )}
              <span className="rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2 py-1 font-bold text-ink shadow-sm">
                {pad(hours)}
                <span className="ml-0.5 text-[10px] text-ink-faint">h</span>
              </span>
              <span className="font-bold text-ink-faint">:</span>
              <span className="rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2 py-1 font-bold text-ink shadow-sm">
                {pad(minutes)}
                <span className="ml-0.5 text-[10px] text-ink-faint">m</span>
              </span>
              <span className="font-bold text-ink-faint">:</span>
              <span className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 font-bold text-red-600 dark:text-red-400 shadow-sm animate-pulse">
                {pad(seconds)}
                <span className="ml-0.5 text-[10px] opacity-70">s</span>
              </span>
            </div>
          )}

          {/* Action buttons */}
          {isEvent && url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-500 px-4 py-1.5 text-xs font-mono font-bold text-white shadow-[0_2px_10px_rgba(239,68,68,0.3)] transition hover:-translate-y-0.5"
            >
              <Icon.Sparkles className="h-3.5 w-3.5" />
              <span>Join Livestream ➔</span>
            </a>
          )}

          {isEvent && event && (
            <button
              type="button"
              onClick={() => onCompleteEvent(event)}
              className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 hover:bg-panel px-3 py-1.5 text-xs font-mono font-medium text-ink-soft hover:text-ink transition"
              title="Mark completed and close"
            >
              <Icon.Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Mark Done</span>
            </button>
          )}

          {kind === 'task' && app && (
            <>
              <button
                type="button"
                onClick={() => onOpen(app)}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 hover:bg-amber-300 dark:bg-amber-500 dark:hover:bg-amber-400 px-4 py-1.5 text-xs font-mono font-bold text-neutral-950 shadow-sm transition hover:-translate-y-0.5"
              >
                <span>View Role ➔</span>
              </button>
              {task && (
                <button
                  type="button"
                  onClick={() => onCompleteTask(app.id, task.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 hover:bg-panel px-3 py-1.5 text-xs font-mono font-medium text-ink-soft hover:text-ink transition"
                  title="Mark task done"
                >
                  <Icon.Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Done</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss milestone banner"
            className="rounded-full p-1.5 text-ink-faint hover:text-ink hover:bg-panel-2 transition"
          >
            <Icon.Close className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Queued Sub-Card (#2 and #3 in Queue) */
function QueuedSubCard({
  rank,
  item,
  now,
  onOpen,
  onCompleteEvent,
  onCompleteTask,
  onDismiss,
}: {
  rank: number;
  item: ResolvedItem;
  now: number;
  onOpen: (app: Application) => void;
  onCompleteEvent: (evt: EventItem) => void;
  onCompleteTask: (appId: string, taskId: string) => void;
  onDismiss: () => void;
}) {
  const { kind, app, task, event, title, dueMs, badge, location, url } = item;
  const remainingMs = dueMs - now;
  const { days, hours, minutes, seconds } = splitRemaining(remainingMs);
  const isEvent = kind === 'event';

  return (
    <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-panel/90 p-4 shadow-sm hover:border-black/[0.15] dark:hover:border-white/[0.2] transition-all flex flex-col justify-between">
      <div>
        {/* Card Header with Rank & Mini Countdown */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-black/[0.05] dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-panel-2 px-2 py-0.5 text-[10px] font-mono font-bold text-ink">
              #{String(rank).padStart(2, '0')} QUEUED
            </span>
            <span className="text-[10px] font-mono font-bold text-accent uppercase tracking-wider">
              {badge}
            </span>
          </div>

          {/* Mini Live Countdown Chip */}
          <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-ink-soft bg-panel-2/80 px-2 py-0.5 rounded-full border border-black/[0.04] dark:border-white/[0.06] tabular-nums">
            <Icon.Clock className="h-3 w-3 text-ink-faint" />
            <span>
              {days > 0 && `${days}d `}
              {pad(hours)}h {pad(minutes)}m {pad(seconds)}s
            </span>
          </div>
        </div>

        {/* Title & Scheduled Time */}
        <div className="mt-3">
          <h4 className="text-sm font-bold text-ink line-clamp-2 font-sans tracking-tight" title={title}>
            {title}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
            {kind === 'task' && app ? (
              <button
                type="button"
                onClick={() => onOpen(app)}
                className="text-left font-medium hover:text-accent transition cursor-pointer"
                title="Open full detailed view for this role"
              >
                <strong className="text-ink group-hover:text-accent">{app.company}</strong> · {app.role}
              </button>
            ) : (
              <span>{location || 'Scheduled Event'}</span>
            )}
            <span className="text-ink-faint">
              ·{' '}
              {new Date(dueMs).toLocaleDateString('en-NZ', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Card Action Footer */}
      <div className="mt-4 pt-2.5 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {kind === 'task' && app && (
            <button
              type="button"
              onClick={() => onOpen(app)}
              className="inline-flex items-center gap-1 rounded-full bg-panel-2 hover:bg-accent/10 hover:text-accent px-3 py-1 text-xs font-mono font-semibold text-ink transition"
            >
              <span>View Role ➔</span>
            </button>
          )}

          {isEvent && url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-panel-2 hover:bg-red-500/10 hover:text-red-500 px-3 py-1 text-xs font-mono font-semibold text-ink transition"
            >
              <span>Livestream Link ➔</span>
            </a>
          )}

          {isEvent && event && (
            <button
              type="button"
              onClick={() => onCompleteEvent(event)}
              className="inline-flex items-center gap-1 rounded-full hover:bg-panel-2 px-2 py-1 text-xs font-mono text-ink-faint hover:text-emerald-500 transition"
              title="Mark complete and close"
            >
              <Icon.Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Done</span>
            </button>
          )}

          {kind === 'task' && app && task && (
            <button
              type="button"
              onClick={() => onCompleteTask(app.id, task.id)}
              className="inline-flex items-center gap-1 rounded-full hover:bg-panel-2 px-2 py-1 text-xs font-mono text-ink-faint hover:text-emerald-500 transition"
              title="Mark task complete"
            >
              <Icon.Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Done</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss from queue"
          className="rounded-full p-1 text-ink-faint hover:text-ink hover:bg-panel-2 transition"
        >
          <Icon.Close className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
