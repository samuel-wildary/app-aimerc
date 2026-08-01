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

test('usa a lista de bairros como area de atendimento antes de aplicar o frete', () => {
  const store = { deliveryFee: 7, freeDeliveryAbove: 100 };
  const zones = [{ neighborhood: 'Aldeota', city: 'Fortaleza', state: 'CE', fee: 4.5, active: true }];
  assert.deepEqual(calculateDeliveryFee({ store, zones, address: { neighborhood: 'Aldeota', city: 'Fortaleza', state: 'CE' }, subtotal: 120 }), { available: true, fee: 0, source: 'FREE_DELIVERY', matchedNeighborhood: 'Aldeota' });
  assert.equal(calculateDeliveryFee({ store, zones, address: { neighborhood: 'Aldeota', city: 'Fortaleza', state: 'CE' }, subtotal: 50 }).fee, 4.5);
  assert.deepEqual(calculateDeliveryFee({ store, zones, address: { neighborhood: 'Outro', city: 'Fortaleza', state: 'CE' }, subtotal: 120 }), {
    available: false,
    fee: 0,
    source: 'OUTSIDE_DELIVERY_AREA',
    matchedNeighborhood: null,
    message: 'Infelizmente, não atendemos à sua localização.'
  });
});

test('usa a taxa padrao somente quando a loja ainda nao cadastrou bairros', () => {
  const quote = calculateDeliveryFee({
    store: { deliveryFee: 7, freeDeliveryAbove: 0 },
    zones: [],
    address: { neighborhood: 'Outro', city: 'Fortaleza', state: 'CE' },
    subtotal: 50
  });
  assert.deepEqual(quote, { available: true, fee: 7, source: 'DEFAULT', matchedNeighborhood: null });
});
