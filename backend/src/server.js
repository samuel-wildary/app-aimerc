import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  adminOverview,
  assertLoginAllowed,
  createBanner,
  createOrder,
  createPushCampaign,
  createPushAutomation,
  cancelOrderByCustomer,
  consumeOrderCreationQuota,
  createStore,
  createIntegrationAgent,
  databaseHealth,
  dashboardSummary,
  deleteBanner,
  deleteStore,
  deletePushCampaign,
  deletePushAutomation,
  findUserByEmail,
  findUserById,
  findIntegrationAgentByToken,
  initializeDatabase,
  getTrackedOrder,
  getProduct,
  getPushCampaign,
  getStore,
  getStoreBySlug,
  getStoreIntegration,
  heartbeatIntegrationAgent,
  listBanners,
  listCustomers,
  listOrders,
  listProductCategories,
  listProducts,
  listActivePushDevices,
  listPendingPushCampaigns,
  listPushCampaigns,
  listPushAutomations,
  listStores,
  listSubscriptions,
  listIntegrationOverview,
  storeReports,
  runDuePushAutomations,
  runPushAutomationNow,
  registerPushDevice,
  markPushCampaignResult,
  recordLoginResult,
  recordIntegrationRun,
  updateOrderStatus,
  updateProductCatalog,
  updatePushCampaign,
  updatePushAutomation,
  updateBanner,
  updateStoreSettings,
  updateStoreStatus,
  updateStoreBranding,
  updateUserPassword,
  writeAuditLog,
  saveStoreIntegration,
  upsertProducts
} from './lib/database.js';
import { firebaseStatus, sendFirebaseNotification } from './lib/firebase.js';
import { productImage, storeProductImage } from './lib/product-images.js';
import { getBannerImage, storeBannerImage } from './lib/banner-images.js';
import {
  catalogLibraryOverview,
  deleteCatalogAsset,
  getCatalogAssetImage,
  listCatalogAssets,
  startCatalogScan
} from './lib/catalog-library.js';
import { createToken, passwordNeedsUpgrade, requireAuth, verifyPassword } from './lib/auth.js';
import { integrationProvider, integrationProviders, publicIntegrationProvider } from './lib/integration-providers.js';
import { encryptIntegrationSecret } from './lib/store-integration.js';
import { ApiError, normalizeEmail, oneOf, optionalText, positiveNumber, requiredText, slugify } from './lib/validation.js';

const app = express();
const PORT = Number(process.env.PORT || 4100);
const localOrigins = process.env.NODE_ENV === 'production'
  ? []
  : ['http://127.0.0.1:4201', 'http://localhost:4201', 'http://127.0.0.1:4202', 'http://localhost:4202'];
const allowedOrigins = new Set((process.env.AIMERC_ALLOWED_ORIGINS || '')
  .split(',').map(value => value.trim()).filter(Boolean).concat(localOrigins));
const requestBuckets = new Map();

app.disable('x-powered-by');
app.set('trust proxy', Math.max(0, Number(process.env.AIMERC_TRUST_PROXY_HOPS || 1)));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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
  const isPublicImageRead = req.method === 'GET' && (
    /^\/api\/public\/catalog-library\/[^/]+\/image$/.test(req.path)
    || /^\/api\/public\/stores\/[^/]+\/products\/[^/]+\/image$/.test(req.path)
    || /^\/api\/public\/stores\/[^/]+\/banners\/images\/[^/]+$/.test(req.path)
  );

  // Product and banner grids can request dozens of thumbnails at once. These
  // public, read-only assets must not consume the administrative API quota.
  if (isPublicImageRead) return next();

  const isImageUpload = req.path.startsWith('/api/sync/product-images/');
  const bucket = isImageUpload ? 'image-upload' : 'api';
  const key = `${bucket}:${req.ip}:${Math.floor(Date.now() / 60_000)}`;
  const count = (requestBuckets.get(key) || 0) + 1;
  requestBuckets.set(key, count);
  if (requestBuckets.size > 2_000) requestBuckets.clear();
  const limit = isImageUpload ? 3_000 : 300;
  if (count > limit) return res.status(429).json({ error: 'Muitas requisicoes. Tente novamente em instantes.' });
  next();
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function requireIntegrationAgent(req, res, next) {
  try {
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const agent = await findIntegrationAgentByToken(token);
    if (!agent) throw new ApiError(401, 'Token do agente invalido ou revogado');
    req.integrationAgent = agent;
    next();
  } catch (error) {
    next(error);
  }
}

async function publicStore(req) {
  const store = await getStoreBySlug(req.params.slug);
  if (!store) throw new ApiError(404, 'Supermercado nao encontrado');
  if (!['TRIAL', 'ACTIVE'].includes(store.status)) throw new ApiError(403, 'Supermercado temporariamente indisponivel');
  return store;
}

async function managerStore(req) {
  const store = await getStore(req.user.storeId);
  if (!store) throw new ApiError(404, 'Supermercado nao encontrado');
  if (!['TRIAL', 'ACTIVE'].includes(store.status)) throw new ApiError(403, 'Conta do supermercado bloqueada');
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
  const { hasStoredImage, hasCatalogImage, ...publicFields } = product;
  const hasImage = Boolean(hasStoredImage || hasCatalogImage);
  if (!product.image && !hasImage) return { ...publicFields, hasImage };
  const version = encodeURIComponent(product.updatedAt || '1');
  return {
    ...publicFields,
    hasImage,
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
    title: optionalText(item.title, 120),
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

app.get('/api/health', asyncRoute(async (req, res) => {
  await databaseHealth();
  res.json({
    ok: true,
    app: 'AiMerc Backend',
    version: '2.0.0',
    persistence: 'postgresql',
    port: PORT
  });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = requiredText(req.body.password, 'Senha', 200);
  await assertLoginAllowed(email, req.ip);
  const user = await findUserByEmail(email);
  const valid = Boolean(user && verifyPassword(password, user.password_salt, user.password_hash));
  await recordLoginResult(email, req.ip, valid);
  if (!valid) throw new ApiError(401, 'E-mail ou senha invalidos');
  if (passwordNeedsUpgrade(user.password_hash)) await updateUserPassword(user.id, password);
  const store = user.store_id ? await getStore(user.store_id) : null;
  if (store && !['TRIAL', 'ACTIVE'].includes(store.status)) throw new ApiError(403, 'Conta do supermercado bloqueada');
  res.json({
    token: createToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role, storeId: user.store_id },
    store
  });
}));

app.get('/api/public/stores/:slug/catalog', asyncRoute(async (req, res) => {
  const store = await publicStore(req);
  const products = (await listProducts(store.id, { q: req.query.q, category: req.query.category })).map(product => publicProduct(req, store, product));
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
    banners: await listBanners(store.id),
    promotions: products.filter(product => product.promo),
    shelves: categories.slice(0, 4).map(category => ({ id: category.toLowerCase(), title: category, products: products.filter(product => product.category === category).slice(0, 12) }))
  });
}));

app.get('/api/public/catalog-library/:ean/image', asyncRoute(async (req, res) => {
  if (!/^\d{8,14}$/.test(String(req.params.ean || ''))) throw new ApiError(400, 'EAN invalido');
  const image = await getCatalogAssetImage(req.params.ean);
  if (!image) throw new ApiError(404, 'Imagem nao encontrada');
  res.setHeader('Content-Type', image.content_type);
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('ETag', `"${image.checksum}"`);
  res.send(image.image_data);
}));

app.get('/api/public/stores/:slug/products', asyncRoute(async (req, res) => {
  const store = await publicStore(req);
  res.json((await listProducts(store.id, { q: req.query.q, category: req.query.category })).map(product => publicProduct(req, store, product)));
}));

app.get('/api/public/stores/:slug/products/:productId/image', asyncRoute(async (req, res) => {
  const store = await publicStore(req);
  const product = await getProduct(store.id, req.params.productId);
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

app.get('/api/public/stores/:slug/banners/images/:imageId', asyncRoute(async (req, res) => {
  const store = await publicStore(req);
  const image = await getBannerImage(store.id, req.params.imageId);
  if (!image) throw new ApiError(404, 'Imagem do banner nao encontrada');
  res.setHeader('Content-Type', image.contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.send(image.data);
}));

app.get('/api/public/cep/:cep', asyncRoute(async (req, res) => {
  const cep = String(req.params.cep || '').replace(/\D/g, '');
  if (cep.length !== 8) throw new ApiError(400, 'CEP deve ter 8 digitos');
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new ApiError(502, 'Servico de CEP temporariamente indisponivel');
  const address = await response.json();
  if (address.erro) throw new ApiError(404, 'CEP nao encontrado');
  res.json({
    cep,
    street: address.logradouro || '',
    complement: address.complemento || '',
    neighborhood: address.bairro || '',
    city: address.localidade || '',
    state: address.uf || ''
  });
}));

app.post('/api/public/stores/:slug/push/devices', asyncRoute(async (req, res) => {
  const store = await publicStore(req);
  const token = requiredText(req.body.token, 'Token do dispositivo', 4_096);
  const result = await registerPushDevice(store.id, { token, customerPhone: optionalText(req.body.customerPhone, 30) });
  res.status(201).json(result);
}));

app.post('/api/public/stores/:slug/orders', asyncRoute(async (req, res) => {
  const store = await publicStore(req);
  await consumeOrderCreationQuota(req.ip);
  if (!store.open) throw new ApiError(409, 'Supermercado fechado no momento');
  const fulfillmentType = oneOf(req.body.fulfillmentType, ['DELIVERY', 'PICKUP'], 'Tipo de recebimento');
  const customer = normalizeCustomer(req.body.customer, fulfillmentType);
  if (!Array.isArray(req.body.items) || req.body.items.length === 0 || req.body.items.length > 100) throw new ApiError(400, 'Carrinho vazio ou invalido');
  const items = req.body.items.map(item => ({
    productId: requiredText(item.productId, 'Produto', 100),
    quantity: positiveNumber(item.quantity, 'Quantidade', { min: 0.01, max: 1_000 })
  }));
  const order = await createOrder(store, {
    customer,
    fulfillmentType,
    paymentMethod: oneOf(req.body.paymentMethod, ['CASH', 'CARD_ON_DELIVERY', 'PIX'], 'Pagamento'),
    changeFor: req.body.changeFor ? positiveNumber(req.body.changeFor, 'Troco') : null,
    notes: optionalText(req.body.notes, 500),
    scheduledTo: req.body.scheduledTo || null,
    items
  });
  res.status(201).json(order);
}));

app.get('/api/public/stores/:slug/orders/:id', asyncRoute(async (req, res) => {
  const store = await publicStore(req);
  const token = requiredText(req.headers['x-order-token'], 'Token de acompanhamento', 200);
  const order = await getTrackedOrder(store.id, req.params.id, token);
  if (!order) throw new ApiError(404, 'Pedido nao encontrado neste aparelho');
  res.json(order);
}));

app.post('/api/public/stores/:slug/orders/:id/cancel', asyncRoute(async (req, res) => {
  const store = await publicStore(req);
  const token = requiredText(req.headers['x-order-token'], 'Token de acompanhamento', 200);
  const order = await cancelOrderByCustomer(store.id, req.params.id, token);
  if (!order) throw new ApiError(404, 'Pedido nao encontrado neste aparelho');
  res.json(order);
}));

app.get('/api/dashboard/summary', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  const [store, summary] = await Promise.all([managerStore(req), dashboardSummary(req.user.storeId)]);
  res.json({
    store,
    user: { id: req.user.sub, name: req.user.name, email: req.user.email, role: req.user.role },
    ...summary
  });
}));

app.get('/api/orders', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.json(await listOrders(req.user.storeId, { status: req.query.status, fulfillmentType: req.query.fulfillmentType }));
}));

app.patch('/api/orders/:id/status', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  const status = oneOf(req.body.status, ['PICKING', 'READY', 'OUT_FOR_DELIVERY', 'DONE', 'CANCELLED'], 'Status');
  const order = await updateOrderStatus(req.user.storeId, req.params.id, status);
  if (!order) throw new ApiError(404, 'Pedido nao encontrado');
  await writeAuditLog({ storeId: req.user.storeId, actorId: req.user.sub, action: 'ORDER_STATUS_CHANGED', entityType: 'ORDER', entityId: req.params.id, metadata: { status } });
  res.json(order);
}));

app.get('/api/products', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  const store = await managerStore(req);
  const products = await listProducts(req.user.storeId, {
    q: req.query.q,
    category: req.query.category,
    includeHidden: true
  });
  res.json(products.map(product => publicProduct(req, store, product)));
}));

app.get('/api/products/categories', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.json(await listProductCategories(req.user.storeId));
}));

app.patch('/api/products/:productId/catalog', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  const product = await updateProductCatalog(req.user.storeId, req.params.productId, {
    catalogName: optionalText(req.body.catalogName, 160),
    catalogCategory: optionalText(req.body.catalogCategory, 100),
    description: optionalText(req.body.description, 1_000),
    catalogVisible: req.body.catalogVisible !== false
  });
  if (!product) throw new ApiError(404, 'Produto nao encontrado');
  await writeAuditLog({
    storeId: req.user.storeId,
    actorId: req.user.sub,
    action: 'PRODUCT_CATALOG_UPDATED',
    entityType: 'PRODUCT',
    entityId: req.params.productId,
    metadata: { category: product.category, visible: product.catalogVisible }
  });
  res.json(publicProduct(req, await getStore(req.user.storeId), product));
}));

app.get('/api/customers', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.json(await listCustomers(req.user.storeId, req.query.q || ''));
}));

app.get('/api/reports/overview', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.json(await storeReports(req.user.storeId));
}));

app.get('/api/push-devices/summary', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.json({ activeDevices: (await listActivePushDevices(req.user.storeId)).length, firebase: firebaseStatus() });
}));

app.patch('/api/store/settings', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  const store = await updateStoreSettings(req.user.storeId, {
    minimumOrder: positiveNumber(req.body.minimumOrder, 'Pedido minimo', { min: 0 }),
    deliveryFee: positiveNumber(req.body.deliveryFee, 'Taxa de entrega', { min: 0 }),
    freeDeliveryAbove: positiveNumber(req.body.freeDeliveryAbove ?? 0, 'Frete gratis acima de', { min: 0 }),
    supportPhone: requiredText(req.body.supportPhone, 'Telefone da central', 30),
    cancellationWindowMinutes: positiveNumber(req.body.cancellationWindowMinutes ?? 5, 'Prazo de cancelamento', { min: 1, max: 60 }),
    open: Boolean(req.body.open)
  });
  await writeAuditLog({ storeId: req.user.storeId, actorId: req.user.sub, action: 'STORE_SETTINGS_UPDATED', entityType: 'STORE', entityId: req.user.storeId });
  res.json(store);
}));

app.get('/api/banners', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.json(await listBanners(req.user.storeId, true));
}));

app.post(
  '/api/banners/images',
  requireAuth('STORE_MANAGER'),
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }),
  asyncRoute(async (req, res) => {
    const store = await managerStore(req);
    if (!Buffer.isBuffer(req.body)) throw new ApiError(400, 'Arquivo de imagem invalido');
    const stored = await storeBannerImage(store.id, req.body, req.headers['content-type']);
    res.status(201).json({
      ...stored,
      image: `${publicApiBase(req)}/public/stores/${encodeURIComponent(store.slug)}/banners/images/${encodeURIComponent(stored.id)}`
    });
  })
);

app.post('/api/banners', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.status(201).json(await createBanner(req.user.storeId, normalizeBanner(req.body)));
}));

app.patch('/api/banners/:id', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  const banner = await updateBanner(req.user.storeId, req.params.id, normalizeBanner(req.body));
  if (!banner) throw new ApiError(404, 'Banner nao encontrado');
  res.json(banner);
}));

app.delete('/api/banners/:id', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  if (!await deleteBanner(req.user.storeId, req.params.id)) throw new ApiError(404, 'Banner nao encontrado');
  res.status(204).end();
}));

app.get('/api/push-campaigns', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.json(await listPushCampaigns(req.user.storeId));
}));

app.post('/api/push-campaigns', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.status(201).json(await createPushCampaign(req.user.storeId, normalizePushCampaign(req.body)));
}));

app.post('/api/push-campaigns/:id/send', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  const campaign = await getPushCampaign(req.user.storeId, req.params.id);
  if (!campaign) throw new ApiError(404, 'Campanha nao encontrada');
  if (campaign.status === 'SENT') throw new ApiError(409, 'Campanha ja enviada');
  const devices = await listActivePushDevices(req.user.storeId);
  if (!devices.length) throw new ApiError(409, 'Nenhum celular habilitado para receber notificacoes');
  try {
    const result = await sendFirebaseNotification(devices.map(device => device.token), campaign);
    res.json(await markPushCampaignResult(req.user.storeId, campaign.id, result));
  } catch (error) {
    await markPushCampaignResult(req.user.storeId, campaign.id, { successCount: 0, failureCount: devices.length, error: error.message });
    throw error;
  }
}));

app.patch('/api/push-campaigns/:id', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  const campaign = await updatePushCampaign(req.user.storeId, req.params.id, normalizePushCampaign(req.body));
  if (!campaign) throw new ApiError(404, 'Campanha nao encontrada');
  res.json(campaign);
}));

app.delete('/api/push-campaigns/:id', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  if (!await deletePushCampaign(req.user.storeId, req.params.id)) throw new ApiError(404, 'Campanha nao encontrada');
  res.status(204).end();
}));

app.get('/api/push-automations', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.json(await listPushAutomations(req.user.storeId));
}));

app.post('/api/push-automations', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  res.status(201).json(await createPushAutomation(req.user.storeId, normalizePushAutomation(req.body)));
}));

app.patch('/api/push-automations/:id', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  const automation = await updatePushAutomation(req.user.storeId, req.params.id, normalizePushAutomation(req.body));
  if (!automation) throw new ApiError(404, 'Automacao nao encontrada');
  res.json(automation);
}));

app.post('/api/push-automations/:id/run', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  const automation = await runPushAutomationNow(req.user.storeId, req.params.id);
  if (!automation) throw new ApiError(404, 'Automacao nao encontrada');
  res.json(automation);
}));

app.delete('/api/push-automations/:id', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  if (!await deletePushAutomation(req.user.storeId, req.params.id)) throw new ApiError(404, 'Automacao nao encontrada');
  res.status(204).end();
}));

app.post('/api/sync/products', requireAuth('STORE_MANAGER'), asyncRoute(async (req, res) => {
  await managerStore(req);
  if (!Array.isArray(req.body.items) || req.body.items.length === 0 || req.body.items.length > 10_000) throw new ApiError(400, 'Lista de produtos invalida');
  const result = await upsertProducts(req.user.storeId, req.body.items.map(normalizeProduct));
  await writeAuditLog({ storeId: req.user.storeId, actorId: req.user.sub, action: 'PRODUCTS_SYNCHRONIZED', entityType: 'PRODUCT', metadata: result });
  res.json({ success: true, ...result, synchronizedAt: new Date().toISOString() });
}));

app.post('/api/agent/heartbeat', requireIntegrationAgent, asyncRoute(async (req, res) => {
  const agent = await heartbeatIntegrationAgent(req.integrationAgent.id, {
    version: optionalText(req.body.version, 40),
    capabilities: Array.isArray(req.body.capabilities) ? req.body.capabilities.slice(0, 20).map(value => String(value).slice(0, 60)) : [],
    ip: req.ip
  });
  res.json({ ok: true, agent, serverTime: new Date().toISOString() });
}));

app.get('/api/agent/config', requireIntegrationAgent, asyncRoute(async (req, res) => {
  const integration = await getStoreIntegration(req.integrationAgent.storeId);
  if (!integration || !integration.enabled) throw new ApiError(409, 'Integracao desativada no painel SaaS');
  res.json({
    storeId: req.integrationAgent.storeId,
    providerCode: integration.providerCode,
    fieldMapping: integration.fieldMapping,
    syncIntervalSeconds: integration.syncIntervalSeconds
  });
}));

app.post('/api/agent/products', requireIntegrationAgent, asyncRoute(async (req, res) => {
  const startedAt = new Date().toISOString();
  const agent = req.integrationAgent;
  const integration = await getStoreIntegration(agent.storeId);
  if (!integration || !integration.enabled) throw new ApiError(409, 'Integracao desativada no painel SaaS');
  if (!Array.isArray(req.body.items) || req.body.items.length === 0 || req.body.items.length > 10_000) {
    throw new ApiError(400, 'Envie entre 1 e 10.000 produtos por lote');
  }
  try {
    const products = req.body.items.map(normalizeProduct);
    const result = await upsertProducts(agent.storeId, products);
    await heartbeatIntegrationAgent(agent.id, {
      version: optionalText(req.body.agentVersion, 40), capabilities: ['PRODUCT_SYNC'], ip: req.ip
    });
    await recordIntegrationRun(agent, result, {
      status: 'COMPLETED', received: products.length, startedAt,
      message: `${products.length} produtos processados pelo agente`
    });
    await writeAuditLog({
      storeId: agent.storeId, actorId: agent.id, action: 'AGENT_PRODUCTS_SYNCHRONIZED',
      entityType: 'INTEGRATION_AGENT', entityId: agent.id, metadata: { ...result, received: products.length }
    });
    res.json({ success: true, ...result, received: products.length, synchronizedAt: new Date().toISOString() });
  } catch (error) {
    await recordIntegrationRun(agent, {}, {
      status: 'FAILED', received: Array.isArray(req.body.items) ? req.body.items.length : 0,
      errors: 1, startedAt, message: error.message
    });
    throw error;
  }
}));

app.post(
  '/api/sync/product-images/:productId',
  requireAuth('STORE_MANAGER'),
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'], limit: '10mb' }),
  asyncRoute(async (req, res) => {
    await managerStore(req);
    const product = await getProduct(req.user.storeId, req.params.productId);
    if (!product) throw new ApiError(404, 'Produto nao encontrado');
    if (!Buffer.isBuffer(req.body)) throw new ApiError(400, 'Arquivo de imagem invalido');
    const stored = await storeProductImage(req.user.storeId, product, req.body, req.headers['content-type']);
    res.json({ success: true, productId: product.id, ...stored });
  })
);

app.get('/api/admin/overview', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  res.json(await adminOverview());
}));

app.get('/api/admin/integration-providers', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  res.json(integrationProviders.map(publicIntegrationProvider));
}));

app.get('/api/admin/integration-agent/download', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  const installerPath = path.resolve(
    process.env.AIMERC_AGENT_INSTALLER_PATH
      || path.join(process.cwd(), '..', 'sync-agent', 'dist', 'AiMerc-Agent-Setup.exe')
  );
  const installerAvailable = await fs.access(installerPath).then(() => true).catch(() => false);
  if (installerAvailable) return res.download(installerPath, 'AiMerc-Agent-Setup.exe');

  const remoteUrl = String(process.env.AIMERC_AGENT_DOWNLOAD_URL || '').trim();
  if (remoteUrl) return res.redirect(302, remoteUrl);
  throw new ApiError(404, 'Instalador do agente ainda nao foi armazenado na VPS');
}));

app.get('/api/admin/integrations', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  res.json(await listIntegrationOverview());
}));

app.put('/api/admin/stores/:id/integration', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  const store = await getStore(req.params.id);
  if (!store) throw new ApiError(404, 'Supermercado nao encontrado');
  const provider = integrationProvider(req.body.providerCode);
  if (!provider) throw new ApiError(400, 'Provedor de integracao invalido');
  const connectionMode = oneOf(req.body.connectionMode || 'LOCAL_AGENT', provider.modes, 'Modo de conexao');
  const authType = oneOf(req.body.authType || 'NONE', ['NONE', 'BEARER', 'API_KEY'], 'Autenticacao');
  const interval = Math.max(30, Math.min(86_400, Number(req.body.syncIntervalSeconds) || 300));
  const fieldMapping = req.body.fieldMapping && typeof req.body.fieldMapping === 'object' && !Array.isArray(req.body.fieldMapping)
    ? req.body.fieldMapping : {};
  const integration = await saveStoreIntegration(store.id, {
    providerCode: provider.code,
    providerName: provider.name,
    connectionMode,
    endpointUrl: optionalText(req.body.endpointUrl, 1_500),
    authType,
    authHeader: optionalText(req.body.authHeader, 100),
    encryptedSecret: req.body.secret ? encryptIntegrationSecret(requiredText(req.body.secret, 'Credencial', 2_000)) : '',
    fieldMapping,
    syncIntervalSeconds: interval,
    enabled: req.body.enabled !== false
  });
  await writeAuditLog({
    storeId: store.id, actorId: req.user.sub, action: 'STORE_INTEGRATION_CONFIGURED',
    entityType: 'STORE_INTEGRATION', entityId: store.id,
    metadata: { providerCode: provider.code, connectionMode, enabled: integration.enabled }
  });
  res.json(integration);
}));

app.post('/api/admin/stores/:id/integration/agent', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  const store = await getStore(req.params.id);
  if (!store) throw new ApiError(404, 'Supermercado nao encontrado');
  const integration = await getStoreIntegration(store.id);
  if (!integration) throw new ApiError(409, 'Configure a integracao antes de gerar o agente');
  const created = await createIntegrationAgent(store.id, {
    name: optionalText(req.body.name, 100) || `Agente ${store.name}`,
    providerCode: integration.providerCode
  });
  await writeAuditLog({
    storeId: store.id, actorId: req.user.sub, action: 'INTEGRATION_AGENT_TOKEN_ROTATED',
    entityType: 'INTEGRATION_AGENT', entityId: created.agent.id
  });
  res.status(201).json({ ...created, warning: 'Este token sera exibido somente agora.' });
}));

app.get('/api/admin/stores', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  res.json(await listStores());
}));

app.post('/api/admin/stores', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  const name = requiredText(req.body.name, 'Nome do supermercado');
  const store = await createStore({
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
  await writeAuditLog({ storeId: store.id, actorId: req.user.sub, action: 'STORE_CREATED', entityType: 'STORE', entityId: store.id });
  res.status(201).json(store);
}));

app.patch('/api/admin/stores/:id/status', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  const status = oneOf(req.body.status, ['TRIAL', 'ACTIVE', 'OVERDUE', 'BLOCKED', 'CANCELLED'], 'Status');
  const store = await updateStoreStatus(req.params.id, status);
  if (!store) throw new ApiError(404, 'Supermercado nao encontrado');
  await writeAuditLog({ storeId: store.id, actorId: req.user.sub, action: 'STORE_STATUS_CHANGED', entityType: 'STORE', entityId: store.id, metadata: { status } });
  res.json(store);
}));

app.patch('/api/admin/stores/:id/branding', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  const store = await updateStoreBranding(req.params.id, {
    primary: normalizeBrandColor(req.body.primary, '#092D22'),
    accent: normalizeBrandColor(req.body.accent, '#12C98A'),
    background: normalizeBrandColor(req.body.background, '#F2F5EF')
  });
  if (!store) throw new ApiError(404, 'Supermercado nao encontrado');
  await writeAuditLog({ storeId: store.id, actorId: req.user.sub, action: 'STORE_BRANDING_UPDATED', entityType: 'STORE', entityId: store.id });
  res.json(store);
}));

app.delete('/api/admin/stores/:id', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  const password = requiredText(req.body.password, 'Senha administrativa', 200);
  await assertLoginAllowed(req.user.email, req.ip);
  const administrator = await findUserById(req.user.sub);
  const validPassword = Boolean(
    administrator
    && administrator.role === 'PLATFORM_ADMIN'
    && verifyPassword(password, administrator.password_salt, administrator.password_hash)
  );
  await recordLoginResult(req.user.email, req.ip, validPassword);
  if (!validPassword) throw new ApiError(401, 'Senha administrativa incorreta');
  const store = await deleteStore(req.params.id, req.user.sub);
  if (!store) throw new ApiError(404, 'Supermercado nao encontrado');
  res.json({ success: true, deletedStore: { id: store.id, name: store.name } });
}));

app.get('/api/admin/subscriptions', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  res.json(await listSubscriptions());
}));

app.get('/api/admin/catalog-library', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  const [overview, assets] = await Promise.all([
    catalogLibraryOverview(),
    listCatalogAssets({ search: req.query.search, limit: req.query.limit, offset: req.query.offset })
  ]);
  const base = publicApiBase(req);
  res.json({
    ...overview,
    assets: {
      ...assets,
      items: assets.items.map(item => ({
        ...item,
        image: `${base}/public/catalog-library/${encodeURIComponent(item.ean)}/image?v=${encodeURIComponent(item.updatedAt)}`
      }))
    }
  });
}));

app.post('/api/admin/catalog-library/scans', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  const job = await startCatalogScan(req.body || {}, req.user.sub);
  await writeAuditLog({ actorId: req.user.sub, action: 'CATALOG_SCAN_STARTED', entityType: 'CATALOG_SCAN', entityId: job.id,
    metadata: { sourceType: job.sourceType, requestedLimit: job.requestedLimit } });
  res.status(202).json(job);
}));

app.delete('/api/admin/catalog-library/:ean', requireAuth('PLATFORM_ADMIN'), asyncRoute(async (req, res) => {
  if (!await deleteCatalogAsset(req.params.ean)) throw new ApiError(404, 'Produto nao encontrado na biblioteca');
  await writeAuditLog({ actorId: req.user.sub, action: 'CATALOG_ASSET_DELETED', entityType: 'CATALOG_ASSET', entityId: req.params.ean });
  res.status(204).end();
}));

app.use((req, res) => res.status(404).json({ error: 'Rota nao encontrada' }));
app.use((error, req, res, next) => {
  const status = Number(error.status || 500);
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor' : error.message, details: error.details });
});

async function dispatchScheduledCampaigns(storeId) {
  const devices = await listActivePushDevices(storeId);
  if (!devices.length) return;
  for (const campaign of await listPendingPushCampaigns(storeId)) {
    try {
      const result = await sendFirebaseNotification(devices.map(device => device.token), campaign);
      await markPushCampaignResult(storeId, campaign.id, result);
    } catch (error) {
      await markPushCampaignResult(storeId, campaign.id, { successCount: 0, failureCount: devices.length, error: error.message });
    }
  }
}

async function processPushAutomations() {
  for (const store of await listStores()) {
    if (['TRIAL', 'ACTIVE'].includes(store.status)) {
      await runDuePushAutomations(store.id);
      await dispatchScheduledCampaigns(store.id);
    }
  }
}

async function start() {
  await initializeDatabase();
  const pushAutomationTimer = setInterval(async () => {
    try { await processPushAutomations(); }
    catch (error) { console.error('Falha ao processar automacoes de push', error); }
  }, 60_000);
  pushAutomationTimer.unref();
  processPushAutomations().catch(error => console.error('Falha ao iniciar automacoes de push', error));
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AiMerc backend PostgreSQL running on port ${PORT}`);
  });
}

start().catch(error => {
  console.error('Nao foi possivel iniciar o backend AiMerc:', error);
  process.exit(1);
});
