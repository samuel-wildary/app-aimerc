import { normalizeCategory } from './categories.js';
import { isWrongKindCandidate } from './ai-image-match.js';

const PRODUCE_CATEGORIES = new Set([
  'Hortifruti',
  'Frigorifico',
  'Frios e Embutidos',
  'Peixaria',
  'Ovos',
  'Padaria',
  'Padaria industrial'
]);

/** Categorias tipicas de EAN local para o seletor do SaaS. */
export const LOCAL_AI_CATEGORIES = [...PRODUCE_CATEGORIES];

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

export function scoreDescriptionMatch(productName, description, headword, product = null) {
  const productText = normalizeMatchText(productName);
  const desc = normalizeMatchText(description);
  if (!productText || !desc || !headword) return 0;
  if (!desc.includes(normalizeMatchText(headword))) return 0;
  if (product && isWrongKindCandidate(product, description)) return 0;

  const productTokens = new Set(productText.split(' ').filter(token => token.length > 2 && !STOP_WORDS.has(token)));
  const descTokens = new Set(desc.split(' ').filter(token => token.length > 2 && !STOP_WORDS.has(token)));
  if (!productTokens.size || !descTokens.size) return 0.2;

  let overlap = 0;
  for (const token of productTokens) {
    if (descTokens.has(token)) overlap += 1;
  }
  const jaccard = overlap / (productTokens.size + descTokens.size - overlap);
  let score = 0.35 + jaccard * 0.45;
  if (desc.startsWith(normalizeMatchText(headword)) || desc.includes(` ${normalizeMatchText(headword)} `)) score += 0.08;

  if (/\b(kg|granel|madura|branca)\b/.test(productText)) {
    if (descTokens.size > 6) score -= 0.2;
    if (/\b(oleo|essencia|nhoque|molho|ml|shampoo|creme)\b/.test(desc)) return 0;
  }
  if (/\b(sadia|perdigao|seara|swift|friboi|nestle|bauducco|alyne)\b/.test(desc)) score -= 0.4;
  return Math.max(0, Math.min(1, score));
}

function preferredSourceBoost(sourceName) {
  const source = normalizeMatchText(sourceName);
  if (/(pinheiro|atacadao|gbarbosa|comper|carrefour|pao de acucar|guara|sao luiz)/.test(source)) return 0.05;
  return 0;
}

async function dbQuery(sql, params) {
  const { query } = await import('./postgres.js');
  return query(sql, params);
}

export async function searchCatalogImages({ search = '', limit = 48, offset = 0, realOnly = true } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 48));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const term = String(search || '').trim();
  const clauses = [];
  const values = [];
  if (realOnly) {
    clauses.push(`ean ~ '^[0-9]{8,14}$'`);
    clauses.push(`content_type <> 'image/svg+xml'`);
    clauses.push(`byte_size > 3000`);
  }
  if (term) {
    values.push(`%${term}%`);
    clauses.push(`(ean ILIKE $${values.length} OR description ILIKE $${values.length} OR source_name ILIKE $${values.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [items, count] = await Promise.all([
    dbQuery(
      `SELECT ean, description, content_type, byte_size, source_name, source_url, updated_at
       FROM catalog_assets ${where}
       ORDER BY byte_size DESC, updated_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, safeLimit, safeOffset]
    ),
    dbQuery(`SELECT COUNT(*)::int AS total FROM catalog_assets ${where}`, values)
  ]);
  return {
    items: items.rows.map(row => ({
      ean: row.ean,
      description: row.description,
      contentType: row.content_type,
      byteSize: Number(row.byte_size),
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      updatedAt: row.updated_at
    })),
    total: Number(count.rows[0].total),
    limit: safeLimit,
    offset: safeOffset
  };
}

export async function findCatalogCandidates(product, options = {}) {
  const { expandProductQuery } = await import('./ai-image-match.js');
  const name = product?.name || product?.catalogName || product?.sourceName || '';
  const headword = extractHeadword(name);
  const expanded = expandProductQuery(name, product?.category || '');
  const terms = [...new Set([headword, ...expanded.terms].filter(Boolean).map(normalizeMatchText))];
  if (!terms.length) return [];

  const likeClauses = [];
  const values = [];
  for (const term of terms.slice(0, 5)) {
    values.push(term);
    const i = values.length;
    likeClauses.push(`(
      lower(description) LIKE '%' || $${i} || '%'
      OR translate(lower(description),
           'áàâãäéèêëíìîïóòôõöúùûüç',
           'aaaaaeeeeiiiiooooouuuuc') LIKE '%' || $${i} || '%'
    )`);
  }

  const produceLike = isProduceLikeCategory(product?.category);
  const rejectIndustrial = produceLike
    ? `AND NOT (
         description ~* '(oleo|óleo|essencia|essência|shampoo|nhoque|molho|ketchup|maionese|detergente|shampoo|creme|perfume|\\y[0-9]+\\s*ml\\y|chips|pure|purê)'
       )`
    : '';

  const result = await dbQuery(`
    SELECT ean, description, source_name, content_type, byte_size
    FROM catalog_assets
    WHERE ean ~ '^[0-9]{8,14}$'
      AND content_type <> 'image/svg+xml'
      AND byte_size > 5000
      AND (${likeClauses.join(' OR ')})
      ${rejectIndustrial}
    ORDER BY byte_size DESC
    LIMIT ${options.limit || 40}
  `, values);

  return result.rows
    .map(row => ({
      ean: row.ean,
      description: row.description,
      sourceName: row.source_name,
      contentType: row.content_type,
      byteSize: Number(row.byte_size)
    }))
    .filter(item => !isWrongKindCandidate(product, item.description));
}

/**
 * Busca no catalog_assets uma imagem compatível.
 * Com chave OpenAI: analisa foto + descricao (visao). Sem chave: só match textual estrito.
 */
export async function findCatalogMatchByName(product, options = {}) {
  const minScore = options.minScore ?? 0.72;
  const name = product?.name || product?.catalogName || product?.sourceName || '';
  const local = isLocalBarcode(product.barcode, product.sku);
  const produceLike = isProduceLikeCategory(product.category);
  if (!local && !produceLike && !options.force) return null;

  let candidates = await findCatalogCandidates(product, { limit: options.candidateLimit || 40 });
  candidates = candidates.filter(item => !isWrongKindCandidate(product, item.description));
  if (!candidates.length) return null;

  const { chooseCatalogMatchWithAi, resolveAiCredentials } = await import('./ai-image-match.js');
  const creds = await resolveAiCredentials();
  if (creds.configured && options.useAi !== false) {
    try {
      const eans = candidates.slice(0, 8).map(item => item.ean);
      const withImages = (await dbQuery(
        `SELECT ean, description, source_name, content_type, image_data
         FROM catalog_assets
         WHERE ean = ANY($1::text[]) AND content_type <> 'image/svg+xml'`,
        [eans]
      )).rows;
      const byEan = new Map(withImages.map(row => [String(row.ean), row]));
      const visionCandidates = candidates.slice(0, 8).map(item => {
        const row = byEan.get(String(item.ean));
        return {
          ...item,
          description: row?.description || item.description,
          sourceName: row?.source_name || item.sourceName,
          contentType: row?.content_type || item.contentType,
          imageData: row?.image_data || null
        };
      }).filter(item => !isWrongKindCandidate(product, item.description));

      const aiMatch = await chooseCatalogMatchWithAi(product, visionCandidates, {
        minConfidence: options.minConfidence ?? 0.72,
        visionLimit: 6
      });
      if (aiMatch) return aiMatch;
      // Com IA ativa, nao cai no fallback burro por palavra (banana → oleo de banana).
      return null;
    } catch (error) {
      console.error('[AI-MATCH]', error.message);
      // Falha de API: nao inventa vinculo errado
      return null;
    }
  }

  const headword = extractHeadword(name) || (await import('./ai-image-match.js')).expandProductQuery(name, product.category).terms[0];
  if (!headword) return null;
  let best = null;
  for (const row of candidates) {
    const score = scoreDescriptionMatch(name, row.description, headword, product) + preferredSourceBoost(row.sourceName);
    if (!best || score > best.score) {
      best = {
        ean: row.ean,
        description: row.description,
        sourceName: row.sourceName,
        score,
        headword,
        method: 'name-match',
        reason: 'Match textual estrito (IA nao configurada)'
      };
    }
  }
  if (!best || best.score < minScore) return null;
  return best;
}

export async function linkCatalogImageToProduct(storeId, productId, catalogEan) {
  const asset = (await dbQuery(
    `SELECT content_type, image_data FROM catalog_assets
     WHERE ean = $1 AND content_type <> 'image/svg+xml'`,
    [String(catalogEan)]
  )).rows[0];
  if (!asset?.image_data) return null;
  await writeImageFn(storeId, productId, asset.image_data, asset.content_type, `manual-catalog:${catalogEan}`);
  return {
    productId,
    catalogEan: String(catalogEan),
    contentType: asset.content_type,
    bytes: asset.image_data.length
  };
}

/**
 * Copia do banco de imagens (catalog_assets) para product_images
 * todo produto com EAN real (8–14 digitos) que bate no banco.
 * Nao usa IA.
 * force=true: substitui qualquer foto existente (incluindo upload manual).
 * force=false: preserva admin-upload / catalog-import.
 */
export async function syncStoreEanImages(storeId, { force = false } = {}) {
  const eligible = (await dbQuery(`
    SELECT COUNT(*)::int AS total
    FROM products p
    WHERE p.store_id = $1
      AND p.active = 1
      AND length(regexp_replace(COALESCE(p.barcode, ''), '[^0-9]', '', 'g')) BETWEEN 8 AND 14
  `, [storeId])).rows[0]?.total || 0;

  const withCatalog = (await dbQuery(`
    SELECT COUNT(*)::int AS total
    FROM products p
    INNER JOIN catalog_assets ca
      ON ca.ean = regexp_replace(COALESCE(p.barcode, ''), '[^0-9]', '', 'g')
     AND ca.content_type <> 'image/svg+xml'
     AND COALESCE(ca.byte_size, 0) > 3000
    WHERE p.store_id = $1
      AND p.active = 1
      AND length(regexp_replace(COALESCE(p.barcode, ''), '[^0-9]', '', 'g')) BETWEEN 8 AND 14
  `, [storeId])).rows[0]?.total || 0;

  const synced = await dbQuery(`
    INSERT INTO product_images (store_id, product_id, content_type, image_data, checksum, byte_size, source, updated_at)
    SELECT
      p.store_id,
      p.id,
      ca.content_type,
      ca.image_data,
      ca.checksum,
      ca.byte_size,
      'ean-sync:' || ca.ean,
      NOW()
    FROM products p
    INNER JOIN catalog_assets ca
      ON ca.ean = regexp_replace(COALESCE(p.barcode, ''), '[^0-9]', '', 'g')
     AND ca.content_type <> 'image/svg+xml'
     AND COALESCE(ca.byte_size, 0) > 3000
    LEFT JOIN product_images pi
      ON pi.store_id = p.store_id AND pi.product_id = p.id
    WHERE p.store_id = $1
      AND p.active = 1
      AND length(regexp_replace(COALESCE(p.barcode, ''), '[^0-9]', '', 'g')) BETWEEN 8 AND 14
      AND (
        $2::boolean = true
        OR pi.product_id IS NULL
        OR COALESCE(pi.source, '') NOT IN ('admin-upload', 'catalog-import')
      )
    ON CONFLICT (store_id, product_id) DO UPDATE SET
      content_type = EXCLUDED.content_type,
      image_data = EXCLUDED.image_data,
      checksum = EXCLUDED.checksum,
      byte_size = EXCLUDED.byte_size,
      source = EXCLUDED.source,
      updated_at = NOW()
    WHERE $2::boolean = true
       OR product_images.checksum IS DISTINCT FROM EXCLUDED.checksum
       OR product_images.source IS DISTINCT FROM EXCLUDED.source
    RETURNING product_id
  `, [storeId, Boolean(force)]);

  const productIds = synced.rows.map(row => row.product_id);
  if (productIds.length) {
    await dbQuery(`
      UPDATE products
      SET updated_at = NOW()
      WHERE store_id = $1 AND id = ANY($2::text[])
    `, [storeId, productIds]);
  }

  return {
    eligible,
    withCatalog,
    updated: productIds.length,
    force: Boolean(force),
    skippedManual: force ? 0 : Math.max(0, withCatalog - productIds.length)
  };
}

export async function assimilateStoreCatalogImages(storeId, {
  limit = 800,
  onProgress = null,
  useAi = true,
  category = '',
  onlyLocalBarcode = false
} = {}) {
  const categoryFilter = category && category !== 'Todos' ? normalizeCategory(category) : '';
  // Com categoria (hortifruti/frigorifico) o foco e EAN local + IA; sem gastar tempo em arroz/mercearia global
  const localOnlyMode = Boolean(onlyLocalBarcode || categoryFilter);

  const products = (await dbQuery(`
    SELECT p.id, p.sku, p.barcode, p.name, p.category, p.image,
           COALESCE(NULLIF(p.catalog_category,''), p.source_category, p.category) AS resolved_category
    FROM products p
    WHERE p.store_id = $1 AND p.active = 1
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
    LIMIT $2
  `, [storeId, Math.max(limit * 3, 800)])).rows
    .map(row => ({
      ...row,
      category: normalizeCategory(row.resolved_category || row.category)
    }))
    .filter(row => !categoryFilter || row.category === categoryFilter)
    .slice(0, limit);

  const globalProducts = localOnlyMode
    ? []
    : products.filter(p => !isLocalBarcode(p.barcode, p.sku));
  const localOnly = products.filter(p => isLocalBarcode(p.barcode, p.sku));

  const summary = {
    examined: 0,
    matched: 0,
    skipped: 0,
    globalMatched: 0,
    localMatched: 0,
    total: globalProducts.length + localOnly.length,
    phase: localOnlyMode ? 'LOCAL_AI' : 'GLOBAL',
    category: categoryFilter || null,
    onlyLocalBarcode: localOnlyMode,
    samples: []
  };

  const report = (extra = {}) => {
    if (typeof onProgress === 'function') {
      const percent = summary.total ? Math.round((summary.examined / summary.total) * 100) : 100;
      onProgress({ ...summary, percent, status: 'RUNNING', ...extra });
    }
  };

  if (!localOnlyMode) {
    report({ phase: 'GLOBAL', message: 'Casando EAN global automaticamente (sem IA)' });
    for (const product of globalProducts) {
      summary.examined += 1;
      summary.phase = 'GLOBAL';
      const ean = String(product.barcode || '').replace(/\D/g, '');
      const asset = (await dbQuery(
        `SELECT ean, description, source_name, content_type, image_data
         FROM catalog_assets
         WHERE ean = $1 AND content_type <> 'image/svg+xml'`,
        [ean]
      )).rows[0];
      if (!asset?.image_data) {
        summary.skipped += 1;
      } else {
        await writeImageFn(storeId, product.id, asset.image_data, asset.content_type, `ean-global:${ean}`);
        summary.matched += 1;
        summary.globalMatched += 1;
        if (summary.samples.length < 40) {
          summary.samples.push({
            productId: product.id,
            name: product.name,
            category: product.category,
            barcode: product.barcode,
            matchedEan: asset.ean,
            matchedDescription: asset.description,
            sourceName: asset.source_name,
            score: 1,
            method: 'ean-global',
            reason: 'Match automatico por EAN/GTIN global',
            catalogImagePath: `/public/catalog-library/${encodeURIComponent(asset.ean)}/image`
          });
        }
      }
      report({ phase: 'GLOBAL' });
    }
  }

  const categoryLabel = categoryFilter || 'todas as categorias';
  report({
    phase: 'LOCAL_AI',
    message: `Assimilando EAN local com IA (${categoryLabel})`
  });
  for (const product of localOnly) {
    summary.examined += 1;
    summary.phase = 'LOCAL_AI';
    const match = await findCatalogMatchByName(product, { useAi, force: true });
    if (!match) {
      summary.skipped += 1;
    } else {
      const asset = (await dbQuery(
        'SELECT content_type, image_data FROM catalog_assets WHERE ean = $1',
        [match.ean]
      )).rows[0];
      if (!asset?.image_data) {
        summary.skipped += 1;
      } else {
        await writeImageFn(
          storeId,
          product.id,
          asset.image_data,
          asset.content_type,
          `${match.method || 'openai-match'}:${match.ean}:${match.headword || 'item'}`
        );
        summary.matched += 1;
        summary.localMatched += 1;
        if (summary.samples.length < 60) {
          summary.samples.push({
            productId: product.id,
            name: product.name,
            category: product.category,
            barcode: product.barcode,
            matchedEan: match.ean,
            matchedDescription: match.description,
            sourceName: match.sourceName,
            score: Number(match.score.toFixed(3)),
            headword: match.headword,
            method: match.method || 'openai-vision',
            reason: match.reason || (match.method === 'name-match'
              ? 'Match textual estrito (IA nao configurada)'
              : 'IA analisou foto e descricao'),
            catalogImagePath: `/public/catalog-library/${encodeURIComponent(match.ean)}/image`
          });
        }
      }
    }
    report({ phase: 'LOCAL_AI' });
  }

  if (typeof onProgress === 'function') {
    onProgress({ ...summary, status: 'COMPLETED', percent: 100, phase: 'DONE' });
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
