import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { api, type OutreachEmailDraft } from '../api';
import type { OutreachEntry } from '../types';
import { copyText } from '../lib/clipboard';

/**
 * Shows whatever .md drafts Claude has written into this entry's folder, with
 * a copy button. Deliberately the end of the line: the app has no mail
 * credential and no send path — Kironraj copies the text into his own client.
 */
export function EmailDraftPanel({ entry }: { entry: OutreachEntry }) {
  const [drafts, setDrafts] = useState<OutreachEmailDraft[] | null>(null);
  const [openIdx, setOpenIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.outreach
      .emails(entry.id)
      .then((r) => alive && setDrafts(r.items))
      .catch(() => alive && setDrafts([]));
    return () => {
      alive = false;
    };
  }, [entry.id, entry.emailStatus, entry.updated]);

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

  if (!drafts) {
    return <p className="text-micro text-ink-faint">Loading drafts…</p>;
  }

  if (drafts.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-micro text-ink-soft">
        No email drafted yet. Use "Draft intro email" above, then run the Claude
        terminal to write it.
      </p>
    );
  }

  const active = drafts[Math.min(openIdx, drafts.length - 1)];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="section-label">
          Email draft{drafts.length > 1 ? 's' : ''}
        </p>
        <button
          onClick={async () => {
            const ok = await copyText(active.body);
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
              Couldn't copy — select the text below
            </>
          ) : (
            <>
              <Icon.Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {drafts.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {drafts.map((d, i) => (
            <button
              key={d.relPath}
              onClick={() => setOpenIdx(i)}
              className={`chip ${i === openIdx ? 'border-accent/50 text-accent' : ''}`}
            >
              <Icon.Doc className="h-3 w-3" />
              {d.name.replace(/\.md$/i, '')}
            </button>
          ))}
        </div>
      )}

      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-line-soft bg-panel-2/50 px-3.5 py-3 font-sans text-micro leading-relaxed text-ink-soft">
        {active.body}
      </pre>
      <p className="mt-1.5 text-label text-ink-faint">
        {active.relPath} · you send this yourself — the app never sends mail
      </p>
    </div>
  );
}
