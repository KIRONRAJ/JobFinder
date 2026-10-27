import type { AgendaItem } from '../AgendaView';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LABEL_LIMIT = 2;
const DOT_LIMIT = 3;

type Kind = AgendaItem['kind'];
const KIND_NOUN: Record<Kind, [string, string]> = {
  deadline: ['closing date', 'closing dates'],
  followup: ['follow-up', 'follow-ups'],
  nextaction: ['next action', 'next actions'],
  interview: ['interview', 'interviews'],
  outreach: ['outreach follow-up', 'outreach follow-ups'],
  task: ['task', 'tasks'],
};

/** "3 items: 1 interview, 2 follow-ups". Text for screen readers; the cell looks the same. */
function itemsSummary(items: AgendaItem[]): string {
  const counts = new Map<Kind, number>();
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
  const parts = [...counts].map(([k, n]) => `${n} ${KIND_NOUN[k][n === 1 ? 0 : 1]}`);
  return `${items.length} ${items.length === 1 ? 'item' : 'items'}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

interface Props {
  /** The visible days, in order, as the existing month grid builds them (Monday first). */
  days: { dateStr: string; date: Date; inMonth: boolean }[];
  itemsByDate: Map<string, AgendaItem[]>;
  todayStr: string;
  selected: string;
  onSelect: (dateStr: string) => void;
  /** AgendaView's own dot colours, so the two layouts agree on what a colour means. */
  dotClass: (it: AgendaItem, overdue: boolean) => string;
}

/**
 * Matcha's bordered month grid. Days with one or two items name them (company and kind colour); busier days
 * fall back to dots plus a count, because a cell cannot hold six labels. On a phone every cell is dots only.
 * It reads the same items and the same selected day as the classic grid and only decides how a cell looks.
 */
export function MatchaAgendaGrid({ days, itemsByDate, todayStr, selected, onSelect, dotClass }: Props) {
  return (
    <div role="group" aria-label="Month calendar">
      <div className="mx-mono grid grid-cols-7 text-ink-faint">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 pb-2 text-center md:text-left">
            {w}
          </div>
        ))}
      </div>
      <div className="mx-cal grid grid-cols-7 border-l border-t border-line-soft">
        {days.map(({ dateStr, date, inMonth }) => {
          const items = itemsByDate.get(dateStr) ?? [];
          const overdue = dateStr < todayStr;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selected;
          const busy = items.length > LABEL_LIMIT;
          const full = date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' });
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelect(dateStr)}
              aria-pressed={isSelected}
              aria-label={`${full}, ${itemsSummary(items)}`}
              data-selected={isSelected ? 'true' : 'false'}
              className={`mx-cal-cell flex min-h-16 min-w-0 flex-col items-stretch gap-1 border-b border-r border-line-soft p-1.5 text-left transition-colors md:min-h-28 md:p-2.5 ${
                inMonth ? '' : 'opacity-40'
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center self-center rounded-full tabular-nums text-meta md:self-start ${
                  isToday ? 'bg-accent font-semibold text-on-accent' : 'text-ink-soft'
                }`}
              >
                {date.getDate()}
              </span>

              {/* One or two items: name them. Hidden on phones, where the dots below carry the day. */}
              {!busy &&
                items.map((it) => (
                  <span key={it.id} className="hidden min-w-0 items-center gap-1.5 text-micro text-ink md:flex">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(it, overdue)}`} aria-hidden="true" />
                    <span className="truncate">{it.company}</span>
                  </span>
                ))}

              {/* Dots: always on a busy day, and on every day on a phone. */}
              <span className={`flex items-center justify-center gap-[3px] md:justify-start ${busy ? '' : 'md:hidden'}`}>
                {items.slice(0, DOT_LIMIT).map((it) => (
                  <span key={it.id} className={`h-1.5 w-1.5 rounded-full ${dotClass(it, overdue)}`} aria-hidden="true" />
                ))}
                {items.length > DOT_LIMIT && (
                  <span className="mx-mono ml-0.5 text-ink-faint">+{items.length - DOT_LIMIT}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
