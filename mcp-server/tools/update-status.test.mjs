import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateStatus } from './update-status.js';

test('updateStatus PATCHes the API and returns the updated entry on success', async () => {
  let capturedUrl, capturedOptions;
  const fakeFetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { ok: true, json: async () => ({ id: 'app_1', status: 'applied' }) };
  };

  const result = await updateStatus({
    id: 'app_1',
    status: 'applied',
    apiBase: 'http://localhost:5178',
    token: 'test-token-value',
    fetchImpl: fakeFetch,
  });

  assert.equal(capturedUrl, 'http://localhost:5178/api/applications/app_1');
  assert.equal(capturedOptions.method, 'PATCH');
  assert.equal(capturedOptions.headers.Authorization, 'Bearer test-token-value');
  assert.deepEqual(JSON.parse(capturedOptions.body), { status: 'applied' });
  assert.equal(result.isError, false);
  assert.match(result.text, /"status": "applied"/);
});

test('updateStatus includes notes in the request body when provided', async () => {
  let capturedOptions;
  const fakeFetch = async (_url, options) => {
    capturedOptions = options;
    return { ok: true, json: async () => ({ id: 'app_1', status: 'applied', notes: 'hi' }) };
  };

  await updateStatus({
    id: 'app_1',
    status: 'applied',
    notes: 'hi',
    apiBase: 'http://localhost:5178',
    token: 'test-token-value',
    fetchImpl: fakeFetch,
  });

  assert.equal(capturedOptions.headers.Authorization, 'Bearer test-token-value');
  assert.deepEqual(JSON.parse(capturedOptions.body), { status: 'applied', notes: 'hi' });
});

test('updateStatus surfaces the API error message on a non-2xx response', async () => {
  let capturedOptions;
  const fakeFetch = async (_url, options) => {
    capturedOptions = options;
    return {
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid status: must be one of researching, applied' }),
    };
  };

  const result = await updateStatus({
    id: 'app_1',
    status: 'bogus',
    apiBase: 'http://localhost:5178',
    token: 'test-token-value',
    fetchImpl: fakeFetch,
  });

  assert.equal(capturedOptions.headers.Authorization, 'Bearer test-token-value');
  assert.equal(result.isError, true);
  assert.match(result.text, /Invalid status/);
});

test('updateStatus returns a clear message when the server is unreachable', async () => {
  const fakeFetch = async () => {
    throw new Error('fetch failed');
  };

  const result = await updateStatus({
    id: 'app_1',
    status: 'applied',
    apiBase: 'http://localhost:5178',
    token: 'test-token-value',
    fetchImpl: fakeFetch,
  });

  assert.equal(result.isError, true);
  assert.match(result.text, /isn't running on http:\/\/localhost:5178/);
});

test('updateStatus omits the Authorization header when no token is given', async () => {
  let capturedOptions;
  const fakeFetch = async (_url, options) => {
    capturedOptions = options;
    return { ok: true, json: async () => ({ id: 'app_1', status: 'applied' }) };
  };

  await updateStatus({
    id: 'app_1',
    status: 'applied',
    apiBase: 'http://localhost:5178',
    fetchImpl: fakeFetch,
  });

  assert.equal(capturedOptions.headers.Authorization, undefined);
});
