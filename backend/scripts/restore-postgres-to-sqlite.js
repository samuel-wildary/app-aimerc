import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL nao configurada.');
  process.exit(1);
}

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.AIMERC_DATA_DIR
  ? path.resolve(process.env.AIMERC_DATA_DIR)
  : path.join(backendDir, 'data');
const storesDir = path.join(dataDir, 'stores');
fs.mkdirSync(storesDir, { recursive: true });

function insertRows(db, table, columns, inputRows) {
  if (!inputRows.length) return;
  const placeholders = columns.map(() => '?').join(',');
  const statement = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
  db.exec('BEGIN');
  try {
    for (const row of inputRows) statement.run(...columns.map(column => row[column] ?? null));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const masterSchema = `
CREATE TABLE stores (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, owner TEXT NOT NULL, email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'TRIAL',
  plan TEXT NOT NULL DEFAULT 'PROFESSIONAL', monthly_price REAL NOT NULL DEFAULT 497, minimum_order REAL NOT NULL DEFAULT 30,
  delivery_fee REAL NOT NULL DEFAULT 6, free_delivery_above REAL NOT NULL DEFAULT 0, support_phone TEXT NOT NULL DEFAULT '',
  cancellation_window_minutes INTEGER NOT NULL DEFAULT 5, brand_primary TEXT NOT NULL DEFAULT '#092D22',
  brand_accent TEXT NOT NULL DEFAULT '#12C98A', brand_background TEXT NOT NULL DEFAULT '#F2F5EF', is_open INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY, store_id TEXT, role TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL UNIQUE, plan TEXT NOT NULL, status TEXT NOT NULL, amount REAL NOT NULL,
  billing_method TEXT NOT NULL DEFAULT 'PIX', next_due_date TEXT NOT NULL, external_id TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);`;

const storeSchema = `
CREATE TABLE products (
  id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE, barcode TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, category TEXT NOT NULL,
  price REAL NOT NULL, old_price REAL, stock REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'UN', image TEXT NOT NULL DEFAULT '',
  promo INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE orders (
  id TEXT PRIMARY KEY, tracking_token TEXT, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL DEFAULT '', customer_cep TEXT NOT NULL DEFAULT '', customer_street TEXT NOT NULL DEFAULT '',
  customer_number TEXT NOT NULL DEFAULT '', customer_complement TEXT NOT NULL DEFAULT '', customer_neighborhood TEXT NOT NULL DEFAULT '',
  customer_city TEXT NOT NULL DEFAULT '', customer_state TEXT NOT NULL DEFAULT '', customer_reference TEXT NOT NULL DEFAULT '',
  fulfillment_type TEXT NOT NULL, payment_method TEXT NOT NULL, change_for REAL, notes TEXT NOT NULL DEFAULT '', scheduled_to TEXT,
  subtotal REAL NOT NULL, delivery_fee REAL NOT NULL, total REAL NOT NULL, status TEXT NOT NULL, cancelled_by TEXT,
  cancelled_at TEXT, cancel_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, product_id TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL,
  quantity REAL NOT NULL, price REAL NOT NULL, total REAL NOT NULL, FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE TABLE banners (
  id TEXT PRIMARY KEY, eyebrow TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE push_campaigns (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, audience TEXT NOT NULL DEFAULT 'ALL_CUSTOMERS',
  status TEXT NOT NULL DEFAULT 'DRAFT', scheduled_at TEXT, sent_at TEXT, success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0, send_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE push_automations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, trigger_type TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'ALL_CUSTOMERS', send_time TEXT NOT NULL DEFAULT '10:00', weekday INTEGER, inactive_days INTEGER,
  active INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, next_run_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE push_devices (
  token TEXT PRIMARY KEY, platform TEXT NOT NULL DEFAULT 'ANDROID', customer_phone TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
);`;

const tableColumns = {
  products: ['id', 'sku', 'barcode', 'name', 'category', 'price', 'old_price', 'stock', 'unit', 'image', 'promo', 'active', 'updated_at'],
  orders: ['id', 'tracking_token', 'customer_name', 'customer_phone', 'customer_address', 'customer_cep', 'customer_street', 'customer_number', 'customer_complement', 'customer_neighborhood', 'customer_city', 'customer_state', 'customer_reference', 'fulfillment_type', 'payment_method', 'change_for', 'notes', 'scheduled_to', 'subtotal', 'delivery_fee', 'total', 'status', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'created_at', 'updated_at'],
  order_items: ['id', 'order_id', 'product_id', 'name', 'unit', 'quantity', 'price', 'total'],
  banners: ['id', 'eyebrow', 'title', 'subtitle', 'image', 'active', 'position', 'created_at', 'updated_at'],
  push_campaigns: ['id', 'title', 'body', 'audience', 'status', 'scheduled_at', 'sent_at', 'success_count', 'failure_count', 'send_error', 'created_at', 'updated_at'],
  push_automations: ['id', 'name', 'title', 'body', 'trigger_type', 'audience', 'send_time', 'weekday', 'inactive_days', 'active', 'last_run_at', 'next_run_at', 'created_at', 'updated_at'],
  push_devices: ['token', 'platform', 'customer_phone', 'active', 'created_at', 'last_seen_at']
};

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const masterPath = path.join(dataDir, 'master.sqlite');
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${masterPath}${suffix}`, { force: true });
  const master = new DatabaseSync(masterPath);
  master.exec('PRAGMA foreign_keys = ON;');
  master.exec(masterSchema);

  const stores = (await client.query('SELECT * FROM stores ORDER BY created_at')).rows;
  insertRows(master, 'stores', ['id', 'slug', 'name', 'owner', 'email', 'phone', 'city', 'state', 'status', 'plan', 'monthly_price', 'minimum_order', 'delivery_fee', 'free_delivery_above', 'support_phone', 'cancellation_window_minutes', 'brand_primary', 'brand_accent', 'brand_background', 'is_open', 'created_at'], stores);
  insertRows(master, 'users', ['id', 'store_id', 'role', 'name', 'email', 'password_hash', 'password_salt', 'created_at'], (await client.query('SELECT * FROM users')).rows);
  insertRows(master, 'subscriptions', ['id', 'store_id', 'plan', 'status', 'amount', 'billing_method', 'next_due_date', 'external_id', 'created_at'], (await client.query('SELECT * FROM subscriptions')).rows);

  let productCount = 0;
  for (const store of stores) {
    const storePath = path.join(storesDir, `${store.id}.sqlite`);
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${storePath}${suffix}`, { force: true });
    const db = new DatabaseSync(storePath);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(storeSchema);
    for (const [table, columns] of Object.entries(tableColumns)) {
      const result = await client.query(`SELECT ${columns.join(',')} FROM ${table} WHERE store_id = $1`, [store.id]);
      insertRows(db, table, columns, result.rows);
      if (table === 'products') productCount += result.rowCount;
    }
  }

  console.log(JSON.stringify({ success: true, stores: stores.length, products: productCount }, null, 2));
} finally {
  await client.end();
}
