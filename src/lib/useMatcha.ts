import { useEffect, useState } from 'react';

const isMatcha = () => document.documentElement.getAttribute('data-theme') === 'matcha';

/** True while the Matcha theme is active. Reads the same `data-theme` attribute App.tsx sets, so any component (including the login gate, which renders before App's theme state exists) can branch on it. */
export function useMatcha(): boolean {
  const [on, setOn] = useState(isMatcha);
  useEffect(() => {
    const obs = new MutationObserver(() => setOn(isMatcha()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    setOn(isMatcha());
    return () => obs.disconnect();
  }, []);
  return on;
}
