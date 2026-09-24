/**
 * Kündigungsanfragen (AIDI-764, AIDI-749): Typen der Admin-API, API-Aufrufe und
 * die Vorschau-/Ergebnistexte von confirm, reject und refund als reine,
 * testbare Funktionen.
 *
 * Feldnamen und Codes kommen 1:1 aus der Plattform (snake_case,
 * src/Domain/Pass/Data/Admin/*, CancellationWarningCode).
 */

import type { AdminApiClient } from './client';

export const CANCELLATION_STATUSES = ['pending', 'confirmed', 'rejected', 'withdrawn'] as const;
export type CancellationStatus = (typeof CANCELLATION_STATUSES)[number];
export type CancellationStatusFilter = CancellationStatus | 'all';
export const CANCELLATION_STATUS_FILTERS: readonly CancellationStatusFilter[] = [...CANCELLATION_STATUSES, 'all'];

export type CancellationType = 'ordentlich' | 'ausserordentlich' | 'widerruf';
export type PaymentMode = 'free' | 'one_time' | 'subscription';
/** partially_refunded: nach einer Erstattung kam noch eine Zahlung, der Rest ist offen (refund zahlt ihn) */
export type RefundStatus = 'none' | 'pending' | 'refunded' | 'partially_refunded' | 'failed';
export type SubscriptionCancellationStatus =
  | 'scheduled'
  | 'already_scheduled'
  | 'canceled_immediately'
  | 'already_ended'
  | 'not_found'
  /** alt: vor dem Review-Fix K1 wurden Bündel-Abos nicht gekündigt; die Plattform schreibt den Wert nicht mehr */
  | 'bundle_skipped'
  | 'failed';

/** Warum eine Erklärung unzulässig ist (rejection_ground). Eine wirksame Kündigung wird bestätigt, nicht abgelehnt. */
export const REJECTION_GROUNDS = {
  duplikat: 'duplicate',
  'keine-erklaerung': 'not_a_declaration',
  'falscher-vertrag': 'wrong_contract',
  'widerruf-ausgeschlossen': 'withdrawal_not_available',
} as const;
export type RejectionGround = (typeof REJECTION_GROUNDS)[keyof typeof REJECTION_GROUNDS];

export const REJECTION_GROUND_LABELS: Record<RejectionGround, string> = {
  duplicate: 'Doppelte Erklärung zu einem Vertrag, der schon gekündigt ist oder geprüft wird',
  not_a_declaration: 'Keine Kündigungserklärung (Frage, Versehen, zurückgenommen)',
  wrong_contract: 'Betrifft keinen Vertrag des Absenders (falscher Pass, kein Vertragspartner)',
  withdrawal_not_available: 'Widerruf ausgeschlossen: Frist abgelaufen oder kein Verbrauchervertrag',
};

/** Deutscher Kurzname oder API-Wert -> API-Wert; null, wenn unbekannt. */
export function parseRejectionGround(value: string): RejectionGround | null {
  const normalized = value.trim().toLowerCase();
  if (normalized in REJECTION_GROUNDS) return REJECTION_GROUNDS[normalized as keyof typeof REJECTION_GROUNDS];
  return (Object.values(REJECTION_GROUNDS) as string[]).includes(normalized) ? (normalized as RejectionGround) : null;
}

/** Warn-Codes der Plattform (CancellationWarningCode), mit denen die CLI eigene Texte verbindet. */
export const WARNING = {
  effectiveDateInPast: 'effective_date_in_past',
  pendingLongerThan14Days: 'pending_longer_than_14_days',
  subscriptionAlreadyCanceled: 'subscription_already_canceled',
  accessContinuesAfterEffectiveDate: 'access_continues_after_effective_date',
  subscriptionCancelAtMissing: 'subscription_cancel_at_missing',
  subscriptionEndDiffersFromEffectiveDate: 'subscription_end_differs_from_effective_date',
  subscriptionNotFound: 'subscription_not_found',
  userPassMissing: 'user_pass_missing',
  paidAmountUnknown: 'paid_amount_unknown',
  contractPriceUnknown: 'contract_price_unknown',
  withdrawalRefundDue: 'withdrawal_refund_due',
  importantReasonDecisionRequired: 'important_reason_decision_required',
  bundleSubscription: 'bundle_subscription',
  bundleSubscriptionAmbiguous: 'bundle_subscription_ambiguous',
  companyMultiSeatSubscription: 'company_multi_seat_subscription',
  refundOutstanding: 'refund_outstanding',
  subscriptionCancellationFailed: 'subscription_cancellation_failed',
  refundFailed: 'refund_failed',
  withdrawalPossible: 'withdrawal_possible',
} as const;

/** Bestätigt, Abo vorhanden, aber ohne Enddatum: Stripe cancel_at ist vermutlich fehlgeschlagen. */
export const STRIPE_CANCEL_MISSING_WARNING = WARNING.subscriptionCancelAtMissing;

/** Warnungen, bei denen Geld oder ein Abo falsch laufen kann: rot statt gelb, Kurzcode in Versalien. */
export const CRITICAL_WARNINGS: readonly string[] = [
  WARNING.subscriptionCancelAtMissing,
  WARNING.subscriptionCancellationFailed,
  WARNING.subscriptionNotFound,
  WARNING.refundFailed,
  WARNING.paidAmountUnknown,
  WARNING.bundleSubscriptionAmbiguous,
  WARNING.companyMultiSeatSubscription,
];

/** Übergangssperre bis AIDI-776: Firmen kündigen Lizenzen einzeln, das ist noch nicht automatisiert. */
export const COMPANY_MULTI_SEAT_TEXT =
  'Firmen-Abo mit mehreren Lizenzen, Teilkündigung ist noch nicht automatisiert (AIDI-776). In Stripe die Menge zum Wirksamkeitsdatum manuell reduzieren und den Zugang nur dieser Lizenz beenden.';

/** Text für paid_amount_unknown in show, Liste und Vorschau. */
export const LEDGER_MISSING_TEXT = 'Bestätigen gesperrt, Zahlungsbuch fehlt (Backfill)';

export interface CancellationWarning {
  code: string;
  message: string;
}

export interface CancellationRequestSummary {
  id: number;
  type: CancellationType;
  type_label: string;
  /** gesetzt, wenn die Anfrage beim Bestätigen als Widerruf behandelt wurde (treat_as_withdrawal) */
  withdrawal_recognized_at?: string | null;
  status: CancellationStatus;
  status_label: string;
  received_at: string;
  age_days: number;
  effective_date: string | null;
  participant_name: string;
  participant_email: string;
  pass_name: string | null;
  payment_mode: PaymentMode | null;
  refund_status: RefundStatus;
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

export interface CancellationRefund {
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
  /** Zahlungsbuch leer: bezahlt ist unbekannt (Warnung paid_amount_unknown) */
  is_paid_amount_estimated: boolean;
  /** Vertragspreis fehlt, gerechnet mit dem Katalogpreis (Warnung contract_price_unknown) */
  is_contract_price_estimated: boolean;
  /** Widerruf: voller Betrag */
  is_withdrawal: boolean;
  payment_mode: PaymentMode;
}

export interface CancellationRefundExecution {
  status: RefundStatus;
  status_label: string;
  refunded_cents: number;
  refunded_formatted: string;
  /** berechnete Erstattung minus erstattet, null wenn nicht berechenbar */
  outstanding_cents: number | null;
  stripe_refund_ids: string[];
  refunded_at: string | null;
  error: string | null;
}

export interface CancellationRequestDetail {
  id: number;
  type: CancellationType;
  type_label: string;
  status: CancellationStatus;
  status_label: string;
  reason: string | null;
  /** nur bei außerordentlicher Kündigung nach der Bearbeitung gesetzt */
  important_reason_accepted: boolean | null;
  /** gesetzt, wenn die Anfrage beim Bestätigen als Widerruf behandelt wurde (treat_as_withdrawal); type bleibt die Wahl des Kunden */
  withdrawal_recognized_at?: string | null;
  received_at: string;
  /** nur bei Widerruf: Erstattung spätestens bis (YYYY-MM-DD) */
  withdrawal_refund_due_at: string | null;
  age_days: number;
  participant: {
    user_id: number;
    name: string;
    email: string;
    address: { street: string | null; zip: string | null; city: string | null } | null;
    address_formatted: string | null;
  };
  /** null, wenn der Pass gelöscht ist (Warnung user_pass_missing) */
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
  payment_mode: PaymentMode | null;
  subscription: {
    stripe_id: string;
    stripe_status: string;
    ends_at: string | null;
    is_canceled: boolean;
  } | null;
  effective_date: {
    stored: string | null;
    /** bei pending außerordentlich: ohne anerkannten wichtigen Grund gerechnet */
    recalculated: string | null;
    recalculation_explanation: string | null;
    recalculation_error: string | null;
    recalculated_ends_regularly: boolean;
    recalculated_reinterpreted_as_ordinary: boolean;
  };
  refund: CancellationRefund | null;
  refund_error: string | null;
  refund_execution: CancellationRefundExecution;
  subscription_cancellation: {
    status: SubscriptionCancellationStatus | null;
    error: string | null;
    /** Bündel = ein Vertrag: die anderen Pässe des Abos, die mit enden (vor der Bestätigung: enden würden) */
    bundle_user_pass_ids?: number[];
    /** Abo bezahlt Pässe aus einem anderen Kauf: Bestätigen gesperrt (409 bundle_subscription_ambiguous) */
    bundle_ambiguous?: boolean;
  };
  review: {
    reviewed_at: string | null;
    reviewed_by: { id: number; name: string | null; email: string } | null;
    admin_notes: string | null;
    rejection_reason: string | null;
    rejection_ground?: RejectionGround | null;
  };
  warnings: CancellationWarning[];
}

export interface CancellationRequestResponse {
  data: CancellationRequestDetail;
}

export type CancellationActionResult = 'confirmed' | 'already_confirmed' | 'rejected' | 'already_rejected';
export type CancellationRefundResult = 'refunded' | 'already_refunded' | 'nothing_to_refund';

export interface CancellationActionResponse {
  data: CancellationRequestDetail;
  meta: { result: CancellationActionResult };
}

export interface CancellationRefundResponse {
  data: CancellationRequestDetail;
  meta: { result: CancellationRefundResult };
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
  options: { adminNotes?: string; importantReasonAccepted?: boolean; treatAsWithdrawal?: boolean; idempotencyKey?: string } = {}
): Promise<CancellationActionResponse> {
  const body: Record<string, unknown> = {};
  if (options.adminNotes) body.admin_notes = options.adminNotes;
  if (options.importantReasonAccepted) body.important_reason_accepted = true;
  if (options.treatAsWithdrawal) body.treat_as_withdrawal = true;

  return client.post<CancellationActionResponse>(`${BASE_PATH}/${id}/confirmation`, body, {
    idempotencyKey: options.idempotencyKey,
  });
}

export async function rejectCancellationRequest(
  client: AdminApiClient,
  id: number,
  rejectionReason: string,
  rejectionGround: RejectionGround,
  options: { idempotencyKey?: string } = {}
): Promise<CancellationActionResponse> {
  return client.post<CancellationActionResponse>(
    `${BASE_PATH}/${id}/rejection`,
    { rejection_ground: rejectionGround, rejection_reason: rejectionReason },
    { idempotencyKey: options.idempotencyKey }
  );
}

/** Zahlt die berechnete Erstattung über Stripe aus. Echtes Geld. */
export async function refundCancellationRequest(
  client: AdminApiClient,
  id: number,
  options: { idempotencyKey?: string } = {}
): Promise<CancellationRefundResponse> {
  return client.post<CancellationRefundResponse>(`${BASE_PATH}/${id}/refund`, {}, { idempotencyKey: options.idempotencyKey });
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

/** Cent -> "1.234,56 €" wie PriceFormatter der Plattform. */
export function formatEuroCents(cents: number): string {
  return `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)} €`;
}

/**
 * Widerruf: Erstattung fällig 14 Tage nach Eingang (§ 357 Abs. 1 BGB), gerechnet
 * vom Kalendertag des Eingangs. Nur für die Liste, deren Zeilen das Feld
 * withdrawal_refund_due_at nicht haben; show nutzt den Wert der API.
 */
export function withdrawalDueDateFromReceipt(receivedAt: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(receivedAt);
  if (!match) return null;
  const due = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + WITHDRAWAL_PERIOD_DAYS));
  return due.toISOString().slice(0, 10);
}

const WITHDRAWAL_PERIOD_DAYS = 14;

const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  free: 'kostenlos',
  one_time: 'Einmalzahlung',
  subscription: 'Abo',
};

export function paymentModeLabel(mode: string | null | undefined): string {
  if (!mode) return DASH;
  return PAYMENT_MODE_LABELS[mode as PaymentMode] ?? mode;
}

/** Kurzcodes für die Warnungen-Spalte der Liste. Details mit `show <id>`. */
export const SHORT_WARNING_LABELS: Record<string, string> = {
  [WARNING.effectiveDateInPast]: 'datum-vergangen',
  [WARNING.pendingLongerThan14Days]: 'offen>14d',
  [WARNING.subscriptionAlreadyCanceled]: 'abo-gekuendigt',
  [WARNING.accessContinuesAfterEffectiveDate]: 'zugang-laenger',
  [WARNING.subscriptionCancelAtMissing]: 'STRIPE-KUENDIGUNG-FEHLT',
  [WARNING.subscriptionEndDiffersFromEffectiveDate]: 'abo-ende-abweichend',
  [WARNING.subscriptionNotFound]: 'ABO-NICHT-IN-STRIPE',
  [WARNING.userPassMissing]: 'pass-geloescht',
  [WARNING.paidAmountUnknown]: 'ZAHLUNGSBUCH-FEHLT',
  [WARNING.contractPriceUnknown]: 'vertragspreis-fehlt',
  [WARNING.withdrawalRefundDue]: 'widerruf-erstatten',
  [WARNING.importantReasonDecisionRequired]: 'wichtiger-grund-offen',
  [WARNING.bundleSubscription]: 'abo-buendel',
  [WARNING.bundleSubscriptionAmbiguous]: 'ABO-BUENDEL-UNKLAR',
  [WARNING.companyMultiSeatSubscription]: 'FIRMA-MEHRLIZENZ',
  [WARNING.refundOutstanding]: 'erstattung-offen',
  [WARNING.subscriptionCancellationFailed]: 'ABO-KUENDIGUNG-FEHLGESCHLAGEN',
  [WARNING.refundFailed]: 'ERSTATTUNG-FEHLGESCHLAGEN',
  [WARNING.withdrawalPossible]: 'widerruf-moeglich',
};

export function shortWarningLabel(code: string): string {
  return SHORT_WARNING_LABELS[code] ?? code;
}

/** Widerruf im rechtlichen Sinn: als Widerruf erklärt oder beim Bestätigen als Widerruf behandelt. */
export function isWithdrawal(item: { type: CancellationType; withdrawal_recognized_at?: string | null }): boolean {
  return item.type === 'widerruf' || Boolean(item.withdrawal_recognized_at);
}

/** Art für Anzeige: bei treat_as_withdrawal die Kundenwahl plus „als Widerruf behandelt“. */
export function typeText(item: { type: CancellationType; type_label: string; withdrawal_recognized_at?: string | null }): string {
  return item.withdrawal_recognized_at ? `${item.type_label}, als Widerruf behandelt` : item.type_label;
}

export function hasWarning(warnings: CancellationWarning[], code: string): boolean {
  return warnings.some((warning) => warning.code === code);
}

/** Kurzform des Erstattungsstatus für die Liste. */
export const SHORT_REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  none: DASH,
  pending: 'läuft',
  refunded: 'erstattet',
  partially_refunded: 'REST-OFFEN',
  failed: 'FEHLGESCHLAGEN',
};

export const SUBSCRIPTION_CANCELLATION_LABELS: Record<SubscriptionCancellationStatus, string> = {
  scheduled: 'zum Wirksamkeitsdatum vorgemerkt (cancel_at)',
  already_scheduled: 'war schon zu einem früheren Termin vorgemerkt',
  canceled_immediately: 'sofort gekündigt',
  already_ended: 'war bereits beendet',
  not_found: 'in Stripe nicht gefunden, nichts gekündigt',
  bundle_skipped: 'nicht gekündigt (alte Bündel-Regel): Abo bezahlt mehrere Pässe, in Stripe prüfen',
  failed: 'FEHLGESCHLAGEN, in Stripe kündigen',
};

export function subscriptionCancellationLabel(status: SubscriptionCancellationStatus | null): string {
  if (!status) return DASH;
  return SUBSCRIPTION_CANCELLATION_LABELS[status] ?? status;
}

/** Wichtiger Grund einer außerordentlichen Kündigung, für show und Ergebnis. */
export function importantReasonText(detail: CancellationRequestDetail): string | null {
  if (detail.type !== 'ausserordentlich' || detail.withdrawal_recognized_at) return null;
  if (detail.important_reason_accepted === true) return 'anerkannt, sofortige Wirkung (§ 314 BGB)';
  if (detail.important_reason_accepted === false) return 'nicht anerkannt, als ordentliche Kündigung behandelt (Umdeutung, § 140 BGB)';
  return detail.status === 'pending' ? 'noch nicht entschieden (confirm --wichtiger-grund-anerkannt)' : DASH;
}

// ============================================================================
// Vorschau (confirm/reject/refund ohne --force) und Ergebnis (mit --force)
// ============================================================================

export type PreviewLineKind = 'action' | 'note' | 'warning' | 'blocked' | 'hint';

export interface PreviewLine {
  kind: PreviewLineKind;
  text: string;
}

export interface ActionPreview {
  /** false, wenn ein Aufruf mit --force nichts ändert oder vom Server abgelehnt wird (409/422) */
  changesState: boolean;
  lines: PreviewLine[];
}

const EXECUTE_HINT: PreviewLine = { kind: 'hint', text: 'Zum Ausführen: denselben Befehl mit --force wiederholen.' };

function warningLines(warnings: CancellationWarning[], skip: string[] = []): PreviewLine[] {
  return warnings
    .filter((warning) => !skip.includes(warning.code))
    .map((warning) => ({ kind: 'warning', text: `[${warning.code}] ${warning.message}` }));
}

function reviewedByText(detail: CancellationRequestDetail): string {
  const { reviewed_at: reviewedAt, reviewed_by: reviewedBy } = detail.review;
  const reviewer = reviewedBy ? reviewedBy.name || reviewedBy.email : '';
  const parts = [reviewedAt ? `am ${formatGermanDateTime(reviewedAt)}` : '', reviewer ? `von ${reviewer}` : ''];
  const text = parts.filter(Boolean).join(' ');
  return text ? ` (${text})` : '';
}

function refundCommand(id: number): string {
  return `lernplattform kuendigungen refund ${id}`;
}

/** Der Server sperrt Bestätigen und Erstatten, solange das Zahlungsbuch leer ist. */
function isLedgerMissing(detail: CancellationRequestDetail): boolean {
  return detail.refund?.is_paid_amount_estimated === true;
}

function ledgerBlockedLine(action: 'confirm' | 'refund'): PreviewLine {
  const verb = action === 'confirm' ? 'Bestätigen' : 'Erstatten';
  return {
    kind: 'blocked',
    text: `${verb} gesperrt, Zahlungsbuch fehlt (Backfill): Der gezahlte Betrag ist unbekannt. Erst auf dem Server die Zahlungen nachladen (php artisan pass:backfill-payments), dann erneut. Ein Aufruf mit --force wird mit 409 paid_amount_unknown abgelehnt.`,
  };
}

// ---------------------------------------------------------------------------
// confirm
// ---------------------------------------------------------------------------

interface EffectiveOutcome {
  /** YYYY-MM-DD oder ISO-Zeitpunkt des Wirksamkeitstags */
  date: string | null;
  immediate: boolean;
  lines: PreviewLine[];
}

/**
 * Wirksamkeit nach der Bestätigung, wie ConfirmCancellationAction sie rechnet:
 * Widerruf und anerkannter wichtiger Grund wirken sofort mit Zugang der Erklärung,
 * alles andere zum neu berechneten Termin (bei außerordentlich ohne Grund umgedeutet).
 */
function effectiveOutcome(
  detail: CancellationRequestDetail,
  decision: { importantReasonAccepted: boolean; treatAsWithdrawal: boolean }
): EffectiveOutcome {
  const received = formatGermanDate(detail.received_at);
  const { recalculated, stored } = detail.effective_date;
  const { importantReasonAccepted } = decision;

  if (decision.treatAsWithdrawal) {
    const fullAmount = detail.refund ? `volle Erstattung ${detail.refund.paid_amount_formatted}` : 'volle Erstattung des gezahlten Betrags';
    const due = withdrawalDueDateFromReceipt(detail.received_at);
    return {
      date: detail.received_at,
      immediate: true,
      lines: [
        {
          kind: 'action',
          text: `Wird als Widerruf behandelt: ${fullAmount}, Vertrag endet mit Zugang am ${received}, Zugang und Abo enden mit der Bestätigung, Erstattung fällig bis ${formatGermanDate(due)} (§§ 355, 357 BGB).`,
        },
      ],
    };
  }

  if (detail.type === 'widerruf') {
    return {
      date: detail.received_at,
      immediate: true,
      lines: [
        {
          kind: 'action',
          text: `Widerruf (§ 355 BGB): Der Vertrag endet mit Zugang am ${received}, Zugang und Abo mit der Bestätigung, der gezahlte Betrag ist vollständig zu erstatten.`,
        },
      ],
    };
  }

  if (detail.type === 'ausserordentlich' && importantReasonAccepted) {
    return {
      date: detail.received_at,
      immediate: true,
      lines: [
        {
          kind: 'action',
          text: `Wichtiger Grund wird anerkannt (§ 314 BGB): sofortige Wirkung, Wirksamkeitsdatum = Zugang am ${received}.`,
        },
      ],
    };
  }

  const regular = detail.effective_date.recalculated_ends_regularly ? ', das ist das reguläre Vertragsende' : '';
  const differs = stored && recalculated && stored !== recalculated ? ` (gespeichert war ${formatGermanDate(stored)})` : '';

  if (detail.type === 'ausserordentlich') {
    return {
      date: recalculated,
      immediate: false,
      lines: [
        {
          kind: 'action',
          text: `Außerordentliche Kündigung ohne anerkannten wichtigen Grund: wird als ordentliche Kündigung zum ${formatGermanDate(recalculated)} behandelt (Umdeutung, § 140 BGB${regular})${differs}.`,
        },
        { kind: 'note', text: 'Mit --wichtiger-grund-anerkannt: sofortige Wirkung zum Zugang der Kündigung.' },
      ],
    };
  }

  return {
    date: recalculated,
    immediate: false,
    lines: [
      {
        kind: 'action',
        text: `Wirksam zum ${formatGermanDate(recalculated)} (§ 5 FernUSG${regular})${differs}.`,
      },
    ],
  };
}

function accessLine(detail: CancellationRequestDetail, outcome: EffectiveOutcome): PreviewLine | null {
  if (!detail.pass) return null;

  if (outcome.immediate) {
    return { kind: 'action', text: 'Zugang endet sofort mit der Bestätigung (Pass-Status canceled).' };
  }

  const validUntil = detail.pass.valid_until;
  if (validUntil && outcome.date && validUntil.slice(0, 10) <= outcome.date.slice(0, 10)) {
    return { kind: 'note', text: `Zugang endet ohnehin am ${formatGermanDate(validUntil)}, bleibt unverändert.` };
  }

  return { kind: 'action', text: `Zugangsende: ${formatGermanDate(outcome.date)} 23:59 (bisher gültig ${validUntil ? `bis ${formatGermanDate(validUntil)}` : 'unbegrenzt'}).` };
}

/**
 * Bündel = ein Vertrag (Review K1): Die Bestätigung beendet den Zugang aller
 * Pässe des Abos zum selben Zeitpunkt, das Abo selbst endet wie jedes andere.
 */
function bundleLine(detail: CancellationRequestDetail, outcome: EffectiveOutcome): PreviewLine | null {
  const ids = detail.subscription_cancellation?.bundle_user_pass_ids ?? [];
  if (ids.length === 0) return null;

  const when = outcome.immediate ? 'mit der Bestätigung' : `zum ${formatGermanDate(outcome.date)}`;
  return {
    kind: 'action',
    text: `Bündel (ein Vertrag): Zugang der Pässe ${ids.map((id) => `#${id}`).join(', ')} endet ebenfalls ${when}, die Mail nennt sie.`,
  };
}

/** Wie EndSubscriptionForCancellationAction das Stripe-Abo behandelt. */
function subscriptionLine(detail: CancellationRequestDetail, outcome: EffectiveOutcome, today: string): PreviewLine | null {
  const { subscription } = detail;

  if (!subscription) {
    return detail.payment_mode === 'subscription'
      ? { kind: 'note', text: 'Stripe-Abo: keine lokale Abo-Zeile. Die Plattform sucht das Abo über die Abo-ID am Pass und kündigt es dort.' }
      : null;
  }

  const id = subscription.stripe_id;
  if (subscription.ends_at && outcome.date && subscription.ends_at.slice(0, 10) <= outcome.date.slice(0, 10) && !outcome.immediate) {
    return { kind: 'note', text: `Stripe-Abo ${id} endet bereits am ${formatGermanDate(subscription.ends_at)} und bleibt so.` };
  }

  if (outcome.immediate || (outcome.date && outcome.date.slice(0, 10) <= today)) {
    return { kind: 'action', text: `Stripe-Abo ${id} wird sofort gekündigt (ohne anteilige Gutschrift).` };
  }

  const bundle = (detail.subscription_cancellation?.bundle_user_pass_ids ?? []).length > 0 ? ', für das ganze Bündel' : '';
  return { kind: 'action', text: `Stripe-Abo-Ende: ${id} wird zum ${formatGermanDate(outcome.date)} gekündigt (cancel_at${bundle}).` };
}

function confirmRefundLine(
  detail: CancellationRequestDetail,
  decision: { importantReasonAccepted: boolean; treatAsWithdrawal: boolean }
): PreviewLine {
  const { refund } = detail;
  if (!refund) {
    const reason = detail.refund_error ? `: ${detail.refund_error}` : '';
    return { kind: 'note', text: `Keine Erstattung berechnet${reason}` };
  }

  const basis = [`bezahlt ${refund.paid_amount_formatted}`, `geschuldet ${refund.owed_amount_formatted}`];
  if (refund.is_withdrawal) basis.push('Widerruf: voller Betrag');
  if (refund.is_contract_price_estimated) basis.push('Vertragspreis fehlt, Katalogpreis angesetzt');

  const recalculation =
    detail.type === 'ausserordentlich' && decision.importantReasonAccepted
      ? ' Der Betrag rechnet mit der Umdeutung; mit anerkanntem Grund rechnet der Server beim Bestätigen neu (Stichtag = Zugang).'
      : '';

  if (decision.treatAsWithdrawal) {
    return {
      kind: 'note',
      text: `Erstattung als Widerruf: voller gezahlter Betrag ${refund.paid_amount_formatted} (bisherige Berechnung als Kündigung: ${refund.refund_amount_formatted}). Wird beim Bestätigen NICHT ausgelöst, danach: ${refundCommand(detail.id)}.`,
    };
  }

  return {
    kind: 'note',
    text: `Berechnete Erstattung: ${refund.refund_amount_formatted} (${basis.join(', ')}). Wird beim Bestätigen NICHT ausgelöst, danach: ${refundCommand(detail.id)}.${recalculation}`,
  };
}

export interface ConfirmationOptions {
  adminNotes?: string;
  /** --wichtiger-grund-anerkannt (important_reason_accepted) */
  importantReasonAccepted?: boolean;
  /** --als-widerruf (treat_as_withdrawal) */
  treatAsWithdrawal?: boolean;
  /** YYYY-MM-DD, für den Vergleich „Wirksamkeitsdatum liegt heute oder früher“ */
  today?: string;
}

/** Entscheidungen, die der Server mit 422 unprocessable ablehnt; null, wenn die Kombination passt. */
function unprocessableDecision(detail: CancellationRequestDetail, options: ConfirmationOptions): string | null {
  const label = `Kündigung #${detail.id}`;

  if (options.importantReasonAccepted && options.treatAsWithdrawal) {
    return '--wichtiger-grund-anerkannt und --als-widerruf schließen sich aus.';
  }
  if (options.importantReasonAccepted && detail.type !== 'ausserordentlich') {
    return `--wichtiger-grund-anerkannt gilt nur für außerordentliche Kündigungen, ${label} ist „${detail.type_label}“.`;
  }
  if (options.treatAsWithdrawal && detail.type === 'widerruf') {
    return `${label} ist bereits ein Widerruf, --als-widerruf ist nicht nötig.`;
  }
  if (options.treatAsWithdrawal && detail.pass?.is_b2b) {
    return `${label} betrifft einen Firmenpass: Ein Widerrufsrecht haben nur Verbraucher (§§ 312g, 355 BGB), --als-widerruf geht nicht.`;
  }
  if (options.treatAsWithdrawal && !hasWarning(detail.warnings, WARNING.withdrawalPossible)) {
    return `--als-widerruf geht nur, wenn die Anfrage innerhalb von 14 Tagen nach dem Kauf einging (Warnung withdrawal_possible fehlt bei ${label}).`;
  }
  return null;
}

export function buildConfirmationPreview(detail: CancellationRequestDetail, options: ConfirmationOptions = {}): ActionPreview {
  const label = `Kündigung #${detail.id}`;
  const importantReasonAccepted = options.importantReasonAccepted === true;
  const treatAsWithdrawal = options.treatAsWithdrawal === true;
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  if (detail.status === 'confirmed') {
    return {
      changesState: false,
      lines: [
        { kind: 'blocked', text: `${label} ist bereits bestätigt${reviewedByText(detail)}.` },
        { kind: 'note', text: 'Ein Aufruf mit --force ändert nichts (Server antwortet already_confirmed, keine Mail, kein Stripe-Aufruf).' },
        ...refundReminder(detail),
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

  const unprocessable = unprocessableDecision(detail, options);
  if (unprocessable) {
    return {
      changesState: false,
      lines: [
        { kind: 'blocked', text: `${unprocessable} Ein Aufruf mit --force wird mit 422 unprocessable abgelehnt.` },
        ...warningLines(detail.warnings),
      ],
    };
  }

  if (!detail.pass) {
    return {
      changesState: false,
      lines: [
        {
          kind: 'blocked',
          text: `${label}: Der Pass ist gelöscht, Wirksamkeitsdatum und Erstattung lassen sich nicht berechnen. Ein Aufruf mit --force wird mit 409 user_pass_missing abgelehnt. Pass wiederherstellen oder als unzulässig ablehnen (reject --unzulaessig=falscher-vertrag).`,
        },
        ...warningLines(detail.warnings, [WARNING.userPassMissing]),
      ],
    };
  }

  if (hasWarning(detail.warnings, WARNING.companyMultiSeatSubscription)) {
    return {
      changesState: false,
      lines: [
        {
          kind: 'blocked',
          text: `Bestätigen gesperrt: ${COMPANY_MULTI_SEAT_TEXT} Ein Aufruf mit --force wird mit 409 company_multi_seat_subscription abgelehnt.`,
        },
        ...warningLines(detail.warnings, [WARNING.companyMultiSeatSubscription]),
      ],
    };
  }

  if (detail.subscription_cancellation?.bundle_ambiguous || hasWarning(detail.warnings, WARNING.bundleSubscriptionAmbiguous)) {
    const ids = (detail.subscription_cancellation?.bundle_user_pass_ids ?? []).map((id) => `#${id}`).join(', ');
    return {
      changesState: false,
      lines: [
        {
          kind: 'blocked',
          text: `Bestätigen gesperrt: Das Stripe-Abo bezahlt auch Pässe aus einem anderen Kauf${ids ? ` (${ids})` : ''}, welcher Vertrag endet, ist nicht eindeutig. Erst in Stripe klären. Ein Aufruf mit --force wird mit 409 bundle_subscription_ambiguous abgelehnt.`,
        },
        ...warningLines(detail.warnings, [WARNING.bundleSubscriptionAmbiguous]),
      ],
    };
  }

  if (isLedgerMissing(detail)) {
    return {
      changesState: false,
      lines: [ledgerBlockedLine('confirm'), ...warningLines(detail.warnings, [WARNING.paidAmountUnknown])],
    };
  }

  const outcome = effectiveOutcome(detail, { importantReasonAccepted, treatAsWithdrawal });
  if (detail.pass && !outcome.immediate && !outcome.date) {
    const error = detail.effective_date.recalculation_error ?? 'Wirksamkeitsdatum nicht berechenbar';
    const alternative =
      detail.type === 'ausserordentlich' ? ' Nur mit --wichtiger-grund-anerkannt bestätigbar (sofortige Wirkung).' : '';
    return {
      changesState: false,
      lines: [
        { kind: 'blocked', text: `${label} lässt sich so nicht bestätigen: ${error} Ein Aufruf mit --force wird mit 422 unprocessable abgelehnt.${alternative}` },
        ...warningLines(detail.warnings),
      ],
    };
  }

  const lines: PreviewLine[] = [
    { kind: 'action', text: `${label} (${typeText(detail)}) wird bestätigt.` },
    ...outcome.lines,
  ];

  const access = accessLine(detail, outcome);
  if (access) lines.push(access);
  const bundle = bundleLine(detail, outcome);
  if (bundle) lines.push(bundle);
  const subscription = subscriptionLine(detail, outcome, today);
  if (subscription) lines.push(subscription);

  lines.push(
    { kind: 'action', text: `Bestätigungsmail an ${detail.participant.email}.` },
    confirmRefundLine(detail, { importantReasonAccepted, treatAsWithdrawal })
  );

  if (options.adminNotes) {
    lines.push({ kind: 'note', text: `Interne Notiz: ${options.adminNotes}` });
  }

  // Die Entscheidung über wichtigen Grund bzw. Widerruf und das Bündel stehen schon in den Zeilen oben.
  const decided = [
    WARNING.importantReasonDecisionRequired,
    WARNING.bundleSubscription,
    ...(treatAsWithdrawal ? [WARNING.withdrawalPossible] : []),
  ];
  lines.push(...warningLines(detail.warnings, decided), EXECUTE_HINT);
  return { changesState: true, lines };
}

function refundReminder(detail: CancellationRequestDetail): PreviewLine[] {
  const outstanding = detail.refund_execution?.outstanding_cents;
  if (detail.status !== 'confirmed' || !outstanding || outstanding <= 0) {
    return [];
  }
  return [
    {
      kind: 'hint',
      text: `Erstattung noch offen: ${formatEuroCents(outstanding)}. Vorschau: ${refundCommand(detail.id)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// reject
// ---------------------------------------------------------------------------

const VALID_CANCELLATION_TEXT =
  'Eine wirksame ordentliche Kündigung wird bestätigt, nicht abgelehnt; eine außerordentliche ohne wichtigen Grund ebenso (Umdeutung). Ablehnen nur bei einer unzulässigen Erklärung.';

export function buildRejectionPreview(detail: CancellationRequestDetail, rejectionReason: string, ground: RejectionGround): ActionPreview {
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

  if (ground === 'withdrawal_not_available' && detail.type !== 'widerruf') {
    return {
      changesState: false,
      lines: [
        {
          kind: 'blocked',
          text: `--unzulaessig=widerruf-ausgeschlossen passt nur zu einem Widerruf, ${label} ist „${detail.type_label}“. ${VALID_CANCELLATION_TEXT} Ein Aufruf mit --force wird mit 422 unprocessable abgelehnt.`,
        },
        ...warningLines(detail.warnings),
      ],
    };
  }

  return {
    changesState: true,
    lines: [
      { kind: 'warning', text: VALID_CANCELLATION_TEXT },
      { kind: 'action', text: `${label} (${typeText(detail)}) wird als unzulässig abgelehnt: ${REJECTION_GROUND_LABELS[ground]} (${ground}).` },
      { kind: 'action', text: `Ablehnungsmail an ${detail.participant.email} mit Begründung: „${rejectionReason}“` },
      ...warningLines(detail.warnings),
      EXECUTE_HINT,
    ],
  };
}

// ---------------------------------------------------------------------------
// refund
// ---------------------------------------------------------------------------

export const REAL_MONEY_TEXT = 'ECHTES GELD: refund --force zahlt über Stripe an den Teilnehmer aus. Nicht umkehrbar.';

function refundAmountLines(detail: CancellationRequestDetail, refund: CancellationRefund): PreviewLine[] {
  const execution = detail.refund_execution;
  const alreadyRefunded =
    execution.refunded_cents > 0
      ? `${execution.refunded_formatted} (Stripe-Refunds: ${execution.stripe_refund_ids.join(', ') || DASH})`
      : execution.refunded_formatted;
  const estimatedPrice = refund.is_contract_price_estimated ? ' (Vertragspreis fehlt, Katalogpreis angesetzt)' : '';

  const lines: PreviewLine[] = [
    { kind: 'note', text: `Betrag laut Berechnung: ${refund.refund_amount_formatted} (bezahlt ${refund.paid_amount_formatted}, geschuldet ${refund.owed_amount_formatted}${estimatedPrice})` },
    { kind: 'note', text: `Bereits erstattet: ${alreadyRefunded}` },
  ];

  if (refund.calculation_explanation) {
    lines.push({ kind: 'note', text: `Berechnung: ${refund.calculation_explanation}` });
  }
  if (refund.is_withdrawal) {
    const due = detail.withdrawal_refund_due_at ? ` spätestens bis ${formatGermanDate(detail.withdrawal_refund_due_at)}` : '';
    lines.push({ kind: 'note', text: `Widerruf: voller Betrag${due} (§ 357 BGB).` });
  }
  return lines;
}

function outstandingCents(detail: CancellationRequestDetail, refund: CancellationRefund): number {
  return detail.refund_execution.outstanding_cents ?? Math.max(0, refund.refund_amount_cents - detail.refund_execution.refunded_cents);
}

export function buildRefundPreview(detail: CancellationRequestDetail): ActionPreview {
  const label = `Kündigung #${detail.id}`;
  const execution = detail.refund_execution;

  if (detail.status !== 'confirmed') {
    return {
      changesState: false,
      lines: [
        {
          kind: 'blocked',
          text: `${label} ist ${detail.status_label.toLowerCase()} (${detail.status}). Erstattet wird erst nach der Bestätigung; ein Aufruf mit --force wird mit 409 not_confirmed abgelehnt.`,
        },
        ...(detail.status === 'pending' ? [{ kind: 'hint' as const, text: `Erst bestätigen: lernplattform kuendigungen confirm ${detail.id}` }] : []),
      ],
    };
  }

  if (!detail.pass) {
    return {
      changesState: false,
      lines: [
        { kind: 'blocked', text: `${label}: Der Pass ist gelöscht, die Erstattung lässt sich nicht berechnen. Ein Aufruf mit --force wird mit 409 user_pass_missing abgelehnt.` },
        ...warningLines(detail.warnings, [WARNING.userPassMissing]),
      ],
    };
  }

  if (execution.status === 'refunded' && (execution.outstanding_cents ?? 0) <= 0) {
    return {
      changesState: false,
      lines: [
        {
          kind: 'blocked',
          text: `${label} ist bereits erstattet: ${execution.refunded_formatted} am ${formatGermanDateTime(execution.refunded_at)} (Stripe-Refunds: ${execution.stripe_refund_ids.join(', ') || DASH}).`,
        },
        { kind: 'note', text: 'Ein Aufruf mit --force ändert nichts (Server antwortet already_refunded, kein Stripe-Aufruf).' },
      ],
    };
  }

  const { refund } = detail;
  if (!refund) {
    const reason = detail.refund_error ? `: ${detail.refund_error}` : '.';
    return {
      changesState: false,
      lines: [
        { kind: 'blocked', text: `Keine Erstattung berechenbar${reason} Ein Aufruf mit --force wird mit 422 unprocessable abgelehnt.` },
        ...warningLines(detail.warnings),
      ],
    };
  }

  if (refund.is_paid_amount_estimated) {
    return {
      changesState: false,
      lines: [ledgerBlockedLine('refund'), ...warningLines(detail.warnings, [WARNING.paidAmountUnknown])],
    };
  }

  const outstanding = outstandingCents(detail, refund);
  if (outstanding <= 0) {
    return {
      changesState: false,
      lines: [
        ...refundAmountLines(detail, refund),
        { kind: 'blocked', text: `Nichts zu erstatten: offen ${formatEuroCents(0)}. Ein Aufruf mit --force meldet nothing_to_refund, kein Stripe-Aufruf.` },
      ],
    };
  }

  const lines: PreviewLine[] = [
    { kind: 'blocked', text: REAL_MONEY_TEXT },
    {
      kind: 'action',
      text: `${label}: ${formatEuroCents(outstanding)} werden über Stripe auf das beim Kauf genutzte Zahlungsmittel erstattet (Teilnehmer ${detail.participant.email}).`,
    },
    ...refundAmountLines(detail, refund),
    { kind: 'action', text: `Offen, wird jetzt erstattet: ${formatEuroCents(outstanding)}` },
    {
      kind: 'note',
      text: `Stripe-Zahlungen: verteilt auf die Zahlungen des Passes (UserPass #${detail.pass.user_pass_id}) im Zahlungsbuch, neueste zuerst, je höchstens der noch nicht erstattete Anteil. Die API nennt die Zahlungen nicht einzeln; in Stripe tragen die Refunds die Metadaten cancellation_request_id=${detail.id}.`,
    },
  ];

  if (execution.status === 'partially_refunded') {
    lines.push({
      kind: 'warning',
      text: `Nach der Erstattung vom ${formatGermanDateTime(execution.refunded_at)} ist noch eine Zahlung eingegangen; --force zahlt nur den Rest, bereits Erstattetes nicht doppelt.`,
    });
  }
  if (execution.status === 'failed') {
    lines.push({
      kind: 'warning',
      text: `Letzter Versuch fehlgeschlagen: ${execution.error ?? 'unbekannter Fehler'}. --force versucht es erneut; bereits erstattete Anteile werden nicht doppelt ausgezahlt.`,
    });
  }
  if (execution.status === 'pending') {
    lines.push({
      kind: 'warning',
      text: 'Eine Erstattung läuft bereits. Ein Aufruf mit --force wird mit 409 refund_in_progress abgelehnt, solange der Lauf jünger als 10 Minuten ist.',
    });
  }

  lines.push(...warningLines(detail.warnings, [WARNING.refundFailed, WARNING.refundOutstanding]), {
    kind: 'hint',
    text: 'Zum Ausführen: denselben Befehl mit --force wiederholen. Nur nach ausdrücklicher Freigabe, es fließt echtes Geld.',
  });
  return { changesState: true, lines };
}

const REFUND_RESULT_TEXTS: Record<CancellationRefundResult, { changed: boolean; text: (detail: CancellationRequestDetail) => string }> = {
  refunded: {
    changed: true,
    text: (detail) => `Kündigung #${detail.id}: ${detail.refund_execution.refunded_formatted} über Stripe erstattet.`,
  },
  already_refunded: {
    changed: false,
    text: (detail) => `Kündigung #${detail.id} war bereits erstattet (${detail.refund_execution.refunded_formatted}), nichts geändert.`,
  },
  nothing_to_refund: {
    changed: false,
    text: (detail) => `Kündigung #${detail.id}: nichts zu erstatten, kein Stripe-Aufruf.`,
  },
};

export function buildRefundResultLines(response: CancellationRefundResponse): PreviewLine[] {
  const detail = response.data;
  const execution = detail.refund_execution;
  const result = REFUND_RESULT_TEXTS[response.meta.result];

  const lines: PreviewLine[] = [
    result
      ? { kind: result.changed ? 'action' : 'note', text: result.text(detail) }
      : { kind: 'note', text: `Kündigung #${detail.id}: Ergebnis ${response.meta.result}` },
    { kind: 'note', text: `Erstattungsstatus: ${execution.status_label} (${execution.status}), erstattet ${execution.refunded_formatted}` },
  ];

  if (execution.stripe_refund_ids.length > 0) {
    lines.push({ kind: 'note', text: `Stripe-Refunds: ${execution.stripe_refund_ids.join(', ')}` });
  }
  if (execution.outstanding_cents !== null && execution.outstanding_cents > 0) {
    lines.push({ kind: 'warning', text: `Noch offen: ${formatEuroCents(execution.outstanding_cents)}` });
  }

  lines.push(...warningLines(detail.warnings));
  return lines;
}

// ---------------------------------------------------------------------------
// Ergebnis confirm/reject
// ---------------------------------------------------------------------------

const RESULT_TEXTS: Record<CancellationActionResult, { changed: boolean; text: (id: number) => string }> = {
  confirmed: { changed: true, text: (id) => `Kündigung #${id} bestätigt.` },
  already_confirmed: { changed: false, text: (id) => `Kündigung #${id} war bereits bestätigt, nichts geändert.` },
  rejected: { changed: true, text: (id) => `Kündigung #${id} abgelehnt.` },
  already_rejected: { changed: false, text: (id) => `Kündigung #${id} war bereits abgelehnt, nichts geändert.` },
};

/** Warnungen, die im Ergebnis als eigene ACHTUNG-Zeile erscheinen statt in der Warnliste. */
const RESULT_ALERTS: Record<string, (detail: CancellationRequestDetail) => string> = {
  [WARNING.subscriptionCancelAtMissing]: (detail) => {
    const target = detail.effective_date.stored ? ` zum ${formatGermanDate(detail.effective_date.stored)}` : '';
    return `ACHTUNG: Stripe-Kündigung vermutlich fehlgeschlagen. Das Abo ${detail.subscription?.stripe_id ?? ''} hat kein Enddatum. In Stripe prüfen und das Abo manuell${target} kündigen.`;
  },
  [WARNING.subscriptionCancellationFailed]: () =>
    'ACHTUNG: Das Stripe-Abo konnte nicht gekündigt werden, der Kunde zahlt sonst weiter. In Stripe kündigen.',
  [WARNING.subscriptionNotFound]: () => 'ACHTUNG: Stripe kennt das Abo am Pass nicht, es wurde nichts gekündigt. In Stripe prüfen.',
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

  if (detail.status === 'confirmed') {
    lines.push({ kind: 'note', text: `Wirksam zum: ${formatGermanDate(detail.effective_date.stored)}` });
    if (detail.withdrawal_recognized_at) {
      const due = detail.withdrawal_refund_due_at ? `, volle Erstattung fällig bis ${formatGermanDate(detail.withdrawal_refund_due_at)}` : '';
      lines.push({ kind: 'note', text: `Als Widerruf behandelt am ${formatGermanDateTime(detail.withdrawal_recognized_at)}${due}` });
    }
    const importantReason = importantReasonText(detail);
    if (importantReason) lines.push({ kind: 'note', text: `Wichtiger Grund: ${importantReason}` });
    if (detail.pass) lines.push({ kind: 'note', text: `Zugang gültig bis: ${formatGermanDateTime(detail.pass.valid_until)}` });
  }

  if (detail.subscription) {
    const endsAt = detail.subscription.ends_at ? formatGermanDate(detail.subscription.ends_at) : 'kein Enddatum';
    lines.push({
      kind: 'note',
      text: `Stripe-Abo ${detail.subscription.stripe_id}: ${detail.subscription.stripe_status}, Ende ${endsAt}`,
    });
  }
  if (detail.subscription_cancellation?.status) {
    const error = detail.subscription_cancellation.error ? ` (${detail.subscription_cancellation.error})` : '';
    lines.push({ kind: 'note', text: `Abo-Kündigung: ${subscriptionCancellationLabel(detail.subscription_cancellation.status)}${error}` });
  }
  const bundleIds = detail.status === 'confirmed' ? detail.subscription_cancellation?.bundle_user_pass_ids ?? [] : [];
  if (bundleIds.length > 0) {
    lines.push({ kind: 'note', text: `Bündel (ein Vertrag): Zugang der Pässe ${bundleIds.map((id) => `#${id}`).join(', ')} endet mit.` });
  }
  if (detail.status === 'rejected' && detail.review.rejection_ground) {
    lines.push({ kind: 'note', text: `Unzulässig, weil: ${REJECTION_GROUND_LABELS[detail.review.rejection_ground] ?? detail.review.rejection_ground}` });
  }

  const alertCodes = Object.keys(RESULT_ALERTS);
  for (const warning of detail.warnings.filter((item) => alertCodes.includes(item.code))) {
    lines.push({ kind: 'blocked', text: `${RESULT_ALERTS[warning.code](detail)} [${warning.code}] ${warning.message}` });
  }

  lines.push(...warningLines(detail.warnings, alertCodes), ...refundReminder(detail));
  return lines;
}

// ---------------------------------------------------------------------------
// Fehlercodes (409/422/502) mit Handlungshinweis für stderr
// ---------------------------------------------------------------------------

export const ERROR_CODE_HINTS: Record<string, string> = {
  conflict: 'Die Anfrage ist schon anders bearbeitet. Status mit show <id> prüfen.',
  unprocessable:
    'Die Entscheidung passt nicht zur Anfrage, z. B. --wichtiger-grund-anerkannt bei nicht außerordentlicher Kündigung, --als-widerruf außerhalb der 14 Tage nach Kauf oder bei einem Firmenpass, beide Flags zusammen, --unzulaessig=widerruf-ausgeschlossen bei einer Kündigung oder einem fristgerechten Widerruf, oder keine Erstattung berechenbar.',
  bundle_subscription_ambiguous:
    'Das Stripe-Abo bezahlt auch Pässe aus einem anderen Kauf. Erst in Stripe klären, welcher Vertrag endet, dann erneut bestätigen.',
  company_multi_seat_subscription: COMPANY_MULTI_SEAT_TEXT,
  paid_amount_unknown: `${LEDGER_MISSING_TEXT}: auf dem Server php artisan pass:backfill-payments, dann erneut.`,
  not_confirmed: 'Erst bestätigen (confirm <id>), dann erstatten.',
  refund_in_progress: 'Es läuft bereits eine Erstattung. Nach 10 Minuten erneut versuchen und vorher mit show <id> den Stand prüfen.',
  user_pass_missing:
    'Der Pass ist gelöscht: Bestätigen und Erstatten lassen sich nicht berechnen. Pass wiederherstellen oder die Erklärung als unzulässig ablehnen (reject --unzulaessig=falscher-vertrag), Geld manuell in Stripe klären.',
  refund_failed: 'Stripe hat die Erstattung abgelehnt. Bereits erstattete Anteile sind gebucht; Ursache in Stripe prüfen, dann refund <id> --force erneut (zahlt nicht doppelt).',
};
