import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { api } from '../api';
import { useMatcha } from '../lib/useMatcha';
import type { Application, EventItem } from '../types';

const WINDOW_MS = 48 * 3_600_000;

type Item = { key: string; at: number | null; title: string; sub: string; kind: 'interview' | 'event'; open: () => void };

function when(at: number | null) {
  if (at === null) return 'Time not set';
  return new Date(at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/** The single home banner: interviews and events in the next 48h, plus interviews still missing a time. */
export function UpcomingStrip({
  apps,
  onOpen,
  onSchedule,
}: {
  apps: Application[];
  onOpen: (a: Application) => void;
  onSchedule: (a: Application) => void;
}) {
  const matcha = useMatcha();
  const [events, setEvents] = useState<EventItem[]>([]);
  // `settled` flips once the one GET /api/events has answered or failed, so Matcha's empty line never flashes
  // in before the answer. A failure just means "no events"; interviews come from `apps` and are unaffected.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    api.events
      .get()
      .then((s) => setEvents(s.items))
      .catch(() => {})
      .finally(() => setSettled(true));
  }, []);

  const now = Date.now();
  const items: Item[] = [];
  for (const a of apps) {
    if (a.status !== 'interview') continue;
    const at = a.interview?.when ? new Date(a.interview.when).getTime() : null;
    if (at !== null && (at < now - 3_600_000 || at - now > WINDOW_MS)) continue;
    items.push({
      key: a.id,
      at,
      title: a.role,
      sub: a.company,
      kind: 'interview',
      open: () => (at === null ? onSchedule(a) : onOpen(a)),
    });
  }
  for (const e of events) {
    const start = Date.parse(e.start);
    const end = e.end ? Date.parse(e.end) : start + 2 * 3_600_000;
    if (Number.isNaN(start) || end < now || start - now > WINDOW_MS) continue;
    items.push({
      key: e.id,
      at: start,
      title: e.title,
      sub: e.location || 'Event',
      kind: 'event',
      open: () => e.url && window.open(e.url, '_blank', 'noopener,noreferrer'),
    });
  }
  items.sort((x, y) => (x.at ?? Infinity) - (y.at ?? Infinity));

  if (matcha) {
    // Matcha: the "Upcoming" row from Main.dc.html. Same items, same handlers; adds an empty state.
    return (
      <section aria-label="Upcoming" className="mx-upcoming flex min-h-[4.5rem] flex-wrap items-center gap-3 border-b border-line-soft py-5">
        <span className="mx-mono mr-2 text-ink-soft">Upcoming</span>
        {items.map((it) => {
          const ItemIcon = it.kind === 'interview' ? Icon.Chat : Icon.Calendar;
          return (
            <button
              key={it.key}
              type="button"
              onClick={it.open}
              className={`mx-upchip flex min-h-11 min-w-0 max-w-full items-center gap-2.5 rounded-full border px-4 py-2 text-left text-meta ${
                it.kind === 'interview' ? 'border-amber text-amber' : 'border-line text-ink-soft'
              }`}
            >
              <ItemIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0 font-semibold">{when(it.at)}</span>
              <span className="truncate">
                {it.title} · {it.sub}
              </span>
            </button>
          );
        })}
        {items.length === 0 && settled && <span className="text-meta text-ink-faint">Nothing in the next 48 hours.</span>}
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section aria-label="Next 48 hours" className="mb-6 flex flex-wrap items-stretch gap-2">
      <span className="flex items-center gap-1.5 pr-1 font-mono text-label font-bold uppercase tracking-widest text-amber">
        <Icon.Clock className="h-3.5 w-3.5" />
        Next 48h
      </span>
      {items.map((it) => {
        const ItemIcon = it.kind === 'interview' ? Icon.Chat : Icon.Calendar;
        return (
          <button
            key={it.key}
            onClick={it.open}
            className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-amber/30 bg-amber/[0.06] px-3 py-1.5 text-left text-micro transition hover:border-amber"
          >
            <ItemIcon className="h-3.5 w-3.5 shrink-0 text-amber" />
            <span className={`shrink-0 font-semibold ${it.at === null ? 'text-rose' : 'text-ink'}`}>{when(it.at)}</span>
            <span className="truncate text-ink-soft">
              {it.title} · {it.sub}
            </span>
          </button>
        );
      })}
    </section>
  );
}
