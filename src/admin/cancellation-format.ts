/**
 * Terminal-Darstellung der Kündigungsanfragen (Tabelle, Detailansicht, Vorschau).
 * Farben nur, wenn stdout ein Terminal ist und NO_COLOR nicht gesetzt ist.
 */

import {
  CRITICAL_WARNINGS,
  DASH,
  LEDGER_MISSING_TEXT,
  SHORT_REFUND_STATUS_LABELS,
  WARNING,
  formatEuroCents,
  formatGermanDate,
  formatGermanDateTime,
  hasWarning,
  importantReasonText,
  isWithdrawal,
  typeText,
  paymentModeLabel,
  shortWarningLabel,
  subscriptionCancellationLabel,
  withdrawalDueDateFromReceipt,
  type CancellationRequestDetail,
  type CancellationRequestListResponse,
  type CancellationRequestSummary,
  type CancellationWarning,
  type PreviewLine,
  type PreviewLineKind,
} from './cancellation-requests';

export interface Palette {
  bold: (text: string) => string;
  dim: (text: string) => string;
  red: (text: string) => string;
  green: (text: string) => string;
  yellow: (text: string) => string;
  cyan: (text: string) => string;
}

function wrap(open: string, enabled: boolean): (text: string) => string {
  return enabled ? (text) => `\x1b[${open}m${text}\x1b[0m` : (text) => text;
}

export function createPalette(enabled: boolean): Palette {
  return {
    bold: wrap('1', enabled),
    dim: wrap('2', enabled),
    red: wrap('31', enabled),
    green: wrap('32', enabled),
    yellow: wrap('33', enabled),
    cyan: wrap('36', enabled),
  };
}

export function colorsEnabledFor(stream: NodeJS.WriteStream): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(stream.isTTY);
}

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function visibleLength(text: string): number {
  return text.replace(ANSI_PATTERN, '').length;
}

function pad(text: string, width: number, align: 'left' | 'right'): string {
  const fill = ' '.repeat(Math.max(0, width - visibleLength(text)));
  return align === 'right' ? fill + text : text + fill;
}

interface Column {
  key: string;
  header: string;
  align?: 'left' | 'right';
}

function renderTable(rows: Record<string, string>[], columns: Column[], c: Palette): string {
  const widths = columns.map((column) =>
    Math.max(visibleLength(column.header), ...rows.map((row) => visibleLength(row[column.key] ?? '')))
  );
  const line = (cells: string[]) => cells.join('  ').trimEnd();

  const header = line(columns.map((column, i) => c.bold(pad(column.header, widths[i], column.align ?? 'left'))));
  const separator = c.dim(line(widths.map((width) => '─'.repeat(width))));
  const body = rows.map((row) => line(columns.map((column, i) => pad(row[column.key] ?? '', widths[i], column.align ?? 'left'))));

  return [header, separator, ...body].join('\n');
}

function keyValues(pairs: [string, string | number][], c: Palette): string {
  const width = Math.max(...pairs.map(([label]) => label.length));
  return pairs.map(([label, value]) => `  ${c.dim(label.padEnd(width))}  ${value}`).join('\n');
}

function section(title: string, body: string, c: Palette): string {
  return `${c.bold(title)}\n${body}`;
}

function orDash(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? DASH : String(value);
}

function statusText(status: string, label: string, c: Palette): string {
  if (status === 'confirmed') return c.green(label);
  if (status === 'pending') return c.yellow(label);
  if (status === 'rejected') return c.red(label);
  return c.dim(label);
}

function isCritical(code: string): boolean {
  return CRITICAL_WARNINGS.includes(code);
}

function warningCodeText(code: string, c: Palette): string {
  const label = shortWarningLabel(code);
  return isCritical(code) ? c.red(c.bold(label)) : c.yellow(label);
}

/** Widerruf in der Liste: Art plus Fälligkeit der Erstattung, solange nicht erstattet. */
function listTypeText(item: CancellationRequestSummary, c: Palette): string {
  const label = typeText(item);
  if (!isWithdrawal(item)) return label;
  if (item.refund_status === 'refunded' || (item.status !== 'pending' && item.status !== 'confirmed')) return label;
  const due = withdrawalDueDateFromReceipt(item.received_at);
  return due ? `${label}, ${c.bold(`Erstattung bis ${formatGermanDate(due)}`)}` : label;
}

function refundStatusText(status: string | undefined, c: Palette): string {
  if (!status) return c.dim(DASH);
  const label = SHORT_REFUND_STATUS_LABELS[status as keyof typeof SHORT_REFUND_STATUS_LABELS] ?? status;
  if (status === 'failed') return c.red(c.bold(label));
  if (status === 'refunded') return c.green(label);
  if (status === 'pending') return c.yellow(label);
  return c.dim(label);
}

// ============================================================================
// Liste
// ============================================================================

export function renderCancellationList(response: CancellationRequestListResponse, c: Palette): string {
  const { data, meta } = response;
  if (data.length === 0) {
    return `Keine Kündigungsanfragen (Status: ${meta.status}).`;
  }

  const columns: Column[] = [
    { key: 'id', header: 'ID', align: 'right' },
    { key: 'received', header: 'Eingang' },
    { key: 'age', header: 'Alter', align: 'right' },
    { key: 'name', header: 'Name' },
    { key: 'pass', header: 'Pass' },
    { key: 'type', header: 'Art' },
    { key: 'effective', header: 'Wirksam zum' },
    { key: 'payment', header: 'Zahlungsart' },
    { key: 'refund', header: 'Erstattung' },
    { key: 'warnings', header: 'Warnungen' },
  ];

  if (meta.status === 'all') {
    columns.splice(1, 0, { key: 'status', header: 'Status' });
  }

  const rows = data.map((item) => ({
    id: `#${item.id}`,
    status: statusText(item.status, item.status_label, c),
    received: formatGermanDate(item.received_at),
    age: `${item.age_days} T`,
    name: item.participant_name,
    pass: orDash(item.pass_name),
    type: listTypeText(item, c),
    effective: formatGermanDate(item.effective_date),
    payment: paymentModeLabel(item.payment_mode),
    refund: refundStatusText(item.refund_status, c),
    warnings:
      item.warnings.length > 0 ? item.warnings.map((warning) => warningCodeText(warning.code, c)).join(', ') : c.dim(DASH),
  }));

  const next = meta.current_page < meta.last_page ? ` · weiter mit --page ${meta.current_page + 1}` : '';
  const footer = c.dim(
    `Seite ${meta.current_page} von ${meta.last_page} · ${meta.total} Anfrage${meta.total === 1 ? '' : 'n'} gesamt · Status: ${meta.status}${next}`
  );

  const ledgerMissing = data.filter((item) => hasWarning(item.warnings, WARNING.paidAmountUnknown)).map((item) => `#${item.id}`);
  const ledgerNote = ledgerMissing.length > 0 ? `\n${c.red(c.bold(`${LEDGER_MISSING_TEXT}: ${ledgerMissing.join(', ')}`))}` : '';

  return `${renderTable(rows, columns, c)}\n\n${footer}${ledgerNote}`;
}

// ============================================================================
// Detail
// ============================================================================

function warningsSection(warnings: CancellationWarning[], c: Palette): string {
  if (warnings.length === 0) return section('Warnungen', c.dim('  keine'), c);
  const lines = warnings.map((warning) => {
    const text = `  [${warning.code}] ${warning.message}`;
    return isCritical(warning.code) ? c.red(c.bold(text)) : c.yellow(text);
  });
  return section('Warnungen', lines.join('\n'), c);
}

function effectiveDateSection(detail: CancellationRequestDetail, c: Palette): string {
  const { stored, recalculated, recalculation_explanation: explanation, recalculation_error: error } = detail.effective_date;
  const differs = stored && recalculated && stored !== recalculated;
  const pairs: [string, string][] = [
    ['Gespeichert', formatGermanDate(stored)],
    ['Neu berechnet', differs ? c.yellow(`${formatGermanDate(recalculated)} (weicht ab)`) : formatGermanDate(recalculated)],
  ];
  const flags = [
    detail.effective_date.recalculated_reinterpreted_as_ordinary ? 'umgedeutet in ordentliche Kündigung (§ 140 BGB)' : '',
    detail.effective_date.recalculated_ends_regularly ? 'endet regulär zum Vertragsende' : '',
  ].filter(Boolean);
  if (flags.length > 0) pairs.push(['Hinweis', flags.join(', ')]);
  if (explanation) pairs.push(['Berechnung', explanation]);
  if (error) pairs.push(['Fehler', c.red(error)]);
  return section('Wirksamkeitsdatum', keyValues(pairs, c), c);
}

function refundSection(detail: CancellationRequestDetail, c: Palette): string {
  const { refund } = detail;
  if (!refund) {
    const body = detail.refund_error ? c.red(`  Nicht berechnet: ${detail.refund_error}`) : c.dim('  keine');
    return section('Erstattung (Berechnung)', body, c);
  }

  return section(
    'Erstattung (Berechnung)',
    keyValues(
      [
        [
          'Vertragspreis',
          `${refund.total_price_formatted} (${refund.total_months} Monate, ${refund.total_days} Tage)${
            refund.is_contract_price_estimated ? c.yellow(' geschätzt: Katalogpreis, Vertragspreis fehlt') : ''
          }`,
        ],
        ['Genutzt', `${refund.used_days} Tage`],
        ['Geschuldet', refund.owed_amount_formatted],
        [
          'Bezahlt',
          refund.is_paid_amount_estimated
            ? c.red(c.bold("unbekannt, Zahlungsbuch leer (Backfill nötig)"))
            : `${refund.paid_amount_formatted} (Zahlungsbuch)`,
        ],
        ['Erstattung', `${c.bold(refund.refund_amount_formatted)}${refund.is_withdrawal ? ' (Widerruf: voller Betrag)' : ''}`],
        ['Berechnung', orDash(refund.calculation_explanation)],
      ],
      c
    ),
    c
  );
}

function refundExecutionSection(detail: CancellationRequestDetail, c: Palette): string {
  const execution = detail.refund_execution;
  if (!execution) return section('Erstattung ausgeführt', c.dim('  keine Angabe'), c);

  const statusLabel = `${execution.status_label} (${execution.status})`;
  const pairs: [string, string][] = [
    ['Status', execution.status === 'failed' ? c.red(c.bold(statusLabel)) : statusLabel],
    ['Erstattet', execution.refunded_formatted],
    ['Offen', execution.outstanding_cents === null ? `${DASH} (nicht berechenbar)` : formatEuroCents(execution.outstanding_cents)],
    ['Stripe-Refunds', execution.stripe_refund_ids.length > 0 ? execution.stripe_refund_ids.join(', ') : DASH],
    ['Am', formatGermanDateTime(execution.refunded_at)],
  ];
  if (execution.error) pairs.push(['Fehler', c.red(execution.error)]);

  const outstanding = execution.outstanding_cents ?? 0;
  if (detail.status === 'confirmed' && execution.status !== 'refunded' && outstanding > 0) {
    pairs.push(['Nächster Schritt', `lernplattform kuendigungen refund ${detail.id} (Vorschau, echtes Geld erst mit --force)`]);
  }

  return section('Erstattung ausgeführt', keyValues(pairs, c), c);
}

function subscriptionCancellationSection(detail: CancellationRequestDetail, c: Palette): string | null {
  const cancellation = detail.subscription_cancellation;
  if (!cancellation || (!cancellation.status && !cancellation.error)) return null;

  const label = subscriptionCancellationLabel(cancellation.status);
  const pairs: [string, string][] = [
    ['Ergebnis', cancellation.status === 'failed' || cancellation.status === 'not_found' ? c.red(c.bold(label)) : label],
  ];
  if (cancellation.error) pairs.push(['Fehler', c.red(cancellation.error)]);
  return section('Abo-Kündigung nach Bestätigung', keyValues(pairs, c), c);
}

/** Gesperrte Schritte ganz oben, damit sie niemand überliest. */
function blockerBanner(detail: CancellationRequestDetail, c: Palette): string | null {
  if (!hasWarning(detail.warnings, WARNING.paidAmountUnknown)) return null;
  return c.red(c.bold(`! ${LEDGER_MISSING_TEXT}: Zahlungen auf dem Server nachladen (php artisan pass:backfill-payments). Erstatten ist ebenfalls gesperrt.`));
}

export function renderCancellationDetail(detail: CancellationRequestDetail, c: Palette): string {
  const { participant, pass, subscription, review } = detail;

  const requestPairs: [string, string | number][] = [
    ['Status', statusText(detail.status, `${detail.status_label} (${detail.status})`, c)],
    ['Art', typeText(detail)],
  ];
  if (detail.withdrawal_recognized_at) {
    requestPairs.push(['Als Widerruf', `behandelt am ${formatGermanDateTime(detail.withdrawal_recognized_at)} (§ 355 Abs. 1 S. 3 BGB)`]);
  }
  const importantReason = importantReasonText(detail);
  if (importantReason) requestPairs.push(['Wichtiger Grund', importantReason]);
  if (detail.withdrawal_refund_due_at) {
    const done = detail.refund_execution?.status === 'refunded';
    const due = `Erstattung spätestens bis ${formatGermanDate(detail.withdrawal_refund_due_at)} (§ 357 BGB)`;
    requestPairs.push(['Widerruf', done ? `${due}, erledigt` : c.bold(due)]);
  }
  requestPairs.push(
    ['Eingang', `${formatGermanDateTime(detail.received_at)} (vor ${detail.age_days} Tagen)`],
    ['Grund', orDash(detail.reason)],
    ['Zahlungsart', paymentModeLabel(detail.payment_mode)]
  );

  const request = section(`Kündigung #${detail.id}`, keyValues(requestPairs, c), c);

  const participantSection = section(
    'Teilnehmer',
    keyValues(
      [
        ['Name', participant.name],
        ['E-Mail', participant.email],
        ['Adresse', orDash(participant.address_formatted)],
        ['User-ID', participant.user_id],
      ],
      c
    ),
    c
  );

  const passSection = pass
    ? section(
        'Pass',
        keyValues(
          [
            ['Name', `${pass.name} (UserPass #${pass.user_pass_id})`],
            ['Laufzeit', pass.duration_months ? `${pass.duration_months} Monate` : DASH],
            ['Gekauft', formatGermanDate(pass.purchased_at)],
            ['Aktiviert', formatGermanDate(pass.activated_at)],
            ['Gültig bis', formatGermanDate(pass.valid_until)],
            ['Status', orDash(pass.user_pass_status)],
            ['B2B', pass.is_b2b ? `ja (${orDash(pass.company_name)})` : 'nein'],
          ],
          c
        ),
        c
      )
    : section('Pass', c.red('  gelöscht oder nicht mehr verknüpft (user_pass_missing)'), c);

  const subscriptionSection = subscription
    ? section(
        'Abo (Stripe)',
        keyValues(
          [
            ['Stripe-ID', subscription.stripe_id],
            ['Status', subscription.stripe_status],
            ['Enddatum', formatGermanDate(subscription.ends_at)],
            ['Gekündigt', subscription.is_canceled ? 'ja' : 'nein'],
          ],
          c
        ),
        c
      )
    : section('Abo (Stripe)', c.dim('  keins'), c);

  const reviewer = review.reviewed_by
    ? `${review.reviewed_by.name ?? review.reviewed_by.email} <${review.reviewed_by.email}>`
    : DASH;
  const reviewSection = section(
    'Review',
    review.reviewed_at
      ? keyValues(
          [
            ['Am', formatGermanDateTime(review.reviewed_at)],
            ['Von', reviewer],
            ['Notiz', orDash(review.admin_notes)],
            ['Ablehnungsgrund', orDash(review.rejection_reason)],
          ],
          c
        )
      : c.dim('  noch nicht bearbeitet'),
    c
  );

  return [
    blockerBanner(detail, c),
    request,
    participantSection,
    passSection,
    subscriptionSection,
    subscriptionCancellationSection(detail, c),
    effectiveDateSection(detail, c),
    refundSection(detail, c),
    refundExecutionSection(detail, c),
    reviewSection,
    warningsSection(detail.warnings, c),
  ]
    .filter((part): part is string => part !== null)
    .join('\n\n');
}

// ============================================================================
// Vorschau und Ergebnis
// ============================================================================

export function renderPreviewLines(lines: PreviewLine[], c: Palette): string {
  const prefix: Record<PreviewLineKind, (text: string) => string> = {
    action: (text) => `  ${c.cyan('→')} ${text}`,
    note: (text) => `  ${c.dim('·')} ${text}`,
    warning: (text) => c.yellow(`  ⚠ ${text}`),
    blocked: (text) => c.red(c.bold(`  ! ${text}`)),
    hint: (text) => c.dim(`\n  ${text}`),
  };
  return lines.map((line) => prefix[line.kind](line.text)).join('\n');
}
