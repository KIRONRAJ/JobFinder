import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import {
  OUTREACH_STATUS_ICON,
  OUTREACH_STATUS_TEXT,
  OUTREACH_STATUS_TEXT_COLOR,
  OutreachFollowUpTag,
  OutreachEmailCountTag,
  OutreachLinkedApplicationsTag,
} from '../Badges';
import { EmailDraftPanel } from '../EmailDraftPanel';
import { fitsMatchaStyle } from '../../lib/matchaGlyphs';
import {
  OUTREACH_STATUSES,
  outreachNudgeCount,
  OUTREACH_MAX_NUDGES,
  type OutreachEntry,
  type OutreachStatus,
} from '../../types';

interface Props {
  entry: OutreachEntry;
  linkedApplications: number;
  onEdit: (entry: OutreachEntry) => void;
  onStatusChange: (entry: OutreachEntry, status: OutreachStatus) => void;
  onQueueEmail: (entry: OutreachEntry, template: 'intro' | 'follow-up') => void;
  onMarkSent: (entry: OutreachEntry, kind: 'intro' | 'follow-up') => void;
  onOpenFolder: (entry: OutreachEntry) => void;
}

/**
 * Matcha's compact outreach card. It takes exactly the props OutreachCard takes and calls the same handlers;
 * the status select, Queue email, "I've sent this", folder, edit and the email draft panel all live in the
 * opened state. "Log reply" writes nothing: it opens the card and focuses the status select, so logging a reply stays a
 * deliberate change through that existing control. Nothing here sends mail.
 */
export function MatchaOutreachCard({
  entry,
  linkedApplications,
  onEdit,
  onStatusChange,
  onQueueEmail,
  onMarkSent,
  onOpenFolder,
}: Props) {
  const [open, setOpen] = useState(false);
  const [focusStatus, setFocusStatus] = useState(false);
  const statusRef = useRef<HTMLSelectElement>(null);
  // Runs after the card has opened, because the select only exists in the opened state.
  useEffect(() => {
    if (open && focusStatus) {
      statusRef.current?.focus();
      setFocusStatus(false);
    }
  }, [open, focusStatus]);
  const nudges = outreachNudgeCount(entry);
  const hasEmailed = (entry.emails ?? []).length > 0;
  const nextTemplate = hasEmailed ? 'follow-up' : 'intro';
  const StatusIcon = OUTREACH_STATUS_ICON[entry.status];
  const initial = (entry.name.trim()[0] ?? '?').toUpperCase();
  const contact = [entry.contactName, entry.contactRole].filter(Boolean).join(', ');
  const why = entry.whyInteresting || (entry.specialisms?.length ? `Places: ${entry.specialisms.join(', ')}` : '') || entry.whatTheyDo || '';
  const where = [entry.whatTheyDo, entry.location].filter(Boolean).join(' · ');

  return (
    <section className="mx-ocard panel flex h-full flex-col gap-4 p-5 sm:p-6" data-open={open ? 'true' : 'false'}>
      <header className="flex items-start justify-between gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-panel-2 text-accent ${fitsMatchaStyle(initial) ? 'font-display-matcha text-title' : 'font-semibold text-title'}`}
          aria-hidden="true"
        >
          {initial}
        </span>
        <span
          className={`mx-mono inline-flex items-center gap-1.5 rounded-full border border-current px-3 py-1.5 ${OUTREACH_STATUS_TEXT_COLOR[entry.status]}`}
        >
          <StatusIcon className="h-3 w-3" />
          {OUTREACH_STATUS_TEXT[entry.status]}
        </span>
      </header>

      <div className="min-w-0">
        <h2 className="break-words text-heading font-medium text-ink">{entry.name}</h2>
        {contact && <p className="mt-1 text-meta text-ink-soft">{contact}</p>}
        {where && <p className="mt-0.5 text-micro text-ink-faint">{where}</p>}
      </div>

      {why && !open && <p className="mx-clamp text-meta leading-relaxed text-ink-soft">{why}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        <OutreachFollowUpTag entry={entry} />
        <OutreachEmailCountTag entry={entry} />
        <OutreachLinkedApplicationsTag count={linkedApplications} />
        {entry.registered && (
          <span className="chip">
            <Icon.Check className="h-3 w-3" />
            Registered
          </span>
        )}
        {entry.emailStatus === 'queued' && (
          <span className="chip border-amber/40 text-amber">
            <Icon.Clock className="h-3 w-3" />
            Draft queued
          </span>
        )}
        {entry.emailStatus === 'drafted' && (
          <span className="chip border-accent/40 text-accent">
            <Icon.Doc className="h-3 w-3" />
            Draft ready
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="btn-quiet flex-1 text-meta">
          <Icon.Doc className="h-3.5 w-3.5" />
          {open ? 'Close' : 'Open draft'}
        </button>
        <button
          onClick={() => {
            setOpen(true);
            setFocusStatus(true);
          }}
          className="btn-ghost text-meta"
          title="Opens the card and focuses the status, so you choose the new status yourself"
        >
          <Icon.Mail className="h-3.5 w-3.5" />
          Log reply
        </button>
        <button onClick={() => onEdit(entry)} className="btn-ghost px-3" title="Edit" aria-label={`Edit ${entry.name}`}>
          <Icon.Edit className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-line-soft pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => onQueueEmail(entry, nextTemplate)} className="btn-quiet text-meta">
              <Icon.Sparkle className="h-3.5 w-3.5" />
              {hasEmailed ? 'Draft follow-up' : 'Draft intro email'}
            </button>
            {entry.emailStatus === 'drafted' && (
              <button
                onClick={() => onMarkSent(entry, nextTemplate)}
                className="btn-quiet text-meta"
                title="Records that you sent it — this app never sends mail"
              >
                <Icon.Check className="h-3.5 w-3.5" />
                I've sent this
              </button>
            )}
            <select
              ref={statusRef}
              value={entry.status}
              onChange={(e) => onStatusChange(entry, e.target.value as OutreachStatus)}
              className="field-input w-auto py-1.5 text-meta"
              aria-label={`Status for ${entry.name}`}
            >
              {OUTREACH_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            {entry.folderPath && (
              <button onClick={() => onOpenFolder(entry)} className="btn-ghost px-3" title={entry.folderPath} aria-label="Open folder">
                <Icon.Folder className="h-3.5 w-3.5" />
              </button>
            )}
            {entry.website && (
              <a href={entry.website} target="_blank" rel="noreferrer noopener" className="link-quiet" title={entry.website}>
                <Icon.External className="h-3.5 w-3.5" />
                Site
              </a>
            )}
            {entry.portalUrl && !entry.registered && (
              <a href={entry.portalUrl} target="_blank" rel="noreferrer noopener" className="link-quiet" title={entry.portalUrl}>
                <Icon.External className="h-3.5 w-3.5" />
                Register
              </a>
            )}
          </div>

          {entry.status === 'emailed' && nudges >= OUTREACH_MAX_NUDGES && (
            <p className="flex flex-wrap items-center gap-2 rounded-xl border border-line-soft bg-panel-2/50 px-3.5 py-2.5 text-micro text-ink-soft">
              <Icon.Warning className="h-3 w-3 shrink-0 text-amber" />
              {nudges} follow-ups, no reply.
              <button onClick={() => onStatusChange(entry, 'no-reply')} className="text-accent underline-offset-2 hover:underline">
                Mark as no reply
              </button>
            </p>
          )}
          {entry.whyInteresting && (
            <div>
              <p className="mb-1 section-label">Why worth approaching</p>
              <p className="text-meta leading-relaxed text-ink-soft">{entry.whyInteresting}</p>
            </div>
          )}
          {entry.notes && (
            <div>
              <p className="mb-1 section-label">Notes</p>
              <p className="whitespace-pre-wrap text-meta leading-relaxed text-ink-soft">{entry.notes}</p>
            </div>
          )}
          {(entry.specialisms?.length || entry.locationsCovered?.length) && (
            <p className="text-micro text-ink-faint">
              {entry.specialisms?.length ? `Places: ${entry.specialisms.join(', ')}` : ''}
              {entry.specialisms?.length && entry.locationsCovered?.length ? ' · ' : ''}
              {entry.locationsCovered?.length ? `Covers: ${entry.locationsCovered.join(', ')}` : ''}
            </p>
          )}
          {entry.contactEmail && (
            <p className="flex items-center gap-1.5 text-micro text-ink-soft">
              <Icon.Mail className="h-3 w-3" />
              {entry.contactEmail}
            </p>
          )}
          <EmailDraftPanel entry={entry} />
          {entry.activity && entry.activity.length > 0 && (
            <div>
              <p className="mb-1.5 section-label">Activity</p>
              <ul className="space-y-1 text-micro text-ink-faint">
                {[...entry.activity]
                  .reverse()
                  .slice(0, 8)
                  .map((a, i) => (
                    <li key={i}>
                      {new Date(a.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {a.text}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
