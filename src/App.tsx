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
import { EditModal } from './components/EditModal';
import { AppliedModal } from './components/AppliedModal';
import { ConfirmDelete } from './components/ConfirmDelete';
import { AlertModal } from './components/AlertModal';
import { CommandPalette } from './components/CommandPalette';
import { TerminalPanel } from './components/TerminalPanel';
import { Toaster, type ToastMsg } from './components/Toast';
import { Sidebar, VIEW_META } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { CommandCentre } from './components/CommandCentre';
import { InterviewBanner } from './components/InterviewBanner';
import { EventsBanner } from './components/EventsBanner';
import { LoginGate } from './components/LoginGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageHeader } from './components/PageHeader';
import { OutreachView } from './components/OutreachView';
import { Celebration } from './components/Celebration';
import { Wallpaper } from './components/Wallpaper';
import { AgendaView } from './components/AgendaView';
import { DeadlineCountdown } from './components/DeadlineCountdown';
import { SkeletonRows, SkeletonPanels } from './components/SkeletonRows';
import { AppDataProvider, useAppData } from './state/AppDataProvider';
import { LegacyViewRedirect } from './routes/LegacyViewRedirect';
import { pathToView, viewToPath } from './routes/viewRoutes';

// Lazy-loaded routes with auto-retry on stale chunk deployment (v5.1.5)
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
const BoardView = lazyWithRetry(() => import('./components/BoardView').then((m) => ({ default: m.BoardView })));
const DenseTableView = lazyWithRetry(() => import('./components/DenseTableView').then((m) => ({ default: m.DenseTableView })));
const DocumentPreviewModal = lazyWithRetry(() => import('./components/DocumentPreviewModal').then((m) => ({ default: m.DocumentPreviewModal })));
const InterviewTransitionModal = lazyWithRetry(() => import('./components/InterviewTransitionModal').then((m) => ({ default: m.InterviewTransitionModal })));

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
  // Bauhaus stays the default, Pulse is opt-in, chosen from Sidebar's
  // Appearance section. 'bauhaus' stores as no attribute at all so an old
  // localStorage value (or none) still resolves to the current default.
  const [theme, setTheme] = useState<'bauhaus' | 'pulse'>(
    () => (localStorage.getItem('visual_theme') === 'pulse' ? 'pulse' : 'bauhaus')
  );
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
  // Bumped by the homescreen Gmail button; TerminalPanel watches this to
  // auto-start a gmailfetch run the moment it opens — see its own comment.
  const [gmailFetchSignal, setGmailFetchSignal] = useState(0);
  const handleGmailFetch = () => {
    setTerminalOpen(true);
    setGmailFetchSignal((n) => n + 1);
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
    { dependencies: [view] }
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

  // ---------- render ----------

  return (
    <div className="mx-auto grid max-w-[1400px] gap-x-10 px-6 pb-32 pt-8 sm:px-10 md:grid-cols-[220px_minmax(0,1fr)] md:pb-24 md:pt-0">
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
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'pulse' ? 'bauhaus' : 'pulse'))}
        wallpaper={wallpaper}
        onToggleWallpaper={() => setWallpaper((w) => !w)}
        wallpaperDim={wallpaperDim}
        onSetWallpaperDim={setWallpaperDim}
        sound={sound}
        onToggleSound={() => setSound((s) => !s)}
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
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'pulse' ? 'bauhaus' : 'pulse'))}
        wallpaper={wallpaper}
        onToggleWallpaper={() => setWallpaper((w) => !w)}
        wallpaperDim={wallpaperDim}
        onSetWallpaperDim={setWallpaperDim}
        sound={sound}
        onToggleSound={() => setSound((s) => !s)}
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
        <>
          <DeadlineCountdown
            apps={apps}
            onOpen={(a) => {
              setEditing(a);
              setEditOpen(true);
            }}
          />
          <InterviewBanner
            apps={apps}
            onOpen={(a) => {
              setEditing(a);
              setEditOpen(true);
            }}
            onSchedule={(a) => {
              setInterviewingApp(a);
            }}
          />
          <EventsBanner />
          <CommandCentre
            apps={apps}
            onOpen={(a) => {
              setEditing(a);
              setEditOpen(true);
            }}
            onOpenTerminal={() => setTerminalOpen(true)}
            onAutoPicked={refresh}
          />
        </>
      )}

      {/* Pipeline tabs, search, and this status strip only apply to the role
          list itself — Insights and Agenda both mix every status together by
          construction, so a single-status filter doesn't mean anything there. */}
      {view === 'list' && (
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
        <OutreachView
          kind={VIEW_KIND[view]}
          entries={outreach}
          apps={apps}
          addOpen={outreachAddOpen}
          onCloseAdd={() => setOutreachAddOpen(false)}
          onChanged={refresh}
          toast={toast}
        />
      ) : loading ? (
        <SkeletonRows />
      ) : view === 'insights' ? (
        <Suspense fallback={<SkeletonPanels />}>
          <Insights apps={apps} onOpenTerminal={() => setTerminalOpen(true)} />
        </Suspense>
      ) : view === 'study' ? (
        <Suspense fallback={<SkeletonPanels />}>
          <Study apps={apps} onOpenTerminal={() => setTerminalOpen(true)} />
        </Suspense>
      ) : view === 'agenda' ? (
        <AgendaView
          apps={apps}
          outreach={outreach}
          onOpenApp={(a) => {
            setEditing(a);
            setEditOpen(true);
          }}
          onOpenOutreach={(e) => setView(e.kind === 'company' ? 'companies' : 'recruiters')}
          toast={toast}
        />
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
            onEdit={(a) => {
              setEditing(a);
              setEditOpen(true);
            }}
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

      <AppliedModal
        entry={applying}
        onCancel={() => setApplying(null)}
        onConfirm={handleMarkApplied}
      />

      <ConfirmDelete
        entry={confirming}
        onCancel={() => setConfirming(null)}
        onConfirm={handleDelete}
      />

      <AlertModal
        message={alertQueue[0] ?? null}
        onDismiss={() => setAlertQueue((q) => q.slice(1))}
      />

      <TerminalPanel
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        onFinished={refresh}
        onRunningChange={setClaudeRunning}
        gmailFetchSignal={gmailFetchSignal}
      />

      <Toaster toasts={toasts} />
      <Celebration celebration={celebration} />

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

      <CommandPalette
        apps={apps}
        view={view}
        dark={dark}
        visualTheme={theme}
        onSetView={setView}
        onToggleTheme={() => setDark((d) => !d)}
        onToggleVisualTheme={() => setTheme((t) => (t === 'pulse' ? 'bauhaus' : 'pulse'))}
        onAddNew={openNew}
        onOpenTerminal={() => setTerminalOpen(true)}
        onExportCsv={handleExport}
      />
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
