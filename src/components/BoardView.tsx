import { useRef, useState } from 'react';
import { useFlipList } from '../lib/useFlipList';
import { playSound } from '../lib/sound';
import { AnimatedCounter } from './AnimatedCounter';
import {
  AppliedTag,
  CvTag,
  DeadlineTag,
  EvidenceTag,
  FitTag,
  InternshipTag,
  PriorityTag,
  StatusIcon,
  statusWash,
  TagBadge,
} from './Badges';
import { CompanyAvatar } from './CompanyAvatar';
import { ReadinessBar } from './ReadinessBar';
import { computeReadiness } from '../lib/readiness';
import { Icon } from './Icons';
import { STATUSES, type Application, type Status } from '../types';

interface Props {
  apps: Application[];
  onOpen?: (app: Application) => void;
  onEdit?: (app: Application) => void;
  onStatusChange: (app: Application, status: Status) => void;
}

export function BoardView({ apps, onOpen, onEdit, onStatusChange }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Status | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Record<string, boolean>>({
    rejected: true,
    withdrawn: true,
  });

  const toggleCollapse = (statusKey: Status) => {
    setCollapsedCols((prev) => ({ ...prev, [statusKey]: !prev[statusKey] }));
  };

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-4">
      {STATUSES.map(({ key, label }) => (
        <BoardColumn
          key={key}
          statusKey={key}
          label={label}
          apps={apps}
          cards={apps.filter((a) => a.status === key)}
          isOver={overCol === key}
          dragId={dragId}
          setDragId={setDragId}
          setOverCol={setOverCol}
          isCollapsed={Boolean(collapsedCols[key])}
          onToggleCollapse={() => toggleCollapse(key)}
          onOpen={onOpen}
          onEdit={onEdit}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}

/**
 * One Kanban column with Bauhaus geometry, metrics, collapse support,
 * and mobile touch status assignment.
 */
function BoardColumn({
  statusKey,
  label,
  apps,
  cards,
  isOver,
  dragId,
  setDragId,
  setOverCol,
  isCollapsed,
  onToggleCollapse,
  onOpen,
  onEdit,
  onStatusChange,
}: {
  statusKey: Status;
  label: string;
  apps: Application[];
  cards: Application[];
  isOver: boolean;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  setOverCol: (updater: (c: Status | null) => Status | null) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpen?: (app: Application) => void;
  onEdit?: (app: Application) => void;
  onStatusChange: (app: Application, status: Status) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useFlipList(listRef, cards);

  const handleOpen = onOpen || onEdit;
  const pct = Math.round((cards.length / Math.max(1, apps.length)) * 100);

  if (isCollapsed) {
    return (
      <div
        onClick={onToggleCollapse}
        title={`Expand ${label} (${cards.length})`}
        className="flex h-[400px] w-12 flex-none cursor-pointer flex-col items-center justify-between rounded-md border-2 border-line bg-panel-2/40 py-4 shadow-hardSm transition hover:bg-panel-2 hover:border-accent"
      >
        <div className="flex flex-col items-center gap-2">
          <StatusIcon status={statusKey} />
          <span className="font-mono text-micro font-semibold text-ink-soft">
            <AnimatedCounter value={cards.length} />
          </span>
        </div>
        <div className="[writing-mode:vertical-rl] rotate-180 select-none text-meta font-semibold uppercase tracking-wider text-ink-faint">
          {label}
        </div>
        <Icon.Chevron className="h-3.5 w-3.5 rotate-90 text-ink-faint" />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOverCol(() => statusKey);
      }}
      onDragLeave={() => setOverCol((c) => (c === statusKey ? null : c))}
      onDrop={(e) => {
        e.preventDefault();
        setOverCol(() => null);
        const id = e.dataTransfer.getData('text/plain');
        const app = apps.find((a) => a.id === id);
        if (app && app.status !== statusKey) {
          onStatusChange(app, statusKey);
          playSound('tick');
        }
      }}
      className={`flex max-h-[70vh] min-h-[8rem] w-[85vw] flex-none flex-col
                  rounded-md border-2 transition sm:max-h-[calc(100vh-20rem)] sm:w-[18.5rem]
                  ${isOver ? 'border-accent bg-accent/[0.06] shadow-hardMd' : 'border-line bg-panel-2/30 shadow-hardSm'}`}
    >
      <div className="flex flex-none items-center justify-between border-b-2 border-line bg-panel px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <StatusIcon status={statusKey} />
          <span className="text-meta font-bold uppercase tracking-wider text-ink">{label}</span>
          <span className="chip px-1.5 py-0 text-micro font-mono">
            <AnimatedCounter value={cards.length} /> <span className="text-ink-faint">(<AnimatedCounter value={pct} />%)</span>
          </span>
        </div>
        <button
          onClick={onToggleCollapse}
          title={`Collapse ${label} column`}
          className="rounded p-1 text-ink-faint hover:bg-panel-2 hover:text-ink transition"
        >
          <Icon.Chevron className="h-3 w-3 -rotate-90" />
        </button>
      </div>

      <div ref={listRef} className="flex flex-col gap-2.5 overflow-y-auto p-3">
        {cards.map((a) => (
          <div
            key={a.id}
            draggable
            onDragStart={(e) => {
              setDragId(a.id);
              e.dataTransfer.setData('text/plain', a.id);
            }}
            onDragEnd={() => setDragId(null)}
            onClick={() => handleOpen?.(a)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpen?.(a);
              }
            }}
            tabIndex={0}
            role="button"
            className={`group cursor-grab rounded-md border-2 border-line bg-panel p-3.5 shadow-hardSm
                       transition duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hardMd active:cursor-grabbing
                       focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                       ${dragId === a.id ? 'opacity-40' : ''}
                       ${statusWash(a.status)}`}
          >
            <div className="flex gap-2.5">
              <CompanyAvatar
                name={a.company}
                source={a.source}
                tags={a.tags}
                className="mt-0.5 h-7 w-7 text-label shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-body font-semibold leading-snug tracking-[-0.01em] ${
                    a.status === 'rejected' ? 'text-ink-soft line-through decoration-1' : 'text-ink group-hover:text-accent transition'
                  }`}
                >
                  {a.role}
                </div>
                <div className="mt-0.5 text-micro text-ink-soft font-medium">{a.company}</div>
              </div>
            </div>

            <div className="mt-2.5 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <PriorityTag app={a} />
                <FitTag fit={a.fit} />
                <ReadinessBar readiness={computeReadiness(a)} variant="compact" />
                <DeadlineTag app={a} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <EvidenceTag app={a} />
                {a.employment === 'internship' && <InternshipTag />}
                {a.tags?.map((t) => (
                  <TagBadge key={t} tag={t} />
                ))}
                <AppliedTag app={a} />
                <CvTag cvStatus={a.cvStatus ?? ''} />
              </div>
            </div>

            {/* Mobile Touch Quick-Status Changer (Only visible on small touch screens) */}
            <div
              className="mt-3 flex items-center justify-between border-t border-line-soft pt-2 sm:hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-micro font-medium text-ink-faint">Move to:</span>
              <select
                value={a.status}
                onChange={(e) => onStatusChange(a, e.target.value as Status)}
                className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-micro font-medium text-ink"
              >
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}

        {cards.length === 0 && (
          <div className="rounded border-2 border-dashed border-line-soft p-5 text-center text-micro text-ink-faint">
            No applications in {label.toLowerCase()}
          </div>
        )}
      </div>
    </div>
  );
}
