import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from './Icons';
import { CompanyAvatar } from './CompanyAvatar';
import { StatusPill, FIT_TEXT, TagBadge } from './Badges';
import { isCvActuallyDone } from '../lib/readiness';
import type { Application, FolderStatus } from '../types';

interface Props {
  apps: Application[];
  folders: Record<string, FolderStatus>;
  onEdit: (app: Application) => void;
  onPreviewDocs: (app: Application) => void;
  onRequestCv: (app: Application) => void;
  onMarkApplied: (app: Application) => void;
  onSelectTag?: (tag: string) => void;
}

type SortCol = 'company' | 'role' | 'status' | 'date' | 'deadline' | 'fit';

export function DenseTableView({
  apps,
  folders,
  onEdit,
  onPreviewDocs,
  onRequestCv,
  onMarkApplied,
  onSelectTag,
}: Props) {
  const navigate = useNavigate();
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortAsc, setSortAsc] = useState(false);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(col === 'company' || col === 'role');
    }
  };

  const sorted = useMemo(() => {
    return [...apps].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'company') {
        cmp = a.company.localeCompare(b.company);
      } else if (sortCol === 'role') {
        cmp = a.role.localeCompare(b.role);
      } else if (sortCol === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortCol === 'fit') {
        const order = { strong: 1, good: 2, stretch: 3 };
        cmp = (order[a.fit] || 99) - (order[b.fit] || 99);
      } else if (sortCol === 'date') {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        cmp = db - da;
      } else if (sortCol === 'deadline') {
        const da = a.deadline ? new Date(a.deadline).getTime() : 9999999999999;
        const db = b.deadline ? new Date(b.deadline).getTime() : 9999999999999;
        cmp = da - db;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [apps, sortCol, sortAsc]);

  const SortHeader = ({ col, label, className = '' }: { col: SortCol; label: string; className?: string }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`cursor-pointer select-none px-3 py-2.5 text-left text-micro font-semibold uppercase tracking-wider text-ink-soft hover:text-ink ${className}`}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {sortCol === col && (
          <span className="text-accent text-[10px]">{sortAsc ? '▲' : '▼'}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="overflow-hidden rounded-md border-2 border-line bg-panel shadow-hardSm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-body">
          <thead className="border-b-2 border-line bg-panel-2/70 text-ink-faint">
            <tr>
              <SortHeader col="company" label="Company" className="pl-4 min-w-[180px]" />
              <SortHeader col="role" label="Role" className="min-w-[220px]" />
              <SortHeader col="status" label="Status" className="w-[140px]" />
              <SortHeader col="fit" label="Fit" className="w-[100px]" />
              <SortHeader col="date" label="Applied" className="w-[110px]" />
              <SortHeader col="deadline" label="Deadline" className="w-[110px]" />
              <th className="px-3 py-2.5 text-micro font-semibold uppercase tracking-wider text-ink-soft min-w-[140px]">
                Tags
              </th>
              <th className="px-3 py-2.5 text-right text-micro font-semibold uppercase tracking-wider text-ink-soft pr-4 w-[180px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {sorted.map((app) => {
              const folder = folders[app.id];
              const hasDrafts = isCvActuallyDone(app, folder);

              return (
                <tr
                  key={app.id}
                  onClick={() => navigate(`/role/${app.id}`)}
                  className="group cursor-pointer transition hover:bg-panel-2/40 active:bg-panel-2"
                >
                  {/* Company */}
                  <td className="py-2.5 pl-4 pr-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CompanyAvatar
                        name={app.company}
                        source={app.source}
                        tags={app.tags}
                        className="h-6 w-6 text-micro shrink-0"
                      />
                      <span className="truncate font-medium text-ink group-hover:text-accent transition">
                        {app.company}
                      </span>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        to={`/role/${app.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate font-semibold text-ink hover:text-accent hover:underline block"
                      >
                        {app.role}
                      </Link>
                      <div className="flex items-center gap-1.5 text-micro text-ink-faint truncate">
                        {app.location && <span>{app.location}</span>}
                        {app.employment === 'internship' && <span>· Internship</span>}
                        {app.type && app.type !== 'Other' && <span>· {app.type}</span>}
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <StatusPill status={app.status} />
                  </td>

                  {/* Fit */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-label">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 font-medium ${
                        app.fit === 'strong'
                          ? 'bg-grass/15 text-grass'
                          : app.fit === 'good'
                            ? 'bg-accent/15 text-accent'
                            : 'bg-amber/15 text-amber'
                      }`}
                    >
                      {FIT_TEXT[app.fit]}
                    </span>
                  </td>

                  {/* Applied Date */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-meta font-mono text-ink-soft">
                    {app.date || <span className="text-ink-faint">—</span>}
                  </td>

                  {/* Deadline */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-meta font-mono text-ink-soft">
                    {app.deadline || <span className="text-ink-faint">—</span>}
                  </td>

                  {/* Tags */}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1 max-w-[180px]">
                      {app.tags && app.tags.length > 0 ? (
                        app.tags.slice(0, 2).map((t) => (
                          <TagBadge
                            key={t}
                            tag={t}
                            onClick={
                              onSelectTag
                                ? (e) => {
                                    e.stopPropagation();
                                    onSelectTag(t);
                                  }
                                : undefined
                            }
                          />
                        ))
                      ) : (
                        <span className="text-micro text-ink-faint">—</span>
                      )}
                      {app.tags && app.tags.length > 2 && (
                        <span className="text-micro text-ink-faint">+{app.tags.length - 2}</span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                    <div
                      className="flex items-center justify-end gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {hasDrafts ? (
                        <button
                          type="button"
                          onClick={() => onPreviewDocs(app)}
                          title="Preview CV & Cover Letter"
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-1 text-micro font-medium text-ink transition hover:border-accent hover:text-accent shadow-hardXs"
                        >
                          <Icon.Doc className="h-3 w-3 text-accent" />
                          <span>Preview</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onRequestCv(app)}
                          title="Queue CV generation"
                          className="inline-flex items-center gap-1 rounded-full border border-line-soft px-2 py-1 text-micro text-ink-faint hover:border-line hover:text-ink transition"
                        >
                          <Icon.Sparkles className="h-3 w-3" />
                          <span>CV</span>
                        </button>
                      )}

                      {app.status === 'researching' && onMarkApplied && (
                        <button
                          type="button"
                          onClick={() => onMarkApplied(app)}
                          title="Mark as Applied"
                          className="inline-flex items-center gap-1 rounded-full border border-line-soft px-2 py-1 text-micro text-applied hover:border-applied hover:bg-applied/10 transition"
                        >
                          <Icon.Paperplane className="h-3 w-3" />
                          <span>Applied</span>
                        </button>
                      )}

                      {app.link && (
                        <a
                          href={app.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open Job Ad"
                          className="rounded-full p-1.5 text-ink-faint hover:text-ink transition hover:bg-panel-2"
                        >
                          <Icon.External className="h-3.5 w-3.5" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => onEdit(app)}
                        title="Edit entry"
                        className="rounded-full p-1.5 text-ink-faint hover:text-ink transition hover:bg-panel-2"
                      >
                        <Icon.Edit className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line-soft bg-panel-2/30 px-4 py-2 text-micro text-ink-faint flex items-center justify-between">
        <span>Showing {sorted.length} applications in table view</span>
        <span>Click any row or role title for details</span>
      </div>
    </div>
  );
}
