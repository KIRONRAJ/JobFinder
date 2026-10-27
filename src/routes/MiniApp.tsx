import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, setTelegramInitData, getTelegramInitData } from '../api';
import type { Application, Status } from '../types';
import { Icon } from '../components/Icons';
import { useMatcha } from '../lib/useMatcha';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { FollowUpModal } from '../components/FollowUpModal';
import { MiniAppTodayTab } from '../components/miniapp/MiniAppTodayTab';
import { MiniAppPrepTab } from '../components/miniapp/MiniAppPrepTab';
import {
  tgHaptic,
  tgBackButton,
  tgCloudStorage,
  tgOpenLink,
  initTelegramEnvironment,
} from '../lib/telegramWebapp';

type FilterTab = 'active' | 'interview' | 'applied' | 'researching' | 'all';
type MainNavTab = 'pipeline' | 'today' | 'prep';

export function MiniApp() {
  const matcha = useMatcha();
  const cached = useMemo(() => {
    try {
      const raw = localStorage.getItem('jobhq_swr_apps');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, []);

  const [apps, setApps] = useState<Application[]>(cached);
  const [loading, setLoading] = useState(cached.length === 0);
  const [activeNavTab, setActiveNavTab] = useState<MainNavTab>('pipeline');
  const [filter, setFilter] = useState<FilterTab>('active');
  const [search, setSearch] = useState('');
  const [previewApp, setPreviewApp] = useState<Application | null>(null);
  const [followUpApp, setFollowUpApp] = useState<Application | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [statusMenuAppId, setStatusMenuAppId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    tgHaptic.impact('medium');
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  // 1. Initialize modern Telegram WebApp environment & restore saved tab from Telegram CloudStorage
  useEffect(() => {
    initTelegramEnvironment();
    const initData = getTelegramInitData();
    if (initData) {
      setTelegramInitData(initData);
    }
    // Restore persistent tab
    tgCloudStorage.getItem('miniapp_tab').then((saved) => {
      if (saved && ['pipeline', 'today', 'prep'].includes(saved)) {
        setActiveNavTab(saved as MainNavTab);
      }
    });
  }, []);

  // 2. Native Telegram BackButton integration for modals
  useEffect(() => {
    const isModalOpen = Boolean(previewApp || followUpApp || quickAddOpen);
    if (isModalOpen) {
      const handleBack = () => {
        tgHaptic.impact('light');
        setPreviewApp(null);
        setFollowUpApp(null);
        setQuickAddOpen(false);
      };
      tgBackButton.show(handleBack);
      return () => {
        tgBackButton.hide(handleBack);
      };
    } else {
      tgBackButton.hide();
    }
  }, [previewApp, followUpApp, quickAddOpen]);

  // 3. Load applications from the server
  const loadApps = useCallback(async () => {
    try {
      if (apps.length === 0) setLoading(true);
      setAuthError(null);
      const initData = getTelegramInitData();
      if (initData) {
        setTelegramInitData(initData);
      }
      const data = await api.list();
      setApps(data);
      try {
        localStorage.setItem('jobhq_swr_apps', JSON.stringify(data));
      } catch {}
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Not authenticated') || msg.includes('401')) {
        setAuthError('Please open this app from within Telegram using the bot menu or /app command.');
      } else {
        showToast(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [showToast, apps.length]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const handleNavTabChange = (tab: MainNavTab) => {
    tgHaptic.selection();
    setActiveNavTab(tab);
    tgCloudStorage.setItem('miniapp_tab', tab);
  };

  const counts = useMemo(() => {
    const active = apps.filter((a) => a.status !== 'rejected' && a.status !== 'withdrawn' && a.status !== 'skipped');
    const interview = apps.filter((a) => a.status === 'interview');
    const applied = apps.filter((a) => a.status === 'applied');
    const researching = apps.filter((a) => a.status === 'researching');

    // Count today's urgent items
    const todayStr = new Date().toISOString().slice(0, 10);
    const closingNext7Days = apps.filter((a) => {
      if (!a.deadline || a.status === 'rejected' || a.status === 'withdrawn' || a.status === 'skipped') return false;
      const d = new Date(a.deadline);
      const limit = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      return d >= new Date(todayStr) && d <= limit;
    }).length;
    const followUpsDueCount = apps.filter(
      (a) => a.followUpDue && a.followUpDue <= todayStr && a.status !== 'rejected' && a.status !== 'withdrawn' && a.status !== 'skipped'
    ).length;
    const urgentTodayTotal = closingNext7Days + followUpsDueCount + interview.length;

    return {
      active: active.length,
      interview: interview.length,
      applied: applied.length,
      researching: researching.length,
      all: apps.length,
      urgentToday: urgentTodayTotal,
    };
  }, [apps]);

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      // Filter tab
      if (filter === 'active' && (app.status === 'rejected' || app.status === 'withdrawn' || app.status === 'skipped')) return false;
      if (filter === 'interview' && app.status !== 'interview') return false;
      if (filter === 'applied' && app.status !== 'applied') return false;
      if (filter === 'researching' && app.status !== 'researching') return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchComp = app.company.toLowerCase().includes(q);
        const matchRole = app.role.toLowerCase().includes(q);
        const matchLoc = app.location?.toLowerCase().includes(q);
        const matchTags = app.tags?.some((t) => t.toLowerCase().includes(q));
        return matchComp || matchRole || matchLoc || matchTags;
      }
      return true;
    });
  }, [apps, filter, search]);

  const handleStatusChange = async (appId: string, nextStatus: Status) => {
    tgHaptic.notification('success');
    setStatusMenuAppId(null);
    try {
      const updated = await api.update(appId, { status: nextStatus });
      setApps((prev) => prev.map((a) => (a.id === appId ? updated : a)));
      showToast(`Stage updated to ${nextStatus.toUpperCase()}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed');
    }
  };

  const handleAdvanceStage = (app: Application) => {
    const sequence: Status[] = ['researching', 'applied', 'interview', 'offer'];
    const currentIdx = sequence.indexOf(app.status);
    if (currentIdx >= 0 && currentIdx < sequence.length - 1) {
      handleStatusChange(app.id, sequence[currentIdx + 1]);
    } else {
      setStatusMenuAppId(app.id);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddText.trim() || submittingAdd) return;
    setSubmittingAdd(true);
    tgHaptic.impact('heavy');
    try {
      const input = quickAddText.trim();
      let payload: Partial<Application> = {
        company: 'New Role',
        role: 'Position',
        status: 'researching',
        date: new Date().toISOString().slice(0, 10),
      };

      if (input.startsWith('http://') || input.startsWith('https://')) {
        payload.link = input;
        try {
          const parsed = await api.parseJobAd({ url: input });
          payload = { ...payload, ...parsed };
        } catch {
          // fallback to URL
        }
      } else if (input.includes('—') || input.includes('-')) {
        const parts = input.split(/[—\-]/);
        payload.company = parts[0].trim();
        payload.role = parts[1]?.trim() || 'Role';
      } else {
        payload.company = input;
      }

      const created = await api.create(payload);
      setApps((prev) => [created, ...prev]);
      setQuickAddText('');
      setQuickAddOpen(false);
      showToast(`Added ${created.company} — ${created.role}!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add role');
    } finally {
      setSubmittingAdd(false);
    }
  };

  const statusBadge = (status: Status) => {
    const styles: Record<Status, { label: string; cls: string }> = {
      researching: { label: 'Draft', cls: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
      applied: { label: 'Applied', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20' },
      interview: { label: 'Interview', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
      offer: { label: 'Offer 🎉', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
      rejected: { label: 'Declined', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
      withdrawn: { label: 'Withdrawn', cls: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
      skipped: { label: 'Skipped', cls: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
    };
    const s = styles[status] || { label: status, cls: 'bg-panel text-ink-soft border-line' };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-bg text-ink pb-28 font-sans selection:bg-accent/20">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-ink text-bg px-4 py-2 text-xs font-semibold shadow-hardLg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-panel/90 backdrop-blur-md border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center text-white shadow-hardXs font-bold text-sm">
              HQ
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-ink leading-none">JobSearchHQ</h1>
              <p className="text-[10px] text-ink-soft mt-0.5 flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Server Node
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                tgHaptic.impact('light');
                loadApps();
              }}
              title="Refresh applications"
              className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-panel-2 transition border border-transparent hover:border-line"
            >
              <Icon.Refresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => {
                tgHaptic.impact('medium');
                setQuickAddOpen(true);
              }}
              className="flex items-center gap-1 rounded-lg bg-accent text-white px-2.5 py-1.5 text-xs font-semibold shadow-hardXs hover:opacity-90 transition active:scale-95"
            >
              <Icon.Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Search Bar - only on Pipeline tab */}
        {activeNavTab === 'pipeline' && (
          <>
            <div className="mt-2.5 relative">
              <Icon.Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-soft" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, role, location…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-line bg-panel-2 text-ink placeholder:text-ink-soft focus:outline-none focus:border-accent"
              />
            </div>

            {/* Filter Chips Bar */}
            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
              <button
                onClick={() => {
                  tgHaptic.selection();
                  setFilter('active');
                }}
                className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition ${
                  filter === 'active'
                    ? 'bg-accent text-white shadow-hardXs'
                    : 'bg-panel-2 text-ink-soft border border-line hover:text-ink'
                }`}
              >
                Active ({counts.active})
              </button>
              <button
                onClick={() => {
                  tgHaptic.selection();
                  setFilter('interview');
                }}
                className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition ${
                  filter === 'interview'
                    ? 'bg-emerald-600 text-white shadow-hardXs'
                    : 'bg-panel-2 text-ink-soft border border-line hover:text-ink'
                }`}
              >
                {matcha ? (
                  <>
                    <Icon.Chat className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                    Interview ({counts.interview})
                  </>
                ) : (
                  <>
                    🟢 Interview ({counts.interview})
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  tgHaptic.selection();
                  setFilter('applied');
                }}
                className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition ${
                  filter === 'applied'
                    ? 'bg-sky-600 text-white shadow-hardXs'
                    : 'bg-panel-2 text-ink-soft border border-line hover:text-ink'
                }`}
              >
                {matcha ? (
                  <>
                    <Icon.Paperplane className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                    Applied ({counts.applied})
                  </>
                ) : (
                  <>
                    📨 Applied ({counts.applied})
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  tgHaptic.selection();
                  setFilter('researching');
                }}
                className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition ${
                  filter === 'researching'
                    ? 'bg-purple-600 text-white shadow-hardXs'
                    : 'bg-panel-2 text-ink-soft border border-line hover:text-ink'
                }`}
              >
                {matcha ? (
                  <>
                    <Icon.Search className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                    Drafts ({counts.researching})
                  </>
                ) : (
                  <>
                    🔍 Drafts ({counts.researching})
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  tgHaptic.selection();
                  setFilter('all');
                }}
                className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition ${
                  filter === 'all'
                    ? 'bg-ink text-bg shadow-hardXs'
                    : 'bg-panel-2 text-ink-soft border border-line hover:text-ink'
                }`}
              >
                All ({counts.all})
              </button>
            </div>
          </>
        )}
      </header>

      {/* Main Content View */}
      <main className="p-4 space-y-3">
        {authError && apps.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-xl border border-line bg-panel p-6 shadow-hardXs">
            <div className="text-3xl mb-3">🔒</div>
            <p className="text-sm font-semibold text-ink">Telegram Authentication Required</p>
            <p className="text-xs text-ink-soft mt-1.5 max-w-xs mx-auto leading-relaxed">
              {authError}
            </p>
            <div className="mt-4">
              <a
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-accent font-semibold px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20"
              >
                Go to Desktop Login &rarr;
              </a>
            </div>
          </div>
        ) : activeNavTab === 'today' ? (
          <MiniAppTodayTab
            apps={apps}
            onOpenFollowUp={(app) => setFollowUpApp(app)}
            onOpenPreview={(app) => setPreviewApp(app)}
            onAdvanceStatus={handleAdvanceStage}
          />
        ) : activeNavTab === 'prep' ? (
          <MiniAppPrepTab />
        ) : loading && apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-ink-soft">
            <Icon.Refresh className="h-6 w-6 animate-spin mb-2 text-accent" />
            <p className="text-xs">Loading your job pipeline…</p>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-xl border border-dashed border-line bg-panel p-6">
            <div className="text-2xl mb-2">📋</div>
            <p className="text-sm font-semibold text-ink">No applications found</p>
            <p className="text-xs text-ink-soft mt-1">Try switching filter tabs or adding a new role.</p>
          </div>
        ) : (
          filteredApps.map((app) => (
            <div
              key={app.id}
              className="rounded-2xl border border-line bg-panel p-4 shadow-hardXs transition hover:border-accent/40"
            >
              {/* Card Top: Company, Status, and Fit */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2 className="text-sm font-bold text-ink truncate leading-tight">{app.company}</h2>
                    {statusBadge(app.status)}
                  </div>
                  <p className="text-xs font-medium text-ink-soft mt-0.5 truncate">{app.role}</p>
                </div>
                {app.fit && (
                  <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                    🎯 {app.fit}
                  </span>
                )}
              </div>

              {/* Location & Metadata */}
              <div className="mt-2.5 flex items-center gap-3 text-[11px] text-ink-soft flex-wrap">
                {app.location && (
                  <span className="flex items-center gap-1">
                    <Icon.Map className="h-3 w-3" />
                    <span>{app.location}</span>
                  </span>
                )}
                {app.date && <span>Applied: {app.date}</span>}
                {app.deadline && (
                  <span className="font-semibold text-amber-500 flex items-center gap-1">
                    <Icon.Clock className="h-3 w-3" />
                    <span>Closes: {app.deadline}</span>
                  </span>
                )}
              </div>

              {/* Status Switcher Popover */}
              {statusMenuAppId === app.id && (
                <div className="mt-3 p-2 rounded-xl bg-panel-2 border border-line animate-in fade-in">
                  <p className="text-[10px] uppercase font-bold text-ink-soft px-2 py-1">
                    Change Stage:
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    {(['researching', 'applied', 'interview', 'offer', 'rejected', 'withdrawn', 'skipped'] as Status[]).map(
                      (st) => (
                        <button
                          key={st}
                          onClick={() => handleStatusChange(app.id, st)}
                          className={`text-left px-2 py-1.5 text-xs rounded-lg font-medium transition ${
                            app.status === st
                              ? 'bg-accent text-white font-bold'
                              : 'bg-panel text-ink hover:bg-panel-2'
                          }`}
                        >
                          {st.charAt(0).toUpperCase() + st.slice(1)}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Card Action Bar */}
              <div className="mt-3.5 pt-2.5 border-t border-line flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      tgHaptic.impact('light');
                      setPreviewApp(app);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line bg-panel text-[11px] font-semibold text-ink hover:border-accent transition"
                  >
                    <Icon.Doc className="h-3 w-3" />
                    <span>Docs</span>
                  </button>

                  <button
                    onClick={() => {
                      tgHaptic.impact('light');
                      setFollowUpApp(app);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line bg-panel text-[11px] font-semibold text-ink hover:border-accent transition"
                  >
                    <Icon.Mail className="h-3 w-3" />
                    <span>Follow-Up</span>
                  </button>

                  {app.link && (
                    <button
                      onClick={() => {
                        tgHaptic.impact('light');
                        tgOpenLink(app.link!);
                      }}
                      className="p-1.5 rounded-lg border border-line text-ink-soft hover:text-ink hover:border-accent transition"
                      title="Open Job Posting"
                    >
                      <Icon.External className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Stage Button */}
                <button
                  onClick={() => {
                    tgHaptic.impact('light');
                    handleAdvanceStage(app);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-panel-2 border border-line text-[11px] font-semibold text-ink hover:border-accent transition active:scale-95"
                >
                  <span>Advance Stage</span>
                  <Icon.ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </main>

      {/* Modern Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-panel/95 backdrop-blur-lg border-t border-line px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-hardLg">
        <div className="max-w-md mx-auto grid grid-cols-3 gap-1">
          {/* 1. Pipeline Tab */}
          <button
            onClick={() => handleNavTabChange('pipeline')}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition ${
              activeNavTab === 'pipeline'
                ? 'text-accent bg-accent/10 font-bold'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <div className="relative">
              {matcha ? <Icon.Target className="h-5 w-5" /> : <span className="text-lg leading-none">🎯</span>}
              {counts.active > 0 && (
                <span className="absolute -top-1 -right-2 text-[9px] font-bold px-1 rounded-full bg-accent text-white leading-tight">
                  {counts.active}
                </span>
              )}
            </div>
            <span className="text-[11px] mt-1 font-medium">Pipeline</span>
          </button>

          {/* 2. Today Focus Tab */}
          <button
            onClick={() => handleNavTabChange('today')}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition ${
              activeNavTab === 'today'
                ? 'text-accent bg-accent/10 font-bold'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <div className="relative">
              {matcha ? <Icon.Clock className="h-5 w-5" /> : <span className="text-lg leading-none">⏰</span>}
              {counts.urgentToday > 0 && (
                <span className="absolute -top-1 -right-2 text-[9px] font-bold px-1 rounded-full bg-amber-500 text-white leading-tight">
                  {counts.urgentToday}
                </span>
              )}
            </div>
            <span className="text-[11px] mt-1 font-medium">Today</span>
          </button>

          {/* 3. Prep Station Tab */}
          <button
            onClick={() => handleNavTabChange('prep')}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition ${
              activeNavTab === 'prep'
                ? 'text-accent bg-accent/10 font-bold'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {matcha ? <Icon.Mic className="h-5 w-5" /> : <span className="text-lg leading-none">🎙️</span>}
            <span className="text-[11px] mt-1 font-medium">Prep Station</span>
          </button>
        </div>
      </nav>

      {/* Quick Add Modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-panel rounded-t-2xl sm:rounded-2xl border-t sm:border border-line p-5 shadow-hardLg animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-ink">Quick Add Application</h3>
              <button
                onClick={() => setQuickAddOpen(false)}
                className="p-1 rounded-lg text-ink-soft hover:text-ink"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleQuickAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1">
                  Job Ad URL or "Company — Role"
                </label>
                <textarea
                  value={quickAddText}
                  onChange={(e) => setQuickAddText(e.target.value)}
                  placeholder="Paste a SEEK / LinkedIn URL, or type 'Spark — Systems Engineer'…"
                  rows={3}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-panel-2 text-ink placeholder:text-ink-soft focus:outline-none focus:border-accent"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-line text-xs font-medium text-ink-soft hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd || !quickAddText.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold shadow-hardXs disabled:opacity-50"
                >
                  {submittingAdd && <Icon.Refresh className="h-3.5 w-3.5 animate-spin" />}
                  <span>{submittingAdd ? 'Saving…' : 'Save Application'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewApp && (
        <DocumentPreviewModal
          open={Boolean(previewApp)}
          appId={previewApp.id}
          company={previewApp.company}
          role={previewApp.role}
          folderPath={previewApp.folderPath}
          onClose={() => setPreviewApp(null)}
        />
      )}

      {/* Follow-Up Modal */}
      {followUpApp && (
        <FollowUpModal
          open={Boolean(followUpApp)}
          app={followUpApp}
          onClose={() => setFollowUpApp(null)}
          onSaved={(updated) => {
            setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            showToast('Follow-up recorded!');
          }}
          toast={showToast}
        />
      )}
    </div>
  );
}

export default MiniApp;
