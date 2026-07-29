import { execFile } from 'node:child_process';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FIREBIRD_FIELDS = new Set([
  'SKU',
  'PRODUCT_NAME',
  'CATEGORY_NAME',
  'UNIT_NAME',
  'VARIABLE_WEIGHT',
  'ACTIVE_FLAG',
  'BARCODE',
  'CURRENT_PRICE',
  'PROMO_PRICE',
  'OLD_PRICE',
  'STOCK'
]);

export const SYSPDV_PRODUCTS_QUERY = `
SET ECHO OFF;
SET COUNT OFF;
SET HEADING ON;
SET LIST ON;
SET BAIL ON;

SELECT
    TRIM(p.PROCOD) AS SKU,
    TRIM(p.PRODES) AS PRODUCT_NAME,
    TRIM(s.SECDES) AS CATEGORY_NAME,
    TRIM(p.PROUNID) AS UNIT_NAME,
    COALESCE(p.PROPESVAR, 'N') AS VARIABLE_WEIGHT,
    CASE WHEN COALESCE(p.PROFORLIN, 'N') = 'S' THEN 0 ELSE 1 END AS ACTIVE_FLAG,
    TRIM(pa.PROCODAUX) AS BARCODE,
    p.PROPRC1 AS CURRENT_PRICE,
    COALESCE(offer.PROMO_PRICE, 0) AS PROMO_PRICE,
    CASE
      WHEN offer.PROMO_PRICE > 0 THEN (
        SELECT FIRST 1 ap.AUPPRCVDAVAR
        FROM AUDITORIA_PRECO ap
        WHERE ap.PROCOD = p.PROCOD
          AND ap.AUPPRCVDAVAR > offer.PROMO_PRICE
          AND ap.AUPDAT <= offer.START_DATE
        ORDER BY ap.AUPDAT DESC
      )
      ELSE NULL
    END AS OLD_PRICE,
    COALESCE(stock.STOCK, 0) AS STOCK
FROM PRODUTO p
LEFT JOIN PRODUTOAUX pa ON pa.PROCOD = p.PROCOD
LEFT JOIN SECAO s ON s.SECCOD = p.SECCOD
LEFT JOIN (
    SELECT es.PROCOD, SUM(es.ESTATU) AS STOCK
    FROM ESTOQUE es
    GROUP BY es.PROCOD
) stock ON stock.PROCOD = p.PROCOD
LEFT JOIN (
    SELECT ep.PROCOD, MIN(ep.ENCPROPRCOFE) AS PROMO_PRICE, MIN(e.ENCDATINI) AS START_DATE
    FROM ENCARTE e
    JOIN ENCARTE_PRODUTO ep ON ep.ENCCOD = e.ENCCOD
    WHERE e.ENCSTATUS = 'A'
      AND CURRENT_DATE BETWEEN CAST(e.ENCDATINI AS DATE) AND CAST(e.ENCDATFIM AS DATE)
      AND ep.ENCPROPRCOFE > 0
    GROUP BY ep.PROCOD
) offer ON offer.PROCOD = p.PROCOD
ORDER BY p.PROCOD, pa.PROCODAUX;

QUIT;
`.trimStart();

function decodeOutput(buffer, encoding) {
  if (buffer == null) return '';
  if (typeof buffer === 'string') return buffer;
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    return String(buffer);
  }
  const normalized = String(encoding || 'latin1').toLowerCase().replaceAll('_', '-');
  const alias = normalized === 'iso8859-1' || normalized === 'iso-8859-1' ? 'latin1' : normalized;
  try {
    return new TextDecoder(alias).decode(buffer);
  } catch {
    return Buffer.from(buffer).toString('latin1');
  }
}

function nullable(value) {
  const text = String(value ?? '').trim();
  return !text || /^<null>$/i.test(text) ? null : text;
}

function numberValue(value) {
  const text = nullable(value);
  if (text == null) return null;
  const normalized = text.includes(',') && !text.includes('.')
    ? text.replace(',', '.')
    : text.replace(/,/g, '');
  const result = Number(normalized.replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(result) ? result : null;
}

function validGtin(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  const expected = Number(digits.at(-1));
  const sum = [...body].reverse().reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1),
    0
  );
  return (10 - (sum % 10)) % 10 === expected;
}

export function parseFirebirdListOutput(output) {
  const rows = [];
  let current = {};
  let lastField = '';

  const finishRow = () => {
    if (nullable(current.SKU)) rows.push(current);
    current = {};
    lastField = '';
  };

  for (const rawLine of String(output || '').replace(/\r/g, '').split('\n')) {
    const match = rawLine.match(/^([A-Z][A-Z0-9_]*)\s+(.*)$/);
    if (match && FIREBIRD_FIELDS.has(match[1])) {
      const [, field, value] = match;
      if (field === 'SKU' && nullable(current.SKU)) finishRow();
      current[field] = value.trimEnd();
      lastField = field;
      continue;
    }
    if (lastField && rawLine.startsWith(' ') && rawLine.trim()) {
      current[lastField] = `${current[lastField]} ${rawLine.trim()}`;
    }
  }
  finishRow();
  return rows;
}

function barcodeScore(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return validGtin(digits) ? 100 + digits.length : 0;
}

export function sysPdvRowsToProducts(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const sku = String(nullable(row.SKU) || '').trim();
    if (!sku) continue;
    const current = grouped.get(sku);
    if (!current || barcodeScore(row.BARCODE) > barcodeScore(current.BARCODE)) {
      grouped.set(sku, { ...(current || {}), ...row });
    }
  }

  return [...grouped.values()].map((row, index) => {
    const sku = String(nullable(row.SKU) || '').trim();
    const name = String(nullable(row.PRODUCT_NAME) || '').trim();
    if (!name) throw new Error(`Produto SysPDV ${sku || index + 1} sem descricao`);

    const currentPrice = Math.max(0, numberValue(row.CURRENT_PRICE) || 0);
    const offerPrice = Math.max(0, numberValue(row.PROMO_PRICE) || 0);
    const auditedPrice = Math.max(0, numberValue(row.OLD_PRICE) || 0);
    const promo = offerPrice > 0;
    const oldPrice = promo && auditedPrice > offerPrice ? auditedPrice : null;
    const barcodeDigits = String(nullable(row.BARCODE) || '').replace(/\D/g, '');
    const sourceUnit = String(nullable(row.UNIT_NAME) || '').trim().toUpperCase();
    const variableWeight = String(nullable(row.VARIABLE_WEIGHT) || 'N').trim().toUpperCase() === 'S';
    const unitAliases = { KG: 'KG', KILO: 'KG', L: 'L', LT: 'L', CX: 'CX', CAIXA: 'CX', PCT: 'PCT', PC: 'PCT' };
    const unit = variableWeight ? 'KG' : (unitAliases[sourceUnit] || 'UN');
    const activeValue = String(nullable(row.ACTIVE_FLAG) || '1').trim().toUpperCase();

    return {
      sku,
      barcode: validGtin(barcodeDigits) ? barcodeDigits : '',
      name,
      category: String(nullable(row.CATEGORY_NAME) || 'Sem categoria').trim(),
      price: promo ? offerPrice : currentPrice,
      oldPrice,
      stock: Math.max(0, numberValue(row.STOCK) || 0),
      unit,
      image: '',
      promo,
      active: !['0', 'N', 'NAO', 'FALSE'].includes(activeValue)
    };
  });
}

export function firebirdDatabaseTarget({ host, port, database }) {
  const databaseName = String(database || '').trim();
  const server = String(host || '').trim();
  if (!databaseName) throw new Error('FIREBIRD_DATABASE nao configurado');
  if (!server) return databaseName;
  const serverPort = Math.max(1, Math.min(65535, Number(port) || 3050));
  return `${server}/${serverPort}:${databaseName}`;
}

async function ensureExecutable(filename) {
  if (!filename) throw new Error('Informe o caminho do isql.exe do Firebird');
  await access(filename).catch(() => {
    throw new Error(`isql.exe nao encontrado em ${filename}`);
  });
}

export async function loadSysPdvProducts(config, dependencies = {}) {
  const run = dependencies.execFile || execFileAsync;
  const isqlPath = path.resolve(String(config.firebirdIsqlPath || ''));
  await ensureExecutable(isqlPath);

  const workDirectory = config.dataDirectory || path.join(os.tmpdir(), 'aimerc-sync-agent');
  await mkdir(workDirectory, { recursive: true });
  const scriptPath = path.join(workDirectory, `syspdv-products-${process.pid}-${Date.now()}.sql`);
  await writeFile(scriptPath, SYSPDV_PRODUCTS_QUERY, 'utf8');

  // NONE evita SQLSTATE 22018 (Cannot transliterate) em nomes com bytes invalidos no SysPDV.
  const charset = String(config.firebirdCharset || 'NONE').trim().toUpperCase() || 'NONE';
  const target = firebirdDatabaseTarget(config);
  try {
    const result = await run(isqlPath, [
      '-charset', charset,
      '-input', scriptPath,
      target
    ], {
      cwd: path.dirname(isqlPath),
      windowsHide: true,
      encoding: 'buffer',
      timeout: Math.max(30_000, Number(config.firebirdTimeoutMs) || 300_000),
      maxBuffer: Math.max(10 * 1024 * 1024, Number(config.firebirdMaxBuffer) || 200 * 1024 * 1024),
      env: {
        ...process.env,
        ISC_USER: String(config.firebirdUser || ''),
        ISC_PASSWORD: String(config.firebirdPassword || '')
      }
    });
    const stdout = decodeOutput(result.stdout, config.firebirdOutputEncoding);
    const stderr = decodeOutput(result.stderr, config.firebirdOutputEncoding).trim();
    const rows = parseFirebirdListOutput(stdout);
    if (!rows.length) {
      throw new Error(`A consulta SysPDV nao retornou produtos${stderr ? `: ${stderr.slice(0, 500)}` : ''}`);
    }
    return sysPdvRowsToProducts(rows);
  } catch (error) {
    const stderr = decodeOutput(error.stderr, config.firebirdOutputEncoding).trim();
    const detail = stderr || String(error.message || error);
    throw new Error(`Falha ao consultar o Firebird do SysPDV: ${detail.slice(0, 800)}`);
  } finally {
    await rm(scriptPath, { force: true });
  }
}
