import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EXIT_API, EXIT_OK, EXIT_USAGE, executeKuendigungen } from '../../src/commands/kuendigungen';
import { createPalette } from '../../src/admin/cancellation-format';
import { cancellationDetail, confirmedDetail, executionWith, refundWith, restoreFetch, stubFetch } from './fixtures';

const ENV = { LERNPLATTFORM_BASE_URL: 'http://127.0.0.1:8124', LERNPLATTFORM_ADMIN_TOKEN: 'secret-token', LERNPLATTFORM_ENV: 'production' };

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
            payment_mode: 'one_time', refund_status: 'none',
            warnings: [{ code: 'pending_longer_than_14_days', message: '…' }, { code: 'contract_price_unknown', message: '…' }],
          },
        ],
        meta: { current_page: 1, last_page: 2, per_page: 1, total: 2, status: 'pending' },
      },
    }));

    const result = await execute(['list', '--per-page=1']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.equal(new URL(calls[0].url).search, '?status=pending&per_page=1');
    assert.match(result.stdout, /#3\s+01\.09\.2026\s+22 T\s+Max Muster\s+IT-Pass 12 Monate/);
    assert.match(result.stdout, /offen>14d, vertragspreis-fehlt/);
    assert.match(result.stdout, /Seite 1 von 2 · 2 Anfragen gesamt · Status: pending · weiter mit --page 2/);
    assert.match(result.stderr, /^Ziel: http:\/\/127\.0\.0\.1:8124 \(LERNPLATTFORM_BASE_URL, Token für PRODUCTION\)/);
  });

  it('confirm without --force only reads and prints the preview', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { data: cancellationDetail() } }));

    const result = await execute(['confirm', '12', '--notiz=Telefonisch geklärt']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.deepEqual(calls.map((call) => call.method), ['GET']);
    assert.match(result.stdout, /^Vorschau \(nichts ausgeführt\)/);
    assert.match(result.stdout, /Bestätigungsmail an max@example\.com/);
    assert.match(result.stdout, /Wird beim Bestätigen NICHT ausgelöst, danach: lernplattform kuendigungen refund 12/);
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

    const result = await execute(['reject', '12', '--unzulaessig=duplikat', '--grund=Doppelt', '--json']);
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, EXIT_OK);
    assert.equal(payload.mode, 'preview');
    assert.equal(payload.changes_state, false);
    assert.match(payload.lines.map((line: { text: string }) => line.text).join('\n'), /409/);
    assert.equal(payload.data.id, 12);
  });

  it('reject without --grund fails before any request', async () => {
    const calls = stubFetch(() => ({ status: 200, body: {} }));

    for (const argv of [['reject', '12', '--unzulaessig=duplikat', '--force'], ['reject', '12', '--unzulaessig=duplikat', '--grund', '--force'], ['reject', '12', '--unzulaessig=duplikat', '--grund=   ']]) {
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

    const result = await execute(['reject', '12', '--unzulaessig=keine-erklaerung', '--grund=Nur eine Frage', '--force']);
    const payload = lastStderrJson(result.stderr);

    assert.equal(result.exitCode, EXIT_API);
    assert.equal(payload.status, 409);
    assert.equal(payload.current_status, 'confirmed');
    assert.match(String(payload.error), /kann nicht abgelehnt werden/);
    assert.equal(result.stdout, '');
  });

  it('reject needs --unzulaessig with a known ground and sends it as rejection_ground', async () => {
    const calls = stubFetch(() => ({
      status: 200,
      body: { data: cancellationDetail({ status: 'rejected', status_label: 'Abgelehnt' }), meta: { result: 'rejected' } },
    }));

    for (const argv of [['reject', '12', '--grund=x', '--force'], ['reject', '12', '--unzulaessig=frist', '--grund=x', '--force']]) {
      const result = await execute(argv);
      assert.equal(result.exitCode, EXIT_USAGE, argv.join(' '));
      assert.match(String(lastStderrJson(result.stderr).error), /--unzulaessig|Unbekannte Art/);
    }
    assert.equal(calls.length, 0);

    const result = await execute(['reject', '12', '--unzulaessig=falscher-vertrag', '--grund=Falscher Pass', '--force']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.deepEqual(JSON.parse(calls[0].body ?? ''), { rejection_ground: 'wrong_contract', rejection_reason: 'Falscher Pass' });
  });

  it('write commands never fall back to production: without --env and LERNPLATTFORM_ENV they abort before any request', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { data: cancellationDetail() } }));
    const withoutEnv = { LERNPLATTFORM_ADMIN_TOKEN: 'secret-token' };

    for (const argv of [['confirm', '12'], ['refund', '12', '--force'], ['reject', '12', '--unzulaessig=duplikat', '--grund=x']]) {
      const result = await execute(argv, withoutEnv);
      assert.equal(result.exitCode, EXIT_USAGE, argv.join(' '));
      assert.match(String(lastStderrJson(result.stderr).error), /braucht ein ausdrückliches Ziel: --env=production oder --env=staging/);
    }
    assert.equal(calls.length, 0);

    const explicit = await execute(['confirm', '12', '--env=production'], withoutEnv);
    assert.equal(explicit.exitCode, EXIT_OK);
    assert.match(explicit.stderr, /^Ziel: https:\/\/app\.ausbildung-in-der-it\.de \(PRODUCTION\)/);
  });

  it('read commands keep the production default but say so on stderr', async () => {
    stubFetch(() => ({ status: 200, body: { data: cancellationDetail() } }));

    const result = await execute(['show', '12'], { LERNPLATTFORM_ADMIN_TOKEN: 'secret-token' });

    assert.equal(result.exitCode, EXIT_OK);
    assert.match(result.stderr, /^Ziel: https:\/\/app\.ausbildung-in-der-it\.de \(PRODUCTION, Default ohne --env\)/);
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
  it('list shows refund status, withdrawal due date, null pass fields and the ledger block', async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        data: [
          {
            id: 8, type: 'widerruf', type_label: 'Widerruf', status: 'pending', status_label: 'Ausstehend',
            received_at: '2026-09-20T10:00:00+02:00', age_days: 3, effective_date: '2026-09-20',
            participant_name: 'Wanda Widerruf', participant_email: 'w@example.com', pass_name: 'IT-Pass 12 Monate',
            payment_mode: 'one_time', refund_status: 'none',
            warnings: [{ code: 'withdrawal_refund_due', message: '…' }, { code: 'paid_amount_unknown', message: '…' }],
          },
          {
            id: 9, type: 'ordentlich', type_label: 'Ordentliche Kündigung', status: 'confirmed', status_label: 'Bestätigt',
            received_at: '2026-09-01T10:00:00+02:00', age_days: 22, effective_date: '2026-12-01',
            participant_name: 'Paul Ohnepass', participant_email: 'p@example.com', pass_name: null,
            payment_mode: null, refund_status: 'failed',
            warnings: [{ code: 'user_pass_missing', message: '…' }, { code: 'refund_failed', message: '…' }],
          },
        ],
        meta: { current_page: 1, last_page: 1, per_page: 25, total: 2, status: 'all' },
      },
    }));

    const result = await execute(['list', '--status=all']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.match(result.stdout, /Erstattung\s+Warnungen/);
    assert.match(result.stdout, /#8 .*Widerruf, Erstattung bis 04\.10\.2026 .*Einmalzahlung\s+—\s+widerruf-erstatten, ZAHLUNGSBUCH-FEHLT/);
    assert.match(result.stdout, /#9 .*Paul Ohnepass\s+—\s+Ordentliche Kündigung\s+01\.12\.2026\s+—\s+FEHLGESCHLAGEN\s+pass-geloescht, ERSTATTUNG-FEHLGESCHLAGEN/);
    assert.match(result.stdout, /Bestätigen gesperrt, Zahlungsbuch fehlt \(Backfill\): #8$/m);
  });

  it('show renders important reason, withdrawal due date, refund execution and subscription cancellation', async () => {
    const detail = confirmedDetail({
      type: 'ausserordentlich',
      type_label: 'Außerordentliche Kündigung',
      important_reason_accepted: false,
      effective_date: {
        stored: '2026-12-23', recalculated: '2026-12-23', recalculation_explanation: 'umgedeutet', recalculation_error: null,
        recalculated_ends_regularly: false, recalculated_reinterpreted_as_ordinary: true,
      },
      refund: refundWith({ is_contract_price_estimated: true }),
      refund_execution: executionWith({ status: 'failed', status_label: 'Erstattung fehlgeschlagen', error: 'card_declined' }),
      subscription_cancellation: { status: 'bundle_skipped', error: null },
    });
    stubFetch(() => ({ status: 200, body: { data: detail } }));

    const result = await execute(['show', '12']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.match(result.stdout, /Wichtiger Grund\s+nicht anerkannt, als ordentliche Kündigung behandelt \(Umdeutung, § 140 BGB\)/);
    assert.match(result.stdout, /Hinweis\s+umgedeutet in ordentliche Kündigung \(§ 140 BGB\)/);
    assert.match(result.stdout, /Vertragspreis\s+588,00 € .* geschätzt: Katalogpreis, Vertragspreis fehlt/);
    assert.match(result.stdout, /Erstattung ausgeführt\n\s+Status\s+Erstattung fehlgeschlagen \(failed\)/);
    assert.match(result.stdout, /Offen\s+265,81 €/);
    assert.match(result.stdout, /Fehler\s+card_declined/);
    assert.match(result.stdout, /Nächster Schritt\s+lernplattform kuendigungen refund 12/);
    assert.match(result.stdout, /Abo-Kündigung \(Bestätigung\)\n\s+Ergebnis\s+nicht gekündigt \(alte Bündel-Regel\): Abo bezahlt mehrere Pässe/);
  });

  it('show puts the ledger block on top and survives a deleted pass', async () => {
    const detail = cancellationDetail({
      type: 'widerruf',
      type_label: 'Widerruf',
      withdrawal_refund_due_at: '2026-10-04',
      pass: null,
      payment_mode: null,
      refund: null,
      refund_error: 'Der Pass zu dieser Anfrage ist gelöscht oder nicht mehr verknüpft.',
      refund_execution: executionWith({ outstanding_cents: null }),
      effective_date: {
        stored: '2026-09-20', recalculated: null, recalculation_explanation: null, recalculation_error: 'Pass gelöscht',
        recalculated_ends_regularly: false, recalculated_reinterpreted_as_ordinary: false,
      },
      warnings: [{ code: 'paid_amount_unknown', message: 'Zahlungsbuch leer.' }, { code: 'user_pass_missing', message: 'Pass gelöscht.' }],
    });
    stubFetch(() => ({ status: 200, body: { data: detail } }));

    const result = await execute(['show', '12']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.match(result.stdout, /^! Bestätigen gesperrt, Zahlungsbuch fehlt \(Backfill\)/);
    assert.match(result.stdout, /Widerruf\s+Erstattung spätestens bis 04\.10\.2026 \(§ 357 BGB\)/);
    assert.match(result.stdout, /Pass\n\s+gelöscht oder nicht mehr verknüpft \(user_pass_missing\)/);
    assert.match(result.stdout, /Zahlungsart\s+—/);
    assert.match(result.stdout, /Offen\s+— \(nicht berechenbar\)/);
  });

  it('confirm --wichtiger-grund-anerkannt --force sends important_reason_accepted', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { data: confirmedDetail({ type: 'ausserordentlich', type_label: 'Außerordentliche Kündigung', important_reason_accepted: true }), meta: { result: 'confirmed' } } }));

    const result = await execute(['confirm', '12', '--wichtiger-grund-anerkannt', '--force']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.deepEqual(JSON.parse(calls[0].body ?? ''), { important_reason_accepted: true });
    assert.match(result.stdout, /Wichtiger Grund: anerkannt, sofortige Wirkung/);
  });

  it('confirm --als-widerruf --force sends treat_as_withdrawal and reports the recognized withdrawal', async () => {
    const confirmed = confirmedDetail({
      withdrawal_recognized_at: '2026-09-23T10:00:00+02:00',
      withdrawal_refund_due_at: '2026-09-29',
    });
    const calls = stubFetch(() => ({ status: 200, body: { data: confirmed, meta: { result: 'confirmed' } } }));

    const result = await execute(['confirm', '12', '--als-widerruf', '--notiz=Kauf vor 5 Tagen', '--force']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.deepEqual(JSON.parse(calls[0].body ?? ''), { admin_notes: 'Kauf vor 5 Tagen', treat_as_withdrawal: true });
    assert.match(result.stdout, /Als Widerruf behandelt am 23\.09\.2026 10:00, volle Erstattung fällig bis 29\.09\.2026/);
  });

  it('list marks a cancellation treated as withdrawal with its refund due date', async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        data: [{
          id: 10, type: 'ordentlich', type_label: 'Ordentliche Kündigung', withdrawal_recognized_at: '2026-09-23T10:00:00+02:00',
          status: 'confirmed', status_label: 'Bestätigt', received_at: '2026-09-15T10:00:00+02:00', age_days: 8,
          effective_date: '2026-09-15', participant_name: 'Olga Ordentlich', participant_email: 'o@example.com',
          pass_name: 'IT-Pass 12 Monate', payment_mode: 'one_time', refund_status: 'none',
          warnings: [{ code: 'withdrawal_refund_due', message: '…' }],
        }],
        meta: { current_page: 1, last_page: 1, per_page: 25, total: 1, status: 'confirmed' },
      },
    }));

    const result = await execute(['list', '--status=confirmed']);

    assert.match(result.stdout, /Ordentliche Kündigung, als Widerruf behandelt, Erstattung bis 29\.09\.2026/);
  });

  it('confirm preview without the flag keeps the body free of decisions and shows the reinterpretation', async () => {
    const detail = cancellationDetail({
      type: 'ausserordentlich',
      type_label: 'Außerordentliche Kündigung',
      effective_date: {
        stored: '2026-06-10', recalculated: '2026-12-23', recalculation_explanation: null, recalculation_error: null,
        recalculated_ends_regularly: false, recalculated_reinterpreted_as_ordinary: true,
      },
    });
    const calls = stubFetch(() => ({ status: 200, body: { data: detail } }));

    const result = await execute(['confirm', '12']);

    assert.deepEqual(calls.map((call) => call.method), ['GET']);
    assert.match(result.stdout, /wird als ordentliche Kündigung zum 23\.12\.2026 behandelt \(Umdeutung, § 140 BGB\)/);
  });

  it('rejects conflicting or valued switches before any request', async () => {
    const calls = stubFetch(() => ({ status: 200, body: {} }));

    const both = await execute(['confirm', '12', '--wichtiger-grund-anerkannt', '--als-widerruf']);
    const valued = await execute(['confirm', '12', '--wichtiger-grund-anerkannt=false']);
    const eatenId = await execute(['refund', '--force', '12']);
    const unknownOnRefund = await execute(['refund', '12', '--betrag=10']);

    assert.equal(both.exitCode, EXIT_USAGE);
    assert.match(String(lastStderrJson(both.stderr).error), /schließen sich aus/);
    assert.equal(valued.exitCode, EXIT_USAGE);
    assert.match(String(lastStderrJson(valued.stderr).error), /Schalter ohne Wert/);
    assert.equal(eatenId.exitCode, EXIT_USAGE);
    assert.equal(unknownOnRefund.exitCode, EXIT_USAGE);
    assert.match(String(lastStderrJson(unknownOnRefund.stderr).error), /Unbekannte Option\(en\) für refund: --betrag/);
    assert.equal(calls.length, 0);
  });

  it('confirm --force answers 409 paid_amount_unknown with code and backfill hint', async () => {
    stubFetch(() => ({
      status: 409,
      body: { error: 'paid_amount_unknown', message: 'Der gezahlte Betrag ist unbekannt.', current_status: 'pending', data: {} },
    }));

    const result = await execute(['confirm', '12', '--force']);
    const payload = lastStderrJson(result.stderr);

    assert.equal(result.exitCode, EXIT_API);
    assert.equal(payload.code, 'paid_amount_unknown');
    assert.match(String(payload.hint), /Bestätigen gesperrt, Zahlungsbuch fehlt \(Backfill\).*pass:backfill-payments/);
    assert.doesNotMatch(String(payload.error), /paid_amount_unknown/);
  });

  it('confirm --force answers 422 unprocessable with code', async () => {
    stubFetch(() => ({ status: 422, body: { error: 'unprocessable', message: 'Ein wichtiger Grund kann nur bei einer außerordentlichen Kündigung anerkannt werden.' } }));

    const result = await execute(['confirm', '12', '--wichtiger-grund-anerkannt', '--force']);
    const payload = lastStderrJson(result.stderr);

    assert.equal(result.exitCode, EXIT_API);
    assert.equal(payload.status, 422);
    assert.equal(payload.code, 'unprocessable');
    assert.match(String(payload.error), /nur bei einer außerordentlichen Kündigung/);
  });

  it('refund without --force only reads and shows the preview', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { data: confirmedDetail() } }));

    const result = await execute(['refund', '12']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.deepEqual(calls.map((call) => call.method), ['GET']);
    assert.match(result.stdout, /^Vorschau \(nichts ausgeführt\)/);
    assert.match(result.stdout, /! ECHTES GELD/);
    assert.match(result.stdout, /Offen, wird jetzt erstattet: 265,81 €/);
  });

  it('refund preview in JSON mode reports changes_state', async () => {
    stubFetch(() => ({ status: 200, body: { data: confirmedDetail({ refund: refundWith({ is_paid_amount_estimated: true }) }) } }));

    const payload = JSON.parse((await execute(['refund', '12', '--json'])).stdout);

    assert.equal(payload.mode, 'preview');
    assert.equal(payload.changes_state, false);
    assert.match(payload.lines[0].text, /Erstatten gesperrt/);
  });

  it('refund --force posts to the refund endpoint, warns on stderr and prints the result', async () => {
    const refunded = confirmedDetail({
      refund_execution: executionWith({
        status: 'refunded', status_label: 'Erstattet', refunded_cents: 26_581, refunded_formatted: '265,81 €',
        outstanding_cents: 0, stripe_refund_ids: ['re_1'], refunded_at: '2026-09-23T11:00:00+02:00',
      }),
    });
    const calls = stubFetch(() => ({ status: 200, body: { data: refunded, meta: { result: 'refunded' } } }));

    const result = await execute(['refund', '12', '--force']);

    assert.equal(result.exitCode, EXIT_OK);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].url, 'http://127.0.0.1:8124/api/admin/v1/cancellation-requests/12/refund');
    assert.deepEqual(JSON.parse(calls[0].body ?? ''), {});
    assert.ok(calls[0].headers['Idempotency-Key']);
    assert.match(result.stderr, /ECHTES GELD/);
    assert.match(result.stdout, /Kündigung #12: 265,81 € über Stripe erstattet\./);
    assert.match(result.stdout, /Stripe-Refunds: re_1/);
  });

  it('refund --force --json passes already_refunded and nothing_to_refund through with exit 0', async () => {
    for (const resultCode of ['already_refunded', 'nothing_to_refund']) {
      const body = { data: confirmedDetail(), meta: { result: resultCode } };
      stubFetch(() => ({ status: 200, body }));

      const result = await execute(['refund', '12', '--force', '--json']);

      assert.equal(result.exitCode, EXIT_OK, resultCode);
      assert.deepEqual(JSON.parse(result.stdout), body);
    }
  });

  it('refund --force maps 409 codes to exit 2 with code and hint', async () => {
    const codes = ['not_confirmed', 'paid_amount_unknown', 'refund_in_progress', 'user_pass_missing'];
    for (const code of codes) {
      stubFetch(() => ({ status: 409, body: { error: code, message: `Blockiert: ${code}`, current_status: 'confirmed', data: {} } }));

      const result = await execute(['refund', '12', '--force']);
      const payload = lastStderrJson(result.stderr.slice(result.stderr.indexOf('\n{') + 1));

      assert.equal(result.exitCode, EXIT_API, code);
      assert.equal(payload.status, 409, code);
      assert.equal(payload.code, code);
      assert.ok(typeof payload.hint === 'string' && payload.hint.length > 0, code);
      assert.equal(result.stdout, '');
    }
  });

  it('refund --force maps 502 refund_failed and shows what was refunded so far', async () => {
    const data = confirmedDetail({
      refund_execution: executionWith({
        status: 'failed', status_label: 'Erstattung fehlgeschlagen', refunded_cents: 10_000, refunded_formatted: '100,00 €',
        outstanding_cents: 16_581, stripe_refund_ids: ['re_1'], error: 'card_declined',
      }),
    });
    stubFetch(() => ({ status: 502, body: { error: 'refund_failed', message: 'Stripe hat die Erstattung abgelehnt: card_declined', current_status: 'confirmed', data } }));

    const result = await execute(['refund', '12', '--force']);
    const payload = lastStderrJson(result.stderr.slice(result.stderr.indexOf('\n{') + 1));

    assert.equal(result.exitCode, EXIT_API);
    assert.equal(payload.status, 502);
    assert.equal(payload.code, 'refund_failed');
    assert.match(String(payload.hint), /nicht doppelt/);
    assert.deepEqual(payload.refund_execution, {
      status: 'failed', refunded_cents: 10_000, outstanding_cents: 16_581, stripe_refund_ids: ['re_1'], error: 'card_declined',
    });
  });

  it('refund --force maps 422 unprocessable', async () => {
    stubFetch(() => ({ status: 422, body: { error: 'unprocessable', message: 'Unbegrenzter Pass — kein gesetzliches Kündigungsrecht nach FernUSG.' } }));

    const result = await execute(['refund', '12', '--force']);

    assert.equal(result.exitCode, EXIT_API);
    assert.equal(lastStderrJson(result.stderr.slice(result.stderr.indexOf('\n{') + 1)).code, 'unprocessable');
  });
});
