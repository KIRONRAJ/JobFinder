import { useState } from 'react';
import { Icon } from './Icons';
import {
  OutreachStatusPill,
  OutreachFollowUpTag,
  OutreachEmailCountTag,
  OutreachLinkedApplicationsTag,
} from './Badges';
import { EmailDraftPanel } from './EmailDraftPanel';
import {
  OUTREACH_STATUSES,
  outreachNudgeCount,
  OUTREACH_MAX_NUDGES,
  type OutreachEntry,
  type OutreachStatus,
} from '../types';

interface Props {
  entry: OutreachEntry;
  /** How many rows in the job tracker name this organisation as the employer. */
  linkedApplications: number;
  onEdit: (entry: OutreachEntry) => void;
  onStatusChange: (entry: OutreachEntry, status: OutreachStatus) => void;
  onQueueEmail: (entry: OutreachEntry, template: 'intro' | 'follow-up') => void;
  onMarkSent: (entry: OutreachEntry, kind: 'intro' | 'follow-up') => void;
  onOpenFolder: (entry: OutreachEntry) => void;
}

export function OutreachCard({
  entry,
  linkedApplications,
  onEdit,
  onStatusChange,
  onQueueEmail,
  onMarkSent,
  onOpenFolder,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const nudges = outreachNudgeCount(entry);
  const hasEmailed = (entry.emails ?? []).length > 0;
  const nextTemplate = hasEmailed ? 'follow-up' : 'intro';

  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="text-subhead font-medium text-ink">{entry.name}</h2>
            {entry.website && (
              <a
                href={entry.website}
                target="_blank"
                rel="noreferrer noopener"
                className="link-quiet"
                title={entry.website}
              >
                <Icon.External className="h-3.5 w-3.5" />
                Site
              </a>
            )}
          </div>
          {(entry.whatTheyDo || entry.location) && (
            <p className="mt-1 text-meta text-ink-soft">
              {entry.whatTheyDo}
              {entry.whatTheyDo && entry.location ? ' · ' : ''}
              {entry.location}
            </p>
          )}
        </div>
        <OutreachStatusPill status={entry.status} />
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <OutreachFollowUpTag entry={entry} />
        <OutreachEmailCountTag entry={entry} />
        <OutreachLinkedApplicationsTag count={linkedApplications} />
        {entry.registered && (
          <span className="chip">
            <Icon.Check className="h-3 w-3" />
            Registered
          </span>
        )}
        {entry.contactEmail && (
          <span className="chip" title={entry.contactEmail}>
            <Icon.Mail className="h-3 w-3" />
            {entry.contactName || entry.contactEmail}
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

      {(entry.specialisms?.length || entry.locationsCovered?.length) && (
        <p className="mt-2.5 text-micro text-ink-faint">
          {entry.specialisms?.length ? `Places: ${entry.specialisms.join(', ')}` : ''}
          {entry.specialisms?.length && entry.locationsCovered?.length ? ' · ' : ''}
          {entry.locationsCovered?.length ? `Covers: ${entry.locationsCovered.join(', ')}` : ''}
        </p>
      )}

      {/* After a couple of unanswered nudges, offer the honest exit rather than
          letting it sit in "emailed" forever. Never applied automatically —
          silently rewriting a status the user didn't touch is a nasty surprise. */}
      {entry.status === 'emailed' && nudges >= OUTREACH_MAX_NUDGES && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line-soft bg-panel-2/50 px-3.5 py-2.5 text-micro text-ink-soft">
          <Icon.Warning className="h-3 w-3 shrink-0 text-amber" />
          {nudges} follow-ups, no reply.
          <button
            onClick={() => onStatusChange(entry, 'no-reply')}
            className="text-accent underline-offset-2 hover:underline"
          >
            Mark as no reply
          </button>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3.5">
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
        <div className="ml-auto flex items-center gap-1.5">
          {entry.folderPath && (
            <button
              onClick={() => onOpenFolder(entry)}
              className="btn-quiet px-3 text-meta"
              title={entry.folderPath}
            >
              <Icon.Folder className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onEdit(entry)}
            className="btn-quiet px-3 text-meta"
            title="Edit"
            aria-label={`Edit ${entry.name}`}
          >
            <Icon.Edit className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="btn-quiet px-3 text-meta"
            aria-expanded={expanded}
          >
            <Icon.Chevron
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-line-soft pt-4">
          {entry.whyInteresting && (
            <div>
              <p className="mb-1 section-label">
                Why worth approaching
              </p>
              <p className="text-meta leading-relaxed text-ink-soft">{entry.whyInteresting}</p>
            </div>
          )}
          {entry.notes && (
            <div>
              <p className="mb-1 section-label">Notes</p>
              <p className="whitespace-pre-wrap text-meta leading-relaxed text-ink-soft">
                {entry.notes}
              </p>
            </div>
          )}
          <EmailDraftPanel entry={entry} />
          {entry.activity && entry.activity.length > 0 && (
            <div>
              <p className="mb-1.5 section-label">
                Activity
              </p>
              <ul className="space-y-1 text-micro text-ink-faint">
                {[...entry.activity]
                  .reverse()
                  .slice(0, 8)
                  .map((a, i) => (
                    <li key={i}>
                      {new Date(a.at).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      · {a.text}
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
