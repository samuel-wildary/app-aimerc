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

test('normaliza e consolida o retorno real do Solidcon', () => {
  const products = normalizeProducts([
    { id_produto: 67, codigo_ean: 102, ean_principal: false, produto: 'ABACATE kg', vl_produto: 8.39,
      vl_produto_normal: 9.99, preco_fidelidade_promocao: 7.99, preco_clube_promocao: 0,
      qtd_produto: 19.417, classificacao01: 'HORTI-FRUTI', emb: 'KG', ativo: true },
    { id_produto: 67, codigo_ean: 7891234567895, ean_principal: true, produto: 'ABACATE kg', vl_produto: 8.39,
      vl_produto_normal: 9.99, preco_fidelidade_promocao: 7.99, preco_clube_promocao: 0,
      qtd_produto: 19.417, classificacao01: 'HORTI-FRUTI', emb: 'KG', ativo: true }
  ], 'SOLIDCON');

  assert.equal(products.length, 1);
  assert.deepEqual(products[0], { sku: '67', barcode: '7891234567895', name: 'ABACATE kg', category: 'HORTI-FRUTI',
    price: 7.99, oldPrice: 9.99, stock: 19.417, unit: 'KG', image: '', promo: true, active: true });
});

test('nao usa codigo interno curto do Solidcon como EAN', () => {
  const [product] = normalizeProducts([{ id_produto: 6139, codigo_ean: 18265, produto: 'ABA DO FILE kg <<< INATIVO >>>',
    vl_produto: 36.09, vl_produto_normal: 36.09, qtd_produto: 0, classificacao01: 'FRIGORIFICO', emb: 'KG', ativo: false }], 'SOLIDCON');
  assert.equal(product.barcode, '');
  assert.equal(product.name, 'ABA DO FILE kg');
  assert.equal(product.active, false);
});

test('aceita nomes de campos personalizados sem recompilar o agente', () => {
  const [product] = normalizeProducts({ retorno: { itens: [{ codigoInterno: 'P9', barras: '7891234567895',
    titulo: 'Cafe 500g', grupo: 'Mercearia', valorAtual: 12.9, valorTabela: 14.9, saldoAtual: 8,
    embalagem: 'UN', disponivel: true }] } }, 'SOLIDCON', {
    itemsPath: 'retorno.itens', sku: 'codigoInterno', ean: 'barras', name: 'titulo', category: 'grupo',
    price: 'valorAtual', regularPrice: 'valorTabela', stock: 'saldoAtual', unit: 'embalagem', active: 'disponivel'
  });
  assert.equal(product.sku, 'P9');
  assert.equal(product.name, 'Cafe 500g');
  assert.equal(product.price, 12.9);
  assert.equal(product.oldPrice, 14.9);
  assert.equal(product.stock, 8);
});
