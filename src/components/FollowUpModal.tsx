import { useState, useEffect, useMemo } from 'react';
import { useDialog } from '../useDialog';
import { useModalPresence } from '../lib/useModalPresence';
import { copyText } from '../lib/clipboard';
import { Icon } from './Icons';
import { api } from '../api';
import type { Application } from '../types';

interface Props {
  open: boolean;
  app: Application;
  onClose: () => void;
  onSaved?: (updated: Application) => void;
  toast?: (msg: string, kind?: 'info' | 'error') => void;
}

type FollowUpStrategy = 'standard' | 'valueAdd' | 'crisp';

export function FollowUpModal({ open, app, onClose, onSaved, toast }: Props) {
  const dialogRef = useDialog(open, onClose);
  const presence = useModalPresence(open);

  const [strategy, setStrategy] = useState<FollowUpStrategy>('standard');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const contactGreeting = useMemo(() => {
    if (app.contactName && app.contactName.trim()) {
      const first = app.contactName.trim().split(/\s+/)[0];
      return `Dear ${first},`;
    }
    return 'Dear Hiring Team,';
  }, [app.contactName]);

  const formattedDate = useMemo(() => {
    if (!app.date) return 'recently';
    try {
      const d = new Date(app.date);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return app.date;
    }
  }, [app.date]);

  const defaultTemplates = useMemo(() => {
    const greeting = contactGreeting;
    const role = app.role;
    const company = app.company;

    const standardSubject = `Following up on Application: ${role} – Jordan Smith`;
    const standardBody = `${greeting}

I hope you are having a productive week.

I am writing to politely follow up on my application for the ${role} position at ${company}, which I submitted on ${formattedDate}.

I remain very enthusiastic about the opportunity to contribute to ${company}. With my Master of Information Technology (Cyber Security specialisation with Merit) from Riverside Institute of Technology, combined with my hands-on background in enterprise L2 NOC operations and systems support, I am confident in my ability to step in and add immediate value to your team.

For your reference, I hold a 3-year Post Study Work Visa (Open Work Visa) with full New Zealand work rights, a full clean NZ Class 1 Driver Licence, and live locally in the Wellington region.

Please let me know if you need any additional details or work samples. I look forward to hearing about the next steps in your process.

Sincerely,
Jordan Smith
Phone: +64 21 555 0100
Email: jordan.smith.demo@example.com
LinkedIn: linkedin.com/in/jordansmithdemo`;

    const valueAddSubject = `Update & Follow-up: ${role} – Jordan Smith`;
    const valueAddBody = `${greeting}

I hope you're having a great week.

I'm checking in regarding my application for the ${role} role at ${company} submitted on ${formattedDate}.

Since applying, I have been actively continuing practical security operations and network diagnostics work, focusing on enterprise log analysis, system hardening, and automated pipeline troubleshooting. The requirements of this role at ${company} align closely with my core strengths and technical interests.

I hold an open Post Study Work Visa with full New Zealand work eligibility and can be available for an interview at your convenience. I would welcome the opportunity to discuss how my practical technical support background can support your goals.

Kind regards,
Jordan Smith
Phone: +64 21 555 0100
Email: jordan.smith.demo@example.com
LinkedIn: linkedin.com/in/jordansmithdemo`;

    const crispSubject = `Status check: ${role} – Jordan Smith`;
    const crispBody = `${greeting}

I hope all is well.

I am following up on my application for the ${role} position submitted on ${formattedDate}. I understand your team is busy reviewing candidates, but I wanted to reaffirm my strong interest in joining ${company}.

I am based in Wellington with full open work rights (3-year Post Study Work Visa) and available to interview at your earliest convenience. Thank you for your time and consideration.

Sincerely,
Jordan Smith
+64 21 555 0100 | jordan.smith.demo@example.com`;

    return {
      standard: { subject: standardSubject, body: standardBody },
      valueAdd: { subject: valueAddSubject, body: valueAddBody },
      crisp: { subject: crispSubject, body: crispBody },
    };
  }, [contactGreeting, app.role, app.company, formattedDate]);

  const [subject, setSubject] = useState(defaultTemplates.standard.subject);
  const [body, setBody] = useState(defaultTemplates.standard.body);

  useEffect(() => {
    setSubject(defaultTemplates[strategy].subject);
    setBody(defaultTemplates[strategy].body);
  }, [strategy, defaultTemplates]);

  if (!presence.mounted) return null;

  const handleCopy = async () => {
    const fullText = `Subject: ${subject}\n\n${body}`;
    const ok = await copyText(fullText);
    if (ok) {
      setCopied(true);
      toast?.('Email copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyBodyOnly = async () => {
    const ok = await copyText(body);
    if (ok) {
      setCopied(true);
      toast?.('Email body copied.');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogAndReschedule = async () => {
    setSaving(true);
    try {
      const todayNZ = new Date().toLocaleDateString('en-NZ');
      const timeNZ = new Date().toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
      const recipient = app.contactEmail ? ` to ${app.contactEmail}` : app.contactName ? ` to ${app.contactName}` : '';
      
      const outgoingEntry = `[${todayNZ} ${timeNZ} Outgoing Follow-up Email${recipient}]\nSubject: ${subject}\n\n${body}`;
      const prevNotes = app.trackingNotes ? `${app.trackingNotes}\n\n` : '';
      const updatedTrackingNotes = `${prevNotes}${outgoingEntry}`.trim();

      // Calculate next follow-up due date (8 business days / ~11 calendar days out)
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 11);
      const nextDue = nextDate.toISOString().slice(0, 10);

      const updated = await api.update(app.id, {
        trackingNotes: updatedTrackingNotes,
        followUpDue: nextDue,
      });

      toast?.('Follow-up logged to correspondence notes.');
      onSaved?.(updated);
      onClose();
    } catch (err) {
      toast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const mailtoUrl = app.contactEmail
    ? `mailto:${encodeURIComponent(app.contactEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  return (
    <div
      ref={presence.ref}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        data-modal-panel
        className="relative flex h-[90vh] w-full max-w-3xl flex-col rounded-md border-2 border-line bg-panel shadow-hardMd"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-line px-5 py-3.5 bg-panel-2/30">
          <div>
            <div className="flex items-center gap-2">
              <span className="section-label text-accent">Outreach Engine</span>
              <span className="chip text-micro font-mono">1-Click Follow-Up</span>
            </div>
            <h2 className="text-heading font-semibold text-ink">
              Follow up with <span className="text-accent">{app.company}</span> — <span className="text-ink-soft">{app.role}</span>
            </h2>
          </div>

          <button
            onClick={onClose}
            title="Close (Esc)"
            className="rounded-full border border-line p-1.5 text-ink-soft transition hover:border-accent hover:text-accent"
          >
            <Icon.Close className="h-4 w-4" />
          </button>
        </div>

        {/* Strategy Selector Strip */}
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-2.5 bg-panel-2/10">
          <div className="flex items-center gap-2">
            <span className="text-label text-ink-soft font-mono">Tone:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStrategy('standard')}
                className={`rounded-full px-3 py-1 text-label font-medium transition ${
                  strategy === 'standard'
                    ? 'border-2 border-line bg-accent text-on-accent shadow-hardXs'
                    : 'border border-line-soft text-ink-soft hover:border-line hover:text-ink'
                }`}
              >
                Polite Check-In
              </button>
              <button
                type="button"
                onClick={() => setStrategy('valueAdd')}
                className={`rounded-full px-3 py-1 text-label font-medium transition ${
                  strategy === 'valueAdd'
                    ? 'border-2 border-line bg-accent text-on-accent shadow-hardXs'
                    : 'border border-line-soft text-ink-soft hover:border-line hover:text-ink'
                }`}
              >
                Value-Add Update
              </button>
              <button
                type="button"
                onClick={() => setStrategy('crisp')}
                className={`rounded-full px-3 py-1 text-label font-medium transition ${
                  strategy === 'crisp'
                    ? 'border-2 border-line bg-accent text-on-accent shadow-hardXs'
                    : 'border border-line-soft text-ink-soft hover:border-line hover:text-ink'
                }`}
              >
                Short & Direct
              </button>
            </div>
          </div>

          {app.contactEmail && (
            <span className="chip text-micro font-mono text-ink-soft">
              To: {app.contactEmail}
            </span>
          )}
        </div>

        {/* Content Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-5 overflow-y-auto">
          {/* Subject Field */}
          <div>
            <label className="text-label font-semibold text-ink-soft block mb-1">
              Email Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="field-input font-medium"
            />
          </div>

          {/* Email Body Field */}
          <div className="flex min-h-0 flex-1 flex-col">
            <label className="text-label font-semibold text-ink-soft block mb-1">
              Email Message Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="field-input font-mono text-body flex-1 resize-none leading-relaxed p-4"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-line px-5 py-3 bg-panel-2/40">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              {copied ? <Icon.Check className="h-4 w-4" /> : <Icon.Copy className="h-4 w-4" />}
              <span>{copied ? 'Copied Full Email!' : 'Copy Full Email'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyBodyOnly}
              className="btn-quiet inline-flex items-center gap-1.5"
            >
              <Icon.Doc className="h-4 w-4" />
              <span>Copy Body</span>
            </button>

            {mailtoUrl && (
              <a
                href={mailtoUrl}
                className="btn-quiet inline-flex items-center gap-1.5 text-accent"
              >
                <Icon.Mail className="h-4 w-4" />
                <span>Open in Mail</span>
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLogAndReschedule}
              disabled={saving}
              className="btn-quiet border-2 border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 inline-flex items-center gap-1.5 font-medium disabled:opacity-50"
              title="Save this follow-up into Tracking Notes per Rule 6 and reset follow-up clock"
            >
              <Icon.CheckCircle className="h-4 w-4" />
              <span>{saving ? 'Saving…' : 'Log to Tracking Notes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
