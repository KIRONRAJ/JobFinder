import { Icon } from './Icons';
import { useDismissed } from '../lib/dismissed';
import type { Application } from '../types';

interface Props {
  apps: Application[];
  onOpen: (app: Application) => void;
}

/**
 * A slim banner that surfaces upcoming interviews from anywhere in the app.
 * Renders nothing when no entry is in `interview` status — it's an alert
 * strip, not a persistent placeholder.
 */
export function InterviewBanner({ apps, onOpen }: Props) {
  const { isDismissed, dismiss } = useDismissed();
  const interviews = apps
    .filter((a) => a.status === 'interview')
    .sort((a, b) => {
      const ta = a.interview?.when ? new Date(a.interview.when).getTime() : Infinity;
      const tb = b.interview?.when ? new Date(b.interview.when).getTime() : Infinity;
      return ta - tb;
    });

  if (interviews.length === 0) return null;

  // Keyed on which interviews are showing, not on "the interview banner", so
  // dismissing today's set doesn't silence a new interview booked tomorrow.
  const bannerId = `interviews:${interviews.map((a) => a.id).sort().join(',')}`;
  if (isDismissed(bannerId)) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber/40 bg-amber/[0.06] px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-1.5 text-micro font-medium text-amber">
          <Icon.Chat className="h-3.5 w-3.5" />
          {interviews.length === 1 ? 'Interview coming up' : `${interviews.length} interviews coming up`}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-micro text-ink-soft">
          {interviews.slice(0, 3).map((a) => {
            const when = a.interview?.when
              ? new Date(a.interview.when).toLocaleString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'no date set';
            return (
              <button
                key={a.id}
                onClick={() => onOpen(a)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition hover:bg-amber/[0.08]"
              >
                <span className="text-ink">{a.role}</span>
                <span className="text-ink-faint">· {a.company} · {when}</span>
              </button>
            );
          })}
        </div>
      </div>
      <button
        onClick={() => dismiss(bannerId)}
        title="Dismiss this banner"
        aria-label="Dismiss interview banner"
        className="shrink-0 rounded-lg p-1 text-ink-faint transition hover:bg-ink/10 hover:text-ink
                   focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
      >
        <Icon.Close className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
