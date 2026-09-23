/**
 * Generischer Client für die Admin-API der Plattform (Bearer-Token, JSON).
 * Wird von allen Admin-Bereichen genutzt (heute Kündigungen, später weitere).
 */

import { randomUUID } from 'node:crypto';

export const ADMIN_API_PREFIX = '/api/admin/v1';
export const ADMIN_API_DEFAULT_TIMEOUT_MS = 30_000;

export type AdminApiQuery = Record<string, boolean | number | string | undefined>;

export interface AdminApiClientOptions {
  /** Host der Plattform, z. B. https://app.ausbildung-in-der-it.de oder http://127.0.0.1:8124 */
  baseUrl: string;
  token: string;
  /** Pfad-Präfix der API, Default /api/admin/v1 */
  apiPrefix?: string;
  timeoutMs?: number;
}

export interface AdminApiPostOptions {
  /** Wird als Idempotency-Key gesendet; ohne Angabe eine frische UUID pro Aufruf. */
  idempotencyKey?: string;
}

/**
 * Fehlerantwort der Admin-API oder Transportfehler.
 * status 0 = keine HTTP-Antwort (Timeout, Verbindungsfehler).
 * body = geparstes JSON, bei Nicht-JSON der Rohtext.
 */
export class AdminApiError extends Error {
  constructor(
    public readonly detail: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(status > 0 ? `Admin-API Fehler (HTTP ${status}): ${detail}` : `Admin-API nicht erreichbar: ${detail}`);
    this.name = 'AdminApiError';
  }
}

export class AdminApiClient {
  readonly apiBaseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: AdminApiClientOptions) {
    const host = options.baseUrl.replace(/\/+$/, '');
    this.apiBaseUrl = `${host}${options.apiPrefix ?? ADMIN_API_PREFIX}`;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? ADMIN_API_DEFAULT_TIMEOUT_MS;
  }

  async get<T>(path: string, query: AdminApiQuery = {}): Promise<T> {
    return this.request<T>('GET', this.buildUrl(path, query), { Accept: 'application/json' });
  }

  async post<T>(path: string, body: unknown = {}, options: AdminApiPostOptions = {}): Promise<T> {
    return this.request<T>(
      'POST',
      this.buildUrl(path),
      {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': options.idempotencyKey ?? randomUUID(),
      },
      JSON.stringify(body)
    );
  }

  private buildUrl(path: string, query: AdminApiQuery = {}): string {
    const url = new URL(`${this.apiBaseUrl}/${path.replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async request<T>(
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        body,
        headers: { ...headers, Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw transportError(error, url, this.timeoutMs);
    }

    const payload = await readBody(response);
    if (!response.ok) {
      throw new AdminApiError(describeErrorBody(response.status, payload, response.statusText), response.status, payload);
    }

    return payload as T;
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function transportError(error: unknown, url: string, timeoutMs: number): AdminApiError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new AdminApiError(`Zeitüberschreitung nach ${timeoutMs / 1000} s (${url})`, 0);
  }

  const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : '';
  const message = error instanceof Error ? error.message : String(error);
  return new AdminApiError(`${message}${cause} (${url})`, 0);
}

/** Antworten der Token-Middleware (401/403) mit einem Hinweis, was zu tun ist. */
const AUTH_HINTS: Record<string, string> = {
  'Authentication required': 'Kein Token gesendet. LERNPLATTFORM_ADMIN_TOKEN bzw. LERNPLATTFORM_STAGING_ADMIN_TOKEN prüfen.',
  'Invalid token': 'Token unbekannt. Passt der Token zur Umgebung (--env, LERNPLATTFORM_BASE_URL)?',
  'Token expired': 'Token abgelaufen. Im Backoffice unter System > API Tokens einen neuen anlegen.',
  'Insufficient scope': 'Dem Token fehlt der Scope (cancellation-requests:read bzw. cancellation-requests:write).',
  'Token owner is not a platform admin':
    'Der Token hat keinen Besitzer oder der Besitzer ist kein Plattform-Admin (verifizierte Admin-Domain).',
};

/**
 * Lesbare Fehlermeldung aus einer Fehlerantwort. Laravel liefert `message`
 * (404, 409, 422), die Token-Middleware `error` (401, 403).
 */
export function describeErrorBody(status: number, body: unknown, statusText = ''): string {
  if (typeof body === 'string' && body.trim() !== '') return body.trim().slice(0, 300);
  if (!body || typeof body !== 'object') return statusText || `HTTP ${status}`;

  const record = body as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof record.message === 'string') parts.push(record.message);

  if (typeof record.error === 'string' && record.error !== 'conflict') {
    const hint = AUTH_HINTS[record.error];
    parts.push(hint ? `${record.error} (${hint})` : record.error);
  }

  if (typeof record.current_status === 'string') parts.push(`Aktueller Status: ${record.current_status}`);

  if (record.errors && typeof record.errors === 'object') {
    for (const [field, messages] of Object.entries(record.errors as Record<string, unknown>)) {
      const list = Array.isArray(messages) ? messages.join(' ') : String(messages);
      parts.push(`${field}: ${list}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : statusText || `HTTP ${status}`;
}

/** Fehler-Payload für stderr (JSON), wie im Rest der CLI: {"error": "..."} plus Details. */
export function adminApiErrorPayload(error: AdminApiError): Record<string, unknown> {
  const payload: Record<string, unknown> = { error: error.message, status: error.status };
  const body = error.body;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.current_status === 'string') payload.current_status = record.current_status;
    if (record.errors && typeof record.errors === 'object') payload.errors = record.errors;
  }
  return payload;
}
