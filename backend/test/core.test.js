import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, hashPassword, readToken, verifyPassword } from '../src/lib/auth.js';
import { getStore, getStoreBySlug, listProducts } from '../src/lib/database.js';

test('hash de senha valida apenas a senha correta', () => {
  const credentials = hashPassword('segredo-forte');
  assert.equal(verifyPassword('segredo-forte', credentials.salt, credentials.hash), true);
  assert.equal(verifyPassword('senha-errada', credentials.salt, credentials.hash), false);
});

test('token assinado preserva papel e loja', () => {
  const token = createToken({ id: 'u1', email: 'teste@aimerc.local', name: 'Teste', role: 'STORE_MANAGER', store_id: 'store_001' });
  const payload = readToken(token);
  assert.equal(payload.role, 'STORE_MANAGER');
  assert.equal(payload.storeId, 'store_001');
});

test('banco master e banco da loja estao isolados e pesquisaveis', () => {
  assert.equal(getStore('store_001').slug, 'aimerc-demo');
  assert.equal(getStoreBySlug('aimerc-demo').id, 'store_001');
  assert.ok(listProducts('store_001', { q: 'hortifruti' }).some(product => product.name === 'Banana Prata'));
  assert.deepEqual(listProducts('store_inexistente'), []);
});
