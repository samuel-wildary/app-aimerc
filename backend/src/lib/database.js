import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = process.env.AIMERC_DATA_DIR
  ? path.resolve(process.env.AIMERC_DATA_DIR)
  : path.join(rootDir, 'data');
const storesDir = path.join(dataDir, 'stores');
fs.mkdirSync(storesDir, { recursive: true });

const master = new DatabaseSync(path.join(dataDir, 'master.sqlite'));
master.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
master.exec(`
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
    monthly_price REAL NOT NULL DEFAULT 497,
    minimum_order REAL NOT NULL DEFAULT 30,
    delivery_fee REAL NOT NULL DEFAULT 6,
    free_delivery_above REAL NOT NULL DEFAULT 0,
    support_phone TEXT NOT NULL DEFAULT '',
    cancellation_window_minutes INTEGER NOT NULL DEFAULT 5,
    brand_primary TEXT NOT NULL DEFAULT '#092D22',
    brand_accent TEXT NOT NULL DEFAULT '#12C98A',
    brand_background TEXT NOT NULL DEFAULT '#F2F5EF',
    is_open INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    store_id TEXT,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id)
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    amount REAL NOT NULL,
    billing_method TEXT NOT NULL DEFAULT 'PIX',
    next_due_date TEXT NOT NULL,
    external_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (store_id) REFERENCES stores(id)
  );
`);

function ensureMasterColumn(name, definition) {
  const columns = master.prepare('PRAGMA table_info(stores)').all();
  if (!columns.some(column => column.name === name)) master.exec(`ALTER TABLE stores ADD COLUMN ${name} ${definition}`);
}

ensureMasterColumn('free_delivery_above', 'REAL NOT NULL DEFAULT 0');
ensureMasterColumn('support_phone', "TEXT NOT NULL DEFAULT ''");
ensureMasterColumn('cancellation_window_minutes', 'INTEGER NOT NULL DEFAULT 5');
ensureMasterColumn('brand_primary', "TEXT NOT NULL DEFAULT '#092D22'");
ensureMasterColumn('brand_accent', "TEXT NOT NULL DEFAULT '#12C98A'");
ensureMasterColumn('brand_background', "TEXT NOT NULL DEFAULT '#F2F5EF'");

const storeConnections = new Map();

function isoNow() {
  return new Date().toISOString();
}

function nextDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function mapStore(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    owner: row.owner,
    email: row.email,
    phone: row.phone,
    city: row.city,
    state: row.state,
    status: row.status,
    plan: row.plan,
    monthlyPrice: row.monthly_price,
    minimumOrder: row.minimum_order,
    deliveryFee: row.delivery_fee,
    freeDeliveryAbove: row.free_delivery_above || 0,
    supportPhone: row.support_phone || row.phone,
    cancellationWindowMinutes: row.cancellation_window_minutes || 5,
    brandColors: {
      primary: row.brand_primary || '#092D22',
      accent: row.brand_accent || '#12C98A',
      background: row.brand_background || '#F2F5EF'
    },
    open: Boolean(row.is_open),
    createdAt: row.created_at
  };
}

function initializeStoreDatabase(storeId) {
  if (storeConnections.has(storeId)) return storeConnections.get(storeId);
  const db = new DatabaseSync(path.join(storesDir, `${storeId}.sqlite`));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      old_price REAL,
      stock REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'UN',
      image TEXT NOT NULL DEFAULT '',
      promo INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      tracking_token TEXT,
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
      change_for REAL,
      notes TEXT NOT NULL DEFAULT '',
      scheduled_to TEXT,
      subtotal REAL NOT NULL,
      delivery_fee REAL NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL,
      cancelled_by TEXT,
      cancelled_at TEXT,
      cancel_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY,
      eyebrow TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS push_campaigns (
      id TEXT PRIMARY KEY,
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
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS push_automations (
      id TEXT PRIMARY KEY,
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
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS push_devices (
      token TEXT PRIMARY KEY,
      platform TEXT NOT NULL DEFAULT 'ANDROID',
      customer_phone TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
  `);
  const orderColumns = db.prepare('PRAGMA table_info(orders)').all();
  const missingColumns = {
    tracking_token: 'TEXT',
    customer_cep: "TEXT NOT NULL DEFAULT ''",
    customer_street: "TEXT NOT NULL DEFAULT ''",
    customer_number: "TEXT NOT NULL DEFAULT ''",
    customer_complement: "TEXT NOT NULL DEFAULT ''",
    customer_neighborhood: "TEXT NOT NULL DEFAULT ''",
    customer_city: "TEXT NOT NULL DEFAULT ''",
    customer_state: "TEXT NOT NULL DEFAULT ''",
    customer_reference: "TEXT NOT NULL DEFAULT ''",
    cancelled_by: 'TEXT',
    cancelled_at: 'TEXT',
    cancel_reason: 'TEXT'
  };
  for (const [name, definition] of Object.entries(missingColumns)) {
    if (!orderColumns.some(column => column.name === name)) db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
  }
  const campaignColumns = db.prepare('PRAGMA table_info(push_campaigns)').all();
  const missingCampaignColumns = {
    sent_at: 'TEXT',
    success_count: 'INTEGER NOT NULL DEFAULT 0',
    failure_count: 'INTEGER NOT NULL DEFAULT 0',
    send_error: 'TEXT'
  };
  for (const [name, definition] of Object.entries(missingCampaignColumns)) {
    if (!campaignColumns.some(column => column.name === name)) db.exec(`ALTER TABLE push_campaigns ADD COLUMN ${name} ${definition}`);
  }
  storeConnections.set(storeId, db);
  return db;
}

function seedStore(storeId) {
  const db = initializeStoreDatabase(storeId);
  const count = db.prepare('SELECT COUNT(*) AS total FROM products').get().total;
  if (count === 0) {
    const products = [
      ['789100000001', 'CAF001', '789100000001', 'Cafe Tradicional 250g', 'Mercearia', 8.99, 10.49, 42, 'UN', 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=600&q=80', 1],
      ['789100000002', 'ARR001', '789100000002', 'Arroz Branco Tipo 1 5kg', 'Mercearia', 24.9, null, 21, 'UN', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80', 0],
      ['789100000003', 'BAN001', '789100000003', 'Banana Prata', 'Hortifruti', 5.49, null, 85.5, 'KG', 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?auto=format&fit=crop&w=600&q=80', 1],
      ['789100000004', 'CAR001', '789100000004', 'Carne Bovina Acem', 'Carnes', 29.9, null, 18.2, 'KG', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=600&q=80', 0],
      ['789100000005', 'AGU001', '789100000005', 'Agua Mineral 1.5L', 'Bebidas', 2.79, 3.29, 120, 'UN', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=600&q=80', 1]
    ];
    const statement = db.prepare(`INSERT INTO products
      (id, sku, barcode, name, category, price, old_price, stock, unit, image, promo, active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);
    for (const product of products) statement.run(...product, isoNow());
  }
  const bannerCount = db.prepare('SELECT COUNT(*) AS total FROM banners').get().total;
  if (bannerCount === 0) {
    const insertBanner = db.prepare(`INSERT INTO banners (id, eyebrow, title, subtitle, image, active, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`);
    const now = isoNow();
    insertBanner.run('banner_fresh', 'Feira da semana', 'Frescor que cabe no carrinho', 'Hortifruti selecionado e entrega no mesmo dia.', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=85', 0, now, now);
    insertBanner.run('banner_pantry', 'Despensa completa', 'Economize nos essenciais', 'Ofertas para abastecer a casa toda.', 'https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=1200&q=85', 1, now, now);
    insertBanner.run('banner_delivery', 'Compra sem correria', 'Receba tudo na sua porta', 'Escolha entrega ou retirada e pague somente ao receber.', 'https://images.unsplash.com/photo-1588964895597-cfccd6e2dbf9?auto=format&fit=crop&w=1200&q=85', 2, now, now);
  }
}

function ensureUser({ id, storeId = null, role, name, email, password }) {
  if (master.prepare('SELECT id FROM users WHERE email = ?').get(email)) return;
  const credentials = hashPassword(password);
  master.prepare(`INSERT INTO users (id, store_id, role, name, email, password_hash, password_salt, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, storeId, role, name, email, credentials.hash, credentials.salt, isoNow());
}

function seedMaster() {
  const demoId = 'store_001';
  if (!master.prepare('SELECT id FROM stores WHERE id = ?').get(demoId)) {
    master.prepare(`INSERT INTO stores
      (id, slug, name, owner, email, phone, city, state, status, plan, monthly_price, minimum_order, delivery_fee, free_delivery_above, support_phone, cancellation_window_minutes, is_open, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .run(demoId, 'aimerc-demo', 'Mercado Boa Compra', 'Marina Costa', 'gestor@aimerc.local', '(85) 99999-1010', 'Caucaia', 'CE', 'TRIAL', 'PROFESSIONAL', 497, 30, 6, 0, '(85) 99999-1010', 5, isoNow());
    master.prepare(`INSERT INTO subscriptions
      (id, store_id, plan, status, amount, billing_method, next_due_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('sub_001', demoId, 'PROFESSIONAL', 'TRIAL', 497, 'PIX', nextDueDate(), isoNow());
  }
  ensureUser({ id: 'user_master_001', role: 'PLATFORM_ADMIN', name: 'Samuel Wildary', email: 'admin@aimerc.local', password: 'Admin@2026' });
  ensureUser({ id: 'user_store_001', storeId: demoId, role: 'STORE_MANAGER', name: 'Marina Costa', email: 'gestor@aimerc.local', password: 'Aimerc@2026' });
  master.prepare("UPDATE stores SET support_phone = phone WHERE id = ? AND support_phone = ''").run(demoId);
  seedStore(demoId);
}

seedMaster();

export function findUserByEmail(email) {
  return master.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function getStore(id) {
  return mapStore(master.prepare('SELECT * FROM stores WHERE id = ?').get(id));
}

export function getStoreBySlug(slug) {
  return mapStore(master.prepare('SELECT * FROM stores WHERE slug = ?').get(slug));
}

export function updateStoreSettings(id, input) {
  master.prepare(`UPDATE stores
    SET minimum_order = ?, delivery_fee = ?, free_delivery_above = ?, support_phone = ?, cancellation_window_minutes = ?, is_open = ?
    WHERE id = ?`)
    .run(input.minimumOrder, input.deliveryFee, input.freeDeliveryAbove, input.supportPhone, input.cancellationWindowMinutes, input.open ? 1 : 0, id);
  return getStore(id);
}

export function listStores() {
  return master.prepare('SELECT * FROM stores ORDER BY created_at DESC').all().map(mapStore);
}

export function createStore(input) {
  const id = `store_${crypto.randomUUID().slice(0, 8)}`;
  master.prepare(`INSERT INTO stores
    (id, slug, name, owner, email, phone, city, state, status, plan, monthly_price, minimum_order, delivery_fee, free_delivery_above, support_phone, cancellation_window_minutes, brand_primary, brand_accent, brand_background, is_open, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TRIAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
    .run(id, input.slug, input.name, input.owner, input.email, input.phone, input.city, input.state, input.plan, input.monthlyPrice, input.minimumOrder, input.deliveryFee, input.freeDeliveryAbove || 0, input.supportPhone || input.phone, input.cancellationWindowMinutes || 5, input.brandColors.primary, input.brandColors.accent, input.brandColors.background, isoNow());
  master.prepare(`INSERT INTO subscriptions
    (id, store_id, plan, status, amount, billing_method, next_due_date, created_at)
    VALUES (?, ?, ?, 'TRIAL', ?, ?, ?, ?)`)
    .run(`sub_${crypto.randomUUID().slice(0, 8)}`, id, input.plan, input.monthlyPrice, input.billingMethod, nextDueDate(), isoNow());
  const credentials = hashPassword(input.password);
  master.prepare(`INSERT INTO users (id, store_id, role, name, email, password_hash, password_salt, created_at)
    VALUES (?, ?, 'STORE_MANAGER', ?, ?, ?, ?, ?)`)
    .run(`user_${crypto.randomUUID().slice(0, 8)}`, id, input.owner, input.email, credentials.hash, credentials.salt, isoNow());
  initializeStoreDatabase(id);
  return getStore(id);
}

export function updateStoreStatus(id, status) {
  master.prepare('UPDATE stores SET status = ? WHERE id = ?').run(status, id);
  master.prepare('UPDATE subscriptions SET status = ? WHERE store_id = ?').run(status, id);
  return getStore(id);
}

export function updateStoreBranding(id, brandColors) {
  master.prepare('UPDATE stores SET brand_primary = ?, brand_accent = ?, brand_background = ? WHERE id = ?')
    .run(brandColors.primary, brandColors.accent, brandColors.background, id);
  return getStore(id);
}

export function listSubscriptions() {
  return master.prepare(`SELECT subscriptions.*, stores.name AS store_name
    FROM subscriptions JOIN stores ON stores.id = subscriptions.store_id
    ORDER BY subscriptions.created_at DESC`).all().map(row => ({
      id: row.id,
      storeId: row.store_id,
      storeName: row.store_name,
      plan: row.plan,
      status: row.status,
      amount: row.amount,
      billingMethod: row.billing_method,
      nextDueDate: row.next_due_date,
      externalId: row.external_id
    }));
}

export function getStoreDb(storeId) {
  if (!getStore(storeId)) return null;
  return initializeStoreDatabase(storeId);
}

export function mapProduct(row) {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    category: row.category,
    price: row.price,
    oldPrice: row.old_price,
    stock: row.stock,
    unit: row.unit,
    image: row.image,
    promo: Boolean(row.promo),
    active: Boolean(row.active),
    updatedAt: row.updated_at
  };
}

function mapBanner(row) {
  return {
    id: row.id,
    eyebrow: row.eyebrow,
    title: row.title,
    subtitle: row.subtitle,
    image: row.image,
    active: Boolean(row.active),
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listBanners(storeId, includeInactive = false) {
  const db = getStoreDb(storeId);
  const where = includeInactive ? '' : 'WHERE active = 1';
  return db.prepare(`SELECT * FROM banners ${where} ORDER BY position, created_at`).all().map(mapBanner);
}

export function createBanner(storeId, input) {
  const db = getStoreDb(storeId);
  const id = `banner_${crypto.randomUUID().slice(0, 10)}`;
  const now = isoNow();
  db.prepare(`INSERT INTO banners (id, eyebrow, title, subtitle, image, active, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.eyebrow, input.title, input.subtitle, input.image, input.active ? 1 : 0, input.position, now, now);
  return mapBanner(db.prepare('SELECT * FROM banners WHERE id = ?').get(id));
}

export function updateBanner(storeId, id, input) {
  const db = getStoreDb(storeId);
  const existing = db.prepare('SELECT id FROM banners WHERE id = ?').get(id);
  if (!existing) return null;
  db.prepare(`UPDATE banners SET eyebrow = ?, title = ?, subtitle = ?, image = ?, active = ?, position = ?, updated_at = ? WHERE id = ?`)
    .run(input.eyebrow, input.title, input.subtitle, input.image, input.active ? 1 : 0, input.position, isoNow(), id);
  return mapBanner(db.prepare('SELECT * FROM banners WHERE id = ?').get(id));
}

export function deleteBanner(storeId, id) {
  const db = getStoreDb(storeId);
  return db.prepare('DELETE FROM banners WHERE id = ?').run(id).changes > 0;
}

function mapPushCampaign(row) {
  return { id: row.id, title: row.title, body: row.body, audience: row.audience, status: row.status, scheduledAt: row.scheduled_at, sentAt: row.sent_at, successCount: row.success_count || 0, failureCount: row.failure_count || 0, sendError: row.send_error, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function listPushCampaigns(storeId) {
  const db = getStoreDb(storeId);
  return db.prepare('SELECT * FROM push_campaigns ORDER BY created_at DESC').all().map(mapPushCampaign);
}

export function listPendingPushCampaigns(storeId, now = new Date()) {
  return getStoreDb(storeId).prepare("SELECT * FROM push_campaigns WHERE status = 'SCHEDULED' AND scheduled_at <= ? ORDER BY scheduled_at").all(now.toISOString()).map(mapPushCampaign);
}

export function createPushCampaign(storeId, input) {
  const db = getStoreDb(storeId);
  const id = `push_${crypto.randomUUID().slice(0, 10)}`;
  const now = isoNow();
  db.prepare(`INSERT INTO push_campaigns (id, title, body, audience, status, scheduled_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.title, input.body, input.audience, input.status, input.scheduledAt || null, now, now);
  return mapPushCampaign(db.prepare('SELECT * FROM push_campaigns WHERE id = ?').get(id));
}

export function updatePushCampaign(storeId, id, input) {
  const db = getStoreDb(storeId);
  if (!db.prepare('SELECT id FROM push_campaigns WHERE id = ?').get(id)) return null;
  db.prepare(`UPDATE push_campaigns SET title = ?, body = ?, audience = ?, status = ?, scheduled_at = ?, updated_at = ? WHERE id = ?`)
    .run(input.title, input.body, input.audience, input.status, input.scheduledAt || null, isoNow(), id);
  return mapPushCampaign(db.prepare('SELECT * FROM push_campaigns WHERE id = ?').get(id));
}

export function deletePushCampaign(storeId, id) {
  return getStoreDb(storeId).prepare('DELETE FROM push_campaigns WHERE id = ?').run(id).changes > 0;
}

export function getPushCampaign(storeId, id) {
  const row = getStoreDb(storeId).prepare('SELECT * FROM push_campaigns WHERE id = ?').get(id);
  return row ? mapPushCampaign(row) : null;
}

export function markPushCampaignResult(storeId, id, result) {
  const status = result.failureCount === 0 ? 'SENT' : result.successCount > 0 ? 'PARTIAL' : 'FAILED';
  const now = isoNow();
  const db = getStoreDb(storeId);
  db.prepare(`UPDATE push_campaigns SET status = ?, sent_at = ?, success_count = ?, failure_count = ?, send_error = ?, updated_at = ? WHERE id = ?`)
    .run(status, now, result.successCount, result.failureCount, result.error || null, now, id);
  if (result.invalidTokens?.length) {
    const deactivate = db.prepare('UPDATE push_devices SET active = 0 WHERE token = ?');
    for (const token of result.invalidTokens) deactivate.run(token);
  }
  return getPushCampaign(storeId, id);
}

export function registerPushDevice(storeId, input) {
  const db = getStoreDb(storeId);
  const now = isoNow();
  db.prepare(`INSERT INTO push_devices (token, platform, customer_phone, active, created_at, last_seen_at)
    VALUES (?, 'ANDROID', ?, 1, ?, ?)
    ON CONFLICT(token) DO UPDATE SET customer_phone = excluded.customer_phone, active = 1, last_seen_at = excluded.last_seen_at`)
    .run(input.token, input.customerPhone || '', now, now);
  return { registered: true };
}

export function listActivePushDevices(storeId) {
  return getStoreDb(storeId).prepare('SELECT token, customer_phone FROM push_devices WHERE active = 1 ORDER BY last_seen_at DESC').all().map(row => ({ token: row.token, customerPhone: row.customer_phone }));
}

function automationNextRun(input, from = new Date()) {
  const [hours, minutes] = String(input.sendTime || '10:00').split(':').map(Number);
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hours, minutes, 0, 0);

  if (input.triggerType === 'WEEKLY') {
    const weekday = Number(input.weekday ?? 1);
    let daysAhead = (weekday - next.getDay() + 7) % 7;
    if (daysAhead === 0 && next <= from) daysAhead = 7;
    next.setDate(next.getDate() + daysAhead);
  } else if (next <= from) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

function mapPushAutomation(row) {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    body: row.body,
    triggerType: row.trigger_type,
    audience: row.audience,
    sendTime: row.send_time,
    weekday: row.weekday,
    inactiveDays: row.inactive_days,
    active: Boolean(row.active),
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listPushAutomations(storeId) {
  return getStoreDb(storeId).prepare('SELECT * FROM push_automations ORDER BY active DESC, created_at DESC').all().map(mapPushAutomation);
}

export function createPushAutomation(storeId, input) {
  const db = getStoreDb(storeId);
  const id = `automation_${crypto.randomUUID().slice(0, 10)}`;
  const now = isoNow();
  const nextRunAt = automationNextRun(input);
  db.prepare(`INSERT INTO push_automations
    (id, name, title, body, trigger_type, audience, send_time, weekday, inactive_days, active, next_run_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.name, input.title, input.body, input.triggerType, input.audience, input.sendTime, input.weekday, input.inactiveDays, input.active ? 1 : 0, nextRunAt, now, now);
  return mapPushAutomation(db.prepare('SELECT * FROM push_automations WHERE id = ?').get(id));
}

export function updatePushAutomation(storeId, id, input) {
  const db = getStoreDb(storeId);
  if (!db.prepare('SELECT id FROM push_automations WHERE id = ?').get(id)) return null;
  const nextRunAt = automationNextRun(input);
  db.prepare(`UPDATE push_automations SET
    name = ?, title = ?, body = ?, trigger_type = ?, audience = ?, send_time = ?, weekday = ?, inactive_days = ?, active = ?, next_run_at = ?, updated_at = ?
    WHERE id = ?`)
    .run(input.name, input.title, input.body, input.triggerType, input.audience, input.sendTime, input.weekday, input.inactiveDays, input.active ? 1 : 0, nextRunAt, isoNow(), id);
  return mapPushAutomation(db.prepare('SELECT * FROM push_automations WHERE id = ?').get(id));
}

export function deletePushAutomation(storeId, id) {
  return getStoreDb(storeId).prepare('DELETE FROM push_automations WHERE id = ?').run(id).changes > 0;
}

export function runDuePushAutomations(storeId, now = new Date()) {
  const db = getStoreDb(storeId);
  const due = db.prepare('SELECT * FROM push_automations WHERE active = 1 AND next_run_at <= ?').all(now.toISOString());
  db.exec('BEGIN');
  try {
    for (const automation of due) {
      const campaignId = `push_${crypto.randomUUID().slice(0, 10)}`;
      const timestamp = now.toISOString();
      db.prepare(`INSERT INTO push_campaigns (id, title, body, audience, status, scheduled_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'SCHEDULED', ?, ?, ?)`)
        .run(campaignId, automation.title, automation.body, automation.audience, timestamp, timestamp, timestamp);
      const nextRunAt = automationNextRun({
        triggerType: automation.trigger_type,
        sendTime: automation.send_time,
        weekday: automation.weekday
      }, new Date(now.getTime() + 60_000));
      db.prepare('UPDATE push_automations SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?')
        .run(timestamp, nextRunAt, timestamp, automation.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return due.length;
}

export function runPushAutomationNow(storeId, id) {
  const db = getStoreDb(storeId);
  const automation = db.prepare('SELECT * FROM push_automations WHERE id = ?').get(id);
  if (!automation) return null;
  const now = new Date();
  const timestamp = now.toISOString();
  const campaignId = `push_${crypto.randomUUID().slice(0, 10)}`;
  const nextRunAt = automationNextRun({
    triggerType: automation.trigger_type,
    sendTime: automation.send_time,
    weekday: automation.weekday
  }, new Date(now.getTime() + 60_000));
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO push_campaigns (id, title, body, audience, status, scheduled_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'SCHEDULED', ?, ?, ?)`)
      .run(campaignId, automation.title, automation.body, automation.audience, timestamp, timestamp, timestamp);
    db.prepare('UPDATE push_automations SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?')
      .run(timestamp, nextRunAt, timestamp, id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return mapPushAutomation(db.prepare('SELECT * FROM push_automations WHERE id = ?').get(id));
}

export function listProducts(storeId, filters = {}) {
  const db = getStoreDb(storeId);
  if (!db) return [];
  const terms = ['active = 1'];
  const values = [];
  if (filters.category && filters.category !== 'Todos') {
    terms.push('category = ?');
    values.push(filters.category);
  }
  if (filters.q) {
    terms.push('(lower(name) LIKE ? OR lower(sku) LIKE ? OR barcode LIKE ? OR lower(category) LIKE ?)');
    const query = `%${filters.q.toLowerCase()}%`;
    values.push(query, query, query, query);
  }
  return db.prepare(`SELECT * FROM products WHERE ${terms.join(' AND ')} ORDER BY promo DESC, CASE WHEN image != '' THEN 0 ELSE 1 END, name`).all(...values).map(mapProduct);
}

export function upsertProducts(storeId, items) {
  const db = getStoreDb(storeId);
  let created = 0;
  let updated = 0;
  const existing = db.prepare('SELECT id FROM products WHERE sku = ?');
  const update = db.prepare(`UPDATE products SET barcode=?, name=?, category=?, price=?, old_price=?, stock=?, unit=?, image=?, promo=?, active=?, updated_at=? WHERE sku=?`);
  const insert = db.prepare(`INSERT INTO products (id, sku, barcode, name, category, price, old_price, stock, unit, image, promo, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.exec('BEGIN');
  try {
    for (const item of items) {
      if (existing.get(item.sku)) {
        update.run(item.barcode, item.name, item.category, item.price, item.oldPrice, item.stock, item.unit, item.image, item.promo ? 1 : 0, item.active === false ? 0 : 1, isoNow(), item.sku);
        updated += 1;
      } else {
        insert.run(item.barcode || item.sku, item.sku, item.barcode, item.name, item.category, item.price, item.oldPrice, item.stock, item.unit, item.image, item.promo ? 1 : 0, item.active === false ? 0 : 1, isoNow());
        created += 1;
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { created, updated, total: db.prepare('SELECT COUNT(*) AS total FROM products').get().total };
}

function formattedAddress(row) {
  if (row.customer_street) {
    const line = `${row.customer_street}, ${row.customer_number}`;
    const complement = row.customer_complement ? ` - ${row.customer_complement}` : '';
    const district = row.customer_neighborhood ? `, ${row.customer_neighborhood}` : '';
    const city = row.customer_city ? ` - ${row.customer_city}/${row.customer_state}` : '';
    return `${line}${complement}${district}${city}`;
  }
  return row.customer_address || '';
}

function hydrateOrder(db, row) {
  return {
    id: row.id,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      address: formattedAddress(row),
      cep: row.customer_cep || '',
      street: row.customer_street || '',
      number: row.customer_number || '',
      complement: row.customer_complement || '',
      neighborhood: row.customer_neighborhood || '',
      city: row.customer_city || '',
      state: row.customer_state || '',
      reference: row.customer_reference || ''
    },
    fulfillmentType: row.fulfillment_type,
    paymentMethod: row.payment_method,
    changeFor: row.change_for,
    notes: row.notes,
    scheduledTo: row.scheduled_to,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    total: row.total,
    status: row.status,
    cancelledBy: row.cancelled_by || null,
    cancelledAt: row.cancelled_at || null,
    cancelReason: row.cancel_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: db.prepare('SELECT product_id AS productId, name, unit, quantity, price, total FROM order_items WHERE order_id = ?').all(row.id)
  };
}

function customerOrderView(store, db, row) {
  const order = hydrateOrder(db, row);
  const windowEndsAt = new Date(new Date(row.created_at).getTime() + store.cancellationWindowMinutes * 60_000).toISOString();
  const statusAllowsCancellation = row.status === 'RECEIVED';
  const insideWindow = Date.now() <= new Date(windowEndsAt).getTime();
  const eligible = statusAllowsCancellation && insideWindow;
  order.cancellation = {
    eligible,
    windowEndsAt,
    supportPhone: store.supportPhone,
    message: eligible
      ? `Voce pode cancelar ate ${new Date(windowEndsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
      : statusAllowsCancellation
        ? 'O prazo de cancelamento pelo aplicativo terminou. Ligue para a central da loja.'
        : 'O pedido ja entrou em atendimento. Para cancelar, ligue para a central da loja.'
  };
  return order;
}

export function getTrackedOrder(storeId, orderId, trackingToken) {
  const db = getStoreDb(storeId);
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND tracking_token = ?').get(orderId, trackingToken);
  const store = getStore(storeId);
  return row && store ? customerOrderView(store, db, row) : null;
}

export function listOrders(storeId, filters = {}) {
  const db = getStoreDb(storeId);
  const clauses = [];
  const values = [];
  if (filters.status) { clauses.push('status = ?'); values.push(filters.status); }
  if (filters.fulfillmentType) { clauses.push('fulfillment_type = ?'); values.push(filters.fulfillmentType); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT 250`).all(...values).map(row => hydrateOrder(db, row));
}

export function createOrder(store, input) {
  const db = getStoreDb(store.id);
  const productStatement = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1');
  const items = input.items.map(item => {
    const product = productStatement.get(item.productId);
    if (!product) throw Object.assign(new Error(`Produto nao encontrado: ${item.productId}`), { status: 400 });
    if (item.quantity > product.stock) throw Object.assign(new Error(`Estoque insuficiente para ${product.name}`), { status: 409 });
    return { product, quantity: item.quantity, total: Number((item.quantity * product.price).toFixed(2)) };
  });
  const subtotal = Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2));
  if (subtotal < store.minimumOrder) throw Object.assign(new Error(`Pedido minimo de R$ ${store.minimumOrder.toFixed(2)}`), { status: 400 });
  const deliveryFee = input.fulfillmentType === 'DELIVERY' && !(store.freeDeliveryAbove > 0 && subtotal >= store.freeDeliveryAbove) ? store.deliveryFee : 0;
  const id = `AM${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
  const trackingToken = crypto.randomBytes(24).toString('base64url');
  const now = isoNow();
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO orders
      (id, tracking_token, customer_name, customer_phone, customer_address, customer_cep, customer_street, customer_number, customer_complement, customer_neighborhood, customer_city, customer_state, customer_reference, fulfillment_type, payment_method, change_for, notes, scheduled_to, subtotal, delivery_fee, total, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?)`)
      .run(id, trackingToken, input.customer.name, input.customer.phone, input.customer.address, input.customer.cep, input.customer.street, input.customer.number, input.customer.complement, input.customer.neighborhood, input.customer.city, input.customer.state, input.customer.reference, input.fulfillmentType, input.paymentMethod, input.changeFor, input.notes, input.scheduledTo, subtotal, deliveryFee, subtotal + deliveryFee, now, now);
    const addItem = db.prepare(`INSERT INTO order_items (order_id, product_id, name, unit, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const removeStock = db.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?');
    for (const item of items) {
      addItem.run(id, item.product.id, item.product.name, item.product.unit, item.quantity, item.product.price, item.total);
      removeStock.run(item.quantity, now, item.product.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { ...customerOrderView(store, db, db.prepare('SELECT * FROM orders WHERE id = ?').get(id)), trackingToken };
}

export function cancelOrderByCustomer(storeId, orderId, trackingToken) {
  const db = getStoreDb(storeId);
  const store = getStore(storeId);
  const current = db.prepare('SELECT * FROM orders WHERE id = ? AND tracking_token = ?').get(orderId, trackingToken);
  if (!current || !store) return null;
  const windowEndsAt = new Date(new Date(current.created_at).getTime() + store.cancellationWindowMinutes * 60_000);
  if (current.status !== 'RECEIVED' || Date.now() > windowEndsAt.getTime()) {
    const error = new Error('O cancelamento pelo aplicativo nao esta mais disponivel. Ligue para a central da loja.');
    error.status = 409;
    error.details = { supportPhone: store.supportPhone, windowEndsAt: windowEndsAt.toISOString() };
    throw error;
  }
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE orders SET status = 'CANCELLED', cancelled_by = 'CUSTOMER', cancelled_at = ?, cancel_reason = 'Cancelado pelo cliente no aplicativo', updated_at = ? WHERE id = ?`)
      .run(isoNow(), isoNow(), orderId);
    const restoreStock = db.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?');
    for (const item of db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId)) restoreStock.run(item.quantity, isoNow(), item.product_id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return customerOrderView(store, db, db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId));
}

const statusTransitions = {
  RECEIVED: ['PICKING', 'CANCELLED'],
  PICKING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DONE', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: []
};

export function updateOrderStatus(storeId, orderId, status) {
  const db = getStoreDb(storeId);
  const current = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!current) return null;
  if (!statusTransitions[current.status]?.includes(status)) {
    const error = new Error(`Transicao invalida: ${current.status} para ${status}`);
    error.status = 409;
    throw error;
  }
  db.exec('BEGIN');
  try {
    if (status === 'CANCELLED') {
      db.prepare(`UPDATE orders SET status = ?, cancelled_by = 'STORE_MANAGER', cancelled_at = ?, cancel_reason = 'Cancelado pela loja', updated_at = ? WHERE id = ?`)
        .run(status, isoNow(), isoNow(), orderId);
      const restoreStock = db.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?');
      for (const item of db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId)) restoreStock.run(item.quantity, isoNow(), item.product_id);
    } else {
      db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, isoNow(), orderId);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return hydrateOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId));
}

export function dashboardSummary(storeId) {
  const db = getStoreDb(storeId);
  const statuses = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS total FROM orders GROUP BY status').all().map(row => [row.status, row.total]));
  const sales = db.prepare("SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS orders FROM orders WHERE status != 'CANCELLED' AND date(created_at) = date('now')").get();
  const lowStock = db.prepare('SELECT COUNT(*) AS total FROM products WHERE active = 1 AND stock <= 5').get().total;
  return { statuses, salesToday: sales.total, ordersToday: sales.orders, lowStock, products: db.prepare('SELECT COUNT(*) AS total FROM products WHERE active = 1').get().total };
}

export function listCustomers(storeId, query = '') {
  const db = getStoreDb(storeId);
  const normalized = `%${String(query).toLowerCase()}%`;
  const rows = db.prepare(`SELECT
      customer_phone AS phone,
      MAX(customer_name) AS name,
      COUNT(*) AS orders,
      COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total ELSE 0 END), 0) AS total_spent,
      MAX(created_at) AS last_order_at
    FROM orders
    WHERE lower(customer_name) LIKE ? OR customer_phone LIKE ?
    GROUP BY customer_phone
    ORDER BY last_order_at DESC
    LIMIT 300`).all(normalized, normalized);
  const latestOrder = db.prepare('SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 1');
  return rows.map(row => {
    const latest = latestOrder.get(row.phone);
    return {
      name: row.name,
      phone: row.phone,
      orders: row.orders,
      totalSpent: row.total_spent,
      lastOrderAt: row.last_order_at,
      lastOrderStatus: latest?.status || null,
      address: latest ? formattedAddress(latest) : '',
      cep: latest?.customer_cep || '',
      neighborhood: latest?.customer_neighborhood || '',
      city: latest?.customer_city || ''
    };
  });
}

export function storeReports(storeId) {
  const db = getStoreDb(storeId);
  const today = db.prepare(`SELECT
      COUNT(*) AS orders,
      COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total ELSE 0 END), 0) AS revenue,
      COALESCE(AVG(CASE WHEN status != 'CANCELLED' THEN total END), 0) AS average_ticket,
      COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancellations
    FROM orders WHERE date(created_at) = date('now')`).get();
  const dailyStatement = db.prepare(`SELECT
      COUNT(*) AS orders,
      COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN total ELSE 0 END), 0) AS revenue
    FROM orders WHERE date(created_at) = ?`);
  const days = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    const values = dailyStatement.get(key);
    days.push({ date: key, label: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), orders: values.orders, revenue: values.revenue });
  }
  const statuses = db.prepare('SELECT status, COUNT(*) AS total FROM orders GROUP BY status').all();
  const hours = db.prepare(`SELECT strftime('%H', created_at) AS hour, COUNT(*) AS total FROM orders GROUP BY hour ORDER BY hour`).all();
  return {
    today: { orders: today.orders, revenue: today.revenue, averageTicket: today.average_ticket, cancellations: today.cancellations },
    days,
    statuses: Object.fromEntries(statuses.map(row => [row.status, row.total])),
    busyHours: hours.map(row => ({ hour: row.hour, total: row.total })),
    topCustomers: listCustomers(storeId).slice(0, 5)
  };
}

export function adminOverview() {
  const stores = listStores();
  const subscriptions = listSubscriptions();
  const activeStatuses = new Set(['ACTIVE', 'TRIAL']);
  return {
    stores: stores.length,
    active: stores.filter(store => activeStatuses.has(store.status)).length,
    trials: stores.filter(store => store.status === 'TRIAL').length,
    blocked: stores.filter(store => store.status === 'BLOCKED').length,
    mrr: subscriptions.filter(item => activeStatuses.has(item.status)).reduce((sum, item) => sum + item.amount, 0),
    overdue: subscriptions.filter(item => item.status === 'OVERDUE').length
  };
}
