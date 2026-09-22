/** Deterministic per-company identity: same name always gets the same hue and
 *  initials, with no lookup, no network request, and no dependency on a
 *  domain field the data model doesn't reliably have. */

export function companyInitials(name: string): string {
  // Company names in this tracker often carry a parenthetical qualifier —
  // "Randstad (unnamed central government agency client)", "Safeworx (part
  // of +IMPAC Group)" — which used to become the "second word" and hand back
  // its first character (a bare "(") as half the monogram. Strip it before
  // splitting so initials always come from the actual company name.
  const primary = name.replace(/\s*\(.*$/, '').trim() || name.trim();
  const words = primary.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function companyHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}
