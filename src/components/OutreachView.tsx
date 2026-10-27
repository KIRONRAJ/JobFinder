import { useEffect, useMemo, useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import { OutreachCard } from './OutreachCard';
import { OutreachModal } from './OutreachModal';
import { GenericDocsPanel } from './GenericDocsPanel';
import { TabStrip } from './TabStrip';
import { MatchaPageHead } from './matcha/MatchaPageHead';
import { MatchaOutreachCard } from './matcha/MatchaOutreachCard';
import { ShowMoreControl } from './ShowMoreControl';
import { useMatcha } from '../lib/useMatcha';
import { OUTREACH_STATUS_ICON } from './Badges';
import { api } from '../api';
import {
  OUTREACH_STATUSES,
  KIND_META,
  type Application,
  type OutreachEntry,
  type OutreachKind,
  type OutreachStatus,
} from '../types';

interface Props {
  kind: OutreachKind;
  entries: OutreachEntry[];
  apps: Application[];
  /** Whether the add-modal is open, so the header's primary button can drive it. */
  addOpen: boolean;
  onCloseAdd: () => void;
  onChanged: () => void;
  toast: (text: string, tone?: 'info' | 'error') => void;
}

/** Pending is a virtual tab: a drafted (or queued) email that hasn't been sent yet. */
type StatusFilter = '' | 'pending' | OutreachStatus;
const OUTREACH_LIMIT = 6;
const isPending = (e: OutreachEntry) => e.emailStatus === 'drafted' || e.emailStatus === 'queued';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  ...OUTREACH_STATUSES.map((s) => ({ key: s.key, label: s.label })),
];

export function OutreachView({
  kind,
  entries,
  apps,
  addOpen,
  onCloseAdd,
  onChanged,
  toast,
}: Props) {
  const meta = KIND_META[kind];
  const matcha = useMatcha();
  const [statusF, setStatusF] = useState<StatusFilter>('');
  const [editing, setEditing] = useState<OutreachEntry | null>(null);
  // Off keeps the stored order. Otherwise newest- or oldest-first by the last
  // time anything happened on the row (last emailed, else last edited, else created).
  const [dateSort, setDateSort] = useState<'' | 'desc' | 'asc'>('');
  // Matcha's card grid shows the first 6 and reveals more (same pattern as the applications list). Resets when the list changes.
  const [limit, setLimit] = useState(OUTREACH_LIMIT);
  useEffect(() => setLimit(OUTREACH_LIMIT), [statusF, dateSort, kind]);

  const mine = useMemo(() => entries.filter((e) => e.kind === kind), [entries, kind]);

  /** Employers already in the job tracker, lowercased for a loose name match. */
  const appCompanies = useMemo(
    () => apps.map((a) => (a.company || '').toLowerCase()),
    [apps]
  );
  const linkedCount = (name: string) => {
    const n = name.toLowerCase();
    return appCompanies.filter((c) => c.includes(n) || n.includes(c)).length;
  };

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of mine) {
      m.set(e.status, (m.get(e.status) ?? 0) + 1);
      if (isPending(e)) m.set('pending', (m.get('pending') ?? 0) + 1);
    }
    return m;
  }, [mine]);

  const filtered = !statusF
    ? mine
    : statusF === 'pending'
      ? mine.filter(isPending)
      : mine.filter((e) => e.status === statusF);
  const shown = useMemo(() => {
    if (!dateSort) return filtered;
    const when = (e: OutreachEntry) => {
      const emailed = e.lastEmailedOn ? Date.parse(e.lastEmailedOn) : NaN;
      return Number.isFinite(emailed) ? emailed : (e.updated ?? e.created ?? 0);
    };
    const dir = dateSort === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => dir * (when(a) - when(b)));
  }, [filtered, dateSort]);

  const save = async (data: Partial<OutreachEntry>) => {
    try {
      if (editing) {
        await api.outreach.update(editing.id, data);
        toast('Saved');
      } else {
        await api.outreach.create(data);
        toast(`${data.name} added`);
      }
      setEditing(null);
      onCloseAdd();
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const remove = async (entry: OutreachEntry) => {
    try {
      await api.outreach.remove(entry.id);
      setEditing(null);
      onChanged();
      toast(`${entry.name} removed`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const changeStatus = async (entry: OutreachEntry, status: OutreachStatus) => {
    if (status === entry.status) return;
    try {
      await api.outreach.update(entry.id, { status });
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const queueEmail = async (entry: OutreachEntry, template: 'intro' | 'follow-up') => {
    try {
      await api.outreach.requestEmail(entry.id, template);
      onChanged();
      toast('Queued — run the Claude terminal to draft it');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const markSent = async (entry: OutreachEntry, emailKind: 'intro' | 'follow-up') => {
    try {
      await api.outreach.markSent(entry.id, emailKind);
      onChanged();
      toast('Logged as sent');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const openFolder = async (entry: OutreachEntry) => {
    try {
      await api.openFolder(entry.folderPath ?? '');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const listRef = useRef<HTMLDivElement>(null);
  // A primitive id signature, not the `shown` array reference — `shown` is
  // recomputed fresh on every ~12s poll regardless of whether the rendered
  // set of entries actually changed (same bug/fix as the KPI/meter entrances
  // elsewhere, 30 Aug 2026).
  const shownSignature = shown.map((e) => e.id).join(',');
  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.from('.outreach-row', {
        opacity: 0,
        y: 6,
        duration: reduce ? 0 : 0.3,
        ease: 'power2.out',
        delay: reduce ? 0 : (i: number) => Math.min(i * 0.04, 0.2),
      });
    },
    { scope: listRef, dependencies: [shownSignature] }
  );

  return (
    <div className="space-y-5">
      {matcha && <MatchaPageHead eyebrow="Outreach" title={meta.title} />}
      {/* Same pack on both sections, by design — see GenericDocsPanel. */}
      <GenericDocsPanel kind={kind} toast={toast} />

      {mine.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
        <TabStrip
          items={FILTERS.map((f) => ({
            key: f.key || 'all',
            label: f.label,
            count: f.key === '' ? mine.length : (counts.get(f.key) ?? 0),
            icon:
              f.key === '' ? Icon.Grid : f.key === 'pending' ? Icon.Edit : OUTREACH_STATUS_ICON[f.key],
          })).filter((f) => f.key === 'all' || f.count > 0)}
          active={statusF || 'all'}
          onPick={(key) => setStatusF(key === 'all' ? '' : (key as StatusFilter))}
          ariaLabel={`Filter ${meta.plural} by status`}
        />
        <button
          onClick={() => setDateSort((s) => (s === '' ? 'desc' : s === 'desc' ? 'asc' : ''))}
          className={`btn-quiet text-meta ${dateSort ? 'text-accent' : ''}`}
          title="Sorts by last emailed, else last edited"
          aria-pressed={dateSort !== ''}
        >
          <Icon.Clock className="h-3.5 w-3.5" />
          {dateSort === 'desc' ? 'Date: newest first' : dateSort === 'asc' ? 'Date: oldest first' : 'Sort by date'}
        </button>
        </div>
      )}

      {mine.length === 0 ? (
        <div className="panel-empty px-6 py-16 text-center">
          <Icon.Building className="mx-auto mb-3 h-8 w-8 text-ink-faint" />
          <p className="text-subhead text-ink">No {meta.plural} yet</p>
          <p className="mt-1.5 text-meta text-ink-soft">
            {kind === 'company'
              ? 'Add a cyber-security company you’d like to approach directly — even one that isn’t advertising.'
              : 'Add an IT recruitment agency to register with and ask what they have.'}
          </p>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-meta text-ink-soft">
            Nothing at this status. <button
              onClick={() => setStatusF('')}
              className="text-accent underline-offset-2 hover:underline"
            >
              Show all
            </button>
          </p>
        </div>
      ) : (
        <>
        <div ref={listRef} className={matcha ? 'mx-ogrid grid gap-5 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
          {(matcha ? shown.slice(0, limit) : shown).map((entry) => {
            const Card = matcha ? MatchaOutreachCard : OutreachCard;
            return (
              <div key={entry.id} className="outreach-row">
                <Card
                  entry={entry}
                  linkedApplications={linkedCount(entry.name)}
                  onEdit={setEditing}
                  onStatusChange={changeStatus}
                  onQueueEmail={queueEmail}
                  onMarkSent={markSent}
                  onOpenFolder={openFolder}
                />
              </div>
            );
          })}
        </div>
        {matcha && (
          <ShowMoreControl
            total={shown.length}
            visible={limit}
            onShowMore={() => setLimit((v) => v + OUTREACH_LIMIT)}
            onShowAll={() => setLimit(shown.length)}
            onShowFewer={() => setLimit(OUTREACH_LIMIT)}
          />
        )}
        </>
      )}

      <p className="mx-notice flex items-center gap-1.5 px-1 text-label text-ink-faint">
        <Icon.Shield className="h-3 w-3" />
        Emails are drafted to disk and shown here to copy — this app never sends mail.
      </p>

      <OutreachModal
        open={addOpen || Boolean(editing)}
        kind={kind}
        entry={editing}
        onClose={() => {
          setEditing(null);
          onCloseAdd();
        }}
        onSave={save}
        onDelete={remove}
      />
    </div>
  );
}
