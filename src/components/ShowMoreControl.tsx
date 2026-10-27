interface Props {
  total: number;
  visible: number;
  onShowMore: () => void;
  onShowAll: () => void;
  onShowFewer: () => void;
  variant?: 'wide' | 'column';
  className?: string;
  step?: number;
}

/**
 * Accessible "Show more" control for the applications pipeline list.
 * Renders only when more than `step` (default 6) items exist in the filtered list.
 * Applies across Card, Table, and Board column views in all four visual themes.
 */
export function ShowMoreControl({
  total,
  visible,
  onShowMore,
  onShowAll,
  onShowFewer,
  variant = 'wide',
  className = '',
  step = 6,
}: Props) {
  if (total <= step) return null;

  const isAllShown = visible >= total;
  const shownCount = Math.min(visible, total);

  if (variant === 'column') {
    return (
      <div className={`flex flex-col items-center gap-2 pt-3 pb-2 text-center w-full ${className}`}>
        <span className="text-micro text-ink-faint" aria-live="polite">
          Showing {shownCount} of {total}
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!isAllShown ? (
            <>
              <button
                type="button"
                aria-expanded={false}
                onClick={onShowMore}
                className="btn-quiet min-h-[44px] px-3 py-2 text-micro"
              >
                Show 6 more
              </button>
              <button
                type="button"
                onClick={onShowAll}
                className="btn-quiet min-h-[44px] px-3 py-2 text-micro"
              >
                Show all
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-expanded={true}
              onClick={onShowFewer}
              className="btn-quiet min-h-[44px] px-3 py-2 text-micro"
            >
              Show fewer
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 pt-4 pb-2 ${className}`}>
      <span className="text-micro text-ink-faint" aria-live="polite">
        Showing {shownCount} of {total}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {!isAllShown ? (
          <>
            <button
              type="button"
              aria-expanded={false}
              onClick={onShowMore}
              className="btn-quiet min-h-[44px] px-4 py-2 text-micro"
            >
              Show 6 more
            </button>
            <button
              type="button"
              onClick={onShowAll}
              className="btn-quiet min-h-[44px] px-4 py-2 text-micro"
            >
              Show all
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-expanded={true}
            onClick={onShowFewer}
            className="btn-quiet min-h-[44px] px-4 py-2 text-micro"
          >
            Show fewer
          </button>
        )}
      </div>
    </div>
  );
}
