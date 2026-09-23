import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AdminApiClient, AdminApiError, adminApiErrorPayload } from '../../src/admin/client';
import { restoreFetch, stubFetch } from './fixtures';

async function expectApiError(promise: Promise<unknown>): Promise<AdminApiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof AdminApiError, `AdminApiError erwartet, bekommen: ${String(error)}`);
    return error;
  }
  throw new Error('Erwarteter AdminApiError wurde nicht geworfen');
}

describe('AdminApiClient', () => {
  const client = new AdminApiClient({ baseUrl: 'http://127.0.0.1:8124/', token: 'secret-token' });

  afterEach(restoreFetch);

  it('sends GET with bearer token, Accept header and query parameters under /api/admin/v1', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { data: [] } }));

    const result = await client.get('/cancellation-requests', { status: 'all', page: 2, per_page: 25, unused: undefined });

    assert.deepEqual(result, { data: [] });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.origin + url.pathname, 'http://127.0.0.1:8124/api/admin/v1/cancellation-requests');
    assert.deepEqual(Object.fromEntries(url.searchParams), { status: 'all', page: '2', per_page: '25' });
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].headers.Authorization, 'Bearer secret-token');
    assert.equal(calls[0].headers.Accept, 'application/json');
    assert.equal('Idempotency-Key' in calls[0].headers, false);
    assert.equal(calls[0].body, undefined);
  });

  it('sends POST with JSON body, Content-Type and a fresh Idempotency-Key per call', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { data: { id: 12 }, meta: { result: 'confirmed' } } }));

    await client.post('/cancellation-requests/12/confirmation', { admin_notes: 'ok' });
    await client.post('/cancellation-requests/12/confirmation', {});

    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].url, 'http://127.0.0.1:8124/api/admin/v1/cancellation-requests/12/confirmation');
    assert.equal(calls[0].headers.Authorization, 'Bearer secret-token');
    assert.equal(calls[0].headers['Content-Type'], 'application/json');
    assert.match(calls[0].headers['Idempotency-Key'], /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    assert.notEqual(calls[1].headers['Idempotency-Key'], calls[0].headers['Idempotency-Key']);
    assert.deepEqual(JSON.parse(calls[0].body ?? ''), { admin_notes: 'ok' });
  });

  it('uses a given Idempotency-Key unchanged', async () => {
    const calls = stubFetch(() => ({ status: 200, body: {} }));

    await client.post('/x', {}, { idempotencyKey: 'fixed-key' });

    assert.equal(calls[0].headers['Idempotency-Key'], 'fixed-key');
  });

  it('maps 401 to an error with status, body and a hint', async () => {
    stubFetch(() => ({ status: 401, body: { error: 'Token expired' } }));

    const error = await expectApiError(client.get('/cancellation-requests'));

    assert.equal(error.status, 401);
    assert.deepEqual(error.body, { error: 'Token expired' });
    assert.match(error.message, /HTTP 401/);
    assert.match(error.message, /Token expired \(Token abgelaufen/);
  });

  it('explains a 403 for a token whose owner is not a platform admin', async () => {
    stubFetch(() => ({ status: 403, body: { error: 'Token owner is not a platform admin' } }));

    const error = await expectApiError(client.get('/cancellation-requests'));

    assert.equal(error.status, 403);
    assert.match(error.message, /keinen Besitzer oder der Besitzer ist kein Plattform-Admin/);
  });

  it('maps 409 to the server message plus current status and exposes current_status in the payload', async () => {
    const body = { error: 'conflict', message: 'Die Anfrage hat bereits den Status „Abgelehnt“.', current_status: 'rejected', data: { id: 12 } };
    stubFetch(() => ({ status: 409, body }));

    const error = await expectApiError(client.post('/cancellation-requests/12/confirmation'));

    assert.equal(error.status, 409);
    assert.deepEqual(error.body, body);
    assert.match(error.message, /Die Anfrage hat bereits den Status „Abgelehnt“\.\nAktueller Status: rejected/);
    assert.doesNotMatch(error.message, /conflict/);
    assert.deepEqual(adminApiErrorPayload(error), { error: error.message, status: 409, current_status: 'rejected' });
  });

  it('maps 422 including field errors', async () => {
    const errors = { rejection_reason: ['Das Feld ist erforderlich.'] };
    stubFetch(() => ({ status: 422, body: { message: 'Validierung fehlgeschlagen.', errors } }));

    const error = await expectApiError(client.post('/cancellation-requests/12/rejection', {}));

    assert.equal(error.status, 422);
    assert.match(error.message, /Validierung fehlgeschlagen\.\nrejection_reason: Das Feld ist erforderlich\./);
    assert.deepEqual(adminApiErrorPayload(error).errors, errors);
  });

  it('keeps a non-JSON error body as text', async () => {
    stubFetch(() => ({ status: 500, body: '<html>Server Error</html>' }));

    const error = await expectApiError(client.get('/x'));

    assert.equal(error.status, 500);
    assert.equal(error.body, '<html>Server Error</html>');
  });

  it('reports a connection error with status 0', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:1') });
    }) as typeof fetch;

    const error = await expectApiError(client.get('/x'));

    assert.equal(error.status, 0);
    assert.match(error.message, /nicht erreichbar: fetch failed: connect ECONNREFUSED/);
  });

  it('aborts after the timeout and reports status 0', async () => {
    globalThis.fetch = ((_input: RequestInfo | URL, init: RequestInit = {}) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof fetch;
    const fastClient = new AdminApiClient({ baseUrl: 'http://127.0.0.1:1', token: 't', timeoutMs: 20 });

    // AbortSignal.timeout hält den Event-Loop nicht offen; ohne diesen Timer beendet node:test den Test zu früh.
    const keepAlive = setTimeout(() => undefined, 5_000);
    const error = await expectApiError(fastClient.get('/x')).finally(() => clearTimeout(keepAlive));

    assert.equal(error.status, 0);
    assert.match(error.message, /Zeitüberschreitung/);
  });
});
