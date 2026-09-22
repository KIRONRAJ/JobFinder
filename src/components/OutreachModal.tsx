import { useEffect, useRef, useState } from 'react';
import { useModalPresence } from '../lib/useModalPresence';
import { Icon } from './Icons';
import { useDialog } from '../useDialog';
import {
  OUTREACH_STATUSES,
  KIND_META,
  type OutreachEntry,
  type OutreachKind,
  type OutreachStatus,
} from '../types';

interface Props {
  open: boolean;
  kind: OutreachKind;
  /** null = adding a new one. */
  entry: OutreachEntry | null;
  onClose: () => void;
  onSave: (data: Partial<OutreachEntry>) => void;
  onDelete?: (entry: OutreachEntry) => void;
}

/** Comma-separated text ⇄ string[], for the two multi-value recruiter fields. */
const toList = (s: string) =>
  s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

export function OutreachModal({ open, kind, entry, onClose, onSave, onDelete }: Props) {
  const dialogRef = useDialog(open, onClose);
  const presence = useModalPresence(open);
  // The caller nulls `entry` the same instant it flips `open` false — the
  // title and delete button still need it through the exit tween.
  const lastEntry = useRef(entry);
  if (entry) lastEntry.current = entry;
  const displayEntry = open ? entry : lastEntry.current;
  const meta = KIND_META[kind];
  const isCompany = kind === 'company';

  const [form, setForm] = useState<Partial<OutreachEntry>>({});
  const [specialisms, setSpecialisms] = useState('');
  const [locationsCovered, setLocationsCovered] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(entry ? { ...entry } : { kind, status: 'to-contact' as OutreachStatus });
    setSpecialisms((entry?.specialisms ?? []).join(', '));
    setLocationsCovered((entry?.locationsCovered ?? []).join(', '));
  }, [open, entry, kind]);

  const set = <K extends keyof OutreachEntry>(key: K, value: OutreachEntry[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) return;
    onSave({
      ...form,
      kind,
      name: form.name.trim(),
      ...(isCompany
        ? {}
        : { specialisms: toList(specialisms), locationsCovered: toList(locationsCovered) }),
    });
  };

  if (!presence.mounted) return null;

  return (
    <div
      ref={presence.ref}
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/30 p-4 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        data-modal-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="outreach-modal-title"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-panel p-7 shadow-float outline-none"
      >
        <h2 id="outreach-modal-title" className="mb-5 text-heading font-medium text-ink">
          {displayEntry ? `Edit ${meta.singular}` : `Add ${meta.singular}`}
        </h2>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="field-label" htmlFor="o-name">
                  {isCompany ? 'Company name' : 'Agency name'}
                </label>
                <input
                  id="o-name"
                  className="field-input"
                  value={form.name ?? ''}
                  onChange={(e) => set('name', e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="o-website">
                    Website
                  </label>
                  <input
                    id="o-website"
                    className="field-input"
                    value={form.website ?? ''}
                    onChange={(e) => set('website', e.target.value)}
                    placeholder="https://"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="o-location">
                    Location
                  </label>
                  <input
                    id="o-location"
                    className="field-input"
                    value={form.location ?? ''}
                    onChange={(e) => set('location', e.target.value)}
                  />
                </div>
              </div>

              {isCompany ? (
                <>
                  <div>
                    <label className="field-label" htmlFor="o-careers">
                      Careers page
                    </label>
                    <input
                      id="o-careers"
                      className="field-input"
                      value={form.careersUrl ?? ''}
                      onChange={(e) => set('careersUrl', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="o-what">
                      What they do
                    </label>
                    <input
                      id="o-what"
                      className="field-input"
                      value={form.whatTheyDo ?? ''}
                      onChange={(e) => set('whatTheyDo', e.target.value)}
                      placeholder="MSSP · SOC services · consulting"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="o-why">
                      Why worth approaching
                    </label>
                    <textarea
                      id="o-why"
                      className="field-input min-h-[70px]"
                      value={form.whyInteresting ?? ''}
                      onChange={(e) => set('whyInteresting', e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="field-label" htmlFor="o-portal">
                      Candidate portal
                    </label>
                    <input
                      id="o-portal"
                      className="field-input"
                      value={form.portalUrl ?? ''}
                      onChange={(e) => set('portalUrl', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="o-spec">
                      Specialisms <span className="text-ink-faint">(comma-separated)</span>
                    </label>
                    <input
                      id="o-spec"
                      className="field-input"
                      value={specialisms}
                      onChange={(e) => setSpecialisms(e.target.value)}
                      placeholder="IT infrastructure, Security, Service desk"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="o-covers">
                      Locations covered <span className="text-ink-faint">(comma-separated)</span>
                    </label>
                    <input
                      id="o-covers"
                      className="field-input"
                      value={locationsCovered}
                      onChange={(e) => setLocationsCovered(e.target.value)}
                      placeholder="Wellington, Auckland, Nationwide"
                    />
                  </div>
                  <label className="flex items-center gap-2.5 text-meta text-ink">
                    <input
                      type="checkbox"
                      checked={Boolean(form.registered)}
                      onChange={(e) => set('registered', e.target.checked)}
                      className="h-4 w-4 accent-[rgb(var(--accent))]"
                    />
                    Already registered with them
                  </label>
                </>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="o-contact-name">
                    Contact name
                  </label>
                  <input
                    id="o-contact-name"
                    className="field-input"
                    value={form.contactName ?? ''}
                    onChange={(e) => set('contactName', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="o-contact-role">
                    Their role
                  </label>
                  <input
                    id="o-contact-role"
                    className="field-input"
                    value={form.contactRole ?? ''}
                    onChange={(e) => set('contactRole', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="o-contact-email">
                    Contact email
                  </label>
                  <input
                    id="o-contact-email"
                    type="email"
                    className="field-input"
                    value={form.contactEmail ?? ''}
                    onChange={(e) => set('contactEmail', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="o-contact-phone">
                    Contact phone
                  </label>
                  <input
                    id="o-contact-phone"
                    className="field-input"
                    value={form.contactPhone ?? ''}
                    onChange={(e) => set('contactPhone', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="o-status">
                  Status
                </label>
                <select
                  id="o-status"
                  className="field-input"
                  value={form.status ?? 'to-contact'}
                  onChange={(e) => set('status', e.target.value as OutreachStatus)}
                >
                  {OUTREACH_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="o-notes">
                  Notes
                </label>
                <textarea
                  id="o-notes"
                  className="field-input min-h-[80px]"
                  value={form.notes ?? ''}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button type="submit" className="btn-primary">
                  <Icon.Check className="h-4 w-4" />
                  Save
                </button>
                <button type="button" onClick={onClose} className="btn-quiet">
                  Cancel
                </button>
                {displayEntry && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(displayEntry)}
                    className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-2.5 text-meta text-rose transition hover:bg-rose/10"
                  >
                    <Icon.Trash className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            </form>
      </div>
    </div>
  );
}
