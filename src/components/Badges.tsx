import type { CSSProperties } from 'react';
import { Icon } from './Icons';
import {
  daysSince,
  daysUntil,
  appliedLabel,
  deadlineLabel,
  followUpLabel,
  DEADLINE_SOON_DAYS,
  STALE_APPLIED_DAYS,
  WORK_ARRANGEMENTS,
  OUTREACH_STATUSES,
  type Application,
  type Fit,
  type Status,
  type CvStatus,
  type OutreachEntry,
  type OutreachStatus,
} from '../types';
import { resolveEvidenceMap, countByState } from '../lib/evidenceState';

/** Fixed meaning, never themed — a status colour must always read the same. */
export const STATUS_DOT: Record<Status, string> = {
  researching: 'bg-neutral',
  applied: 'bg-applied',
  interview: 'bg-amber',
  offer: 'bg-grass',
  rejected: 'bg-rose',
  withdrawn: 'bg-neutral',
};

const STATUS_TEXT: Record<Status, string> = {
  researching: 'Researching',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

/** A distinct shape per status, so the six are still tellable apart with the
 *  colour removed — hue and text alone aren't enough for colour-blind readers
 *  scanning a dense list. */
export const STATUS_ICON: Record<Status, (p: { className?: string }) => JSX.Element> = {
  researching: Icon.Search,
  applied: Icon.Paperplane,
  interview: Icon.Chat,
  offer: Icon.Trophy,
  rejected: Icon.Close,
  withdrawn: Icon.Withdrawn,
};

/**
 * The personality layer for status. Used *only* in `StatusPill`, which always
 * renders `STATUS_TEXT` right beside it — so the word is the carrier and the
 * emoji is decoration, never the sole signal. Everywhere status appears
 * without a label (`StatusIcon` on board column headers, the dense-list
 * `.dot`) keeps the drawn `STATUS_ICON` shapes above: those are load-bearing
 * for colour-blind scanning and are not replaced here.
 */
export const STATUS_EMOJI: Record<Status, string> = {
  researching: '🔍',
  applied: '📨',
  interview: '🎤',
  offer: '🎉',
  rejected: '🙅',
  withdrawn: '🚪',
};

/** Statuses that mean something is actively in play get the pulse ring.
 *  Applied joined interview/offer here on request — everything else is a
 *  settled fact and stays still; a surface where every badge pulses has no
 *  way left to say "look here". */
const STATUS_LIVE: Partial<Record<Status, string>> = {
  applied: 'var(--applied)',
  interview: 'var(--amber)',
  offer: 'var(--grass)',
};

const STATUS_TEXT_COLOR: Record<Status, string> = {
  researching: 'text-neutral',
  applied: 'text-applied',
  interview: 'text-amber',
  offer: 'text-grass',
  rejected: 'text-rose',
  withdrawn: 'text-neutral',
};

/* ---------- outreach statuses ---------- */

/**
 * Same fixed-hue contract as the job statuses: neutral = nothing owed,
 * accent = in flight, amber = needs something from you, rose = ended.
 * `grass` is deliberately absent — it means "outcome achieved" everywhere
 * else, and the outcome of outreach is a row in the job tracker, surfaced as
 * the "led to N applications" chip rather than as a status of its own.
 */
export const OUTREACH_STATUS_DOT: Record<OutreachStatus, string> = {
  'to-contact': 'bg-neutral',
  emailed: 'bg-applied',
  replied: 'bg-amber',
  'in-conversation': 'bg-amber',
  'no-reply': 'bg-neutral',
  closed: 'bg-rose',
};

const OUTREACH_STATUS_TEXT_COLOR: Record<OutreachStatus, string> = {
  'to-contact': 'text-neutral',
  emailed: 'text-applied',
  replied: 'text-amber',
  'in-conversation': 'text-amber',
  'no-reply': 'text-neutral',
  closed: 'text-rose',
};

/** Distinct shape per status, for the same colour-blindness reason as above. */
export const OUTREACH_STATUS_ICON: Record<
  OutreachStatus,
  (p: { className?: string }) => JSX.Element
> = {
  'to-contact': Icon.Search,
  emailed: Icon.Paperplane,
  replied: Icon.Mail,
  'in-conversation': Icon.Chat,
  'no-reply': Icon.Clock,
  closed: Icon.Octagon,
};

const OUTREACH_STATUS_TEXT: Record<OutreachStatus, string> = Object.fromEntries(
  OUTREACH_STATUSES.map((s) => [s.key, s.label])
) as Record<OutreachStatus, string>;

export const OutreachStatusPill = ({ status }: { status: OutreachStatus }) => {
  const IconEl = OUTREACH_STATUS_ICON[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-meta ${OUTREACH_STATUS_TEXT_COLOR[status]}`}
    >
      <IconEl className="h-3.5 w-3.5" />
      {OUTREACH_STATUS_TEXT[status]}
    </span>
  );
};

/** Follow-up chip for an outreach entry — overdue turns rose, same as jobs. */
export const OutreachFollowUpTag = ({ entry }: { entry: OutreachEntry }) => {
  if (!entry.followUpDue) return null;
  const days = daysUntil(entry.followUpDue);
  if (days === null) return null;
  const overdue = days < 0;
  return (
    <span className={`chip ${overdue ? 'border-rose/40 text-rose' : ''}`}>
      <Icon.Clock className="h-3 w-3" />
      {followUpLabel(days)}
    </span>
  );
};

/** How many emails have gone out, once any have. */
export const OutreachEmailCountTag = ({ entry }: { entry: OutreachEntry }) => {
  const n = (entry.emails ?? []).length;
  if (n === 0) return null;
  return (
    <span className="chip">
      <Icon.Mail className="h-3 w-3" />
      {n} sent
    </span>
  );
};

/**
 * The payoff chip: this outreach target already appears as an employer in the
 * job tracker. This is why `grass` isn't in the status vocabulary — the real
 * outcome of outreach lives in applications.json, not in a status field.
 */
export const OutreachLinkedApplicationsTag = ({ count }: { count: number }) => {
  if (count <= 0) return null;
  return (
    <span className="chip border-grass/40 text-grass">
      <Icon.CheckCircle className="h-3 w-3" />
      {count} application{count === 1 ? '' : 's'}
    </span>
  );
};

/** Same fixed hue as STATUS_DOT, applied as a very soft background wash so
 *  the category reads at a glance across a dense list/board — decorative
 *  only, never the sole signal (icon + STATUS_TEXT carry that already).
 *  researching/withdrawn get no wash: neither is an outcome yet. */
const STATUS_WASH: Record<Status, string> = {
  researching: '',
  // Applied gets a stronger wash than the others (12/18 vs 5/9) so "in
  // flight" rows are pickable out of a dense list at a glance, not just on
  // close inspection of the left-edge colour block.
  applied: 'bg-gradient-to-r from-applied/[0.12] dark:from-applied/[0.18] to-transparent',
  interview: 'bg-gradient-to-r from-amber/[0.05] dark:from-amber/[0.09] to-transparent',
  offer: 'bg-gradient-to-r from-grass/[0.05] dark:from-grass/[0.09] to-transparent',
  rejected: 'bg-gradient-to-r from-rose/[0.05] dark:from-rose/[0.09] to-transparent',
  // Same boosted treatment as applied — withdrawn was getting no wash at all,
  // which made it blend into researching (both bg-neutral on the left edge).
  withdrawn: 'bg-gradient-to-r from-neutral/[0.12] dark:from-neutral/[0.18] to-transparent',
};

export const statusWash = (status: Status): string => STATUS_WASH[status];

// Exported: also used as plain text in the row subtitle (AppCard) now that
// fit is no longer its own chip there — one wording, two call sites.
export const FIT_TEXT: Record<Fit, string> = {
  strong: 'Strong fit',
  good: 'Good fit',
  stretch: 'Stretch',
};

/** The status icon on its own, tinted to match — for places that already have
 *  the label in the surrounding markup (board column headers). */
export const StatusIcon = ({ status }: { status: Status }) => {
  const IconEl = STATUS_ICON[status];
  return <IconEl className={`h-3.5 w-3.5 ${STATUS_TEXT_COLOR[status]}`} />;
};

/** Filled badge, not just tinted text — one of the redesign's few deliberately
 *  bold spots (DESIGN.md, 22 Aug 2026): a soft status-hue fill + border reads
 *  as a console status readout. Every class is spelled out per status rather
 *  than templated, since Tailwind's JIT scanner can't see a `bg-${status}/10`
 *  interpolation and would silently drop the class in production. */
const STATUS_BADGE: Record<Status, string> = {
  researching: 'bg-neutral/10 border-neutral/30 text-neutral',
  // Deeper fill than the others (20/50 vs 10/30) — same reasoning as
  // STATUS_WASH above, applied is the one status Kironraj scans for most.
  applied: 'bg-applied/20 border-applied/50 text-applied',
  interview: 'bg-amber/10 border-amber/30 text-amber',
  offer: 'bg-grass/10 border-grass/30 text-grass',
  rejected: 'bg-rose/10 border-rose/30 text-rose',
  withdrawn: 'bg-neutral/20 border-neutral/50 text-neutral',
};

export const StatusPill = ({ status }: { status: Status }) => {
  const live = STATUS_LIVE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1
                  text-micro font-medium transition-transform duration-150 hover:scale-105
                  ${STATUS_BADGE[status]} ${status === 'applied' ? 'animate-blink' : ''}`}
    >
      {/* Emoji replaces the drawn glyph in *this* component only — the label
          beside it is always rendered, so nothing here depends on reading the
          picture. `StatusIcon` (drawn) still covers the label-less cases. */}
      <span aria-hidden="true" className="emoji text-[13.5px] leading-none">
        {STATUS_EMOJI[status]}
      </span>
      {STATUS_TEXT[status]}
      {live && (
        // Sized up from h-1.5 (Kironraj couldn't spot the ring at the old
        // size, especially on the applied pill where it now competes with
        // the blink animation on the pill itself).
        <span
          className="live-dot h-2 w-2 bg-current"
          style={{ '--pulse': live } as CSSProperties}
          aria-hidden="true"
        />
      )}
    </span>
  );
};

export const FitTag = ({ fit }: { fit: Fit }) => (
  <span className={`chip ${fit === 'stretch' ? 'text-amber' : ''}`}>{FIT_TEXT[fit]}</span>
);

export const InternshipTag = () => (
  <span className="chip inline-flex items-center gap-1">
    <Icon.GradCap className="h-3 w-3" />
    Internship
  </span>
);

export const CvTag = ({ cvStatus }: { cvStatus: CvStatus }) => {
  if (!cvStatus) return null;
  const label = cvStatus === 'queued' ? 'CV queued' : `CV ${cvStatus}`;
  return <span className={`chip ${cvStatus === 'queued' ? 'text-amber' : ''}`}>{label}</span>;
};

/** Only meaningful once applied — nudges toward a follow-up when it goes quiet. */
export const AppliedTag = ({ app }: { app: Application }) => {
  if (app.status !== 'applied') return null;
  const days = daysSince(app.date);
  const stale = days !== null && days >= STALE_APPLIED_DAYS;
  return (
    <span className={`chip ${stale ? 'border-amber/40 text-amber' : ''}`}>
      <Icon.Calendar className="h-3 w-3" />
      {appliedLabel(days)}
      {stale && ' · follow up'}
    </span>
  );
};

/** Closing dates matter for any still-open role — once applied/interviewing
 *  it becomes a helpful "assessment window" reference, not just an "apply by".
 *  Suppressed only for closed-out statuses. */
export const DeadlineTag = ({ app }: { app: Application }) => {
  if (!app.deadline) return null;
  if (app.status === 'rejected' || app.status === 'withdrawn' || app.status === 'offer') return null;
  const left = daysUntil(app.deadline);
  if (left === null) return null;
  const urgent = left <= DEADLINE_SOON_DAYS;
  const closed = left < 0;
  return (
    <span
      className={`chip ${
        closed ? 'border-rose/40 text-rose' : urgent ? 'border-amber/40 text-amber' : ''
      }`}
    >
      <Icon.Clock className="h-3 w-3" />
      {deadlineLabel(left)}
    </span>
  );
};

export const NextActionTag = ({ app }: { app: Application }) => {
  if (!app.nextAction) return null;
  const due = daysUntil(app.nextActionDue);
  const overdue = due !== null && due < 0;
  return (
    <span className={`chip ${overdue ? 'border-rose/40 text-rose' : ''}`}>
      <Icon.Arrow className="h-3 w-3" />
      {app.nextAction}
      {due !== null && (due === 0 ? ' · today' : overdue ? ` · ${Math.abs(due)}d overdue` : ` · ${due}d`)}
    </span>
  );
};

/** The suggested nudge date. Colour is backed by the icon and the wording
 *  itself ("overdue by"), so it never depends on hue alone to read. */
export const FollowUpTag = ({ app }: { app: Application }) => {
  if (!app.followUpDue || app.status !== 'applied') return null;
  const left = daysUntil(app.followUpDue);
  if (left === null) return null;
  const due = left <= 0;
  return (
    <span className={`chip ${due ? 'border-amber/40 text-amber' : ''}`}>
      {due ? <Icon.Warning className="h-3 w-3" /> : <Icon.Clock className="h-3 w-3" />}
      {followUpLabel(left)}
    </span>
  );
};

export const SalaryTag = ({ app }: { app: Application }) =>
  app.salary ? <span className="chip">{app.salary}</span> : null;

export const ArrangementTag = ({ app }: { app: Application }) => {
  if (!app.workArrangement) return null;
  const label = WORK_ARRANGEMENTS.find((w) => w.key === app.workArrangement)?.label;
  return label ? <span className="chip">{label}</span> : null;
};

export const SourceTag = ({ app }: { app: Application }) =>
  app.source ? <span className="chip text-ink-faint">via {app.source}</span> : null;

export const ContactTag = ({ app }: { app: Application }) => {
  if (!app.contactName && !app.contactEmail) return null;
  return (
    <span className="chip">
      <Icon.Mail className="h-3 w-3" />
      {app.contactName || app.contactEmail}
    </span>
  );
};

/* `ReadinessTag` used to live here — a second, slightly different rendering of
 * the same score (shorter segments, flat fill). It's gone; use
 * `<ReadinessBar variant="compact" | "inline">` from ReadinessBar.tsx, which is
 * now the only readiness geometry in the app. */

/** Evidence-coverage indicator: verified / trackable-total. Hides when no
 *  analysis has been run at all — an empty chip would be noise. */
export const EvidenceTag = ({ app }: { app: Application }) => {
  const map = resolveEvidenceMap(app);
  const counts = countByState(map);
  const tracked = counts.verified + counts['needs-wording'] + counts['learning-gap'];
  if (tracked === 0 && counts['do-not-claim'] === 0) return null;
  const tone = counts['do-not-claim'] > 0 ? 'text-rose' : counts.verified === tracked ? 'text-grass' : '';
  return (
    <span className={`chip whitespace-nowrap ${tone}`} title="Verified evidence keywords">
      <Icon.Shield className="h-3 w-3" />
      Evidence {counts.verified}/{tracked}
      {counts['do-not-claim'] > 0 && ` · ${counts['do-not-claim']} to remove`}
    </span>
  );
};

/** Compact priority chip — shows only when Claude has flagged this role in
 *  today's queue. Sits alongside the other status/urgency chips on the card. */
export const PriorityTag = ({ app }: { app: Application }) => {
  const p = app.priority;
  if (!p) return null;
  if (p.expiresAt && p.expiresAt < Date.now()) return null;
  return (
    <span className="chip border-accent/40 text-accent" title={p.reason}>
      <Icon.Zap className="h-3 w-3" />
      Priority #{p.rank}
    </span>
  );
};
