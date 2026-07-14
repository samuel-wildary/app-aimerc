import { Client } from 'pg';
import { classifyProductCategory } from './category-queiroz.js';

const databaseUrl = process.env.QUEIROZ_DATABASE_URL;
const catalogApiUrl = (process.env.CATALOG_API_URL || 'http://127.0.0.1:4300').replace(/\/$/, '');
const aimercApiUrl = (process.env.AIMERC_API_URL || 'http://127.0.0.1:4100/api').replace(/\/$/, '');
const syncEmail = process.env.AIMERC_SYNC_EMAIL;
const syncPassword = process.env.AIMERC_SYNC_PASSWORD;

if (!databaseUrl) {
  console.error('Defina QUEIROZ_DATABASE_URL com a conexao PostgreSQL do Mercadinho Queiroz.');
  process.exit(1);
}

if (!syncEmail || !syncPassword) {
  console.error('Defina AIMERC_SYNC_EMAIL e AIMERC_SYNC_PASSWORD com o acesso do gestor do Mercadinho Queiroz.');
  process.exit(1);
}

const categoryNames = new Map([
  ['ACOUQUE', 'Acougue'],
  ['BAZAR', 'Casa e Bazar'],
  ['BEBIDAS', 'Bebidas'],
  ['BEBIDAS ALCOOLICAS', 'Bebidas Alcoolicas'],
  ['BISCOITOS E BOLACHAS', 'Biscoitos'],
  ['BOMBONIERE', 'Doces e Snacks'],
  ['CONGELADOS', 'Congelados'],
  ['FRIOS E EMBUTIDOS', 'Frios e Embutidos'],
  ['HORTI-FRUTI', 'Hortifruti'],
  ['LATICINEOS', 'Laticinios'],
  ['LIMPEZA', 'Limpeza'],
  ['MERCEARIA', 'Mercearia'],
  ['PADARIA INDUSTRIAL', 'Padaria'],
  ['PERFUMARIA', 'Higiene e Beleza'],
  ['PETSHOP', 'Pet Shop'],
  ['PRODUTOS NATURAIS', 'Produtos Naturais'],
  ['TEMPEROS E CONDIMENTOS', 'Temperos']
]);

const uncategorizedNames = new Set(['AJUSTAR', 'INATIVO', 'USO/CONSUMO']);

function titleCase(value) {
  return String(value || 'Outros')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s/-])\p{L}/gu, character => character.toLocaleUpperCase('pt-BR'));
}

function categoryName(value) {
  const normalized = String(value || '').trim().toLocaleUpperCase('pt-BR');
  if (uncategorizedNames.has(normalized)) return 'Outros';
  return categoryNames.get(normalized) || titleCase(normalized || 'Outros');
}

function eanKey(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.replace(/^0+/, '') || '0';
}

function positivePromotion(normalPrice, ...prices) {
  const candidates = prices.map(Number).filter(price => Number.isFinite(price) && price > 0 && price < normalPrice);
  return candidates.length ? Math.min(...candidates) : null;
}

async function loadCatalogImages() {
  const pageSize = 500;
  const firstResponse = await fetch(`${catalogApiUrl}/api/images?limit=${pageSize}&offset=0`);
  if (!firstResponse.ok) throw new Error(`API de catalogo respondeu HTTP ${firstResponse.status}`);
  const firstPage = await firstResponse.json();
  const offsets = [];
  for (let offset = pageSize; offset < firstPage.total; offset += pageSize) offsets.push(offset);
  const pages = await Promise.all(offsets.map(async offset => {
    const response = await fetch(`${catalogApiUrl}/api/images?limit=${pageSize}&offset=${offset}`);
    if (!response.ok) throw new Error(`API de catalogo respondeu HTTP ${response.status} na pagina ${offset}`);
    return response.json();
  }));
  const items = [firstPage, ...pages].flatMap(page => page.items);
  return new Map(items.map(item => [eanKey(item.ean), item]));
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${aimercApiUrl}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API AiMerc respondeu HTTP ${response.status}`);
  return data;
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const [source, catalogImages] = await Promise.all([
    client.query(`
      SELECT
        id::text AS sku,
        codigo_barras AS barcode,
        nome AS fallback_name,
        COALESCE(NULLIF(raw_data->>'classificacao01', ''), NULLIF(categoria, ''), 'OUTROS') AS root_category,
        preco::float8 AS normal_price,
        estoque::float8 AS stock,
        ativo AS source_active,
        COALESCE(NULLIF(unidade, ''), 'UN') AS unit,
        COALESCE((raw_data->>'preco_clube_promocao')::float8, 0) AS club_price,
        COALESCE((raw_data->>'preco_fidelidade_promocao')::float8, 0) AS loyalty_price
      FROM "produtos-sp-queiroz"
      WHERE preco > 0
        AND codigo_barras ~ '^[0-9]{8,14}$'
      ORDER BY id
    `),
    loadCatalogImages()
  ]);

  let withImage = 0;
  let promotions = 0;
  let activeProducts = 0;
  let correctedCategories = 0;
  const items = source.rows.map(row => {
    const normalPrice = Number(row.normal_price);
    const promotionPrice = positivePromotion(normalPrice, row.club_price, row.loyalty_price);
    const catalog = catalogImages.get(eanKey(row.barcode));
    if (catalog) withImage += 1;
    if (promotionPrice) promotions += 1;
    const stock = Math.max(0, Number(row.stock));
    const active = Boolean(row.source_active) && stock > 0;
    if (active) activeProducts += 1;
    const name = catalog?.product_name?.trim() || row.fallback_name.trim();
    const sourceCategory = categoryName(row.root_category);
    const category = classifyProductCategory(name, sourceCategory);
    if (category !== sourceCategory) correctedCategories += 1;

    return {
      sku: row.sku,
      barcode: row.barcode,
      name,
      category,
      price: promotionPrice || normalPrice,
      oldPrice: promotionPrice ? normalPrice : null,
      stock,
      unit: row.unit.trim().toUpperCase(),
      image: catalog?.image_url || '',
      promo: Boolean(promotionPrice),
      active
    };
  });

  const login = await jsonRequest('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: syncEmail, password: syncPassword })
  });
  const result = { created: 0, updated: 0, total: 0 };
  const batchSize = 500;
  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batchResult = await jsonRequest('/sync/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ items: items.slice(offset, offset + batchSize) })
    });
    result.created += batchResult.created;
    result.updated += batchResult.updated;
    result.total = batchResult.total;
  }
  console.log(JSON.stringify({
    success: true,
    sourceProducts: source.rowCount,
    activeProducts,
    productsWithImage: withImage,
    promotions,
    correctedCategories,
    categories: [...new Set(items.map(item => item.category))].sort(),
    ...result,
    synchronizedAt: new Date().toISOString()
  }, null, 2));
} finally {
  await client.end();
}
