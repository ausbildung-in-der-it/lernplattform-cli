import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { config as dotenvConfig } from 'dotenv';

/**
 * Lookup order (first found wins):
 *  1. $LERNPLATTFORM_ENV_FILE (explicit override)
 *  2. ./.env (current working directory)
 *  3. ~/.config/lernplattform/.env (global fallback)
 *
 * Existing process.env vars always take precedence over the loaded file.
 */
export function loadEnv(): { source: string | null } {
  const candidates: string[] = [];
  if (process.env.LERNPLATTFORM_ENV_FILE) {
    candidates.push(process.env.LERNPLATTFORM_ENV_FILE);
  }
  candidates.push(resolve(process.cwd(), '.env'));
  candidates.push(resolve(homedir(), '.config', 'lernplattform', '.env'));

  for (const path of candidates) {
    if (existsSync(path)) {
      dotenvConfig({ path, override: false });
      return { source: path };
    }
  }
  return { source: null };
}

export function requireToken(): string {
  const token = process.env.AIDI_API_TOKEN;
  if (!token) {
    throw new Error(
      'AIDI_API_TOKEN ist nicht gesetzt. Lege eine .env an (cwd oder ~/.config/lernplattform/.env) oder setze LERNPLATTFORM_ENV_FILE.'
    );
  }
  return token;
}

export function hostUrl(): string {
  return process.env.AIDI_HOST_URL || 'https://app.ausbildung-in-der-it.de';
}
