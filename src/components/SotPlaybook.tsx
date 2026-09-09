import { useState } from 'react';
import { Icon } from './Icons';
import { copyText } from '../lib/clipboard';
import {
  SOT_PANEL_EVENT_META,
  SOT_PANEL_SPEAKERS,
  SOT_UNIVERSAL_RULES,
  SOT_COMPANY_DOSSIERS,
  POLICE_OPEN_BACK_GUIDE,
  AI_EXPLANATION_BLUEPRINT
} from '../data/sotPlaybookData';

export function SotPlaybook() {
  const [activeCompany, setActiveCompany] = useState<string>('cyberteam');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedRule, setExpandedRule] = useState<number | null>(null);

  const handleCopy = (text: string, key: string) => {
    copyText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const currentDossier = SOT_COMPANY_DOSSIERS.find((c) => c.id === activeCompany) || SOT_COMPANY_DOSSIERS[0];

  return (
    <div className="space-y-10">
      {/* --- HEADER BANNER --- */}
      <section className="relative overflow-hidden rounded-3xl border border-red-500/20 bg-gradient-to-br from-red-500/10 via-panel to-panel p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                SOT Employer Panel Debrief
              </span>
              <span className="text-xs font-semibold text-ink">
                {SOT_PANEL_EVENT_META.date} · {SOT_PANEL_EVENT_META.time}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              {SOT_PANEL_EVENT_META.title}
            </h1>
            <p className="text-xs sm:text-sm text-ink-soft leading-relaxed">
              Full transcript intelligence, slide breakdown, and tactical interview playbooks derived directly from senior decision-makers at <strong className="text-ink">Trade Me</strong>, <strong className="text-ink">CyberTeam</strong>, <strong className="text-ink">NZ Police</strong>, and <strong className="text-ink">DataTorque</strong>.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-2xl bg-canvas/80 p-3.5 border border-line-soft text-right">
              <p className="text-[11px] font-medium text-ink-faint">Facilitated By</p>
              <p className="text-xs font-bold text-ink">{SOT_PANEL_EVENT_META.facilitator}</p>
            </div>
          </div>
        </div>

        {/* Panel Speakers Row */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t border-line-soft pt-6">
          {SOT_PANEL_SPEAKERS.map((spk) => (
            <div
              key={spk.name}
              className="rounded-2xl bg-canvas/60 p-4 border border-line-soft space-y-2 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${spk.avatarBg}`}>
                    {spk.avatarText}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink truncate">{spk.name}</p>
                    <p className="text-[11px] font-medium text-red-600 dark:text-red-400 truncate">{spk.company}</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-ink-faint italic leading-snug">
                  "{spk.quote}"
                </p>
              </div>
              <p className="text-[10px] text-ink-soft font-medium">{spk.tenure}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- SECTION 1: 6 NON-NEGOTIABLE GOLDEN RULES --- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Icon.Warning className="h-5 w-5 text-red-500" />
              <span>6 Non-Negotiable Universal Rules</span>
            </h2>
            <p className="text-xs text-ink-soft mt-0.5">
              Unanimously agreed upon by all 4 panelists. Violating rules 1 or 2 causes instant disqualification.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SOT_UNIVERSAL_RULES.map((rule) => {
            const isExpanded = expandedRule === rule.number;
            return (
              <div
                key={rule.number}
                className="panel p-5 rounded-3xl border border-line-soft space-y-3 flex flex-col justify-between hover:border-red-500/30 transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-500/10 text-xs font-bold text-red-600 dark:text-red-400">
                      #{rule.number}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      rule.tag.includes('RED') || rule.tag.includes('FATAL')
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                        : 'bg-accent/10 text-accent'
                    }`}>
                      {rule.tag}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-ink leading-tight">
                    {rule.title}
                  </h3>

                  <p className="text-xs text-ink-soft leading-relaxed">
                    {rule.summary}
                  </p>

                  <div className="space-y-1.5 pt-1 text-[11px]">
                    <div className="flex items-start gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <Icon.Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span><strong>DO:</strong> {rule.doText}</span>
                    </div>
                    <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400 font-medium">
                      <Icon.Close className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span><strong>DON'T:</strong> {rule.dontText}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-line-soft pt-2.5">
                  <button
                    type="button"
                    onClick={() => setExpandedRule(isExpanded ? null : rule.number)}
                    className="w-full flex items-center justify-between text-[11px] font-medium text-ink-soft hover:text-ink transition-colors"
                  >
                    <span>Speaker Transcript Quote</span>
                    <Icon.Chevron className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="mt-2 p-2.5 rounded-xl bg-canvas text-[11px] text-ink-soft italic leading-relaxed border border-line-soft">
                      {rule.exampleScript}
                      <p className="mt-1 font-semibold text-ink-faint not-italic text-[10px]">
                        — {rule.speakerSource}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* --- SECTION 2: COMPANY-BY-COMPANY DEEP DIVES --- */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Icon.Building className="h-5 w-5 text-red-500" />
            <span>Target Company Deep-Dives & Tailored Playbooks</span>
          </h2>
          <p className="text-xs text-ink-soft mt-0.5">
            Exact hiring process, evaluation criteria, red flags, and your personal competitive advantage.
          </p>
        </div>

        {/* Company Selector Tabs */}
        <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-panel border border-line-soft">
          {SOT_COMPANY_DOSSIERS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setActiveCompany(d.id)}
              className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold transition-all ${
                activeCompany === d.id
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-ink-soft hover:text-ink hover:bg-neutral/40'
              }`}
            >
              <span>{d.company}</span>
            </button>
          ))}
        </div>

        {/* Active Company Detail Panel */}
        <div className="panel p-6 sm:p-8 rounded-3xl border border-line-soft space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-soft pb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-ink">{currentDossier.company}</h3>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                  {currentDossier.rolesAvailable}
                </span>
              </div>
              <p className="text-xs text-ink-soft mt-1">
                Primary Decision-Maker: <strong className="text-ink">{currentDossier.speaker}</strong> ({currentDossier.speakerTitle})
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Process & What they Assess */}
            <div className="space-y-6">
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                  <Icon.Calendar className="h-3.5 w-3.5 text-accent" />
                  Exact Interview Stages
                </h4>
                <div className="space-y-2">
                  {currentDossier.hiringFormat.map((step, idx) => (
                    <div key={idx} className="p-3 rounded-2xl bg-canvas border border-line-soft text-xs text-ink leading-relaxed">
                      {step}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                  <Icon.Target className="h-3.5 w-3.5 text-emerald-500" />
                  What They Actually Assess
                </h4>
                <ul className="space-y-2">
                  {currentDossier.whatTheyAssess.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-ink-soft leading-relaxed">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right Column: Red Flags, Prep Checklist, Winning Questions */}
            <div className="space-y-6">
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-red-500 flex items-center gap-1.5">
                  <Icon.Warning className="h-3.5 w-3.5" />
                  Company-Specific Red Flags
                </h4>
                <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-1.5">
                  {currentDossier.redFlags.map((rf, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                      <Icon.Close className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{rf}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                  <Icon.Chat className="h-3.5 w-3.5 text-amber-500" />
                  Winning Questions to Ask ({currentDossier.company})
                </h4>
                <div className="space-y-2">
                  {currentDossier.winningQuestions.map((q, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-canvas border border-line-soft flex items-start justify-between gap-3 text-xs text-ink leading-relaxed"
                    >
                      <p className="italic">"{q}"</p>
                      <button
                        type="button"
                        onClick={() => handleCopy(q, `q-${currentDossier.id}-${idx}`)}
                        className="shrink-0 p-1 rounded-lg hover:bg-neutral/40 text-ink-soft hover:text-ink transition-colors"
                        title="Copy question"
                      >
                        {copiedKey === `q-${currentDossier.id}-${idx}` ? (
                          <span className="text-[10px] font-bold text-emerald-500">Copied!</span>
                        ) : (
                          <Icon.Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Kironraj's Personal Edge Callout */}
          <div className="rounded-2xl bg-gradient-to-r from-red-500/10 via-accent/5 to-panel p-4 sm:p-5 border border-red-500/30">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white font-bold text-xs">
                ⭐
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Kironraj's Strategic Advantage for {currentDossier.company}
                </h4>
                <p className="text-xs sm:text-sm text-ink leading-relaxed font-medium">
                  {currentDossier.kironEdge}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- SECTION 3: POLICE 'OPEN BACK' FRAMEWORK --- */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Icon.Shield className="h-5 w-5 text-blue-500" />
            <span>NZ Police 'OPEN BACK' Behavioral Answering Framework</span>
          </h2>
          <p className="text-xs text-ink-soft mt-0.5">
            Presented by Michael Smith (18+ yrs at Police). Replaces rigid STAR with high-accountability personal reflection.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {POLICE_OPEN_BACK_GUIDE.steps.map((step) => (
            <div
              key={step.letter}
              className="panel p-4 rounded-2xl border border-line-soft space-y-2 hover:border-blue-500/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-sm font-black text-blue-600 dark:text-blue-400">
                  {step.letter}
                </span>
                <span className="text-xs font-bold text-ink">{step.name}</span>
              </div>
              <p className="text-xs text-ink font-medium leading-snug">
                {step.prompt}
              </p>
              <p className="text-[11px] text-ink-faint italic leading-relaxed">
                Tip: {step.tip}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* --- SECTION 4: SARAH WOODS AI EXPLANATION BLUEPRINT --- */}
      <section className="panel p-6 sm:p-8 rounded-3xl border border-line-soft space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Icon.Sparkles className="h-5 w-5 text-purple-500" />
              <span>{AI_EXPLANATION_BLUEPRINT.title}</span>
            </h2>
            <p className="text-xs text-ink-soft mt-0.5">
              {AI_EXPLANATION_BLUEPRINT.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(AI_EXPLANATION_BLUEPRINT.sampleScript, 'ai-script')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-panel border border-line hover:bg-neutral/40 transition-colors shrink-0"
          >
            <Icon.Copy className="h-3.5 w-3.5" />
            <span>{copiedKey === 'ai-script' ? 'Copied Script!' : 'Copy High-Scoring Script'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {AI_EXPLANATION_BLUEPRINT.steps.map((st, idx) => (
            <div key={idx} className="p-3.5 rounded-2xl bg-canvas border border-line-soft space-y-1.5">
              <p className="text-xs font-bold text-purple-600 dark:text-purple-400">{st.step}</p>
              <p className="text-[11px] text-ink-soft leading-relaxed">{st.content}</p>
            </div>
          ))}
        </div>

        <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
            Field-Tested Script for Kironraj:
          </p>
          <p className="text-xs text-ink leading-relaxed font-mono">
            "{AI_EXPLANATION_BLUEPRINT.sampleScript}"
          </p>
        </div>
      </section>

      {/* --- SECTION 5: WHAT TO BRING & SHOW (EQUIPMENT CHECKLIST) --- */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="panel p-6 rounded-3xl border border-emerald-500/20 space-y-4">
          <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <Icon.CheckCircle className="h-4 w-4" />
            <span>WHAT TO BRING & SHOW (Endorsed by Panel)</span>
          </h3>
          <ul className="space-y-2.5 text-xs text-ink leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Indexed Cue Cards / Notepad:</strong> Sarah Woods & Michael Smith confirmed bringing prompt cards is seen as high-tier organization.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>15 Printed Copies of 2-Page CV:</strong> In a crisp folder for Meet & Greet handouts.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Project Walkthrough (e.g. JobSearchHQ):</strong> Ready to explain your stack, SQLite schema, edge cases, and why you pivoted.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Targeted Questions:</strong> Real questions that let the interviewer talk passionately about their work.</span>
            </li>
          </ul>
        </div>

        <div className="panel p-6 rounded-3xl border border-red-500/20 space-y-4">
          <h3 className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
            <Icon.Warning className="h-4 w-4" />
            <span>WHAT TO LEAVE AT HOME (Elimination Triggers)</span>
          </h3>
          <ul className="space-y-2.5 text-xs text-ink leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
              <span><strong>AI Live Feeds / Teleprompters:</strong> Instant disqualification if detected during virtual calls.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
              <span><strong>Ego & Know-It-All Attitude:</strong> Sarah Woods: "Do not bring your ego to my interview."</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
              <span><strong>Laptops for Coding Exams:</strong> No one asks for live whiteboard or leetcode builds in 15 minutes.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
              <span><strong>Rigid CV Monologues:</strong> Never recite your resume unprompted; have a back-and-forth dialogue.</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
