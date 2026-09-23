import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EXIT_API, EXIT_OK, EXIT_USAGE, executeKuendigungen } from '../../src/commands/kuendigungen';
import { createPalette } from '../../src/admin/cancellation-format';
import { cancellationDetail, restoreFetch, stubFetch } from './fixtures';

const ENV = { LERNPLATTFORM_BASE_URL: 'http://127.0.0.1:8124', LERNPLATTFORM_ADMIN_TOKEN: 'secret-token' };

async function execute(argv: string[], env: NodeJS.ProcessEnv = ENV) {
  const out: string[] = [];
  const err: string[] = [];
  const exitCode = await executeKuendigungen(argv, {
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    env,
    palette: createPalette(false),
  });
  return { exitCode, stdout: out.join('\n'), stderr: err.join('\n') };
}

function lastStderrJson(stderr: string): Record<string, unknown> {
  return JSON.parse(stderr.slice(stderr.indexOf('{')));
}

describe('lernplattform kuendigungen', () => {
  afterEach(restoreFetch);

  it('list renders a table with short warning codes and the paging footer', async () => {
    const calls = stubFetch(() => ({
      status: 200,
      body: {
        data: [
          {
            id: 3, type: 'ordentlich', type_label: 'Ordentliche Kündigung', status: 'pending', status_label: 'Ausstehend',
            received_at: '2026-09-01T10:00:00+02:00', age_days: 22, effective_date: '2026-12-01',
            participant_name: 'Max Muster', participant_email: 'max@example.com', pass_name: 'IT-Pass 12 Monate',
            payment_mode: 'one_time',
            warnings: [{ code: 'pending_longer_than_14_days', message: '…' }, { code: 'refund_based_on_catalog_price', message: '…' }],
          },
        ],
        meta: { current_page: 1, last_page: 2, per_page: 1, total: 2, status: 'pending' },
      },
    }));

    const result = await execute(['list', '--per-page=1']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.equal(new URL(calls[0].url).search, '?status=pending&per_page=1');
    assert.match(result.stdout, /#3\s+01\.09\.2026\s+22 T\s+Max Muster\s+IT-Pass 12 Monate/);
    assert.match(result.stdout, /offen>14d, katalogpreis/);
    assert.match(result.stdout, /Seite 1 von 2 · 2 Anfragen gesamt · Status: pending · weiter mit --page 2/);
    assert.match(result.stderr, /^Ziel: http:\/\/127\.0\.0\.1:8124 \(LERNPLATTFORM_BASE_URL, Token für production\)/);
  });

  it('confirm without --force only reads and prints the preview', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { data: cancellationDetail() } }));

    const result = await execute(['confirm', '12', '--notiz=Telefonisch geklärt']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.deepEqual(calls.map((call) => call.method), ['GET']);
    assert.match(result.stdout, /^Vorschau \(nichts ausgeführt\)/);
    assert.match(result.stdout, /Bestätigungsmail an max@example\.com/);
    assert.match(result.stdout, /wird NICHT automatisch ausgelöst/);
    assert.match(result.stdout, /Zum Ausführen: denselben Befehl mit --force wiederholen\./);
  });

  it('confirm --force posts the note to the confirmation endpoint and prints the result', async () => {
    const confirmed = cancellationDetail({ status: 'confirmed', status_label: 'Bestätigt', warnings: [] });
    const calls = stubFetch(() => ({ status: 200, body: { data: confirmed, meta: { result: 'confirmed' } } }));

    const result = await execute(['confirm', '12', '--notiz', 'Telefonisch geklärt', '--force']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].url, 'http://127.0.0.1:8124/api/admin/v1/cancellation-requests/12/confirmation');
    assert.deepEqual(JSON.parse(calls[0].body ?? ''), { admin_notes: 'Telefonisch geklärt' });
    assert.ok(calls[0].headers['Idempotency-Key']);
    assert.match(result.stdout, /Kündigung #12 bestätigt\.\n.*Status jetzt: Bestätigt \(confirmed\)/);
  });

  it('confirm --force --json passes the API response through', async () => {
    const body = { data: cancellationDetail({ status: 'confirmed', status_label: 'Bestätigt' }), meta: { result: 'already_confirmed' } };
    stubFetch(() => ({ status: 200, body }));

    const result = await execute(['confirm', '12', '--force', '--json']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.deepEqual(JSON.parse(result.stdout), body);
  });

  it('reject preview in JSON mode reports mode, changes_state and lines', async () => {
    stubFetch(() => ({ status: 200, body: { data: cancellationDetail({ status: 'confirmed', status_label: 'Bestätigt' }) } }));

    const result = await execute(['reject', '12', '--grund=Zu spät', '--json']);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, EXIT_OK);
    assert.equal(payload.mode, 'preview');
    assert.equal(payload.changes_state, false);
    assert.match(payload.lines.map((line: { text: string }) => line.text).join('\n'), /409/);
    assert.equal(payload.data.id, 12);
  });

  it('reject without --grund fails before any request', async () => {
    const calls = stubFetch(() => ({ status: 200, body: {} }));

    for (const argv of [['reject', '12', '--force'], ['reject', '12', '--grund', '--force'], ['reject', '12', '--grund=   ']]) {
      const result = await execute(argv);

      assert.equal(result.exitCode, EXIT_USAGE, argv.join(' '));
      assert.match(String(lastStderrJson(result.stderr).error), /--grund/);
    }
    assert.equal(calls.length, 0);
  });

  it('reject --force answers 409 with exit 2 and current_status on stderr', async () => {
    stubFetch(() => ({
      status: 409,
      body: { error: 'conflict', message: 'Die Anfrage hat bereits den Status „Bestätigt“ und kann nicht abgelehnt werden.', current_status: 'confirmed', data: {} },
    }));

    const result = await execute(['reject', '12', '--grund=Zu spät', '--force']);
    const payload = lastStderrJson(result.stderr);

    assert.equal(result.exitCode, EXIT_API);
    assert.equal(payload.status, 409);
    assert.equal(payload.current_status, 'confirmed');
    assert.match(String(payload.error), /kann nicht abgelehnt werden/);
    assert.equal(result.stdout, '');
  });

  it('reports 404 and network errors with exit 2', async () => {
    stubFetch(() => ({ status: 404, body: { message: 'Not Found' } }));
    const notFound = await execute(['show', '999']);
    assert.equal(notFound.exitCode, EXIT_API);
    assert.equal(lastStderrJson(notFound.stderr).status, 404);

    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:8124') });
    }) as typeof fetch;
    const offline = await execute(['list']);
    assert.equal(offline.exitCode, EXIT_API);
    assert.equal(lastStderrJson(offline.stderr).status, 0);
    assert.match(String(lastStderrJson(offline.stderr).error), /nicht erreichbar.*ECONNREFUSED/);
  });

  it('fails with exit 1 and no request when the admin token is missing, unknown flags or a bad id are given', async () => {
    const calls = stubFetch(() => ({ status: 200, body: {} }));

    const missingToken = await execute(['list'], { AIDI_API_TOKEN: 'content-token' });
    const typo = await execute(['confirm', '12', '--froce']);
    const badId = await execute(['show', 'abc']);
    const badStatus = await execute(['list', '--status=offen']);

    assert.equal(missingToken.exitCode, EXIT_USAGE);
    assert.match(String(lastStderrJson(missingToken.stderr).error), /LERNPLATTFORM_ADMIN_TOKEN ist nicht gesetzt/);
    assert.equal(typo.exitCode, EXIT_USAGE);
    assert.match(String(lastStderrJson(typo.stderr).error), /Unbekannte Option\(en\) für confirm: --froce/);
    assert.equal(badId.exitCode, EXIT_USAGE);
    assert.equal(badStatus.exitCode, EXIT_USAGE);
    assert.equal(calls.length, 0);
  });

  it('prints help without a token', async () => {
    const result = await execute(['--help'], {});

    assert.equal(result.exitCode, EXIT_OK);
    assert.match(result.stdout, /VERÄNDERND, nur nach Ansage/);
    assert.match(result.stdout, /LERNPLATTFORM_ADMIN_TOKEN/);
  });

  it('--env=staging sends Basic-Auth plus X-API-Authorization and names the ENV on an nginx 401', async () => {
    const env = { LERNPLATTFORM_STAGING_ADMIN_TOKEN: 'stg-token', LERNPLATTFORM_STAGING_BASIC_AUTH: 'stage-user:s3cret' };
    const calls = stubFetch(() => ({
      status: 401,
      body: '<html><head><title>401 Authorization Required</title></head></html>',
      headers: { 'Content-Type': 'text/html', 'WWW-Authenticate': 'Basic realm="Restricted Area"' },
    }));

    const result = await execute(['list', '--env=staging'], env);

    assert.equal(calls[0].url.startsWith('https://staging.ausbildung-in-der-it.de/api/admin/v1/'), true);
    assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from('stage-user:s3cret').toString('base64')}`);
    assert.equal(calls[0].headers['X-API-Authorization'], 'Bearer stg-token');
    assert.equal(result.exitCode, EXIT_API);
    assert.match(result.stderr, /^Ziel: https:\/\/staging\.ausbildung-in-der-it\.de \(staging, mit Basic-Auth\)/);
    assert.match(String(lastStderrJson(result.stderr).error), /Basic-Auth abgelehnt \(nginx\)\. Zugangsdaten in LERNPLATTFORM_STAGING_BASIC_AUTH prüfen/);
    assert.doesNotMatch(result.stderr, /stage-user|s3cret|stg-token/);
  });
});
