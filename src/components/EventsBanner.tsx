import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icons';
import { useDismissed } from '../lib/dismissed';
import { api } from '../api';
import type { EventItem } from '../types';

const WINDOW_MS = 14 * 24 * 3_600_000;

function formatEventDate(startStr: string) {
  try {
    const d = new Date(startStr);
    if (Number.isNaN(d.getTime())) return startStr;
    const datePart = d.toLocaleDateString('en-NZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('en-NZ', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${datePart} @ ${timePart} NZST`;
  } catch {
    return startStr;
  }
}

/**
 * Parses simple inline formatting for event notes:
 * - **bold text**
 * - *italic text*
 * - Highlights key header phrases (Speakers, Facilitator, Inspired by)
 */
function FormattedNotes({ text }: { text: string }) {
  const chunks = text.split(/(\*\*.*?\*\*)/g);

  return (
    <p className="text-xs text-ink-soft max-w-3xl leading-relaxed">
      {chunks.map((chunk, i) => {
        if (chunk.startsWith('**') && chunk.endsWith('**')) {
          const inner = chunk.slice(2, -2);
          const isRed =
            inner.toLowerCase().includes('inspired by') ||
            inner.toLowerCase().includes('speakers:') ||
            inner.toLowerCase().includes('facilitator:');
          return (
            <strong
              key={i}
              className={
                isRed
                  ? 'font-semibold text-red-600 dark:text-red-400'
                  : 'font-semibold text-ink'
              }
            >
              {inner}
            </strong>
          );
        }

        const italicChunks = chunk.split(/(\*.*?\*)/g);
        return (
          <span key={i}>
            {italicChunks.map((sub, j) => {
              if (sub.startsWith('*') && sub.endsWith('*')) {
                return (
                  <em key={j} className="italic text-ink">
                    {sub.slice(1, -1)}
                  </em>
                );
              }
              return sub;
            })}
          </span>
        );
      })}
    </p>
  );
}

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
      // Keep visible until event end time (or start + 2 hours if end not specified)
      const end = e.end ? Date.parse(e.end) : start + 2 * 3_600_000;
      return !Number.isNaN(start) && end >= now && start - now <= WINDOW_MS;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const visibleEvents = upcoming.filter((e) => !isDismissed(`event:${e.id}`));
  if (visibleEvents.length === 0) return null;

  return (
    <div className="mb-6 space-y-4">
      {visibleEvents.map((e) => {
        const whenStr = formatEventDate(e.start);
        const badgeLabel = e.badge || 'Special Event';
        const isSot =
          badgeLabel.toLowerCase().includes('sot') ||
          e.title.toLowerCase().includes('summer of tech');

        return (
          <section
            key={e.id}
            className={`relative overflow-hidden rounded-2xl border-2 p-4 sm:p-5 shadow-sm transition-all ${
              isSot
                ? 'border-red-500/40 bg-gradient-to-r from-red-500/10 via-amber-500/5 to-panel'
                : 'border-accent/30 bg-gradient-to-r from-accent/10 via-panel to-panel'
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
                    isSot
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400 ring-red-500/30'
                      : 'bg-accent/15 text-accent ring-accent/30'
                  }`}
                >
                  <Icon.Calendar className="h-5 w-5" />
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${
                        isSot ? 'bg-red-600' : 'bg-accent'
                      }`}
                    >
                      {badgeLabel}
                    </span>
                    <span className="text-xs font-semibold text-ink">{whenStr}</span>
                    {e.status && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {e.status}
                      </span>
                    )}
                    {e.location && !e.url && (
                      <span className="text-xs text-ink-faint">· {e.location}</span>
                    )}
                  </div>

                  <h2 className="text-sm sm:text-base font-bold text-ink tracking-tight">
                    {e.title}
                  </h2>

                  {e.notes && <FormattedNotes text={e.notes} />}
                </div>
              </div>

              {/* Action buttons & dismiss */}
              <div className="flex shrink-0 flex-wrap items-center gap-2 lg:self-center">
                {e.url && (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors ${
                      isSot ? 'bg-red-600 hover:bg-red-700' : 'bg-accent hover:opacity-90'
                    }`}
                  >
                    <Icon.External className="h-3.5 w-3.5" />
                    <span>{e.url.includes('online_events') ? 'Join Livestream' : 'Join Event'}</span>
                  </a>
                )}

                {e.detailsUrl && (
                  <a
                    href={e.detailsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-panel px-3 py-2 text-xs font-medium text-ink ring-1 ring-line hover:bg-neutral/50 transition-colors"
                  >
                    <span>Event Details</span>
                  </a>
                )}

                {e.roleUrl && (
                  e.roleUrl.startsWith('http') ? (
                    <a
                      href={e.roleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-panel px-3 py-2 text-xs font-medium text-ink ring-1 ring-line hover:bg-neutral/50 transition-colors"
                    >
                      <span>{e.roleLabel || 'View Role'}</span>
                    </a>
                  ) : (
                    <Link
                      to={e.roleUrl}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-panel px-3 py-2 text-xs font-medium text-ink ring-1 ring-line hover:bg-neutral/50 transition-colors"
                    >
                      <span>{e.roleLabel || 'View Role'}</span>
                    </Link>
                  )
                )}

                {!e.url && !e.detailsUrl && onOpen && (
                  <button
                    onClick={() => onOpen(e)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-panel px-3 py-2 text-xs font-medium text-ink ring-1 ring-line hover:bg-neutral/50 transition-colors"
                  >
                    <span>View Event</span>
                  </button>
                )}

                <button
                  onClick={() => dismiss(`event:${e.id}`)}
                  title="Dismiss this event banner"
                  aria-label="Dismiss event banner"
                  className="shrink-0 rounded-lg p-1.5 text-ink-faint transition hover:bg-ink/10 hover:text-ink ml-1
                             focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
                >
                  <Icon.Close className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
