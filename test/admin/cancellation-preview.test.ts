import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildActionResultLines,
  buildConfirmationPreview,
  buildRejectionPreview,
  formatGermanDate,
  formatGermanDateTime,
  type PreviewLine,
} from '../../src/admin/cancellation-requests';
import { cancellationDetail } from './fixtures';

function texts(lines: PreviewLine[]): string[] {
  return lines.map((line) => line.text);
}

describe('buildConfirmationPreview', () => {
  it('describes confirmation, mail, refund, note, warnings and the --force hint for a pending one-time pass', () => {
    const preview = buildConfirmationPreview(cancellationDetail(), { adminNotes: 'Telefonisch geklärt' });

    assert.equal(preview.changesState, true);
    assert.deepEqual(texts(preview.lines), [
      'Kündigung #12 wird bestätigt.',
      'Bestätigungsmail an max@example.com.',
      'Berechnete Erstattung: 265,81 € (wird NICHT automatisch ausgelöst, siehe AIDI-749)',
      'Interne Notiz: Telefonisch geklärt',
      '[refund_based_on_catalog_price] Erstattung basiert auf dem Katalogpreis.',
      'Zum Ausführen: denselben Befehl mit --force wiederholen.',
    ]);
  });

  it('announces the Stripe cancellation at the stored effective date for an active subscription', () => {
    const detail = cancellationDetail({
      payment_mode: 'subscription',
      subscription: { stripe_id: 'sub_123', stripe_status: 'active', ends_at: null, is_canceled: false },
    });

    assert.ok(texts(buildConfirmationPreview(detail).lines).includes('Stripe-Abo sub_123 wird zum 01.09.2026 gekündigt.'));
  });

  it('states that an already canceled subscription is not adjusted', () => {
    const detail = cancellationDetail({
      subscription: { stripe_id: 'sub_123', stripe_status: 'active', ends_at: '2026-10-01T00:00:00+02:00', is_canceled: true },
    });

    const lines = texts(buildConfirmationPreview(detail).lines);

    assert.ok(lines.includes('Stripe-Abo sub_123 hat bereits ein Enddatum (01.10.2026) und wird nicht angepasst.'));
    assert.doesNotMatch(lines.join('\n'), /wird zum/);
  });

  it('reports a refund calculation error instead of an amount', () => {
    const detail = cancellationDetail({ refund: null, refund_error: 'Kein Kaufpreis gefunden' });

    assert.ok(texts(buildConfirmationPreview(detail).lines).includes('Keine Erstattung berechnet: Kein Kaufpreis gefunden'));
  });

  it('says that --force changes nothing when already confirmed', () => {
    const detail = cancellationDetail({
      status: 'confirmed',
      status_label: 'Bestätigt',
      review: {
        reviewed_at: '2026-09-20T14:05:00+02:00',
        reviewed_by: { id: 1, name: 'Noel', email: 'noel@example.com' },
        admin_notes: null,
        rejection_reason: null,
      },
    });

    const preview = buildConfirmationPreview(detail);

    assert.equal(preview.changesState, false);
    assert.deepEqual(preview.lines[0], { kind: 'blocked', text: 'Kündigung #12 ist bereits bestätigt (am 20.09.2026 14:05 von Noel).' });
    assert.match(texts(preview.lines).join('\n'), /ändert nichts/);
    assert.doesNotMatch(texts(preview.lines).join('\n'), /Bestätigungsmail/);
  });

  it('announces a 409 for rejected and withdrawn requests', () => {
    for (const [status, statusLabel] of [['rejected', 'Abgelehnt'], ['withdrawn', 'Zurückgezogen']] as const) {
      const preview = buildConfirmationPreview(cancellationDetail({ status, status_label: statusLabel }));
      const joined = texts(preview.lines).join('\n');

      assert.equal(preview.changesState, false);
      assert.match(joined, /409/);
      assert.doesNotMatch(joined, /--force wiederholen/);
    }
  });
});

describe('buildRejectionPreview', () => {
  it('describes the rejection mail with the reason for a pending request', () => {
    const preview = buildRejectionPreview(cancellationDetail({ warnings: [] }), 'Mindestlaufzeit nicht erreicht');

    assert.equal(preview.changesState, true);
    assert.deepEqual(texts(preview.lines), [
      'Kündigung #12 wird abgelehnt.',
      'Ablehnungsmail an max@example.com mit Begründung: „Mindestlaufzeit nicht erreicht“',
      'Zum Ausführen: denselben Befehl mit --force wiederholen.',
    ]);
  });

  it('says that --force changes nothing when already rejected and shows the stored reason', () => {
    const detail = cancellationDetail({
      status: 'rejected',
      status_label: 'Abgelehnt',
      review: { reviewed_at: null, reviewed_by: null, admin_notes: null, rejection_reason: 'Alter Grund' },
    });

    const lines = texts(buildRejectionPreview(detail, 'Neuer Grund').lines);

    assert.equal(lines[0], 'Kündigung #12 ist bereits abgelehnt.');
    assert.ok(lines.includes('Gespeicherte Begründung: Alter Grund'));
    assert.doesNotMatch(lines.join('\n'), /Neuer Grund/);
  });

  it('announces a 409 for a confirmed request', () => {
    const preview = buildRejectionPreview(cancellationDetail({ status: 'confirmed', status_label: 'Bestätigt' }), 'x');

    assert.equal(preview.changesState, false);
    assert.match(texts(preview.lines).join('\n'), /409/);
  });
});

describe('buildActionResultLines', () => {
  it('highlights a missing Stripe cancellation after confirmation exactly once', () => {
    const detail = cancellationDetail({
      status: 'confirmed',
      status_label: 'Bestätigt',
      subscription: { stripe_id: 'sub_123', stripe_status: 'active', ends_at: null, is_canceled: false },
      warnings: [
        { code: 'subscription_cancel_at_missing', message: 'Abo hat kein Enddatum.' },
        { code: 'effective_date_in_past', message: 'Datum liegt in der Vergangenheit.' },
      ],
    });

    const lines = buildActionResultLines({ data: detail, meta: { result: 'confirmed' } });

    assert.deepEqual(lines[0], { kind: 'action', text: 'Kündigung #12 bestätigt.' });
    const alert = lines.find((line) => line.kind === 'blocked');
    assert.match(alert?.text ?? '', /ACHTUNG: Stripe-Kündigung vermutlich fehlgeschlagen.*sub_123.*01\.09\.2026/);
    assert.ok(texts(lines).includes('[effective_date_in_past] Datum liegt in der Vergangenheit.'));
    assert.equal(texts(lines).filter((text) => text.includes('subscription_cancel_at_missing')).length, 1);
  });

  it('reports idempotent results as unchanged', () => {
    const detail = cancellationDetail({ status: 'rejected', status_label: 'Abgelehnt', warnings: [] });

    const lines = buildActionResultLines({ data: detail, meta: { result: 'already_rejected' } });

    assert.deepEqual(lines[0], { kind: 'note', text: 'Kündigung #12 war bereits abgelehnt, nichts geändert.' });
  });
});

describe('date formatting', () => {
  it('formats dates and timestamps in German notation using the API offset', () => {
    assert.equal(formatGermanDate('2026-09-01'), '01.09.2026');
    assert.equal(formatGermanDate('2026-06-10T23:30:00+02:00'), '10.06.2026');
    assert.equal(formatGermanDateTime('2026-06-10T09:12:00+02:00'), '10.06.2026 09:12');
    assert.equal(formatGermanDate(null), '—');
  });
});
