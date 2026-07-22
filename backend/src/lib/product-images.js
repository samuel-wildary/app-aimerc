import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { query } from './postgres.js';
import { getVirtualEan } from './database.js';

const maxImageBytes = 10 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

async function readDatabaseImage(storeId, productId) {
  const result = await query(
    'SELECT content_type, image_data FROM product_images WHERE store_id = $1 AND product_id = $2',
    [storeId, productId]
  );
  if (!result.rowCount) return null;
  return { contentType: result.rows[0].content_type, data: result.rows[0].image_data };
}

async function readCatalogImage(ean) {
  if (!ean) return null;
  const result = await query(
    'SELECT content_type, image_data FROM catalog_assets WHERE ean = $1',
    [String(ean)]
  );
  if (!result.rowCount) return null;
  return { contentType: result.rows[0].content_type, data: result.rows[0].image_data };
}

async function writeDatabaseImage(storeId, productId, data, contentType, source) {
  const checksum = crypto.createHash('sha256').update(data).digest('hex');
  await query(`
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
  await query('UPDATE products SET updated_at=$3 WHERE store_id=$1 AND id=$2', [storeId, productId, new Date().toISOString()]);
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

export async function productImage(storeId, product) {
  const databaseImage = await readDatabaseImage(storeId, product.id);
  if (databaseImage) return databaseImage;
  const catalogImage = await readCatalogImage(product.barcode);
  if (catalogImage) return catalogImage;

  const virtualEan = getVirtualEan(product.name, product.category);
  if (virtualEan) {
    const virtualImage = await readCatalogImage(virtualEan);
    if (virtualImage) return virtualImage;
    try {
      const { VIRTUAL_IMAGES } = await import('./postgres.js');
      if (VIRTUAL_IMAGES && VIRTUAL_IMAGES[virtualEan]) {
        const item = VIRTUAL_IMAGES[virtualEan];
        const data = Buffer.from(item.svg || item.base64, item.svg ? 'utf8' : 'base64');
        const contentType = item.svg ? 'image/svg+xml' : (item.contentType || 'image/jpeg');
        return { contentType, data };
      }
    } catch (_) {}
  }

  if (!product?.image) return null;

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

  await writeDatabaseImage(storeId, product.id, data, contentType, source.origin);
  return { data, contentType };
}

export async function storeProductImage(storeId, product, data, contentType) {
  const normalizedType = validateImage(data, contentType);
  return writeDatabaseImage(storeId, product.id, data, normalizedType, 'catalog-import');
}
