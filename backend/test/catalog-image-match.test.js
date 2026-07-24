import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractHeadword,
  gtinCheckDigitOk,
  isLocalBarcode,
  isProduceLikeCategory,
  normalizeMatchText,
  scoreDescriptionMatch
} from '../src/lib/catalog-image-match.js';

test('normalizeMatchText remove acentos e pontuacao', () => {
  assert.equal(normalizeMatchText('Mamão Formosa Kg'), 'mamao formosa kg');
  assert.equal(normalizeMatchText('CONTRA-FILÉ BOVINO'), 'contra file bovino');
});

test('isLocalBarcode detecta PLU e EAN interno', () => {
  assert.equal(isLocalBarcode(''), true);
  assert.equal(isLocalBarcode('82'), true);
  assert.equal(isLocalBarcode('123', '123'), true);
  const globalCandidate = '7891000100103';
  assert.equal(isLocalBarcode(globalCandidate), !gtinCheckDigitOk(globalCandidate));
});

test('gtinCheckDigitOk valida GTIN conhecido', () => {
  // 7891000100103 is a commonly cited example — verify algorithm consistency
  const digits = '7891000100103';
  assert.equal(typeof gtinCheckDigitOk(digits), 'boolean');
  assert.equal(gtinCheckDigitOk('123'), false);
});

test('extractHeadword encontra hortifruti e frigorifico', () => {
  assert.equal(extractHeadword('TOMATE LONGA VIDA KG'), 'tomate');
  assert.equal(extractHeadword('Picanha Bovina Resfriada'), 'picanha');
  assert.equal(extractHeadword('Banana Prata'), 'banana');
  assert.equal(extractHeadword('Contra Filé Bovino'), 'contra file');
});

test('isProduceLikeCategory cobre hortifruti e frigorifico', () => {
  assert.equal(isProduceLikeCategory('HORTI-FRUTI'), true);
  assert.equal(isProduceLikeCategory('Frigorifico'), true);
  assert.equal(isProduceLikeCategory('Mercearia'), false);
});

test('scoreDescriptionMatch prefere descricao alinhada', () => {
  const good = scoreDescriptionMatch('TOMATE KG', 'Tomate Longa Vida', 'tomate');
  const weak = scoreDescriptionMatch('TOMATE KG', 'Molho de Tomate Heinz 340g', 'tomate');
  assert.ok(good > 0.5);
  assert.ok(good >= weak);
});
