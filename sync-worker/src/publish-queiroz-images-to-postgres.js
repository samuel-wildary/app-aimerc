import crypto from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const catalogApiUrl = String(process.env.CATALOG_API_URL || 'http://127.0.0.1:4300').replace(/\/$/, '');
const storeSlug = String(process.env.AIMERC_STORE_SLUG || 'mecadinho-queiroz').trim();
const concurrency = Math.max(1, Math.min(12, Number(process.env.IMAGE_IMPORT_CONCURRENCY || 6)));
const maxSourceImageBytes = 100 * 1024 * 1024;
const selectedEans = new Set(String(process.env.IMAGE_IMPORT_EANS || '').split(',').map(value => value.replace(/\D/g, '')).filter(Boolean));
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

if (!databaseUrl) {
  console.error('Defina DATABASE_URL para carregar as imagens no PostgreSQL.');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: concurrency + 2 });

async function catalogPage(offset) {
  const response = await fetch(`${catalogApiUrl}/api/images?limit=500&offset=${offset}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Catalogo respondeu HTTP ${response.status}`);
  return response.json();
}

async function loadCatalog() {
  const items = [];
  for (let offset = 0; ; offset += 500) {
    const page = await catalogPage(offset);
    const pageItems = Array.isArray(page) ? page : page.items || [];
    items.push(...pageItems);
    if (pageItems.length < 500) return items;
  }
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS product_images (
    store_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    image_data BYTEA NOT NULL,
    checksum TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'catalog-import',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (store_id, product_id)
  );
  CREATE INDEX IF NOT EXISTS product_images_store_idx ON product_images(store_id);
`);

const storeResult = await pool.query('SELECT id, name FROM stores WHERE slug = $1', [storeSlug]);
if (!storeResult.rowCount) throw new Error(`Supermercado nao encontrado para o slug ${storeSlug}`);
const store = storeResult.rows[0];
const productResult = await pool.query(
  `SELECT id, barcode FROM products WHERE store_id = $1 AND image <> ''`,
  [store.id]
);
const productsByEan = new Map();
for (const product of productResult.rows) {
  for (const value of [product.barcode, product.id]) {
    const ean = String(value || '').replace(/\D/g, '');
    if (ean) productsByEan.set(ean, product);
  }
}

const catalogItems = await loadCatalog();
const queue = catalogItems
  .map(item => ({ ...item, ean: String(item.ean || '').replace(/\D/g, '') }))
  .filter(item => productsByEan.has(item.ean) && (!selectedEans.size || selectedEans.has(item.ean)));
let cursor = 0;
let imported = 0;
let skipped = 0;
let failed = 0;

async function importItem(item) {
  const product = productsByEan.get(item.ean);
  const response = await fetch(`${catalogApiUrl}/api/images/${encodeURIComponent(item.ean)}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`imagem respondeu HTTP ${response.status}`);
  const sourceType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!allowedTypes.has(sourceType)) throw new Error(`formato ${sourceType || 'desconhecido'} nao permitido`);
  const sourceData = Buffer.from(await response.arrayBuffer());
  if (!sourceData.length || sourceData.length > maxSourceImageBytes) throw new Error('imagem vazia ou acima de 100 MB');
  const data = await sharp(sourceData, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4, smartSubsample: true })
    .toBuffer();
  const contentType = 'image/webp';
  const checksum = crypto.createHash('sha256').update(data).digest('hex');
  await pool.query(`
    INSERT INTO product_images (store_id, product_id, content_type, image_data, checksum, byte_size, source, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (store_id, product_id) DO UPDATE SET
      content_type = EXCLUDED.content_type,
      image_data = EXCLUDED.image_data,
      checksum = EXCLUDED.checksum,
      byte_size = EXCLUDED.byte_size,
      source = EXCLUDED.source,
      updated_at = NOW()
  `, [store.id, product.id, contentType, data, checksum, data.length, `ean-catalog:${item.ean}`]);
  imported += 1;
  if (imported % 100 === 0) console.log(`${imported}/${queue.length} imagens gravadas no PostgreSQL`);
}

async function worker() {
  while (cursor < queue.length) {
    const item = queue[cursor++];
    try {
      await importItem(item);
    } catch (error) {
      failed += 1;
      console.error(`EAN ${item.ean}: ${error.message}`);
    }
  }
}

try {
  console.log(`Carregando ${queue.length} imagens para ${store.name}...`);
  await Promise.all(Array.from({ length: concurrency }, worker));
  const totals = await pool.query(
    'SELECT COUNT(*)::int AS total, COALESCE(SUM(byte_size), 0)::bigint AS bytes FROM product_images WHERE store_id = $1',
    [store.id]
  );
  console.log(JSON.stringify({ success: failed === 0, matched: queue.length, imported, skipped, failed, database: totals.rows[0] }));
  if (failed) process.exitCode = 1;
} finally {
  await pool.end();
}
