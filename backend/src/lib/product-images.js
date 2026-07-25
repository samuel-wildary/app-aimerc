import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { query } from './postgres.js';
import { getVirtualEan } from './database.js';
import { findCatalogMatchByName, isLocalBarcode, isProduceLikeCategory } from './catalog-image-match.js';

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

  // EAN local / hortifruti / frigorífico: tenta foto real do catálogo (Pinheiro, Atacadão, etc.)
  // pelo nome do produto, antes do fallback SVG.
  const shouldNameMatch = isLocalBarcode(product.barcode, product.sku) || isProduceLikeCategory(product.category);
  if (shouldNameMatch) {
    try {
      const match = await findCatalogMatchByName(product);
      if (match?.ean) {
        const matchedImage = await readCatalogImage(match.ean);
        if (matchedImage && matchedImage.contentType !== 'image/svg+xml') {
          await writeDatabaseImage(
            storeId,
            product.id,
            matchedImage.data,
            matchedImage.contentType,
            `name-match:${match.ean}:${match.headword}`
          );
          return matchedImage;
        }
      }
    } catch (_) {}
  }

  const virtualEan = getVirtualEan(product.name, product.category);
  if (virtualEan) {
    const virtualImage = await readCatalogImage(virtualEan);
    if (virtualImage) return virtualImage;
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

export async function storeProductImage(storeId, product, data, contentType, source = 'catalog-import') {
  const normalizedType = validateImage(data, contentType);
  return writeDatabaseImage(storeId, product.id, data, normalizedType, source);
}

export async function clearProductImages(storeId, productIds = []) {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map(id => String(id || '').trim()).filter(Boolean))];
  if (!storeId || !ids.length) {
    return { removedImages: 0, clearedUrlFields: 0, productIds: [] };
  }

  const deleted = await query(`
    DELETE FROM product_images
    WHERE store_id = $1 AND product_id = ANY($2::text[])
    RETURNING product_id
  `, [storeId, ids]);

  const clearedUrls = await query(`
    UPDATE products
    SET image = '', updated_at = NOW()
    WHERE store_id = $1 AND id = ANY($2::text[]) AND COALESCE(image, '') <> ''
    RETURNING id
  `, [storeId, ids]);

  return {
    removedImages: deleted.rowCount,
    clearedUrlFields: clearedUrls.rowCount,
    productIds: ids
  };
}

/**
 * Remove fotos gravadas de produtos com EAN/codigo com menos de 6 digitos
 * (EAN interno muito curto / PLU incompleto).
 */
export async function clearShortEanProductImages({ storeId = null, maxDigits = 5 } = {}) {
  const maxLen = Math.max(0, Number(maxDigits) || 5);
  const values = [maxLen];
  const storeClause = storeId ? ` AND p.store_id = $2` : '';
  if (storeId) values.push(storeId);

  const preview = await query(`
    SELECT p.store_id, p.id AS product_id, p.name, p.barcode, p.sku,
           length(regexp_replace(COALESCE(p.barcode, ''), '\\D', '', 'g')) AS digit_len
    FROM products p
    INNER JOIN product_images pi ON pi.store_id = p.store_id AND pi.product_id = p.id
    WHERE length(regexp_replace(COALESCE(p.barcode, ''), '\\D', '', 'g')) <= $1
    ${storeClause}
    ORDER BY p.name
    LIMIT 200
  `, values);

  const deleted = await query(`
    DELETE FROM product_images pi
    USING products p
    WHERE pi.store_id = p.store_id
      AND pi.product_id = p.id
      AND length(regexp_replace(COALESCE(p.barcode, ''), '\\D', '', 'g')) <= $1
      ${storeId ? 'AND p.store_id = $2' : ''}
    RETURNING pi.store_id, pi.product_id
  `, values);

  const clearedUrls = await query(`
    UPDATE products p
    SET image = '', updated_at = NOW()
    WHERE length(regexp_replace(COALESCE(p.barcode, ''), '\\D', '', 'g')) <= $1
      AND COALESCE(p.image, '') <> ''
      ${storeId ? 'AND p.store_id = $2' : ''}
    RETURNING p.id
  `, values);

  return {
    maxDigits: maxLen,
    storeId: storeId || null,
    removedImages: deleted.rowCount,
    clearedUrlFields: clearedUrls.rowCount,
    samples: preview.rows.map(row => ({
      storeId: row.store_id,
      productId: row.product_id,
      name: row.name,
      barcode: row.barcode,
      sku: row.sku,
      digitLen: Number(row.digit_len)
    }))
  };
}
