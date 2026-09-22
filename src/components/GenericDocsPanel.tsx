import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { api } from '../api';

interface DocItem {
  key: string;
  label: string;
  file: string;
  exists: boolean;
  updatedAt: number | null;
}

/**
 * The generic application pack, surfaced on both outreach sections.
 *
 * Deliberately the SAME component and the SAME files on Recruiters and Direct
 * approach — the whole point of the generic pack is that one CV goes out to
 * every cold approach from a single location, never copied per target and
 * never tailored per organisation. Showing two different panels here would
 * invite exactly the per-target drift the single-location rule exists to
 * prevent; the only thing that varies between the two sections is the
 * one-line hint under the heading, since what a recruiter does with the CV
 * differs from what a hiring company does.
 *
 * Read-only: it reports what's on disk and opens the folder. Regenerating
 * these is a Claude-side job (they're built from the base resume + Candidate
 * Key Facts), so there's no "generate" button to get out of sync with that.
 */
export function GenericDocsPanel({
  kind,
  toast,
}: {
  kind: 'company' | 'recruiter';
  toast: (text: string, tone?: 'info' | 'error') => void;
}) {
  const [items, setItems] = useState<DocItem[] | null>(null);
  const [folderPath, setFolderPath] = useState<string>('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .genericDocs()
      .then((d) => {
        if (!alive) return;
        setItems(d.items);
        setFolderPath(d.folderPath);
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  const openFolder = async () => {
    try {
      await api.openFolder(folderPath);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const present = (items ?? []).filter((i) => i.exists);
  const missing = (items ?? []).filter((i) => !i.exists);

  // Freshness is worth surfacing: these are regenerated only when the base
  // resume or Candidate Key Facts change, so a months-old pack going out to a
  // new recruiter is a real (and otherwise invisible) failure mode.
  const newest = present.reduce<number | null>(
    (acc, i) => (i.updatedAt && (!acc || i.updatedAt > acc) ? i.updatedAt : acc),
    null
  );
  const ageDays = newest ? Math.floor((Date.now() - newest) / 86_400_000) : null;
  const stale = ageDays !== null && ageDays > 60;

  return (
    <section className="panel px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-1.5 text-subhead font-medium text-ink transition hover:text-accent"
          >
            <Icon.Chevron
              className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            />
            Generic application pack
          </button>
          <p className="mt-1 text-micro text-ink-soft">
            {kind === 'recruiter'
              ? 'Attach these to every recruiter registration — most want a CV and cover letter alongside the email.'
              : 'Attach these to every cold approach. Same pack as Recruiters — one CV, never tailored per company.'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {ageDays !== null && (
            <span
              className={`chip whitespace-nowrap ${stale ? 'border-amber/40 text-amber' : ''}`}
              title={newest ? new Date(newest).toLocaleString('en-NZ') : undefined}
            >
              {stale ? <Icon.Warning className="h-3 w-3" /> : <Icon.Clock className="h-3 w-3" />}
              {ageDays === 0 ? 'Updated today' : `Updated ${ageDays}d ago`}
            </span>
          )}
          <button onClick={openFolder} className="btn-ghost" title={folderPath}>
            <Icon.Folder className="h-3.5 w-3.5" />
            Open folder
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 border-t border-line-soft pt-3.5">
          {items === null ? (
            <p className="text-micro text-ink-faint">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-micro text-ink-soft">
              No generic pack found at "{folderPath}". Ask Claude in chat to draft one.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {present.map((i) => (
                <li key={i.key} className="flex items-center gap-2 text-meta">
                  <Icon.CheckCircle className="h-3.5 w-3.5 shrink-0 text-grass" />
                  <span className="text-ink">{i.label}</span>
                  <span className="truncate font-mono text-label text-ink-faint">{i.file}</span>
                </li>
              ))}
              {missing.map((i) => (
                <li key={i.key} className="flex items-center gap-2 text-meta">
                  <Icon.Circle className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                  <span className="text-ink-soft">{i.label}</span>
                  <span className="text-label text-ink-faint">not generated</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-label text-ink-faint">
            <Icon.Shield className="mt-[1px] h-3 w-3 shrink-0" />
            Generic by design — no ATS tailoring to a specific ad. For a logged role, use that
            role's own tailored CV instead.
          </p>
        </div>
      )}
    </section>
  );
}
