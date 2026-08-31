/**
 * navigator.clipboard requires a secure context (https or localhost) — this
 * app is also reachable over plain http via Tailscale (100.122.103.6:5177),
 * where navigator.clipboard is undefined and the modern API silently can't
 * run at all. Falls back to the legacy execCommand('copy') textarea trick,
 * which still works over http.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path below
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
