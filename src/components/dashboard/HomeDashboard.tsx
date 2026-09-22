import { useRef } from 'react';
import { useGSAP, prefersReducedMotion, gsap } from '../../lib/gsapSetup';
import { LiveTicker } from './LiveTicker';
import { MissionBriefingTile } from './MissionBriefingTile';
import { TacticalMatrixTile } from './TacticalMatrixTile';
import { FunnelRadarTile } from './FunnelRadarTile';
import { InterviewSpotlightTile } from './InterviewSpotlightTile';
import { UrgentRadarTile } from './UrgentRadarTile';
import { CommandDockTile } from './CommandDockTile';
import { Icon } from '../Icons';
import type { Application } from '../../types';

interface Props {
  apps: Application[];
  notionOn: boolean;
  notionError: string | null;
  onOpenApp: (app: Application) => void;
  onAddNew: () => void;
  onGmailFetch: () => void;
  onOpenTerminal: () => void;
  onGoToInsights: () => void;
  onOpenFolder?: (app: Application) => void;
  onSelectStage: (stage: string) => void;
  onSwitchToPipeline: () => void;
  onRefresh?: () => void;
  onReplayLoader?: () => void;
}

export function HomeDashboard({
  apps,
  notionOn,
  notionError,
  onOpenApp,
  onAddNew,
  onGmailFetch,
  onOpenTerminal,
  onGoToInsights,
  onOpenFolder,
  onSelectStage,
  onSwitchToPipeline,
  onRefresh,
  onReplayLoader,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Staggered fluid entrance animation with spring curve
  useGSAP(
    () => {
      if (!containerRef.current) return;
      if (prefersReducedMotion()) return;

      gsap.from(containerRef.current.querySelectorAll('.studio-tile'), {
        opacity: 0,
        y: 24,
        scale: 0.985,
        duration: 0.5,
        stagger: 0.06,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className="space-y-6">
      {/* 1. Real-Time Gliding Activity Marquee Ticker (plnty.app style) */}
      <LiveTicker apps={apps} onOpenApp={onOpenApp} />

      {/* 2. 12-Column Minimal Studio Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Row 1: Executive Overview & Quick Action Dock */}
        <MissionBriefingTile
          apps={apps}
          notionOn={notionOn}
          notionError={notionError}
          onSelectMetric={(metric) => {
            if (metric === 'attention') onSelectStage('applied');
            else onSelectStage(metric);
          }}
          onReplayLoader={onReplayLoader}
        />
        <CommandDockTile
          onAddNew={onAddNew}
          onGmailFetch={onGmailFetch}
          onOpenTerminal={onOpenTerminal}
          onGoToInsights={onGoToInsights}
        />

        {/* Row 2: Tactical Matrix & Active Interview Spotlight */}
        <TacticalMatrixTile
          apps={apps}
          onOpenApp={onOpenApp}
          onOpenTerminal={onOpenTerminal}
          onRefresh={onRefresh}
        />
        <InterviewSpotlightTile
          apps={apps}
          onOpenApp={onOpenApp}
          onOpenFolder={onOpenFolder}
        />

        {/* Row 3: Conversion Funnel & Closing Deadlines Action Radar */}
        <FunnelRadarTile apps={apps} onSelectStage={onSelectStage} />
        <UrgentRadarTile
          apps={apps}
          onOpenApp={onOpenApp}
          onSwitchToPipeline={onSwitchToPipeline}
          onAddNew={onAddNew}
        />
      </div>

      {/* 3. Floating Squircle Pipeline Jump Capsule */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-panel/80 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Icon.Board className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-ink font-sans">
              Looking for granular pipeline controls?
            </h4>
            <p className="text-xs text-ink-soft">
              Inspect all {apps.length} roles in Kanban Board, Dense Table, or Card view with stage filters.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSwitchToPipeline}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-xs font-mono font-bold uppercase tracking-wider text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 transition-all"
        >
          <span>Open Full Pipeline ({apps.length})</span>
          <Icon.Arrow className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
