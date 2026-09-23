import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AdminUsageError, describeTarget, resolveAdminApiTarget } from '../../src/admin/config';

describe('resolveAdminApiTarget', () => {
  it('defaults to production with LERNPLATTFORM_ADMIN_TOKEN and ignores the content token', () => {
    const target = resolveAdminApiTarget(undefined, { LERNPLATTFORM_ADMIN_TOKEN: 'prod', AIDI_API_TOKEN: 'content', AIDI_HOST_URL: 'http://x' });

    assert.equal(target.environment, 'production');
    assert.equal(target.baseUrl, 'https://app.ausbildung-in-der-it.de');
    assert.equal(target.token, 'prod');
    assert.equal(target.baseUrlOverridden, false);
  });

  it('uses the staging URL and staging token for --env=staging', () => {
    const target = resolveAdminApiTarget('staging', { LERNPLATTFORM_ADMIN_TOKEN: 'prod', LERNPLATTFORM_STAGING_ADMIN_TOKEN: 'stg' });

    assert.equal(target.baseUrl, 'https://staging.ausbildung-in-der-it.de');
    assert.equal(target.token, 'stg');
  });

  it('takes the environment from LERNPLATTFORM_ENV when --env is missing, the flag wins otherwise', () => {
    const env = { LERNPLATTFORM_ENV: 'staging', LERNPLATTFORM_ADMIN_TOKEN: 'prod', LERNPLATTFORM_STAGING_ADMIN_TOKEN: 'stg' };

    assert.equal(resolveAdminApiTarget(undefined, env).environment, 'staging');
    assert.equal(resolveAdminApiTarget('production', env).environment, 'production');
  });

  it('lets LERNPLATTFORM_BASE_URL override the URL and strips trailing slashes', () => {
    const target = resolveAdminApiTarget(undefined, { LERNPLATTFORM_BASE_URL: 'http://127.0.0.1:8124/', LERNPLATTFORM_ADMIN_TOKEN: 't' });

    assert.equal(target.baseUrl, 'http://127.0.0.1:8124');
    assert.equal(target.baseUrlOverridden, true);
  });

  it('fails with the exact variable name when the token for the environment is missing', () => {
    assert.throws(
      () => resolveAdminApiTarget('staging', { LERNPLATTFORM_ADMIN_TOKEN: 'prod' }),
      (error: unknown) => error instanceof AdminUsageError && /LERNPLATTFORM_STAGING_ADMIN_TOKEN ist nicht gesetzt/.test(error.message)
    );
  });

  it('rejects unknown environments', () => {
    assert.throws(() => resolveAdminApiTarget('prod', { LERNPLATTFORM_ADMIN_TOKEN: 't' }), /Unbekannte Umgebung: prod/);
  });

  it('reads LERNPLATTFORM_STAGING_BASIC_AUTH for staging only', () => {
    const env = {
      LERNPLATTFORM_ADMIN_TOKEN: 'prod',
      LERNPLATTFORM_STAGING_ADMIN_TOKEN: 'stg',
      LERNPLATTFORM_STAGING_BASIC_AUTH: ' user:pass ',
    };

    const staging = resolveAdminApiTarget('staging', env);
    assert.equal(staging.basicAuth, 'user:pass');
    assert.equal(staging.basicAuthVariable, 'LERNPLATTFORM_STAGING_BASIC_AUTH');
    assert.equal(describeTarget(staging), 'https://staging.ausbildung-in-der-it.de (staging, mit Basic-Auth)');

    const production = resolveAdminApiTarget('production', env);
    assert.equal(production.basicAuth, undefined);
    assert.equal(describeTarget(production), 'https://app.ausbildung-in-der-it.de (production)');
  });

  it('leaves Basic-Auth off when the staging variable is empty', () => {
    const target = resolveAdminApiTarget('staging', { LERNPLATTFORM_STAGING_ADMIN_TOKEN: 'stg', LERNPLATTFORM_STAGING_BASIC_AUTH: '' });

    assert.equal(target.basicAuth, undefined);
  });

  it('rejects Basic-Auth without user:passwort format and does not echo the value', () => {
    assert.throws(
      () => resolveAdminApiTarget('staging', { LERNPLATTFORM_STAGING_ADMIN_TOKEN: 'stg', LERNPLATTFORM_STAGING_BASIC_AUTH: 'geheimes-passwort' }),
      (error: unknown) =>
        error instanceof AdminUsageError &&
        /LERNPLATTFORM_STAGING_BASIC_AUTH hat nicht das Format user:passwort/.test(error.message) &&
        !error.message.includes('geheimes-passwort')
    );
  });
});
