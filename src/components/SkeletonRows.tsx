/**
 * Placeholder rows shaped like `AppCard` at rest, shown only during the
 * initial fetch. Replaces the plain "Loading applications…" string — on a
 * local app the load is usually under a second, but a shaped placeholder
 * still reads as "the page is arriving" rather than "nothing loaded".
 */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="animate-pulse border-t border-line-soft" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-line-soft px-4 py-5 last:border-b-0">
          <div className="h-9 w-9 shrink-0 rounded-full bg-panel-2" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-panel-2" />
            <div className="h-3 w-1/2 rounded bg-panel-2" />
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <div className="h-6 w-20 rounded-full bg-panel-2" />
            <div className="h-6 w-16 rounded-full bg-panel-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Same "shaped, not blank" idea as SkeletonRows for the non-list surfaces
 * that previously fell back to a bare "Loading…" string — Study's guide
 * pack and RoleDetail. A handful of panel-shaped bars is enough to signal
 * "arriving" without describing content that doesn't exist yet.
 */
export function SkeletonPanels({ count = 3 }: { count?: number }) {
  return (
    <div className="animate-pulse space-y-6" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel space-y-3 px-5 py-4">
          <div className="h-4 w-1/3 rounded bg-panel-2" />
          <div className="h-3 w-2/3 rounded bg-panel-2" />
          <div className="h-3 w-1/2 rounded bg-panel-2" />
        </div>
      ))}
    </div>
  );
}
