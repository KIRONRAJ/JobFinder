import { useEffect, useState } from 'react';
import { useDialog } from '../useDialog';
import { useModalPresence } from '../lib/useModalPresence';
import { Icon } from './Icons';
import type { Application } from '../types';

interface Props {
  open: boolean;
  entry: Application | null;
  onClose: () => void;
  onConfirm: (patch: Partial<Application>, options?: { requestPrep?: boolean }) => Promise<void>;
}

export function InterviewTransitionModal({ open, entry, onClose, onConfirm }: Props) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [medium, setMedium] = useState('Microsoft Teams');
  const [interviewers, setInterviewers] = useState('');
  const [notes, setNotes] = useState('');
  const [generatePrep, setGeneratePrep] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !entry) return;
    setDate(entry.interview?.when ? entry.interview.when.slice(0, 10) : '');
    setTime(entry.interview?.when && entry.interview.when.length > 10 ? entry.interview.when.slice(11, 16) : '10:00');
    setMedium(entry.interview?.medium || 'Microsoft Teams');
    setInterviewers(entry.contactName || '');
    setNotes('');
    setGeneratePrep(true);
  }, [open, entry]);

  const dialogRef = useDialog(open, onClose);
  const presence = useModalPresence(open);

  if (!presence.mounted || !entry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const whenStr = date ? (time ? `${date}T${time}:00` : date) : '';
      const patch: Partial<Application> = {
        status: 'interview',
        interview: {
          ...(entry.interview || {}),
          when: whenStr,
          medium,
          draftedAt: entry.interview?.draftedAt,
        },
        contactName: interviewers || entry.contactName,
        nextAction: `Interview (${medium})`,
        nextActionDue: date || entry.nextActionDue,
      };

      if (notes.trim()) {
        patch.notes = entry.notes ? `${entry.notes}\n\n[Interview Prep Note]: ${notes.trim()}` : notes.trim();
      }

      await onConfirm(patch, { requestPrep: generatePrep });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={presence.ref}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        data-modal-panel
        className="relative w-full max-w-lg rounded-md border-2 border-line bg-panel p-6 shadow-hardMd"
      >
        <div className="flex items-start justify-between gap-3 border-b-2 border-line pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-meta font-bold uppercase tracking-wider text-amber">
              <Icon.Sparkles className="h-4 w-4" />
              Interview Stage Achieved!
            </span>
            <h2 className="mt-1 text-heading font-semibold text-ink">
              {entry.company} — <span className="text-ink-soft">{entry.role}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-line p-1.5 text-ink-soft transition hover:border-accent hover:text-accent"
          >
            <Icon.Close className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Interview Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="field-input"
              />
            </div>
          </div>

          <div>
            <label className="field-label">Format / Platform</label>
            <select
              value={medium}
              onChange={(e) => setMedium(e.target.value)}
              className="field-input"
            >
              <option value="Microsoft Teams">Microsoft Teams</option>
              <option value="Zoom">Zoom</option>
              <option value="Google Meet">Google Meet</option>
              <option value="Phone Call">Phone Call</option>
              <option value="In-Person Onsite">In-Person Onsite</option>
              <option value="Take-home Assessment">Take-home Assessment</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="field-label">Interviewers / Contacts</label>
            <input
              type="text"
              placeholder="e.g. Sarah Jenkins (Engineering Lead), Dave Wong (Talent)"
              value={interviewers}
              onChange={(e) => setInterviewers(e.target.value)}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label">Quick Notes / Preparation Focus</label>
            <textarea
              rows={2}
              placeholder="e.g. Technical round focusing on network troubleshooting & incident handling..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="field-input text-meta resize-none"
            />
          </div>

          <div className="rounded-md border border-line-soft bg-panel-2/50 p-3.5 flex items-start gap-3">
            <input
              type="checkbox"
              id="generatePrep"
              checked={generatePrep}
              onChange={(e) => setGeneratePrep(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-line text-accent focus:ring-accent"
            />
            <label htmlFor="generatePrep" className="text-body text-ink cursor-pointer select-none">
              <span className="font-medium text-ink block">Queue Tailored Interview Prep</span>
              <span className="text-meta text-ink-soft block mt-0.5">
                Automatically generate STAR talking points, technical questions, and company cheat-sheet.
              </span>
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-2.5 pt-2 border-t border-line-soft">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn-quiet px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary px-5 py-2 inline-flex items-center gap-2"
            >
              {saving ? (
                <Icon.Clock className="h-4 w-4 animate-spin" />
              ) : (
                <Icon.Check className="h-4 w-4" />
              )}
              Confirm Interview Status
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
