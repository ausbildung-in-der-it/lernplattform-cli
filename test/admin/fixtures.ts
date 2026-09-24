import type { CancellationRequestDetail } from '../../src/admin/cancellation-requests';

export function cancellationDetail(overrides: Partial<CancellationRequestDetail> = {}): CancellationRequestDetail {
  return {
    id: 12,
    type: 'ordentlich',
    type_label: 'Ordentliche Kündigung',
    status: 'pending',
    status_label: 'Ausstehend',
    reason: null,
    important_reason_accepted: null,
    received_at: '2026-06-10T09:12:00+02:00',
    withdrawal_refund_due_at: null,
    withdrawal_recognized_at: null,
    age_days: 105,
    participant: {
      user_id: 5,
      name: 'Max Muster',
      email: 'max@example.com',
      address: { street: 'Musterweg 1', zip: '12345', city: 'Musterstadt' },
      address_formatted: 'Musterweg 1, 12345 Musterstadt',
    },
    pass: {
      user_pass_id: 7,
      name: 'IT-Pass 12 Monate',
      duration_months: 12,
      purchased_at: '2026-01-10T09:00:00+01:00',
      activated_at: '2026-01-10T10:00:00+01:00',
      valid_until: '2027-01-10',
      user_pass_status: 'ACTIVATED',
      is_b2b: false,
      company_name: null,
    },
    payment_mode: 'one_time',
    subscription: null,
    effective_date: {
      stored: '2026-09-01',
      recalculated: '2026-12-23',
      recalculation_explanation: null,
      recalculation_error: null,
      recalculated_ends_regularly: false,
      recalculated_reinterpreted_as_ordinary: false,
    },
    refund: {
      total_price_cents: 58_800,
      total_price_formatted: '588,00 €',
      total_months: 12,
      total_days: 365,
      used_days: 200,
      owed_amount_cents: 32_219,
      owed_amount_formatted: '322,19 €',
      paid_amount_cents: 58_800,
      paid_amount_formatted: '588,00 €',
      refund_amount_cents: 26_581,
      refund_amount_formatted: '265,81 €',
      calculation_explanation: '200 von 365 Tagen genutzt',
      is_paid_amount_estimated: false,
      is_contract_price_estimated: false,
      is_withdrawal: false,
      payment_mode: 'one_time',
    },
    refund_error: null,
    refund_execution: {
      status: 'none',
      status_label: 'Nicht erstattet',
      refunded_cents: 0,
      refunded_formatted: '0,00 €',
      outstanding_cents: 26_581,
      stripe_refund_ids: [],
      refunded_at: null,
      error: null,
    },
    subscription_cancellation: { status: null, error: null },
    review: { reviewed_at: null, reviewed_by: null, admin_notes: null, rejection_reason: null },
    warnings: [{ code: 'contract_price_unknown', message: 'Der vereinbarte Vertragspreis ist nicht gespeichert.' }],
    ...overrides,
  };
}

/** Bestätigte Kündigung mit offener Erstattung. */
export function confirmedDetail(overrides: Partial<CancellationRequestDetail> = {}): CancellationRequestDetail {
  return cancellationDetail({
    status: 'confirmed',
    status_label: 'Bestätigt',
    warnings: [],
    review: {
      reviewed_at: '2026-09-23T10:00:00+02:00',
      reviewed_by: { id: 1, name: 'Admin', email: 'admin@example.com' },
      admin_notes: null,
      rejection_reason: null,
    },
    ...overrides,
  });
}

/** Erklärung vom Kündigungsbutton ohne zugeordneten Vertrag, mit zwei Kandidaten des gefundenen Kontos. */
export function unmatchedDetail(overrides: Partial<CancellationRequestDetail> = {}): CancellationRequestDetail {
  const candidate = cancellationDetail().pass as NonNullable<CancellationRequestDetail['pass']>;
  return cancellationDetail({
    id: 31,
    source: 'cancellation_button',
    received_at: '2026-09-24T10:00:00+02:00',
    age_days: 0,
    participant: {
      user_id: 5,
      name: 'Mia Muster',
      email: 'mia@example.com',
      address: null,
      address_formatted: null,
      company_name: null,
      contract_reference: 'Rechnung RE-7',
    },
    pass: null,
    payment_mode: null,
    effective_date: {
      stored: null,
      recalculated: null,
      recalculation_explanation: null,
      recalculation_error: 'Die Erklärung ist noch keinem Vertrag zugeordnet.',
      recalculated_ends_regularly: false,
      recalculated_reinterpreted_as_ordinary: false,
      requested: null,
    },
    refund: null,
    refund_error: 'Die Erklärung ist noch keinem Vertrag zugeordnet.',
    assignment: {
      unmatched: true,
      assigned_at: null,
      assigned_by: null,
      account_user_id: 5,
      candidates: [
        { ...candidate, user_pass_id: 1954, name: 'AP1 – 12 Monate', holder_email: 'mia@example.com' },
        { ...candidate, user_pass_id: 1955, name: 'AP2 – 12 Monate', holder_email: 'mia@example.com' },
      ],
    },
    warnings: [{ code: 'unmatched', message: 'Über den Kündigungsbutton eingegangen und keinem eindeutigen Vertrag zugeordnet.' }],
    ...overrides,
  });
}

/** Widerruf nach 14 Tagen, innerhalb von 12 Monaten und 14 Tagen: wartet auf die Entscheidung (AIDI-772). */
export function lateWithdrawalDetail(overrides: Partial<CancellationRequestDetail> = {}): CancellationRequestDetail {
  return cancellationDetail({
    id: 41,
    type: 'widerruf',
    type_label: 'Widerruf',
    received_at: '2026-09-24T10:00:00+02:00',
    withdrawal_refund_due_at: null,
    effective_date: {
      stored: null,
      recalculated: '2026-12-01',
      recalculation_explanation: 'Erklärung als ordentliche Kündigung zum nächstmöglichen Termin behandelt (§ 140 BGB).',
      recalculation_error: null,
      recalculated_ends_regularly: false,
      recalculated_reinterpreted_as_ordinary: true,
    },
    warnings: [{ code: 'withdrawal_period_extended_possible', message: 'Widerruf nach Ablauf der regulären Frist.' }],
    ...overrides,
  });
}

/** Refund-Block mit überschriebenen Feldern (Fixture-Default ist nicht null). */
export function refundWith(overrides: Partial<NonNullable<CancellationRequestDetail['refund']>>): NonNullable<CancellationRequestDetail['refund']> {
  return { ...(cancellationDetail().refund as NonNullable<CancellationRequestDetail['refund']>), ...overrides };
}

export function executionWith(overrides: Partial<CancellationRequestDetail['refund_execution']>): CancellationRequestDetail['refund_execution'] {
  return { ...cancellationDetail().refund_execution, ...overrides };
}

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export interface StubResponse {
  status: number;
  body: unknown;
  /** Response-Header; ohne Angabe Content-Type application/json */
  headers?: Record<string, string>;
}

export type FetchResponder = (call: RecordedCall) => StubResponse | Promise<never>;

const originalFetch = globalThis.fetch;

/** Ersetzt fetch; der Responder entscheidet pro Aufruf über Status und Body. */
export function stubFetch(responder: FetchResponder): RecordedCall[] {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: RecordedCall = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body === undefined ? undefined : String(init.body),
    };
    calls.push(call);
    const { status, body, headers } = await responder(call);
    const text = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body);
    return new Response(text, { status, headers: headers ?? { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}

export function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}
