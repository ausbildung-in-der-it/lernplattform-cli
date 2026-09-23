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

export const BASE_URL_VARIABLE = 'LERNPLATTFORM_BASE_URL';
export const ENVIRONMENT_VARIABLE = 'LERNPLATTFORM_ENV';

export interface AdminApiTarget {
  environment: AdminEnvironment;
  baseUrl: string;
  /** true, wenn LERNPLATTFORM_BASE_URL die Default-URL der Umgebung übersteuert */
  baseUrlOverridden: boolean;
  token: string;
  tokenVariable: string;
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
 *  - Umgebung: --env > $LERNPLATTFORM_ENV > production
 *  - Base-URL: $LERNPLATTFORM_BASE_URL > Default-URL der Umgebung
 *  - Token:    production -> $LERNPLATTFORM_ADMIN_TOKEN, staging -> $LERNPLATTFORM_STAGING_ADMIN_TOKEN
 */
export function resolveAdminApiTarget(
  envFlag: unknown,
  env: NodeJS.ProcessEnv = process.env
): AdminApiTarget {
  const environment = parseEnvironment(envFlag ?? env[ENVIRONMENT_VARIABLE]);
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

  return {
    environment,
    baseUrl,
    baseUrlOverridden: Boolean(overrideUrl),
    token,
    tokenVariable,
  };
}

export function describeTarget(target: Pick<AdminApiTarget, 'baseUrl' | 'environment' | 'baseUrlOverridden'>): string {
  const source = target.baseUrlOverridden ? `${BASE_URL_VARIABLE}, Token für ${target.environment}` : target.environment;
  return `${target.baseUrl} (${source})`;
}
