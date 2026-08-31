import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Minimal modal-dialog behaviour: move focus in on open, trap Tab inside while
 * open, and restore focus to whatever was focused before on close.
 *
 * Without this, Tab from inside a modal walks straight into the page behind
 * it — worst on the destructive delete confirm, where the confirm button ends
 * up several tabs away through unrelated content.
 */
/**
 * Open dialogs, oldest first. Escape must only reach the topmost one —
 * otherwise Escape over a confirm dialog closes the edit modal underneath it
 * and leaves the confirm floating over nothing.
 */
const stack: symbol[] = [];

export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const idRef = useRef<symbol>(Symbol('dialog'));

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    stack.push(id);
    restoreTo.current = document.activeElement as HTMLElement;

    const node = ref.current;
    // Prefer the first field/button inside; fall back to the panel itself.
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    const isTopmost = () => stack[stack.length - 1] === id;

    const onKey = (e: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !node) return;

      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === firstItem || active === node)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const at = stack.indexOf(id);
      if (at !== -1) stack.splice(at, 1);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}
