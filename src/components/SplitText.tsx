import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsapSetup';

/** Word-by-word masked rise for page titles. Words are real React nodes (not a
 *  DOM-side split), so a changing `text` re-renders safely. The animated copy is
 *  aria-hidden; screen readers get the plain text via a visually-hidden span. */
export function SplitText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from('[data-word]', { yPercent: 110, duration: 0.9, ease: 'power4.out', stagger: 0.08, delay: 0.1 });
    },
    { scope: ref, dependencies: [text] }
  );
  const words = text.split(' ');
  return (
    <span ref={ref}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, i) => (
          <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em]">
            <span data-word className="inline-block">{w}</span>
            {i < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    </span>
  );
}
