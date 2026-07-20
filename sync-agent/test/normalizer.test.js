import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProducts } from '../src/normalizer.js';

test('normaliza retorno em portugues do ERP', () => {
  const [product] = normalizeProducts({ produtos: [{ codigo: 12, codigoBarras: '789123', descricao: 'Arroz 1kg',
    departamento: 'Mercearia', precoVenda: '8,99', precoOferta: '7,49', saldoEstoque: 10, unidade: 'UN', ativo: true }] }, 'SYSPDV');
  assert.deepEqual(product, { sku: '12', barcode: '789123', name: 'Arroz 1kg', category: 'Mercearia', price: 7.49,
    oldPrice: 8.99, stock: 10, unit: 'UN', image: '', promo: true, active: true });
});

test('aceita lista na raiz e campos em ingles', () => {
  const [product] = normalizeProducts([{ sku: 'A1', ean: '123', name: 'Cafe', category: 'Mercearia', price: 5, stock: 2 }], 'GENERIC_JSON');
  assert.equal(product.name, 'Cafe');
  assert.equal(product.price, 5);
});
