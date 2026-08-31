import { companyHue, companyInitials } from '../lib/companyAvatar';

interface Props {
  name: string;
  /** The job board a listing was pulled from (`Application.source`). When it
   *  matches a known platform, that platform's own logo replaces the
   *  initials monogram entirely (28 Aug 2026, on request) — otherwise falls
   *  back to the hash-based monogram below. */
  source?: string;
  className?: string;
}

/** Known platform logos, keyed by the exact `source` string this app writes
 *  (see the "Source" dropdown in EditModal). Add a file under
 *  public/source-logos/ and a line here for any other platform. */
const SOURCE_LOGO: Record<string, string> = {
  Seek: '/source-logos/seek.png',
  LinkedIn: '/source-logos/linkedin.jpg',
};

/** A small identity monogram per company — same treatment as Slack/Linear
 *  channel avatars. Purely local (hash-based), no company-logo fetch: the
 *  data model has no reliable company domain. */
export function CompanyAvatar({ name, source, className = 'h-9 w-9 text-meta' }: Props) {
  const logo = source ? SOURCE_LOGO[source] : undefined;
  if (logo) {
    return (
      // Ring, not the logo itself, fixes dark-mode visibility: Seek's navy
      // circle otherwise has no edge against a near-black panel. `--line`
      // already flips to a light tone in dark mode (see index.css), so one
      // border does it for any logo, not just this one.
      <img
        src={logo}
        alt={`${source} listing`}
        className={`shrink-0 rounded-full border border-line/60 object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`company-mono inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}
      style={{ '--mono-hue': companyHue(name) } as React.CSSProperties}
      aria-hidden="true"
    >
      {companyInitials(name)}
    </span>
  );
}
