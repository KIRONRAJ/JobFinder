import type { ActivityEntry, ActivityKind } from '../types';

const KIND_DOT: Record<ActivityKind, string> = {
  created: 'bg-neutral',
  status: 'bg-accent',
  applied: 'bg-grass',
  cv: 'bg-accent',
  note: 'bg-neutral',
  deadline: 'bg-amber',
  contact: 'bg-neutral',
};

function when(ms: number) {
  return new Date(ms).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ActivityTimeline({ activity }: { activity?: ActivityEntry[] }) {
  // Renders even when empty — an absent panel reads as a missing feature,
  // whereas an explained empty one reads as "nothing has happened yet".
  if (!activity?.length) {
    return (
      <div className="rounded-2xl border border-line bg-panel-2/50 px-4 py-3.5">
        <div className="mb-1.5 text-micro font-medium text-ink-soft">Activity</div>
        <p className="text-meta text-ink-faint">
          Nothing recorded yet. Status changes, CV drafts and contact updates will appear here.
        </p>
      </div>
    );
  }

  // Newest first: the most recent thing that happened is what you came to check.
  const ordered = [...activity].sort((a, b) => b.at - a.at);

  return (
    <div className="rounded-2xl border border-line bg-panel-2/50 px-4 py-3.5">
      <div className="mb-3 text-micro font-medium text-ink-soft">Activity</div>
      <ol className="relative space-y-3 pl-4">
        <span className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-line" aria-hidden />
        {ordered.map((entry, i) => (
          <li key={`${entry.at}-${i}`} className="relative flex items-baseline gap-3">
            <span
              className={`dot absolute -left-4 top-[6px] ring-4 ring-panel-2 ${KIND_DOT[entry.kind] ?? 'bg-neutral'}`}
            />
            <span className="flex-1 text-meta">{entry.text}</span>
            <span className="shrink-0 font-mono text-label text-ink-faint">{when(entry.at)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
