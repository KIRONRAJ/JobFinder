import { useRef } from 'react';
import { useModalPresence } from '../lib/useModalPresence';
import { Icon } from './Icons';
import { useDialog } from '../useDialog';

interface Props {
  message: string | null;
  onDismiss: () => void;
}

/**
 * Error-tone toasts used to auto-dismiss after 4.5s, easy to miss. This
 * shows the same message as a modal the user has to actively close instead.
 */
export function AlertModal({ message, onDismiss }: Props) {
  const dialogRef = useDialog(Boolean(message), onDismiss);
  const presence = useModalPresence(Boolean(message));
  const lastMessage = useRef(message);
  if (message) lastMessage.current = message;
  const text = message ?? lastMessage.current;

  if (!presence.mounted || !text) return null;

  return (
    <div
      ref={presence.ref}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onDismiss()}
    >
      <div
        ref={dialogRef}
        data-modal-panel
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl border border-line bg-panel p-7 shadow-float outline-none"
      >
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose/12 text-rose">
            <Icon.Warning className="h-4 w-4" />
          </span>
          <h2 id="alert-modal-title" className="text-title font-semibold tracking-[-0.02em]">
            Something went wrong
          </h2>
        </div>

        <p className="mb-6 text-meta leading-relaxed text-ink-soft">{text}</p>

        <div className="flex justify-end">
          <button onClick={onDismiss} className="btn-quiet">Dismiss</button>
        </div>
      </div>
    </div>
  );
}
