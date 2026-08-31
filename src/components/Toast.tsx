import { useEffect, useState } from 'react';
import { gsap, prefersReducedMotion } from '../lib/gsapSetup';
import { useGsapPresence } from '../lib/useGsapPresence';

export interface ToastMsg {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

/**
 * Each toast owns its own presence: App.tsx's `toast()` just drops the id
 * from the array on a timeout, with no chance to animate an exit after the
 * fact. This component keeps the item mounted for its own exit tween (via
 * useGsapPresence) and only tells the parent to actually forget it once
 * that tween finishes — framer-motion's AnimatePresence used to give every
 * list item this for free; GSAP has no equivalent, so it's rebuilt here
 * once and shared by anything else that needs a removable list item.
 */
function ToastItem({ toast, show, onExited }: { toast: ToastMsg; show: boolean; onExited: () => void }) {
  const presence = useGsapPresence<HTMLDivElement>(
    show,
    (el) => {
      const reduce = prefersReducedMotion();
      return gsap.fromTo(
        el,
        { autoAlpha: 0, y: 16, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: reduce ? 0 : 0.3, ease: 'back.out(1.4)' }
      );
    },
    (el) => {
      const reduce = prefersReducedMotion();
      return gsap.to(el, { autoAlpha: 0, y: 8, scale: 0.96, duration: reduce ? 0 : 0.2, ease: 'power2.in' });
    }
  );

  useEffect(() => {
    if (!presence.mounted) onExited();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presence.mounted]);

  if (!presence.mounted) return null;
  return (
    <div
      ref={presence.ref}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`max-w-md rounded-full px-5 py-3 text-center text-meta font-medium shadow-float
                  ${toast.tone === 'error' ? 'bg-rose text-white' : 'bg-ink text-canvas'}`}
    >
      {toast.text}
    </div>
  );
}

export function Toaster({ toasts }: { toasts: ToastMsg[] }) {
  const [items, setItems] = useState<ToastMsg[]>(toasts);

  // Only ever adds here — an item is removed exclusively by ToastItem's own
  // onExited, once its exit tween has actually finished playing.
  useEffect(() => {
    setItems((prev) => {
      const brandNew = toasts.filter((t) => !prev.some((p) => p.id === t.id));
      return brandNew.length ? [...prev, ...brandNew] : prev;
    });
  }, [toasts]);

  const visibleIds = new Set(toasts.map((t) => t.id));

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          show={visibleIds.has(t.id)}
          onExited={() => setItems((prev) => prev.filter((p) => p.id !== t.id))}
        />
      ))}
    </div>
  );
}
