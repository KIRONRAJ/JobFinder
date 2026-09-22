import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from './lib/gsapSetup';
import { useFlipList } from './lib/useFlipList';
import { playSound, setSoundEnabled, type SoundKind } from './lib/sound';
import { pickPriorities } from './lib/priorities';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { api } from './api';
import {
  daysSince,
  isOutreachView,
  VIEW_KIND,
  type Application,
  type SortKey,
  type Status,
  type View,
} from './types';
import { Icon } from './components/Icons';
import { Pipeline } from './components/Pipeline';
import { AppCard } from './components/AppCard';
import { TagBadge } from './components/Badges';
import { Toaster, type ToastMsg } from './components/Toast';
import { Sidebar, VIEW_META } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { CommandCentre } from './components/CommandCentre';
import { InterviewBanner } from './components/InterviewBanner';
import { EventsBanner } from './components/EventsBanner';
import { LoginGate } from './components/LoginGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageHeader } from './components/PageHeader';
import { Wallpaper } from './components/Wallpaper';
import { DeadlineCountdown } from './components/DeadlineCountdown';
import { SkeletonRows, SkeletonPanels } from './components/SkeletonRows';
import { DashboardSkeleton } from './components/DashboardSkeleton';
import { HomeDashboard } from './components/dashboard/HomeDashboard';
import { KineticLoader } from './components/dashboard/KineticLoader';
import { AppDataProvider, useAppData } from './state/AppDataProvider';
import { LegacyViewRedirect } from './routes/LegacyViewRedirect';
import { pathToView, viewToPath } from './routes/viewRoutes';
import type { VisualTheme } from './components/ThemeSelector';

// Lazy-loaded routes and heavy modals with auto-retry on stale chunk deployment (v5.1.5 / v5.2.0)
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const hasRefreshed = sessionStorage.getItem('chunk_load_retried') === 'true';
    try {
      const mod = await factory();
      sessionStorage.removeItem('chunk_load_retried');
      return mod;
    } catch (err: any) {
      const isChunkError =
        err?.message?.includes('dynamically imported module') ||
        err?.message?.includes('Failed to fetch') ||
        err?.name === 'TypeError';
      if (!hasRefreshed && isChunkError) {
        sessionStorage.setItem('chunk_load_retried', 'true');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

const RoleDetail = lazyWithRetry(() => import('./routes/RoleDetail').then((m) => ({ default: m.RoleDetail })));
const Insights = lazyWithRetry(() => import('./routes/Insights').then((m) => ({ default: m.Insights })));
const Study = lazyWithRetry(() => import('./routes/Study').then((m) => ({ default: m.Study })));
const Settings = lazyWithRetry(() => import('./routes/Settings').then((m) => ({ default: m.Settings })));
const BoardView = lazyWithRetry(() => import('./components/BoardView').then((m) => ({ default: m.BoardView })));
const DenseTableView = lazyWithRetry(() => import('./components/DenseTableView').then((m) => ({ default: m.DenseTableView })));
const DocumentPreviewModal = lazyWithRetry(() => import('./components/DocumentPreviewModal').then((m) => ({ default: m.DocumentPreviewModal })));
const InterviewTransitionModal = lazyWithRetry(() => import('./components/InterviewTransitionModal').then((m) => ({ default: m.InterviewTransitionModal })));

// On-demand modal & view code-splitting (v5.2.0)
const TerminalPanel = lazyWithRetry(() => import('./components/TerminalPanel').then((m) => ({ default: m.TerminalPanel })));
const EditModal = lazyWithRetry(() => import('./components/EditModal').then((m) => ({ default: m.EditModal })));
const AppliedModal = lazyWithRetry(() => import('./components/AppliedModal').then((m) => ({ default: m.AppliedModal })));
const ConfirmDelete = lazyWithRetry(() => import('./components/ConfirmDelete').then((m) => ({ default: m.ConfirmDelete })));
const AlertModal = lazyWithRetry(() => import('./components/AlertModal').then((m) => ({ default: m.AlertModal })));
const CommandPalette = lazyWithRetry(() => import('./components/CommandPalette').then((m) => ({ default: m.CommandPalette })));
const Celebration = lazyWithRetry(() => import('./components/Celebration').then((m) => ({ default: m.Celebration })));
const OutreachView = lazyWithRetry(() => import('./components/OutreachView').then((m) => ({ default: m.OutreachView })));
const AgendaView = lazyWithRetry(() => import('./components/AgendaView').then((m) => ({ default: m.AgendaView })));

function Dashboard() {
  const {
    apps,
    setApps,
    folders,
    refreshFolders,
    outreach,
    loading,
    loadError,
    notionOn,
    notionError,
    pendingCount,
    refresh,
  } = useAppData();

  const [claudeRunning, setClaudeRunning] = useState(false);
  const [outreachAddOpen, setOutreachAddOpen] = useState(false);

  // The URL is the source of truth for which view is showing — no more
  // localStorage-seeded useState. `LegacyViewRedirect` handles the one-time
  // migration for a session that still has the pre-routing `view_mode` key.
  const location = useLocation();
  const navigate = useNavigate();
  const view = pathToView(location.pathname) ?? 'list';
  const setView = useCallback((v: View) => navigate(viewToPath(v)), [navigate]);

  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme_pref');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  // Visual theme (genjutsu:paint, 30 Aug 2026) — separate from light/dark:
  // Bauhaus stays the default, Pulse is opt-in, chosen from Settings →
  // Appearance. 'bauhaus' stores as no attribute at all so an old
  // localStorage value (or none) still resolves to the current default.
  const [theme, setTheme] = useState<VisualTheme>(() => {
    const v = localStorage.getItem('visual_theme');
    return v === 'pulse' ? 'pulse' : v === 'cyber' ? 'cyber' : 'bauhaus';
  });
  // Daily wallpaper (30 Aug 2026) — a Pexels photo behind the app, swapped
  // once a day server-side. Independent of `theme`: works under either.
  const [wallpaper, setWallpaper] = useState<boolean>(
    () => localStorage.getItem('wallpaper_pref') === 'on'
  );
  useEffect(() => {
    localStorage.setItem('wallpaper_pref', wallpaper ? 'on' : 'off');
  }, [wallpaper]);
  // Blur/dim slider (30 Aug 2026) — 0-100, how strongly the scrim covers the
  // photo. Wallpaper.tsx maps this onto an opacity+blur range; kept as a
  // plain 0-100 here so the stored value stays meaningful if that mapping
  // ever changes.
  const [wallpaperDim, setWallpaperDim] = useState<number>(() => {
    const saved = Number(localStorage.getItem('wallpaper_dim'));
    return Number.isFinite(saved) && saved > 0 ? saved : 70;
  });
  useEffect(() => {
    localStorage.setItem('wallpaper_dim', String(wallpaperDim));
  }, [wallpaperDim]);
  // Sound (30 Aug 2026) — on by default, per explicit request (unlike the
  // wallpaper, which stays opt-in). `setSoundEnabled` is a module-level flag
  // rather than a prop threaded everywhere, so any component (e.g.
  // TerminalPanel) can just call `playSound()` without needing this state
  // passed down to it.
  const [sound, setSound] = useState<boolean>(() => localStorage.getItem('sound_pref') !== 'off');
  useEffect(() => {
    localStorage.setItem('sound_pref', sound ? 'on' : 'off');
    setSoundEnabled(sound);
  }, [sound]);
  // Filters live in the URL (shareable, survives back/forward) rather than
  // component state. `replace: true` on every change so typing a search
  // query doesn't flood browser history with one entry per keystroke.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const statusF = searchParams.get('status') ?? '';
  const typeF = searchParams.get('type') ?? '';
  const employmentF = searchParams.get('employment') ?? '';
  const tagF = searchParams.get('tag') ?? '';

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const setSearch = (v: string) => setParam('q', v);
  const setStatusF = (v: string) => setParam('status', v);
  const setTypeF = (v: string) => setParam('type', v);
  const setEmploymentF = (v: string) => setParam('employment', v);
  const setTagF = (v: string) => setParam('tag', v);

  // Home mode (v6.2.0 Overview): 'dashboard' (interactive Bento grid) or 'pipeline' (tactical role list)
  const [homeMode, setHomeModeState] = useState<'dashboard' | 'pipeline'>(() => {
    const param = searchParams.get('mode');
    if (param === 'pipeline' || param === 'dashboard') return param;
    const saved = localStorage.getItem('home_mode_pref');
    if (saved === 'pipeline' || saved === 'dashboard') return saved;
    return 'dashboard';
  });
  const setHomeMode = useCallback(
    (mode: 'dashboard' | 'pipeline') => {
      setHomeModeState(mode);
      localStorage.setItem('home_mode_pref', mode);
      setParam('mode', mode === 'dashboard' ? '' : mode);
    },
    [setParam]
  );

  // Sidebar collapsed rail mode (desktop)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('sidebar_collapsed') === 'true'
  );

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleToggleSidebar]);

  const sotCount = useMemo(
    () =>
      apps.filter(
        (a) =>
          a.tags?.some((t) => t.toUpperCase() === 'SOT') ||
          a.source === 'Summer of Tech'
      ).length,
    [apps]
  );

  // Layout mode (v5.0): 'rows' (Card view), 'table' (Dense table view), or 'board' (Kanban)
  const layoutParam = searchParams.get('layout');
  const layout: 'rows' | 'table' | 'board' =
    layoutParam === 'board' ? 'board' : layoutParam === 'table' ? 'table' : 'rows';
  const setLayout = (v: 'rows' | 'table' | 'board') =>
    setParam('layout', v === 'rows' ? '' : v);

  // Sort is a preference, not navigation — the URL can carry it (so a
  // shared/bookmarked link keeps its ordering), but the default when the URL
  // is silent comes from localStorage, and every explicit change updates both.
  const sort =
    (searchParams.get('sort') as SortKey) ||
    (localStorage.getItem('sort_key') as SortKey) ||
    'updated';
  const setSort = (v: SortKey) => {
    localStorage.setItem('sort_key', v);
    setParam('sort', v);
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [confirming, setConfirming] = useState<Application | null>(null);
  const [applying, setApplying] = useState<Application | null>(null);
  const [previewingApp, setPreviewingApp] = useState<Application | null>(null);
  const [interviewingApp, setInterviewingApp] = useState<Application | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [replayLoader, setReplayLoader] = useState(false);
  /**
   * The Gmail button runs the check itself — it does not open the terminal.
   *
   * It used to set `terminalOpen` and bump a counter that TerminalPanel watched
   * to auto-start the run. That never fired: React 18 batches both setState
   * calls into one render, so the panel mounted with the counter *already*
   * incremented and its `useRef(gmailFetchSignal)` initialised to that same
   * value — the effect's "has it changed?" guard was true on mount every time.
   * Since the panel is conditionally mounted, it re-initialised on every open,
   * so the button only ever opened an empty terminal and waited.
   *
   * Opening a terminal was never the point anyway: this is one fixed action
   * with no prompt to write. So it POSTs directly and streams only to know when
   * it's finished. The run's own narration belongs in the audit log and
   * Telegram, which already receive it; here we just need the verdict.
   */
  const gmailRunning = useRef(false);
  const handleGmailFetch = async () => {
    if (gmailRunning.current) {
      toast('Already checking your email — give it a moment.');
      return;
    }
    gmailRunning.current = true;
    // Deliberately NOT setClaudeRunning: that flag only changes cards that
    // already have a CV queued, relabelling them "Processing…" and disabling
    // their cancel button. The cv-worker runs on its own path and is unaffected
    // by a Gmail check, so setting it here would mislabel those cards and block
    // an unrelated control for the duration. The toasts are the feedback.
    toast('Checking your last 10 emails…');

    const finish = (message: string, tone: 'info' | 'error' = 'info') => {
      if (!gmailRunning.current) return;
      gmailRunning.current = false;
      toast(message, tone);
      refresh();
    };

    try {
      const res = await fetch('/api/claude/gmailfetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 10 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not start the email check.');

      const source = new EventSource(`/api/claude/stream/${body.runId}`);
      // The prompt asks for "a short, direct summary of what you did", so the
      // last assistant line is the result worth surfacing.
      let lastOut = '';
      source.onmessage = (e) => {
        const event = JSON.parse(e.data) as { stream: string; line: string };
        if (event.stream === 'out' && event.line.trim()) lastOut = event.line.trim();
        if (event.stream !== 'done') return;
        source.close();
        const ok = event.line === '0';
        finish(
          ok
            ? lastOut.slice(0, 300) || 'Email check finished — nothing new to log.'
            : 'The email check failed. Open the terminal (Ctrl+J) to see why.',
          ok ? 'info' : 'error'
        );
      };
      source.onerror = () => {
        // EventSource fires this on transient blips too, and reconnects itself —
        // the stream endpoint replays the run's lines from the start, so that
        // recovers cleanly. Only a CLOSED socket is actually fatal; treating
        // every onerror as failure would report a false error on a live run.
        if (source.readyState !== EventSource.CLOSED) return;
        finish('Lost contact with the email check — it may still be running.', 'error');
      };
    } catch (err) {
      finish(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [alertQueue, setAlertQueue] = useState<string[]>([]);
  const toastId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const viewFadeRef = useRef<HTMLDivElement>(null);
  const cardListRef = useRef<HTMLDivElement>(null);
  const [celebration, setCelebration] = useState<{ company: string; role: string } | null>(null);
  const prevStatuses = useRef<Record<string, Status>>({});

  // `sound` overrides the tone-derived default for the handful of call sites
  // where a routine toast deserves a more specific chime (Mark Applied's
  // `success` reuse, matching the 🎉 reveal on that button).
  const toast = useCallback((text: string, tone: 'info' | 'error' = 'info', sound?: SoundKind) => {
    playSound(sound ?? (tone === 'error' ? 'error' : 'info'));
    if (tone === 'error') {
      setAlertQueue((q) => [...q, text]);
      return;
    }
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // Fires once per genuine transition INTO a handful of statuses — the guard
  // on `prev[a.id] !== undefined` means an app that's already in that status
  // on first load (or after a background refresh) never re-triggers it, only
  // a live change does. Driven by polled `apps` state rather than any one UI
  // handler, so this catches a status change from every source: the Edit
  // modal, Board drag, or Claude editing applications.json directly (a
  // rejection logged via /gmailfetch, an interview date added via chat).
  useEffect(() => {
    const prev = prevStatuses.current;
    const wasSeen = (id: string) => prev[id] !== undefined;

    const newOffer = apps.find((a) => wasSeen(a.id) && prev[a.id] !== 'offer' && a.status === 'offer');
    if (newOffer) {
      setCelebration({ company: newOffer.company, role: newOffer.role });
      setTimeout(() => setCelebration(null), 2600);
      playSound('success');
    }

    const newInterview = apps.find(
      (a) => wasSeen(a.id) && prev[a.id] !== 'interview' && a.status === 'interview'
    );
    if (newInterview) playSound('milestone');

    const newRejection = apps.find(
      (a) => wasSeen(a.id) && prev[a.id] !== 'rejected' && a.status === 'rejected'
    );
    if (newRejection) playSound('reject');

    prevStatuses.current = Object.fromEntries(apps.map((a) => [a.id, a.status]));
  }, [apps]);

  // A gentle once-per-load nudge for "you have follow-ups waiting" — checked
  // only the first time `apps` actually has data, never again on a later
  // poll, so it can't turn into the same repeat-on-every-refresh noise the
  // GSAP entrance-replay bug caused elsewhere in this app (30 Aug 2026).
  const remindedRef = useRef(false);
  useEffect(() => {
    if (remindedRef.current || loading || apps.length === 0) return;
    remindedRef.current = true;
    if (pickPriorities(apps).some((p) => p.action === 'follow-up')) playSound('reminder');
  }, [apps, loading]);

  // ---------- preferences ----------

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme_pref', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (theme === 'pulse') document.documentElement.setAttribute('data-theme', 'pulse');
    else if (theme === 'cyber') document.documentElement.setAttribute('data-theme', 'cyber');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('visual_theme', theme);
  }, [theme]);

  // Ctrl/Cmd+J opens the Claude terminal; the palette owns Ctrl/Cmd+K.
  // (Ctrl+T is reserved by the browser for a new tab and never reaches the page.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setTerminalOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ---------- actions ----------

  const handleSave = async (data: Partial<Application>) => {
    if (editing) {
      const updated = await api.update(editing.id, data);
      setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      toast('Saved.');
    } else {
      const created = await api.create(data);
      setApps((list) => [...list, created]);
      toast(`Added ${created.company} — ${created.role}.`);
    }
    setEditOpen(false);
    setEditing(null);
    refreshFolders();
  };

  const handleDelete = async () => {
    if (!confirming) return;
    const entry = confirming;
    setConfirming(null);
    setEditOpen(false);
    setEditing(null);
    try {
      await api.remove(entry.id);
      setApps((list) => list.filter((a) => a.id !== entry.id));
      toast(`Removed ${entry.company} — folder & Notion cleanup queued.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleMarkApplied = async (patch: Partial<Application>) => {
    if (!applying) return;
    const entry = applying;
    try {
      const updated = await api.update(entry.id, patch);
      setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      toast(`Marked applied — ${entry.company}.`, 'info', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setApplying(null);
    }
  };

  const handleRequestCv = async (app: Application) => {
    try {
      const res = await api.requestCv(app.id);
      setApps((list) => list.map((a) => (a.id === app.id ? res.entry : a)));
      toast('Queued — Claude will draft the CV & cover letter shortly.');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleCancelCv = async (app: Application) => {
    try {
      const res = await api.cancelCvRequest(app.id);
      setApps((list) => list.map((a) => (a.id === app.id ? res.entry : a)));
      toast(`Un-queued — ${app.company}.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleRequestReview = async (app: Application) => {
    try {
      const res = await api.requestReview(app.id);
      setApps((list) => list.map((a) => (a.id === app.id ? res.entry : a)));
      toast('Queued — Claude will critique the CV & cover letter.');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleOpenFolder = async (app: Application) => {
    if (!app.folderPath) return;
    try {
      await api.openFolder(app.folderPath);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleStatusChange = async (app: Application, status: Status) => {
    if (status === 'interview') {
      setInterviewingApp(app);
      return;
    }
    // Optimistic: the card snaps to the new column immediately, then
    // reconciles with whatever the server actually stored.
    setApps((list) => list.map((a) => (a.id === app.id ? { ...a, status } : a)));
    try {
      const updated = await api.update(app.id, { status });
      setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      setApps((list) => list.map((a) => (a.id === app.id ? app : a)));
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleInterviewConfirm = async (patch: Partial<Application>, options?: { requestPrep?: boolean }) => {
    if (!interviewingApp) return;
    const entry = interviewingApp;
    try {
      const updated = await api.update(entry.id, patch);
      setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      toast(`Marked interview — ${entry.company}!`, 'info', 'milestone');
      if (options?.requestPrep) {
        try {
          await api.requestCv(entry.id);
        } catch {}
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setInterviewingApp(null);
    }
  };

  // ---------- filtering & sorting ----------

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    const sorters: Record<SortKey, (a: Application, b: Application) => number> = {
      updated: (a, b) => (b.updated ?? 0) - (a.updated ?? 0),
      created: (a, b) => (b.created ?? 0) - (a.created ?? 0),
      company: (a, b) => a.company.localeCompare(b.company),
      // Undated entries sort last rather than pretending to be the oldest.
      applied: (a, b) => {
        const da = daysSince(a.date);
        const db = daysSince(b.date);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      },
      // Soonest still-open closing date first; already-closed roles sink to
      // the bottom rather than outranking the one closing today.
      deadline: (a, b) => {
        const la = daysSince(a.deadline) === null ? null : -daysSince(a.deadline)!;
        const lb = daysSince(b.deadline) === null ? null : -daysSince(b.deadline)!;
        if (la === null && lb === null) return 0;
        if (la === null) return 1;
        if (lb === null) return -1;
        const expiredA = la < 0;
        const expiredB = lb < 0;
        if (expiredA !== expiredB) return expiredA ? 1 : -1;
        return la - lb;
      },
    };

    return apps
      .filter((a) => {
        const matchesSearch =
          !q ||
          a.company.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q) ||
          (a.tags && a.tags.some((t) => t.toLowerCase().includes(q))) ||
          (a.source && a.source.toLowerCase().includes(q));
        // The board's columns already separate by status, so applying the
        // status filter there too would just blank out columns confusingly.
        // Keep this in sync with Pipeline's own TABS matchers — "applied" and
        // "progressing" aren't plain status equality (progressing overlaps
        // interview/offer status plus the ad-hoc `progressing` flag).
        const matchesStatus =
          layout === 'board' ||
          !statusF ||
          (statusF === 'applied'
            ? a.status === 'applied' && !a.progressing
            : statusF === 'progressing'
              ? a.status === 'interview' || a.status === 'offer' || Boolean(a.progressing)
              : a.status === statusF);
        const matchesType = !typeF || a.type === typeF;
        const matchesEmployment = !employmentF || (a.employment ?? 'job') === employmentF;
        const matchesTag =
          !tagF ||
          (tagF.toUpperCase() === 'SOT'
            ? a.tags?.some((t) => t.toUpperCase() === 'SOT') || a.source === 'Summer of Tech'
            : a.tags && a.tags.some((t) => t.toLowerCase() === tagF.toLowerCase()));
        return matchesSearch && matchesStatus && matchesType && matchesEmployment && matchesTag;
      })
      .sort(sorters[sort]);
  }, [apps, search, statusF, typeF, employmentF, tagF, layout, sort]);

  useFlipList(cardListRef, filtered);

  useGSAP(
    () => {
      if (!viewFadeRef.current) return;
      const reduce = prefersReducedMotion();
      gsap.from(viewFadeRef.current, { opacity: 0, y: 4, duration: reduce ? 0 : 0.18, ease: 'power2.out' });
    },
    { dependencies: [view, homeMode] }
  );

  const handleExport = async () => {
    try {
      await api.exportCsv();
      toast('Exported.');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const openNew = () => {
    setEditing(null);
    setEditOpen(true);
  };

  const handleOpenRole = useCallback(
    (app: Application) => {
      if (typeof document !== 'undefined' && 'startViewTransition' in document) {
        (document as any).startViewTransition(() => navigate(`/role/${app.id}`));
      } else {
        navigate(`/role/${app.id}`);
      }
    },
    [navigate]
  );

  // ---------- render ----------

  return (
    <div
      className={`mx-auto grid max-w-[1400px] transition-all duration-200 px-6 pb-32 pt-8 sm:px-10 ${
        sidebarCollapsed
          ? 'md:grid-cols-[72px_minmax(0,1fr)] gap-x-6'
          : 'md:grid-cols-[220px_minmax(0,1fr)] gap-x-10'
      } md:pb-24 md:pt-0`}
    >
      {wallpaper && <Wallpaper dim={wallpaperDim} />}
      <PageHeader
        view={view}
        appCount={apps.length}
        outreach={outreach}
        pendingCount={pendingCount}
        onOpenTerminal={() => setTerminalOpen(true)}
        onGmailFetch={handleGmailFetch}
        onPrimary={isOutreachView(view) ? () => setOutreachAddOpen(true) : openNew}
        onHome={() => {
          setView('list');
          navigate('/');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
      />

      <Sidebar
        view={view}
        onSetView={setView}
        sort={sort}
        onSetSort={setSort}
        typeF={typeF}
        onSetTypeF={setTypeF}
        employmentF={employmentF}
        onSetEmploymentF={setEmploymentF}
        tagF={tagF}
        onSetTagF={setTagF}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />

      <MobileNav
        view={view}
        onSetView={setView}
        sort={sort}
        onSetSort={setSort}
        typeF={typeF}
        onSetTypeF={setTypeF}
        employmentF={employmentF}
        onSetEmploymentF={setEmploymentF}
        tagF={tagF}
        onSetTagF={setTagF}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
      />

      <main className="min-w-0">
      {loadError && (
        <div className="mb-8 rounded-2xl border border-rose/30 bg-rose/[0.06] p-5 text-body">
          <strong className="font-semibold text-rose">Can't reach the local server.</strong>{' '}
          <span className="text-ink-soft">{loadError}</span>
          <div className="mt-1.5 text-meta text-ink-soft">
            Double-click <code className="font-mono">Start Job HQ.bat</code>, or run{' '}
            <code className="font-mono">npm run dev</code> in the App folder.
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.08] pb-4">
          <div className="flex items-center gap-1 rounded-full border border-black/[0.08] dark:border-white/[0.1] bg-panel/80 p-1 shadow-[0_2px_12px_rgba(0,0,0,0.03)] backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                playSound('tick');
                setHomeMode('dashboard');
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 ${
                homeMode === 'dashboard'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] -translate-y-0.5'
                  : 'text-ink-soft hover:text-ink hover:bg-panel-2/60'
              }`}
            >
              <Icon.Zap className="h-3.5 w-3.5" />
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playSound('tick');
                setHomeMode('pipeline');
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 ${
                homeMode === 'pipeline'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] -translate-y-0.5'
                  : 'text-ink-soft hover:text-ink hover:bg-panel-2/60'
              }`}
            >
              <Icon.Board className="h-3.5 w-3.5" />
              <span>Pipeline ({apps.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-ink-faint">
            <span
              className="flex items-center gap-1.5"
              title={notionError ? `Notion: ${notionError}` : notionOn ? 'Notion mirror active' : 'Notion offline'}
            >
              <span className={`h-2 w-2 rounded-full ${notionError ? 'bg-rose-500' : notionOn ? 'bg-emerald-500' : 'bg-neutral'}`} />
              Notion {notionError ? 'error' : notionOn ? 'synced' : 'not configured'}
            </span>
            <span className="hidden sm:inline text-ink-faint/40">·</span>
            <span className="hidden sm:inline">
              <kbd className="font-mono text-ink rounded bg-panel-2 px-1.5 py-0.5 text-[11px]">Ctrl+K</kbd> palette
            </span>
            <span className="hidden sm:inline text-ink-faint/40">·</span>
            <span className="hidden sm:inline">
              <kbd className="font-mono text-ink rounded bg-panel-2 px-1.5 py-0.5 text-[11px]">Ctrl+J</kbd> console
            </span>
          </div>
        </div>
      )}

      {view === 'list' && loading && (
        <DashboardSkeleton />
      )}

      {view === 'list' && !loading && homeMode === 'pipeline' && (
        <>
          <DeadlineCountdown
            apps={apps}
            onOpen={handleOpenRole}
          />
          <InterviewBanner
            apps={apps}
            onOpen={handleOpenRole}
            onSchedule={(a) => {
              setInterviewingApp(a);
            }}
          />
          <EventsBanner />
          <CommandCentre
            apps={apps}
            onOpen={handleOpenRole}
            onOpenTerminal={() => setTerminalOpen(true)}
            onAutoPicked={refresh}
          />
        </>
      )}

      {/* Pipeline tabs, search, and this status strip only apply to the role
          list itself — Insights and Agenda both mix every status together by
          construction, so a single-status filter doesn't mean anything there. */}
      {view === 'list' && !loading && homeMode === 'pipeline' && (
        <>
          <Pipeline apps={apps} active={statusF} onPick={setStatusF} />

          {layout !== 'board' && (
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px] flex-1">
                <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search company, role, or tag (e.g. SOT)…"
                  className="field-input pl-10"
                />
              </div>

              {sotCount > 0 && (
                <button
                  type="button"
                  onClick={() => setTagF(tagF.toUpperCase() === 'SOT' ? '' : 'SOT')}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                    tagF.toUpperCase() === 'SOT'
                      ? 'border-red-500 bg-red-500 text-white'
                      : 'border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400'
                  }`}
                  title="Filter by Summer of Tech (SOT) roles"
                >
                  <img
                    src="/source-logos/sot.svg"
                    alt=""
                    className="h-3.5 w-3.5 object-contain"
                  />
                  <span>Summer of Tech ({sotCount})</span>
                </button>
              )}

              {tagF && tagF.toUpperCase() !== 'SOT' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-meta text-ink-soft">Tag:</span>
                  <TagBadge tag={tagF} onRemove={() => setTagF('')} />
                </div>
              )}
            </div>
          )}

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-micro text-ink-faint">
            <span>
              Showing {filtered.length} of {apps.length}
              {(statusF || tagF) && ' · filtered'}
            </span>
            <div className="flex items-center gap-4">
              {/* Layout toggle (v5.0): Cards, Table, Board */}
              <div className="flex items-center gap-0.5 rounded-full border border-line p-0.5">
                <button
                  onClick={() => setLayout('rows')}
                  aria-pressed={layout === 'rows'}
                  title="Card view"
                  className={`rounded-full p-1.5 transition ${layout === 'rows' ? 'bg-panel-2 text-ink' : 'text-ink-faint hover:text-ink'}`}
                >
                  <Icon.List className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setLayout('table')}
                  aria-pressed={layout === 'table'}
                  title="Dense table view"
                  className={`rounded-full p-1.5 transition ${layout === 'table' ? 'bg-panel-2 text-ink' : 'text-ink-faint hover:text-ink'}`}
                >
                  <Icon.Grid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setLayout('board')}
                  aria-pressed={layout === 'board'}
                  title="Board view"
                  className={`rounded-full p-1.5 transition ${layout === 'board' ? 'bg-panel-2 text-ink' : 'text-ink-faint hover:text-ink'}`}
                >
                  <Icon.Board className="h-3.5 w-3.5" />
                </button>
              </div>
              <span
                className="flex items-center gap-1.5"
                title={
                  notionError
                    ? `Notion sync failing: ${notionError}`
                    : notionOn
                      ? 'Every change mirrors to Notion automatically'
                      : 'Copy App/.env.example to App/.env and add your Notion token'
                }
              >
                <span
                  className={`dot ${notionError ? 'bg-rose' : notionOn ? 'bg-grass' : 'bg-neutral'}`}
                />
                Notion {notionError ? 'sync failing' : notionOn ? 'synced' : 'not configured'}
              </span>
              <button onClick={handleExport} className="link-quiet">
                <Icon.Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </div>
          </div>
        </>
      )}

      {/* Split here rather than adding cases to the chain below: that chain has
          a `filtered.length === 0` branch partway down, and an empty job list
          would otherwise blank the outreach sections entirely. */}
      <div ref={viewFadeRef}>
      {isOutreachView(view) ? (
        <Suspense fallback={<SkeletonPanels />}>
          <OutreachView
            kind={VIEW_KIND[view]}
            entries={outreach}
            apps={apps}
            addOpen={outreachAddOpen}
            onCloseAdd={() => setOutreachAddOpen(false)}
            onChanged={refresh}
            toast={toast}
          />
        </Suspense>
      ) : /* Ahead of the `loading` guard below: Settings reads none of the
             application data, so making it wait on that fetch would blank the
             page — including the server log, which is exactly what you want to
             see when a fetch is what's broken. */
      view === 'settings' ? (
        <Suspense fallback={<SkeletonPanels />}>
          <Settings
            dark={dark}
            onToggleDark={() => setDark((d) => !d)}
            theme={theme}
            onSelectTheme={setTheme}
            wallpaper={wallpaper}
            onToggleWallpaper={() => setWallpaper((w) => !w)}
            wallpaperDim={wallpaperDim}
            onSetWallpaperDim={setWallpaperDim}
            sound={sound}
            onToggleSound={() => setSound((s) => !s)}
          />
        </Suspense>
      ) : loading ? null : view === 'insights' ? (
        <Suspense fallback={<SkeletonPanels />}>
          <Insights apps={apps} onOpenTerminal={() => setTerminalOpen(true)} />
        </Suspense>
      ) : view === 'study' ? (
        <Suspense fallback={<SkeletonPanels />}>
          <Study apps={apps} onOpenTerminal={() => setTerminalOpen(true)} />
        </Suspense>
      ) : view === 'agenda' ? (
        <Suspense fallback={<SkeletonPanels />}>
          <AgendaView
            apps={apps}
            outreach={outreach}
            onOpenApp={handleOpenRole}
            onOpenOutreach={(e) => setView(e.kind === 'company' ? 'companies' : 'recruiters')}
            toast={toast}
          />
        </Suspense>
      ) : view === 'list' && homeMode === 'dashboard' ? (
        <>
          <KineticLoader
            forceShow={replayLoader}
            onComplete={() => setReplayLoader(false)}
          />
          <DeadlineCountdown
            apps={apps}
            onOpen={handleOpenRole}
          />
          <HomeDashboard
            apps={apps}
            notionOn={notionOn}
            notionError={notionError}
            onOpenApp={handleOpenRole}
            onAddNew={openNew}
            onGmailFetch={handleGmailFetch}
            onOpenTerminal={() => setTerminalOpen(true)}
            onGoToInsights={() => setView('insights')}
            onOpenFolder={handleOpenFolder}
            onSelectStage={(stage) => {
              setStatusF(stage);
              setHomeMode('pipeline');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onSwitchToPipeline={() => {
              playSound('tick');
              setHomeMode('pipeline');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onRefresh={refresh}
            onReplayLoader={() => setReplayLoader(true)}
          />
        </>
      ) : filtered.length === 0 ? (
        <div className="panel-empty py-24 text-center">
          {apps.length === 0 ? (
            <Icon.Inbox className="mx-auto h-8 w-8 text-ink-faint" />
          ) : (
            <Icon.Search className="mx-auto h-8 w-8 text-ink-faint" />
          )}
          <p className="mt-3 text-subhead text-ink-soft">
            {apps.length === 0 ? 'No applications yet.' : 'Nothing matches those filters.'}
          </p>
          {apps.length === 0 && (
            <button onClick={() => setTerminalOpen(true)} className="btn-primary mt-5">
              <Icon.Sparkles className="h-4 w-4" />
              Log your first role with Claude
            </button>
          )}
        </div>
      ) : layout === 'board' ? (
        <Suspense fallback={<SkeletonRows />}>
          <BoardView
            apps={filtered}
            onOpen={handleOpenRole}
            onStatusChange={handleStatusChange}
          />
        </Suspense>
      ) : layout === 'table' ? (
        <Suspense fallback={<SkeletonRows />}>
          <DenseTableView
            apps={filtered}
            folders={folders}
            onEdit={(a) => {
              setEditing(a);
              setEditOpen(true);
            }}
            onPreviewDocs={(a) => setPreviewingApp(a)}
            onRequestCv={handleRequestCv}
            onMarkApplied={(a) => setApplying(a)}
            onSelectTag={setTagF}
          />
        </Suspense>
      ) : (
        <div
          ref={listRef}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const cards = listRef.current?.querySelectorAll<HTMLElement>('[data-app-card]');
            if (!cards || cards.length === 0) return;
            const current = Array.from(cards).indexOf(document.activeElement as HTMLElement);
            const next =
              e.key === 'ArrowDown'
                ? Math.min(current + 1, cards.length - 1)
                : Math.max(current - 1, 0);
            e.preventDefault();
            cards[current === -1 ? 0 : next]?.focus();
          }}
        >
          {/* Bauhaus redesign (23 Aug 2026): each row is now its own bordered
              card (AppCard.tsx), not a hairline-separated list — `space-y-3`
              replaces the old `border-t` that used to kick off the dividers.
              Reflow + entrance now driven by useFlipList (GSAP Flip) rather
              than framer-motion's `layout` + `AnimatePresence mode="popLayout"`
              — see useFlipList.ts for the one simplification that comes with
              it (a removed card just disappears rather than fading out first). */}
          <div ref={cardListRef} className="space-y-3">
              {filtered.map((a) => (
                <AppCard
                  key={a.id}
                  app={a}
                  folder={folders[a.id]}
                  onEdit={() => {
                    setEditing(a);
                    setEditOpen(true);
                  }}
                  onRequestCv={() => handleRequestCv(a)}
                  onCancelCv={() => handleCancelCv(a)}
                  onRequestReview={() => handleRequestReview(a)}
                  onOpenFolder={() => handleOpenFolder(a)}
                  onMarkApplied={() => setApplying(a)}
                  onPreviewDocs={() => setPreviewingApp(a)}
                  onSelectTag={setTagF}
                  claudeRunning={claudeRunning}
                />
              ))}
          </div>
        </div>
      )}
      </div>

      <footer className="mt-16 border-t border-line-soft pt-6 text-micro text-ink-faint">
        Data lives in <code className="font-mono">App/data/applications.json</code> on this PC.
        <span className="mx-2">·</span>
        <kbd className="font-mono">Ctrl K</kbd> commands
        <span className="mx-2">·</span>
        <kbd className="font-mono">Ctrl J</kbd> Terminal
      </footer>
      </main>

      {editOpen && (
        <Suspense fallback={null}>
          <EditModal
            open={editOpen}
            entry={editing}
            onClose={() => {
              setEditOpen(false);
              setEditing(null);
            }}
            onSave={handleSave}
            onDelete={(entry) => setConfirming(entry)}
          />
        </Suspense>
      )}

      {applying && (
        <Suspense fallback={null}>
          <AppliedModal
            entry={applying}
            onCancel={() => setApplying(null)}
            onConfirm={handleMarkApplied}
          />
        </Suspense>
      )}

      {confirming && (
        <Suspense fallback={null}>
          <ConfirmDelete
            entry={confirming}
            onCancel={() => setConfirming(null)}
            onConfirm={handleDelete}
          />
        </Suspense>
      )}

      {alertQueue.length > 0 && (
        <Suspense fallback={null}>
          <AlertModal
            message={alertQueue[0] ?? null}
            onDismiss={() => setAlertQueue((q) => q.slice(1))}
          />
        </Suspense>
      )}

      {terminalOpen && (
        <Suspense fallback={null}>
          <TerminalPanel
            open={terminalOpen}
            onClose={() => setTerminalOpen(false)}
            onFinished={refresh}
            onRunningChange={setClaudeRunning}
          />
        </Suspense>
      )}

      <Toaster toasts={toasts} />
      {celebration && (
        <Suspense fallback={null}>
          <Celebration celebration={celebration} />
        </Suspense>
      )}

      {previewingApp && (
        <Suspense fallback={null}>
          <DocumentPreviewModal
            open={Boolean(previewingApp)}
            appId={previewingApp.id}
            company={previewingApp.company}
            role={previewingApp.role}
            folderPath={previewingApp.folderPath}
            onClose={() => setPreviewingApp(null)}
            onRequestCv={() => handleRequestCv(previewingApp)}
          />
        </Suspense>
      )}

      {interviewingApp && (
        <Suspense fallback={null}>
          <InterviewTransitionModal
            open={Boolean(interviewingApp)}
            entry={interviewingApp}
            onClose={() => setInterviewingApp(null)}
            onConfirm={handleInterviewConfirm}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <CommandPalette
          apps={apps}
          view={view}
          dark={dark}
          visualTheme={theme}
          onSetView={setView}
          onToggleTheme={() => setDark((d) => !d)}
          onSelectVisualTheme={setTheme}
          onToggleVisualTheme={() => setTheme((t) => (t === 'bauhaus' ? 'pulse' : t === 'pulse' ? 'cyber' : 'bauhaus'))}
          sound={sound}
          onToggleSound={() => setSound((s) => !s)}
          onAddNew={openNew}
          onOpenTerminal={() => setTerminalOpen(true)}
          onExportCsv={handleExport}
        />
      </Suspense>
    </div>
  );
}

/**
 * Six 1:1 routes, one per current nav item, generated from `VIEW_META` so
 * this can't drift from the sidebar/palette the way the old three hand-kept
 * lists did. Every path renders the same `Dashboard`, which derives which
 * view is active from `useLocation()` — the routes exist for the URL (deep
 * links, back/forward, bookmarks), not to swap in different components.
 *
 * `/board`, `/fit`, `/evidence`, `/market`, `/analytics` and `/audit` were
 * real 1:1 routes for one release before this consolidation — a bookmark or
 * a muscle-memory URL to any of them must keep landing somewhere real, never
 * a 404. Every one of them redirects to its new location.
 */
const RETIRED_REDIRECTS: { from: string; to: string }[] = [
  { from: '/board', to: '/?layout=board' },
  { from: '/fit', to: '/insights?tab=skills' },
  { from: '/evidence', to: '/insights?tab=skills' },
  { from: '/market', to: '/insights?tab=skills' },
  { from: '/analytics', to: '/insights' },
  { from: '/audit', to: '/insights?tab=activity' },
];

function AppRoutes() {
  // Keyed by pathname so navigating to a different page remounts the
  // boundary and clears any caught error automatically — a crash on one
  // role's page shouldn't leave every subsequent page stuck on the fallback.
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
    <Routes>
      {VIEW_META.map((v) => (
        <Route key={v.path} path={v.path} element={<Dashboard />} />
      ))}
      {RETIRED_REDIRECTS.map((r) => (
        <Route key={r.from} path={r.from} element={<Navigate to={r.to} replace />} />
      ))}
      {/* Additive: a role's own page, reachable by URL and (for now) a link
          inside the still-working AppCard expander. Doesn't replace anything
          the routes above already do. */}
      <Route
        path="/role/:id"
        element={
          <Suspense fallback={<div className="mx-auto max-w-[1400px] px-6 pb-24 pt-8 sm:px-10"><SkeletonPanels /></div>}>
            <RoleDetail />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    // Future flags opted in now — router behaviour is otherwise identical
    // today, and taking them early avoids a second migration when v7 makes
    // them the default. Silences the two "future flag" console warnings too.
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LoginGate>
        <AppDataProvider>
          <LegacyViewRedirect />
          <AppRoutes />
        </AppDataProvider>
      </LoginGate>
    </BrowserRouter>
  );
}
