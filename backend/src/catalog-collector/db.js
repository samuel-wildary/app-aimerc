import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'scraper_user',
      password: process.env.DB_PASSWORD || 'scraper_password',
      database: process.env.DB_NAME || 'ean_scraper',
    };

const pool = new Pool(poolConfig);

let isConnected = false;

// Test the connection
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('Catalog collector connected to PostgreSQL.');
    client.release();
    isConnected = true;
    
    // Create table if it doesn't exist
    await createTableIfNotExist();
  } catch (error) {
    console.error('Failed to connect to PostgreSQL database. Scraper will run, but database saves will fail.', error.message);
    isConnected = false;
  }
}

async function createTableIfNotExist() {
  const queryText = `
    CREATE TABLE IF NOT EXISTS product_images (
      id SERIAL PRIMARY KEY,
      ean VARCHAR(14) NOT NULL UNIQUE,
      image_data BYTEA NOT NULL,
      mime_type VARCHAR(30) NOT NULL,
      product_name TEXT,
      image_url TEXT,
      product_url TEXT,
      source_site VARCHAR(100),
      scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE product_images ADD COLUMN IF NOT EXISTS product_name TEXT;
    ALTER TABLE product_images ADD COLUMN IF NOT EXISTS product_url TEXT;
    CREATE INDEX IF NOT EXISTS idx_images_ean ON product_images(ean);
    CREATE INDEX IF NOT EXISTS idx_images_product_name ON product_images(product_name);
    CREATE INDEX IF NOT EXISTS idx_images_product_url ON product_images(product_url);

    CREATE TABLE IF NOT EXISTS product_image_assets (
      id SERIAL PRIMARY KEY,
      ean VARCHAR(14) NOT NULL REFERENCES product_images(ean) ON DELETE CASCADE,
      image_data BYTEA NOT NULL,
      mime_type VARCHAR(30) NOT NULL,
      image_url TEXT NOT NULL,
      source_site VARCHAR(100),
      position SMALLINT DEFAULT 0,
      scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (ean, image_url)
    );
    CREATE INDEX IF NOT EXISTS idx_product_image_assets_ean ON product_image_assets(ean);

    CREATE TABLE IF NOT EXISTS scraped_product_pages (
      product_url TEXT PRIMARY KEY,
      ean VARCHAR(14),
      status VARCHAR(30) NOT NULL,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_scraped_product_pages_status ON scraped_product_pages(status);

    CREATE TABLE IF NOT EXISTS scraper_runtime_cache (
      cache_key VARCHAR(100) PRIMARY KEY,
      cache_value TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log('Database tables verified/created successfully.');
  } catch (error) {
    console.error('Error creating database tables:', error.message);
  }
}

// Run the connection test asynchronously
testConnection();

export default {
  query: (text, params) => pool.query(text, params),
  getPool: () => pool,
  checkStatus: async () => {
    try {
      const res = await pool.query('SELECT 1');
      isConnected = res.rows.length > 0;
    } catch {
      isConnected = false;
    }
    return isConnected;
  }
};
