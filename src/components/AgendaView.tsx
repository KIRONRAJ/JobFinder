import { useState } from 'react';
import { Icon } from './Icons';
import { CompanyAvatar } from './CompanyAvatar';
import { api } from '../api';
import { useAppData } from '../state/AppDataProvider';
import {
  daysUntil,
  outreachFollowUpDue,
  type Application,
  type OutreachEntry,
} from '../types';

interface Props {
  apps: Application[];
  outreach: OutreachEntry[];
  onOpenApp: (app: Application) => void;
  onOpenOutreach: (entry: OutreachEntry) => void;
  toast: (text: string, tone?: 'info' | 'error') => void;
}

type Kind = 'deadline' | 'followup' | 'nextaction' | 'interview' | 'outreach' | 'task';

interface AgendaItem {
  id: string;
  /** id of the source Application or OutreachEntry, so the row can be opened
   *  without re-parsing a composite key back apart. */
  entryId: string;
  source: 'app' | 'outreach';
  appSource?: string;
  tags?: string[];
  date: string;
  kind: Kind;
  title: string;
  company: string;
  sub: string;
  /** 'followup': mark-done clears followUpDue. 'task': mark-done completes
   *  that specific task (taskId set). Anything else has no inline action —
   *  next-actions and deadlines resolve by the entry's status changing. */
  action?: 'followup' | 'task';
  taskId?: string;
}

const KIND_ICON: Record<Kind, (p: { className?: string }) => JSX.Element> = {
  deadline: Icon.Warning,
  followup: Icon.Clock,
  nextaction: Icon.Arrow,
  interview: Icon.Chat,
  outreach: Icon.Mail,
  task: Icon.Zap,
};

const KIND_LABEL: Record<Kind, string> = {
  deadline: 'Closing date',
  followup: 'Follow up',
  nextaction: 'Next action',
  interview: 'Interview',
  outreach: 'Outreach follow-up',
  task: 'Task',
};

/** Rows this action row applies to — a plain application/outreach follow-up
 *  (done clears `followUpDue`), or a specific task (done sets its
 *  `completedAt`). Deadlines, next-actions and interviews aren't
 *  closeable actions here — they resolve by the entry's status changing. */
/** Everything in the app with a date, in one rolling list — replaces hunting
 *  across cards for what's actually due. Only application-side items open
 *  the edit modal directly; outreach items jump to their section, since
 *  OutreachView owns its own edit-modal state and isn't wired for a
 *  cross-component "open this exact entry" call. */
function buildAgenda(apps: Application[], outreach: OutreachEntry[]): AgendaItem[] {
  const items: AgendaItem[] = [];

  for (const a of apps) {
    if (a.deadline && a.status !== 'rejected' && a.status !== 'withdrawn' && a.status !== 'offer') {
      items.push({
        id: `${a.id}-deadline`,
        entryId: a.id,
        source: 'app',
        appSource: a.source,
        tags: a.tags,
        date: a.deadline,
        kind: 'deadline',
        title: a.role,
        company: a.company,
        sub: KIND_LABEL.deadline,
      });
    }
    if (a.followUpDue && a.status === 'applied') {
      items.push({
        id: `${a.id}-followup`,
        entryId: a.id,
        source: 'app',
        appSource: a.source,
        tags: a.tags,
        date: a.followUpDue,
        kind: 'followup',
        title: a.role,
        company: a.company,
        sub: KIND_LABEL.followup,
        action: 'followup',
      });
    }
    if (a.nextAction && a.nextActionDue) {
      items.push({
        id: `${a.id}-nextaction`,
        entryId: a.id,
        source: 'app',
        appSource: a.source,
        tags: a.tags,
        date: a.nextActionDue,
        kind: 'nextaction',
        title: a.role,
        company: a.company,
        sub: a.nextAction,
      });
    }
    if (a.status === 'interview' && a.interview?.when) {
      const t = Date.parse(a.interview.when);
      if (!Number.isNaN(t)) {
        const d = new Date(t);
        items.push({
          id: `${a.id}-interview`,
          entryId: a.id,
          source: 'app',
          appSource: a.source,
          tags: a.tags,
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          kind: 'interview',
          title: a.role,
          company: a.company,
          sub: `Interview${a.interview.medium ? ` · ${a.interview.medium}` : ''}`,
        });
      }
    }
    // Assessments/take-homes — real due timestamps, previously invisible in
    // Agenda entirely (there was no API route to act on them either).
    for (const task of a.tasks ?? []) {
      if (task.completedAt || !task.dueAt) continue;
      const t = Date.parse(task.dueAt);
      if (Number.isNaN(t)) continue;
      const d = new Date(t);
      items.push({
        id: `${a.id}-task-${task.id}`,
        entryId: a.id,
        source: 'app',
        appSource: a.source,
        tags: a.tags,
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        kind: 'task',
        title: a.role,
        company: a.company,
        sub: task.label,
        action: 'task',
        taskId: task.id,
      });
    }
  }

  for (const e of outreach) {
    const due = outreachFollowUpDue(e);
    if (due) {
      items.push({
        id: `${e.id}-followup`,
        entryId: e.id,
        source: 'outreach',
        date: due,
        kind: 'outreach',
        title: e.name,
        company: e.kind === 'company' ? 'Direct approach' : 'Recruiter',
        sub: KIND_LABEL.outreach,
        action: 'followup',
      });
    }
    if (e.nextAction && e.nextActionDue) {
      items.push({
        id: `${e.id}-nextaction`,
        entryId: e.id,
        source: 'outreach',
        date: e.nextActionDue,
        kind: 'nextaction',
        title: e.name,
        company: e.kind === 'company' ? 'Direct approach' : 'Recruiter',
        sub: e.nextAction,
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

function dateHeading(dateStr: string, days: number) {
  if (days < 0) return `Overdue · ${Math.abs(days)}d`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short' });
}

/** Inline "mark done / snooze" pair for a follow-up or task row — the part
 *  that was missing entirely before: `followUpDue` and `tasks[].dueAt` were
 *  both computed and displayed, but nothing could ever close them out. */
function DueActions({ item, onDone, onSnooze }: { item: AgendaItem; onDone: () => void; onSnooze: () => void }) {
  const [busy, setBusy] = useState<'done' | 'snooze' | null>(null);
  return (
    <span className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={async () => {
          setBusy('done');
          try {
            await onDone();
          } finally {
            setBusy(null);
          }
        }}
        disabled={busy !== null}
        className="btn-ghost h-7 px-2.5 text-label"
        title={item.action === 'task' ? 'Mark task done' : 'Mark followed up'}
      >
        {busy === 'done' ? <Icon.Clock className="h-3 w-3 animate-spin" /> : <Icon.Check className="h-3 w-3" />}
        Done
      </button>
      {item.action === 'followup' && (
        <button
          onClick={async () => {
            setBusy('snooze');
            try {
              await onSnooze();
            } finally {
              setBusy(null);
            }
          }}
          disabled={busy !== null}
          className="btn-ghost h-7 px-2.5 text-label"
          title="Push this follow-up out 3 days"
        >
          Snooze 3d
        </button>
      )}
    </span>
  );
}

/** One row inside a day's item list — the detail panel under the grid and
 *  the overdue section both render items this way, so the row markup exists
 *  in exactly one place. */
function AgendaRow({
  it,
  overdue,
  bordered,
  onOpen,
  onDone,
  onSnooze,
}: {
  it: AgendaItem;
  overdue: boolean;
  bordered: boolean;
  onOpen: () => void;
  onDone: () => void;
  onSnooze: () => void;
}) {
  const IconEl = KIND_ICON[it.kind];
  return (
    // A `div` here, not `button` — DueActions renders real buttons inline,
    // and nested `<button>`s are invalid HTML.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`flex w-full cursor-pointer flex-col gap-1.5 px-4 py-3 text-left transition hover:bg-panel-2/60
                  focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30
                  ${bordered ? 'border-t border-line-soft' : ''}`}
    >
      <div className="flex items-center gap-3">
        <CompanyAvatar
          name={it.company}
          source={it.appSource}
          tags={it.tags}
          className="h-8 w-8 text-micro"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-medium">{it.title}</div>
          <div className="truncate text-micro text-ink-soft">{it.company}</div>
        </div>
        {/* Chip stays inline here only when there's no action row below to
            share the line with it — otherwise fitting avatar + title + chip
            + Done/Snooze on one row is what squeezed "Snooze 3d" down to
            wrapping mid-word on a phone. With actions present, the chip
            moves down to line up beside them instead. */}
        {!it.action && (
          <span
            className={`chip shrink-0 ${overdue ? 'border-rose/40 text-rose' : it.kind === 'interview' ? 'border-amber/40 text-amber' : ''}`}
          >
            <IconEl className="h-3 w-3" />
            {it.sub}
          </span>
        )}
      </div>
      {it.action && (
        <div
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pl-11"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className={`chip shrink-0 ${overdue ? 'border-rose/40 text-rose' : it.kind === 'interview' ? 'border-amber/40 text-amber' : ''}`}
          >
            <IconEl className="h-3 w-3" />
            {it.sub}
          </span>
          <DueActions item={it} onDone={onDone} onSnooze={onSnooze} />
        </div>
      )}
    </div>
  );
}

/** Small fixed-hue dot per item kind — the calendar cell's only signal until
 *  a day is opened, so it has to stay legible at 6px. Overdue always wins
 *  (rose) regardless of kind, matching the list view's overdue treatment. */
function kindDotColor(kind: Kind, overdue: boolean): string {
  if (overdue) return 'bg-rose';
  if (kind === 'interview' || kind === 'deadline') return 'bg-amber';
  if (kind === 'task') return 'bg-grass';
  return 'bg-accent';
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_DOTS_PER_CELL = 3;

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday-start 6-week grid covering the given month plus its lead/trail days
 *  from the adjacent months, so every visible week is a full row. */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // getDay(): 0=Sun..6=Sat → convert to a Monday-start offset (0=Mon..6=Sun).
  const leadDays = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - leadDays);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function AgendaView({ apps, outreach, onOpenApp, onOpenOutreach, toast }: Props) {
  const { setApps, refresh } = useAppData();
  const appsById = new Map(apps.map((a) => [a.id, a]));
  const outreachById = new Map(outreach.map((e) => [e.id, e]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<string>(todayStr);
  const [overdueCollapsed, setOverdueCollapsed] = useState(true);

  const allItems = buildAgenda(apps, outreach);
  if (allItems.length === 0) {
    return (
      <div className="panel-empty py-24 text-center">
        <Icon.Calendar className="mx-auto h-8 w-8 text-ink-faint" />
        <p className="mt-3 text-subhead text-ink-soft">Nothing on the calendar yet.</p>
      </div>
    );
  }

  const itemsByDate = new Map<string, AgendaItem[]>();
  for (const it of allItems) {
    const list = itemsByDate.get(it.date);
    if (list) list.push(it);
    else itemsByDate.set(it.date, [it]);
  }

  const overdueItems = allItems.filter((it) => it.date < todayStr);
  const grid = buildMonthGrid(cursor.year, cursor.month);
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-NZ', {
    month: 'long',
    year: 'numeric',
  });

  const goMonth = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };
  const goToday = () => {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
    setSelected(todayStr);
  };

  const markDone = async (it: AgendaItem) => {
    try {
      if (it.action === 'task' && it.taskId) {
        const updated = await api.tasks.update(it.entryId, it.taskId, {
          completedAt: new Date().toISOString(),
        });
        setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      } else if (it.action === 'followup') {
        if (it.source === 'app') {
          const updated = await api.followUp(it.entryId, 'done');
          setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
        } else {
          await api.outreach.followUp(it.entryId, 'done');
          await refresh();
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const snoozeFollowUp = async (it: AgendaItem) => {
    try {
      if (it.source === 'app') {
        const updated = await api.followUp(it.entryId, 'snooze', 3);
        setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        await api.outreach.followUp(it.entryId, 'snooze', 3);
        await refresh();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const openItem = (it: AgendaItem) => {
    const app = it.source === 'app' ? appsById.get(it.entryId) : undefined;
    const entry = it.source === 'outreach' ? outreachById.get(it.entryId) : undefined;
    if (app) onOpenApp(app);
    else if (entry) onOpenOutreach(entry);
  };

  const selectedItems = (itemsByDate.get(selected) ?? []).slice().sort((a, b) => a.kind.localeCompare(b.kind));
  const selectedDays = daysUntil(selected) ?? 0;
  const selectedOverdue = selected < todayStr;

  return (
    <div className="space-y-6">
      {overdueItems.length > 0 && (
        <div>
          <button
            onClick={() => setOverdueCollapsed((c) => !c)}
            aria-expanded={!overdueCollapsed}
            className="mb-2 flex items-center gap-1.5 px-1 text-micro font-medium uppercase tracking-wide text-rose"
          >
            <Icon.Chevron className={`h-3 w-3 transition-transform ${overdueCollapsed ? '-rotate-90' : ''}`} />
            Overdue · {overdueItems.length}
          </button>
          {!overdueCollapsed && (
          <div className="overflow-hidden rounded-2xl border-2 border-rose/30">
            {overdueItems.map((it, i) => (
              <AgendaRow
                key={it.id}
                it={it}
                overdue
                bordered={i > 0}
                onOpen={() => openItem(it)}
                onDone={() => markDone(it)}
                onSnooze={() => snoozeFollowUp(it)}
              />
            ))}
          </div>
          )}
        </div>
      )}

      <div className="panel p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-subhead font-medium text-ink">{monthLabel}</h2>
          <div className="flex items-center gap-1.5">
            <button onClick={goToday} className="btn-ghost">
              Today
            </button>
            <button
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-soft transition hover:bg-panel-2 hover:text-ink"
            >
              <Icon.Chevron className="h-4 w-4 rotate-90" />
            </button>
            <button
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-soft transition hover:bg-panel-2 hover:text-ink"
            >
              <Icon.Chevron className="h-4 w-4 -rotate-90" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 section-label">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="px-1 pb-1.5 text-center">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.map((d) => {
            const dateStr = toDateStr(d);
            const inMonth = d.getMonth() === cursor.month;
            const dayItems = itemsByDate.get(dateStr) ?? [];
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selected;
            const dayOverdue = dateStr < todayStr;
            return (
              <button
                key={dateStr}
                onClick={() => setSelected(dateStr)}
                className={`flex min-h-16 flex-col items-center gap-1 rounded-xl border px-1 py-1.5 text-meta transition sm:min-h-20
                            ${isSelected ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-panel-2'}
                            ${!inMonth ? 'opacity-40' : ''}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full tabular-nums
                              ${isToday ? 'bg-accent text-on-accent font-semibold' : isSelected ? 'font-medium text-ink' : 'text-ink-soft'}`}
                >
                  {d.getDate()}
                </span>
                <span className="flex h-1.5 items-center gap-[3px]">
                  {dayItems.slice(0, MAX_DOTS_PER_CELL).map((it) => (
                    <span
                      key={it.id}
                      className={`h-1.5 w-1.5 rounded-full ${kindDotColor(it.kind, dayOverdue)}`}
                    />
                  ))}
                  {dayItems.length > MAX_DOTS_PER_CELL && (
                    <span className="text-[9px] leading-none text-ink-faint">
                      +{dayItems.length - MAX_DOTS_PER_CELL}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3
          className={`mb-2 px-1 text-micro font-medium uppercase tracking-wide ${selectedOverdue ? 'text-rose' : selectedDays === 0 ? 'text-amber' : 'text-ink-faint'}`}
        >
          {dateHeading(selected, selectedDays)}
        </h3>
        {selectedItems.length === 0 ? (
          <div className="panel-empty px-4 py-8 text-center text-meta text-ink-soft">
            Nothing due this day.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line">
            {selectedItems.map((it, i) => (
              <AgendaRow
                key={it.id}
                it={it}
                overdue={selectedOverdue}
                bordered={i > 0}
                onOpen={() => openItem(it)}
                onDone={() => markDone(it)}
                onSnooze={() => snoozeFollowUp(it)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
