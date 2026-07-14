import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = process.env.AIMERC_DATA_DIR
  ? path.resolve(process.env.AIMERC_DATA_DIR)
  : path.join(backendDir, 'data');
const imagesDir = path.join(dataDir, 'images');
const maxImageBytes = 10 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 5, allowExitOnIdle: true }) : null;
let schemaPromise;

function ensureImageSchema() {
  if (!pool) return Promise.resolve();
  schemaPromise ||= pool.query(`
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
  return schemaPromise;
}

async function readDatabaseImage(storeId, productId) {
  if (!pool) return null;
  await ensureImageSchema();
  const result = await pool.query(
    'SELECT content_type, image_data FROM product_images WHERE store_id = $1 AND product_id = $2',
    [storeId, productId]
  );
  if (!result.rowCount) return null;
  return { contentType: result.rows[0].content_type, data: result.rows[0].image_data };
}

async function writeDatabaseImage(storeId, productId, data, contentType, source) {
  await ensureImageSchema();
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
  `, [storeId, productId, contentType, data, checksum, data.length, source]);
  return { bytes: data.length, contentType, checksum, persistence: 'postgres' };
}

function validateImage(data, contentType) {
  const normalizedType = String(contentType || '').split(';')[0].toLowerCase();
  if (!allowedTypes.has(normalizedType)) throw new Error('Formato de imagem nao permitido');
  if (!Buffer.isBuffer(data) || !data.length || data.length > maxImageBytes) throw new Error('Imagem vazia ou acima do limite permitido');
  return normalizedType;
}

function isPrivateAddress(address) {
  if (address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true;
  if (!net.isIPv4(address)) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function assertSafeSource(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo da imagem nao permitido');
  if (process.env.NODE_ENV !== 'production') return url;
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('Origem privada de imagem nao permitida');
  return url;
}

function cachePaths(storeId, product) {
  const key = crypto.createHash('sha256').update(`${product.id}:${product.image}`).digest('hex');
  const directory = path.join(imagesDir, String(storeId).replace(/[^a-zA-Z0-9_-]/g, '_'));
  return { directory, image: path.join(directory, `${key}.bin`), metadata: path.join(directory, `${key}.json`) };
}

function readCache(paths) {
  if (!fs.existsSync(paths.image) || !fs.existsSync(paths.metadata)) return null;
  try {
    const metadata = JSON.parse(fs.readFileSync(paths.metadata, 'utf8'));
    if (!allowedTypes.has(metadata.contentType)) return null;
    return { data: fs.readFileSync(paths.image), contentType: metadata.contentType };
  } catch {
    return null;
  }
}

export async function productImage(storeId, product) {
  if (!product?.image) return null;
  const databaseImage = await readDatabaseImage(storeId, product.id);
  if (databaseImage) return databaseImage;

  const paths = cachePaths(storeId, product);
  const cached = pool ? null : readCache(paths);
  if (cached) return cached;

  const source = await assertSafeSource(product.image);
  const response = await fetch(source, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'AiMerc-Image-Cache/1.0', Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' }
  });
  if (!response.ok) throw new Error(`Origem da imagem respondeu HTTP ${response.status}`);
  await assertSafeSource(response.url);
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!allowedTypes.has(contentType)) throw new Error('Origem nao retornou uma imagem valida');
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxImageBytes) throw new Error('Imagem excede o limite permitido');
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > maxImageBytes) throw new Error('Imagem vazia ou acima do limite permitido');

  if (pool) {
    await writeDatabaseImage(storeId, product.id, data, contentType, source.origin);
  } else {
    fs.mkdirSync(paths.directory, { recursive: true });
    const temporary = `${paths.image}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, data);
    fs.renameSync(temporary, paths.image);
    fs.writeFileSync(paths.metadata, JSON.stringify({ contentType, source: source.origin, cachedAt: new Date().toISOString() }));
  }
  return { data, contentType };
}

export async function storeProductImage(storeId, product, data, contentType) {
  const normalizedType = validateImage(data, contentType);
  if (pool) return writeDatabaseImage(storeId, product.id, data, normalizedType, 'catalog-import');

  const paths = cachePaths(storeId, product);
  fs.mkdirSync(paths.directory, { recursive: true });
  const temporary = `${paths.image}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, data);
  fs.renameSync(temporary, paths.image);
  fs.writeFileSync(paths.metadata, JSON.stringify({ contentType: normalizedType, source: 'catalog-import', cachedAt: new Date().toISOString() }));
  return { bytes: data.length, contentType: normalizedType, persistence: 'filesystem' };
}
