import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {
  firebirdDatabaseTarget,
  loadSysPdvProducts,
  parseFirebirdListOutput,
  sysPdvRowsToProducts,
  SYSPDV_PRODUCTS_QUERY
} from '../src/firebird-syspdv.js';

const sampleOutput = `
Database:  127.0.0.1/3050:C:\\SYSPDV\\SYSPDV.FDB, User: SYSDBA
SKU                             00000000000173
PRODUCT_NAME                    CAFE TESTE 500G
CATEGORY_NAME                   MERCEARIA
UNIT_NAME                       UN
VARIABLE_WEIGHT                 N
ACTIVE_FLAG                     1
BARCODE                         7891234567895
CURRENT_PRICE                   17.99
PROMO_PRICE                     17.99
OLD_PRICE                       19.99
STOCK                           0.000

SKU                             00000000000173
PRODUCT_NAME                    CAFE TESTE 500G
CATEGORY_NAME                   MERCEARIA
UNIT_NAME                       UN
VARIABLE_WEIGHT                 N
ACTIVE_FLAG                     1
BARCODE                         173
CURRENT_PRICE                   17.99
PROMO_PRICE                     17.99
OLD_PRICE                       19.99
STOCK                           0.000

SKU                             00000000000200
PRODUCT_NAME                    ARROZ 1KG
CATEGORY_NAME                   MERCEARIA
UNIT_NAME                       UN
VARIABLE_WEIGHT                 N
ACTIVE_FLAG                     1
BARCODE                         <null>
CURRENT_PRICE                   8.50
PROMO_PRICE                     0.00
OLD_PRICE                       <null>
STOCK                           12.000
`;

test('monta o alvo remoto do banco Firebird', () => {
  assert.equal(
    firebirdDatabaseTarget({ host: '127.0.0.1', port: 3050, database: 'C:\\SYSPDV\\SYSPDV.FDB' }),
    '127.0.0.1/3050:C:\\SYSPDV\\SYSPDV.FDB'
  );
});

test('aceita caminho local ou alias sem servidor', () => {
  assert.equal(firebirdDatabaseTarget({ database: 'SYSPDV' }), 'SYSPDV');
});

test('interpreta o formato LIST do isql e consolida EANs por SKU', () => {
  const rows = parseFirebirdListOutput(sampleOutput);
  assert.equal(rows.length, 3);
  const products = sysPdvRowsToProducts(rows);
  assert.equal(products.length, 2);
  assert.deepEqual(products[0], {
    sku: '00000000000173',
    barcode: '7891234567895',
    name: 'CAFE TESTE 500G',
    category: 'MERCEARIA',
    price: 17.99,
    oldPrice: 19.99,
    stock: 0,
    unit: 'UN',
    image: '',
    promo: true,
    active: true
  });
  assert.equal(products[1].price, 8.5);
  assert.equal(products[1].oldPrice, null);
  assert.equal(products[1].promo, false);
});

test('mantem oferta sem inventar preco anterior quando a auditoria nao possui historico', () => {
  const [product] = sysPdvRowsToProducts([{
    SKU: '300',
    PRODUCT_NAME: 'OFERTA SEM HISTORICO',
    CURRENT_PRICE: '4.99',
    PROMO_PRICE: '4.99',
    OLD_PRICE: '<null>',
    STOCK: '3'
  }]);
  assert.equal(product.price, 4.99);
  assert.equal(product.oldPrice, null);
  assert.equal(product.promo, true);
});

test('usa secao, unidade por peso e status fora de linha do SysPDV', () => {
  const [product] = sysPdvRowsToProducts([{
    SKU: '400',
    PRODUCT_NAME: 'BANANA',
    CATEGORY_NAME: 'HORTIFRUTI',
    UNIT_NAME: 'UN',
    VARIABLE_WEIGHT: 'S',
    ACTIVE_FLAG: '0',
    CURRENT_PRICE: '6.50',
    PROMO_PRICE: '0',
    STOCK: '18.250'
  }]);
  assert.equal(product.category, 'HORTIFRUTI');
  assert.equal(product.unit, 'KG');
  assert.equal(product.active, false);
});

test('consulta e explicitamente somente leitura e inclui estoque zerado', () => {
  assert.match(SYSPDV_PRODUCTS_QUERY, /SET TRANSACTION READ ONLY/i);
  assert.match(SYSPDV_PRODUCTS_QUERY, /LEFT JOIN \(\s*SELECT es\.PROCOD, SUM\(es\.ESTATU\)/i);
  assert.match(SYSPDV_PRODUCTS_QUERY, /LEFT JOIN SECAO s ON s\.SECCOD = p\.SECCOD/i);
  assert.doesNotMatch(SYSPDV_PRODUCTS_QUERY, /\b(INSERT|UPDATE|DELETE|MERGE)\b/i);
});

test('envia credenciais ao isql pelo ambiente e nunca pela linha de comando', async () => {
  let invocation;
  const products = await loadSysPdvProducts({
    firebirdIsqlPath: process.execPath,
    firebirdHost: '127.0.0.1',
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\SYSPDV\\SYSPDV.FDB',
    firebirdUser: 'LEITOR_AIMERC',
    firebirdPassword: 'segredo',
    firebirdCharset: 'WIN1252',
    firebirdOutputEncoding: 'utf-8',
    dataDirectory: os.tmpdir()
  }, {
    execFile: async (filename, args, options) => {
      invocation = { filename, args, options };
      return { stdout: Buffer.from(sampleOutput, 'utf8'), stderr: Buffer.alloc(0) };
    }
  });

  assert.equal(products.length, 2);
  assert.equal(invocation.options.env.ISC_USER, 'LEITOR_AIMERC');
  assert.equal(invocation.options.env.ISC_PASSWORD, 'segredo');
  assert.equal(invocation.args.includes('LEITOR_AIMERC'), false);
  assert.equal(invocation.args.includes('segredo'), false);
});
