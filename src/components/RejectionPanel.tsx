import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { api } from '../api';
import type { Application } from '../types';
import { copyText } from '../lib/clipboard';

interface Props {
  app: Application;
  onSaved: (updated: Application) => void;
}

/**
 * Rendered only for `status: rejected` entries. Captures Kironraj's own
 * short reason (`rejection.userNote`) and, once Claude has drafted the rest,
 * renders `likelyReasons` and `improvements`.
 *
 * Editing the note goes straight through PATCH — the server strips the full
 * `rejection` object from the body (see PATCH strip list), so the userNote
 * takes the two-step "capture separately then merge" path via a small
 * dedicated field the server DOES accept.
 */
export function RejectionPanel({ app, onSaved }: Props) {
  const [note, setNote] = useState(app.rejection?.userNote ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    setNote(app.rejection?.userNote ?? '');
    setDirty(false);
  }, [app.id, app.rejection?.userNote]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (!copyFailed) return;
    const t = setTimeout(() => setCopyFailed(false), 2800);
    return () => clearTimeout(t);
  }, [copyFailed]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.update(app.id, { rejectionNote: note.trim() });
      onSaved(updated);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const rej = app.rejection;

  return (
    <div className="rounded-2xl border border-rose/25 bg-rose/[0.04] px-4 py-4">
      <header className="mb-3 flex items-center gap-2 text-micro font-medium text-rose">
        <Icon.Close className="h-3.5 w-3.5" />
        Learning from this rejection
      </header>

      <label className="field-label" htmlFor={`rej-${app.id}`}>
        Your read — what likely happened?
      </label>
      <textarea
        id={`rej-${app.id}`}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setDirty(true);
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder="Any specific reason they gave, or your best guess (eligibility, timing, seniority…). Short is fine."
        className="field-input min-h-[70px] resize-y"
      />
      <div className="mt-2 flex justify-end">
        <button
          onClick={(e) => {
            e.stopPropagation();
            save();
          }}
          disabled={saving || !dirty}
          className="btn-quiet disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>

      {rej?.likelyReasons && rej.likelyReasons.length > 0 && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <p className="mb-1.5 text-micro font-medium text-ink-soft">
            Likely reasons · drafted by Claude
          </p>
          <ul className="space-y-1.5">
            {rej.likelyReasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-meta leading-snug">
                <Icon.Arrow className="mt-[3px] h-3 w-3 shrink-0 text-ink-faint" />
                <span className="text-ink-soft">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rej?.improvements && rej.improvements.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-micro font-medium text-ink-soft">Improvements to carry forward</p>
          <ul className="space-y-1.5">
            {rej.improvements.map((r, i) => (
              <li key={i} className="flex gap-2 text-meta leading-snug">
                <Icon.Check className="mt-[3px] h-3 w-3 shrink-0 text-grass" />
                <span className="text-ink-soft">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!rej?.likelyReasons && note.trim().length > 0 && (
        <p className="mt-4 text-label text-ink-faint">
          Ask Claude in chat to analyse this — "why did the {app.company} rejection likely happen"
          — and it will fill in the analysis section.
        </p>
      )}

      {rej?.reply && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-micro font-medium text-ink-soft">Reply · drafted by Claude</p>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const ok = await copyText(rej.reply!.body);
                if (ok) setCopied(true);
                else setCopyFailed(true);
              }}
              className="btn-quiet px-3 py-1.5 text-micro"
            >
              {copied ? (
                <>
                  <Icon.Check className="h-3 w-3 text-grass" />
                  Copied
                </>
              ) : copyFailed ? (
                <>
                  <Icon.Close className="h-3 w-3 text-rose" />
                  Couldn't copy — select below
                </>
              ) : (
                <>
                  <Icon.Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
          {(rej.reply.to || rej.reply.subject) && (
            <p className="mb-1.5 text-label text-ink-faint">
              {rej.reply.to ? `To: ${rej.reply.to}` : 'To: (no address captured)'}
              {rej.reply.subject ? ` · Subject: ${rej.reply.subject}` : ''}
            </p>
          )}
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-line-soft bg-panel-2/50 px-3.5 py-3 font-sans text-micro leading-relaxed text-ink-soft">
            {rej.reply.body}
          </pre>
          <p className="mt-1.5 text-label text-ink-faint">
            you send this yourself — the app never sends mail
          </p>
        </div>
      )}
    </div>
  );
}
