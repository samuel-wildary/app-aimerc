import pg from 'pg';
import crypto from 'node:crypto';
import { getVirtualEan } from '../../backend/src/lib/database.js';

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const storeSlug = String(process.env.AIMERC_STORE_SLUG || 'mecadinho-queiroz').trim();

if (!databaseUrl) {
  console.error('Defina DATABASE_URL para popular as imagens do Mercadinho Queiroz.');
  process.exit(1);
}

const VIRTUAL_DATA = {
  VIRTUAL_ALHO: { description: 'Alho Roxo', icon: '🧄', color: '#f3e8ee' },
  VIRTUAL_BATATA: { description: 'Batata Inglesa', icon: '🥔', color: '#fef3c7' },
  VIRTUAL_CEBOLA: { description: 'Cebola Branca', icon: '🧅', color: '#ffedd5' },
  VIRTUAL_CENOURA: { description: 'Cenoura Especial', icon: '🥕', color: '#ffedd5' },
  VIRTUAL_TOMATE: { description: 'Tomate Longa Vida', icon: '🍅', color: '#fee2e2' },
  VIRTUAL_BANANA: { description: 'Banana Prata', icon: '🍌', color: '#fef9c3' },
  VIRTUAL_MACA: { description: 'Maçã Nacional', icon: '🍎', color: '#fee2e2' },
  VIRTUAL_LARANJA: { description: 'Laranja Pêra', icon: '🍊', color: '#ffedd5' },
  VIRTUAL_LIMAO: { description: 'Limão Taiti', icon: '🍋', color: '#dcfce7' },
  VIRTUAL_MAMAO: { description: 'Mamão Formosa', icon: '🥭', color: '#ffedd5' },
  VIRTUAL_ABACAXI: { description: 'Abacaxi Pérola', icon: '🍍', color: '#fef9c3' },
  VIRTUAL_UVA: { description: 'Uva Roxa', icon: '🍇', color: '#f3e8ff' },
  VIRTUAL_ALFACE: { description: 'Alface Hidropônica', icon: '🥬', color: '#dcfce7' },
  VIRTUAL_ATA: { description: 'Ata / Pinha', icon: '🍈', color: '#dcfce7' },
  VIRTUAL_BERINJELA: { description: 'Berinjela', icon: '🍆', color: '#f3e8ff' },
  VIRTUAL_MACAXEIRA: { description: 'Macaxeira / Mandioca', icon: '🍠', color: '#ffedd5' },
  VIRTUAL_CARNE_LOMBO: { description: 'Lombo Especial', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_MAMINHA: { description: 'Maminha Bovina', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_PICANHA: { description: 'Picanha Bovina', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_ALCATRA: { description: 'Alcatra Bovina', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_CONTRA_FILE: { description: 'Contra Filé Bovino', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_COSTELA: { description: 'Costela Bovina', icon: '🍖', color: '#fee2e2' },
  VIRTUAL_CARNE_SUINA: { description: 'Carne Suína', icon: '🥓', color: '#fce7f3' },
  VIRTUAL_CARNE_MOIDA: { description: 'Carne Moída', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_BIFE: { description: 'Bife Bovino Especial', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_PATINHO: { description: 'Patinho Bovino', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_COXAO_MOLE: { description: 'Coxão Mole', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_ACEM: { description: 'Acém Bovino', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_MUSCULO: { description: 'Músculo Bovino', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_BISTECA: { description: 'Bisteca', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_CARNE_LAGARTO: { description: 'Lagarto Bovino', icon: '🥩', color: '#fee2e2' },
  VIRTUAL_FRANGO_PEITO: { description: 'Peito de Frango Resfriado', icon: '🍗', color: '#fef3c7' },
  VIRTUAL_FRANGO_COXA: { description: 'Coxa e Sobrecoxa de Frango', icon: '🍗', color: '#fef3c7' },
  VIRTUAL_FRANGO_ASA: { description: 'Asa de Frango', icon: '🍗', color: '#fef3c7' },
  VIRTUAL_FRANGO_CORACAO: { description: 'Coração de Frango', icon: '🫀', color: '#fee2e2' },
  VIRTUAL_LINGUICA: { description: 'Linguiça Toscana', icon: '🌭', color: '#fee2e2' },
  VIRTUAL_OVOS: { description: 'Ovos Brancos Tipo Grande', icon: '🥚', color: '#fef9c3' }
};

function makeSvg(item) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="${item.color}"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">${item.icon}</text></svg>`.trim();
}

const pool = new Pool({ connectionString: databaseUrl });

async function run() {
  console.log(`=== POPULANDO IMAGENS VIRTUAIS DO LOJA QUEIROZ (${storeSlug}) ===`);

  const storeRes = await pool.query("SELECT id, name FROM stores WHERE slug = $1 LIMIT 1", [storeSlug]);
  if (!storeRes.rowCount) throw new Error(`Loja ${storeSlug} nao encontrada no banco.`);

  const store = storeRes.rows[0];
  console.log(`Loja encontrada: ${store.name} (${store.id})`);

  // Ensure catalog_assets table exists and seed VIRTUAL eans
  for (const [ean, item] of Object.entries(VIRTUAL_DATA)) {
    const svg = makeSvg(item);
    const buffer = Buffer.from(svg);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    await pool.query(`
      INSERT INTO catalog_assets (ean, description, content_type, image_data, checksum, byte_size, source_name, source_url)
      VALUES ($1, $2, 'image/svg+xml', $3, $4, $5, 'Padrao Sistema', 'inline-svg')
      ON CONFLICT (ean) DO UPDATE SET
        description = EXCLUDED.description,
        content_type = EXCLUDED.content_type,
        image_data = EXCLUDED.image_data,
        checksum = EXCLUDED.checksum,
        byte_size = EXCLUDED.byte_size,
        updated_at = NOW()
    `, [ean, item.description, buffer, checksum, buffer.length]);
  }
  console.log(`[OK] ${Object.keys(VIRTUAL_DATA).length} imagens salvas em catalog_assets!`);

  // Get products of Queiroz store that need images
  const productsRes = await pool.query("SELECT id, name, category, barcode FROM products WHERE store_id = $1", [store.id]);
  console.log(`Total de produtos na loja Queiroz: ${productsRes.rowCount}`);

  let linkedCount = 0;

  for (const p of productsRes.rows) {
    const virtualEan = getVirtualEan(p.name, p.category);
    if (virtualEan && VIRTUAL_DATA[virtualEan]) {
      const item = VIRTUAL_DATA[virtualEan];
      const svg = makeSvg(item);
      const buffer = Buffer.from(svg);
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

      await pool.query(`
        INSERT INTO product_images (store_id, product_id, content_type, image_data, checksum, byte_size, source, updated_at)
        VALUES ($1, $2, 'image/svg+xml', $3, $4, $5, 'auto-virtual', NOW())
        ON CONFLICT (store_id, product_id) DO UPDATE SET
          content_type = EXCLUDED.content_type,
          image_data = EXCLUDED.image_data,
          checksum = EXCLUDED.checksum,
          byte_size = EXCLUDED.byte_size,
          updated_at = NOW()
      `, [store.id, p.id, buffer, checksum, buffer.length]);

      linkedCount++;
    }
  }

  console.log(`\n======================================================`);
  console.log(`[SUCESSO] ${linkedCount} produtos da loja Queiroz populados diretamente em product_images!`);
  console.log(`======================================================`);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
