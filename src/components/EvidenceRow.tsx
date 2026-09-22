import { Icon } from './Icons';
import type { EvidenceItem, EvidenceState } from '../types';

export const EVIDENCE_STATE_META: Record<
  EvidenceState,
  {
    label: string;
    icon: (p: { className?: string }) => JSX.Element;
    tone: string;
    tint: string;
  }
> = {
  verified: {
    label: 'Verified',
    icon: Icon.CheckCircle,
    tone: 'text-grass',
    tint: 'border-grass/40 bg-grass/[0.05]',
  },
  'needs-wording': {
    label: 'Needs wording',
    icon: Icon.Triangle,
    tone: 'text-amber',
    tint: 'border-amber/40 bg-amber/[0.05]',
  },
  'learning-gap': {
    label: 'Learning gap',
    icon: Icon.Circle,
    tone: 'text-ink-faint',
    tint: 'border-line',
  },
  'do-not-claim': {
    label: 'Do not claim',
    icon: Icon.Octagon,
    tone: 'text-rose',
    tint: 'border-rose/40 bg-rose/[0.05]',
  },
};

/** One keyword's evidence state — rendered by the role detail page's Evidence
 *  section. Split out of the old global EvidenceView (which listed every
 *  role's map on one page, retired once the per-role detail page could show
 *  it in context) so this row rendering has exactly one implementation. */
export function EvidenceRow({ keyword, item }: { keyword: string; item: EvidenceItem }) {
  const meta = EVIDENCE_STATE_META[item.state];
  const IconEl = meta.icon;
  return (
    <li className="grid grid-cols-1 items-start gap-2 py-2.5 text-meta sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.7fr)] sm:gap-4">
      <div className="min-w-0">
        <p className="truncate font-medium text-ink" title={keyword}>
          {keyword}
        </p>
      </div>
      <div className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${meta.tint}`}>
        <IconEl className={`mt-[2px] h-3.5 w-3.5 shrink-0 ${meta.tone}`} />
        <div className="min-w-0">
          <p className={`text-micro font-medium ${meta.tone}`}>{meta.label}</p>
          {item.source && <p className="mt-0.5 text-micro text-ink-soft">{item.source}</p>}
        </div>
      </div>
      <div className="text-micro text-ink-faint">
        {item.useIn && item.useIn.length > 0 ? item.useIn.join(' + ') : '—'}
      </div>
    </li>
  );
}
