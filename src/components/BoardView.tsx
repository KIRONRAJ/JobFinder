import { useRef, useState } from 'react';
import { useFlipList } from '../lib/useFlipList';
import { playSound } from '../lib/sound';
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
} from './Badges';
import { CompanyAvatar } from './CompanyAvatar';
import { ReadinessBar } from './ReadinessBar';
import { computeReadiness } from '../lib/readiness';
import { STATUSES, type Application, type Status } from '../types';

interface Props {
  apps: Application[];
  onEdit: (app: Application) => void;
  onStatusChange: (app: Application, status: Status) => void;
}

export function BoardView({ apps, onEdit, onStatusChange }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Status | null>(null);

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
          onEdit={onEdit}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}

/**
 * One Kanban column. Drag-and-drop is the browser's native HTML5 DnD API
 * (`draggable` + `onDragStart`/`onDragOver`/`onDrop`) — no library involved,
 * framer-motion or GSAP. Card entrance/reflow within a column IS a GSAP
 * concern (useFlipList, same primitive App.tsx's role list uses). One
 * simplification carried over from there: a card moving to a DIFFERENT
 * column (a status change) disappears from the old column and fades in
 * fresh in the new one, rather than sliding across — framer-motion's
 * `layoutId` used to animate that cross-container move directly; replicating
 * it with GSAP Flip's id-based cross-container matching is a real project on
 * its own, and a board view Kironraj visits occasionally didn't earn it.
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
  onEdit: (app: Application) => void;
  onStatusChange: (app: Application, status: Status) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useFlipList(listRef, cards);

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
      className={`flex max-h-[60vh] min-h-[8rem] w-[85vw] flex-none flex-col
                  rounded-2xl border transition sm:max-h-[calc(100vh-22rem)] sm:w-[17.5rem]
                  ${isOver ? 'border-accent bg-accent/[0.04]' : 'border-line bg-panel-2/40'}`}
    >
      <div className="flex flex-none items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 text-meta font-medium">
          <StatusIcon status={statusKey} />
          {label}
        </span>
        <span className="font-mono text-micro tabular-nums text-ink-faint">{cards.length}</span>
      </div>

      <div ref={listRef} className="flex flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
        {cards.map((a) => (
          <div
            key={a.id}
            draggable
            onDragStart={(e) => {
              setDragId(a.id);
              e.dataTransfer.setData('text/plain', a.id);
            }}
            onDragEnd={() => setDragId(null)}
            onClick={() => onEdit(a)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEdit(a);
              }
            }}
            tabIndex={0}
            role="button"
            className={`cursor-grab rounded-xl border border-line bg-panel p-3 shadow-lift
                       transition hover:-translate-y-px active:cursor-grabbing
                       focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                       ${dragId === a.id ? 'opacity-40' : ''}
                       ${statusWash(a.status)}`}
          >
            <div className="flex gap-2.5">
              <CompanyAvatar name={a.company} source={a.source} className="mt-0.5 h-7 w-7 text-label" />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-body font-semibold leading-snug tracking-[-0.01em] ${a.status === 'rejected' ? 'text-ink-soft line-through decoration-1' : ''}`}
                >
                  {a.role}
                </div>
                <div className="mt-0.5 text-micro text-ink-soft">{a.company}</div>
              </div>
            </div>
            <div className="mt-2.5 flex flex-col gap-1">
              <div className="flex flex-wrap gap-1.5">
                <PriorityTag app={a} />
                <FitTag fit={a.fit} />
                <ReadinessBar readiness={computeReadiness(a)} variant="compact" />
                <DeadlineTag app={a} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <EvidenceTag app={a} />
                {a.employment === 'internship' && <InternshipTag />}
                <AppliedTag app={a} />
                <CvTag cvStatus={a.cvStatus ?? ''} />
              </div>
            </div>
          </div>
        ))}

        {cards.length === 0 && (
          <div className="panel-empty mx-0.5 my-1 py-5 text-center text-micro text-ink-faint">
            Nothing here
          </div>
        )}
      </div>
    </div>
  );
}
