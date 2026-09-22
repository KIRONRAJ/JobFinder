import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icons';
import { TabStrip } from '../components/TabStrip';
import { AnalyticsView } from '../components/AnalyticsView';
import { AnalysisView } from '../components/AnalysisView';
import { MarketView } from '../components/MarketView';
import { LearningLoopPanel } from '../components/LearningLoopPanel';
import { LearningLoopReportPanel } from '../components/LearningLoopReportPanel';
import { UpskillReportPanel } from '../components/UpskillReportPanel';
import { WeeklyDigestPanel } from '../components/WeeklyDigestPanel';
import type { Application } from '../types';

type Tab = 'pipeline' | 'skills' | 'learning' | 'activity';

const TABS: { key: Tab; label: string; icon: (p: { className?: string }) => JSX.Element }[] = [
  { key: 'pipeline', label: 'Pipeline', icon: Icon.Chart },
  { key: 'skills', label: 'Skills', icon: Icon.Sparkles },
  { key: 'learning', label: 'Learning', icon: Icon.Target },
  { key: 'activity', label: 'Activity', icon: Icon.Clock },
];

interface Props {
  apps: Application[];
  onOpenTerminal: () => void;
}

/**
 * Four former nav items collapsed into one page — Analytics, Fit & keywords,
 * Market map, and Activity. None of them aggregate role-by-role the way
 * Pipeline/Board/Agenda do; they're all variations on "what does my search
 * data say", so they share a page and a tab strip instead of four sidebar
 * slots. Nothing here is new UI — every panel is reused exactly as it
 * rendered in its old standalone view.
 */
export function Insights({ apps, onOpenTerminal }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = (searchParams.get('tab') as Tab) || 'pipeline';

  const setTab = (t: Tab) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === 'pipeline') next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true }
    );

  return (
    <div>
      <TabStrip
        items={TABS}
        active={tab}
        onPick={setTab}
        ariaLabel="Insights section"
      />

      {tab === 'pipeline' && <AnalyticsView apps={apps} />}

      {tab === 'skills' && (
        <div className="space-y-8">
          <MarketView apps={apps} onOpenTerminal={onOpenTerminal} />
          <AnalysisView apps={apps} />
        </div>
      )}

      {/* Learning Loop used to be buried inside "Activity", reading as a line
          in a changelog rather than the standing routine it actually is. */}
      {tab === 'learning' && (
        <div>
          <LearningLoopReportPanel />
          <UpskillReportPanel />
          <LearningLoopPanel apps={apps} />
        </div>
      )}

      {/* The raw event log used to sit under this digest. It moved to
          Settings → Audit log (Sep 2026) with real filters — it's a tracing
          surface, not a read on how the search is going, and the two were
          reading as one thing here. */}
      {tab === 'activity' && (
        <div>
          <WeeklyDigestPanel apps={apps} />
        </div>
      )}
    </div>
  );
}
