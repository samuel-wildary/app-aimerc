import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/aimerc_test';
const { storeOperatingStatus } = await import('../src/lib/database.js');

const store = {
  open: true,
  businessHoursStart: '08:00',
  businessHoursEnd: '20:00',
  businessDays: '1,2,3,4,5,6',
  acceptAfterHours: true
};

test('considera o fuso de Fortaleza dentro do horario da loja', () => {
  const status = storeOperatingStatus(store, new Date('2026-08-03T14:00:00.000Z'));
  assert.equal(status.openNow, true);
  assert.equal(status.nextOpening, null);
});

test('agenda pedido de domingo para a proxima abertura', () => {
  const status = storeOperatingStatus(store, new Date('2026-08-02T15:00:00.000Z'));
  assert.equal(status.openNow, false);
  assert.equal(status.outsideBusinessHours, true);
  assert.equal(status.acceptsAfterHours, true);
  assert.equal(status.nextOpening, '2026-08-03T11:00:00.000Z');
});

test('respeita a opcao de nao aceitar pedidos fora do horario', () => {
  const status = storeOperatingStatus({ ...store, acceptAfterHours: false }, new Date('2026-08-02T15:00:00.000Z'));
  assert.equal(status.openNow, false);
  assert.equal(status.acceptsAfterHours, false);
});
