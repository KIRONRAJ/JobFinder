import { useEffect, useRef, useState } from 'react';
import { useModalPresence } from '../lib/useModalPresence';
import { AnimatedCheckmark } from './AnimatedCheckmark';
import { useDialog } from '../useDialog';
import type { Application } from '../types';

interface Props {
  entry: Application | null;
  onCancel: () => void;
  onConfirm: (patch: Partial<Application>) => Promise<void>;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Marking something applied is one click; this collects the extras some
 * employers hand back (a tracking portal, a reference number) without ever
 * requiring them — every field here is optional by design.
 */
export function AppliedModal({ entry, onCancel, onConfirm }: Props) {
  const [date, setDate] = useState(today());
  const [trackingUrl, setTrackingUrl] = useState('');
  const [trackingRef, setTrackingRef] = useState('');
  const [trackingNotes, setTrackingNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setDate(entry.date || today());
    setTrackingUrl(entry.trackingUrl ?? '');
    setTrackingRef(entry.trackingRef ?? '');
    setTrackingNotes(entry.trackingNotes ?? '');
    setSaving(false);
  }, [entry]);

  const dialogRef = useDialog(Boolean(entry), onCancel);
  const presence = useModalPresence(Boolean(entry));
  const lastEntry = useRef(entry);
  if (entry) lastEntry.current = entry;
  const data = entry ?? lastEntry.current;
  // The same dialog does double duty: first-time "mark applied", and later
  // "add the tracking details the confirmation email brought".
  const alreadyApplied = data?.status === 'applied';

  const submit = async () => {
    setSaving(true);
    await onConfirm({
      status: 'applied',
      date,
      trackingUrl: trackingUrl.trim(),
      trackingRef: trackingRef.trim(),
      trackingNotes: trackingNotes.trim(),
      // Deliberately not defaulted — recording "Full CV" when the user never
      // said so would put a guess into the record as fact.
    });
  };

  if (!presence.mounted || !data) return null;

  return (
    <div
      ref={presence.ref}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25 p-4 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        ref={dialogRef}
        data-modal-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="applied-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded-3xl border border-line bg-panel p-7 shadow-float outline-none"
      >
        <div className="mb-1 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-grass text-white">
            <AnimatedCheckmark className="h-4 w-4 text-white" strokeWidth={3} />
          </span>
          <h2 id="applied-title" className="text-title font-semibold tracking-[-0.02em]">
            {alreadyApplied ? 'Tracking details' : 'Mark as applied'}
          </h2>
        </div>
        <p className="mb-6 text-body text-ink-soft">
          {data.role} · {data.company}
        </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="a-date">Date applied</label>
                <input
                  id="a-date"
                  type="date"
                  className="field-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="a-ref">
                  Reference number <span className="text-ink-faint">· optional</span>
                </label>
                <input
                  id="a-ref"
                  className="field-input"
                  value={trackingRef}
                  onChange={(e) => setTrackingRef(e.target.value)}
                  placeholder="e.g. REQ-18442"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="a-url">
                  Tracking link <span className="text-ink-faint">· optional</span>
                </label>
                <input
                  id="a-url"
                  className="field-input"
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="https://… portal where you can check the status"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="a-notes">
                  Anything else they told you <span className="text-ink-faint">· optional</span>
                </label>
                <textarea
                  id="a-notes"
                  className="field-input min-h-[88px] resize-y"
                  value={trackingNotes}
                  onChange={(e) => setTrackingNotes(e.target.value)}
                  placeholder="Login details, expected response time, who to contact…"
                />
              </div>
            </div>

            <div className="mt-7 flex justify-end gap-2">
              <button onClick={onCancel} className="btn-quiet">
                Cancel
              </button>
              <button onClick={submit} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving…' : alreadyApplied ? 'Save' : 'Mark applied'}
              </button>
            </div>
      </div>
    </div>
  );
}
