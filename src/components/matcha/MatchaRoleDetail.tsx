import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../Icons';
import { StatusPill, TagBadge } from '../Badges';
import { VERDICT_META } from '../FitVerdictBanner';
import { TabStrip, type TabStripItem } from '../TabStrip';
import { fitsMatchaStyle } from '../../lib/matchaGlyphs';
import type { Application } from '../../types';

const TONE_TEXT = { grass: 'text-grass', amber: 'text-amber', rose: 'text-rose' } as const;

export type RoleTabKey =
  | 'analysis'
  | 'evidence'
  | 'ats'
  | 'interview'
  | 'documents'
  | 'correspondence'
  | 'rejection'
  | 'negotiation'
  | 'history';

export interface RoleTab {
  key: RoleTabKey;
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  node: ReactNode;
}

// Old in-page anchors (and the command palette's section jumps) that now live inside a tab.
const HASH_ALIAS: Record<string, RoleTabKey> = { overview: 'analysis', fit: 'analysis', 'job-ad': 'documents' };

/** The tab a URL hash points at. Anything unknown, or a section this role has no tab for, falls back to the first tab (Analysis). */
export function tabFromHash(hash: string, tabs: RoleTab[]): RoleTabKey {
  const raw = hash.replace(/^#/, '');
  const key = (HASH_ALIAS[raw] ?? raw) as RoleTabKey;
  return tabs.some((t) => t.key === key) ? key : tabs[0].key;
}

interface Props {
  app: Application;
  readinessScore: number;
  tabs: RoleTab[];
  /** The page's own action buttons (Preview CV, Follow up, Edit, Folder, links), unchanged. */
  actions: ReactNode;
  /** Blocking notices that must stay visible whichever tab is open. */
  notices: ReactNode;
  rail: ReactNode;
  onBack: () => void;
  onTerminal: () => void;
}

/**
 * Matcha's role page: hero, fit verdict line, tab row and rail. Pure layout: every panel and handler comes in
 * from RoleDetail, so the tabs show the same components the single-scroll page shows. The active tab lives in
 * the URL hash, so deep links and in-page anchors keep working.
 */
export function MatchaRoleDetail({ app, readinessScore, tabs, actions, notices, rail, onBack, onTerminal }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = tabFromHash(location.hash, tabs);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  const verdict = app.analysis?.recommendation;
  const meta = verdict ? (VERDICT_META[verdict.verdict] ?? VERDICT_META.borderline) : null;
  const items: TabStripItem<RoleTabKey>[] = tabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon }));
  const subtitle = [app.role, app.location, app.date ? `applied ${app.date}` : null].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto min-w-0 max-w-[1400px] px-4 pb-24 pt-6 sm:px-10">
      <header className="mb-8 flex flex-wrap items-center gap-3 border-b border-line-soft pb-5">
        <button onClick={onBack} className="mx-mono flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-ink-soft hover:text-accent">
          <Icon.Arrow className="h-3.5 w-3.5 shrink-0 rotate-180" />
          <span className="truncate">Pipeline / {app.company}</span>
        </button>
        <Link to="/" className="btn-quiet" title="Job Search HQ home">
          <Icon.Gauge className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Home</span>
        </Link>
        <button onClick={onTerminal} className="btn-quiet" title="Terminal (Ctrl+J)" aria-label="Terminal">
          <Icon.Terminal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Terminal</span>
        </button>
      </header>

      <section className="mb-8 flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
        <div className="flex min-w-0 flex-1 basis-96 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={app.status} />
            {app.tags?.map((t) => <TagBadge key={t} tag={t} />)}
          </div>
          <h1 className={`mx-display-role ${fitsMatchaStyle(app.company) ? 'font-display-matcha font-normal' : 'font-semibold'}`}>{app.company}</h1>
          <p className="text-subhead text-ink-soft sm:text-heading">{subtitle}</p>
        </div>
        <div className="flex min-w-[220px] flex-col gap-3">
          <span className="mx-mono text-ink-soft">Readiness</span>
          <span className="mx-numeral-lg font-display-matcha">{readinessScore}%</span>
          <div className="h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`Readiness ${readinessScore}%`}>
            <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, readinessScore))}%` }} />
          </div>
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">{actions}</div>

      {notices}

      {verdict && meta && (
        <section className="panel mb-8 flex items-start gap-4 p-5 sm:p-6" aria-label="Fit verdict">
          <meta.icon className={`mt-0.5 h-5 w-5 shrink-0 ${TONE_TEXT[meta.tone]}`} />
          <div className="min-w-0">
            <p className={`mx-mono ${TONE_TEXT[meta.tone]}`}>Fit verdict</p>
            <p className="mt-1 text-subhead font-medium">{meta.label}</p>
            <p className="mx-clamp mt-1 text-body text-ink-soft">{verdict.reasoning}</p>
          </div>
        </section>
      )}

      <TabStrip items={items} active={active} ariaLabel="Role sections" onPick={(k) => navigate({ pathname: location.pathname, search: location.search, hash: k }, { replace: true })} />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div role="tabpanel" aria-label={current.label} className="min-w-0 space-y-4">
          <h2 className="mx-display-sm font-display-matcha font-normal">{current.label}</h2>
          {current.node}
        </div>
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">{rail}</aside>
      </div>
    </div>
  );
}
