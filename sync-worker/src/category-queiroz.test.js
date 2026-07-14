import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProductCategory } from './category-queiroz.js';

test('move produtos capilares para Higiene e Beleza', () => {
  assert.equal(classifyProductCategory('Creme para Pentear Loreal Paris Elseve 250ml', 'Frios e Embutidos'), 'Higiene e Beleza');
});

test('move produtos odontologicos para Higiene e Beleza', () => {
  assert.equal(classifyProductCategory('Gel Dental Melao e Menta Super Caixa 90g', 'Frios e Embutidos'), 'Higiene e Beleza');
});

test('move refrigerante para Bebidas', () => {
  assert.equal(classifyProductCategory('REFRIG COCA COLA KS 290ML', 'Padaria'), 'Bebidas');
});

test('preserva a categoria quando nao ha evidencia suficiente', () => {
  assert.equal(classifyProductCategory('Massa Para Pastel Massaleve 500g', 'Frios e Embutidos'), 'Frios e Embutidos');
});

test('nao confunde sabor presunto com frios', () => {
  assert.equal(classifyProductCategory('Biscoito Snack 80g sabor Presunto', 'Biscoitos'), 'Biscoitos');
});

test('ovo de Pascoa fica em doces', () => {
  assert.equal(classifyProductCategory('Ovo de Pascoa Chocolate 250g', 'Ovos'), 'Doces e Snacks');
});

test('macarrao para lasanha nao vira congelado', () => {
  assert.equal(classifyProductCategory('Macarrao Lasanha Fortaleza 500g', 'Mercearia'), 'Mercearia');
});

test('mistura para bolo nao vira padaria', () => {
  assert.equal(classifyProductCategory('Mistura para Bolo Chocolate 450g', 'Mercearia'), 'Mercearia');
});

test('taca de vinho nao vira bebida alcoolica', () => {
  assert.equal(classifyProductCategory('Taca Vinho Buffet 260ml', 'Casa e Bazar'), 'Casa e Bazar');
});
