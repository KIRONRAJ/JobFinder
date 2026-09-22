import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import { api } from '../api';
import { copyText } from '../lib/clipboard';
import { NotionDriftPanel } from './NotionDriftPanel';
import type { AuditEvent } from '../types';

/** Icon + wording carry the meaning; colour is only ever a secondary cue.
 *  Every action actually present in audit-log.jsonl is listed — an unmapped
 *  action falls back to its raw slug, which is legible but looks like a bug,
 *  so new actions belong here as they're introduced. */
const ACTION_META: Record<string, { label: string; Icon: (p: { className?: string }) => JSX.Element }> = {
  create: { label: 'Added', Icon: Icon.Plus },
  update: { label: 'Edited', Icon: Icon.Arrow },
  delete: { label: 'Deleted', Icon: Icon.Trash },
  'delete-local': { label: 'Deleted locally', Icon: Icon.Trash },
  'cv-request': { label: 'CV queued', Icon: Icon.Sparkle },
  'cv-request-cancelled': { label: 'CV request cancelled', Icon: Icon.Close },
  'cv-request-skipped': { label: 'CV request skipped', Icon: Icon.Withdrawn },
  'cv-generated': { label: 'CV generated', Icon: Icon.Check },
  'review-request': { label: 'Review queued', Icon: Icon.Search },
  'cv-review': { label: 'CV review', Icon: Icon.Search },
  'cv-reviewed': { label: 'CV reviewed', Icon: Icon.Shield },
  'docs-verified': { label: 'Docs verified', Icon: Icon.Shield },
  'doc-generated': { label: 'Document generated', Icon: Icon.Check },
  'priority-set': { label: 'Priority set', Icon: Icon.Zap },
  'evidence-refined': { label: 'Evidence refined', Icon: Icon.Shield },
  'war-room-drafted': { label: 'War room drafted', Icon: Icon.Chat },
  'rejection-analysed': { label: 'Rejection analysed', Icon: Icon.Close },
  analysis: { label: 'Fit analysed', Icon: Icon.Gauge },
  'analysis-request': { label: 'Analysis queued', Icon: Icon.Search },
  'folder-move': { label: 'Folder moved', Icon: Icon.Folder },
  note: { label: 'Note', Icon: Icon.Note },
  flag: { label: 'Flagged', Icon: Icon.Triangle },
  status: { label: 'Status', Icon: Icon.Arrow },
  'status-change': { label: 'Status changed', Icon: Icon.Arrow },
  correction: { label: 'Correction', Icon: Icon.Edit },
  'facts-corrected': { label: 'Facts corrected', Icon: Icon.Edit },
  'follow-up': { label: 'Follow-up', Icon: Icon.Paperplane },
  'event-registered': { label: 'Event registered', Icon: Icon.Calendar },
  'study-progress': { label: 'Study progress', Icon: Icon.GradCap },
  'study-completed': { label: 'Study completed', Icon: Icon.Trophy },
  'assessment-update': { label: 'Assessment updated', Icon: Icon.Target },
  'interview-prepped': { label: 'Interview prepped', Icon: Icon.Chat },
  'interview-answer-generate': { label: 'Interview answer drafted', Icon: Icon.Chat },
  release: { label: 'Release', Icon: Icon.Zap },
  bugfix: { label: 'Bug fix', Icon: Icon.Shield },
  'outreach-create': { label: 'Outreach added', Icon: Icon.Building },
  'outreach-update': { label: 'Outreach edited', Icon: Icon.Arrow },
  'outreach-delete': { label: 'Outreach removed', Icon: Icon.Trash },
  'outreach-email-request': { label: 'Email queued', Icon: Icon.Sparkle },
  'outreach-email-drafted': { label: 'Email drafted', Icon: Icon.Mail },
  'outreach-email-sent': { label: 'Email sent', Icon: Icon.Paperplane },
};

const ACTOR_LABELS: Record<string, string> = {
  user: 'you',
  claude: 'Claude',
  antigravity: 'Antigravity',
  gemini: 'Gemini',
  'cv-worker': 'CV worker',
};

function actorLabel(actor: string | undefined) {
  return ACTOR_LABELS[actor ?? ''] ?? actor ?? 'unknown';
}

function actionLabel(action: string) {
  return ACTION_META[action]?.label ?? action;
}

/** Seconds and the year both matter here — this is the view you use to line an
 *  event up against a server-log line, and "11 Sep, 11:04" can't do that. */
function when(at: number) {
  return new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Local-midnight epoch for a native date input's `YYYY-MM-DD` value. */
function dayStart(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** The permanent change trail over `audit-log.jsonl` — what changed, who did
 *  it, and exactly when. Lives in Settings → Audit log rather than Insights:
 *  it's a tracing surface, not an analysis of the job search. Its live
 *  counterpart is ServerLogView, which answers whether the process was healthy
 *  at the same moment. */
export function AuditView() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actor, setActor] = useState('all');
  const [action, setAction] = useState('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.from('.audit-row', {
        opacity: 0,
        duration: reduce ? 0 : 0.25,
        delay: reduce ? 0 : (i: number) => Math.min(i * 0.015, 0.3),
      });
    },
    // Keyed on the fetch only, not on the filtered result — re-running the
    // stagger on every keystroke in the search box would fight the typing.
    { scope: listRef, dependencies: [events] }
  );

  useEffect(() => {
    let alive = true;
    // The whole file, not the default 200. This is the tab you open when you
    // need the event from three weeks ago.
    api
      .auditLog(20000)
      .then((e) => alive && setEvents(e))
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, []);

  // Both lists come from the data, so a new actor (antigravity, gemini, the
  // next one) shows up in the filter without a code change.
  const actors = useMemo(
    () => [...new Set((events ?? []).map((e) => e.actor).filter(Boolean))].sort(),
    [events]
  );
  const actions = useMemo(
    () =>
      [...new Set((events ?? []).map((e) => e.action).filter(Boolean))].sort((a, b) =>
        actionLabel(a).localeCompare(actionLabel(b))
      ),
    [events]
  );

  // Row ids are assigned against the *full* list, not the filtered one. Keying
  // off the filtered index instead means changing a filter silently moves the
  // expanded row onto a different record.
  const rows = useMemo(
    () => (events ?? []).map((e, i) => ({ ...e, id: `${e.at}-${i}` })),
    [events]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fromAt = from ? dayStart(from) : null;
    // Inclusive of the whole end day, which is what picking a date means.
    const toAt = to ? dayStart(to) + 86_400_000 : null;
    return rows.filter((e) => {
      if (actor !== 'all' && e.actor !== actor) return false;
      if (action !== 'all' && e.action !== action) return false;
      if (fromAt !== null && e.at < fromAt) return false;
      if (toAt !== null && e.at >= toAt) return false;
      if (needle) {
        const haystack = `${e.detail ?? ''} ${e.matchKey ?? ''} ${e.entryId ?? ''} ${e.action} ${actionLabel(e.action)}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [rows, actor, action, q, from, to]);

  const copy = async (text: string) => {
    await copyText(text);
    setCopied(text);
    window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 1200);
  };

  const clearFilters = () => {
    setActor('all');
    setAction('all');
    setQ('');
    setFrom('');
    setTo('');
  };

  const filtering = actor !== 'all' || action !== 'all' || q.trim() !== '' || from !== '' || to !== '';

  if (error) {
    return (
      <>
        <NotionDriftPanel />
        <div className="rounded-2xl border border-rose/30 bg-panel p-5 text-meta text-rose">
          Couldn't load the audit log — {error}
        </div>
      </>
    );
  }

  if (!events) {
    return (
      <>
        <NotionDriftPanel />
        <div className="py-16 text-center text-meta text-ink-faint">Loading…</div>
      </>
    );
  }

  if (events.length === 0) {
    return (
      <>
        <NotionDriftPanel />
        <div className="panel-empty px-6 py-16 text-center">
          <Icon.Clock className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
          <p className="text-subhead text-ink">Nothing logged yet</p>
          <p className="mt-1.5 text-meta text-ink-soft">
            Edits made in the app and documents generated by Claude both land here.
          </p>
        </div>
      </>
    );
  }

  const oldest = events[events.length - 1]?.at;

  return (
    <>
      <NotionDriftPanel />

      <div className="panel mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-meta text-ink">
            <span className="font-mono">{filtered.length.toLocaleString()}</span>
            {filtered.length !== events.length && (
              <span className="text-ink-faint"> of {events.length.toLocaleString()}</span>
            )}{' '}
            events
            <span className="text-ink-faint">
              {' · '}
              {actions.length} kinds · {actors.length} actors
              {oldest ? ` · since ${new Date(oldest).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </span>
          </p>
          {filtering && (
            <button onClick={clearFilters} className="link-quiet">
              <Icon.Close className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="lg:col-span-2">
            <span className="field-label">Search</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Company, role, match key, entry id…"
              className="field-input"
            />
          </label>
          <label>
            <span className="field-label">Who</span>
            <select value={actor} onChange={(e) => setActor(e.target.value)} className="field-input">
              <option value="all">Anyone</option>
              {actors.map((a) => (
                <option key={a} value={a}>
                  {actorLabel(a)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">What</span>
            <select value={action} onChange={(e) => setAction(e.target.value)} className="field-input">
              <option value="all">Any event</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </select>
          </label>
          {/* Native date inputs — the platform already ships a picker, a
              calendar dependency would buy nothing here. */}
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="field-label">From</span>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="field-input" />
            </label>
            <label>
              <span className="field-label">To</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="field-input" />
            </label>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel-empty px-6 py-16 text-center">
          <Icon.Search className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
          <p className="text-subhead text-ink">No events match</p>
          <p className="mt-1.5 text-meta text-ink-soft">
            {events.length.toLocaleString()} events are logged — widen the filters to see them.
          </p>
        </div>
      ) : (
        <div ref={listRef} className="overflow-hidden rounded-2xl border border-line bg-panel">
          {filtered.map((e) => {
            const meta = ACTION_META[e.action] ?? { label: e.action, Icon: Icon.Arrow };
            const key = e.id;
            const isOpen = expanded === key;
            // `id` is ours, not part of the record on disk — the raw view below
            // has to show the line as it was actually written.
            const { id: _rowId, ...raw } = e;
            return (
              <div key={key} className="audit-row border-b border-line-soft last:border-b-0">
                <div className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 text-ink-faint">
                    <meta.Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-meta text-ink">
                      {meta.label}
                      {e.detail ? <span className="text-ink-soft"> · {e.detail}</span> : null}
                    </p>
                    <p className="mt-0.5 text-micro text-ink-faint">
                      <span className="font-mono">{when(e.at)}</span> · by {actorLabel(e.actor)} ·{' '}
                      {/* The raw slug, not just the friendly label — it's what
                          you grep the file for. */}
                      <span className="font-mono">{e.action}</span>
                    </p>
                    {(e.entryId || e.matchKey) && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro">
                        {e.matchKey && (
                          <button
                            onClick={() => copy(e.matchKey!)}
                            title="Copy match key"
                            className="inline-flex max-w-full items-center gap-1 font-mono text-ink-faint hover:text-accent"
                          >
                            <Icon.Copy className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{e.matchKey}</span>
                          </button>
                        )}
                        {e.entryId && (
                          <>
                            <button
                              onClick={() => copy(e.entryId!)}
                              title="Copy entry id"
                              className="inline-flex items-center gap-1 font-mono text-ink-faint hover:text-accent"
                            >
                              <Icon.Copy className="h-2.5 w-2.5 shrink-0" />
                              {e.entryId}
                            </button>
                            {/* Link, not <a> — a bare href reloads the whole
                                app and throws away the filters you just set.
                                Deleted entries dead-end here; still worth the
                                jump for everything else. */}
                            <Link to={`/role/${e.entryId}`} className="link-quiet" title="Open this role">
                              <Icon.External className="h-2.5 w-2.5" />
                              Open
                            </Link>
                          </>
                        )}
                        {copied && (copied === e.entryId || copied === e.matchKey) && (
                          <span className="text-grass">copied</span>
                        )}
                      </p>
                    )}
                    {isOpen && (
                      <pre className="panel-inset mt-2 overflow-x-auto px-3 py-2 text-micro leading-relaxed text-ink-soft">
                        {JSON.stringify(raw, null, 2)}
                      </pre>
                    )}
                  </div>
                  <button
                    onClick={() => setExpanded(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? 'Hide raw record' : 'Show raw record'}
                    className="shrink-0 text-ink-faint transition hover:text-ink"
                  >
                    <Icon.Chevron className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
