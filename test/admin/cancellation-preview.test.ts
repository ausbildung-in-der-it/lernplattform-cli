import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildActionResultLines,
  buildConfirmationPreview,
  buildRefundPreview,
  buildRefundResultLines,
  buildRejectionPreview,
  withdrawalDueDateFromReceipt,
  formatGermanDate,
  formatGermanDateTime,
  type PreviewLine,
} from '../../src/admin/cancellation-requests';
import { cancellationDetail, confirmedDetail, executionWith, refundWith } from './fixtures';

function texts(lines: PreviewLine[]): string[] {
  return lines.map((line) => line.text);
}

const TODAY = '2026-09-23';

describe('buildConfirmationPreview', () => {
  it('describes confirmation, effective date, access end, mail, refund, note, warnings and the --force hint for a pending one-time pass', () => {
    const preview = buildConfirmationPreview(cancellationDetail(), { adminNotes: 'Telefonisch geklärt', today: TODAY });

    assert.equal(preview.changesState, true);
    assert.deepEqual(texts(preview.lines), [
      'Kündigung #12 (Ordentliche Kündigung) wird bestätigt.',
      'Wirksam zum 23.12.2026 (§ 5 FernUSG) (gespeichert war 01.09.2026).',
      'Zugangsende: 23.12.2026 23:59 (bisher gültig bis 10.01.2027).',
      'Bestätigungsmail an max@example.com.',
      'Berechnete Erstattung: 265,81 € (bezahlt 588,00 €, geschuldet 322,19 €). Wird beim Bestätigen NICHT ausgelöst, danach: lernplattform kuendigungen refund 12.',
      'Interne Notiz: Telefonisch geklärt',
      '[contract_price_unknown] Der vereinbarte Vertragspreis ist nicht gespeichert.',
      'Zum Ausführen: denselben Befehl mit --force wiederholen.',
    ]);
  });

  it('announces the Stripe cancellation at the recalculated effective date for an active subscription', () => {
    const detail = cancellationDetail({
      payment_mode: 'subscription',
      subscription: { stripe_id: 'sub_123', stripe_status: 'active', ends_at: null, is_canceled: false },
    });

    assert.ok(texts(buildConfirmationPreview(detail, { today: TODAY }).lines).includes('Stripe-Abo-Ende: sub_123 wird zum 23.12.2026 gekündigt (cancel_at).'));
  });

  it('states that a subscription ending earlier is kept', () => {
    const detail = cancellationDetail({
      subscription: { stripe_id: 'sub_123', stripe_status: 'active', ends_at: '2026-10-01T00:00:00+02:00', is_canceled: true },
    });

    const lines = texts(buildConfirmationPreview(detail, { today: TODAY }).lines);

    assert.ok(lines.includes('Stripe-Abo sub_123 endet bereits am 01.10.2026 und bleibt so.'));
    assert.doesNotMatch(lines.join('\n'), /wird zum/);
  });

  it('warns that a bundle subscription is not canceled automatically', () => {
    const detail = cancellationDetail({
      subscription: { stripe_id: 'sub_123', stripe_status: 'active', ends_at: null, is_canceled: false },
      warnings: [{ code: 'bundle_subscription', message: 'Das Stripe-Abo bezahlt mehrere Pässe.' }],
    });

    const lines = buildConfirmationPreview(detail, { today: TODAY }).lines;

    assert.ok(lines.some((line) => line.kind === 'warning' && /NICHT automatisch gekündigt/.test(line.text)));
    assert.doesNotMatch(texts(lines).join('\n'), /wird zum 23\.12\.2026 gekündigt/);
  });

  it('shows the reinterpretation as ordinary for an extraordinary cancellation without the flag', () => {
    const detail = cancellationDetail({
      type: 'ausserordentlich',
      type_label: 'Außerordentliche Kündigung',
      effective_date: {
        stored: '2026-06-10', recalculated: '2026-12-23', recalculation_explanation: null, recalculation_error: null,
        recalculated_ends_regularly: false, recalculated_reinterpreted_as_ordinary: true,
      },
      warnings: [{ code: 'important_reason_decision_required', message: 'Außerordentliche Kündigung: …' }],
    });

    const preview = buildConfirmationPreview(detail, { today: TODAY });
    const lines = texts(preview.lines);

    assert.equal(preview.changesState, true);
    assert.ok(lines.includes('Außerordentliche Kündigung ohne anerkannten wichtigen Grund: wird als ordentliche Kündigung zum 23.12.2026 behandelt (Umdeutung, § 140 BGB) (gespeichert war 10.06.2026).'));
    assert.ok(lines.includes('Mit --wichtiger-grund-anerkannt: sofortige Wirkung zum Zugang der Kündigung.'));
    assert.ok(lines.includes('Zugangsende: 23.12.2026 23:59 (bisher gültig bis 10.01.2027).'));
    assert.doesNotMatch(lines.join('\n'), /important_reason_decision_required/);
  });

  it('shows immediate effect, access end and Stripe cancellation with --wichtiger-grund-anerkannt', () => {
    const detail = cancellationDetail({
      type: 'ausserordentlich',
      type_label: 'Außerordentliche Kündigung',
      payment_mode: 'subscription',
      subscription: { stripe_id: 'sub_9', stripe_status: 'active', ends_at: null, is_canceled: false },
    });

    const lines = texts(buildConfirmationPreview(detail, { importantReasonAccepted: true, today: TODAY }).lines);

    assert.ok(lines.includes('Wichtiger Grund wird anerkannt (§ 314 BGB): sofortige Wirkung, Wirksamkeitsdatum = Zugang am 10.06.2026.'));
    assert.ok(lines.includes('Zugang endet sofort mit der Bestätigung (Pass-Status canceled).'));
    assert.ok(lines.includes('Stripe-Abo sub_9 wird sofort gekündigt (ohne anteilige Gutschrift).'));
    assert.match(lines.join('\n'), /rechnet der Server beim Bestätigen neu \(Stichtag = Zugang\)/);
  });

  it('blocks --wichtiger-grund-anerkannt on an ordinary cancellation with the 422 the server would send', () => {
    const preview = buildConfirmationPreview(cancellationDetail(), { importantReasonAccepted: true, today: TODAY });

    assert.equal(preview.changesState, false);
    assert.equal(preview.lines[0].kind, 'blocked');
    assert.match(preview.lines[0].text, /nur für außerordentliche Kündigungen.*422 unprocessable/);
  });

  it('blocks confirmation while the payment ledger is missing', () => {
    const detail = cancellationDetail({
      refund: refundWith({ is_paid_amount_estimated: true, paid_amount_cents: 0, paid_amount_formatted: '0,00 €' }),
      warnings: [{ code: 'paid_amount_unknown', message: 'Für diesen Pass fehlen Zahlungen im Zahlungsbuch.' }],
    });

    const preview = buildConfirmationPreview(detail, { today: TODAY });

    assert.equal(preview.changesState, false);
    assert.match(preview.lines[0].text, /^Bestätigen gesperrt, Zahlungsbuch fehlt \(Backfill\).*409 paid_amount_unknown/);
    assert.doesNotMatch(texts(preview.lines).join('\n'), /Bestätigungsmail|--force wiederholen/);
  });

  it('describes a withdrawal as ending immediately with full refund', () => {
    const detail = cancellationDetail({
      type: 'widerruf',
      type_label: 'Widerruf',
      received_at: '2026-09-20T09:00:00+02:00',
      withdrawal_refund_due_at: '2026-10-04',
      refund: refundWith({ is_withdrawal: true, refund_amount_cents: 58_800, refund_amount_formatted: '588,00 €' }),
    });

    const lines = texts(buildConfirmationPreview(detail, { today: TODAY }).lines);

    assert.match(lines[1], /^Widerruf \(§ 4 FernUSG, § 355 BGB\): Der Vertrag endet sofort mit Zugang am 20\.09\.2026/);
    assert.ok(lines.includes('Zugang endet sofort mit der Bestätigung (Pass-Status canceled).'));
    assert.match(lines.join('\n'), /Berechnete Erstattung: 588,00 € \(.*Widerruf: voller Betrag\)/);
  });

  it('shows --als-widerruf with full refund, immediate end and due date when withdrawal_possible is set', () => {
    const detail = cancellationDetail({
      received_at: '2026-09-15T09:00:00+02:00',
      warnings: [{ code: 'withdrawal_possible', message: 'Widerruf möglich.' }],
    });

    const preview = buildConfirmationPreview(detail, { treatAsWithdrawal: true, today: TODAY });
    const lines = texts(preview.lines);

    assert.equal(preview.changesState, true);
    assert.ok(lines.includes('Wird als Widerruf behandelt: volle Erstattung 588,00 €, Zugang und Abo enden sofort, Erstattung fällig bis 29.09.2026 (§ 4 FernUSG, §§ 355, 357 BGB).'));
    assert.ok(lines.includes('Zugang endet sofort mit der Bestätigung (Pass-Status canceled).'));
    assert.match(lines.join('\n'), /Erstattung als Widerruf: voller gezahlter Betrag 588,00 €/);
    assert.doesNotMatch(lines.join('\n'), /withdrawal_possible/);
  });

  it('blocks --als-widerruf without withdrawal_possible and together with the important reason', () => {
    const outside = buildConfirmationPreview(cancellationDetail(), { treatAsWithdrawal: true, today: TODAY });
    const both = buildConfirmationPreview(
      cancellationDetail({ type: 'ausserordentlich', type_label: 'Außerordentliche Kündigung' }),
      { treatAsWithdrawal: true, importantReasonAccepted: true, today: TODAY }
    );

    assert.equal(outside.changesState, false);
    assert.match(outside.lines[0].text, /innerhalb von 14 Tagen nach dem Kauf.*422/);
    assert.equal(both.changesState, false);
    assert.match(both.lines[0].text, /schließen sich aus/);
  });

  it('predicts a 422 when the effective date cannot be recalculated', () => {
    const detail = cancellationDetail({
      type: 'ausserordentlich',
      type_label: 'Außerordentliche Kündigung',
      effective_date: {
        stored: '2026-06-10', recalculated: null, recalculation_explanation: null,
        recalculation_error: 'Unbegrenzter Pass ohne ordentliches Kündigungsrecht.',
        recalculated_ends_regularly: false, recalculated_reinterpreted_as_ordinary: false,
      },
    });

    const preview = buildConfirmationPreview(detail, { today: TODAY });

    assert.equal(preview.changesState, false);
    assert.match(preview.lines[0].text, /Unbegrenzter Pass.*422 unprocessable.*Nur mit --wichtiger-grund-anerkannt/);
    assert.equal(buildConfirmationPreview(detail, { importantReasonAccepted: true, today: TODAY }).changesState, true);
  });

  it('handles a deleted pass without crashing', () => {
    const detail = cancellationDetail({
      pass: null,
      payment_mode: null,
      refund: null,
      refund_error: 'Der Pass zu dieser Anfrage ist gelöscht oder nicht mehr verknüpft.',
      warnings: [{ code: 'user_pass_missing', message: 'Pass gelöscht.' }],
    });

    const preview = buildConfirmationPreview(detail, { today: TODAY });

    assert.equal(preview.changesState, true);
    assert.match(texts(preview.lines).join('\n'), /Pass gelöscht: Das gespeicherte Wirksamkeitsdatum 01\.09\.2026 bleibt/);
    assert.match(texts(preview.lines).join('\n'), /Keine Erstattung berechnet: Der Pass zu dieser Anfrage ist gelöscht/);
  });

  it('says that --force changes nothing when already confirmed and points at the open refund', () => {
    const detail = confirmedDetail({
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
    assert.match(texts(preview.lines).join('\n'), /Erstattung noch offen: 265,81 €\. Vorschau: lernplattform kuendigungen refund 12/);
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

describe('buildRefundPreview', () => {
  it('shows amount, already refunded, outstanding, Stripe payments and the real-money warning', () => {
    const detail = confirmedDetail({
      refund_execution: executionWith({ refunded_cents: 10_000, refunded_formatted: '100,00 €', outstanding_cents: 16_581, stripe_refund_ids: ['re_1'] }),
    });

    const preview = buildRefundPreview(detail);
    const lines = texts(preview.lines);

    assert.equal(preview.changesState, true);
    assert.deepEqual(preview.lines[0], { kind: 'blocked', text: 'ECHTES GELD: refund --force zahlt über Stripe an den Teilnehmer aus. Nicht umkehrbar.' });
    assert.ok(lines.includes('Kündigung #12: 165,81 € werden an max@example.com erstattet.'));
    assert.ok(lines.includes('Betrag laut Berechnung: 265,81 € (bezahlt 588,00 €, geschuldet 322,19 €)'));
    assert.ok(lines.includes('Bereits erstattet: 100,00 € (Stripe-Refunds: re_1)'));
    assert.ok(lines.includes('Offen, wird jetzt erstattet: 165,81 €'));
    assert.match(lines.join('\n'), /Stripe-Zahlungen: verteilt auf die Zahlungen des Passes \(UserPass #7\).*cancellation_request_id=12/);
    assert.match(lines[lines.length - 1], /--force wiederholen\. Nur nach ausdrücklicher Freigabe, es fließt echtes Geld/);
  });

  it('predicts not_confirmed for a pending request', () => {
    const preview = buildRefundPreview(cancellationDetail());

    assert.equal(preview.changesState, false);
    assert.match(preview.lines[0].text, /409 not_confirmed/);
    assert.match(texts(preview.lines).join('\n'), /Erst bestätigen: lernplattform kuendigungen confirm 12/);
  });

  it('predicts paid_amount_unknown, user_pass_missing and unprocessable', () => {
    const ledger = buildRefundPreview(confirmedDetail({ refund: refundWith({ is_paid_amount_estimated: true }) }));
    const noPass = buildRefundPreview(confirmedDetail({ pass: null, payment_mode: null, refund: null }));
    const noRefund = buildRefundPreview(confirmedDetail({ refund: null, refund_error: 'Unbegrenzter Pass' }));

    assert.match(ledger.lines[0].text, /^Erstatten gesperrt, Zahlungsbuch fehlt \(Backfill\).*409 paid_amount_unknown/);
    assert.match(noPass.lines[0].text, /409 user_pass_missing/);
    assert.match(noRefund.lines[0].text, /Unbegrenzter Pass.*422 unprocessable/);
    for (const preview of [ledger, noPass, noRefund]) assert.equal(preview.changesState, false);
  });

  it('reports already refunded and nothing to refund without a real-money line', () => {
    const refunded = buildRefundPreview(confirmedDetail({
      refund_execution: executionWith({
        status: 'refunded', status_label: 'Erstattet', refunded_cents: 26_581, refunded_formatted: '265,81 €',
        outstanding_cents: 0, stripe_refund_ids: ['re_1', 're_2'], refunded_at: '2026-09-23T11:00:00+02:00',
      }),
    }));
    const nothing = buildRefundPreview(confirmedDetail({
      refund: refundWith({ refund_amount_cents: 0, refund_amount_formatted: '0,00 €' }),
      refund_execution: executionWith({ outstanding_cents: 0 }),
    }));

    assert.equal(refunded.changesState, false);
    assert.equal(refunded.lines[0].text, 'Kündigung #12 ist bereits erstattet: 265,81 € am 23.09.2026 11:00 (Stripe-Refunds: re_1, re_2).');
    assert.match(texts(refunded.lines).join('\n'), /already_refunded/);
    assert.equal(nothing.changesState, false);
    assert.match(texts(nothing.lines).join('\n'), /Nichts zu erstatten.*nothing_to_refund/);
    assert.doesNotMatch(texts([...refunded.lines, ...nothing.lines]).join('\n'), /ECHTES GELD/);
  });

  it('mentions a failed or running previous attempt', () => {
    const failed = texts(buildRefundPreview(confirmedDetail({
      refund_execution: executionWith({ status: 'failed', status_label: 'Erstattung fehlgeschlagen', error: 'card_declined' }),
      warnings: [{ code: 'refund_failed', message: 'Die Erstattung ist fehlgeschlagen.' }],
    })).lines).join('\n');
    const pending = texts(buildRefundPreview(confirmedDetail({
      refund_execution: executionWith({ status: 'pending', status_label: 'Erstattung läuft' }),
    })).lines).join('\n');

    assert.match(failed, /Letzter Versuch fehlgeschlagen: card_declined/);
    assert.doesNotMatch(failed, /\[refund_failed\]/);
    assert.match(pending, /409 refund_in_progress/);
  });
});

describe('buildRefundResultLines', () => {
  it('reports refunded, already_refunded and nothing_to_refund', () => {
    const detail = confirmedDetail({
      refund_execution: executionWith({
        status: 'refunded', status_label: 'Erstattet', refunded_cents: 26_581, refunded_formatted: '265,81 €',
        outstanding_cents: 0, stripe_refund_ids: ['re_1'], refunded_at: '2026-09-23T11:00:00+02:00',
      }),
    });

    const refunded = buildRefundResultLines({ data: detail, meta: { result: 'refunded' } });
    const again = buildRefundResultLines({ data: detail, meta: { result: 'already_refunded' } });
    const nothing = buildRefundResultLines({ data: confirmedDetail(), meta: { result: 'nothing_to_refund' } });

    assert.deepEqual(refunded[0], { kind: 'action', text: 'Kündigung #12: 265,81 € über Stripe erstattet.' });
    assert.ok(texts(refunded).includes('Stripe-Refunds: re_1'));
    assert.deepEqual(again[0], { kind: 'note', text: 'Kündigung #12 war bereits erstattet (265,81 €), nichts geändert.' });
    assert.deepEqual(nothing[0], { kind: 'note', text: 'Kündigung #12: nichts zu erstatten, kein Stripe-Aufruf.' });
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

  it('alerts on a failed Stripe subscription cancellation and reminds of the open refund', () => {
    const detail = confirmedDetail({
      subscription_cancellation: { status: 'failed', error: 'Stripe nicht erreichbar' },
      warnings: [{ code: 'subscription_cancellation_failed', message: 'Das Stripe-Abo konnte nicht gekündigt werden.' }],
    });

    const lines = buildActionResultLines({ data: detail, meta: { result: 'confirmed' } });

    assert.ok(texts(lines).includes('Abo-Kündigung: FEHLGESCHLAGEN, in Stripe kündigen (Stripe nicht erreichbar)'));
    assert.match(lines.find((line) => line.kind === 'blocked')?.text ?? '', /^ACHTUNG: Das Stripe-Abo konnte nicht gekündigt werden/);
    assert.match(texts(lines).join('\n'), /Erstattung noch offen: 265,81 €\. Vorschau: lernplattform kuendigungen refund 12/);
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

  it('computes the withdrawal due date 14 days after the day of receipt', () => {
    assert.equal(withdrawalDueDateFromReceipt('2026-09-20T23:30:00+02:00'), '2026-10-04');
    assert.equal(withdrawalDueDateFromReceipt('2026-12-25T08:00:00+01:00'), '2027-01-08');
  });
});
