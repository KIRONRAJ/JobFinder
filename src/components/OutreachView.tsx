import { useMemo, useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';
import { Icon } from './Icons';
import { OutreachCard } from './OutreachCard';
import { OutreachModal } from './OutreachModal';
import { GenericDocsPanel } from './GenericDocsPanel';
import { TabStrip } from './TabStrip';
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

const FILTERS: { key: '' | OutreachStatus; label: string }[] = [
  { key: '', label: 'All' },
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
  const [statusF, setStatusF] = useState<'' | OutreachStatus>('');
  const [editing, setEditing] = useState<OutreachEntry | null>(null);

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
    for (const e of mine) m.set(e.status, (m.get(e.status) ?? 0) + 1);
    return m;
  }, [mine]);

  const shown = statusF ? mine.filter((e) => e.status === statusF) : mine;

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
      {/* Same pack on both sections, by design — see GenericDocsPanel. */}
      <GenericDocsPanel kind={kind} toast={toast} />

      {mine.length > 0 && (
        <TabStrip
          items={FILTERS.map((f) => ({
            key: f.key || 'all',
            label: f.label,
            count: f.key === '' ? mine.length : (counts.get(f.key) ?? 0),
            icon: f.key === '' ? Icon.Grid : OUTREACH_STATUS_ICON[f.key],
          })).filter((f) => f.key === 'all' || f.count > 0)}
          active={statusF || 'all'}
          onPick={(key) => setStatusF(key === 'all' ? '' : (key as OutreachStatus))}
          ariaLabel={`Filter ${meta.plural} by status`}
        />
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
        <div ref={listRef} className="space-y-3">
          {shown.map((entry) => (
            <div key={entry.id} className="outreach-row">
              <OutreachCard
                entry={entry}
                linkedApplications={linkedCount(entry.name)}
                onEdit={setEditing}
                onStatusChange={changeStatus}
                onQueueEmail={queueEmail}
                onMarkSent={markSent}
                onOpenFolder={openFolder}
              />
            </div>
          ))}
        </div>
      )}

      <p className="flex items-center gap-1.5 px-1 text-label text-ink-faint">
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
