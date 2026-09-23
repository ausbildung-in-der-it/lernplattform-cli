/**
 * Kündigungen CLI - Kündigungsanfragen über die Admin-API der Plattform (AIDI-764)
 *
 * Usage:
 *   lernplattform kuendigungen list [--status=pending|confirmed|rejected|withdrawn|all] [--page=N] [--per-page=N] [--json]
 *   lernplattform kuendigungen show <id> [--json]
 *   lernplattform kuendigungen confirm <id> [--notiz="..."] [--force] [--json]
 *   lernplattform kuendigungen reject <id> --grund="..." [--force] [--json]
 *
 * Alle Befehle: [--env=production|staging]
 */

import { parseCliArgs, getTextData, type ParsedArgs } from '../utils/args';
import { AdminApiClient, AdminApiError, adminApiErrorPayload } from '../admin/client';
import { AdminUsageError, describeTarget, resolveAdminApiTarget, type AdminApiTarget } from '../admin/config';
import {
  CANCELLATION_STATUS_FILTERS,
  buildActionResultLines,
  buildConfirmationPreview,
  buildRejectionPreview,
  confirmCancellationRequest,
  getCancellationRequest,
  listCancellationRequests,
  rejectCancellationRequest,
  type CancellationActionResponse,
  type CancellationRequestDetail,
  type CancellationStatusFilter,
  type PreviewLine,
} from '../admin/cancellation-requests';
import {
  colorsEnabledFor,
  createPalette,
  renderCancellationDetail,
  renderCancellationList,
  renderPreviewLines,
  type Palette,
} from '../admin/cancellation-format';

export const EXIT_OK = 0;
/** Aufruf- oder Konfigurationsfehler, es ging kein Request raus */
export const EXIT_USAGE = 1;
/** Antwort der API war ein Fehler (401/403/404/409/422/5xx) oder der Server war nicht erreichbar */
export const EXIT_API = 2;

const MAX_PER_PAGE = 100;
const MAX_TEXT_LENGTH = 2000;

export interface CommandIo {
  out: (text: string) => void;
  err: (text: string) => void;
  env: NodeJS.ProcessEnv;
  palette: Palette;
}

const COMMON_FLAGS = ['env', 'json', 'help'];
const ALLOWED_FLAGS: Record<string, string[]> = {
  list: [...COMMON_FLAGS, 'status', 'page', 'per-page'],
  show: [...COMMON_FLAGS],
  confirm: [...COMMON_FLAGS, 'notiz', 'notiz-stdin', 'notiz-base64', 'force'],
  reject: [...COMMON_FLAGS, 'grund', 'grund-stdin', 'grund-base64', 'force'],
};

// ============================================================================
// Eingaben prüfen
// ============================================================================

function assertKnownFlags(operation: string, args: ParsedArgs): void {
  const allowed = ALLOWED_FLAGS[operation];
  const unknown = Object.keys(args.flags).filter((flag) => !allowed.includes(flag));
  if (unknown.length > 0) {
    throw new AdminUsageError(
      `Unbekannte Option(en) für ${operation}: ${unknown.map((flag) => `--${flag}`).join(', ')}. ` +
        `Erlaubt: ${allowed.filter((flag) => flag !== 'help').map((flag) => `--${flag}`).join(', ')}`
    );
  }
}

function parseId(args: ParsedArgs): number {
  const raw = args.positional[0];
  if (raw === undefined) {
    throw new AdminUsageError('ID der Kündigungsanfrage fehlt. IDs liefert: lernplattform kuendigungen list');
  }
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new AdminUsageError(`Ungültige ID: ${raw}. Erwartet wird eine positive Zahl, z. B. 12.`);
  }
  return Number(raw);
}

function parsePositiveInt(value: unknown, flag: string, max?: number): number | undefined {
  if (value === undefined) return undefined;
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isInteger(number) || number < 1 || (max !== undefined && number > max)) {
    const range = max !== undefined ? `1 bis ${max}` : 'ab 1';
    throw new AdminUsageError(`--${flag} erwartet eine ganze Zahl ${range}, bekommen: ${String(value)}`);
  }
  return number;
}

function parseStatus(value: unknown): CancellationStatusFilter {
  if (value === undefined) return 'pending';
  const status = String(value);
  if (!(CANCELLATION_STATUS_FILTERS as readonly string[]).includes(status)) {
    throw new AdminUsageError(`Ungültiger Status: ${status}. Erlaubt: ${CANCELLATION_STATUS_FILTERS.join(', ')}`);
  }
  return status as CancellationStatusFilter;
}

/** Text aus --name, --name-stdin oder --name-base64; leer und reine Flags ohne Wert werden abgelehnt. */
function readText(args: ParsedArgs, name: string, required: boolean): string | undefined {
  if (args.flags[name] === true) {
    throw new AdminUsageError(`--${name} braucht einen Text, z. B. --${name}="…"`);
  }

  const text = getTextData(args, name)?.trim();
  if (!text) {
    if (required) {
      throw new AdminUsageError(`--${name}="…" ist Pflicht und darf nicht leer sein (alternativ --${name}-stdin).`);
    }
    return undefined;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw new AdminUsageError(`--${name} ist zu lang (${text.length} Zeichen, maximal ${MAX_TEXT_LENGTH}).`);
  }
  return text;
}

function isForce(args: ParsedArgs): boolean {
  return args.flags.force === true;
}

function isJson(args: ParsedArgs): boolean {
  return args.flags.json === true;
}

// ============================================================================
// Operationen
// ============================================================================

async function list(client: AdminApiClient, args: ParsedArgs, io: CommandIo): Promise<void> {
  const response = await listCancellationRequests(client, {
    status: parseStatus(args.flags.status),
    page: parsePositiveInt(args.flags.page, 'page'),
    perPage: parsePositiveInt(args.flags['per-page'], 'per-page', MAX_PER_PAGE),
  });

  io.out(isJson(args) ? JSON.stringify(response, null, 2) : renderCancellationList(response, io.palette));
}

async function show(client: AdminApiClient, args: ParsedArgs, io: CommandIo): Promise<void> {
  const response = await getCancellationRequest(client, parseId(args));

  io.out(isJson(args) ? JSON.stringify(response, null, 2) : renderCancellationDetail(response.data, io.palette));
}

async function confirm(client: AdminApiClient, args: ParsedArgs, io: CommandIo, target: AdminApiTarget): Promise<void> {
  const id = parseId(args);
  const adminNotes = readText(args, 'notiz', false);

  if (!isForce(args)) {
    const { data: detail } = await getCancellationRequest(client, id);
    const preview = buildConfirmationPreview(detail, { adminNotes });
    writePreview(io, args, target, preview.changesState, preview.lines, detail);
    return;
  }

  const response = await confirmCancellationRequest(client, id, { adminNotes });
  writeResult(io, args, response);
}

async function reject(client: AdminApiClient, args: ParsedArgs, io: CommandIo, target: AdminApiTarget): Promise<void> {
  const id = parseId(args);
  const reason = readText(args, 'grund', true) as string;

  if (!isForce(args)) {
    const { data: detail } = await getCancellationRequest(client, id);
    const preview = buildRejectionPreview(detail, reason);
    writePreview(io, args, target, preview.changesState, preview.lines, detail);
    return;
  }

  const response = await rejectCancellationRequest(client, id, reason);
  writeResult(io, args, response);
}

function writePreview(
  io: CommandIo,
  args: ParsedArgs,
  target: AdminApiTarget,
  changesState: boolean,
  lines: PreviewLine[],
  detail: CancellationRequestDetail
): void {
  if (isJson(args)) {
    io.out(JSON.stringify({ mode: 'preview', changes_state: changesState, lines, data: detail }, null, 2));
    return;
  }

  io.out(`${io.palette.bold(`Vorschau (nichts ausgeführt) · Ziel: ${describeTarget(target)}`)}\n\n${renderPreviewLines(lines, io.palette)}`);
}

function writeResult(io: CommandIo, args: ParsedArgs, response: CancellationActionResponse): void {
  if (isJson(args)) {
    io.out(JSON.stringify(response, null, 2));
    return;
  }

  io.out(renderPreviewLines(buildActionResultLines(response), io.palette));
}

// ============================================================================
// Einstieg
// ============================================================================

const OPERATIONS: Record<string, (client: AdminApiClient, args: ParsedArgs, io: CommandIo, target: AdminApiTarget) => Promise<void>> = {
  list,
  show,
  confirm,
  reject,
};

/** Führt einen kuendigungen-Befehl aus und liefert den Exit-Code (testbar ohne process.exit). */
export async function executeKuendigungen(argv: string[], io: CommandIo): Promise<number> {
  const operation = argv[0];
  const args = parseCliArgs(argv.slice(1));

  if (!operation || operation === 'help' || operation === '--help' || operation === '-h' || args.flags.help) {
    io.out(HELP_TEXT);
    return EXIT_OK;
  }

  const handler = OPERATIONS[operation];
  if (!handler) {
    io.err(JSON.stringify({ error: `Unbekannte Aktion: ${operation}`, available: Object.keys(OPERATIONS) }, null, 2));
    return EXIT_USAGE;
  }

  try {
    assertKnownFlags(operation, args);
    const target = resolveAdminApiTarget(args.flags.env, io.env);
    io.err(`Ziel: ${describeTarget(target)}`);

    const client = new AdminApiClient({ baseUrl: target.baseUrl, token: target.token });
    await handler(client, args, io, target);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof AdminApiError) {
      io.err(JSON.stringify(adminApiErrorPayload(error), null, 2));
      return EXIT_API;
    }

    io.err(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    return EXIT_USAGE;
  }
}

export async function run(argv: string[]): Promise<void> {
  const exitCode = await executeKuendigungen(argv, {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
    env: process.env,
    palette: createPalette(colorsEnabledFor(process.stdout)),
  });
  process.exitCode = exitCode;
}

const HELP_TEXT = `lernplattform kuendigungen - Kündigungsanfragen über die Admin-API (/api/admin/v1)

USAGE
  lernplattform kuendigungen <aktion> [id] [--flag=wert]

AKTIONEN
  list                 Kündigungsanfragen auflisten (lesend). Default: offene (pending), älteste zuerst
  show <id>            Eine Anfrage im Detail: Teilnehmer, Pass, Stripe-Abo, Wirksamkeitsdatum
                       (gespeichert und neu berechnet), Erstattung, Review, Warnungen (lesend)
  confirm <id>         Anfrage bestätigen. VERÄNDERND, nur nach Ansage. Ohne --force nur Vorschau
  reject <id>          Anfrage ablehnen. VERÄNDERND, nur nach Ansage. Ohne --force nur Vorschau

FLAGS
  --env=production|staging   Zielumgebung (Default: $LERNPLATTFORM_ENV oder production)
  --json                     Rohes JSON der API auf stdout statt Tabelle/Text
  list:
    --status=S               pending (Default) | confirmed | rejected | withdrawn | all
    --page=N                 Seite (ab 1)
    --per-page=N             Einträge pro Seite (Server-Default 25, max ${MAX_PER_PAGE})
  confirm:
    --notiz="…"              Interne Admin-Notiz (admin_notes, max ${MAX_TEXT_LENGTH} Zeichen)
    --force                  Wirklich ausführen
  reject:
    --grund="…"              Pflicht. Begründung, geht per Mail an den Teilnehmer (max ${MAX_TEXT_LENGTH} Zeichen)
    --force                  Wirklich ausführen
  Lange Texte: --notiz-stdin / --grund-stdin (Heredoc) oder --notiz-base64 / --grund-base64

WAS confirm/reject MIT --force AUSLÖSEN
  confirm --force  → Status "confirmed", Bestätigungsmail an den echten Teilnehmer,
                     ein vorhandenes Stripe-Abo wird zum gespeicherten Wirksamkeitsdatum gekündigt.
                     Die berechnete Erstattung wird NICHT automatisch ausgelöst (AIDI-749).
  reject --force   → Status "rejected", Ablehnungsmail mit --grund an den echten Teilnehmer.
  Ohne --force: nur Vorschau (ein GET), nichts wird verändert, Exit 0.
  Idempotent: bereits bestätigt/abgelehnt → Server antwortet already_confirmed/already_rejected,
  keine zweite Mail. Unpassender Status (z. B. confirm auf abgelehnt/zurückgezogen) → 409.
  Jeder POST schickt einen frischen Idempotency-Key (UUID) für die Server-Logs.

WARNUNGEN (Kurzcodes in der list-Tabelle, Klartext in show und in der Vorschau)
  datum-vergangen          effective_date_in_past: Wirksamkeitsdatum liegt in der Vergangenheit
  offen>14d                pending_longer_than_14_days: Anfrage wartet länger als 14 Tage
  katalogpreis             refund_based_on_catalog_price: Erstattung basiert auf dem Katalogpreis
  abo-gekuendigt           subscription_already_canceled: Stripe-Abo hat schon ein Enddatum
  zugang-laenger           access_continues_after_effective_date: Zugang läuft über das Datum hinaus
  abo-ende-abweichend      subscription_end_differs_from_effective_date
  STRIPE-KUENDIGUNG-FEHLT  subscription_cancel_at_missing: bestätigt, aber Abo ohne Enddatum.
                           Stripe-Kündigung vermutlich fehlgeschlagen → in Stripe prüfen und manuell kündigen

UMGEBUNG UND TOKEN (getrennt vom Content-Token AIDI_API_TOKEN)
  LERNPLATTFORM_ADMIN_TOKEN          Admin-Token für production (Pflicht für --env=production)
  LERNPLATTFORM_STAGING_ADMIN_TOKEN  Admin-Token für staging   (Pflicht für --env=staging)
  LERNPLATTFORM_ENV                  Default für --env
  LERNPLATTFORM_BASE_URL             Übersteuert die URL (z. B. lokale Instanz), Token nach --env
  Defaults: production https://app.ausbildung-in-der-it.de, staging https://staging.ausbildung-in-der-it.de
  Token: Backoffice > System > API Tokens, Besitzer = du selbst (Plattform-Admin),
  Scopes cancellation-requests:read (list/show) und cancellation-requests:write (confirm/reject).

IO-KONVENTIONEN
  stdout    Tabelle/Text, mit --json das JSON der API. Vorschau mit --json:
            {"mode":"preview","changes_state":true|false,"lines":[{"kind","text"}],"data":{…}}
  stderr    "Ziel: <url> (<umgebung>)" und Fehler als JSON:
            {"error":"…","status":409,"current_status":"rejected"} bzw. mit "errors" bei 422
  Exit 0    Erfolg, auch Vorschau und already_confirmed/already_rejected
  Exit 1    Aufruf-/Konfigurationsfehler (Flag, ID, Token fehlt), kein Request verschickt
  Exit 2    API-Fehler: 401/403 (Token, Scope, Besitzer kein Plattform-Admin), 404, 409, 422,
            5xx oder Server nicht erreichbar (status 0)

BEISPIELE
  lernplattform kuendigungen list
  lernplattform kuendigungen list --status=all --page=2
  lernplattform kuendigungen show 12
  lernplattform kuendigungen show 12 --json | jq '.data.refund.refund_amount_formatted'
  lernplattform kuendigungen confirm 12                                   # Vorschau
  lernplattform kuendigungen confirm 12 --notiz="Telefonisch geklärt" --force
  lernplattform kuendigungen reject 12 --grund="Mindestlaufzeit nicht erreicht"   # Vorschau
  lernplattform kuendigungen list --env=staging
  LERNPLATTFORM_BASE_URL=http://127.0.0.1:8124 lernplattform kuendigungen list

WORKFLOW (für Agenten)
  1) lernplattform kuendigungen list --json 2>/dev/null | jq '.data[] | {id, participant_name, warnings: [.warnings[].code]}'
  2) lernplattform kuendigungen show <id>                  # Warnungen und Erstattung lesen
  3) lernplattform kuendigungen confirm <id>               # Vorschau zeigen, Ansage abwarten
  4) lernplattform kuendigungen confirm <id> --force       # erst nach ausdrücklicher Freigabe
  5) Nach confirm --force auf STRIPE-KUENDIGUNG-FEHLT achten (Exit 0, Warnung im Ergebnis)
`;
