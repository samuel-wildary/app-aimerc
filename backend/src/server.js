import express from 'express';
import cors from 'cors';
import {
  adminOverview,
  createOrder,
  createStore,
  dashboardSummary,
  findUserByEmail,
  getStore,
  getStoreBySlug,
  listOrders,
  listProducts,
  listStores,
  listSubscriptions,
  updateOrderStatus,
  updateStoreStatus,
  upsertProducts
} from './lib/database.js';
import { createToken, requireAuth, verifyPassword } from './lib/auth.js';
import { ApiError, normalizeEmail, oneOf, optionalText, positiveNumber, requiredText, slugify } from './lib/validation.js';

const app = express();
const PORT = Number(process.env.PORT || 4100);
const localOrigins = new Set(['http://127.0.0.1:4201', 'http://localhost:4201', 'http://127.0.0.1:4202', 'http://localhost:4202']);
const allowedOrigins = new Set((process.env.AIMERC_ALLOWED_ORIGINS || '').split(',').filter(Boolean).concat([...localOrigins]));
const requestBuckets = new Map();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    callback(new ApiError(403, 'Origem nao autorizada'));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const key = `${req.ip}:${Math.floor(Date.now() / 60_000)}`;
  const count = (requestBuckets.get(key) || 0) + 1;
  requestBuckets.set(key, count);
  if (requestBuckets.size > 2_000) requestBuckets.clear();
  if (count > 300) return res.status(429).json({ error: 'Muitas requisicoes. Tente novamente em instantes.' });
  next();
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function publicStore(req) {
  const store = getStoreBySlug(req.params.slug);
  if (!store) throw new ApiError(404, 'Supermercado nao encontrado');
  if (!['TRIAL', 'ACTIVE'].includes(store.status)) throw new ApiError(403, 'Supermercado temporariamente indisponivel');
  return store;
}

function managerStore(req) {
  const store = getStore(req.user.storeId);
  if (!store) throw new ApiError(404, 'Supermercado nao encontrado');
  return store;
}

function normalizeProduct(item) {
  return {
    sku: requiredText(item.sku, 'SKU', 80),
    barcode: optionalText(item.barcode, 80),
    name: requiredText(item.name, 'Nome do produto'),
    category: requiredText(item.category, 'Categoria', 100),
    price: positiveNumber(item.price, 'Preco'),
    oldPrice: item.oldPrice == null || item.oldPrice === '' ? null : positiveNumber(item.oldPrice, 'Preco anterior'),
    stock: positiveNumber(item.stock, 'Estoque', { min: 0 }),
    unit: oneOf(item.unit || 'UN', ['UN', 'KG', 'L', 'CX', 'PCT'], 'Unidade'),
    image: optionalText(item.image, 1_500),
    promo: Boolean(item.promo),
    active: item.active !== false
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'AiMerc Backend', version: '1.0.0', persistence: 'sqlite', port: PORT });
});

app.post('/api/auth/login', asyncRoute((req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = requiredText(req.body.password, 'Senha', 200);
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) throw new ApiError(401, 'E-mail ou senha invalidos');
  const store = user.store_id ? getStore(user.store_id) : null;
  if (store && !['TRIAL', 'ACTIVE'].includes(store.status)) throw new ApiError(403, 'Conta do supermercado bloqueada');
  res.json({
    token: createToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role, storeId: user.store_id },
    store
  });
}));

app.get('/api/public/stores/:slug/catalog', asyncRoute((req, res) => {
  const store = publicStore(req);
  const products = listProducts(store.id, { q: req.query.q, category: req.query.category });
  const categories = [...new Set(products.map(product => product.category))];
  res.json({
    store,
    categories,
    banners: [
      { id: 'fresh', eyebrow: 'Feira da semana', title: 'Frescor que cabe no carrinho', subtitle: 'Hortifruti selecionado e entrega no mesmo dia.' },
      { id: 'pantry', eyebrow: 'Despensa completa', title: 'Economize nos essenciais', subtitle: 'Ofertas para abastecer a casa toda.' }
    ],
    promotions: products.filter(product => product.promo),
    shelves: categories.slice(0, 4).map(category => ({ id: category.toLowerCase(), title: category, products: products.filter(product => product.category === category).slice(0, 12) }))
  });
}));

app.get('/api/public/stores/:slug/products', asyncRoute((req, res) => {
  const store = publicStore(req);
  res.json(listProducts(store.id, { q: req.query.q, category: req.query.category }));
}));

app.post('/api/public/stores/:slug/orders', asyncRoute((req, res) => {
  const store = publicStore(req);
  if (!store.open) throw new ApiError(409, 'Supermercado fechado no momento');
  const fulfillmentType = oneOf(req.body.fulfillmentType, ['DELIVERY', 'PICKUP'], 'Tipo de recebimento');
  const customer = {
    name: requiredText(req.body.customer?.name, 'Nome do cliente'),
    phone: requiredText(req.body.customer?.phone, 'Telefone', 30),
    address: fulfillmentType === 'DELIVERY' ? requiredText(req.body.customer?.address, 'Endereco', 300) : optionalText(req.body.customer?.address, 300)
  };
  if (!Array.isArray(req.body.items) || req.body.items.length === 0 || req.body.items.length > 100) throw new ApiError(400, 'Carrinho vazio ou invalido');
  const items = req.body.items.map(item => ({
    productId: requiredText(item.productId, 'Produto', 100),
    quantity: positiveNumber(item.quantity, 'Quantidade', { min: 0.01, max: 1_000 })
  }));
  const order = createOrder(store, {
    customer,
    fulfillmentType,
    paymentMethod: oneOf(req.body.paymentMethod, ['CASH', 'CARD_ON_DELIVERY'], 'Pagamento'),
    changeFor: req.body.changeFor ? positiveNumber(req.body.changeFor, 'Troco') : null,
    notes: optionalText(req.body.notes, 500),
    scheduledTo: req.body.scheduledTo || null,
    items
  });
  res.status(201).json(order);
}));

app.get('/api/dashboard/summary', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  res.json({
    store: managerStore(req),
    user: { id: req.user.sub, name: req.user.name, email: req.user.email, role: req.user.role },
    ...dashboardSummary(req.user.storeId)
  });
}));

app.get('/api/orders', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.json(listOrders(req.user.storeId, { status: req.query.status, fulfillmentType: req.query.fulfillmentType }));
}));

app.patch('/api/orders/:id/status', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  const status = oneOf(req.body.status, ['PICKING', 'READY', 'OUT_FOR_DELIVERY', 'DONE', 'CANCELLED'], 'Status');
  const order = updateOrderStatus(req.user.storeId, req.params.id, status);
  if (!order) throw new ApiError(404, 'Pedido nao encontrado');
  res.json(order);
}));

app.get('/api/products', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.json(listProducts(req.user.storeId, { q: req.query.q, category: req.query.category }));
}));

app.post('/api/sync/products', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  if (!Array.isArray(req.body.items) || req.body.items.length === 0 || req.body.items.length > 10_000) throw new ApiError(400, 'Lista de produtos invalida');
  const result = upsertProducts(req.user.storeId, req.body.items.map(normalizeProduct));
  res.json({ success: true, ...result, synchronizedAt: new Date().toISOString() });
}));

app.get('/api/admin/overview', requireAuth('PLATFORM_ADMIN'), (req, res) => {
  res.json(adminOverview());
});

app.get('/api/admin/stores', requireAuth('PLATFORM_ADMIN'), (req, res) => {
  res.json(listStores());
});

app.post('/api/admin/stores', requireAuth('PLATFORM_ADMIN'), asyncRoute((req, res) => {
  const name = requiredText(req.body.name, 'Nome do supermercado');
  const store = createStore({
    name,
    slug: slugify(req.body.slug || name),
    owner: requiredText(req.body.owner, 'Responsavel'),
    email: normalizeEmail(req.body.email),
    phone: optionalText(req.body.phone, 30),
    city: requiredText(req.body.city, 'Cidade', 100),
    state: requiredText(req.body.state, 'UF', 2).toUpperCase(),
    plan: oneOf(req.body.plan || 'PROFESSIONAL', ['STARTER', 'PROFESSIONAL', 'PREMIUM'], 'Plano'),
    monthlyPrice: positiveNumber(req.body.monthlyPrice, 'Mensalidade'),
    minimumOrder: positiveNumber(req.body.minimumOrder || 30, 'Pedido minimo'),
    deliveryFee: positiveNumber(req.body.deliveryFee ?? 6, 'Taxa de entrega', { min: 0 }),
    billingMethod: oneOf(req.body.billingMethod || 'PIX', ['PIX', 'BOLETO', 'CREDIT_CARD'], 'Cobranca'),
    password: requiredText(req.body.password, 'Senha inicial', 200)
  });
  res.status(201).json(store);
}));

app.patch('/api/admin/stores/:id/status', requireAuth('PLATFORM_ADMIN'), asyncRoute((req, res) => {
  const status = oneOf(req.body.status, ['TRIAL', 'ACTIVE', 'OVERDUE', 'BLOCKED', 'CANCELLED'], 'Status');
  const store = updateStoreStatus(req.params.id, status);
  if (!store) throw new ApiError(404, 'Supermercado nao encontrado');
  res.json(store);
}));

app.get('/api/admin/subscriptions', requireAuth('PLATFORM_ADMIN'), (req, res) => {
  res.json(listSubscriptions());
});

app.use((req, res) => res.status(404).json({ error: 'Rota nao encontrada' }));
app.use((error, req, res, next) => {
  const status = Number(error.status || 500);
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor' : error.message, details: error.details });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AiMerc backend running on http://127.0.0.1:${PORT}`);
  console.log('Demo dashboard: gestor@aimerc.local / Aimerc@2026');
  console.log('Demo SaaS Admin: admin@aimerc.local / Admin@2026');
});
