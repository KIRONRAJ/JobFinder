import { memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from './Icons';
import { CompanyAvatar } from './CompanyAvatar';
import { FIT_TEXT, StatusPill, statusWash, STATUS_DOT, TagBadge } from './Badges';
import { ReadinessBar } from './ReadinessBar';
import { computeReadiness, isCvActuallyQueued, isCvActuallyDone } from '../lib/readiness';
import { rowSignals } from '../lib/rowSignals';
import { useCardTilt } from '../lib/useCardTilt';
import type { Application, FolderStatus } from '../types';

interface Props {
  app: Application;
  folder?: FolderStatus;
  index?: number;
  onEdit: () => void;
  onRequestCv: () => void;
  onCancelCv: () => void;
  onRequestReview: () => void;
  onOpenFolder: () => void;
  onMarkApplied: () => void;
  onPreviewDocs?: () => void;
  onSelectTag?: (tag: string) => void;
  /** True while the local Claude CLI has an active run — lets a queued card
   *  say "Processing…" instead of a generic "Queued…" while it's actually
   *  happening right now (as opposed to just sitting in the request queue). */
  claudeRunning?: boolean;
}

function cvLabel(queued: boolean, done: boolean, claudeRunning?: boolean) {
  if (queued) return claudeRunning ? 'Processing…' : 'Queued — click to cancel';
  if (done) return 'Re-queue CV';
  return 'Create CV';
}

// Entrance and exit are no longer this component's own concern — the list
// in App.tsx that renders these (and BoardView's columns) drives them as a
// batch via GSAP Flip (see useFlipList.ts), which is how new/removed/
// reordered rows across the WHOLE list get one coherent animation instead of
// each row improvising its own. framer-motion's `AnimatePresence
// mode="popLayout"` + `layout` used to do this implicitly; Flip.from's
// onEnter/onLeave is the explicit GSAP equivalent. That's also why this no
// longer needs forwardRef — that existed solely for framer's exit measurement.
function AppCardImpl({
  app,
  folder,
  onEdit,
  onRequestCv,
  onCancelCv,
  onRequestReview,
  onOpenFolder,
  onMarkApplied,
  onPreviewDocs,
  onSelectTag,
  claudeRunning,
}: Props) {
  const navigate = useNavigate();
  const queued = isCvActuallyQueued(app, folder);
  // Only offer a review once there's something drafted to review.
  const hasDrafts = isCvActuallyDone(app, folder);
  const reviewQueued = app.reviewStatus === 'queued';
  const canMarkApplied = app.status === 'researching';
  const isApplied = app.status === 'applied';

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  // Ranked, capped at 3 with a quiet "+N" for the rest — this is the fix for
  // the row that used to render 13 chips unconditionally. Most rows in the
  // real data show zero or one; a chip here means something is actually owed.
  const signals = rowSignals(app, folder);
  const shown = signals.slice(0, 3);
  const overflow = signals.length - shown.length;

  const tiltRef = useCardTilt<HTMLDivElement>({ maxRotation: 4 });
  const haloClass = app.status === 'interview'
    ? 'status-halo-interview'
    : (app.fit === 'strong' || (app as any).fitCategory === 'Gold Fit')
      ? 'status-halo-gold'
      : '';

  return (
    <div
      ref={tiltRef}
      // The card lifts diagonally *away* from its shadow and the shadow
      // deepens (hardSm -> hardMd), which is the same physical model the
      // buttons use. It previously only moved up, leaving the shadow the same
      // size — the card slid over its own shadow instead of rising off it.
      className={`app-card-surface tilt-card-container group relative overflow-hidden rounded-md border-2 border-line bg-panel
                  shadow-hardSm transition duration-150
                  hover:-translate-x-1 hover:-translate-y-1 hover:shadow-hardMd
                  ${statusWash(app.status)} ${haloClass}`}
    >
      {/* 3D Cursor-Following Specular Sheen */}
      <span className="specular-sheen" aria-hidden="true" />

      {/* A single raking highlight on hover — the thing that makes the card
          read as a physical panel catching light rather than a div changing
          colour. Transform-only, one pass, no loop. */}
      <span className="sheen-layer" aria-hidden="true" />

      {/* Status block — a thick left edge, the Bauhaus "colour block as
          signal" reading. Its own grow-in flourish folded into the list's
          shared Flip entrance (useFlipList.ts) rather than animating
          separately per card — widens on hover so the row you're pointing at
          asserts its status harder. */}
      <span
        className={`absolute inset-y-0 left-0 w-1.5 transition-[width] duration-200
                    group-hover:w-2.5 ${STATUS_DOT[app.status]}`}
        aria-hidden="true"
      />

      {/* Deliberately not role="button": the row contains its own nested
          controls (Edit, Create CV, Mark applied/Tracking, folder/job-ad
          links), and making the container a button flattens all of them into
          one unusable accessible name (DESIGN.md, "Accessibility"). The click
          here is a mouse convenience only — the real, keyboard-reachable
          navigation is the <Link> on the role title below. */}
      <div
        onClick={() => {
          if (typeof document !== 'undefined' && 'startViewTransition' in document) {
            (document as any).startViewTransition(() => navigate(`/role/${app.id}`));
          } else {
            navigate(`/role/${app.id}`);
          }
        }}
        className="cursor-pointer px-4 py-5 pl-6 transition active:bg-panel-2/60 [@media(hover:hover)]:active:bg-transparent"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="flex min-w-0 flex-1 basis-64 gap-3">
            {/* Playful hover pop (motion-design skill): scale+rotate overshoot
                on the one element a glance actually lands on first. CSS
                transition, not GSAP — no physics/sequencing needed for a
                single-property hover, so the native platform feature wins
                over a JS library per the ladder. `ease-back`-style overshoot
                approximated with a cubic-bezier that dips past 1 then settles. */}
            <span
              className="mt-0.5 inline-block transition-transform duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]
                         hover:scale-[1.12] hover:-rotate-6 active:scale-[0.92] active:rotate-0"
            >
              <CompanyAvatar
                name={app.company}
                source={app.source}
                tags={app.tags}
                className="h-9 w-9 text-meta"
              />
            </span>
            <div className="min-w-0 flex-1">
              <h3
                className={`text-heading font-semibold tracking-[-0.015em] ${app.status === 'rejected' ? 'text-ink-soft line-through decoration-1' : ''}`}
              >
                <Link
                  to={`/role/${app.id}`}
                  data-app-card
                  onClick={(e) => e.stopPropagation()}
                  className="text-left transition hover:text-accent focus:outline-none
                             focus-visible:rounded focus-visible:ring-[3px] focus-visible:ring-accent/30"
                >
                  {app.role}
                </Link>
              </h3>

              <p className="mt-1 truncate text-body text-ink-soft">
                {app.company}
                {app.location ? ` · ${app.location}` : ''}
                {app.employment === 'internship' ? ' · Internship' : ''}
                {app.type === 'Other' ? ' · Other kind of job' : ''}
                {' · '}
                {FIT_TEXT[app.fit]}
              </p>

              {app.tags && app.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {app.tags.map((t) => (
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
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right rail: signals (only what's actually owing) above the
              readiness meter + status. Action buttons sit below, in their own
              row, so this column stays purely informational. */}
          <div className="flex shrink-0 flex-col items-end gap-1.5 max-sm:w-full max-sm:items-start">
            {shown.length > 0 && (
              <div className="flex flex-wrap items-center justify-end gap-1.5 max-sm:justify-start">
                {shown.map((s) => (
                  <span key={s.key}>{s.render()}</span>
                ))}
                {overflow > 0 && (
                  <Link
                    to={`/role/${app.id}`}
                    onClick={(e) => e.stopPropagation()}
                    title={`${overflow} more — open the role page`}
                    className="chip text-ink-faint hover:text-ink"
                  >
                    +{overflow}
                  </Link>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <ReadinessBar readiness={computeReadiness(app, folder)} variant="inline" />
              <StatusPill status={app.status} />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {hasDrafts && onPreviewDocs && (
            <button
              type="button"
              onClick={stop(onPreviewDocs)}
              title="Preview tailored CV & Cover Letter in browser (PDF viewer & direct download)"
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-panel-2/80 px-2.5 py-0.5 text-label font-medium text-ink transition hover:border-accent hover:text-accent shadow-hardXs"
            >
              <Icon.Doc className="h-3.5 w-3.5 text-accent" />
              <span>Preview CV</span>
            </button>
          )}
          {app.folderPath && (
            <button
              onClick={stop(onOpenFolder)}
              disabled={folder?.exists === false}
              title={folder?.exists === false ? "Folder doesn't exist yet" : 'Open in File Explorer'}
              className="link-quiet disabled:opacity-40"
            >
              <Icon.Folder className="h-3.5 w-3.5" />
              {app.folderPath}
              {folder?.exists && folder.cv && folder.coverLetter && (
                <Icon.Check className="h-3 w-3 text-grass" />
              )}
            </button>
          )}
          {app.link && (
            <a
              href={app.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="link-quiet"
            >
              <Icon.External className="h-3.5 w-3.5" />
              Job ad
            </a>
          )}
          {app.trackingUrl && (
            <a
              href={app.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="link-quiet"
            >
              <Icon.Search className="h-3.5 w-3.5" />
              Track status
              {app.trackingRef && <span className="font-mono text-label">{app.trackingRef}</span>}
            </a>
          )}

          {/* Mark applied / Tracking stay visible at rest (DESIGN.md's Operate
              rule — this is a tool used most days, the primary verb shouldn't
              hide behind a hover). Edit and Create CV are secondary and only
              reveal on hover/focus. */}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {/* opacity-100 at rest is the touch-device default — there is no
                hover on a phone, so hover-reveal alone made these unreachable
                there. `hover:hover` media devices (real pointers) still get
                the quiet hover-reveal treatment DESIGN.md calls for.
                These three buttons are true flex siblings of Applied/Tracking
                below (not wrapped in their own flex-wrap div) so the whole
                row wraps as one consistent flow on narrow screens instead of
                the outer wrap treating a multi-line inner group as one tall
                item. */}
            <button
              onClick={stop(onEdit)}
              title="Edit entry"
              aria-label="Edit entry"
              className="btn-ghost opacity-100 transition
                         [@media(hover:hover)]:opacity-0
                         group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <Icon.Edit className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              onClick={stop(() => {
                if (queued && !claudeRunning) onCancelCv();
                else if (!queued) onRequestCv();
              })}
              disabled={queued && claudeRunning}
              title={cvLabel(queued, hasDrafts, claudeRunning)}
              className={`btn-ghost opacity-100 transition [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${queued ? 'border-amber/40 text-amber' : ''} ${queued && claudeRunning ? 'cursor-default' : ''}`}
            >
              {queued ? (
                <Icon.Clock className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon.Sparkle className="h-3.5 w-3.5" />
              )}
              {cvLabel(queued, hasDrafts, claudeRunning)}
            </button>
            {hasDrafts && (
              <button
                onClick={stop(() => !reviewQueued && onRequestReview())}
                disabled={reviewQueued}
                title={
                  reviewQueued
                    ? 'Reviewer critique queued'
                    : app.reviewStatus === 'reviewed'
                      ? 'Review the CV & cover letter again'
                      : 'Second opinion on the drafted CV & cover letter'
                }
                className={`btn-ghost opacity-100 transition [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${reviewQueued ? 'cursor-default border-amber/40 text-amber' : ''}`}
              >
                {reviewQueued ? (
                  <Icon.Clock className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icon.Search className="h-3.5 w-3.5" />
                )}
                {reviewQueued ? 'Queued…' : 'Review'}
              </button>
            )}

            {canMarkApplied && (
              <button
                onClick={stop(onMarkApplied)}
                title="Mark as applied"
                className="group/apply inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-grass/50
                           px-2.5 text-micro font-bold uppercase tracking-wide text-grass transition duration-150
                           hover:-translate-y-px hover:bg-grass hover:text-white
                           active:translate-y-px
                           focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-grass/30"
              >
                <Icon.Check className="h-3.5 w-3.5 transition-transform duration-200 group-hover/apply:scale-125" />
                Applied
                {/* Only appears on hover — the reward for the click you're
                    about to make, not permanent confetti on every row. */}
                <span
                  aria-hidden="true"
                  className="emoji w-0 overflow-hidden text-[12px] opacity-0 transition-all duration-200
                             group-hover/apply:w-3.5 group-hover/apply:opacity-100"
                >
                  🎉
                </span>
              </button>
            )}

            {isApplied && (
              <button
                onClick={stop(onMarkApplied)}
                title="Add or edit tracking details"
                className="btn-ghost"
              >
                <Icon.Search className="h-3.5 w-3.5" />
                Tracking
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** `reconcileApps` in AppDataProvider keeps `app` referentially stable across
 *  polls when nothing changed, so this comparator can skip a re-render for
 *  every row unaffected by a given poll — the thing that made a 60-row
 *  mobile list re-render on a timer regardless of whether anything moved.
 *  `folder` isn't reconciled the same way upstream, so it's compared
 *  field-by-field here rather than by reference. */
function appCardPropsEqual(prev: Props, next: Props) {
  return (
    prev.app === next.app &&
    prev.index === next.index &&
    prev.claudeRunning === next.claudeRunning &&
    prev.folder?.exists === next.folder?.exists &&
    prev.folder?.cv === next.folder?.cv &&
    prev.folder?.coverLetter === next.folder?.coverLetter
  );
}

export const AppCard = memo(AppCardImpl, appCardPropsEqual);

/** Also used by the role detail page's right rail — kept exported rather than
 *  duplicated so the two surfaces render this fact identically. */
export function ContactPanel({ app, onEdit }: { app: Application; onEdit: () => void }) {
  const has = app.contactName || app.contactEmail || app.nextAction;

  return (
    <div className="rounded-2xl border border-line bg-panel-2/50 px-4 py-3.5">
      <div className="mb-2.5 flex items-center gap-1.5 text-micro font-medium text-ink-soft">
        <Icon.User className="h-3.5 w-3.5" />
        Contact &amp; next action
      </div>

      {has ? (
        <dl className="space-y-2 text-meta min-w-0">
          {app.contactName && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-soft">Contact</dt>
              <dd className="min-w-0 flex-1 break-words">{app.contactName}</dd>
            </div>
          )}
          {app.contactEmail && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-soft">Email</dt>
              <dd className="min-w-0 flex-1 break-all">
                <a
                  href={`mailto:${app.contactEmail}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-accent hover:underline break-all"
                >
                  {app.contactEmail}
                </a>
              </dd>
            </div>
          )}
          {app.nextAction && (
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-soft">Next</dt>
              <dd className="min-w-0 flex-1 break-words">
                {app.nextAction}
                {app.nextActionDue && (
                  <span className="text-ink-soft"> · due {app.nextActionDue}</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="text-meta text-ink-faint transition hover:text-accent"
        >
          None yet — add a recruiter contact or a next action →
        </button>
      )}
    </div>
  );
}
