import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = path.join(rootDir, 'data');
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
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL DEFAULT '',
      fulfillment_type TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      change_for REAL,
      notes TEXT NOT NULL DEFAULT '',
      scheduled_to TEXT,
      subtotal REAL NOT NULL,
      delivery_fee REAL NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL,
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
  `);
  storeConnections.set(storeId, db);
  return db;
}

function seedStore(storeId) {
  const db = initializeStoreDatabase(storeId);
  const count = db.prepare('SELECT COUNT(*) AS total FROM products').get().total;
  if (count > 0) return;
  const products = [
    ['789100000001', 'CAF001', '789100000001', 'Cafe Tradicional 250g', 'Mercearia', 8.99, 10.49, 42, 'UN', 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=600&q=80', 1],
    ['789100000002', 'ARR001', '789100000002', 'Arroz Branco Tipo 1 5kg', 'Mercearia', 24.9, null, 21, 'UN', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80', 0],
    ['789100000003', 'BAN001', '789100000003', 'Banana Prata', 'Hortifruti', 5.49, null, 85.5, 'KG', 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?auto=format&fit=crop&w=600&q=80', 1],
    ['789100000004', 'CAR001', '789100000004', 'Carne Bovina Acem', 'Carnes', 29.9, null, 18.2, 'KG', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=600&q=80', 0],
    ['789100000005', 'AGU001', '789100000005', 'Agua Mineral 1.5L', 'Bebidas', 2.79, 3.29, 120, 'UN', 'https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=600&q=80', 1]
  ];
  const statement = db.prepare(`INSERT INTO products
    (id, sku, barcode, name, category, price, old_price, stock, unit, image, promo, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);
  for (const product of products) statement.run(...product, isoNow());
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
      (id, slug, name, owner, email, phone, city, state, status, plan, monthly_price, minimum_order, delivery_fee, is_open, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .run(demoId, 'aimerc-demo', 'Mercado Boa Compra', 'Marina Costa', 'gestor@aimerc.local', '(85) 99999-1010', 'Caucaia', 'CE', 'TRIAL', 'PROFESSIONAL', 497, 30, 6, isoNow());
    master.prepare(`INSERT INTO subscriptions
      (id, store_id, plan, status, amount, billing_method, next_due_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('sub_001', demoId, 'PROFESSIONAL', 'TRIAL', 497, 'PIX', nextDueDate(), isoNow());
  }
  ensureUser({ id: 'user_master_001', role: 'PLATFORM_ADMIN', name: 'Samuel Wildary', email: 'admin@aimerc.local', password: 'Admin@2026' });
  ensureUser({ id: 'user_store_001', storeId: demoId, role: 'STORE_MANAGER', name: 'Marina Costa', email: 'gestor@aimerc.local', password: 'Aimerc@2026' });
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

export function listStores() {
  return master.prepare('SELECT * FROM stores ORDER BY created_at DESC').all().map(mapStore);
}

export function createStore(input) {
  const id = `store_${crypto.randomUUID().slice(0, 8)}`;
  master.prepare(`INSERT INTO stores
    (id, slug, name, owner, email, phone, city, state, status, plan, monthly_price, minimum_order, delivery_fee, is_open, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TRIAL', ?, ?, ?, ?, 1, ?)`)
    .run(id, input.slug, input.name, input.owner, input.email, input.phone, input.city, input.state, input.plan, input.monthlyPrice, input.minimumOrder, input.deliveryFee, isoNow());
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
  return db.prepare(`SELECT * FROM products WHERE ${terms.join(' AND ')} ORDER BY promo DESC, name`).all(...values).map(mapProduct);
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

function hydrateOrder(db, row) {
  return {
    id: row.id,
    customer: { name: row.customer_name, phone: row.customer_phone, address: row.customer_address },
    fulfillmentType: row.fulfillment_type,
    paymentMethod: row.payment_method,
    changeFor: row.change_for,
    notes: row.notes,
    scheduledTo: row.scheduled_to,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    total: row.total,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: db.prepare('SELECT product_id AS productId, name, unit, quantity, price, total FROM order_items WHERE order_id = ?').all(row.id)
  };
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
  const deliveryFee = input.fulfillmentType === 'DELIVERY' ? store.deliveryFee : 0;
  const id = `AM${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
  const now = isoNow();
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO orders
      (id, customer_name, customer_phone, customer_address, fulfillment_type, payment_method, change_for, notes, scheduled_to, subtotal, delivery_fee, total, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?)`)
      .run(id, input.customer.name, input.customer.phone, input.customer.address, input.fulfillmentType, input.paymentMethod, input.changeFor, input.notes, input.scheduledTo, subtotal, deliveryFee, subtotal + deliveryFee, now, now);
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
  return hydrateOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
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
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, isoNow(), orderId);
  return hydrateOrder(db, db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId));
}

export function dashboardSummary(storeId) {
  const db = getStoreDb(storeId);
  const statuses = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS total FROM orders GROUP BY status').all().map(row => [row.status, row.total]));
  const sales = db.prepare("SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS orders FROM orders WHERE status != 'CANCELLED' AND date(created_at) = date('now')").get();
  const lowStock = db.prepare('SELECT COUNT(*) AS total FROM products WHERE active = 1 AND stock <= 5').get().total;
  return { statuses, salesToday: sales.total, ordersToday: sales.orders, lowStock, products: db.prepare('SELECT COUNT(*) AS total FROM products WHERE active = 1').get().total };
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
