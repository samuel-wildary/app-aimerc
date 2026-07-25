/**
 * Substitui fotos do Mercadinho Queiroz pelas do catalogo geral (catalog_assets),
 * casando EAN do estoque com EAN do banco.
 *
 * Uso (VPS / EasyPanel, com DATABASE_URL):
 *   node backend/scripts/sync-queiroz-ean-images.js
 *   node backend/scripts/sync-queiroz-ean-images.js --force
 */
import { syncStoreEanImages } from '../src/lib/catalog-image-match.js';
import { query } from '../src/lib/postgres.js';

const STORE_SLUG = process.env.AIMERC_STORE_SLUG || 'mecadinho-queiroz';
const STORE_ID_FALLBACK = 'store_85176df6';
const force = process.argv.includes('--force') || process.env.FORCE === '1';

async function main() {
  if (!String(process.env.DATABASE_URL || '').trim()) {
    console.error('Defina DATABASE_URL antes de executar.');
    process.exit(1);
  }

  const store = (await query(
    `SELECT id, name, slug FROM stores WHERE slug = $1 OR id = $2 LIMIT 1`,
    [STORE_SLUG, STORE_ID_FALLBACK]
  )).rows[0];

  if (!store) {
    console.error(`Loja nao encontrada (slug=${STORE_SLUG} id=${STORE_ID_FALLBACK})`);
    process.exit(1);
  }

  console.log(`Loja: ${store.name} (${store.id})`);
  console.log(`Modo: ${force ? 'SUBSTITUIR todas as fotos por EAN do catalogo' : 'preservar uploads manuais'}`);

  const before = (await query(`
    SELECT
      COUNT(*) FILTER (WHERE p.active = 1)::int AS active,
      COUNT(*) FILTER (
        WHERE p.active = 1
          AND length(regexp_replace(COALESCE(p.barcode, ''), '[^0-9]', '', 'g')) BETWEEN 8 AND 14
      )::int AS with_real_ean,
      COUNT(*) FILTER (
        WHERE p.active = 1
          AND EXISTS (
            SELECT 1 FROM product_images pi
            WHERE pi.store_id = p.store_id AND pi.product_id = p.id
          )
      )::int AS with_stored_image
    FROM products p
    WHERE p.store_id = $1
  `, [store.id])).rows[0];

  console.log('Antes:', before);

  const summary = await syncStoreEanImages(store.id, { force });
  console.log('Resultado:', summary);

  const after = (await query(`
    SELECT
      COUNT(*) FILTER (
        WHERE p.active = 1
          AND EXISTS (
            SELECT 1 FROM product_images pi
            WHERE pi.store_id = p.store_id AND pi.product_id = p.id
          )
      )::int AS with_stored_image,
      COUNT(*) FILTER (
        WHERE p.active = 1
          AND EXISTS (
            SELECT 1 FROM product_images pi
            WHERE pi.store_id = p.store_id AND pi.product_id = p.id
              AND pi.source LIKE 'ean-sync:%'
          )
      )::int AS with_ean_sync
    FROM products p
    WHERE p.store_id = $1
  `, [store.id])).rows[0];

  console.log('Depois:', after);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
