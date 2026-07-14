import express from 'express';
import cors from 'cors';
import {
  adminOverview,
  createBanner,
  createOrder,
  createPushCampaign,
  createPushAutomation,
  cancelOrderByCustomer,
  createStore,
  dashboardSummary,
  deleteBanner,
  deletePushCampaign,
  deletePushAutomation,
  findUserByEmail,
  getTrackedOrder,
  getProduct,
  getPushCampaign,
  getStore,
  getStoreBySlug,
  listBanners,
  listCustomers,
  listOrders,
  listProducts,
  listActivePushDevices,
  listPendingPushCampaigns,
  listPushCampaigns,
  listPushAutomations,
  listStores,
  listSubscriptions,
  storeReports,
  runDuePushAutomations,
  runPushAutomationNow,
  registerPushDevice,
  markPushCampaignResult,
  updateOrderStatus,
  updatePushCampaign,
  updatePushAutomation,
  updateBanner,
  updateStoreSettings,
  updateStoreStatus,
  updateStoreBranding,
  upsertProducts
} from './lib/database.js';
import { firebaseStatus, sendFirebaseNotification } from './lib/firebase.js';
import { productImage } from './lib/product-images.js';
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

function publicApiBase(req) {
  const configured = String(process.env.AIMERC_PUBLIC_API_URL || '').replace(/\/$/, '');
  if (configured) return configured;
  const forwardedProtocol = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host).split(',')[0].trim();
  return `${forwardedProtocol}://${forwardedHost}/api`;
}

function publicProduct(req, store, product) {
  if (!product.image) return product;
  const version = encodeURIComponent(product.updatedAt || '1');
  return {
    ...product,
    image: `${publicApiBase(req)}/public/stores/${encodeURIComponent(store.slug)}/products/${encodeURIComponent(product.id)}/image?v=${version}`
  };
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

function normalizeBanner(item) {
  return {
    eyebrow: optionalText(item.eyebrow, 80),
    title: requiredText(item.title, 'Titulo do banner', 120),
    subtitle: optionalText(item.subtitle, 220),
    image: optionalText(item.image, 1_500),
    active: item.active !== false,
    position: Math.max(0, Math.min(99, Number(item.position) || 0))
  };
}

function normalizeBrandColor(value, fallback) {
  const color = String(value || fallback).trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new ApiError(400, 'Cor da marca deve usar o formato hexadecimal #RRGGBB');
  return color;
}

function normalizePushCampaign(item) {
  return {
    title: requiredText(item.title, 'Titulo da campanha', 80),
    body: requiredText(item.body, 'Mensagem da campanha', 180),
    audience: oneOf(item.audience || 'ALL_CUSTOMERS', ['ALL_CUSTOMERS', 'RECENT_CUSTOMERS', 'INACTIVE_CUSTOMERS'], 'Publico'),
    status: oneOf(item.status || 'DRAFT', ['DRAFT', 'SCHEDULED'], 'Status da campanha'),
    scheduledAt: item.scheduledAt || null
  };
}

function normalizePushAutomation(item) {
  const triggerType = oneOf(item.triggerType || 'DAILY', ['DAILY', 'WEEKLY', 'INACTIVE_CUSTOMERS'], 'Tipo de automacao');
  const sendTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(item.sendTime || '')) ? item.sendTime : '10:00';
  return {
    name: requiredText(item.name, 'Nome da automacao', 80),
    title: requiredText(item.title, 'Titulo da notificacao', 80),
    body: requiredText(item.body, 'Mensagem da notificacao', 180),
    triggerType,
    audience: triggerType === 'INACTIVE_CUSTOMERS'
      ? 'INACTIVE_CUSTOMERS'
      : oneOf(item.audience || 'ALL_CUSTOMERS', ['ALL_CUSTOMERS', 'RECENT_CUSTOMERS', 'INACTIVE_CUSTOMERS'], 'Publico'),
    sendTime,
    weekday: triggerType === 'WEEKLY' ? Math.max(0, Math.min(6, Number(item.weekday) || 0)) : null,
    inactiveDays: triggerType === 'INACTIVE_CUSTOMERS' ? Math.max(1, Math.min(365, Number(item.inactiveDays) || 30)) : null,
    active: item.active !== false
  };
}

function normalizeCep(value) {
  const cep = String(value || '').replace(/\D/g, '');
  if (cep.length !== 8) throw new ApiError(400, 'CEP deve ter 8 digitos');
  return cep;
}

function normalizeCustomer(input, fulfillmentType) {
  const name = requiredText(input?.name, 'Nome completo');
  const phone = requiredText(input?.phone, 'Telefone', 30);
  if (fulfillmentType === 'PICKUP') {
    return { name, phone, address: '', cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', reference: '' };
  }
  const cep = normalizeCep(input?.cep);
  const street = requiredText(input?.street, 'Rua ou avenida', 180);
  const number = requiredText(input?.number, 'Numero da casa', 30);
  const neighborhood = requiredText(input?.neighborhood, 'Bairro', 100);
  const city = requiredText(input?.city, 'Cidade', 100);
  const state = requiredText(input?.state, 'UF', 2).toUpperCase();
  const complement = optionalText(input?.complement, 120);
  const reference = optionalText(input?.reference, 160);
  const address = `${street}, ${number}${complement ? ` - ${complement}` : ''}, ${neighborhood} - ${city}/${state}`;
  return { name, phone, address, cep, street, number, complement, neighborhood, city, state, reference };
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
  const products = listProducts(store.id, { q: req.query.q, category: req.query.category }).map(product => publicProduct(req, store, product));
  const categories = [...new Set(products.map(product => product.category))];
  const categoryPriority = ['Mercearia', 'Bebidas', 'Hortifruti', 'Laticinios', 'Frios e Embutidos', 'Padaria', 'Frigorifico', 'Peixaria', 'Congelados', 'Biscoitos', 'Doces e Snacks', 'Limpeza', 'Higiene e Beleza', 'Casa e Bazar'];
  categories.sort((left, right) => {
    const leftIndex = categoryPriority.indexOf(left);
    const rightIndex = categoryPriority.indexOf(right);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) || left.localeCompare(right, 'pt-BR');
  });
  res.json({
    store,
    categories,
    banners: listBanners(store.id),
    promotions: products.filter(product => product.promo),
    shelves: categories.slice(0, 4).map(category => ({ id: category.toLowerCase(), title: category, products: products.filter(product => product.category === category).slice(0, 12) }))
  });
}));

app.get('/api/public/stores/:slug/products', asyncRoute((req, res) => {
  const store = publicStore(req);
  res.json(listProducts(store.id, { q: req.query.q, category: req.query.category }).map(product => publicProduct(req, store, product)));
}));

app.get('/api/public/stores/:slug/products/:productId/image', asyncRoute(async (req, res) => {
  const store = publicStore(req);
  const product = getProduct(store.id, req.params.productId);
  if (!product?.image) throw new ApiError(404, 'Imagem do produto nao encontrada');
  try {
    const image = await productImage(store.id, product);
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.send(image.data);
  } catch (error) {
    console.error(`Falha ao carregar imagem ${product.barcode || product.id}:`, error.message);
    throw new ApiError(502, 'Imagem temporariamente indisponivel');
  }
}));

app.post('/api/public/stores/:slug/push/devices', asyncRoute((req, res) => {
  const store = publicStore(req);
  const token = requiredText(req.body.token, 'Token do dispositivo', 4_096);
  const result = registerPushDevice(store.id, { token, customerPhone: optionalText(req.body.customerPhone, 30) });
  res.status(201).json(result);
}));

app.post('/api/public/stores/:slug/orders', asyncRoute((req, res) => {
  const store = publicStore(req);
  if (!store.open) throw new ApiError(409, 'Supermercado fechado no momento');
  const fulfillmentType = oneOf(req.body.fulfillmentType, ['DELIVERY', 'PICKUP'], 'Tipo de recebimento');
  const customer = normalizeCustomer(req.body.customer, fulfillmentType);
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

app.get('/api/public/stores/:slug/orders/:id', asyncRoute((req, res) => {
  const store = publicStore(req);
  const token = requiredText(req.query.token, 'Token de acompanhamento', 200);
  const order = getTrackedOrder(store.id, req.params.id, token);
  if (!order) throw new ApiError(404, 'Pedido nao encontrado neste aparelho');
  res.json(order);
}));

app.post('/api/public/stores/:slug/orders/:id/cancel', asyncRoute((req, res) => {
  const store = publicStore(req);
  const token = requiredText(req.body.token, 'Token de acompanhamento', 200);
  const order = cancelOrderByCustomer(store.id, req.params.id, token);
  if (!order) throw new ApiError(404, 'Pedido nao encontrado neste aparelho');
  res.json(order);
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

app.get('/api/customers', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.json(listCustomers(req.user.storeId, req.query.q || ''));
}));

app.get('/api/reports/overview', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.json(storeReports(req.user.storeId));
}));

app.get('/api/push-devices/summary', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.json({ activeDevices: listActivePushDevices(req.user.storeId).length, firebase: firebaseStatus() });
}));

app.patch('/api/store/settings', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  const store = updateStoreSettings(req.user.storeId, {
    minimumOrder: positiveNumber(req.body.minimumOrder, 'Pedido minimo', { min: 0 }),
    deliveryFee: positiveNumber(req.body.deliveryFee, 'Taxa de entrega', { min: 0 }),
    freeDeliveryAbove: positiveNumber(req.body.freeDeliveryAbove ?? 0, 'Frete gratis acima de', { min: 0 }),
    supportPhone: requiredText(req.body.supportPhone, 'Telefone da central', 30),
    cancellationWindowMinutes: positiveNumber(req.body.cancellationWindowMinutes ?? 5, 'Prazo de cancelamento', { min: 1, max: 60 }),
    open: Boolean(req.body.open)
  });
  res.json(store);
}));

app.get('/api/banners', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.json(listBanners(req.user.storeId, true));
}));

app.post('/api/banners', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.status(201).json(createBanner(req.user.storeId, normalizeBanner(req.body)));
}));

app.patch('/api/banners/:id', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  const banner = updateBanner(req.user.storeId, req.params.id, normalizeBanner(req.body));
  if (!banner) throw new ApiError(404, 'Banner nao encontrado');
  res.json(banner);
}));

app.delete('/api/banners/:id', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  if (!deleteBanner(req.user.storeId, req.params.id)) throw new ApiError(404, 'Banner nao encontrado');
  res.status(204).end();
}));

app.get('/api/push-campaigns', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.json(listPushCampaigns(req.user.storeId));
}));

app.post('/api/push-campaigns', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.status(201).json(createPushCampaign(req.user.storeId, normalizePushCampaign(req.body)));
}));

app.post('/api/push-campaigns/:id/send', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  managerStore(req);
  const campaign = getPushCampaign(req.user.storeId, req.params.id);
  if (!campaign) throw new ApiError(404, 'Campanha nao encontrada');
  if (campaign.status === 'SENT') throw new ApiError(409, 'Campanha ja enviada');
  const devices = listActivePushDevices(req.user.storeId);
  if (!devices.length) throw new ApiError(409, 'Nenhum celular habilitado para receber notificacoes');
  try {
    const result = await sendFirebaseNotification(devices.map(device => device.token), campaign);
    res.json(markPushCampaignResult(req.user.storeId, campaign.id, result));
  } catch (error) {
    markPushCampaignResult(req.user.storeId, campaign.id, { successCount: 0, failureCount: devices.length, error: error.message });
    throw error;
  }
}));

app.patch('/api/push-campaigns/:id', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  const campaign = updatePushCampaign(req.user.storeId, req.params.id, normalizePushCampaign(req.body));
  if (!campaign) throw new ApiError(404, 'Campanha nao encontrada');
  res.json(campaign);
}));

app.delete('/api/push-campaigns/:id', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  if (!deletePushCampaign(req.user.storeId, req.params.id)) throw new ApiError(404, 'Campanha nao encontrada');
  res.status(204).end();
}));

app.get('/api/push-automations', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.json(listPushAutomations(req.user.storeId));
}));

app.post('/api/push-automations', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  res.status(201).json(createPushAutomation(req.user.storeId, normalizePushAutomation(req.body)));
}));

app.patch('/api/push-automations/:id', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  const automation = updatePushAutomation(req.user.storeId, req.params.id, normalizePushAutomation(req.body));
  if (!automation) throw new ApiError(404, 'Automacao nao encontrada');
  res.json(automation);
}));

app.post('/api/push-automations/:id/run', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  const automation = runPushAutomationNow(req.user.storeId, req.params.id);
  if (!automation) throw new ApiError(404, 'Automacao nao encontrada');
  res.json(automation);
}));

app.delete('/api/push-automations/:id', requireAuth('STORE_MANAGER'), asyncRoute((req, res) => {
  managerStore(req);
  if (!deletePushAutomation(req.user.storeId, req.params.id)) throw new ApiError(404, 'Automacao nao encontrada');
  res.status(204).end();
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
    brandColors: {
      primary: normalizeBrandColor(req.body.brandColors?.primary, '#092D22'),
      accent: normalizeBrandColor(req.body.brandColors?.accent, '#12C98A'),
      background: normalizeBrandColor(req.body.brandColors?.background, '#F2F5EF')
    },
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

app.patch('/api/admin/stores/:id/branding', requireAuth('PLATFORM_ADMIN'), asyncRoute((req, res) => {
  const store = updateStoreBranding(req.params.id, {
    primary: normalizeBrandColor(req.body.primary, '#092D22'),
    accent: normalizeBrandColor(req.body.accent, '#12C98A'),
    background: normalizeBrandColor(req.body.background, '#F2F5EF')
  });
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

async function dispatchScheduledCampaigns(storeId) {
  const devices = listActivePushDevices(storeId);
  if (!devices.length) return;
  for (const campaign of listPendingPushCampaigns(storeId)) {
    try {
      const result = await sendFirebaseNotification(devices.map(device => device.token), campaign);
      markPushCampaignResult(storeId, campaign.id, result);
    } catch (error) {
      markPushCampaignResult(storeId, campaign.id, { successCount: 0, failureCount: devices.length, error: error.message });
    }
  }
}

async function processPushAutomations() {
  for (const store of listStores()) {
    if (['TRIAL', 'ACTIVE'].includes(store.status)) {
      runDuePushAutomations(store.id);
      await dispatchScheduledCampaigns(store.id);
    }
  }
}

const pushAutomationTimer = setInterval(async () => {
  try { await processPushAutomations(); }
  catch (error) { console.error('Falha ao processar automacoes de push', error); }
}, 60_000);
pushAutomationTimer.unref();
processPushAutomations().catch(error => console.error('Falha ao iniciar automacoes de push', error));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AiMerc backend running on http://127.0.0.1:${PORT}`);
  if (process.env.NODE_ENV !== 'production') console.log('Contas locais de demonstracao habilitadas.');
});
