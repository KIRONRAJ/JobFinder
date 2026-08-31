import { useRef } from 'react';
import { useModalPresence } from '../lib/useModalPresence';
import { Icon } from './Icons';
import { useDialog } from '../useDialog';
import type { Application } from '../types';

interface Props {
  entry: Application | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Names exactly what's about to happen — the folder on disk and the Notion row
 * are both real, irreversible side effects, so this deliberately spells them
 * out rather than using a generic "are you sure?".
 */
export function ConfirmDelete({ entry, onCancel, onConfirm }: Props) {
  const dialogRef = useDialog(Boolean(entry), onCancel);
  const presence = useModalPresence(Boolean(entry));
  // The caller nulls `entry` the instant it hides the dialog, but content
  // still needs to render through the exit tween.
  const lastEntry = useRef(entry);
  if (entry) lastEntry.current = entry;
  const data = entry ?? lastEntry.current;

  if (!presence.mounted || !data) return null;

  return (
    <div
      ref={presence.ref}
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/30 p-4 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        ref={dialogRef}
        data-modal-panel
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl border border-line bg-panel p-7 shadow-float outline-none"
      >
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose/12 text-rose">
            <Icon.Warning className="h-4 w-4" />
          </span>
          <h2 id="confirm-delete-title" className="text-title font-semibold tracking-[-0.02em]">
            Delete this application?
          </h2>
        </div>

        <dl className="mb-5 space-y-2 rounded-2xl border border-line bg-panel-2/50 p-4 text-meta">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-ink-soft">Role</dt>
            <dd className="min-w-0 flex-1">{data.role}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-ink-soft">Company</dt>
            <dd className="min-w-0 flex-1">{data.company}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-ink-soft">Folder</dt>
            <dd className="min-w-0 flex-1 font-mono text-micro">
              {data.folderPath
                ? `Career and Job\\${data.folderPath}\\`
                : 'none on file — nothing to remove on disk'}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 text-ink-soft">Notion</dt>
            <dd className="min-w-0 flex-1">row will be archived</dd>
          </div>
        </dl>

        <p className="mb-6 text-meta leading-relaxed text-ink-soft">
          Removing it here is immediate. The folder and Notion row are cleaned up by the
          background jobhq loop shortly after.
        </p>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-quiet">Cancel</button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-rose px-[18px] py-2.5
                       text-body font-medium text-white transition hover:brightness-110 active:scale-[0.98]"
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
