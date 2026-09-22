import { useMemo } from 'react';
import { daysUntil, type Application } from '../../types';

interface Props {
  apps: Application[];
  onOpenApp?: (app: Application) => void;
}

interface TickerItem {
  id: string;
  type: 'interview' | 'followup' | 'fit' | 'status' | 'server';
  company?: string;
  badge?: string;
  text: string;
  app?: Application;
}

export function LiveTicker({ apps, onOpenApp }: Props) {
  const items = useMemo(() => {
    const list: TickerItem[] = [];

    // 1. Upcoming Interviews
    const interviews = apps.filter((a) => a.status === 'interview');
    for (const app of interviews) {
      if (app.interview?.when) {
        const d = new Date(app.interview.when);
        const hoursLeft = Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60));
        const timeText = hoursLeft > 0 ? `in ${hoursLeft}h` : 'stage active';
        list.push({
          id: `int-${app.id}`,
          type: 'interview',
          company: app.company,
          badge: 'STAGE ACTIVE',
          text: `Interview ${timeText}`,
          app,
        });
      } else {
        list.push({
          id: `int-${app.id}`,
          type: 'interview',
          company: app.company,
          badge: 'INTERVIEW',
          text: 'Interview preparation underway',
          app,
        });
      }
    }

    // 2. Urgent Follow-ups
    const followUps = apps.filter((a) => a.followUpDue && a.status === 'applied');
    for (const app of followUps.slice(0, 3)) {
      const left = daysUntil(app.followUpDue);
      const hint = left !== null && left <= 0 ? 'due today' : `due in ${left}d`;
      list.push({
        id: `fu-${app.id}`,
        type: 'followup',
        company: app.company,
        badge: 'ACTION',
        text: `Follow-up ${hint}`,
        app,
      });
    }

    // 3. High ATS Fit / Match
    const highFit = apps
      .filter((a) => a.analysis?.score?.overall && a.analysis.score.overall >= 80)
      .sort((a, b) => (b.analysis?.score?.overall ?? 0) - (a.analysis?.score?.overall ?? 0))
      .slice(0, 3);
    for (const app of highFit) {
      list.push({
        id: `fit-${app.id}`,
        type: 'fit',
        company: app.company,
        badge: `${app.analysis?.score?.overall}% ATS MATCH`,
        text: `${app.role} analysis verified`,
        app,
      });
    }

    // 4. Overall Pipeline Pulse
    const inFlight = apps.filter(
      (a) => a.status === 'applied' || a.status === 'interview' || a.status === 'offer'
    ).length;
    list.push({
      id: 'stat-inflight',
      type: 'status',
      badge: `${inFlight} IN-FLIGHT`,
      text: `${apps.length} total opportunities in database`,
    });

    // 5. Production Node
    list.push({
      id: 'production-node',
      type: 'server',
      badge: 'NODE:5178',
      text: 'Production daemon online',
    });

    return list;
  }, [apps]);

  // Duplicate items for continuous seamless loop
  const duplicated = useMemo(() => [...items, ...items], [items]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-panel/60 backdrop-blur-md py-2.5 px-4 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
      <div className="flex items-center gap-4">
        {/* Fixed Left Live Beacon */}
        <div className="flex shrink-0 items-center gap-2 pr-3 border-r border-line-soft/60">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] font-bold font-mono tracking-wider uppercase text-ink-soft">
            Live Feed
          </span>
        </div>

        {/* Marquee Glide Track */}
        <div className="ticker-marquee-track w-full">
          <div className="ticker-marquee-run">
            {duplicated.map((item, idx) => (
              <div
                key={`${item.id}-${idx}`}
                onClick={() => item.app && onOpenApp?.(item.app)}
                className={`inline-flex items-center gap-2 text-xs font-sans whitespace-nowrap transition-colors ${
                  item.app
                    ? 'cursor-pointer hover:text-accent group/ticker'
                    : 'cursor-default'
                }`}
              >
                {/* Prefix Glyph */}
                <span className="text-accent/70 text-[10px]">✦</span>

                {item.company && (
                  <span className="font-semibold text-ink group-hover/ticker:text-accent transition-colors">
                    @{item.company}
                  </span>
                )}

                {item.badge && (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-bold tracking-wide uppercase ${
                      item.type === 'interview'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                        : item.type === 'followup'
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                        : item.type === 'fit'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                <span className="text-ink-soft text-[12px]">{item.text}</span>

                {/* Asterisk Divider */}
                <span className="text-ink-faint/40 text-[9px] ml-2">✻</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
