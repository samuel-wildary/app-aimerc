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

export function openaiConfigured() {
  return Boolean(String(process.env.AIMERC_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim());
}

function openaiKey() {
  return String(process.env.AIMERC_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
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
  if (/horti|fruta|legume|verdura/.test(categoryHint)) {
    // sem forçar palavra genérica demais
  }
  return {
    original: raw,
    terms: [...expanded].slice(0, 8)
  };
}

/**
 * Usa o modelo para escolher o melhor EAN entre candidatos,
 * rejeitando embalagens com marca/logo de rede ou produto errado.
 */
export async function chooseCatalogMatchWithAi(product, candidates, options = {}) {
  if (!openaiConfigured() || !candidates?.length) return null;
  const model = options.model || process.env.AIMERC_OPENAI_MODEL || 'gpt-4o-mini';
  const list = candidates.slice(0, 12).map((item, index) => ({
    index: index + 1,
    ean: item.ean,
    description: item.description,
    source: item.sourceName || item.source_name || ''
  }));

  const payload = {
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Voce e um especialista em catalogo de supermercado brasileiro.
Sua tarefa: escolher a melhor imagem de catalogo para um produto da loja.
Regras:
1. O produto deve ser o MESMO item (corte de carne, fruta, legume). Nomes de ERP costumam vir abreviados (PIC=picanha, COXAO=coxao, TOM=tomate).
2. Prefira fotos limpas de hortifruti/frigorifico, sem embalagem industrial e SEM logo/marca de outra rede (Pinheiro, Atacadao, Carrefour etc. na embalagem).
3. Se a descricao parecer molho, tempero pronto, produto industrializado ou item diferente, rejeite.
4. Se nao houver candidato seguro, retorne ean null.
5. Responda SOMENTE JSON: {"ean":"string|null","confidence":0-1,"reason":"texto curto"}`
      },
      {
        role: 'user',
        content: JSON.stringify({
          product: {
            name: product.name,
            category: product.category || '',
            barcode: product.barcode || '',
            sku: product.sku || ''
          },
          candidates: list
        })
      }
    ]
  };

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenAI respondeu HTTP ${response.status}: ${text.slice(0, 200)}`);
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
  if (!ean || confidence < (options.minConfidence ?? 0.62)) return null;
  const winner = candidates.find(item => String(item.ean) === ean);
  if (!winner) return null;
  return {
    ean: winner.ean,
    description: winner.description,
    sourceName: winner.sourceName || winner.source_name || '',
    score: confidence,
    headword: expandProductQuery(product.name, product.category).terms[0] || 'ai',
    method: 'openai-match',
    reason: String(parsed.reason || '')
  };
}
