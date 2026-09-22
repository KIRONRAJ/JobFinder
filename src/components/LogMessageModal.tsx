import { useState, useEffect } from 'react';
import { Icon } from './Icons';
import { playSound } from '../lib/sound';
import type { Application } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  app: Application;
  onSaveNotes: (updatedNotes: string) => Promise<void>;
}

type MessageType = 'received' | 'sent' | 'call' | 'note';

export function LogMessageModal({ open, onClose, app, onSaveNotes }: Props) {
  const [type, setType] = useState<MessageType>('received');
  const [sender, setSender] = useState('');
  const [date, setDate] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [position, setPosition] = useState<'prepend' | 'append'>('prepend');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize defaults on open
  useEffect(() => {
    if (open) {
      setType('received');
      // Format current NZ timestamp: YYYY-MM-DD HH:mm
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const da = String(now.getDate()).padStart(2, '0');
      const hr = String(now.getHours()).padStart(2, '0');
      const mi = String(now.getMinutes()).padStart(2, '0');
      setDate(`${yr}-${mo}-${da} ${hr}:${mi}`);

      // Default sender based on contact info
      if (app.contactEmail) {
        setSender(`${app.contactName ? app.contactName + ' ' : ''}<${app.contactEmail}>`);
      } else if (app.contactName) {
        setSender(`${app.contactName} (${app.company})`);
      } else {
        setSender(`Recruitment Team (${app.company})`);
      }

      setSubject('');
      setBody('');
      setPosition('prepend');
      setError(null);
    }
  }, [open, app]);

  if (!open) return null;

  const handleTypeChange = (newType: MessageType) => {
    setType(newType);
    if (newType === 'sent') {
      setSender('Jordan Smith <jordan.smith.demo@example.com>');
    } else if (newType === 'call') {
      setSender(`Phone Interview / Call with ${app.contactName || app.company}`);
      setSubject(`Phone Call Debrief`);
    } else if (newType === 'received') {
      setSender(
        app.contactEmail
          ? `${app.contactName ? app.contactName + ' ' : ''}<${app.contactEmail}>`
          : `${app.contactName || 'Recruitment Team'} (${app.company})`
      );
    }
    playSound('tick');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) {
      setError('Please paste the email content or write call notes.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Build canonical standard Rule 6 block
      const divider = '==================================================';
      let entry = '';

      if (type === 'call') {
        entry = `${divider}\nCALL: ${sender.trim()}\nDATE: ${date.trim()}\nTOPIC: ${subject.trim() || 'General Screening / Discussion'}\n${divider}\n${body.trim()}`;
      } else {
        entry = `${divider}\nFROM: ${sender.trim()}\nDATE: ${date.trim()}${
          subject.trim() ? `\nSUBJECT: ${subject.trim()}` : ''
        }\n${divider}\n${body.trim()}`;
      }

      const existing = (app.trackingNotes || '').trim();
      let updated = '';

      if (position === 'prepend') {
        updated = existing ? `${entry}\n\n${existing}` : entry;
      } else {
        updated = existing ? `${existing}\n\n${entry}` : entry;
      }

      await onSaveNotes(updated);
      playSound('added');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="panel relative z-10 w-full max-w-xl overflow-hidden rounded-3xl border border-line shadow-xl">
        <form onSubmit={handleSave}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line-soft bg-canvas/60 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                <Icon.Mail className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-ink">Log Correspondence / Call Note</h2>
                <p className="text-[11px] text-ink-soft">
                  {app.role} • {app.company}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn-ghost h-8 w-8 p-0 rounded-full flex items-center justify-center text-ink-soft hover:text-ink"
            >
              <Icon.Close className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {error && (
              <div className="rounded-xl bg-rose/10 p-3 text-xs text-rose font-medium border border-rose/20">
                {error}
              </div>
            )}

            {/* Type selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-ink-faint">
                Communication Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleTypeChange('received')}
                  className={`rounded-xl p-2.5 text-xs font-semibold transition border ${
                    type === 'received'
                      ? 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-400 shadow-xs'
                      : 'bg-panel border-line-soft text-ink-soft hover:text-ink'
                  }`}
                >
                  Incoming Email
                </button>

                <button
                  type="button"
                  onClick={() => handleTypeChange('sent')}
                  className={`rounded-xl p-2.5 text-xs font-semibold transition border ${
                    type === 'sent'
                      ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'bg-panel border-line-soft text-ink-soft hover:text-ink'
                  }`}
                >
                  Outgoing Reply
                </button>

                <button
                  type="button"
                  onClick={() => handleTypeChange('call')}
                  className={`rounded-xl p-2.5 text-xs font-semibold transition border ${
                    type === 'call'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 shadow-xs'
                      : 'bg-panel border-line-soft text-ink-soft hover:text-ink'
                  }`}
                >
                  Phone / Call Note
                </button>
              </div>
            </div>

            {/* From / Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-soft">
                  {type === 'sent' ? 'From (Candidate)' : type === 'call' ? 'Call Contact / Rep' : 'Sender (From)'}
                </label>
                <input
                  type="text"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  placeholder="e.g. Sarah Jenkins <sarah@company.co.nz>"
                  className="w-full rounded-xl bg-panel border border-line px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-red-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-soft">Date &amp; Time (NZT)</label>
                <input
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder="YYYY-MM-DD HH:mm"
                  className="w-full rounded-xl bg-panel border border-line px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:ring-1 focus:ring-red-500"
                  required
                />
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-soft">Subject / Topic</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={type === 'call' ? 'e.g. 15-min Technical Screening Debrief' : 'e.g. Invitation to Technical Interview / Next Steps'}
                className="w-full rounded-xl bg-panel border border-line px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>

            {/* Body */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-ink-soft">
                  {type === 'call' ? 'Call Discussion Points & Next Actions' : 'Full Email Content (Paste verbatim)'}
                </label>
                <span className="text-[10px] text-ink-faint">Preserves complete history</span>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Paste the incoming or outgoing employer message, confirmation details, or phone debrief..."
                rows={7}
                className="w-full rounded-xl bg-panel border border-line p-3 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-red-500 leading-relaxed font-sans"
                required
              />
            </div>

            {/* Position */}
            <div className="flex items-center justify-between text-xs text-ink-soft pt-1">
              <span>Position in history:</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="pos"
                    checked={position === 'prepend'}
                    onChange={() => setPosition('prepend')}
                    className="accent-red-500"
                  />
                  <span>Prepend (Newest first)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="pos"
                    checked={position === 'append'}
                    onChange={() => setPosition('append')}
                    className="accent-red-500"
                  />
                  <span>Append (Bottom)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-line-soft bg-canvas/40 px-6 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn-secondary text-xs py-2 px-4 rounded-xl"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving || !body.trim()}
              className="btn-primary text-xs flex items-center gap-1.5 py-2 px-4 rounded-xl shadow-sm disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Saving to Record…</span>
                </>
              ) : (
                <>
                  <Icon.Check className="h-3.5 w-3.5" />
                  <span>Save Correspondence</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
