import { useState } from 'react';
import { Icon } from './Icons';
import { api } from '../api';
import type { Application } from '../types';

type AdState = 'verbatim' | 'summary' | 'missing';

export function adState(app: Application): AdState {
  if (!app.jobText?.trim()) return 'missing';
  return app.jobTextKind === 'summary' ? 'summary' : 'verbatim';
}

const STATE_META: Record<AdState, { label: string; tone: string; icon: (p: { className?: string }) => JSX.Element; hint: string }> = {
  verbatim: { label: 'Verbatim ad saved', tone: 'text-grass', icon: Icon.CheckCircle, hint: 'The CV engine tailors against the ad’s own wording.' },
  summary: { label: 'Summary only, CV blocked', tone: 'text-rose', icon: Icon.Octagon, hint: 'A paraphrase can’t be keyword-matched. Paste the real ad to unlock Create CV.' },
  missing: { label: 'No ad text yet', tone: 'text-amber', icon: Icon.Triangle, hint: 'The server tries to capture it from the listing automatically. Paste it if that fails.' },
};

export function JobAdPanel({ app, onSaved }: { app: Application; onSaved: (a: Application) => void }) {
  const state = adState(app);
  const meta = STATE_META[state];
  const [editing, setEditing] = useState(false);
  const [showText, setShowText] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.update(app.id, { jobText: draft.trim(), jobTextKind: 'verbatim' }));
      setEditing(false);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="job-ad" className={`panel-inset px-4 py-3.5 ${state === 'summary' ? 'border border-rose/30' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-meta font-medium ${meta.tone}`}>
            <meta.icon className="h-3.5 w-3.5" />
            {meta.label}
          </p>
          <p className="mt-0.5 text-micro text-ink-faint">
            {meta.hint}
            {app.adSnapshotAt &&
              ` Archived to the role folder ${new Date(app.adSnapshotAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} (Job Ad.txt + PDF).`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state !== 'missing' && (
            <button onClick={() => setShowText((v) => !v)} className="btn-ghost text-micro">
              <Icon.Doc className="h-3.5 w-3.5" />
              {showText ? 'Hide' : 'Read'}
            </button>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className={state === 'verbatim' ? 'btn-ghost text-micro' : 'btn-primary text-micro'}
          >
            <Icon.Edit className="h-3.5 w-3.5" />
            {state === 'verbatim' ? 'Replace' : 'Paste ad text'}
          </button>
        </div>
      </div>

      {showText && !editing && (
        <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2.5 font-sans text-micro leading-relaxed text-ink-soft">
          {app.jobText}
        </pre>
      )}

      {editing && (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            placeholder="Paste the whole ad, from the opening line through the requirements list."
            className="field-input w-full font-sans text-micro"
            aria-label="Verbatim job ad text"
          />
          {error && <p className="text-micro text-rose">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="btn-ghost text-micro">
              Cancel
            </button>
            <button onClick={save} disabled={busy || draft.trim().length < 200} className="btn-primary text-micro disabled:opacity-50">
              {busy ? 'Saving…' : 'Save as verbatim ad'}
            </button>
          </div>
          {draft.trim().length > 0 && draft.trim().length < 200 && (
            <p className="text-right text-micro text-ink-faint">That’s too short to be a full ad.</p>
          )}
        </div>
      )}
    </div>
  );
}
