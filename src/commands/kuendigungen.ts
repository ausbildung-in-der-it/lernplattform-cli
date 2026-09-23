/**
 * Kündigungen CLI - Kündigungsanfragen über die Admin-API der Plattform (AIDI-764, AIDI-749)
 *
 * Usage:
 *   lernplattform kuendigungen list [--status=pending|confirmed|rejected|withdrawn|all] [--page=N] [--per-page=N] [--json]
 *   lernplattform kuendigungen show <id> [--json]
 *   lernplattform kuendigungen confirm <id> [--wichtiger-grund-anerkannt] [--notiz="..."] [--force] [--json]
 *   lernplattform kuendigungen reject <id> --unzulaessig=<art> --grund="..." [--force] [--json]
 *   lernplattform kuendigungen refund <id> [--force] [--json]
 *
 * Alle Befehle: [--env=production|staging]
 */

import { parseCliArgs, getTextData, type ParsedArgs } from '../utils/args';
import { AdminApiClient, AdminApiError, adminApiErrorPayload } from '../admin/client';
import {
  AdminUsageError,
  describeTarget,
  requireExplicitEnvironment,
  resolveAdminApiTarget,
  type AdminApiTarget,
} from '../admin/config';
import {
  CANCELLATION_STATUS_FILTERS,
  ERROR_CODE_HINTS,
  REJECTION_GROUNDS,
  parseRejectionGround,
  REAL_MONEY_TEXT,
  buildActionResultLines,
  buildConfirmationPreview,
  buildRefundPreview,
  buildRefundResultLines,
  buildRejectionPreview,
  confirmCancellationRequest,
  getCancellationRequest,
  listCancellationRequests,
  refundCancellationRequest,
  rejectCancellationRequest,
  type CancellationRequestDetail,
  type CancellationStatusFilter,
  type PreviewLine,
  type RejectionGround,
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
/** Antwort der API war ein Fehler (401/403/404/409/422/502/5xx) oder der Server war nicht erreichbar */
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
  confirm: [...COMMON_FLAGS, 'notiz', 'notiz-stdin', 'notiz-base64', 'wichtiger-grund-anerkannt', 'als-widerruf', 'force'],
  reject: [...COMMON_FLAGS, 'unzulaessig', 'grund', 'grund-stdin', 'grund-base64', 'force'],
  refund: [...COMMON_FLAGS, 'force'],
};

/** Befehle, die Daten ändern: nie still gegen production (requireExplicitEnvironment). */
const WRITE_OPERATIONS = ['confirm', 'reject', 'refund'];

const IMPORTANT_REASON_FLAG = 'wichtiger-grund-anerkannt';
const TREAT_AS_WITHDRAWAL_FLAG = 'als-widerruf';

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

/**
 * Reine Schalter wie --force und --wichtiger-grund-anerkannt. Ein Wert (etwa
 * `--force 12` oder `--wichtiger-grund-anerkannt=false`) ist ein Aufruffehler,
 * damit nichts still als an oder aus gewertet wird.
 */
function switchFlag(args: ParsedArgs, name: string): boolean {
  const value = args.flags[name];
  if (value === undefined) return false;
  if (value === true) return true;
  throw new AdminUsageError(
    `--${name} ist ein Schalter ohne Wert, bekommen: ${String(value)}. Die ID gehört vor die Flags, z. B. confirm 12 --${name}.`
  );
}

function isForce(args: ParsedArgs): boolean {
  return switchFlag(args, 'force');
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
  const importantReasonAccepted = switchFlag(args, IMPORTANT_REASON_FLAG);
  const treatAsWithdrawal = switchFlag(args, TREAT_AS_WITHDRAWAL_FLAG);
  if (importantReasonAccepted && treatAsWithdrawal) {
    throw new AdminUsageError(`--${IMPORTANT_REASON_FLAG} und --${TREAT_AS_WITHDRAWAL_FLAG} schließen sich aus (Server: 422).`);
  }

  if (!isForce(args)) {
    const { data: detail } = await getCancellationRequest(client, id);
    const preview = buildConfirmationPreview(detail, { adminNotes, importantReasonAccepted, treatAsWithdrawal });
    writePreview(io, args, target, preview.changesState, preview.lines, detail);
    return;
  }

  const response = await confirmCancellationRequest(client, id, { adminNotes, importantReasonAccepted, treatAsWithdrawal });
  writeResult(io, args, response, buildActionResultLines(response));
}

/** --unzulaessig=<art>: Pflicht, eine wirksame Kündigung wird bestätigt, nicht abgelehnt. */
function parseGround(args: ParsedArgs): RejectionGround {
  const value = args.flags.unzulaessig;
  const options = Object.keys(REJECTION_GROUNDS).join(' | ');

  if (value === undefined || value === true) {
    throw new AdminUsageError(
      `--unzulaessig=<art> ist Pflicht: ${options}. Eine wirksame Kündigung wird nicht abgelehnt, sondern bestätigt (confirm).`
    );
  }

  const ground = parseRejectionGround(String(value));
  if (!ground) {
    throw new AdminUsageError(`Unbekannte Art für --unzulaessig: ${String(value)}. Erlaubt: ${options}.`);
  }
  return ground;
}

async function reject(client: AdminApiClient, args: ParsedArgs, io: CommandIo, target: AdminApiTarget): Promise<void> {
  const id = parseId(args);
  const ground = parseGround(args);
  const reason = readText(args, 'grund', true) as string;

  if (!isForce(args)) {
    const { data: detail } = await getCancellationRequest(client, id);
    const preview = buildRejectionPreview(detail, reason, ground);
    writePreview(io, args, target, preview.changesState, preview.lines, detail);
    return;
  }

  const response = await rejectCancellationRequest(client, id, reason, ground);
  writeResult(io, args, response, buildActionResultLines(response));
}

async function refund(client: AdminApiClient, args: ParsedArgs, io: CommandIo, target: AdminApiTarget): Promise<void> {
  const id = parseId(args);

  if (!isForce(args)) {
    const { data: detail } = await getCancellationRequest(client, id);
    const preview = buildRefundPreview(detail);
    writePreview(io, args, target, preview.changesState, preview.lines, detail);
    return;
  }

  io.err(REAL_MONEY_TEXT);
  const response = await refundCancellationRequest(client, id);
  writeResult(io, args, response, buildRefundResultLines(response));
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

function writeResult(io: CommandIo, args: ParsedArgs, response: unknown, lines: PreviewLine[]): void {
  if (isJson(args)) {
    io.out(JSON.stringify(response, null, 2));
    return;
  }

  io.out(renderPreviewLines(lines, io.palette));
}

/**
 * Fehler-JSON für stderr: code (Feld error der API) plus Handlungshinweis.
 * Bei refund_failed zusätzlich, was bis zum Abbruch schon erstattet war.
 */
function errorPayload(error: AdminApiError): Record<string, unknown> {
  const payload = adminApiErrorPayload(error);
  const code = typeof payload.code === 'string' ? payload.code : undefined;
  if (code && ERROR_CODE_HINTS[code]) payload.hint = ERROR_CODE_HINTS[code];

  const data = (error.body as { data?: Partial<CancellationRequestDetail> } | undefined)?.data;
  const execution = data && typeof data === 'object' ? data.refund_execution : undefined;
  if (code === 'refund_failed' && execution) {
    payload.refund_execution = {
      status: execution.status,
      refunded_cents: execution.refunded_cents,
      outstanding_cents: execution.outstanding_cents,
      stripe_refund_ids: execution.stripe_refund_ids,
      error: execution.error,
    };
  }
  return payload;
}

// ============================================================================
// Einstieg
// ============================================================================

const OPERATIONS: Record<string, (client: AdminApiClient, args: ParsedArgs, io: CommandIo, target: AdminApiTarget) => Promise<void>> = {
  list,
  show,
  confirm,
  reject,
  refund,
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
    if (WRITE_OPERATIONS.includes(operation)) requireExplicitEnvironment(target, operation);
    io.err(`Ziel: ${describeTarget(target)}`);

    const client = new AdminApiClient({
      baseUrl: target.baseUrl,
      token: target.token,
      basicAuth: target.basicAuth,
      basicAuthVariable: target.basicAuthVariable,
    });
    await handler(client, args, io, target);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof AdminApiError) {
      io.err(JSON.stringify(errorPayload(error), null, 2));
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

ABLAUF: prüfen → confirm → refund
  1) list / show            lesen, Warnungen und Berechnung prüfen (frei)
  2) confirm <id>           Kündigung bestätigen: Wirksamkeit, Zugangsende, Stripe-Abo, Mail.
                            Löst KEINE Erstattung aus.
  3) refund <id>            Erstattung über Stripe auszahlen. ECHTES GELD.
  confirm, reject und refund sind VERÄNDERND, nur nach Ansage. Ohne --force nur Vorschau.
  Sie brauchen immer ein ausdrückliches Ziel (--env=production|staging oder $LERNPLATTFORM_ENV),
  sonst brechen sie ab, auch die Vorschau.

AKTIONEN
  list                 Kündigungsanfragen auflisten (lesend). Default: offene (pending), älteste zuerst
  show <id>            Eine Anfrage im Detail: Teilnehmer, Pass, Stripe-Abo, Wirksamkeitsdatum
                       (gespeichert und neu berechnet), Erstattung (Berechnung und ausgeführt),
                       Abo-Kündigung, Review, Warnungen (lesend)
  confirm <id>         Anfrage bestätigen. VERÄNDERND, nur nach Ansage. Ohne --force nur Vorschau
  reject <id>          Unzulässige Erklärung ablehnen (Duplikat, keine Kündigung, falscher Vertrag,
                       Widerruf ausgeschlossen). Eine wirksame Kündigung wird bestätigt, nicht
                       abgelehnt. VERÄNDERND, nur nach Ansage. Ohne --force nur Vorschau
  refund <id>          Berechnete Erstattung über Stripe auszahlen. VERÄNDERND, ECHTES GELD, nur nach
                       ausdrücklicher Ansage. Ohne --force nur Vorschau

FLAGS
  --env=production|staging   Zielumgebung. Lesend (list, show): Default $LERNPLATTFORM_ENV, sonst
                             production, stderr zeigt "Default ohne --env". Verändernd (confirm, reject,
                             refund): Pflicht, ohne --env und ohne $LERNPLATTFORM_ENV Abbruch (Exit 1)
  --json                     Rohes JSON der API auf stdout statt Tabelle/Text
  list:
    --status=S               pending (Default) | confirmed | rejected | withdrawn | all
    --page=N                 Seite (ab 1)
    --per-page=N             Einträge pro Seite (Server-Default 25, max ${MAX_PER_PAGE})
  confirm:
    --wichtiger-grund-anerkannt  Nur außerordentliche Kündigung: wichtiger Grund anerkannt (§ 314 BGB),
                             sofortige Wirkung. Ohne das Flag gilt sie als ordentliche Kündigung zum
                             nächstmöglichen Termin (Umdeutung, § 140 BGB). Sonst 422.
    --als-widerruf           Ordentliche/außerordentliche Anfrage als Widerruf behandeln: volle Erstattung,
                             Zugang und Abo enden sofort. Nur bei Eingang innerhalb von 14 Tagen nach dem
                             Kauf (Warnung widerruf-moeglich), nur für Verbraucher (nie Firmenpass),
                             nicht zusammen mit --wichtiger-grund-anerkannt.
    --notiz="…"              Interne Admin-Notiz (admin_notes, max ${MAX_TEXT_LENGTH} Zeichen)
    --force                  Wirklich ausführen
  reject:
    --unzulaessig=ART        Pflicht. Warum die Erklärung unzulässig ist:
                               duplikat                 schon gekündigt oder in Prüfung
                               keine-erklaerung         Frage, Versehen, zurückgenommen
                               falscher-vertrag         falscher Pass, kein Vertragspartner
                               widerruf-ausgeschlossen  nur Widerruf: Frist abgelaufen oder Firmenpass
                             (die API-Werte duplicate, not_a_declaration, wrong_contract,
                             withdrawal_not_available gehen auch)
    --grund="…"              Pflicht. Begründung, geht per Mail an den Teilnehmer (max ${MAX_TEXT_LENGTH} Zeichen)
    --force                  Wirklich ausführen
  refund:
    --force                  Wirklich auszahlen (Stripe-Refund). Kein Betrag wählbar: immer die berechnete
                             Erstattung minus bereits erstattet
  Lange Texte: --notiz-stdin / --grund-stdin (Heredoc) oder --notiz-base64 / --grund-base64
  Schalter (--force, --wichtiger-grund-anerkannt, --als-widerruf) nehmen keinen Wert; die ID steht vorn.

WAS DIE BEFEHLE MIT --force AUSLÖSEN
  confirm --force  → Status "confirmed", Wirksamkeitsdatum wird neu festgelegt (ab Zugang der Erklärung),
                     Zugang endet zum Wirksamkeitsdatum (sofort bei Widerruf/anerkanntem Grund),
                     Stripe-Abo wird zum Wirksamkeitsdatum gekündigt (sofort, wenn es sofort wirkt oder
                     das Datum erreicht ist), Bestätigungsmail an den echten Teilnehmer. KEINE Erstattung.
                     Bündel-Abo (mehrere Pässe, ein Kauf) = ein Vertrag: der Zugang ALLER Pässe des Bündels
                     endet zum selben Zeitpunkt (subscription_cancellation.bundle_user_pass_ids).
                     Gesperrt (409) bei paid_amount_unknown, bundle_subscription_ambiguous, user_pass_missing.
  reject --force   → Status "rejected" mit rejection_ground, Ablehnungsmail mit --grund an den Teilnehmer.
  refund --force   → Stripe-Refund(s) über die Zahlungen des Vertrags, neueste zuerst, auf das beim Kauf
                     genutzte Zahlungsmittel. Echtes Geld, nicht umkehrbar. Nur für bestätigte Anfragen
                     mit bekanntem Zahlbetrag. Direkt in Stripe erstattete Beträge sind schon abgezogen.
                     Kommt nach der Erstattung noch eine Rate, steht die Anfrage auf partially_refunded
                     (REST-OFFEN) und refund --force zahlt nur den Rest.
  Ohne --force: nur Vorschau (ein GET), nichts wird verändert, Exit 0.
  Idempotent: bereits bestätigt/abgelehnt/erstattet → already_confirmed/already_rejected/already_refunded,
  keine zweite Mail, keine zweite Auszahlung. Jeder POST schickt einen frischen Idempotency-Key (UUID).

ERGEBNIS- UND FEHLERCODES (stderr-JSON: "code" und "hint")
  confirm   200 confirmed | already_confirmed
            409 conflict (anderer Status) | paid_amount_unknown (Zahlungsbuch fehlt, Backfill nötig)
                | bundle_subscription_ambiguous (Abo bezahlt Pässe eines anderen Kaufs)
                | user_pass_missing (Pass gelöscht)
            422 unprocessable (Flag passt nicht zur Anfrage, z. B. Widerruf bei Firmenpass)
  reject    200 rejected | already_rejected       409 conflict
            422 unprocessable (--unzulaessig passt nicht, z. B. widerruf-ausgeschlossen bei Kündigung)
  refund    200 refunded | already_refunded | nothing_to_refund
            409 not_confirmed | paid_amount_unknown | refund_in_progress | user_pass_missing
            422 unprocessable (keine Erstattung berechenbar)
            502 refund_failed (Stripe hat abgelehnt; stderr zeigt refund_execution, erneut mit --force
                möglich, bereits erstattete Anteile werden nicht doppelt gezahlt)

WARNUNGEN (Kurzcodes in der list-Tabelle, Klartext in show und in der Vorschau; VERSALIEN = kritisch)
  ZAHLUNGSBUCH-FEHLT       paid_amount_unknown: Bestätigen gesperrt, Zahlungsbuch fehlt (Backfill:
                           php artisan pass:backfill-payments). Erstatten ebenso
  ABO-BUENDEL-UNKLAR       bundle_subscription_ambiguous: Abo bezahlt Pässe eines anderen Kaufs,
                           Bestätigen gesperrt, erst in Stripe klären
  erstattung-offen         refund_outstanding: bestätigt, Erstattung noch offen (oder Rest nach neuer Rate).
                           Bei Abos erst nach der letzten Rate vor dem Wirksamkeitsdatum erstatten
  ERSTATTUNG-FEHLGESCHLAGEN refund_failed: letzter refund-Versuch von Stripe abgelehnt
  ABO-KUENDIGUNG-FEHLGESCHLAGEN subscription_cancellation_failed: Stripe-Abo nicht gekündigt → in Stripe kündigen
  ABO-NICHT-IN-STRIPE      subscription_not_found: Abo-ID am Pass, Stripe kennt das Abo nicht
  STRIPE-KUENDIGUNG-FEHLT  subscription_cancel_at_missing: bestätigt, aber Abo ohne Enddatum
  widerruf-erstatten       withdrawal_refund_due: Widerruf, voller Betrag bis zum genannten Datum erstatten
  widerruf-moeglich        withdrawal_possible: Eingang innerhalb 14 Tagen nach Kauf, --als-widerruf möglich
  wichtiger-grund-offen    important_reason_decision_required: außerordentlich, Entscheidung beim confirm
  vertragspreis-fehlt      contract_price_unknown: Geschuldetes mit Katalogpreis gerechnet (Gutschein fehlt)
  abo-buendel              bundle_subscription: Bündel = ein Vertrag, confirm beendet Abo und Zugang
                           aller Pässe des Bündels zum selben Termin
  pass-geloescht           user_pass_missing: Pass gelöscht, Zugang/Abo/Erstattung nicht prüfbar
  datum-vergangen          effective_date_in_past: gespeichertes Wirksamkeitsdatum liegt in der Vergangenheit
  offen>14d                pending_longer_than_14_days: Anfrage wartet länger als 14 Tage
  abo-gekuendigt           subscription_already_canceled: Stripe-Abo hat schon ein Enddatum
  zugang-laenger           access_continues_after_effective_date: Zugang läuft über das Datum hinaus
  abo-ende-abweichend      subscription_end_differs_from_effective_date
  Spalte "Erstattung" der Liste: — (keine) | läuft | erstattet | REST-OFFEN | FEHLGESCHLAGEN.
  Widerruf: Spalte "Art" zeigt "Erstattung bis TT.MM.JJJJ" (14 Tage nach Eingang, § 357 BGB).

RECHTLICHER RAHMEN (Berechnung macht die Plattform, die CLI zeigt sie nur)
  Ordentliche Kündigung nach § 5 FernUSG: im ersten Halbjahr frühestens zu dessen Ende mit 6 Wochen Frist,
  danach mit 3 Monaten Frist ab Zugang. Außerordentlich ohne anerkannten Grund: Umdeutung (§ 140 BGB).
  Widerruf: nur Verbraucher, 14 Tage ab Kauf, Vertrag endet mit Zugang, voller Betrag.
  Bündel: ein Kauf mehrerer Pässe auf einem Abo gilt als ein Vertrag (Kanzlei-Frage offen).
  Ablehnen: nur unzulässige Erklärungen; eine Kündigung ist ein Gestaltungsrecht und wird bestätigt.

UMGEBUNG UND TOKEN (getrennt vom Content-Token AIDI_API_TOKEN)
  LERNPLATTFORM_ADMIN_TOKEN          Admin-Token für production (Pflicht für --env=production)
  LERNPLATTFORM_STAGING_ADMIN_TOKEN  Admin-Token für staging   (Pflicht für --env=staging)
  LERNPLATTFORM_ENV                  Default für --env (zählt als ausdrückliches Ziel)
  LERNPLATTFORM_BASE_URL             Übersteuert die URL (z. B. lokale Instanz), Token nach --env
  LERNPLATTFORM_STAGING_BASIC_AUTH   user:passwort für die nginx-Basic-Auth vor staging.
                                     Dann: Authorization: Basic …, Token in X-API-Authorization
  Defaults: production https://app.ausbildung-in-der-it.de, staging https://staging.ausbildung-in-der-it.de
  Token: Backoffice > System > API Tokens, Besitzer = du selbst (Plattform-Admin),
  Scopes cancellation-requests:read (list/show/Vorschau) und cancellation-requests:write (confirm/reject/refund).

IO-KONVENTIONEN
  stdout    Tabelle/Text, mit --json das JSON der API. Vorschau mit --json:
            {"mode":"preview","changes_state":true|false,"lines":[{"kind","text"}],"data":{…}}
            changes_state=false: --force würde nichts ändern oder vom Server abgelehnt (409/422)
  stderr    "Ziel: <url> (<umgebung>)" und Fehler als JSON:
            {"error":"…","status":409,"code":"paid_amount_unknown","hint":"…","current_status":"pending"}
  Exit 0    Erfolg, auch Vorschau und already_*/nothing_to_refund
  Exit 1    Aufruf-/Konfigurationsfehler (Flag, ID, Token fehlt), kein Request verschickt
  Exit 2    API-Fehler: 401/403 (Token, Scope, Besitzer kein Plattform-Admin, Basic-Auth), 404, 409, 422,
            502, 5xx oder Server nicht erreichbar (status 0)

BEISPIELE
  lernplattform kuendigungen list
  lernplattform kuendigungen list --status=confirmed          # u. a. offene Erstattungen
  lernplattform kuendigungen show 12
  lernplattform kuendigungen show 12 --json | jq '.data.refund_execution'
  lernplattform kuendigungen confirm 12 --env=production                  # Vorschau (Umdeutung bei außerordentlich)
  lernplattform kuendigungen confirm 12 --env=production --wichtiger-grund-anerkannt   # Vorschau, sofortige Wirkung
  lernplattform kuendigungen confirm 12 --env=production --als-widerruf   # Vorschau als Widerruf
  lernplattform kuendigungen confirm 12 --env=production --notiz="Telefonisch geklärt" --force
  lernplattform kuendigungen refund 12 --env=production                   # Vorschau: Betrag, erstattet, offen
  lernplattform kuendigungen refund 12 --env=production --force           # ECHTES GELD
  lernplattform kuendigungen reject 12 --env=production --unzulaessig=duplikat --grund="Bereits am 18.09. gekündigt"   # Vorschau
  LERNPLATTFORM_BASE_URL=http://127.0.0.1:8125 lernplattform kuendigungen list

WORKFLOW (für Agenten)
  1) lernplattform kuendigungen list --json 2>/dev/null | jq '.data[] | {id, type, refund_status, warnings: [.warnings[].code]}'
  2) lernplattform kuendigungen show <id>                  # Warnungen, Wirksamkeit und Erstattung lesen
  3) lernplattform kuendigungen confirm <id> --env=production [--wichtiger-grund-anerkannt|--als-widerruf]   # Vorschau
  4) Ansage abwarten, dann confirm <id> … --force          # Ergebnis auf ACHTUNG-Zeilen prüfen (Abo)
  5) lernplattform kuendigungen refund <id> --env=production   # Vorschau zeigen, Betrag nennen
  6) Erst nach ausdrücklicher Freigabe: refund <id> --env=production --force
  Bei ZAHLUNGSBUCH-FEHLT nicht bestätigen: erst Backfill auf dem Server (eigene Ansage), dann erneut prüfen.
`;
