import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Pre-routing sessions kept "which view was open" in localStorage
 * (`view_mode`) and always landed on `/`. Now the URL owns that. This runs
 * once: if the user opens the app at the bare root and a `view_mode` from
 * before routing existed (or from the 10-view era before nav consolidation)
 * says they'd left it on, say, Board or Activity, land them at that view's
 * *current* location instead of silently discarding the context.
 *
 * A fixed map rather than deriving from `VIEW_META`: several of these keys
 * (`board`, `fit`, `evidence`, `market`, `analytics`, `audit`) no longer
 * exist as views at all post-consolidation, so there's nothing left to derive
 * from — this is the one place their old meaning still needs to be known.
 */
const LEGACY_VIEW_MODE_MAP: Record<string, string> = {
  list: '/',
  board: '/?layout=board',
  agenda: '/agenda',
  fit: '/insights?tab=skills',
  evidence: '/insights?tab=skills',
  market: '/insights?tab=skills',
  analytics: '/insights',
  audit: '/insights?tab=activity',
  insights: '/insights',
  companies: '/companies',
  recruiters: '/recruiters',
};

export function LegacyViewRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== '/') return;
    const saved = localStorage.getItem('view_mode');
    localStorage.removeItem('view_mode');
    const to = saved ? LEGACY_VIEW_MODE_MAP[saved] : undefined;
    if (!to || to === '/') return;
    navigate(to, { replace: true });
    // Runs once on mount only (empty deps, deliberately not `[location]`) —
    // reacting to every visit to `/` would fight the user's own navigation
    // back to the pipeline after this fires.
  }, []);

  return null;
}
