import { useState, useMemo } from 'react';
import { Icon } from './Icons';
import { TagBadge } from './Badges';
import { CompanyAvatar } from './CompanyAvatar';
import { copyText } from '../lib/clipboard';
import {
  SOT_OPPORTUNITIES,
  SOT_CHECKLIST,
  CORE_ELEVATOR_PITCH,
} from '../data/sotData';
import { SotPlaybook } from './SotPlaybook';

type SubView = 'strategy' | 'database' | 'pitch' | 'playbook';

export function SotHub() {
  const [subView, setSubView] = useState<SubView>('strategy');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Persist checklist state in localStorage
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('sot_checklist_v1');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const toggleCheck = (id: string) => {
    setCheckedItems((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('sot_checklist_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleCopy = (text: string, key: string) => {
    copyText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Countdown to 14 September 2026
  const meetGreetDate = new Date('2026-09-14T09:00:00+12:00');
  const today = new Date();
  const diffTime = meetGreetDate.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Filtered opportunities
  const filtered = useMemo(() => {
    return SOT_OPPORTUNITIES.filter((opp) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'applied' && opp.status !== 'applied') return false;
        if (statusFilter === 'top-pick' && opp.status !== 'top-pick') return false;
        if (statusFilter === 'backup' && opp.status !== 'backup') return false;
        if (statusFilter === 'skip' && opp.status !== 'skip') return false;
      }
      if (priorityFilter !== 'all') {
        if (opp.meetGreetPriority !== priorityFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = opp.company.toLowerCase().includes(q) || opp.role.toLowerCase().includes(q);
        const matchesHm = opp.hiringManager.toLowerCase().includes(q);
        const matchesSkills = opp.skills.some((s) => s.toLowerCase().includes(q));
        if (!matchesName && !matchesHm && !matchesSkills) return false;
      }
      return true;
    });
  }, [searchQuery, statusFilter, priorityFilter]);

  const appliedCount = SOT_OPPORTUNITIES.filter((o) => o.status === 'applied').length;
  const completedChecks = Object.values(checkedItems).filter(Boolean).length;
  const totalChecks = SOT_CHECKLIST.length;

  return (
    <div className="space-y-8">
      {/* --- HERO BANNER & STATS --- */}
      <section className="relative overflow-hidden rounded-3xl border border-red-500/20 bg-gradient-to-br from-red-500/5 via-panel to-panel p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
              <img src="/source-logos/sot.svg" alt="SOT Kiwi" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-ink">
                  Summer of Tech 2026 Hub
                </h1>
                <TagBadge tag="SOT" />
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                  <Icon.Calendar className="h-3 w-3" />
                  Meet & Greet: 14 Sep
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink-soft max-w-2xl">
                Your dedicated command center for Summer of Tech. Track all 27 opportunities, prepare for the 14 September Meet & Greet, and rehearse your elevator pitch.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://app.notion.com/p/Summer-Of-Tech-3d49b707ebab805cac2ed4ce87dba6ed"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-panel px-4 py-2.5 text-xs font-medium text-ink shadow-sm ring-1 ring-line hover:bg-neutral/50 transition-colors"
            >
              <Icon.External className="h-3.5 w-3.5 text-ink-soft" />
              <span>Open Notion Master DB</span>
            </a>
            <a
              href="https://app.summeroftech.co.nz"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition-colors"
            >
              <img src="/source-logos/sot.svg" alt="" className="h-3.5 w-3.5 brightness-0 invert" />
              <span>SOT Portal</span>
            </a>
          </div>
        </div>

        {/* Metric Badges */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-line-soft pt-6">
          <div className="rounded-2xl bg-canvas/60 p-3.5">
            <p className="text-xs font-medium text-ink-soft">Applications Quota</p>
            <p className="mt-1 text-lg font-bold text-ink">
              {appliedCount} <span className="text-xs font-normal text-ink-faint">/ 15 max</span>
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
              {15 - appliedCount > 0 ? `${15 - appliedCount} slot open` : 'Quota full'}
            </p>
          </div>

          <div className="rounded-2xl bg-canvas/60 p-3.5">
            <p className="text-xs font-medium text-ink-soft">Meet & Greet Countdown</p>
            <p className="mt-1 text-lg font-bold text-ink">
              {daysLeft > 0 ? `${daysLeft} days` : daysLeft === 0 ? 'Today!' : 'Completed'}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-faint">Sunday, 14 Sep 2026</p>
          </div>

          <div className="rounded-2xl bg-canvas/60 p-3.5">
            <p className="text-xs font-medium text-ink-soft">Tier 1 Must-Meet Booths</p>
            <p className="mt-1 text-lg font-bold text-red-600 dark:text-red-400">
              6 <span className="text-xs font-normal text-ink-faint">key targets</span>
            </p>
            <p className="mt-0.5 text-[11px] text-ink-faint">ACC, Keyhook, CyberTeam, etc.</p>
          </div>

          <div className="rounded-2xl bg-canvas/60 p-3.5">
            <p className="text-xs font-medium text-ink-soft">Prep Checklist</p>
            <p className="mt-1 text-lg font-bold text-ink">
              {completedChecks} <span className="text-xs font-normal text-ink-faint">/ {totalChecks} done</span>
            </p>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {Math.round((completedChecks / totalChecks) * 100)}% complete
            </p>
          </div>
        </div>
      </section>

      {/* --- SUBVIEW NAVIGATION --- */}
      <div className="flex items-center justify-between border-b border-line-soft pb-3">
        <div className="flex gap-1.5 p-1 rounded-xl bg-panel border border-line-soft">
          <button
            type="button"
            onClick={() => setSubView('strategy')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              subView === 'strategy'
                ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-semibold shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-neutral/40'
            }`}
          >
            <Icon.Target className="h-3.5 w-3.5" />
            <span>Meet & Greet Strategy</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('database')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              subView === 'database'
                ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-semibold shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-neutral/40'
            }`}
          >
            <Icon.List className="h-3.5 w-3.5" />
            <span>Master Opportunities ({SOT_OPPORTUNITIES.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('pitch')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              subView === 'pitch'
                ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-semibold shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-neutral/40'
            }`}
          >
            <Icon.Chat className="h-3.5 w-3.5" />
            <span>Elevator Pitch Script</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('playbook')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              subView === 'playbook'
                ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-semibold shadow-xs'
                : 'text-ink-soft hover:text-ink hover:bg-neutral/40'
            }`}
          >
            <Icon.Sparkles className="h-3.5 w-3.5" />
            <span>Employer Interview Playbook</span>
          </button>
        </div>
      </div>

      {/* --- VIEW 1: MEET & GREET STRATEGY & CHECKLIST --- */}
      {subView === 'strategy' && (
        <div className="space-y-8">
          {/* Action Checklist */}
          <div className="panel p-6 rounded-3xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                  <Icon.CheckCircle className="h-4 w-4 text-red-500" />
                  Things To Do: Meet & Greet Action Plan
                </h2>
                <p className="text-xs text-ink-soft mt-0.5">
                  Interactive preparation checklist for Sunday, 14 September 2026. Progress is saved locally.
                </p>
              </div>
              <div className="text-xs font-semibold px-3 py-1 rounded-full bg-panel border border-line">
                {completedChecks} of {totalChecks} Completed
              </div>
            </div>

            <div className="space-y-6">
              {(['pre', 'event', 'post'] as const).map((phaseKey) => {
                const items = SOT_CHECKLIST.filter((item) => item.phase === phaseKey);
                const title = items[0]?.phaseTitle || '';
                return (
                  <div key={phaseKey} className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint">
                      {title}
                    </h3>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const checked = Boolean(checkedItems[item.id]);
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleCheck(item.id)}
                            className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                              checked
                                ? 'bg-emerald-500/5 border-emerald-500/20 text-ink-soft'
                                : 'bg-panel border-line-soft hover:border-line text-ink'
                            }`}
                          >
                            <div
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                checked
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-line text-transparent hover:border-red-400'
                              }`}
                            >
                              <Icon.Check className="h-3 w-3 stroke-[2.5]" />
                            </div>
                            <div className="flex-1">
                              <p className={`text-xs font-medium ${checked ? 'line-through text-ink-faint' : 'text-ink'}`}>
                                {item.text}
                              </p>
                              <p className="mt-0.5 text-[11px] text-ink-soft leading-relaxed">
                                {item.detail}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Priority 1 Booth Dossiers */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                  <Icon.Target className="h-4 w-4 text-red-500" />
                  Top Priority Booth Dossiers (Must Meet)
                </h2>
                <p className="text-xs text-ink-soft mt-0.5">
                  Your customized talking points, tailored hooks, and questions for each Tier-1 booth.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {SOT_OPPORTUNITIES.filter((o) => o.meetGreetPriority === 'Tier 1: Must Meet').map((opp) => (
                <div key={opp.id} className="panel p-5 rounded-3xl border border-line-soft flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <CompanyAvatar name={opp.company} className="h-10 w-10 shrink-0" tags={['SOT']} />
                        <div>
                          <p className="text-xs font-bold text-red-600 dark:text-red-400">{opp.company}</p>
                          <h3 className="text-sm font-semibold text-ink">{opp.role}</h3>
                          <p className="text-[11px] text-ink-faint">
                            Hiring Lead: <span className="text-ink-soft font-medium">{opp.hiringManager}</span>
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400">
                        {opp.rating}
                      </span>
                    </div>

                    {opp.boothStrategy && (
                      <div className="space-y-3 pt-2">
                        <div className="rounded-2xl bg-canvas/70 p-3.5 border border-line-soft">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                              Your Opening Hook:
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(opp.boothStrategy?.hook || '', `hook-${opp.id}`)}
                              className="text-[10px] text-ink-faint hover:text-ink flex items-center gap-1"
                            >
                              <Icon.Copy className="h-2.5 w-2.5" />
                              {copiedKey === `hook-${opp.id}` ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <p className="text-xs text-ink leading-relaxed italic">
                            "{opp.boothStrategy.hook}"
                          </p>
                        </div>

                        <div>
                          <p className="text-[11px] font-bold text-ink-soft mb-1">Smart Questions To Ask Them:</p>
                          <ul className="list-disc list-inside space-y-1 text-xs text-ink-soft pl-1">
                            {opp.boothStrategy.questionsToAsk.map((q, idx) => (
                              <li key={idx} className="leading-snug">{q}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-line-soft flex items-center justify-between text-[11px]">
                    <span className="text-ink-faint font-mono">Job #{opp.id}</span>
                    <a
                      href={opp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-600 dark:text-red-400 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      <span>View on SOT</span>
                      <Icon.External className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- VIEW 2: MASTER OPPORTUNITIES DATABASE --- */}
      {subView === 'database' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Icon.Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by company, role, skills, manager..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-panel border border-line focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs rounded-xl bg-panel border border-line px-3 py-2 text-ink"
              >
                <option value="all">All Statuses</option>
                <option value="applied">Applied ({appliedCount})</option>
                <option value="top-pick">Top Picks</option>
                <option value="backup">Backups</option>
                <option value="skip">Skip / Stretch</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="text-xs rounded-xl bg-panel border border-line px-3 py-2 text-ink"
              >
                <option value="all">All Meet Priorities</option>
                <option value="Tier 1: Must Meet">Tier 1: Must Meet (6)</option>
                <option value="Tier 2: Strong Target">Tier 2: Strong Target (7)</option>
                <option value="Tier 3: Secondary">Tier 3: Secondary (7)</option>
                <option value="Skip">Skip (7)</option>
              </select>
            </div>
          </div>

          {/* Database Grid */}
          <div className="space-y-3">
            {filtered.map((opp) => (
              <div
                key={opp.id}
                className="panel p-4 sm:p-5 rounded-2xl border border-line-soft hover:border-line transition-all flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <CompanyAvatar name={opp.company} className="h-8 w-8 shrink-0" tags={['SOT']} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink truncate">{opp.role}</h3>
                      <span className="text-xs text-ink-soft">•</span>
                      <span className="text-xs font-medium text-ink-soft">{opp.company}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          opp.status === 'applied'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : opp.status === 'top-pick'
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : opp.status === 'backup'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-neutral/40 text-ink-faint'
                        }`}
                      >
                        {opp.status.toUpperCase()}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-ink-soft line-clamp-2 leading-relaxed">
                      {opp.rationale}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-canvas border border-line-soft text-ink-faint">
                        Manager: {opp.hiringManager}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-canvas border border-line-soft text-ink-faint">
                        Rate: {opp.salary}
                      </span>
                      {opp.skills.slice(0, 3).map((s, idx) => (
                        <span key={idx} className="text-[10px] px-2 py-0.5 rounded-md bg-neutral/30 text-ink-soft">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 border-t sm:border-t-0 border-line-soft pt-3 sm:pt-0">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-xl ${
                      opp.score >= 9.5
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                        : opp.score >= 8.5
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : opp.score >= 7.5
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-neutral/30 text-ink-faint'
                    }`}
                  >
                    {opp.rating}
                  </span>

                  <a
                    href={opp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                  >
                    <span>SOT #{opp.id}</span>
                    <Icon.External className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- VIEW 3: ELEVATOR PITCH --- */}
      {subView === 'pitch' && (
        <div className="space-y-6 max-w-4xl">
          <div className="panel p-6 sm:p-8 rounded-3xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                  <Icon.Chat className="h-4 w-4 text-red-500" />
                  The 60-Second Summer of Tech Elevator Pitch
                </h2>
                <p className="text-xs text-ink-soft mt-0.5">
                  Natural, conversational narrative engineered for Kironraj's background. No buzzwords, 100% grounded truth.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    `${CORE_ELEVATOR_PITCH.hook}\n\n${CORE_ELEVATOR_PITCH.experience}\n\n${CORE_ELEVATOR_PITCH.differentiator}\n\n${CORE_ELEVATOR_PITCH.closingAsk}`,
                    'full-pitch'
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-panel border border-line hover:bg-neutral/40 transition-colors"
              >
                <Icon.Copy className="h-3.5 w-3.5" />
                <span>{copiedKey === 'full-pitch' ? 'Copied Full Pitch!' : 'Copy Script'}</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-canvas p-4 border border-line-soft">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">
                  Step 1: The Hook (Credentials & Degree)
                </span>
                <p className="mt-1 text-sm text-ink leading-relaxed font-medium">
                  "{CORE_ELEVATOR_PITCH.hook}"
                </p>
              </div>

              <div className="rounded-2xl bg-canvas p-4 border border-line-soft">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">
                  Step 2: The Track Record (3+ Years Real Support & NOC Triage)
                </span>
                <p className="mt-1 text-sm text-ink leading-relaxed font-medium">
                  "{CORE_ELEVATOR_PITCH.experience}"
                </p>
              </div>

              <div className="rounded-2xl bg-canvas p-4 border border-line-soft">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-500">
                  Step 3: The Differentiator (Systems + Modern Agentic AI)
                </span>
                <p className="mt-1 text-sm text-ink leading-relaxed font-medium">
                  "{CORE_ELEVATOR_PITCH.differentiator}"
                </p>
              </div>

              <div className="rounded-2xl bg-canvas p-4 border border-line-soft">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                  Step 4: The Targeted Closing Ask
                </span>
                <p className="mt-1 text-sm text-ink leading-relaxed font-medium">
                  "{CORE_ELEVATOR_PITCH.closingAsk}"
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- VIEW 4: EMPLOYER INTERVIEW PLAYBOOK & DEBRIEF --- */}
      {subView === 'playbook' && <SotPlaybook />}
    </div>
  );
}
