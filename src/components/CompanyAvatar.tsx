import { companyHue, companyInitials } from '../lib/companyAvatar';

interface Props {
  name: string;
  /** The job board a listing was pulled from (`Application.source`). When it
   *  matches a known platform, that platform's own logo replaces the
   *  initials monogram entirely (28 Aug 2026, on request) — otherwise falls
   *  back to the hash-based monogram below. */
  source?: string;
  /** Optional tags on the application — if tagged SOT, displays the Summer of Tech logo. */
  tags?: string[];
  /** Optional explicit logo image path */
  logo?: string;
  className?: string;
}

/** Known platform logos, keyed by the exact `source` string this app writes
 *  (see the "Source" dropdown in EditModal). Add a file under
 *  public/source-logos/ and a line here for any other platform. */
const SOURCE_LOGO: Record<string, string> = {
  Seek: '/source-logos/seek.png',
  LinkedIn: '/source-logos/linkedin.jpg',
  'Summer of Tech': '/source-logos/sot.svg',
  SOT: '/source-logos/sot.svg',
};

/** A small identity monogram per company — same treatment as Slack/Linear
 *  channel avatars. Replaced with platform/programme logo when source or tag is known. */
export function CompanyAvatar({
  name,
  source,
  tags,
  logo: explicitLogo,
  className = 'h-9 w-9 text-meta',
}: Props) {
  const isSot =
    source === 'Summer of Tech' ||
    source === 'SOT' ||
    tags?.some((t) => t.toUpperCase() === 'SOT' || t.toLowerCase().includes('summer of tech'));

  const logo =
    explicitLogo ||
    (isSot ? '/source-logos/sot.svg' : source ? SOURCE_LOGO[source] : undefined);

  if (logo) {
    return (
      <img
        src={logo}
        alt={isSot ? 'Summer of Tech listing' : `${source} listing`}
        className={`shrink-0 rounded-full border border-line/60 ${
          isSot ? 'bg-white p-1 object-contain' : 'object-cover'
        } ${className}`}
        onError={(e) => {
          if (isSot) {
            (e.currentTarget as HTMLImageElement).src =
              'https://app.summeroftech.co.nz/assets/sot/logo-f5694b7b.svg';
          }
        }}
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
