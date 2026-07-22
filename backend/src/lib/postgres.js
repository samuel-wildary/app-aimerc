import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || '').trim();

if (!databaseUrl) {
  throw new Error('DATABASE_URL e obrigatoria. O AiMerc utiliza somente PostgreSQL.');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: Math.max(2, Number(process.env.AIMERC_DB_POOL_MAX || 10)),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: process.env.NODE_ENV === 'test'
});

pool.on('error', error => console.error('Falha inesperada no pool PostgreSQL', error));

export function query(text, values = []) {
  return pool.query(text, values);
}

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const schema = `
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'TRIAL',
  plan TEXT NOT NULL DEFAULT 'PROFESSIONAL',
  monthly_price DOUBLE PRECISION NOT NULL DEFAULT 497,
  minimum_order DOUBLE PRECISION NOT NULL DEFAULT 30,
  delivery_fee DOUBLE PRECISION NOT NULL DEFAULT 6,
  free_delivery_above DOUBLE PRECISION NOT NULL DEFAULT 0,
  support_phone TEXT NOT NULL DEFAULT '',
  cancellation_window_minutes INTEGER NOT NULL DEFAULT 5,
  brand_primary TEXT NOT NULL DEFAULT '#092D22',
  brand_accent TEXT NOT NULL DEFAULT '#12C98A',
  brand_background TEXT NOT NULL DEFAULT '#F2F5EF',
  is_open INTEGER NOT NULL DEFAULT 1,
  enable_pickup_scheduling INTEGER NOT NULL DEFAULT 1,
  pickup_slots TEXT NOT NULL DEFAULT '08:00 - 10:00, 10:00 - 12:00, 12:00 - 14:00, 14:00 - 16:00, 16:00 - 18:00, 18:00 - 20:00',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  billing_method TEXT NOT NULL DEFAULT 'PIX',
  next_due_date TEXT NOT NULL,
  external_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  old_price DOUBLE PRECISION,
  stock DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'UN',
  image TEXT NOT NULL DEFAULT '',
  promo INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, id),
  UNIQUE (store_id, sku)
);

CREATE TABLE IF NOT EXISTS store_integrations (
  store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  provider_code TEXT NOT NULL DEFAULT 'GENERIC_JSON',
  provider_name TEXT NOT NULL DEFAULT 'API do supermercado',
  connection_mode TEXT NOT NULL DEFAULT 'LOCAL_AGENT',
  endpoint_url TEXT NOT NULL DEFAULT '',
  auth_type TEXT NOT NULL DEFAULT 'NONE',
  auth_header TEXT NOT NULL DEFAULT 'Authorization',
  encrypted_secret TEXT NOT NULL DEFAULT '',
  field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  sync_interval_seconds INTEGER NOT NULL DEFAULT 300,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  last_sync_status TEXT NOT NULL DEFAULT 'NEVER',
  last_sync_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_agents (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_ip TEXT NOT NULL DEFAULT '',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_runs (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES integration_agents(id) ON DELETE SET NULL,
  provider_code TEXT NOT NULL,
  status TEXT NOT NULL,
  received_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  tracking_token TEXT,
  tracking_token_hash TEXT,
  idempotency_key TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL DEFAULT '',
  customer_cep TEXT NOT NULL DEFAULT '',
  customer_street TEXT NOT NULL DEFAULT '',
  customer_number TEXT NOT NULL DEFAULT '',
  customer_complement TEXT NOT NULL DEFAULT '',
  customer_neighborhood TEXT NOT NULL DEFAULT '',
  customer_city TEXT NOT NULL DEFAULT '',
  customer_state TEXT NOT NULL DEFAULT '',
  customer_reference TEXT NOT NULL DEFAULT '',
  fulfillment_type TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  change_for DOUBLE PRECISION,
  notes TEXT NOT NULL DEFAULT '',
  scheduled_to TEXT,
  subtotal DOUBLE PRECISION NOT NULL,
  delivery_fee DOUBLE PRECISION NOT NULL,
  total DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  cancelled_by TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, id)
);

CREATE TABLE IF NOT EXISTS order_items (
  store_id TEXT NOT NULL,
  id BIGSERIAL,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  total DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (store_id, id),
  FOREIGN KEY (store_id, order_id) REFERENCES orders(store_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS banners (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  eyebrow TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, id)
);

CREATE TABLE IF NOT EXISTS push_campaigns (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'ALL_CUSTOMERS',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  scheduled_at TEXT,
  sent_at TEXT,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  send_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, id)
);

CREATE TABLE IF NOT EXISTS push_automations (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'ALL_CUSTOMERS',
  send_time TEXT NOT NULL DEFAULT '10:00',
  weekday INTEGER,
  inactive_days INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, id)
);

CREATE TABLE IF NOT EXISTS push_devices (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'ANDROID',
  customer_phone TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (store_id, token)
);

CREATE TABLE IF NOT EXISTS product_images (
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  image_data BYTEA NOT NULL,
  checksum TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'catalog-import',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, product_id),
  FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS banner_images (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  image_data BYTEA NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, id)
);

CREATE TABLE IF NOT EXISTS catalog_assets (
  ean VARCHAR(14) PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  content_type VARCHAR(80) NOT NULL,
  image_data BYTEA NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  byte_size INTEGER NOT NULL,
  source_name TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_scan_jobs (
  id TEXT PRIMARY KEY,
  source_type VARCHAR(40) NOT NULL,
  source_value TEXT NOT NULL DEFAULT '',
  requested_limit INTEGER NOT NULL DEFAULT 100,
  concurrency INTEGER NOT NULL DEFAULT 4,
  status VARCHAR(24) NOT NULL DEFAULT 'STARTING',
  phase VARCHAR(40) NOT NULL DEFAULT 'starting',
  current_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  saved_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  limit_key TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token_hash TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS enable_pickup_scheduling INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pickup_slots TEXT NOT NULL DEFAULT '08:00 - 10:00, 10:00 - 12:00, 12:00 - 14:00, 14:00 - 16:00, 16:00 - 18:00, 18:00 - 20:00';
ALTER TABLE banners ALTER COLUMN title SET DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS enrichment_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE products ADD COLUMN IF NOT EXISTS enriched_at TEXT;
ALTER TABLE store_integrations ADD COLUMN IF NOT EXISTS provider_code TEXT NOT NULL DEFAULT 'GENERIC_JSON';
ALTER TABLE store_integrations ADD COLUMN IF NOT EXISTS connection_mode TEXT NOT NULL DEFAULT 'LOCAL_AGENT';
ALTER TABLE store_integrations ADD COLUMN IF NOT EXISTS sync_interval_seconds INTEGER NOT NULL DEFAULT 300;
UPDATE products SET source_name=name WHERE source_name IS NULL;
UPDATE products SET source_category=category WHERE source_category IS NULL;
CREATE SEQUENCE IF NOT EXISTS order_items_id_seq;
ALTER TABLE order_items ALTER COLUMN id SET DEFAULT nextval('order_items_id_seq');
SELECT setval('order_items_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM order_items), 0) + 1, 1), false);

CREATE INDEX IF NOT EXISTS products_store_active_category_idx ON products(store_id, active, category);
CREATE INDEX IF NOT EXISTS products_store_catalog_category_idx ON products(store_id, catalog_category);
CREATE INDEX IF NOT EXISTS products_store_barcode_idx ON products(store_id, barcode);
CREATE INDEX IF NOT EXISTS orders_store_created_idx ON orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_phone_idx ON orders(store_id, customer_phone, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_idx ON orders(store_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_campaigns_pending_idx ON push_campaigns(store_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS push_automations_due_idx ON push_automations(store_id, active, next_run_at);
CREATE INDEX IF NOT EXISTS audit_logs_store_created_idx ON audit_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_rate_limits_updated_idx ON api_rate_limits(updated_at);
CREATE INDEX IF NOT EXISTS catalog_assets_updated_idx ON catalog_assets(updated_at DESC);
CREATE INDEX IF NOT EXISTS catalog_assets_description_idx ON catalog_assets USING gin (to_tsvector('simple', description));
CREATE INDEX IF NOT EXISTS catalog_scan_jobs_started_idx ON catalog_scan_jobs(started_at DESC);
CREATE INDEX IF NOT EXISTS integration_agents_store_idx ON integration_agents(store_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS integration_agents_seen_idx ON integration_agents(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS integration_runs_store_started_idx ON integration_runs(store_id, started_at DESC);
`;

const VIRTUAL_IMAGES = {
  VIRTUAL_ALHO: {
    description: 'Alho Roxo',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#f3e8ee"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🧄</text></svg>`
  },
  VIRTUAL_BATATA: {
    description: 'Batata Inglesa',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fef3c7"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥔</text></svg>`
  },
  VIRTUAL_CEBOLA: {
    description: 'Cebola Branca',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#ffedd5"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🧅</text></svg>`
  },
  VIRTUAL_CENOURA: {
    description: 'Cenoura Especial',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#ffedd5"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥕</text></svg>`
  },
  VIRTUAL_TOMATE: {
    description: 'Tomate Longa Vida',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍅</text></svg>`
  },
  VIRTUAL_BANANA: {
    description: 'Banana Prata',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fef9c3"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍌</text></svg>`
  },
  VIRTUAL_MACA: {
    description: 'Maçã Nacional',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍎</text></svg>`
  },
  VIRTUAL_LARANJA: {
    description: 'Laranja Pêra',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#ffedd5"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍊</text></svg>`
  },
  VIRTUAL_LIMAO: {
    description: 'Limão Taiti',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#dcfce7"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍋</text></svg>`
  },
  VIRTUAL_MAMAO: {
    description: 'Mamão Formosa',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#ffedd5"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥭</text></svg>`
  },
  VIRTUAL_ABACAXI: {
    description: 'Abacaxi Pérola',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fef9c3"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍍</text></svg>`
  },
  VIRTUAL_UVA: {
    description: 'Uva Roxa',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#f3e8ff"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍇</text></svg>`
  },
  VIRTUAL_ALFACE: {
    description: 'Alface Hidropônica',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#dcfce7"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥬</text></svg>`
  },
  VIRTUAL_ATA: {
    description: 'Ata / Pinha',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#dcfce7"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍈</text></svg>`
  },
  VIRTUAL_BERINJELA: {
    description: 'Berinjela',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#f3e8ff"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍆</text></svg>`
  },
  VIRTUAL_MACAXEIRA: {
    description: 'Macaxeira / Mandioca',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#ffedd5"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍠</text></svg>`
  },
  VIRTUAL_CARNE_LOMBO: {
    description: 'Lombo Especial',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_MAMINHA: {
    description: 'Maminha Bovina',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_PICANHA: {
    description: 'Picanha Bovina',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_ALCATRA: {
    description: 'Alcatra Bovina',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_CONTRA_FILE: {
    description: 'Contra Filé Bovino',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_COSTELA: {
    description: 'Costela Bovina',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍖</text></svg>`
  },
  VIRTUAL_CARNE_SUINA: {
    description: 'Carne Suína',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fce7f3"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥓</text></svg>`
  },
  VIRTUAL_CARNE_MOIDA: {
    description: 'Carne Moída',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_BIFE: {
    description: 'Bife Bovino Especial',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_PATINHO: {
    description: 'Patinho Bovino',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_COXAO_MOLE: {
    description: 'Coxão Mole',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_ACEM: {
    description: 'Acém Bovino',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_MUSCULO: {
    description: 'Músculo Bovino',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_BISTECA: {
    description: 'Bisteca',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_CARNE_LAGARTO: {
    description: 'Lagarto Bovino',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥩</text></svg>`
  },
  VIRTUAL_FRANGO_PEITO: {
    description: 'Peito de Frango Resfriado',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fef3c7"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍗</text></svg>`
  },
  VIRTUAL_FRANGO_COXA: {
    description: 'Coxa e Sobrecoxa de Frango',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fef3c7"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍗</text></svg>`
  },
  VIRTUAL_FRANGO_ASA: {
    description: 'Asa de Frango',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fef3c7"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🍗</text></svg>`
  },
  VIRTUAL_FRANGO_CORACAO: {
    description: 'Coração de Frango',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🫀</text></svg>`
  },
  VIRTUAL_LINGUICA: {
    description: 'Linguiça Toscana',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fee2e2"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🌭</text></svg>`
  },
  VIRTUAL_OVOS: {
    description: 'Ovos Brancos Tipo Grande',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" rx="40" fill="#fef9c3"/><circle cx="200" cy="200" r="140" fill="white" opacity="0.7"/><text x="200" y="225" font-size="140" text-anchor="middle" dominant-baseline="central">🥚</text></svg>`
  }
};

export async function seedVirtualAssets({ force = false } = {}) {
  let seeded = 0;
  for (const [ean, info] of Object.entries(VIRTUAL_IMAGES)) {
    try {
      if (!force) {
        const existsRes = await pool.query('SELECT 1 FROM catalog_assets WHERE ean = $1 LIMIT 1', [ean]);
        if (existsRes.rowCount > 0) continue;
      }

      let buffer;
      let contentType = 'image/svg+xml';

      if (info.svg) {
        buffer = Buffer.from(info.svg);
      } else if (info.url) {
        const response = await fetch(info.url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) continue;
        buffer = Buffer.from(await response.arrayBuffer());
        contentType = response.headers.get('content-type') || 'image/jpeg';
      }

      if (!buffer) continue;

      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

      await pool.query(
        `INSERT INTO catalog_assets (ean, description, content_type, image_data, checksum, byte_size, source_name, source_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (ean) DO UPDATE SET
           description = EXCLUDED.description,
           content_type = EXCLUDED.content_type,
           image_data = EXCLUDED.image_data,
           checksum = EXCLUDED.checksum,
           byte_size = EXCLUDED.byte_size,
           source_name = EXCLUDED.source_name,
           source_url = EXCLUDED.source_url`,
        [ean, info.description, contentType, buffer, checksum, buffer.length, 'Padrao Sistema', 'inline-svg']
      );
      seeded++;
    } catch (err) {
      console.error(`[SEED] Erro ao cadastrar ${info.description}:`, err.message);
    }
  }

  try {
    const { getVirtualEan } = await import('./database.js');
    const productsRes = await pool.query('SELECT store_id, id, name, category FROM products');
    for (const p of productsRes.rows) {
      const virtualEan = getVirtualEan(p.name, p.category);
      if (virtualEan) {
        await pool.query(`
          INSERT INTO product_images (store_id, product_id, content_type, image_data, checksum, byte_size, source, updated_at)
          SELECT $1, $2, ca.content_type, ca.image_data, ca.checksum, ca.byte_size, 'auto-virtual', NOW()
          FROM catalog_assets ca
          WHERE ca.ean = $3
          ON CONFLICT (store_id, product_id) DO NOTHING
        `, [p.store_id, p.id, virtualEan]);
      }
    }
  } catch (err) {
    console.error('[SEED] Erro ao vincular imagens nos produtos das lojas:', err.message);
  }

  return seeded;
}

let initialization;

export function initializePostgres() {
  if (!initialization) {
    initialization = (async () => {
      await pool.query(schema);
      seedVirtualAssets().catch(err => console.error('[SEED] Erro em seedVirtualAssets:', err.message));
    })();
  }
  return initialization;
}

export async function closePostgres() {
  await pool.end();
}
