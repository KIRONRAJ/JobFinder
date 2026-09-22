// Loaded via --import in the `test` script. Fails any test that reaches the
// real network instead of injecting a fetch stub.
//
// Added 15 Sep 2026 while moving the Telegram transport from curl to fetch:
// the old tests mocked `execFileImpl`, so a call site still passing that name
// silently fell through to real fetch. This caught seven of them — including
// calls to api.telegram.org carrying a live-looking bot token.
globalThis.fetch = async (url) => {
  const safe = String(url).replace(/bot[^/]+/, 'bot<redacted>');
  throw new Error(
    `Test reached the network: ${safe}\n` +
      'Pass a fetchImpl stub instead of letting the call hit the real API.'
  );
};
