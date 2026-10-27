import type { ReactNode } from 'react';
import { SplitText } from '../SplitText';

/** Matcha's page title: mono eyebrow over a Matcha Style headline. Titles are the app's real page names; the layout below each page is the real component tree. */
export function MatchaPageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-3">
        <p className="mx-mono text-accent">{eyebrow}</p>
        <h1 className="mx-display-page font-display-matcha font-normal"><SplitText text={title} /></h1>
      </div>
      {children}
    </header>
  );
}
