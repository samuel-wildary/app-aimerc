import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, hashPassword, readToken, verifyPassword } from '../src/lib/auth.js';

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
