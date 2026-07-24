const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/** Abreviações comuns em ERPs de supermercado (BR). */
export const PRODUCT_ABBREVIATIONS = {
  pic: 'picanha',
  picn: 'picanha',
  alct: 'alcatra',
  alc: 'alcatra',
  cfile: 'contra file',
  cfil: 'contra file',
  contra: 'contra file',
  coxm: 'coxao mole',
  coxd: 'coxao duro',
  acem: 'acem',
  musc: 'musculo',
  frald: 'fraldinha',
  mam: 'maminha',
  cost: 'costela',
  lom: 'lombo',
  pat: 'patinho',
  bife: 'bife',
  moid: 'carne moida',
  moida: 'carne moida',
  suin: 'suina',
  perc: 'pernil',
  frang: 'frango',
  peit: 'peito de frango',
  coxa: 'coxa de frango',
  sbrc: 'sobrecoxa',
  ling: 'linguica',
  sals: 'salsicha',
  tom: 'tomate',
  bat: 'batata',
  ceb: 'cebola',
  cen: 'cenoura',
  alh: 'alho',
  ban: 'banana',
  mac: 'maca',
  lar: 'laranja',
  lim: 'limao',
  mamf: 'mamao',
  abx: 'abacaxi',
  abct: 'abacate',
  alf: 'alface',
  rep: 'repolho',
  chu: 'chuchu',
  pep: 'pepino',
  bet: 'beterraba',
  abo: 'abobora',
  abz: 'abobrinha',
  uva: 'uva',
  mel: 'melao',
  mlc: 'melancia',
  mrc: 'maracuja',
  mng: 'manga',
  mrx: 'morango',
  bov: 'bovina',
  resf: 'resfriado',
  cong: 'congelado',
  kg: '',
  und: '',
  pct: ''
};

/** Descrições que NÃO servem para hortifruti/frigorífico a granel. */
const INDUSTRIAL_DESC_RE = /\b(oleo|óleo|essencia|essência|shampoo|condicionador|creme|perfume|colonia|colônia|sabonete|desodorante|nhoque|ravioli|massa|molho|ketchup|maionese|tempero pronto|caldo|sopa|instantaneo|instantâneo|conserva|enlatado|sach[eê]|capsula|cápsula|detergente|desinfetante|amaciante|ração|racao|petisco|biscoito|bolacha|chocolate|balas?|chiclete|refrigerante|suco|néctar|nectar|iogurte|sorvete|pizza|hamburguer|hambúrguer|salgadinho|snack|farinha|mistura|pronta|processad|industrial|alyne|nestle|bauducco|hellmanns|knorr|maggi)\b/i;
const VOLUME_INDUSTRIAL_RE = /\b(\d+\s*ml|\d+\s*l\b|30ml|50ml|100ml|200ml|250ml|500ml|1l|2l)\b/i;
const PACKAGED_FOOD_RE = /\b(pacote|embalagem|bandeja vacuum|marca |ltda|sa\b)\b/i;

export function openaiConfigured() {
  return Boolean(String(process.env.AIMERC_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim());
}

export async function resolveAiCredentials() {
  try {
    const { getAiSearchAgentSecrets } = await import('./platform-settings.js');
    const secrets = await getAiSearchAgentSecrets();
    if (secrets.apiKey) {
      return { apiKey: secrets.apiKey, model: secrets.model || 'gpt-4o-mini', configured: true, source: secrets.source };
    }
  } catch (_) {}
  const apiKey = String(process.env.AIMERC_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  return {
    apiKey,
    model: String(process.env.AIMERC_OPENAI_MODEL || 'gpt-5.6-terra').trim() || 'gpt-5.6-terra',
    configured: Boolean(apiKey),
    source: apiKey ? 'env' : 'none'
  };
}

export function expandProductQuery(name = '', category = '') {
  const raw = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = raw.split(' ').filter(Boolean);
  const expanded = new Set();
  for (const token of tokens) {
    if (token.length < 2) continue;
    const mapped = PRODUCT_ABBREVIATIONS[token];
    if (mapped === '') continue;
    if (mapped) {
      for (const part of mapped.split(' ')) expanded.add(part);
    } else if (token.length >= 3) {
      expanded.add(token);
    }
  }
  const categoryHint = String(category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/frigor|acoug|carne|peix|aves/.test(categoryHint)) expanded.add('carne');
  return {
    original: raw,
    terms: [...expanded].slice(0, 8)
  };
}

/**
 * Rejeita candidatos absurdos (óleo de banana para banana kg, nhoque para batata, etc.).
 */
export function isWrongKindCandidate(product, description = '') {
  const category = String(product?.category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const produceLike = /horti|fruta|legume|verdura|frigor|acoug|carne|peix|ovos|padaria/.test(category);
  if (!produceLike) return false;

  const desc = String(description || '');
  const name = String(product?.name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const bulkFresh = /\b(kg|granel|in natura|madura|verde|branca|doce)\b/.test(name) || name.split(/\s+/).length <= 4;

  if (!bulkFresh) return false;
  if (INDUSTRIAL_DESC_RE.test(desc)) return true;
  if (VOLUME_INDUSTRIAL_RE.test(desc)) return true;

  // "oleo de banana", "essencia de banana" etc. — headword aparece mas produto é outro
  const head = expandProductQuery(product.name, product.category).terms[0] || '';
  if (head && new RegExp(`\\b(oleo|óleo|essencia|essência|aroma|extrato|xarope)\\s+(de\\s+)?${head}\\b`, 'i').test(desc)) {
    return true;
  }
  if (head === 'batata' && /\b(nhoque|chips|palha|frita|palitos|pure|purê)\b/i.test(desc)) return true;
  if (head === 'banana' && !/\b(banana|nanica|prata|maca|maçã|terra)\b/i.test(desc)) return true;
  if (PACKAGED_FOOD_RE.test(desc) && /\b(nhoque|massa|molho|oleo|óleo)\b/i.test(desc)) return true;
  return false;
}

function bufferToDataUrl(buffer, contentType = 'image/jpeg') {
  if (!buffer) return null;
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 800) return null;
  // Fotos grandes demais para o request: ainda assim envia ate ~1.2MB (detail low)
  if (buf.length > 1_200_000) return null;
  const mime = String(contentType || 'image/jpeg').includes('png')
    ? 'image/png'
    : String(contentType || '').includes('webp')
      ? 'image/webp'
      : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * Usa o modelo (com visão das fotos) para escolher o melhor EAN.
 */
export async function chooseCatalogMatchWithAi(product, candidates, options = {}) {
  const creds = await resolveAiCredentials();
  if (!creds.configured || !candidates?.length) return null;
  const model = options.model || creds.model || 'gpt-4o-mini';

  const filtered = candidates.filter(item => !isWrongKindCandidate(product, item.description));
  if (!filtered.length) return null;

  const shortlist = filtered.slice(0, options.visionLimit || 6);
  const list = shortlist.map((item, index) => ({
    index: index + 1,
    ean: item.ean,
    description: item.description,
    source: item.sourceName || item.source_name || ''
  }));

  const userContent = [
    {
      type: 'text',
      text: [
        'Produto da loja (EAN local / a granel):',
        JSON.stringify({
          name: product.name,
          category: product.category || '',
          barcode: product.barcode || '',
          sku: product.sku || '',
          expandedTerms: expandProductQuery(product.name, product.category).terms
        }, null, 2),
        '',
        'Candidatos do banco (veja as fotos anexadas na mesma ordem). Escolha SOMENTE se for o mesmo produto fresco/corte.',
        JSON.stringify(list, null, 2),
        '',
        'Responda SOMENTE JSON: {"ean":"string|null","confidence":0-1,"reason":"texto curto"}'
      ].join('\n')
    }
  ];

  for (let i = 0; i < shortlist.length; i += 1) {
    const item = shortlist[i];
    const dataUrl = bufferToDataUrl(item.imageData || item.image_data, item.contentType || item.content_type);
    userContent.push({
      type: 'text',
      text: `Foto do candidato ${i + 1} (EAN ${item.ean}): ${item.description || 'sem descricao'}`
    });
    if (dataUrl) {
      userContent.push({
        type: 'image_url',
        image_url: { url: dataUrl, detail: 'low' }
      });
    }
  }

  const payload = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Voce e um especialista em catalogo de supermercado brasileiro e analisa FOTO + descricao.
Tarefa: vincular produto da loja (quase sempre a granel com EAN interno) a uma foto limpa do banco.

Regras OBRIGATORIAS:
1. O item tem que ser o MESMO produto. "BANANA kg" / "BANANA MADURA" = fruta banana fresca. NUNCA oleo, essencia, shampoo ou aroma de banana.
2. "BATATA BRANCA kg" = batata in natura. NUNCA nhoque, chips, pure industrial, massa.
3. Nomes de ERP vem abreviados (PIC=picanha, COXAO=coxao, TOM=tomate, BAT=batata). Expanda antes de comparar.
4. Olhe a imagem: se for embalagem industrial, frasco, pote cosmestico, pacote de massa/molho → rejeite.
5. Prefira fotos limpas de hortifruti/carne a granel, sem logo de rede concorrente (Pinheiro, Atacadao, Carrefour, Pao de Acucar, Guara, Sao Luiz).
6. Se nenhum candidato for seguro, retorne ean null (nao chute).
7. Responda SOMENTE JSON: {"ean":"string|null","confidence":0-1,"reason":"texto curto"}`
      },
      { role: 'user', content: userContent }
    ]
  };

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenAI respondeu HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const ean = parsed?.ean ? String(parsed.ean) : null;
  const confidence = Number(parsed?.confidence || 0);
  if (!ean || confidence < (options.minConfidence ?? 0.72)) return null;
  const winner = shortlist.find(item => String(item.ean) === ean) || filtered.find(item => String(item.ean) === ean);
  if (!winner) return null;
  if (isWrongKindCandidate(product, winner.description)) return null;
  return {
    ean: winner.ean,
    description: winner.description,
    sourceName: winner.sourceName || winner.source_name || '',
    score: confidence,
    headword: expandProductQuery(product.name, product.category).terms[0] || 'ai',
    method: 'openai-vision',
    reason: String(parsed.reason || 'IA analisou foto e descricao')
  };
}
