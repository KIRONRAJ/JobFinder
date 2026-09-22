// Builds a Content-Disposition header value safe for any filename, including
// non-Latin1 characters. `res.setHeader()` throws ERR_INVALID_CHAR on a raw
// non-Latin1 character (e.g. an en dash, U+2013) — HTTP header values must be
// Latin-1, so a filename containing one broke every PDF/docx preview whose
// generated name happened to include one (caught on a CV filename with
// "Engineer – Telecommunication", en dash). RFC 6266's `filename*` (RFC 5987
// percent-encoding) carries the real UTF-8 name; `filename` stays an
// ASCII-only fallback for clients that don't read `filename*`.
export function contentDispositionHeader(kind, filename) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/[\\"]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `${kind}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
