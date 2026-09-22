import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { Application, FolderStatus, OutreachEntry } from '../types';

const CACHE_KEY_APPS = 'jobhq_swr_apps';
const CACHE_KEY_OUTREACH = 'jobhq_swr_outreach';

function getInitialCachedApps(): Application[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY_APPS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getInitialCachedOutreach(): OutreachEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY_OUTREACH);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface AppDataContextValue {
  apps: Application[];
  setApps: React.Dispatch<React.SetStateAction<Application[]>>;
  folders: Record<string, FolderStatus>;
  refreshFolders: () => Promise<void>;
  outreach: OutreachEntry[];
  setOutreach: React.Dispatch<React.SetStateAction<OutreachEntry[]>>;
  loading: boolean;
  loadError: string | null;
  notionOn: boolean;
  notionError: string | null;
  pendingCount: number;
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

/** Keeps the previous object reference for any entry whose `updated`
 *  timestamp hasn't moved, instead of the brand-new object the poll always
 *  hands back. Without this, every 12s poll replaced all ~60 row objects
 *  with fresh references even when nothing changed, so every `AppCard` (each
 *  wrapped in framer-motion's `layout`) re-measured and re-animated in
 *  lockstep — a periodic jank spike that read as most on mobile. */
function reconcileApps(prev: Application[], next: Application[]): Application[] {
  const prevById = new Map(prev.map((a) => [a.id, a]));
  return next.map((a) => {
    const old = prevById.get(a.id);
    return old && old.updated === a.updated ? old : a;
  });
}

/**
 * Single fetch/poll owner for apps, folder status, and outreach — lifted out
 * of Dashboard so a second route tree (the future role-detail page) can read
 * the same data via `useAppData()` instead of triggering its own fetch and a
 * loading flash. Everything here used to live as ~10 separate useState/effect
 * pairs directly in App.tsx.
 */
export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const cachedApps = useMemo(() => getInitialCachedApps(), []);
  const cachedOutreach = useMemo(() => getInitialCachedOutreach(), []);

  const [apps, setApps] = useState<Application[]>(cachedApps);
  const [folders, setFolders] = useState<Record<string, FolderStatus>>({});
  const [outreach, setOutreach] = useState<OutreachEntry[]>(cachedOutreach);
  // SWR: If local cache is pre-warmed, show data immediately (loading: false) while revalidating
  const [loading, setLoading] = useState<boolean>(cachedApps.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notionOn, setNotionOn] = useState(false);
  const [notionError, setNotionError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const [list, folderStatus, outreachList] = await Promise.all([
        api.list(),
        api.folderStatus(),
        // Polled alongside applications so an email draft written from a Claude
        // Code chat session shows up here without a manual reload.
        api.outreach.list().catch(() => [] as OutreachEntry[]),
      ]);
      setApps((prev) => {
        const next = reconcileApps(prev, list);
        try {
          localStorage.setItem(CACHE_KEY_APPS, JSON.stringify(next));
        } catch {}
        return next;
      });
      setFolders(folderStatus);
      setOutreach(outreachList);
      try {
        localStorage.setItem(CACHE_KEY_OUTREACH, JSON.stringify(outreachList));
      } catch {}
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
    // Best-effort, separate from the try/catch above: a failed pending-count
    // fetch shouldn't surface as the page's main load error.
    api
      .pendingRequests()
      .then((r) => setPendingCount(r.count))
      .catch(() => {});
  }, []);

  const refreshFolders = useCallback(async () => {
    try {
      setFolders(await api.folderStatus());
    } catch {
      // best-effort, same as the folder refetch after a save used to be
    }
  }, []);

  useEffect(() => {
    refresh();
    api
      .health()
      .then((h) => {
        setNotionOn(h.notion);
        setNotionError(h.notionError ?? null);
      })
      .catch(() => {});
  }, [refresh]);

  // Picks up changes written to applications.json outside this tab (e.g. a CV
  // drafted from a Claude Code chat session) without needing a manual reload.
  // Skipped while the tab is hidden — the old version polled three endpoints
  // every 12s forever, including in a backgrounded tab nobody was looking at.
  // A refresh still fires the moment the tab becomes visible again, so
  // freshness on return is unchanged; only the wasted background work is gone.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, 12_000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const value: AppDataContextValue = {
    apps,
    setApps,
    folders,
    refreshFolders,
    outreach,
    setOutreach,
    loading,
    loadError,
    notionOn,
    notionError,
    pendingCount,
    refresh,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData() called outside <AppDataProvider>');
  return ctx;
}
