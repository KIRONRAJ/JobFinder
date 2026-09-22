import { VIEW_META } from '../components/Sidebar';
import type { View } from '../types';

/**
 * Every valid view, path, and label used to be three lists kept in sync by
 * hand — the `View` union in types.ts, a `VALID_VIEWS` runtime array in
 * App.tsx, and `VIEW_META` in Sidebar.tsx. Only the type union remains
 * separate now (TypeScript has no way to derive a type from a runtime array);
 * everything else derives from `VIEW_META`.
 */

export function viewToPath(v: View): string {
  return VIEW_META.find((m) => m.key === v)?.path ?? '/';
}

export function pathToView(pathname: string): View | undefined {
  return VIEW_META.find((m) => m.path === pathname)?.key;
}

export const VALID_VIEWS: View[] = VIEW_META.map((m) => m.key);
