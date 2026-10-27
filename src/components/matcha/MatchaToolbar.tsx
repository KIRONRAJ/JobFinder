import { Icon } from '../Icons';
import { TABS as STATUS_TABS } from '../Pipeline';
import { ROLE_TYPES, SORTS, type Application, type SortKey } from '../../types';

// Same values the sidebar's tag filter offers.
const TAG_OPTIONS = ['SOT', 'Reapplied', 'Internship', 'Graduate', 'Cyber', 'Govt'];

interface Props {
  apps: Application[];
  search: string;
  onSearch: (v: string) => void;
  statusF: string;
  onStatus: (v: string) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  typeF: string;
  onType: (v: string) => void;
  employmentF: string;
  onEmployment: (v: string) => void;
  tagF: string;
  onTag: (v: string) => void;
  sotCount: number;
}

/**
 * Matcha's one-row applications toolbar: search, status chips, the four filter menus and the SoT toggle.
 * It owns no state. Every value and setter is the one the sidebar's filters already use (they all live in the
 * URL), so the sidebar, this toolbar and the list can never disagree.
 */
export function MatchaToolbar({
  apps,
  search,
  onSearch,
  statusF,
  onStatus,
  sort,
  onSort,
  typeF,
  onType,
  employmentF,
  onEmployment,
  tagF,
  onTag,
  sotCount,
}: Props) {
  const sotOn = tagF.toUpperCase() === 'SOT';
  const customTag = tagF && !TAG_OPTIONS.some((t) => t.toUpperCase() === tagF.toUpperCase());
  const sel = (on: boolean) => `mx-pillselect field-input w-auto ${on ? 'mx-pillselect-on' : ''}`;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5" role="group" aria-label="Filter applications">
      <div className="relative min-w-[220px] flex-1 basis-60">
        <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search company, role, or tag (e.g. SOT)…"
          className="mx-pillselect field-input pl-10"
          aria-label="Search applications"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        {STATUS_TABS.map((t) => {
          const active = statusF === t.key;
          return (
            <button
              key={t.key || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => onStatus(t.key)}
              className={`mx-chip ${active ? 'mx-chip-on' : ''}`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              <span className="mx-mono opacity-70">{apps.filter((a) => t.matches(a)).length}</span>
            </button>
          );
        })}
      </div>

      <span className="hidden h-6 w-px bg-line-soft lg:block" aria-hidden="true" />

      <select value={sort} onChange={(e) => onSort(e.target.value as SortKey)} className={sel(false)} aria-label="Sort by">
        {SORTS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <select value={typeF} onChange={(e) => onType(e.target.value)} className={sel(Boolean(typeF))} aria-label="Filter by role type">
        <option value="">All role types</option>
        {ROLE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        value={employmentF}
        onChange={(e) => onEmployment(e.target.value)}
        className={sel(Boolean(employmentF))}
        aria-label="Filter by employment type"
      >
        <option value="">Jobs + Internships</option>
        <option value="job">Jobs only</option>
        <option value="internship">Internships only</option>
      </select>
      <select value={tagF} onChange={(e) => onTag(e.target.value)} className={sel(Boolean(tagF))} aria-label="Filter by tag">
        <option value="">All tags</option>
        <option value="SOT">Summer of Tech (SOT)</option>
        {TAG_OPTIONS.filter((t) => t !== 'SOT').map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        {customTag && <option value={tagF}>{tagF}</option>}
      </select>

      {sotCount > 0 && (
        <button
          type="button"
          aria-pressed={sotOn}
          onClick={() => onTag(sotOn ? '' : 'SOT')}
          className={`mx-chip ${sotOn ? 'mx-chip-on' : ''}`}
          title="Filter by Summer of Tech (SOT) roles"
        >
          <img src="/source-logos/sot.svg" alt="" loading="lazy" decoding="async" className="h-3.5 w-3.5 object-contain" />
          SoT
          <span className="mx-mono opacity-70">{sotCount}</span>
        </button>
      )}
    </div>
  );
}
