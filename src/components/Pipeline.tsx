import { Icon } from './Icons';
import { TabStrip } from './TabStrip';
import type { Application } from '../types';

const TABS: {
  key: string;
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  matches: (a: Application) => boolean;
}[] = [
  { key: '', label: 'All', icon: Icon.Grid, matches: () => true },
  { key: 'researching', label: 'Pending', icon: Icon.Search, matches: (a) => a.status === 'researching' },
  {
    key: 'applied',
    label: 'Applied',
    icon: Icon.Paperplane,
    matches: (a) => a.status === 'applied' && !a.progressing,
  },
  {
    key: 'progressing',
    label: 'Progressing',
    icon: Icon.Zap,
    matches: (a) => a.status === 'interview' || a.status === 'offer' || Boolean(a.progressing),
  },
  { key: 'rejected', label: 'Rejected', icon: Icon.Close, matches: (a) => a.status === 'rejected' },
  { key: 'withdrawn', label: 'Withdrawn', icon: Icon.Withdrawn, matches: (a) => a.status === 'withdrawn' },
];

/**
 * Compact status tabs — replaces the old 2×2 stat-tile grid. Same
 * active/onPick contract the rest of App.tsx's filtering already relies on;
 * this is a display simplification, not a new filter model. "Progressing"
 * covers any entry with a positive, non-rejection signal past a bare
 * "applied" — Interview/Offer status, or `progressing: true` set by Claude
 * when a reply moves things forward (e.g. psychometric testing) without yet
 * justifying a formal status change. Withdrawn covers roles skipped or
 * pulled for fit/eligibility reasons — its own tab keeps them out of the
 * active tabs while staying reachable and filterable per-column in Board view.
 */
export function Pipeline({
  apps,
  active,
  onPick,
}: {
  apps: Application[];
  active: string;
  onPick: (status: string) => void;
}) {
  return (
    <TabStrip
      items={TABS.map((t) => ({ ...t, count: apps.filter((a) => t.matches(a)).length }))}
      active={active}
      onPick={onPick}
      ariaLabel="Filter by status"
    />
  );
}
