/**
 * Zero-CLS Dashboard Skeleton
 * Renders an exact geometric placeholder for the dashboard during cold data fetch,
 * ensuring zero Cumulative Layout Shift (CLS) when application data resolves.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      {/* Urgency & Events HUD banner skeleton */}
      <div className="rounded-2xl border border-line-soft/60 bg-panel/60 p-4 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-panel-2" />
          <div className="space-y-2 flex-1 max-w-md">
            <div className="h-3.5 w-1/3 rounded bg-panel-2" />
            <div className="h-2.5 w-2/3 rounded bg-panel-2" />
          </div>
        </div>
        <div className="h-7 w-20 rounded-full bg-panel-2 shrink-0 hidden sm:block" />
      </div>

      {/* Pipeline tabs strip skeleton */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <div className="h-8 w-24 rounded-full bg-panel-2 shrink-0" />
        <div className="h-8 w-20 rounded-full bg-panel-2 shrink-0" />
        <div className="h-8 w-24 rounded-full bg-panel-2 shrink-0" />
        <div className="h-8 w-20 rounded-full bg-panel-2 shrink-0" />
        <div className="h-8 w-28 rounded-full bg-panel-2 shrink-0" />
      </div>

      {/* Search and control bar skeleton */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 flex-1 min-w-[220px] rounded-xl bg-panel-2" />
        <div className="h-10 w-24 rounded-full bg-panel-2 shrink-0" />
      </div>

      {/* Card list skeleton */}
      <div className="border-t border-line-soft">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex items-start gap-4 border-b border-line-soft px-4 py-5"
          >
            <div className="h-10 w-10 shrink-0 rounded-2xl bg-panel-2" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="h-4.5 w-2/5 rounded bg-panel-2" />
              <div className="h-3.5 w-3/5 rounded bg-panel-2" />
              <div className="flex items-center gap-2 pt-1">
                <div className="h-5 w-16 rounded-md bg-panel-2" />
                <div className="h-5 w-20 rounded-md bg-panel-2" />
              </div>
            </div>
            <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
              <div className="h-6 w-24 rounded-full bg-panel-2" />
              <div className="h-3 w-16 rounded bg-panel-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
