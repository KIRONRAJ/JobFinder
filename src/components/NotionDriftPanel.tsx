import { useState } from 'react';
import { Icon } from './Icons';
import { api } from '../api';
import { useAppData } from '../state/AppDataProvider';

interface DriftField {
  field: string;
  local: unknown;
  notion: unknown;
}
interface DriftRow {
  id: string;
  role: string;
  company: string;
  fields: DriftField[];
}

const FIELD_LABEL: Record<string, string> = {
  status: 'Status',
  fit: 'Fit',
  date: 'Applied date',
  deadline: 'Closing date',
  followUpDue: 'Follow-up due',
  nextAction: 'Next action',
  nextActionDue: 'Next action due',
  notes: 'Notes',
  contactName: 'Contact name',
  contactEmail: 'Contact email',
  contactPhone: 'Contact phone',
  salary: 'Salary',
  workArrangement: 'Work arrangement',
  trackingRef: 'Tracking ref',
  trackingUrl: 'Tracking link',
};

function fmt(v: unknown) {
  if (v === '' || v === null || v === undefined) return '(empty)';
  return String(v);
}

/**
 * F3 — Notion reconcile, review side. `notion.js` only ever pushed to
 * Notion; an edit made there (the phone/cross-device fallback) was silently
 * overwritten by the next local write, with no signal it had even happened.
 * This is a dry-run diff, reviewed row by row — nothing is written until the
 * user picks "Use Notion's" for a specific field, which is then a completely
 * ordinary `api.update` PATCH, going through the same activity log and
 * re-sync every other edit does. Never offered for Claude-owned fields
 * (analysis/evidenceMap/priority/interview/rejection/tasks) — the server
 * route doesn't even read those back off the Notion page.
 */
export function NotionDriftPanel() {
  const { setApps } = useAppData();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DriftRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await api.notionReconcile();
      setRows(res.drift);
      setChecked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  const accept = async (row: DriftRow, f: DriftField) => {
    const key = `${row.id}-${f.field}`;
    setBusyKey(key);
    try {
      const updated = await api.update(row.id, { [f.field]: f.notion } as Record<string, unknown>);
      setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      setRows((prev) =>
        prev
          .map((r) => (r.id === row.id ? { ...r, fields: r.fields.filter((x) => x.field !== f.field) } : r))
          .filter((r) => r.fields.length > 0)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  };

  const ignore = (row: DriftRow, f: DriftField) => {
    setRows((prev) =>
      prev
        .map((r) => (r.id === row.id ? { ...r, fields: r.fields.filter((x) => x.field !== f.field) } : r))
        .filter((r) => r.fields.length > 0)
    );
  };

  return (
    <div className="panel mb-6 px-5 py-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-subhead font-medium text-ink">Notion drift</h3>
          <p className="mt-1 text-micro text-ink-soft">
            Sync only ever pushed to Notion — an edit made there could be silently overwritten.
            This checks for local vs. Notion differences on user-owned fields; nothing applies
            until you say so.
          </p>
        </div>
        <button onClick={check} disabled={checking} className="btn-quiet shrink-0 px-3.5 py-2 text-micro">
          {checking ? <Icon.Clock className="h-3.5 w-3.5 animate-spin" /> : <Icon.Sparkle className="h-3.5 w-3.5" />}
          {checking ? 'Checking…' : 'Check for drift'}
        </button>
      </div>

      {error && <p className="mt-3 text-micro text-rose">{error}</p>}

      {checked && rows.length === 0 && !error && (
        <p className="mt-3 flex items-center gap-1.5 text-micro text-grass">
          <Icon.CheckCircle className="h-3.5 w-3.5" />
          Nothing drifted.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="panel-inset px-4 py-3">
              <p className="mb-2 text-meta font-medium text-ink">
                {row.role} <span className="text-ink-soft">— {row.company}</span>
              </p>
              <ul className="space-y-2">
                {row.fields.map((f) => {
                  const key = `${row.id}-${f.field}`;
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-2 text-micro">
                      <span className="w-28 shrink-0 text-ink-faint">{FIELD_LABEL[f.field] ?? f.field}</span>
                      <span className="text-ink-soft">local: {fmt(f.local)}</span>
                      <span className="text-ink-faint">·</span>
                      <span className="text-ink">Notion: {fmt(f.notion)}</span>
                      <span className="ml-auto flex items-center gap-1.5">
                        <button
                          onClick={() => accept(row, f)}
                          disabled={busyKey === key}
                          className="btn-ghost h-7 px-2.5 text-label"
                        >
                          Use Notion's
                        </button>
                        <button
                          onClick={() => ignore(row, f)}
                          disabled={busyKey === key}
                          className="btn-ghost h-7 px-2.5 text-label"
                        >
                          Ignore
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
