import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProductSaleRule } from '../src/lib/product-sale-rules.js';

function productRow(overrides = {}) {
  return {
    id: 'product_1',
    sku: '001',
    name: 'Produto de teste',
    category: 'Mercearia',
    price: 10,
    old_price: null,
    stock: 20,
    unit: 'UN',
    image: '',
    promo: 0,
    active: 1,
    featured: 0,
    catalog_visible: 1,
    ...overrides,
  };
}

test('modo automatico reconhece produto do ERP em KG', () => {
  const product = resolveProductSaleRule(productRow({ unit: 'kg', sale_mode: 'AUTO', quantity_step: 0.1 }));
  assert.equal(product.soldByWeight, true);
  assert.equal(product.unit, 'KG');
  assert.equal(product.quantityStep, 0.1);
});

test('modo unidade forca quantidade inteira mesmo quando a origem e KG', () => {
  const product = resolveProductSaleRule(productRow({ unit: 'KG', sale_mode: 'unit', quantity_step: 0.1 }));
  assert.equal(product.soldByWeight, false);
  assert.equal(product.unit, 'UN');
  assert.equal(product.quantityStep, 1);
});

test('produto em KG respeita o incremento individual configurado', () => {
  const product = resolveProductSaleRule(productRow({ unit: 'KG', sale_mode: 'WEIGHT', quantity_step: 0.275 }));
  assert.equal(product.soldByWeight, true);
  assert.equal(product.unit, 'KG');
  assert.equal(product.quantityStep, 0.275);
});

test('peso escrito no nome nao transforma produto UN em produto fracionado', () => {
  const product = resolveProductSaleRule(productRow({ name: 'Calabresa pacote 1 kg', unit: 'UN', sale_mode: 'WEIGHT', quantity_step: 0.5 }));
  assert.equal(product.soldByWeight, false);
  assert.equal(product.unit, 'UN');
  assert.equal(product.quantityStep, 1);
});
