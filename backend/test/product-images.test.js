import assert from 'node:assert/strict';
import test from 'node:test';

test('integracao de imagens exige PostgreSQL isolado de testes', { skip: !process.env.AIMERC_TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.AIMERC_TEST_DATABASE_URL;
  const { initializePostgres } = await import('../src/lib/postgres.js');
  await initializePostgres();
  assert.ok(true);
});
