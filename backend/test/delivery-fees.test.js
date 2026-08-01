import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDeliveryFee, findDeliveryZone, normalizeDeliveryArea } from '../src/lib/delivery-fees.js';

test('normaliza bairro ignorando acentos, caixa e espacos', () => {
  assert.equal(normalizeDeliveryArea('  Jos\u00E9   de Alencar '), 'jose de alencar');
});

test('seleciona a regra mais especifica para bairro, cidade e UF', () => {
  const zones = [
    { neighborhood: 'Centro', city: '', state: '', fee: 8, active: true },
    { neighborhood: 'Centro', city: 'Fortaleza', state: 'CE', fee: 5.5, active: true }
  ];
  assert.equal(findDeliveryZone(zones, { neighborhood: 'centro', city: 'FORTALEZA', state: 'ce' }).fee, 5.5);
});

test('usa frete gratis, regra do bairro e taxa padrao nessa ordem', () => {
  const store = { deliveryFee: 7, freeDeliveryAbove: 100 };
  const zones = [{ neighborhood: 'Aldeota', city: 'Fortaleza', state: 'CE', fee: 4.5, active: true }];
  assert.deepEqual(calculateDeliveryFee({ store, zones, address: { neighborhood: 'Aldeota', city: 'Fortaleza', state: 'CE' }, subtotal: 120 }), { fee: 0, source: 'FREE_DELIVERY', matchedNeighborhood: null });
  assert.equal(calculateDeliveryFee({ store, zones, address: { neighborhood: 'Aldeota', city: 'Fortaleza', state: 'CE' }, subtotal: 50 }).fee, 4.5);
  assert.equal(calculateDeliveryFee({ store, zones, address: { neighborhood: 'Outro', city: 'Fortaleza', state: 'CE' }, subtotal: 50 }).fee, 7);
});
