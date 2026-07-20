import test from 'node:test';
import assert from 'node:assert/strict';
import { integrationProvider, integrationProviders, publicIntegrationProvider } from '../src/lib/integration-providers.js';

test('oferece os tres provedores prioritarios e o conector generico', () => {
  assert.deepEqual(integrationProviders.map(item => item.code), ['SYSPDV', 'VAREJO_FACIL', 'SOLICOM', 'GENERIC_JSON']);
});

test('perfil publico nao expoe aliases internos', () => {
  const result = publicIntegrationProvider(integrationProvider('syspdv'));
  assert.equal(result.code, 'SYSPDV');
  assert.equal('aliases' in result, false);
});
