/**
 * Kündigungsanfragen (AIDI-764): Typen der Admin-API, API-Aufrufe und die
 * Vorschau-/Ergebnistexte von confirm und reject als reine, testbare Funktionen.
 *
 * Feldnamen und Codes kommen 1:1 aus der Plattform (snake_case).
 */

import type { AdminApiClient } from './client';

export const CANCELLATION_STATUSES = ['pending', 'confirmed', 'rejected', 'withdrawn'] as const;
export type CancellationStatus = (typeof CANCELLATION_STATUSES)[number];
export type CancellationStatusFilter = CancellationStatus | 'all';
export const CANCELLATION_STATUS_FILTERS: readonly CancellationStatusFilter[] = [...CANCELLATION_STATUSES, 'all'];

export type PaymentMode = 'free' | 'one_time' | 'subscription';

/** Bestätigt, Abo vorhanden, aber ohne Enddatum: Stripe cancel_at ist vermutlich fehlgeschlagen. */
export const STRIPE_CANCEL_MISSING_WARNING = 'subscription_cancel_at_missing';

export interface CancellationWarning {
  code: string;
  message: string;
}

export interface CancellationRequestSummary {
  id: number;
  type: string;
  type_label: string;
  status: CancellationStatus;
  status_label: string;
  received_at: string;
  age_days: number;
  effective_date: string | null;
  participant_name: string;
  participant_email: string;
  pass_name: string | null;
  payment_mode: PaymentMode;
  warnings: CancellationWarning[];
}

export interface CancellationRequestListResponse {
  data: CancellationRequestSummary[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    status: CancellationStatusFilter;
  };
}

export interface CancellationRequestDetail {
  id: number;
  type: string;
  type_label: string;
  status: CancellationStatus;
  status_label: string;
  reason: string | null;
  received_at: string;
  age_days: number;
  participant: {
    user_id: number;
    name: string;
    email: string;
    address: { street: string | null; zip: string | null; city: string | null } | null;
    address_formatted: string | null;
  };
  pass: {
    user_pass_id: number;
    name: string;
    duration_months: number | null;
    purchased_at: string | null;
    activated_at: string | null;
    valid_until: string | null;
    user_pass_status: string | null;
    is_b2b: boolean;
    company_name: string | null;
  } | null;
  payment_mode: PaymentMode;
  subscription: {
    stripe_id: string;
    stripe_status: string;
    ends_at: string | null;
    is_canceled: boolean;
  } | null;
  effective_date: {
    stored: string | null;
    recalculated: string | null;
    recalculation_explanation: string | null;
    recalculation_error: string | null;
  };
  refund: {
    total_price_cents: number;
    total_price_formatted: string;
    total_months: number;
    total_days: number;
    used_days: number;
    owed_amount_cents: number;
    owed_amount_formatted: string;
    paid_amount_cents: number;
    paid_amount_formatted: string;
    refund_amount_cents: number;
    refund_amount_formatted: string;
    calculation_explanation: string | null;
    is_paid_amount_estimated: boolean;
    payment_mode: PaymentMode;
  } | null;
  refund_error: string | null;
  review: {
    reviewed_at: string | null;
    reviewed_by: { id: number; name: string | null; email: string } | null;
    admin_notes: string | null;
    rejection_reason: string | null;
  };
  warnings: CancellationWarning[];
}

export interface CancellationRequestResponse {
  data: CancellationRequestDetail;
}

export type CancellationActionResult = 'confirmed' | 'already_confirmed' | 'rejected' | 'already_rejected';

export interface CancellationActionResponse {
  data: CancellationRequestDetail;
  meta: { result: CancellationActionResult };
}

// ============================================================================
// API-Aufrufe
// ============================================================================

const BASE_PATH = '/cancellation-requests';

export async function listCancellationRequests(
  client: AdminApiClient,
  options: { status?: CancellationStatusFilter; page?: number; perPage?: number } = {}
): Promise<CancellationRequestListResponse> {
  return client.get<CancellationRequestListResponse>(BASE_PATH, {
    status: options.status,
    page: options.page,
    per_page: options.perPage,
  });
}

export async function getCancellationRequest(client: AdminApiClient, id: number): Promise<CancellationRequestResponse> {
  return client.get<CancellationRequestResponse>(`${BASE_PATH}/${id}`);
}

export async function confirmCancellationRequest(
  client: AdminApiClient,
  id: number,
  options: { adminNotes?: string; idempotencyKey?: string } = {}
): Promise<CancellationActionResponse> {
  const body = options.adminNotes ? { admin_notes: options.adminNotes } : {};
  return client.post<CancellationActionResponse>(`${BASE_PATH}/${id}/confirmation`, body, {
    idempotencyKey: options.idempotencyKey,
  });
}

export async function rejectCancellationRequest(
  client: AdminApiClient,
  id: number,
  rejectionReason: string,
  options: { idempotencyKey?: string } = {}
): Promise<CancellationActionResponse> {
  return client.post<CancellationActionResponse>(
    `${BASE_PATH}/${id}/rejection`,
    { rejection_reason: rejectionReason },
    { idempotencyKey: options.idempotencyKey }
  );
}

// ============================================================================
// Darstellungshelfer
// ============================================================================

export const DASH = '—';

/** YYYY-MM-DD oder ISO-Zeitpunkt -> TT.MM.JJJJ (Kalendertag laut Offset der API). */
export function formatGermanDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/** ISO-Zeitpunkt -> TT.MM.JJJJ HH:MM (Uhrzeit laut Offset der API). */
export function formatGermanDateTime(value: string | null | undefined): string {
  if (!value) return DASH;
  const time = /T(\d{2}:\d{2})/.exec(value);
  return time ? `${formatGermanDate(value)} ${time[1]}` : formatGermanDate(value);
}

const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  free: 'kostenlos',
  one_time: 'Einmalzahlung',
  subscription: 'Abo',
};

export function paymentModeLabel(mode: string): string {
  return PAYMENT_MODE_LABELS[mode as PaymentMode] ?? mode;
}

/** Kurzcodes für die Warnungen-Spalte der Liste. Details mit `show <id>`. */
export const SHORT_WARNING_LABELS: Record<string, string> = {
  effective_date_in_past: 'datum-vergangen',
  pending_longer_than_14_days: 'offen>14d',
  refund_based_on_catalog_price: 'katalogpreis',
  subscription_already_canceled: 'abo-gekuendigt',
  access_continues_after_effective_date: 'zugang-laenger',
  subscription_cancel_at_missing: 'STRIPE-KUENDIGUNG-FEHLT',
  subscription_end_differs_from_effective_date: 'abo-ende-abweichend',
};

export function shortWarningLabel(code: string): string {
  return SHORT_WARNING_LABELS[code] ?? code;
}

// ============================================================================
// Vorschau (confirm/reject ohne --force) und Ergebnis (mit --force)
// ============================================================================

export type PreviewLineKind = 'action' | 'note' | 'warning' | 'blocked' | 'hint';

export interface PreviewLine {
  kind: PreviewLineKind;
  text: string;
}

export interface ActionPreview {
  /** false, wenn ein Aufruf mit --force nichts ändert oder vom Server mit 409 abgelehnt wird */
  changesState: boolean;
  lines: PreviewLine[];
}

const EXECUTE_HINT: PreviewLine = { kind: 'hint', text: 'Zum Ausführen: denselben Befehl mit --force wiederholen.' };

function warningLines(warnings: CancellationWarning[]): PreviewLine[] {
  return warnings.map((warning) => ({ kind: 'warning', text: `[${warning.code}] ${warning.message}` }));
}

function reviewedByText(detail: CancellationRequestDetail): string {
  const { reviewed_at: reviewedAt, reviewed_by: reviewedBy } = detail.review;
  const reviewer = reviewedBy ? reviewedBy.name || reviewedBy.email : '';
  const parts = [reviewedAt ? `am ${formatGermanDateTime(reviewedAt)}` : '', reviewer ? `von ${reviewer}` : ''];
  const text = parts.filter(Boolean).join(' ');
  return text ? ` (${text})` : '';
}

function refundLine(detail: CancellationRequestDetail): PreviewLine {
  if (detail.refund) {
    const estimated = detail.refund.is_paid_amount_estimated ? ', bezahlter Betrag geschätzt' : '';
    return {
      kind: 'note',
      text: `Berechnete Erstattung: ${detail.refund.refund_amount_formatted} (wird NICHT automatisch ausgelöst, siehe AIDI-749${estimated})`,
    };
  }

  const reason = detail.refund_error ? `: ${detail.refund_error}` : '';
  return { kind: 'note', text: `Keine Erstattung berechnet${reason}` };
}

export function buildConfirmationPreview(
  detail: CancellationRequestDetail,
  options: { adminNotes?: string } = {}
): ActionPreview {
  const label = `Kündigung #${detail.id}`;

  if (detail.status === 'confirmed') {
    return {
      changesState: false,
      lines: [
        { kind: 'blocked', text: `${label} ist bereits bestätigt${reviewedByText(detail)}.` },
        { kind: 'note', text: 'Ein Aufruf mit --force ändert nichts (Server antwortet already_confirmed, keine Mail, kein Stripe-Aufruf).' },
        ...warningLines(detail.warnings),
      ],
    };
  }

  if (detail.status !== 'pending') {
    return {
      changesState: false,
      lines: [
        { kind: 'blocked', text: `${label} ist ${detail.status_label.toLowerCase()} (${detail.status}) und kann nicht bestätigt werden.` },
        { kind: 'note', text: 'Ein Aufruf mit --force wird vom Server mit 409 (Konflikt) abgelehnt.' },
        ...warningLines(detail.warnings),
      ],
    };
  }

  const lines: PreviewLine[] = [{ kind: 'action', text: `${label} wird bestätigt.` }];
  const { subscription } = detail;

  if (subscription && subscription.is_canceled) {
    const endsAt = subscription.ends_at ? ` (${formatGermanDate(subscription.ends_at)})` : '';
    lines.push({
      kind: 'note',
      text: `Stripe-Abo ${subscription.stripe_id} hat bereits ein Enddatum${endsAt} und wird nicht angepasst.`,
    });
  } else if (subscription) {
    const { stored } = detail.effective_date;
    lines.push(
      stored
        ? { kind: 'action', text: `Stripe-Abo ${subscription.stripe_id} wird zum ${formatGermanDate(stored)} gekündigt.` }
        : { kind: 'warning', text: `Stripe-Abo ${subscription.stripe_id} soll gekündigt werden, aber es ist kein Wirksamkeitsdatum gespeichert.` }
    );
  }

  lines.push({ kind: 'action', text: `Bestätigungsmail an ${detail.participant.email}.` }, refundLine(detail));

  if (options.adminNotes) {
    lines.push({ kind: 'note', text: `Interne Notiz: ${options.adminNotes}` });
  }

  lines.push(...warningLines(detail.warnings), EXECUTE_HINT);
  return { changesState: true, lines };
}

export function buildRejectionPreview(detail: CancellationRequestDetail, rejectionReason: string): ActionPreview {
  const label = `Kündigung #${detail.id}`;

  if (detail.status === 'rejected') {
    const storedReason: PreviewLine[] = detail.review.rejection_reason
      ? [{ kind: 'note', text: `Gespeicherte Begründung: ${detail.review.rejection_reason}` }]
      : [];
    return {
      changesState: false,
      lines: [
        { kind: 'blocked', text: `${label} ist bereits abgelehnt${reviewedByText(detail)}.` },
        { kind: 'note', text: 'Ein Aufruf mit --force ändert nichts (Server antwortet already_rejected, keine Mail).' },
        ...storedReason,
        ...warningLines(detail.warnings),
      ],
    };
  }

  if (detail.status !== 'pending') {
    return {
      changesState: false,
      lines: [
        { kind: 'blocked', text: `${label} ist ${detail.status_label.toLowerCase()} (${detail.status}) und kann nicht abgelehnt werden.` },
        { kind: 'note', text: 'Ein Aufruf mit --force wird vom Server mit 409 (Konflikt) abgelehnt.' },
        ...warningLines(detail.warnings),
      ],
    };
  }

  return {
    changesState: true,
    lines: [
      { kind: 'action', text: `${label} wird abgelehnt.` },
      { kind: 'action', text: `Ablehnungsmail an ${detail.participant.email} mit Begründung: „${rejectionReason}“` },
      ...warningLines(detail.warnings),
      EXECUTE_HINT,
    ],
  };
}

const RESULT_TEXTS: Record<CancellationActionResult, { changed: boolean; text: (id: number) => string }> = {
  confirmed: { changed: true, text: (id) => `Kündigung #${id} bestätigt.` },
  already_confirmed: { changed: false, text: (id) => `Kündigung #${id} war bereits bestätigt, nichts geändert.` },
  rejected: { changed: true, text: (id) => `Kündigung #${id} abgelehnt.` },
  already_rejected: { changed: false, text: (id) => `Kündigung #${id} war bereits abgelehnt, nichts geändert.` },
};

/** Ergebniszeilen nach einem ausgeführten confirm/reject. */
export function buildActionResultLines(response: CancellationActionResponse): PreviewLine[] {
  const detail = response.data;
  const result = RESULT_TEXTS[response.meta.result];
  const lines: PreviewLine[] = [
    result
      ? { kind: result.changed ? 'action' : 'note', text: result.text(detail.id) }
      : { kind: 'note', text: `Kündigung #${detail.id}: Ergebnis ${response.meta.result}` },
    { kind: 'note', text: `Status jetzt: ${detail.status_label} (${detail.status})` },
  ];

  if (detail.subscription) {
    const endsAt = detail.subscription.ends_at ? formatGermanDate(detail.subscription.ends_at) : 'kein Enddatum';
    lines.push({
      kind: 'note',
      text: `Stripe-Abo ${detail.subscription.stripe_id}: ${detail.subscription.stripe_status}, Ende ${endsAt}`,
    });
  }

  const stripeMissing = detail.warnings.find((warning) => warning.code === STRIPE_CANCEL_MISSING_WARNING);
  if (stripeMissing) {
    const target = detail.effective_date.stored ? ` zum ${formatGermanDate(detail.effective_date.stored)}` : '';
    lines.push({
      kind: 'blocked',
      text:
        `ACHTUNG: Stripe-Kündigung vermutlich fehlgeschlagen. Das Abo ${detail.subscription?.stripe_id ?? ''} hat kein Enddatum. ` +
        `In Stripe prüfen und das Abo manuell${target} kündigen. [${stripeMissing.code}] ${stripeMissing.message}`,
    });
  }

  lines.push(...warningLines(detail.warnings.filter((warning) => warning.code !== STRIPE_CANCEL_MISSING_WARNING)));
  return lines;
}
