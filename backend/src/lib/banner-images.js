import crypto from 'node:crypto';
import { query } from './postgres.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytes = 3 * 1024 * 1024;

function validate(data, contentType) {
  const normalized = String(contentType || '').split(';')[0].toLowerCase();
  if (!allowedTypes.has(normalized)) throw new Error('Use uma imagem JPG, PNG ou WebP');
  if (!Buffer.isBuffer(data) || !data.length || data.length > maxBytes) throw new Error('A imagem deve ter no maximo 3 MB');
  return normalized;
}

export async function storeBannerImage(storeId, data, contentType) {
  const normalized = validate(data, contentType);
  const id = crypto.randomUUID();
  await query(
    'INSERT INTO banner_images (store_id, id, content_type, image_data, byte_size) VALUES ($1, $2, $3, $4, $5)',
    [storeId, id, normalized, data, data.length]
  );
  return { id, bytes: data.length, contentType: normalized, persistence: 'postgres' };
}

export async function getBannerImage(storeId, id) {
  const result = await query(
    'SELECT content_type, image_data FROM banner_images WHERE store_id = $1 AND id = $2',
    [storeId, id]
  );
  if (!result.rowCount) return null;
  return { contentType: result.rows[0].content_type, data: result.rows[0].image_data };
}
