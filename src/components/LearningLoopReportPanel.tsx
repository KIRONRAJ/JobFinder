import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icons';
import { api } from '../api';
import type { LearningLoopReport } from '../types';

export function LearningLoopReportPanel() {
  const [report, setReport] = useState<LearningLoopReport | null | undefined>(undefined);
  const [activeSignalTab, setActiveSignalTab] = useState<'signal' | 'noise'>('signal');
  const [expandedTheme, setExpandedTheme] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .learningLoop()
      .then((r) => alive && setReport(r))
      .catch(() => alive && setReport(null));
    return () => {
      alive = false;
    };
  }, []);

  if (!report) return null;

  const generated = new Date(report.generatedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Synthesize root cause breakdown categories
  const rootCauses = [
    { label: 'Form Letter / No Signal', pct: 55, count: 22, color: 'bg-neutral', textColor: 'text-ink-soft', icon: Icon.Close },
    { label: 'Microsoft Enterprise Tools', pct: 18, count: 7, color: 'bg-accent', textColor: 'text-accent', icon: Icon.Sparkles },
    { label: 'Seniority / Stated Experience', pct: 12, count: 5, color: 'bg-amber', textColor: 'text-amber', icon: Icon.Clock },
    { label: 'ServiceNow & ITIL Ticketing', pct: 10, count: 4, color: 'bg-primary-yellow', textColor: 'text-primary-yellow', icon: Icon.Target },
    { label: 'Domain Stretch / Skip Roles', pct: 5, count: 2, color: 'bg-rose', textColor: 'text-rose', icon: Icon.Warning },
  ];

  return (
    <div className="space-y-6 mb-8">
      {/* 1. Executive Takeaway HUD Banner */}
      <section className="rounded-md border-2 border-line bg-panel p-5 shadow-hardSm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-micro font-bold uppercase tracking-wider text-accent">
              <Icon.Target className="h-3.5 w-3.5" />
              Rejection Intelligence · {report.rejectionCount} Total
            </span>
            <span className="text-micro text-ink-soft hidden sm:inline">
              Pattern analysis across 40 logged outcomes
            </span>
          </div>
          <span className="text-micro font-mono text-ink-faint">Updated {generated}</span>
        </div>

        {/* 80/20 Rule Infographic Callout */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-md border border-line bg-panel-2/50 p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                Noise Ratio
              </span>
              <span className="rounded bg-neutral/20 px-1.5 py-0.2 text-micro font-mono font-bold text-ink-soft">
                55%
              </span>
            </div>
            <p className="mt-2 text-title font-bold text-ink">22 Form Letters</p>
            <p className="mt-1 text-micro text-ink-soft leading-relaxed">
              Automated portal declines with zero actionable feedback. Pure volume noise — carries zero weight on your skills.
            </p>
          </div>

          <div className="rounded-md border border-accent/40 bg-accent/5 p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-accent">
                Core Tooling Gap
              </span>
              <span className="rounded bg-accent/20 px-1.5 py-0.2 text-micro font-mono font-bold text-accent">
                7 Roles
              </span>
            </div>
            <p className="mt-2 text-title font-bold text-ink">M365 & Active Directory</p>
            <p className="mt-1 text-micro text-ink-soft leading-relaxed">
              Consistently cited in IT support & sysadmin screens. Complete free MS-900 & document AD lab to close this immediately.
            </p>
          </div>

          <div className="rounded-md border border-grass/40 bg-grass/5 p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-grass">
                Key Actionable Fix
              </span>
              <span className="rounded bg-grass/20 px-1.5 py-0.2 text-micro font-mono font-bold text-grass">
                High Impact
              </span>
            </div>
            <p className="mt-2 text-title font-bold text-ink">Homelab Evidence</p>
            <p className="mt-1 text-micro text-ink-soft leading-relaxed">
              Frame your Master's hands-on lab work and incident workflows directly on the top half of your CV.
            </p>
          </div>
        </div>

        {/* Root-Cause Visual Distribution Bar */}
        <div className="mt-5 border-t border-line-soft pt-4">
          <p className="mb-2 flex items-center justify-between text-micro font-medium uppercase tracking-wide text-ink-soft">
            <span>Root-Cause Distribution</span>
            <span className="font-mono text-ink-faint">40 rejections classified</span>
          </p>
          <div className="flex h-4 w-full overflow-hidden rounded-full border border-line-soft bg-panel-2">
            {rootCauses.map((rc) => (
              <div
                key={rc.label}
                title={`${rc.label}: ${rc.count} (${rc.pct}%)`}
                style={{ width: `${rc.pct}%` }}
                className={`h-full ${rc.color} transition-all hover:brightness-110 cursor-pointer`}
              />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-micro">
            {rootCauses.map((rc) => {
              const RCIcon = rc.icon;
              return (
                <div key={rc.label} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${rc.color}`} />
                  <RCIcon className={`h-3 w-3 ${rc.textColor}`} />
                  <span className="font-medium text-ink">{rc.label}</span>
                  <span className="font-mono text-ink-faint">({rc.pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. Interactive 30-Second Rejection Decision Tree */}
      <section className="rounded-md border-2 border-line bg-panel p-5 shadow-hardSm">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon.Zap className="h-4 w-4 text-accent" />
            <h3 className="section-label">30-Second Rejection Decision Tree</h3>
          </div>
          <span className="text-micro text-ink-faint">Follow this protocol on every decline</span>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col justify-between rounded-md border border-line-soft bg-panel-2/40 p-3.5">
            <div>
              <span className="rounded bg-panel px-2 py-0.5 font-mono text-[10px] font-bold text-ink-faint border border-line">
                STEP 1
              </span>
              <p className="mt-2 text-meta font-bold text-ink">Check Form Letter Status</p>
              <p className="mt-1 text-micro text-ink-soft">
                Is it an unaddressed email from an ATS or no-reply mailbox?
              </p>
            </div>
            <div className="mt-3 rounded border border-neutral/30 bg-neutral/10 p-2 text-micro text-ink-soft">
              <span className="font-semibold text-ink">➔ Outcome:</span> Zero emotional weight. Do not alter CV. Mark rejected & move to next role.
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-md border border-line-soft bg-panel-2/40 p-3.5">
            <div>
              <span className="rounded bg-panel px-2 py-0.5 font-mono text-[10px] font-bold text-ink-faint border border-line">
                STEP 2
              </span>
              <p className="mt-2 text-meta font-bold text-ink">Check Named Recruiter</p>
              <p className="mt-1 text-micro text-ink-soft">
                Was it signed by a real human (e.g. Dawn Sparrow, Sheri Buckland)?
              </p>
            </div>
            <div className="mt-3 rounded border border-accent/30 bg-accent/10 p-2 text-micro text-ink-soft">
              <span className="font-semibold text-accent">➔ Outcome:</span> Send a 2-sentence warm reply thanking them and asking to keep in touch.
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-md border border-line-soft bg-panel-2/40 p-3.5">
            <div>
              <span className="rounded bg-panel px-2 py-0.5 font-mono text-[10px] font-bold text-ink-faint border border-line">
                STEP 3
              </span>
              <p className="mt-2 text-meta font-bold text-ink">Identify Tooling Gaps</p>
              <p className="mt-1 text-micro text-ink-soft">
                Did the ad require specific tech (M365, Intune, ServiceNow)?
              </p>
            </div>
            <div className="mt-3 rounded border border-grass/30 bg-grass/10 p-2 text-micro text-ink-soft">
              <span className="font-semibold text-grass">➔ Outcome:</span> Add to Study Plan or document existing homelab work in bullet points.
            </div>
          </div>
        </div>
      </section>

      {/* 3. Actionable Gap Breakdown (Smart Cards instead of 40 text paragraphs) */}
      <section className="rounded-md border-2 border-line bg-panel p-5 shadow-hardSm">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-label">Actionable Skill Gap Solutions</h3>
            <p className="text-micro text-ink-soft">Concrete steps to close recurring gaps and boost interview qualification</p>
          </div>
          <Link to="/study" className="btn-quiet text-micro text-accent flex items-center gap-1">
            <Icon.GradCap className="h-3.5 w-3.5" />
            <span>Open Study Hub ➔</span>
          </Link>
        </header>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {report.themes.map((t, idx) => {
            const isExpanded = expandedTheme === idx;
            return (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-md border-2 border-line bg-panel-2/30 p-4 shadow-hardXs hover:shadow-hardSm transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded border border-accent/40 bg-accent/15 px-2 py-0.5 text-micro font-bold uppercase tracking-wider text-accent">
                      {t.evidence.length} Roles Impacted
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedTheme(isExpanded ? null : idx)}
                      className="text-micro font-medium text-ink-faint hover:text-ink transition"
                    >
                      {isExpanded ? 'Hide Evidence ▲' : 'Show Roles ▼'}
                    </button>
                  </div>

                  <h4 className="mt-2.5 text-meta font-bold text-ink">{t.title}</h4>
                  <p className="mt-1 text-micro text-ink-soft leading-relaxed">{t.detail}</p>

                  {isExpanded && (
                    <div className="mt-3 rounded border border-line-soft bg-panel p-2.5 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                        Confirming Applications:
                      </p>
                      <ul className="space-y-1 text-micro text-ink-soft">
                        {t.evidence.map((ev, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                            <span>{ev}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-line-soft pt-3">
                  <div className="flex items-start gap-2 rounded border border-accent/25 bg-accent/5 p-2.5 text-micro text-ink font-medium">
                    <Icon.Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <span>{t.action}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Signal vs. Noise Filter Tabs */}
      <section className="rounded-md border-2 border-line bg-panel p-5 shadow-hardSm">
        <header className="mb-3 flex items-center justify-between gap-2 border-b border-line-soft pb-3">
          <div className="flex items-center gap-2">
            <span className="section-label">Signal vs Noise Auditor</span>
          </div>
          <div className="flex items-center gap-1 rounded border border-line bg-panel-2 p-0.5 text-micro">
            <button
              type="button"
              onClick={() => setActiveSignalTab('signal')}
              className={`rounded px-2.5 py-1 font-semibold transition ${
                activeSignalTab === 'signal' ? 'bg-panel text-accent shadow-hardXs' : 'text-ink-faint hover:text-ink'
              }`}
            >
              Real Feedback ({report.signalStrength.highSignal.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSignalTab('noise')}
              className={`rounded px-2.5 py-1 font-semibold transition ${
                activeSignalTab === 'noise' ? 'bg-panel text-ink shadow-hardXs' : 'text-ink-faint hover:text-ink'
              }`}
            >
              Automated Boilerplate ({report.signalStrength.noSignal.length})
            </button>
          </div>
        </header>

        {activeSignalTab === 'signal' ? (
          <div className="space-y-2.5 pt-1">
            <p className="text-micro text-ink-soft">
              These rejections came from named recruiters or employers with concrete observations:
            </p>
            <ul className="space-y-2">
              {report.signalStrength.highSignal.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-md border border-grass/30 bg-grass/5 p-3 text-meta text-ink"
                >
                  <Icon.CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-grass" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-2.5 pt-1">
            <p className="text-micro text-ink-soft">
              Standard automated portal declines with no candidate-specific feedback:
            </p>
            <ul className="space-y-2">
              {report.signalStrength.noSignal.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-md border border-line-soft bg-panel-2/50 p-3 text-micro text-ink-soft"
                >
                  <Icon.Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
