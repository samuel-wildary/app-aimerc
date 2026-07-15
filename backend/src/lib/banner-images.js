import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 3, allowExitOnIdle: true }) : null;
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = process.env.AIMERC_DATA_DIR ? path.resolve(process.env.AIMERC_DATA_DIR) : path.join(backendDir, 'data');
const bannerDir = path.join(dataDir, 'banner-images');
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytes = 3 * 1024 * 1024;
let schemaPromise;

function ensureSchema() {
  if (!pool) return Promise.resolve();
  schemaPromise ||= pool.query(`
    CREATE TABLE IF NOT EXISTS banner_images (
      store_id TEXT NOT NULL,
      id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      image_data BYTEA NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (store_id, id)
    );
    CREATE INDEX IF NOT EXISTS banner_images_store_idx ON banner_images(store_id);
  `);
  return schemaPromise;
}

function validate(data, contentType) {
  const normalized = String(contentType || '').split(';')[0].toLowerCase();
  if (!allowedTypes.has(normalized)) throw new Error('Use uma imagem JPG, PNG ou WebP');
  if (!Buffer.isBuffer(data) || !data.length || data.length > maxBytes) throw new Error('A imagem deve ter no maximo 3 MB');
  return normalized;
}

export async function storeBannerImage(storeId, data, contentType) {
  const normalized = validate(data, contentType);
  const id = crypto.randomUUID();
  if (pool) {
    await ensureSchema();
    await pool.query(
      'INSERT INTO banner_images (store_id, id, content_type, image_data, byte_size) VALUES ($1, $2, $3, $4, $5)',
      [storeId, id, normalized, data, data.length]
    );
  } else {
    const directory = path.join(bannerDir, storeId.replace(/[^a-zA-Z0-9_-]/g, '_'));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${id}.bin`), data);
    fs.writeFileSync(path.join(directory, `${id}.json`), JSON.stringify({ contentType: normalized }));
  }
  return { id, bytes: data.length, contentType: normalized, persistence: pool ? 'postgres' : 'filesystem' };
}

export async function getBannerImage(storeId, id) {
  if (pool) {
    await ensureSchema();
    const result = await pool.query(
      'SELECT content_type, image_data FROM banner_images WHERE store_id = $1 AND id = $2',
      [storeId, id]
    );
    if (!result.rowCount) return null;
    return { contentType: result.rows[0].content_type, data: result.rows[0].image_data };
  }
  const directory = path.join(bannerDir, storeId.replace(/[^a-zA-Z0-9_-]/g, '_'));
  const imagePath = path.join(directory, `${id}.bin`);
  const metadataPath = path.join(directory, `${id}.json`);
  if (!fs.existsSync(imagePath) || !fs.existsSync(metadataPath)) return null;
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  return { contentType: metadata.contentType, data: fs.readFileSync(imagePath) };
}
