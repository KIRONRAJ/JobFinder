import { useCallback, useState } from 'react';

/**
 * Banner dismissals, kept in localStorage.
 *
 * Deliberately local rather than server state: dismissing a banner is a
 * "I've seen this" gesture, not a fact about the application. Putting it on
 * the entry would sync a UI preference to Notion and to every other device,
 * and would mean a stray click edits tracker data.
 *
 * Each dismissal is keyed by what the banner is *about* (a specific task, a
 * specific set of interviews), never by banner type. So dismissing the ARG
 * assessment banner hides that assessment, and a genuinely new task still
 * gets to interrupt.
 */
const KEY = 'jhq:dismissed-banners';

function read(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return []; // corrupt or unavailable storage should never blank the UI
  }
}

export function useDismissed() {
  const [ids, setIds] = useState<string[]>(read);

  const dismiss = useCallback((id: string) => {
    // Re-read before writing: another tab may have dismissed something since
    // this component mounted, and clobbering that is worse than the write.
    // Capped so a long-running install can't grow the entry unbounded.
    const next = [...new Set([...read(), id])].slice(-100);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage full or blocked — the dismissal just won't survive a reload
    }
    setIds(next);
  }, []);

  return { isDismissed: (id: string) => ids.includes(id), dismiss };
}
