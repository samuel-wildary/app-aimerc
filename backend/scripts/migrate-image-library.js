import { createHash } from 'node:crypto';
import pg from 'pg';

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;
const batchSize = Math.max(10, Math.min(Number(process.env.MIGRATION_BATCH_SIZE) || 100, 250));

if (!sourceUrl) throw new Error('SOURCE_DATABASE_URL nao foi configurada');
if (!targetUrl) throw new Error('DATABASE_URL nao foi configurada');

const source = new pg.Pool({ connectionString: sourceUrl, max: 2 });
const target = new pg.Pool({ connectionString: targetUrl, max: 2 });

function normalizeEan(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : '';
}

function buildUpsert(rows) {
  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * 10;
    values.push(
      row.ean,
      row.description,
      row.contentType,
      row.imageData,
      row.checksum,
      row.byteSize,
      row.sourceName,
      row.sourceUrl,
      row.collectedAt,
      row.collectedAt,
    );
    return `(${Array.from({ length: 10 }, (_, index) => `$${offset + index + 1}`).join(',')})`;
  });

  return {
    text: `
      INSERT INTO catalog_assets (
        ean, description, content_type, image_data, checksum, byte_size,
        source_name, source_url, collected_at, updated_at
      ) VALUES ${placeholders.join(',')}
      ON CONFLICT (ean) DO UPDATE SET
        description = CASE
          WHEN EXCLUDED.description <> '' THEN EXCLUDED.description
          ELSE catalog_assets.description
        END,
        content_type = EXCLUDED.content_type,
        image_data = EXCLUDED.image_data,
        checksum = EXCLUDED.checksum,
        byte_size = EXCLUDED.byte_size,
        source_name = EXCLUDED.source_name,
        source_url = EXCLUDED.source_url,
        collected_at = EXCLUDED.collected_at,
        updated_at = EXCLUDED.updated_at
    `,
    values,
  };
}

async function migrate() {
  const sourceCount = await source.query(`
    SELECT COUNT(*)::int AS total
    FROM product_images
    WHERE image_data IS NOT NULL AND octet_length(image_data) > 0
  `);
  const total = Number(sourceCount.rows[0]?.total || 0);
  let lastId = 0;
  let migrated = 0;
  let skipped = 0;

  console.log(`Migrando ${total} imagens em lotes de ${batchSize}...`);

  while (true) {
    const result = await source.query(
      `SELECT id, ean, image_data, mime_type, image_url, source_site,
              scraped_at, product_url, product_name
         FROM product_images
        WHERE id > $1
          AND image_data IS NOT NULL
          AND octet_length(image_data) > 0
        ORDER BY id
        LIMIT $2`,
      [lastId, batchSize],
    );

    if (!result.rows.length) break;
    lastId = result.rows.at(-1).id;

    const rows = result.rows.flatMap((record) => {
      const ean = normalizeEan(record.ean);
      const imageData = Buffer.isBuffer(record.image_data)
        ? record.image_data
        : Buffer.from(record.image_data || '');

      if (!ean || !imageData.length) {
        skipped += 1;
        return [];
      }

      return [{
        ean,
        description: String(record.product_name || '').trim(),
        contentType: String(record.mime_type || 'image/jpeg').trim(),
        imageData,
        checksum: createHash('sha256').update(imageData).digest('hex'),
        byteSize: imageData.length,
        sourceName: String(record.source_site || '').trim(),
        sourceUrl: String(record.product_url || record.image_url || '').trim(),
        collectedAt: record.scraped_at || new Date(),
      }];
    });

    if (rows.length) {
      await target.query(buildUpsert(rows));
      migrated += rows.length;
    }

    console.log(`Progresso: ${migrated + skipped}/${total} (${migrated} gravadas, ${skipped} ignoradas)`);
  }

  const finalCount = await target.query('SELECT COUNT(*)::int AS total FROM catalog_assets');
  console.log(JSON.stringify({ success: true, migrated, skipped, catalogAssets: finalCount.rows[0].total }));
}

try {
  await migrate();
} finally {
  await Promise.allSettled([source.end(), target.end()]);
}
