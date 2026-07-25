import { resolveAiCredentials } from './ai-image-match.js';

async function dbQuery(sql, params) {
  const { query } = await import('./postgres.js');
  return query(sql, params);
}

const BRAND_TOKENS = [
  'monster', 'baly', 'red bull', 'redbull', 'burn', 'teng', 'flying horse',
  'coca', 'coca-cola', 'pepsi', 'guarana', 'fanta', 'sprite', 'schweppes',
  'omo', 'ariel', 'ype', 'ypê', 'vanish', 'downy', 'comfort', 'comfort',
  'sadia', 'perdigao', 'perdigão', 'seara', 'aurora', 'friboi', 'swift',
  'nestle', 'nestlé', 'bauducco', 'piraque', 'marilan', 'vitarella',
  'heineken', 'brahma', 'skol', 'antarctica', 'amstel', 'corona',
  'nivea', 'dove', 'rexona', 'clear', 'pantene', 'elseve',
  'maxton', 'koleston', 'garnier', 'loreal', "l'oreal",
  'tnt', 'fusion', 'h2oh', 'gatorade', 'powerade'
];

const KIND_RULES = [
  { kind: 'cleaning', re: /\b(omo|ariel|detergente|amaciante|desinfetante|sabao|sabão|limpeza|vanish|ype|ypê|multiuso)\b/i },
  { kind: 'energy', re: /\b(monster|baly|energetico|energético|energy drink|red bull|burn)\b/i },
  { kind: 'meat', re: /\b(carne|bovina|suino|suíno|frango|peito|coxa|sobrecoxa|picanha|alcatra|coxao|coxão|costela|linguica|linguiça|salsicha|bife|acem|acém|patinho|fraldinha|maminha|file|filé|carre|carré|pernil)\b/i },
  { kind: 'produce', re: /\b(tomate|batata|cebola|cenoura|alface|repolho|banana|maca|maçã|laranja|limao|limão|mamao|mamão|abacaxi|uva|manga|morango|abobrinha|chuchu|pepino|beterraba|vagem|quiabo|couve|brocolis|brócolis|alho|pimentao|pimentão|melancia|melao|melão)\b/i },
  { kind: 'dairy', re: /\b(leite|iogurte|queijo|manteiga|requeijao|requeijão|creme de leite|mussarela|prato)\b/i },
  { kind: 'beverage', re: /\b(refrigerante|suco|agua|água|cerveja|vinho|cha|chá|nectar|néctar)\b/i },
  { kind: 'rice', re: /\b(arroz|carreteiro|feijao|feijão)\b/i },
  { kind: 'hair', re: /\b(tintura|shampoo|condicionador|koleston|maxton|cabelo|coloracao|coloração)\b/i },
  { kind: 'pet', re: /\b(racao|ração|pet|cachorro|gato|whiskas|pedigree)\b/i }
];

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBrands(text = '') {
  const norm = normalizeText(text);
  return new Set(BRAND_TOKENS.filter(brand => {
    const token = normalizeText(brand);
    return token && new RegExp(`\\b${token.replace(/\s+/g, '\\s+')}\\b`).test(norm);
  }));
}

function extractKinds(text = '') {
  const kinds = new Set();
  for (const rule of KIND_RULES) {
    if (rule.re.test(text)) kinds.add(rule.kind);
  }
  return kinds;
}

function significantTokens(text = '') {
  const stop = new Set([
    'de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'kg', 'g', 'un', 'und', 'pct', 'pc',
    'pacote', 'bandeja', 'bdj', 'fresco', 'fresca', 'cong', 'congelado', 'resfriado',
    'tipo', 'in', 'natura', 'aprox', 'approx', 'lt', 'ml', 'litro'
  ]);
  return new Set(
    normalizeText(text).split(' ').filter(token => token.length >= 3 && !stop.has(token) && !/^\d+$/.test(token))
  );
}

export function descriptionsConflict(a = '', b = '') {
  const brandsA = extractBrands(a);
  const brandsB = extractBrands(b);
  if (brandsA.size && brandsB.size) {
    const shared = [...brandsA].some(brand => brandsB.has(brand));
    if (!shared) return { conflict: true, reason: `marcas diferentes (${[...brandsA].join(',') || '-'} vs ${[...brandsB].join(',') || '-'})` };
  }

  const kindsA = extractKinds(a);
  const kindsB = extractKinds(b);
  if (kindsA.size && kindsB.size) {
    const shared = [...kindsA].some(kind => kindsB.has(kind));
    if (!shared) return { conflict: true, reason: `categorias diferentes (${[...kindsA].join(',') || '-'} vs ${[...kindsB].join(',') || '-'})` };
  }

  const tokensA = significantTokens(a);
  const tokensB = significantTokens(b);
  if (tokensA.size >= 2 && tokensB.size >= 2) {
    let overlap = 0;
    for (const token of tokensA) if (tokensB.has(token)) overlap += 1;
    const ratio = overlap / Math.min(tokensA.size, tokensB.size);
    if (overlap === 0 || ratio < 0.2) {
      return { conflict: true, reason: 'descricoes sem sobreposicao semantica' };
    }
  }
  return { conflict: false, reason: '' };
}

function isPlausibleBrazilianEan(ean = '') {
  const digits = String(ean || '').replace(/\D/g, '');
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return false;
  // GTIN-13 BR tipico
  if (digits.length === 13 && !/^(789|790)/.test(digits)) return false;
  if (digits.length === 14 && !/^(0789|0790|789|790)/.test(digits)) return false;
  return true;
}

function bufferToDataUrl(buffer, contentType = 'image/jpeg') {
  if (!buffer) return null;
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 800 || buf.length > 1_200_000) return null;
  const mime = String(contentType || 'image/jpeg').includes('png')
    ? 'image/png'
    : String(contentType || '').includes('webp')
      ? 'image/webp'
      : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * Mesma foto (checksum) usada em EANs com descricoes incompativeis.
 */
export async function findDuplicateChecksumMismatches({ limit = 5000 } = {}) {
  const groups = (await dbQuery(`
    SELECT checksum,
           COUNT(*)::int AS copies,
           json_agg(json_build_object(
             'ean', ean,
             'description', description,
             'sourceName', source_name,
             'sourceUrl', source_url,
             'byteSize', byte_size
           ) ORDER BY ean) AS items
    FROM catalog_assets
    WHERE content_type <> 'image/svg+xml'
      AND COALESCE(byte_size, 0) > 3000
      AND ean ~ '^[0-9]{8,14}$'
    GROUP BY checksum
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT $1
  `, [Math.max(50, Math.min(20_000, Number(limit) || 5000))])).rows;

  const mismatches = [];
  for (const group of groups) {
    const items = Array.isArray(group.items) ? group.items : [];
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const check = descriptionsConflict(items[i].description, items[j].description);
        if (!check.conflict) continue;
        mismatches.push({
          type: 'duplicate-checksum',
          severity: 'high',
          checksum: group.checksum,
          copies: group.copies,
          ean: items[i].ean,
          description: items[i].description,
          peerEan: items[j].ean,
          peerDescription: items[j].description,
          reason: `Mesma foto em EANs diferentes: ${check.reason}`
        });
        mismatches.push({
          type: 'duplicate-checksum',
          severity: 'high',
          checksum: group.checksum,
          copies: group.copies,
          ean: items[j].ean,
          description: items[j].description,
          peerEan: items[i].ean,
          peerDescription: items[i].description,
          reason: `Mesma foto em EANs diferentes: ${check.reason}`
        });
      }
    }
  }
  return dedupeByEan(mismatches);
}

/**
 * Heuristicas sem IA: EAN duvidoso, URL vs descricao, tipos cruzados no proprio registro.
 */
export async function findHeuristicCatalogIssues({ limit = 20_000 } = {}) {
  const rows = (await dbQuery(`
    SELECT ean, description, source_name, source_url, byte_size, checksum
    FROM catalog_assets
    WHERE content_type <> 'image/svg+xml'
      AND COALESCE(byte_size, 0) > 3000
      AND ean ~ '^[0-9]{8,14}$'
    ORDER BY updated_at DESC
    LIMIT $1
  `, [Math.max(100, Math.min(80_000, Number(limit) || 20_000))])).rows;

  const mismatches = [];
  for (const row of rows) {
    if (!isPlausibleBrazilianEan(row.ean)) {
      mismatches.push({
        type: 'invalid-ean',
        severity: 'medium',
        ean: row.ean,
        description: row.description,
        reason: 'EAN fora do padrao brasileiro tipico (789/790)'
      });
    }

    const url = String(row.source_url || '');
    const desc = String(row.description || '');
    if (url && desc) {
      const urlTokens = significantTokens(decodeURIComponent(url.replace(/\+/g, ' ')));
      const descTokens = significantTokens(desc);
      const brandsUrl = extractBrands(url);
      const brandsDesc = extractBrands(desc);
      if (brandsUrl.size && brandsDesc.size && ![...brandsUrl].some(b => brandsDesc.has(b))) {
        mismatches.push({
          type: 'url-brand-mismatch',
          severity: 'high',
          ean: row.ean,
          description: desc,
          sourceUrl: url,
          reason: `Marca na URL (${[...brandsUrl].join(',')}) diverge da descricao (${[...brandsDesc].join(',')})`
        });
      } else if (urlTokens.size >= 2 && descTokens.size >= 2) {
        let overlap = 0;
        for (const token of urlTokens) if (descTokens.has(token)) overlap += 1;
        if (overlap === 0) {
          const kindsUrl = extractKinds(url);
          const kindsDesc = extractKinds(desc);
          if (kindsUrl.size && kindsDesc.size && ![...kindsUrl].some(k => kindsDesc.has(k))) {
            mismatches.push({
              type: 'url-kind-mismatch',
              severity: 'high',
              ean: row.ean,
              description: desc,
              sourceUrl: url,
              reason: `URL sugere ${[...kindsUrl].join(',')} mas descricao e ${[...kindsDesc].join(',')}`
            });
          }
        }
      }
    }
  }
  return dedupeByEan(mismatches);
}

export async function auditCatalogAssetWithAi(asset, options = {}) {
  const creds = await resolveAiCredentials();
  if (!creds.configured) return null;
  const dataUrl = bufferToDataUrl(asset.image_data || asset.imageData, asset.content_type || asset.contentType);
  if (!dataUrl) return null;

  const model = options.model || creds.model || 'gpt-4o-mini';
  const payload = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Voce audita o banco de imagens de supermercado brasileiro.
Compare a DESCRICAO cadastrada com o que aparece na FOTO.
Responda SOMENTE JSON:
{"match":true|false,"confidence":0-1,"seenProduct":"o que a foto mostra","reason":"texto curto"}
Regras:
- match=false se for outro produto, outra marca, outra categoria (ex.: Monster com foto Baly; vagem com foto OMO; carne suina com arroz).
- Nao seja pedante com gramatura/embalagem se for o mesmo produto/marca.
- Se a foto estiver ilegivel, match=false com confidence baixa.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `EAN: ${asset.ean}\nDescricao: ${asset.description || ''}\nFonte: ${asset.source_name || asset.sourceName || ''}`
          },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } }
        ]
      }
    ]
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${response.status}: ${text.slice(0, 180)}`);
  }
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try { parsed = JSON.parse(raw); } catch (_) { parsed = {}; }
  const confidence = Number(parsed.confidence);
  return {
    match: parsed.match === true,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    seenProduct: String(parsed.seenProduct || ''),
    reason: String(parsed.reason || '')
  };
}

function dedupeByEan(items = []) {
  const map = new Map();
  for (const item of items) {
    const key = String(item.ean || '');
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || (item.severity === 'high' && prev.severity !== 'high')) map.set(key, item);
  }
  return [...map.values()];
}

/**
 * Auditoria completa do banco de imagens.
 * 1) checksums duplicados conflitantes
 * 2) heuristicas URL/EAN
 * 3) opcional: visao IA (cara) — prioriza suspeitos e depois o restante ate o limit
 */
export async function runCatalogImageAudit({
  limit = 2000,
  useAi = true,
  deleteMismatches = false,
  onProgress = null
} = {}) {
  const summary = {
    status: 'RUNNING',
    phase: 'HEURISTICS',
    examined: 0,
    flagged: 0,
    deleted: 0,
    duplicateGroups: 0,
    aiChecked: 0,
    aiMismatches: 0,
    total: 0,
    percent: 0,
    samples: [],
    message: 'Varredura heuristica'
  };

  const report = (extra = {}) => {
    if (typeof onProgress === 'function') onProgress({ ...summary, ...extra });
  };

  const duplicateIssues = await findDuplicateChecksumMismatches({ limit: 10_000 });
  const heuristicIssues = await findHeuristicCatalogIssues({ limit: 50_000 });
  summary.duplicateGroups = new Set(duplicateIssues.map(item => item.checksum).filter(Boolean)).size;

  const flagged = new Map();
  for (const item of [...duplicateIssues, ...heuristicIssues]) {
    flagged.set(item.ean, item);
  }
  summary.flagged = flagged.size;
  summary.samples = [...flagged.values()].slice(0, 80);
  report({ phase: 'HEURISTICS', message: `${flagged.size} suspeitos por heuristica/checksum` });

  if (useAi) {
    summary.phase = 'AI';
    summary.message = 'Auditando fotos com IA';
    const creds = await resolveAiCredentials();
    if (!creds.configured) {
      summary.message = 'IA nao configurada — so heuristicas';
    } else {
      const aiLimit = Math.max(0, Number(limit) || 0);
      // Prioridade: ja suspeitos + amostra do restante
      const priorityEans = [...flagged.keys()];
      const extras = (await dbQuery(`
        SELECT ean, description, source_name, source_url, content_type, image_data
        FROM catalog_assets
        WHERE content_type <> 'image/svg+xml'
          AND COALESCE(byte_size, 0) > 3000
          AND ean ~ '^[0-9]{8,14}$'
          AND NOT (ean = ANY($1::text[]))
        ORDER BY
          CASE
            WHEN description ~* '(monster|baly|energetico|vagem|suino|suíno|carre|omo|detergente)' THEN 0
            WHEN description ~* '(frango|carne|tomate|banana|batata|alface)' THEN 1
            ELSE 2
          END,
          updated_at DESC
        LIMIT $2
      `, [priorityEans, Math.max(0, aiLimit)])).rows;

      const priorityRows = priorityEans.length
        ? (await dbQuery(`
            SELECT ean, description, source_name, source_url, content_type, image_data
            FROM catalog_assets
            WHERE ean = ANY($1::text[])
          `, [priorityEans])).rows
        : [];

      const queue = [...priorityRows, ...extras].slice(0, aiLimit || priorityRows.length);
      summary.total = queue.length;
      report({ phase: 'AI', total: queue.length });

      for (const asset of queue) {
        summary.examined += 1;
        summary.aiChecked += 1;
        try {
          const verdict = await auditCatalogAssetWithAi(asset);
          if (verdict && verdict.match === false && verdict.confidence >= 0.55) {
            summary.aiMismatches += 1;
            flagged.set(asset.ean, {
              type: 'ai-mismatch',
              severity: 'high',
              ean: asset.ean,
              description: asset.description,
              sourceName: asset.source_name,
              sourceUrl: asset.source_url,
              seenProduct: verdict.seenProduct,
              confidence: verdict.confidence,
              reason: verdict.reason || 'IA: foto nao corresponde a descricao'
            });
          } else if (verdict?.match === true && flagged.has(asset.ean) && verdict.confidence >= 0.8) {
            // Heuristica falso-positivo: IA confirma ok
            const current = flagged.get(asset.ean);
            if (current?.type !== 'duplicate-checksum') flagged.delete(asset.ean);
          }
        } catch (error) {
          summary.message = `IA: ${error.message}`;
        }
        summary.flagged = flagged.size;
        summary.percent = summary.total ? Math.round((summary.examined / summary.total) * 100) : 100;
        if (summary.samples.length < 120) {
          summary.samples = [...flagged.values()].slice(0, 120);
        }
        if (summary.examined % 5 === 0) report({ phase: 'AI' });
      }
    }
  }

  summary.flagged = flagged.size;
  summary.samples = [...flagged.values()].slice(0, 200);

  if (deleteMismatches && flagged.size) {
    summary.phase = 'PURGE';
    summary.message = 'Removendo inconsistencias';
    const eans = [...flagged.keys()];
    const deleted = await dbQuery(
      'DELETE FROM catalog_assets WHERE ean = ANY($1::text[]) RETURNING ean',
      [eans]
    );
    summary.deleted = deleted.rowCount || 0;
  }

  summary.status = 'COMPLETED';
  summary.phase = 'DONE';
  summary.percent = 100;
  summary.message = deleteMismatches
    ? `Auditoria concluida: ${summary.flagged} erros, ${summary.deleted} removidos`
    : `Auditoria concluida: ${summary.flagged} erros encontrados`;
  report(summary);
  return {
    ...summary,
    mismatches: [...flagged.values()]
  };
}

export async function deleteCatalogMismatches(eans = []) {
  const ids = [...new Set((Array.isArray(eans) ? eans : []).map(ean => String(ean || '').replace(/\D/g, '')).filter(Boolean))];
  if (!ids.length) return { deleted: 0, eans: [] };
  const result = await dbQuery(
    'DELETE FROM catalog_assets WHERE ean = ANY($1::text[]) RETURNING ean',
    [ids]
  );
  return { deleted: result.rowCount || 0, eans: result.rows.map(row => row.ean) };
}
