import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { useDismissed } from '../lib/dismissed';
import { api } from '../api';
import type { EventItem } from '../types';

const WINDOW_MS = 14 * 24 * 3_600_000;

/**
 * A slim banner for standalone calendar events (open days, workshops) that
 * aren't tied to a job application — so they don't fit InterviewBanner or
 * DeadlineCountdown, both of which key off `Application`. Self-fetches
 * events.json rather than threading another prop through App.tsx.
 */
export function EventsBanner({ onOpen }: { onOpen?: (e: EventItem) => void }) {
  const [items, setItems] = useState<EventItem[]>([]);
  const { isDismissed, dismiss } = useDismissed();

  useEffect(() => {
    api.events.get().then((s) => setItems(s.items)).catch(() => {});
  }, []);

  const now = Date.now();
  const upcoming = items
    .filter((e) => {
      const start = Date.parse(e.start);
      return !Number.isNaN(start) && start >= now && start - now <= WINDOW_MS;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  if (upcoming.length === 0) return null;

  const bannerId = `events:${upcoming.map((e) => e.id).sort().join(',')}`;
  if (isDismissed(bannerId)) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-2xl border border-accent/40 bg-accent/[0.06] px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-1.5 text-micro font-medium text-accent">
          <Icon.Calendar className="h-3.5 w-3.5" />
          {upcoming.length === 1 ? 'Event coming up' : `${upcoming.length} events coming up`}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-micro text-ink-soft">
          {upcoming.slice(0, 3).map((e) => {
            const when = new Date(e.start).toLocaleString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <button
                key={e.id}
                onClick={() => onOpen?.(e)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-left transition hover:bg-accent/[0.08]"
              >
                <span className="text-ink">{e.title}</span>
                <span className="text-ink-faint">
                  · {when}
                  {e.location ? ` · ${e.location}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <button
        onClick={() => dismiss(bannerId)}
        title="Dismiss this banner"
        aria-label="Dismiss events banner"
        className="shrink-0 rounded-lg p-1 text-ink-faint transition hover:bg-ink/10 hover:text-ink
                   focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
      >
        <Icon.Close className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
