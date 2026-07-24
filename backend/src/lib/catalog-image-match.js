import { normalizeCategory } from './categories.js';

const PRODUCE_CATEGORIES = new Set([
  'Hortifruti',
  'Frigorifico',
  'Frios e Embutidos',
  'Peixaria',
  'Ovos',
  'Padaria',
  'Padaria industrial'
]);

const STOP_WORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'kg', 'g', 'un', 'und', 'pct', 'pc',
  'pacote', 'bandeja', 'fresco', 'fresca', 'frescos', 'frescas', 'resfriado', 'resfriada',
  'congelado', 'congelada', 'especial', 'premium', 'nacional', 'importado', 'importada',
  'tipo', 'grande', 'medio', 'media', 'pequeno', 'pequena', 'in', 'natura', 'kg', 'approx'
]);

/** Headwords for hortifruti / frigorífico — longest aliases first. */
export const MATCH_HEADWORDS = [
  { key: 'contra file', aliases: ['contra file', 'contra-file', 'contrafile', 'contrafile'] },
  { key: 'coxao mole', aliases: ['coxao mole', 'coxao'] },
  { key: 'coxao duro', aliases: ['coxao duro'] },
  { key: 'capa do file', aliases: ['capa do file', 'capa file'] },
  { key: 'cheiro verde', aliases: ['cheiro verde'] },
  { key: 'fruta do conde', aliases: ['fruta do conde'] },
  { key: 'sobrecoxa', aliases: ['sobrecoxa'] },
  { key: 'fraldinha', aliases: ['fraldinha'] },
  { key: 'maminha', aliases: ['maminha'] },
  { key: 'picanha', aliases: ['picanha'] },
  { key: 'alcatra', aliases: ['alcatra'] },
  { key: 'costela', aliases: ['costela'] },
  { key: 'patinho', aliases: ['patinho'] },
  { key: 'musculo', aliases: ['musculo'] },
  { key: 'cupim', aliases: ['cupim'] },
  { key: 'bisteca', aliases: ['bisteca'] },
  { key: 'pernil', aliases: ['pernil'] },
  { key: 'lagarto', aliases: ['lagarto'] },
  { key: 'acem', aliases: ['acem'] },
  { key: 'lombo', aliases: ['lombo'] },
  { key: 'paleta', aliases: ['paleta'] },
  { key: 'toucinho', aliases: ['toucinho'] },
  { key: 'linguica', aliases: ['linguica', 'toscana'] },
  { key: 'salsicha', aliases: ['salsicha'] },
  { key: 'tilapia', aliases: ['tilapia'] },
  { key: 'salmao', aliases: ['salmao'] },
  { key: 'camarao', aliases: ['camarao'] },
  { key: 'peito de frango', aliases: ['peito de frango', 'peito frango'] },
  { key: 'coxa de frango', aliases: ['coxa de frango', 'coxa frango'] },
  { key: 'asa de frango', aliases: ['asa de frango', 'asa frango'] },
  { key: 'frango', aliases: ['frango'] },
  { key: 'carne moida', aliases: ['carne moida', 'moida'] },
  { key: 'macaxeira', aliases: ['macaxeira', 'mandioca', 'aipim'] },
  { key: 'berinjela', aliases: ['berinjela'] },
  { key: 'espinafre', aliases: ['espinafre'] },
  { key: 'manjericao', aliases: ['manjericao'] },
  { key: 'beterraba', aliases: ['beterraba'] },
  { key: 'abobrinha', aliases: ['abobrinha'] },
  { key: 'pimentao', aliases: ['pimentao'] },
  { key: 'maracuja', aliases: ['maracuja'] },
  { key: 'morango', aliases: ['morango'] },
  { key: 'melancia', aliases: ['melancia'] },
  { key: 'melao', aliases: ['melao'] },
  { key: 'abacaxi', aliases: ['abacaxi'] },
  { key: 'abacate', aliases: ['abacate'] },
  { key: 'cenoura', aliases: ['cenoura'] },
  { key: 'batata', aliases: ['batata'] },
  { key: 'cebola', aliases: ['cebola'] },
  { key: 'tomate', aliases: ['tomate'] },
  { key: 'banana', aliases: ['banana'] },
  { key: 'laranja', aliases: ['laranja'] },
  { key: 'limao', aliases: ['limao'] },
  { key: 'mamao', aliases: ['mamao'] },
  { key: 'alface', aliases: ['alface'] },
  { key: 'repolho', aliases: ['repolho'] },
  { key: 'chuchu', aliases: ['chuchu'] },
  { key: 'abobora', aliases: ['abobora'] },
  { key: 'pepino', aliases: ['pepino'] },
  { key: 'manga', aliases: ['manga'] },
  { key: 'alho', aliases: ['alho'] },
  { key: 'uva', aliases: ['uva'] },
  { key: 'maca', aliases: ['maca'] },
  { key: 'pera', aliases: ['pera'] },
  { key: 'ata', aliases: ['ata', 'pinha'] },
  { key: 'ovos', aliases: ['ovos', 'ovo'] },
  { key: 'bife', aliases: ['bife'] },
  { key: 'suina', aliases: ['suina', 'porco'] }
];

export function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function gtinCheckDigitOk(digits) {
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  const expected = Number(digits.at(-1));
  const sum = [...body].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === expected;
}

/** EAN interno da loja (PLU / código próprio) — não casa com GTIN global. */
export function isLocalBarcode(barcode, sku = '') {
  const digits = String(barcode || '').replace(/\D/g, '');
  if (!digits) return true;
  if (digits.length < 8) return true;
  const skuDigits = String(sku || '').replace(/\D/g, '');
  if (skuDigits && digits === skuDigits) return true;
  if (![8, 12, 13, 14].includes(digits.length)) return true;
  return !gtinCheckDigitOk(digits);
}

export function isProduceLikeCategory(category) {
  return PRODUCE_CATEGORIES.has(normalizeCategory(category));
}

export function extractHeadword(name) {
  const normalized = normalizeMatchText(name);
  if (!normalized) return null;
  for (const entry of MATCH_HEADWORDS) {
    for (const alias of entry.aliases) {
      const pattern = new RegExp(`(?:^|\\s)${alias.replace(/\s+/g, '\\s+')}(?:\\s|$)`);
      if (pattern.test(normalized)) return entry.key;
    }
  }
  const tokens = normalized.split(' ').filter(token => token.length > 2 && !STOP_WORDS.has(token));
  return tokens[0] || null;
}

export function scoreDescriptionMatch(productName, description, headword) {
  const product = normalizeMatchText(productName);
  const desc = normalizeMatchText(description);
  if (!product || !desc || !headword) return 0;
  if (!desc.includes(normalizeMatchText(headword))) return 0;

  const productTokens = new Set(product.split(' ').filter(token => token.length > 2 && !STOP_WORDS.has(token)));
  const descTokens = new Set(desc.split(' ').filter(token => token.length > 2 && !STOP_WORDS.has(token)));
  if (!productTokens.size || !descTokens.size) return 0.35;

  let overlap = 0;
  for (const token of productTokens) {
    if (descTokens.has(token)) overlap += 1;
  }
  const jaccard = overlap / (productTokens.size + descTokens.size - overlap);
  let score = 0.45 + jaccard * 0.5;
  if (desc.startsWith(normalizeMatchText(headword)) || desc.includes(` ${normalizeMatchText(headword)} `)) score += 0.08;
  // Penaliza embalagens industrializadas quando o produto parece hortifruti a granel
  if (/\b(sadia|perdigao|seara|swift|friboi|nestle|bauducco|cocacola)\b/.test(desc) && productTokens.size <= 3) {
    score -= 0.25;
  }
  return Math.max(0, Math.min(1, score));
}

function preferredSourceBoost(sourceName) {
  const source = normalizeMatchText(sourceName);
  if (/(pinheiro|atacadao|carrefour|pao de acucar|guara|sao luiz)/.test(source)) return 0.05;
  return 0;
}

async function dbQuery(sql, params) {
  const { query } = await import('./postgres.js');
  return query(sql, params);
}

/**
 * Busca no catalog_assets (fotos reais de outras redes) uma imagem
 * compatível com o nome do produto de EAN local.
 */
export async function findCatalogMatchByName(product, options = {}) {
  const minScore = options.minScore ?? 0.52;
  const name = product?.name || product?.catalogName || product?.sourceName || '';
  const headword = extractHeadword(name);
  if (!headword) return null;

  const local = isLocalBarcode(product.barcode, product.sku);
  const produceLike = isProduceLikeCategory(product.category);
  if (!local && !produceLike && !options.force) return null;

  const needle = normalizeMatchText(headword);
  const result = await dbQuery(`
    SELECT ean, description, source_name, content_type, byte_size
    FROM catalog_assets
    WHERE ean ~ '^[0-9]{8,14}$'
      AND content_type <> 'image/svg+xml'
      AND byte_size > 5000
      AND (
        lower(description) LIKE '%' || $1 || '%'
        OR translate(lower(description),
             'áàâãäéèêëíìîïóòôõöúùûüç',
             'aaaaaeeeeiiiiooooouuuuc') LIKE '%' || $1 || '%'
      )
    ORDER BY byte_size DESC
    LIMIT 60
  `, [needle]);

  let best = null;
  for (const row of result.rows) {
    const score = scoreDescriptionMatch(name, row.description, headword) + preferredSourceBoost(row.source_name);
    if (!best || score > best.score) {
      best = {
        ean: row.ean,
        description: row.description,
        sourceName: row.source_name,
        score,
        headword,
        method: 'name-match'
      };
    }
  }

  if (!best || best.score < minScore) return null;
  return best;
}

export async function assimilateStoreCatalogImages(storeId, {
  limit = 400,
  onlyLocalBarcode = true
} = {}) {
  const clauses = ['p.store_id = $1', 'p.active = 1'];
  const values = [storeId];

  const products = (await dbQuery(`
    SELECT p.id, p.sku, p.barcode, p.name, p.category, p.image
    FROM products p
    WHERE ${clauses.join(' AND ')}
      AND (
        NOT EXISTS (
          SELECT 1 FROM product_images pi
          WHERE pi.store_id = p.store_id AND pi.product_id = p.id
        )
        OR EXISTS (
          SELECT 1 FROM product_images pi
          WHERE pi.store_id = p.store_id AND pi.product_id = p.id
            AND (
              pi.content_type = 'image/svg+xml'
              OR pi.source LIKE 'auto-virtual%'
              OR pi.source LIKE 'Padrao%'
            )
        )
      )
    ORDER BY p.name
    LIMIT $${values.length + 1}
  `, [...values, limit])).rows;

  const summary = { examined: 0, matched: 0, skipped: 0, samples: [] };

  for (const product of products) {
    summary.examined += 1;
    if (onlyLocalBarcode && !isLocalBarcode(product.barcode, product.sku) && !isProduceLikeCategory(product.category)) {
      summary.skipped += 1;
      continue;
    }
    const match = await findCatalogMatchByName(product);
    if (!match) {
      summary.skipped += 1;
      continue;
    }
    const asset = (await dbQuery(
      'SELECT content_type, image_data FROM catalog_assets WHERE ean = $1',
      [match.ean]
    )).rows[0];
    if (!asset?.image_data) {
      summary.skipped += 1;
      continue;
    }
    await writeImageFn(storeId, product.id, asset.image_data, asset.content_type, `name-match:${match.ean}:${match.headword}`);
    summary.matched += 1;
    if (summary.samples.length < 20) {
      summary.samples.push({
        productId: product.id,
        name: product.name,
        barcode: product.barcode,
        matchedEan: match.ean,
        matchedDescription: match.description,
        sourceName: match.sourceName,
        score: Number(match.score.toFixed(3)),
        headword: match.headword
      });
    }
  }

  return summary;
}

async function writeImageFn(storeId, productId, data, contentType, source) {
  const crypto = await import('node:crypto');
  const checksum = crypto.createHash('sha256').update(data).digest('hex');
  await dbQuery(`
    INSERT INTO product_images (store_id, product_id, content_type, image_data, checksum, byte_size, source, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (store_id, product_id) DO UPDATE SET
      content_type = EXCLUDED.content_type,
      image_data = EXCLUDED.image_data,
      checksum = EXCLUDED.checksum,
      byte_size = EXCLUDED.byte_size,
      source = EXCLUDED.source,
      updated_at = NOW()
  `, [storeId, productId, contentType, data, checksum, data.length, source]);
  await dbQuery('UPDATE products SET updated_at = $3 WHERE store_id = $1 AND id = $2', [storeId, productId, new Date().toISOString()]);
}
