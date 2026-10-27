// Guard for the three places this app fetches a caller-supplied URL: the CV
// worker's job-ad scrape, the Telegram job-link ingest, and /api/jobs/parse.
//
// All three shell out to `curl -L` (or fetch) against whatever they are handed
// and echo the result back, which makes the server a proxy into anything it can
// reach — including its own API on loopback and every other host on the
// tailnet. Job ads live on the public internet; nothing legitimate here needs a
// private address.
//
// Scope: this blocks literal private addresses and obvious local names. It does
// NOT defeat DNS rebinding (a public hostname that resolves to a private IP),
// which would need resolve-then-pin-the-socket. Proportionate for a
// single-user tool where the caller is already authenticated.

const BLOCKED_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback', 'homeserver']);

export function isPrivateIPv4(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number);
  if (m.slice(1).map(Number).some((n) => n > 255)) return true; // malformed — refuse
  if (a === 0 || a === 127) return true; // this-host / loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT — the tailnet
  if (a >= 224) return true; // multicast / reserved
  return false;
}

export function isPrivateIPv6(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('fe80')) return true; // link-local
  if (/^f[cd]/.test(h)) return true; // unique local
  // IPv4-mapped addresses. WHATWG URL parsing normalises ::ffff:127.0.0.1 to
  // the hex form ::ffff:7f00:1, so both spellings have to be handled — the
  // dotted one never survives `new URL()`.
  const dotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return isPrivateIPv4(dotted[1]);
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const [hi, lo] = hex.slice(1).map((x) => parseInt(x, 16));
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return false;
}

/**
 * Returns the parsed URL when it is safe to fetch, or throws with a reason.
 * Callers that prefer to degrade quietly should catch and treat it as "no
 * content", which is what a failed scrape already looks like to them.
 */
export function assertFetchableUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new Error('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Refusing non-http(s) URL: ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`Refusing to fetch a local address: ${host}`);
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new Error(`Refusing to fetch a private address: ${host}`);
  }
  return url;
}

// curl follows redirects (-L), so a public page can bounce the request to
// 127.0.0.1, a tailnet host or a file:// URL after the first-hop check above.
// These args cap and constrain the hops, and the -w trailer reports where the
// request really ended up so guardCurlOutput() can discard anything fetched from
// a non-public place. Intermediate hops still receive a GET, but nothing from
// them is ever returned to the caller.
const TRAILER = '\n__JOBHQ_FINAL__';
export const SAFE_CURL_ARGS = [
  '-s', '-L',
  '--max-redirs', '3',
  '--proto', '=http,https',
  '--proto-redir', '=http,https',
  '--max-filesize', '5000000',
  '-w', `${TRAILER}%{url_effective} %{remote_ip}`,
];

/** Strips the -w trailer; returns '' when the final URL or peer IP is not public. */
export function guardCurlOutput(stdout) {
  const text = String(stdout ?? '');
  const i = text.lastIndexOf(TRAILER);
  if (i === -1) return text; // no trailer (e.g. a test double): nothing to check
  const body = text.slice(0, i);
  const [finalUrl, ip = ''] = text.slice(i + TRAILER.length).trim().split(' ');
  if (!isFetchableUrl(finalUrl)) return '';
  if (ip && (isPrivateIPv4(ip) || isPrivateIPv6(ip))) return '';
  return body;
}

/** Boolean form, for callers that just want to skip a bad URL silently. */
export function isFetchableUrl(rawUrl) {
  try {
    assertFetchableUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}
