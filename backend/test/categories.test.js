import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCategory } from '../src/lib/categories.js';

test('unifica variacoes de caixa e nomes equivalentes de categoria', () => {
  assert.equal(normalizeCategory('CEREAIS'), 'Cereais');
  assert.equal(normalizeCategory('Congelados'), 'Congelados');
  assert.equal(normalizeCategory('BAZAR'), 'Casa e Bazar');
  assert.equal(normalizeCategory('PERFUMARIA'), 'Higiene e Beleza');
  assert.equal(normalizeCategory('HORTI-FRUTI'), 'Hortifruti');
});
