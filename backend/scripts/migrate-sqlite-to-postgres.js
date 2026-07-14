import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Defina DATABASE_URL antes de executar a migracao.');
  process.exit(1);
}

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(backendDir, 'data');
const masterPath = path.join(dataDir, 'master.sqlite');
const storesDir = path.join(dataDir, 'stores');

if (!fs.existsSync(masterPath)) {
  console.error(`Banco SQLite principal nao encontrado em ${masterPath}`);
  process.exit(1);
}

function rows(db, table) {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return exists ? db.prepare(`SELECT * FROM ${table}`).all().map(item => ({ ...item })) : [];
}

async function upsertRows(client, table, columns, inputRows, conflictColumns, batchSize = 250) {
  if (!inputRows.length) return 0;
  const updates = columns.filter(column => !conflictColumns.includes(column));
  for (let offset = 0; offset < inputRows.length; offset += batchSize) {
    const batch = inputRows.slice(offset, offset + batchSize);
    const values = [];
    const placeholders = batch.map((item, rowIndex) => {
      const cells = columns.map((column, columnIndex) => {
        values.push(item[column] ?? null);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${cells.join(',')})`;
    });
    const conflict = conflictColumns.length
      ? `ON CONFLICT (${conflictColumns.join(',')}) DO UPDATE SET ${updates.map(column => `${column}=EXCLUDED.${column}`).join(',')}`
      : '';
    await client.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders.join(',')} ${conflict}`, values);
  }
  return inputRows.length;
}

const schema = `
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, owner TEXT NOT NULL,
  email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'TRIAL', plan TEXT NOT NULL DEFAULT 'PROFESSIONAL', monthly_price DOUBLE PRECISION NOT NULL DEFAULT 497,
  minimum_order DOUBLE PRECISION NOT NULL DEFAULT 30, delivery_fee DOUBLE PRECISION NOT NULL DEFAULT 6,
  free_delivery_above DOUBLE PRECISION NOT NULL DEFAULT 0, support_phone TEXT NOT NULL DEFAULT '',
  cancellation_window_minutes INTEGER NOT NULL DEFAULT 5, brand_primary TEXT NOT NULL DEFAULT '#092D22',
  brand_accent TEXT NOT NULL DEFAULT '#12C98A', brand_background TEXT NOT NULL DEFAULT '#F2F5EF',
  is_open INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, store_id TEXT REFERENCES stores(id), role TEXT NOT NULL, name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL UNIQUE REFERENCES stores(id), plan TEXT NOT NULL, status TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL, billing_method TEXT NOT NULL DEFAULT 'PIX', next_due_date TEXT NOT NULL,
  external_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE, id TEXT NOT NULL, sku TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, category TEXT NOT NULL, price DOUBLE PRECISION NOT NULL,
  old_price DOUBLE PRECISION, stock DOUBLE PRECISION NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'UN',
  image TEXT NOT NULL DEFAULT '', promo INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL, PRIMARY KEY (store_id,id), UNIQUE (store_id,sku)
);
CREATE TABLE IF NOT EXISTS orders (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE, id TEXT NOT NULL, tracking_token TEXT,
  customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_address TEXT NOT NULL DEFAULT '',
  customer_cep TEXT NOT NULL DEFAULT '', customer_street TEXT NOT NULL DEFAULT '', customer_number TEXT NOT NULL DEFAULT '',
  customer_complement TEXT NOT NULL DEFAULT '', customer_neighborhood TEXT NOT NULL DEFAULT '', customer_city TEXT NOT NULL DEFAULT '',
  customer_state TEXT NOT NULL DEFAULT '', customer_reference TEXT NOT NULL DEFAULT '', fulfillment_type TEXT NOT NULL,
  payment_method TEXT NOT NULL, change_for DOUBLE PRECISION, notes TEXT NOT NULL DEFAULT '', scheduled_to TEXT,
  subtotal DOUBLE PRECISION NOT NULL, delivery_fee DOUBLE PRECISION NOT NULL, total DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL, cancelled_by TEXT, cancelled_at TEXT, cancel_reason TEXT, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY (store_id,id)
);
CREATE TABLE IF NOT EXISTS order_items (
  store_id TEXT NOT NULL, id BIGINT NOT NULL, order_id TEXT NOT NULL, product_id TEXT NOT NULL, name TEXT NOT NULL,
  unit TEXT NOT NULL, quantity DOUBLE PRECISION NOT NULL, price DOUBLE PRECISION NOT NULL, total DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (store_id,id), FOREIGN KEY (store_id,order_id) REFERENCES orders(store_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS banners (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE, id TEXT NOT NULL, eyebrow TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (store_id,id)
);
CREATE TABLE IF NOT EXISTS push_campaigns (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE, id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'ALL_CUSTOMERS', status TEXT NOT NULL DEFAULT 'DRAFT', scheduled_at TEXT, sent_at TEXT,
  success_count INTEGER NOT NULL DEFAULT 0, failure_count INTEGER NOT NULL DEFAULT 0, send_error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (store_id,id)
);
CREATE TABLE IF NOT EXISTS push_automations (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE, id TEXT NOT NULL, name TEXT NOT NULL, title TEXT NOT NULL,
  body TEXT NOT NULL, trigger_type TEXT NOT NULL, audience TEXT NOT NULL DEFAULT 'ALL_CUSTOMERS', send_time TEXT NOT NULL DEFAULT '10:00',
  weekday INTEGER, inactive_days INTEGER, active INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, next_run_at TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (store_id,id)
);
CREATE TABLE IF NOT EXISTS push_devices (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE, token TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'ANDROID',
  customer_phone TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  PRIMARY KEY (store_id,token)
);
CREATE INDEX IF NOT EXISTS products_store_active_category_idx ON products(store_id,active,category);
CREATE INDEX IF NOT EXISTS orders_store_created_idx ON orders(store_id,created_at DESC);
`;

const master = new DatabaseSync(masterPath);
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query('BEGIN');
  await client.query(schema);

  const stores = rows(master, 'stores');
  await upsertRows(client, 'stores', [
    'id', 'slug', 'name', 'owner', 'email', 'phone', 'city', 'state', 'status', 'plan', 'monthly_price',
    'minimum_order', 'delivery_fee', 'free_delivery_above', 'support_phone', 'cancellation_window_minutes',
    'brand_primary', 'brand_accent', 'brand_background', 'is_open', 'created_at'
  ], stores, ['id']);
  await upsertRows(client, 'users', ['id', 'store_id', 'role', 'name', 'email', 'password_hash', 'password_salt', 'created_at'], rows(master, 'users'), ['id']);
  await upsertRows(client, 'subscriptions', ['id', 'store_id', 'plan', 'status', 'amount', 'billing_method', 'next_due_date', 'external_id', 'created_at'], rows(master, 'subscriptions'), ['id']);

  const totals = { stores: stores.length, products: 0, orders: 0, orderItems: 0 };
  for (const store of stores) {
    const storePath = path.join(storesDir, `${store.id}.sqlite`);
    if (!fs.existsSync(storePath)) continue;
    const db = new DatabaseSync(storePath);
    const withStore = table => rows(db, table).map(item => ({ store_id: store.id, ...item }));

    const products = withStore('products');
    const orders = withStore('orders');
    const orderItems = withStore('order_items');
    totals.products += await upsertRows(client, 'products', ['store_id', 'id', 'sku', 'barcode', 'name', 'category', 'price', 'old_price', 'stock', 'unit', 'image', 'promo', 'active', 'updated_at'], products, ['store_id', 'id']);
    totals.orders += await upsertRows(client, 'orders', ['store_id', 'id', 'tracking_token', 'customer_name', 'customer_phone', 'customer_address', 'customer_cep', 'customer_street', 'customer_number', 'customer_complement', 'customer_neighborhood', 'customer_city', 'customer_state', 'customer_reference', 'fulfillment_type', 'payment_method', 'change_for', 'notes', 'scheduled_to', 'subtotal', 'delivery_fee', 'total', 'status', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'created_at', 'updated_at'], orders, ['store_id', 'id']);
    totals.orderItems += await upsertRows(client, 'order_items', ['store_id', 'id', 'order_id', 'product_id', 'name', 'unit', 'quantity', 'price', 'total'], orderItems, ['store_id', 'id']);
    await upsertRows(client, 'banners', ['store_id', 'id', 'eyebrow', 'title', 'subtitle', 'image', 'active', 'position', 'created_at', 'updated_at'], withStore('banners'), ['store_id', 'id']);
    await upsertRows(client, 'push_campaigns', ['store_id', 'id', 'title', 'body', 'audience', 'status', 'scheduled_at', 'sent_at', 'success_count', 'failure_count', 'send_error', 'created_at', 'updated_at'], withStore('push_campaigns'), ['store_id', 'id']);
    await upsertRows(client, 'push_automations', ['store_id', 'id', 'name', 'title', 'body', 'trigger_type', 'audience', 'send_time', 'weekday', 'inactive_days', 'active', 'last_run_at', 'next_run_at', 'created_at', 'updated_at'], withStore('push_automations'), ['store_id', 'id']);
    await upsertRows(client, 'push_devices', ['store_id', 'token', 'platform', 'customer_phone', 'active', 'created_at', 'last_seen_at'], withStore('push_devices'), ['store_id', 'token']);
  }

  await client.query('COMMIT');
  console.log(JSON.stringify({ success: true, ...totals, migratedAt: new Date().toISOString() }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
