import { useEffect, useRef, useState } from 'react';
import { useModalPresence } from '../lib/useModalPresence';
import { useFlipPill } from '../lib/useFlipPill';
import { Icon } from './Icons';
import {
  ROLE_TYPES,
  STATUSES,
  WORK_ARRANGEMENTS,
  SOURCES,
  type Application,
} from '../types';
import { StatusTimeline } from './StatusTimeline';
import { ActivityTimeline } from './ActivityTimeline';
import { InterviewPrep } from './InterviewPrep';
import { useDialog } from '../useDialog';

interface Props {
  open: boolean;
  /** null = creating a new entry */
  entry: Application | null;
  onClose: () => void;
  onSave: (data: Partial<Application>) => Promise<void>;
  onDelete?: (entry: Application) => void;
}

const EMPTY: Partial<Application> = {
  role: '',
  company: '',
  location: '',
  type: 'SOC Analyst',
  status: 'researching',
  fit: 'good',
  employment: 'job',
  date: '',
  deadline: '',
  resume: '',
  link: '',
  cover: 'no',
  cvStatus: '',
  folderPath: '',
  notes: '',
  trackingUrl: '',
  trackingRef: '',
  trackingNotes: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  nextAction: '',
  nextActionDue: '',
  salary: '',
  workArrangement: undefined,
  workHours: '',
  source: undefined,
  followUpDue: '',
};

type Tab = 'details' | 'tracking' | 'history';

export function EditModal({ open, entry, onClose, onSave, onDelete }: Props) {
  const [form, setForm] = useState<Partial<Application>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('details');

  useEffect(() => {
    if (!open) return;
    setForm(entry ? { ...entry } : { ...EMPTY });
    setError(null);
    setTab('details');
  }, [open, entry]);

  const dialogRef = useDialog(open, onClose);
  const presence = useModalPresence(open);
  const lastEntry = useRef(entry);
  if (entry) lastEntry.current = entry;
  const displayEntry = open ? entry : lastEntry.current;
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabPillRef = useRef<HTMLSpanElement>(null);
  useFlipPill(tab, tabsRef, tabPillRef);

  const set = (k: keyof Application, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.role?.trim() || !form.company?.trim()) {
      setError('Role title and company are both required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'tracking', label: 'Tracking & contact' },
    ...(entry ? ([{ key: 'history', label: 'History' }] as { key: Tab; label: string }[]) : []),
  ];

  if (!presence.mounted) return null;

  return (
    <div
      ref={presence.ref}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto
                 bg-black/25 p-4 backdrop-blur-md sm:p-10"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        data-modal-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        tabIndex={-1}
        className="mb-10 w-full max-w-2xl rounded-3xl border border-line bg-panel p-7 shadow-float outline-none"
      >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="edit-title" className="text-title font-semibold tracking-[-0.02em]">
                  {displayEntry ? form.role || 'Edit application' : 'Add application'}
                </h2>
                {displayEntry && (
                  <p className="mt-0.5 text-body text-ink-soft">
                    {form.company}
                    {form.location ? ` · ${form.location}` : ''}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-ink-soft transition hover:bg-panel-2 hover:text-ink"
                aria-label="Close"
              >
                <Icon.Close />
              </button>
            </div>

            <div ref={tabsRef} className="relative mb-6 flex gap-1 border-b border-line">
              <span ref={tabPillRef} aria-hidden="true" className="pointer-events-none absolute -bottom-px left-0 top-auto h-[2px] bg-accent" />
              {TABS.map((t) => (
                <button
                  key={t.key}
                  data-pill-key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`relative px-3 py-2 text-meta font-medium transition
                              ${tab === t.key ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="f-role">Role title</label>
                  <input id="f-role" className="field-input" value={form.role ?? ''}
                    onChange={(e) => set('role', e.target.value)} placeholder="e.g. SOC Analyst" />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-company">Company</label>
                  <input id="f-company" className="field-input" value={form.company ?? ''}
                    onChange={(e) => set('company', e.target.value)} placeholder="e.g. Datacom" />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-location">Location</label>
                  <input id="f-location" className="field-input" value={form.location ?? ''}
                    onChange={(e) => set('location', e.target.value)} placeholder="e.g. Wellington" />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-type">Role type</label>
                  <select id="f-type" className="field-input" value={form.type ?? 'SOC Analyst'}
                    onChange={(e) => set('type', e.target.value)}>
                    {ROLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="f-status">Status</label>
                  <select id="f-status" className="field-input" value={form.status ?? 'researching'}
                    onChange={(e) => set('status', e.target.value)}>
                    {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="f-fit">Fit</label>
                  <select id="f-fit" className="field-input" value={form.fit ?? 'good'}
                    onChange={(e) => set('fit', e.target.value)}>
                    <option value="strong">Strong fit</option>
                    <option value="good">Good fit</option>
                    <option value="stretch">Stretch</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="f-date">Date applied</label>
                  <input id="f-date" type="date" className="field-input" value={form.date ?? ''}
                    onChange={(e) => set('date', e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-deadline">
                    Closing date <span className="text-ink-faint">· if the ad gives one</span>
                  </label>
                  <input id="f-deadline" type="date" className="field-input" value={form.deadline ?? ''}
                    onChange={(e) => set('deadline', e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-employment">Employment type</label>
                  <select id="f-employment" className="field-input" value={form.employment ?? 'job'}
                    onChange={(e) => set('employment', e.target.value)}>
                    <option value="job">Job</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="f-salary">
                    Salary <span className="text-ink-faint">· as the ad words it</span>
                  </label>
                  <input id="f-salary" className="field-input" value={form.salary ?? ''}
                    onChange={(e) => set('salary', e.target.value)}
                    placeholder="e.g. $75k–$85k, or Competitive" />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-arrangement">Work arrangement</label>
                  <select id="f-arrangement" className="field-input" value={form.workArrangement ?? ''}
                    onChange={(e) => set('workArrangement', e.target.value)}>
                    <option value="">Not stated</option>
                    {WORK_ARRANGEMENTS.map((w) => (
                      <option key={w.key} value={w.key}>{w.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor="f-hours">
                    Hours of work <span className="text-ink-faint">· as the ad words it, one line per day if it varies</span>
                  </label>
                  <textarea id="f-hours" className="field-input min-h-[4.5rem] resize-y" value={form.workHours ?? ''}
                    onChange={(e) => set('workHours', e.target.value)}
                    placeholder={'e.g. Monday to Thursday: 8:30am – 4:30pm\nSaturday: 8:30am – 5:30pm\nSunday: 9:30am – 5:00pm'} />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-source">Source</label>
                  <select id="f-source" className="field-input" value={form.source ?? ''}
                    onChange={(e) => set('source', e.target.value)}>
                    <option value="">Not recorded</option>
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="f-resume">Resume version used</label>
                  <select id="f-resume" className="field-input" value={form.resume ?? ''}
                    onChange={(e) => set('resume', e.target.value)}>
                    <option value="">Not sent yet</option>
                    <option value="CV">Full CV</option>
                    <option value="Resume">One-page resume</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="f-cover">Cover letter</label>
                  <select id="f-cover" className="field-input" value={form.cover ?? 'no'}
                    onChange={(e) => set('cover', e.target.value)}>
                    <option value="no">Not drafted</option>
                    <option value="draft">Drafted</option>
                    <option value="sent">Sent</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="f-cv">CV status</label>
                  <select id="f-cv" className="field-input" value={form.cvStatus ?? ''}
                    onChange={(e) => set('cvStatus', e.target.value)}>
                    <option value="">Not drafted</option>
                    <option value="queued">Queued (auto)</option>
                    <option value="drafted">Drafted</option>
                    <option value="sent">Sent</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor="f-folder">Folder (under Career and Job)</label>
                  <input id="f-folder" className="field-input" value={form.folderPath ?? ''}
                    onChange={(e) => set('folderPath', e.target.value)} placeholder="e.g. KiwiRail" />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor="f-link">Job ad link</label>
                  <input id="f-link" className="field-input" value={form.link ?? ''}
                    onChange={(e) => set('link', e.target.value)} placeholder="https://…" />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor="f-notes">Notes</label>
                  <textarea id="f-notes" className="field-input min-h-[110px] resize-y" value={form.notes ?? ''}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="Requirement gaps, why it's a fit, follow-up details…" />
                </div>
              </div>
            )}

            {tab === 'tracking' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor="f-turl">Tracking link</label>
                  <input id="f-turl" className="field-input" value={form.trackingUrl ?? ''}
                    onChange={(e) => set('trackingUrl', e.target.value)}
                    placeholder="Portal where you can check this application's status" />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-tref">Reference number</label>
                  <input id="f-tref" className="field-input" value={form.trackingRef ?? ''}
                    onChange={(e) => set('trackingRef', e.target.value)} placeholder="e.g. REQ-18442" />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-contact">Contact name</label>
                  <input id="f-contact" className="field-input" value={form.contactName ?? ''}
                    onChange={(e) => set('contactName', e.target.value)} placeholder="Recruiter or hiring manager" />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-cemail">Contact email</label>
                  <input id="f-cemail" type="email" className="field-input" value={form.contactEmail ?? ''}
                    onChange={(e) => set('contactEmail', e.target.value)} placeholder="name@company.co.nz" />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-cphone">Contact phone</label>
                  <input id="f-cphone" type="tel" className="field-input" value={form.contactPhone ?? ''}
                    onChange={(e) => set('contactPhone', e.target.value)} placeholder="e.g. 021 190 8597" />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-next">Next action</label>
                  <input id="f-next" className="field-input" value={form.nextAction ?? ''}
                    onChange={(e) => set('nextAction', e.target.value)} placeholder="e.g. Follow up by email" />
                </div>
                <div>
                  <label className="field-label" htmlFor="f-nextdue">Next action due</label>
                  <input id="f-nextdue" type="date" className="field-input" value={form.nextActionDue ?? ''}
                    onChange={(e) => set('nextActionDue', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor="f-followup">
                    Follow-up due <span className="text-ink-faint">· set automatically ~8 working days after applying</span>
                  </label>
                  <input id="f-followup" type="date" className="field-input" value={form.followUpDue ?? ''}
                    onChange={(e) => set('followUpDue', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor="f-tnotes">Tracking notes</label>
                  <textarea id="f-tnotes" className="field-input min-h-[88px] resize-y" value={form.trackingNotes ?? ''}
                    onChange={(e) => set('trackingNotes', e.target.value)}
                    placeholder="Login details, expected response time, who to chase…" />
                </div>
              </div>
            )}

            {tab === 'history' && entry && (
              <div className="space-y-4">
                <InterviewPrep app={entry} />
                {entry.statusHistory && entry.statusHistory.length > 1 && (
                  <div className="rounded-2xl border border-line bg-panel-2/50 px-4 py-3.5">
                    <div className="mb-2.5 text-micro font-medium text-ink-soft">Status path</div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <StatusTimeline history={entry.statusHistory} />
                      <span className="text-meta text-ink-soft">
                        {entry.statusHistory.map((h) => h.status).join(' → ')}
                      </span>
                    </div>
                  </div>
                )}
                <ActivityTimeline activity={entry.activity} />
                {!entry.activity?.length &&
                  (!entry.statusHistory || entry.statusHistory.length < 2) && (
                    <p className="py-8 text-center text-meta text-ink-faint">
                      Nothing recorded yet. Status changes and updates will show up here.
                    </p>
                  )}
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-xl border border-rose/30 bg-rose/[0.07] px-3.5 py-2.5 text-meta text-rose">
                {error}
              </div>
            )}

            <div className="mt-7 flex items-center justify-between gap-3">
              <div>
                {displayEntry && onDelete && (
                  <button
                    onClick={() => onDelete(displayEntry)}
                    className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5
                               text-body font-medium text-rose transition hover:border-rose/50 hover:bg-rose/[0.07]"
                  >
                    <Icon.Trash className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-quiet">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
      </div>
    </div>
  );
}
