/**
 * Zielumgebung und Token für die Admin-API der Plattform (/api/admin/v1).
 *
 * Bewusst getrennt vom Content-CLI-Token (AIDI_API_TOKEN / AIDI_HOST_URL):
 * Admin-Befehle handeln im Namen einer Person und brauchen deren eigenen
 * SystemApiToken mit Plattform-Admin als Besitzer.
 */

export const ADMIN_ENVIRONMENTS = ['production', 'staging'] as const;
export type AdminEnvironment = (typeof ADMIN_ENVIRONMENTS)[number];

export const DEFAULT_BASE_URLS: Record<AdminEnvironment, string> = {
  production: 'https://app.ausbildung-in-der-it.de',
  staging: 'https://staging.ausbildung-in-der-it.de',
};

export const TOKEN_VARIABLES: Record<AdminEnvironment, string> = {
  production: 'LERNPLATTFORM_ADMIN_TOKEN',
  staging: 'LERNPLATTFORM_STAGING_ADMIN_TOKEN',
};

/**
 * Basic-Auth vor der Plattform (nginx auth_basic), Format user:passwort.
 * Nur staging steht hinter Basic-Auth; production braucht keine.
 */
export const BASIC_AUTH_VARIABLES: Partial<Record<AdminEnvironment, string>> = {
  staging: 'LERNPLATTFORM_STAGING_BASIC_AUTH',
};

export const BASE_URL_VARIABLE = 'LERNPLATTFORM_BASE_URL';
export const ENVIRONMENT_VARIABLE = 'LERNPLATTFORM_ENV';

export interface AdminApiTarget {
  environment: AdminEnvironment;
  /** true, wenn --env oder $LERNPLATTFORM_ENV die Umgebung gesetzt hat; false beim stillen Default production */
  environmentExplicit: boolean;
  baseUrl: string;
  /** true, wenn LERNPLATTFORM_BASE_URL die Default-URL der Umgebung übersteuert */
  baseUrlOverridden: boolean;
  token: string;
  tokenVariable: string;
  /** user:passwort für nginx-Basic-Auth, nur wenn die Variable der Umgebung gesetzt ist */
  basicAuth?: string;
  /** Name der Basic-Auth-Variable der Umgebung, für Fehlermeldungen */
  basicAuthVariable?: string;
}

/** Aufruf- oder Konfigurationsfehler vor dem ersten HTTP-Request (Exit 1). */
export class AdminUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminUsageError';
  }
}

export function parseEnvironment(value: unknown): AdminEnvironment {
  if (value === undefined || value === null || value === '') {
    return 'production';
  }

  const normalized = String(value).trim().toLowerCase();
  if ((ADMIN_ENVIRONMENTS as readonly string[]).includes(normalized)) {
    return normalized as AdminEnvironment;
  }

  throw new AdminUsageError(
    `Unbekannte Umgebung: ${String(value)}. Erlaubt: ${ADMIN_ENVIRONMENTS.join(', ')}.`
  );
}

/**
 * Reihenfolge:
 *  - Umgebung: --env > $LERNPLATTFORM_ENV > production (nur für lesende Befehle,
 *    verändernde verlangen eine ausdrückliche Umgebung, siehe requireExplicitEnvironment)
 *  - Base-URL: $LERNPLATTFORM_BASE_URL > Default-URL der Umgebung
 *  - Token:    production -> $LERNPLATTFORM_ADMIN_TOKEN, staging -> $LERNPLATTFORM_STAGING_ADMIN_TOKEN
 *  - Basic-Auth: staging -> $LERNPLATTFORM_STAGING_BASIC_AUTH (optional, user:passwort)
 */
export function resolveAdminApiTarget(
  envFlag: unknown,
  env: NodeJS.ProcessEnv = process.env
): AdminApiTarget {
  const requested = envFlag ?? env[ENVIRONMENT_VARIABLE];
  const environment = parseEnvironment(requested);
  const environmentExplicit = requested !== undefined && requested !== null && String(requested).trim() !== '';
  const overrideUrl = env[BASE_URL_VARIABLE]?.trim();
  const baseUrl = (overrideUrl || DEFAULT_BASE_URLS[environment]).replace(/\/+$/, '');

  const tokenVariable = TOKEN_VARIABLES[environment];
  const token = env[tokenVariable]?.trim();
  if (!token) {
    throw new AdminUsageError(
      `${tokenVariable} ist nicht gesetzt (Umgebung ${environment}). ` +
        'Eigenen Admin-Token im Backoffice unter System > API Tokens anlegen (Besitzer: du, ' +
        'Scopes cancellation-requests:read und :write) und in ~/.config/lernplattform/.env eintragen.'
    );
  }

  const basicAuthVariable = BASIC_AUTH_VARIABLES[environment];
  const basicAuth = basicAuthVariable ? env[basicAuthVariable]?.trim() || undefined : undefined;
  if (basicAuth !== undefined && !/^[^:]+:.+$/.test(basicAuth)) {
    // Wert bewusst nicht ausgeben, er enthält ein Passwort.
    throw new AdminUsageError(`${basicAuthVariable} hat nicht das Format user:passwort.`);
  }

  return {
    environment,
    environmentExplicit,
    baseUrl,
    baseUrlOverridden: Boolean(overrideUrl),
    token,
    tokenVariable,
    basicAuth,
    basicAuthVariable,
  };
}

/**
 * Verändernde Befehle (confirm, reject, refund) laufen nie still gegen
 * production: ohne --env und ohne $LERNPLATTFORM_ENV brechen sie ab.
 */
export function requireExplicitEnvironment(target: Pick<AdminApiTarget, 'environmentExplicit'>, operation: string): void {
  if (target.environmentExplicit) return;

  throw new AdminUsageError(
    `${operation} verändert Daten und braucht ein ausdrückliches Ziel: --env=production oder --env=staging ` +
      `(alternativ ${ENVIRONMENT_VARIABLE} setzen). Ohne Angabe wird nichts ausgeführt, auch keine Vorschau.`
  );
}

export function describeTarget(
  target: Pick<AdminApiTarget, 'baseUrl' | 'environment' | 'baseUrlOverridden'> &
    Partial<Pick<AdminApiTarget, 'basicAuth' | 'environmentExplicit'>>
): string {
  const environment = target.environment === 'production' ? 'PRODUCTION' : target.environment;
  const defaulted = target.environmentExplicit === false ? ', Default ohne --env' : '';
  const source = target.baseUrlOverridden ? `${BASE_URL_VARIABLE}, Token für ${environment}` : environment;
  const basicAuth = target.basicAuth ? ', mit Basic-Auth' : '';
  return `${target.baseUrl} (${source}${defaulted}${basicAuth})`;
}
