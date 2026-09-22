import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateContent, GEMINI_MODELS } from './ai-models.js';

function reply(text) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}
const overloaded = { ok: false, status: 503, text: async () => 'model overloaded' };

test('generateContent: returns the first model that answers', async () => {
  const tried = [];
  const res = await generateContent({
    parts: [{ text: 'hi' }],
    apiKey: 'K',
    fetchImpl: async (url) => {
      tried.push(url.split('/models/')[1].split(':')[0]);
      return reply('answer');
    },
  });
  assert.equal(res.text, 'answer');
  assert.equal(res.model, GEMINI_MODELS[0]);
  assert.deepEqual(tried, [GEMINI_MODELS[0]], 'must not call further models once one succeeds');
});

// The whole reason this list exists: 503 "model overloaded" is common enough
// that 4 of 18 CV drafts in production had to fall through past the first
// choice. This is the behaviour the three Telegram call sites used to lack.
test('generateContent: walks past 503s and reports which model answered', async () => {
  const tried = [];
  const res = await generateContent({
    parts: [{ text: 'hi' }],
    apiKey: 'K',
    fetchImpl: async (url) => {
      const model = url.split('/models/')[1].split(':')[0];
      tried.push(model);
      return model === GEMINI_MODELS[2] ? reply('recovered') : overloaded;
    },
  });
  assert.equal(res.text, 'recovered');
  assert.equal(res.model, GEMINI_MODELS[2], 'caller must be able to see the fallback happened');
  assert.deepEqual(tried, GEMINI_MODELS.slice(0, 3));
});

test('generateContent: throws the last error only when every model fails', async () => {
  await assert.rejects(
    generateContent({ parts: [{ text: 'hi' }], apiKey: 'K', fetchImpl: async () => overloaded }),
    /HTTP 503/
  );
});

test('generateContent: a thrown network error does not stop the walk', async () => {
  const res = await generateContent({
    parts: [{ text: 'hi' }],
    apiKey: 'K',
    fetchImpl: async (url) => {
      if (url.includes(GEMINI_MODELS[0])) throw new Error('ECONNRESET');
      return reply('ok');
    },
  });
  assert.equal(res.text, 'ok');
});

test('generateContent: requires an api key and parts', async () => {
  await assert.rejects(generateContent({ parts: [{ text: 'x' }], apiKey: '' }), /GEMINI_API_KEY/);
  await assert.rejects(generateContent({ parts: [], apiKey: 'K' }), /parts is required/);
});
