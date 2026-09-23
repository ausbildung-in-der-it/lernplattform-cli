/**
 * Terminal-Darstellung der Kündigungsanfragen (Tabelle, Detailansicht, Vorschau).
 * Farben nur, wenn stdout ein Terminal ist und NO_COLOR nicht gesetzt ist.
 */

import {
  DASH,
  STRIPE_CANCEL_MISSING_WARNING,
  formatGermanDate,
  formatGermanDateTime,
  paymentModeLabel,
  shortWarningLabel,
  type CancellationRequestDetail,
  type CancellationRequestListResponse,
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

function warningCodeText(code: string, c: Palette): string {
  const label = shortWarningLabel(code);
  return code === STRIPE_CANCEL_MISSING_WARNING ? c.red(c.bold(label)) : c.yellow(label);
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
    type: item.type_label,
    effective: formatGermanDate(item.effective_date),
    payment: paymentModeLabel(item.payment_mode),
    warnings:
      item.warnings.length > 0 ? item.warnings.map((warning) => warningCodeText(warning.code, c)).join(', ') : c.dim(DASH),
  }));

  const next = meta.current_page < meta.last_page ? ` · weiter mit --page ${meta.current_page + 1}` : '';
  const footer = c.dim(
    `Seite ${meta.current_page} von ${meta.last_page} · ${meta.total} Anfrage${meta.total === 1 ? '' : 'n'} gesamt · Status: ${meta.status}${next}`
  );

  return `${renderTable(rows, columns, c)}\n\n${footer}`;
}

// ============================================================================
// Detail
// ============================================================================

function warningsSection(warnings: CancellationWarning[], c: Palette): string {
  if (warnings.length === 0) return section('Warnungen', c.dim('  keine'), c);
  const lines = warnings.map((warning) => {
    const text = `  [${warning.code}] ${warning.message}`;
    return warning.code === STRIPE_CANCEL_MISSING_WARNING ? c.red(c.bold(text)) : c.yellow(text);
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
  if (explanation) pairs.push(['Berechnung', explanation]);
  if (error) pairs.push(['Fehler', c.red(error)]);
  return section('Wirksamkeitsdatum', keyValues(pairs, c), c);
}

function refundSection(detail: CancellationRequestDetail, c: Palette): string {
  const { refund } = detail;
  if (!refund) {
    const body = detail.refund_error ? c.red(`  Nicht berechnet: ${detail.refund_error}`) : c.dim('  keine');
    return section('Erstattung', body, c);
  }

  return section(
    'Erstattung',
    keyValues(
      [
        ['Gesamtpreis', `${refund.total_price_formatted} (${refund.total_months} Monate, ${refund.total_days} Tage)`],
        ['Genutzt', `${refund.used_days} Tage`],
        ['Geschuldet', refund.owed_amount_formatted],
        ['Bezahlt', refund.is_paid_amount_estimated ? `${refund.paid_amount_formatted} (geschätzt)` : refund.paid_amount_formatted],
        ['Erstattung', `${c.bold(refund.refund_amount_formatted)} ${c.dim('(wird nicht automatisch ausgelöst, AIDI-749)')}`],
        ['Berechnung', orDash(refund.calculation_explanation)],
      ],
      c
    ),
    c
  );
}

export function renderCancellationDetail(detail: CancellationRequestDetail, c: Palette): string {
  const { participant, pass, subscription, review } = detail;

  const request = section(
    `Kündigung #${detail.id}`,
    keyValues(
      [
        ['Status', statusText(detail.status, `${detail.status_label} (${detail.status})`, c)],
        ['Art', detail.type_label],
        ['Eingang', `${formatGermanDateTime(detail.received_at)} (vor ${detail.age_days} Tagen)`],
        ['Grund', orDash(detail.reason)],
        ['Zahlungsart', paymentModeLabel(detail.payment_mode)],
      ],
      c
    ),
    c
  );

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
    : section('Pass', c.dim('  keiner'), c);

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
    request,
    participantSection,
    passSection,
    subscriptionSection,
    effectiveDateSection(detail, c),
    refundSection(detail, c),
    reviewSection,
    warningsSection(detail.warnings, c),
  ].join('\n\n');
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
