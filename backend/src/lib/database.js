import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
import { initializePostgres, query, transaction } from './postgres.js';
import { normalizeCategory } from './categories.js';
import { beautifyProductName } from './product-names.js';
import { resolveProductSaleRule } from './product-sale-rules.js';
import { calculateDeliveryFee, normalizeDeliveryArea } from './delivery-fees.js';

function isoNow() {
  return new Date().toISOString();
}

function nextDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
    monthlyPrice: Number(row.monthly_price),
    minimumOrder: Number(row.minimum_order),
    deliveryFee: Number(row.delivery_fee),
    freeDeliveryAbove: Number(row.free_delivery_above || 0),
    supportPhone: row.support_phone || row.phone,
    cancellationWindowMinutes: Number(row.cancellation_window_minutes || 5),
    brandColors: {
      primary: row.brand_primary || '#092D22',
      accent: row.brand_accent || '#12C98A',
      background: row.brand_background || '#F2F5EF'
    },
    open: Boolean(row.is_open),
    businessHoursStart: row.business_hours_start || '08:00',
    businessHoursEnd: row.business_hours_end || '20:00',
    businessDays: row.business_days || '1,2,3,4,5,6',
    acceptAfterHours: row.accept_after_hours != null ? Boolean(row.accept_after_hours) : true,
    enablePickupScheduling: row.enable_pickup_scheduling != null ? Boolean(row.enable_pickup_scheduling) : true,
    pickupSlots: row.pickup_slots || '08:00 - 10:00, 10:00 - 12:00, 12:00 - 14:00, 14:00 - 16:00, 16:00 - 18:00, 18:00 - 20:00',
    disabledCategories: row.disabled_categories || '',
    categoryAliases: safeJsonParse(row.category_aliases, {}),
    disablePromotions: Boolean(row.disable_promotions),
    createdAt: row.created_at
  };
}

export function storeOperatingStatus(store, now = new Date()) {
  const offsetMs = 3 * 60 * 60 * 1000;
  const local = new Date(now.getTime() - offsetMs);
  const days = String(store.businessDays || '1,2,3,4,5,6').split(',').map(Number).filter(day => day >= 0 && day <= 6);
  const toMinutes = value => {
    const [hours, minutes] = String(value || '00:00').split(':').map(Number);
    return hours * 60 + minutes;
  };
  const start = toMinutes(store.businessHoursStart || '08:00');
  const end = toMinutes(store.businessHoursEnd || '20:00');
  const current = local.getUTCHours() * 60 + local.getUTCMinutes();
  const scheduledDay = days.includes(local.getUTCDay());
  const withinHours = start <= end ? current >= start && current < end : current >= start || current < end;
  const openNow = Boolean(store.open) && scheduledDay && withinHours;
  let nextOpening = null;
  if (!openNow) {
    const [openingHour, openingMinute] = String(store.businessHoursStart || '08:00').split(':').map(Number);
    for (let addDays = 0; addDays <= 7; addDays += 1) {
      const localCandidate = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + addDays, openingHour, openingMinute));
      if (!days.includes(localCandidate.getUTCDay())) continue;
      const candidate = new Date(localCandidate.getTime() + offsetMs);
      if (candidate > now) { nextOpening = candidate.toISOString(); break; }
    }
  }
  return {
    openNow,
    manuallyOpen: Boolean(store.open),
    outsideBusinessHours: Boolean(store.open) && !openNow,
    acceptsAfterHours: Boolean(store.acceptAfterHours),
    nextOpening
  };
}

function mapDeliveryZone(row) {
  return {
    id: row.id,
    neighborhood: row.neighborhood,
    city: row.city || '',
    state: row.state || '',
    fee: Number(row.fee),
    active: Boolean(row.active),
    updatedAt: row.updated_at
  };
}

export function mapProduct(row) {
  const sourceName = row.source_name || row.name;
  const sourceCategory = normalizeCategory(row.source_category || row.category);
  const displayName = row.catalog_name || beautifyProductName(sourceName) || sourceName;
  const { sourceUnit, saleMode, soldByWeight, quantityStep, unit } = resolveProductSaleRule(row);
  const sourceStock = Math.max(0, Number(row.stock) || 0);
  const stockOverride = row.catalog_stock == null ? null : Math.max(0, Number(row.catalog_stock) || 0);
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: displayName,
    sourceName,
    category: normalizeCategory(row.catalog_category || sourceCategory),
    sourceCategory,
    catalogName: row.catalog_name || '',
    catalogCategory: row.catalog_category ? normalizeCategory(row.catalog_category) : '',
    description: row.description || '',
    price: Number(row.price),
    oldPrice: row.old_price == null ? null : Number(row.old_price),
    stock: soldByWeight && stockOverride != null ? stockOverride : sourceStock,
    sourceStock,
    stockOverride: soldByWeight ? stockOverride : null,
    unit,
    sourceUnit,
    saleMode,
    soldByWeight,
    quantityStep,
    image: row.image,
    promo: Boolean(row.promo),
    active: Boolean(row.active),
    catalogVisible: Boolean(row.catalog_visible),
    enrichmentStatus: row.enrichment_status || 'PENDING',
    enrichedAt: row.enriched_at,
    updatedAt: row.updated_at,
    hasStoredImage: Boolean(row.has_stored_image),
    hasCatalogImage: Boolean(row.has_catalog_image)
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
    position: Number(row.position),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPushCampaign(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    status: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    successCount: Number(row.success_count || 0),
    failureCount: Number(row.failure_count || 0),
    sendError: row.send_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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

async function syncPlatformAdminFromEnvironment() {
  const email = String(process.env.AIMERC_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.AIMERC_ADMIN_PASSWORD || '');
  const name = String(process.env.AIMERC_ADMIN_NAME || 'Administrador AiMerc').trim();
  if (!email && !password) return;
  if (!email || !password) throw new Error('Configure AIMERC_ADMIN_EMAIL e AIMERC_ADMIN_PASSWORD juntos');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('AIMERC_ADMIN_EMAIL invalido');
  if (password.length < 12) throw new Error('AIMERC_ADMIN_PASSWORD deve ter pelo menos 12 caracteres');

  const credentials = hashPassword(password);
  await transaction(async client => {
    const existing = await client.query("SELECT id FROM users WHERE role = 'PLATFORM_ADMIN' ORDER BY created_at LIMIT 1 FOR UPDATE");
    const id = existing.rows[0]?.id || `user_${crypto.randomUUID().slice(0, 12)}`;
    const conflict = await client.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
    if (conflict.rowCount) throw new Error('AIMERC_ADMIN_EMAIL ja pertence a outro usuario');
    await client.query(`INSERT INTO users (id, store_id, role, name, email, password_hash, password_salt, created_at)
      VALUES ($1, NULL, 'PLATFORM_ADMIN', $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email,
        password_hash=EXCLUDED.password_hash, password_salt=EXCLUDED.password_salt`,
    [id, name, email, credentials.hash, credentials.salt, isoNow()]);
  });
}

export async function initializeDatabase() {
  await initializePostgres();
  await syncPlatformAdminFromEnvironment();
  const admins = await query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'PLATFORM_ADMIN'");
  if (process.env.NODE_ENV === 'production' && !admins.rows[0].total) {
    throw new Error('Nenhum administrador SaaS configurado. Defina AIMERC_ADMIN_EMAIL e AIMERC_ADMIN_PASSWORD.');
  }
}

export async function databaseHealth() {
  const result = await query('SELECT 1 AS healthy');
  return result.rows[0]?.healthy === 1;
}

export async function findUserByEmail(email) {
  return (await query('SELECT * FROM users WHERE email = $1', [email])).rows[0] || null;
}

export async function findUserById(id) {
  return (await query('SELECT * FROM users WHERE id = $1', [id])).rows[0] || null;
}

export async function updateUserPassword(id, password) {
  const credentials = hashPassword(password);
  await query('UPDATE users SET password_hash=$1, password_salt=$2 WHERE id=$3', [credentials.hash, credentials.salt, id]);
}

export async function getStore(id) {
  return mapStore((await query('SELECT * FROM stores WHERE id = $1', [id])).rows[0]);
}

export async function getStoreBySlug(slug) {
  return mapStore((await query('SELECT * FROM stores WHERE slug = $1', [slug])).rows[0]);
}

export async function updateStoreSettings(id, input) {
  const categoryAliasesJson = typeof input.categoryAliases === 'object' && input.categoryAliases !== null
    ? JSON.stringify(input.categoryAliases)
    : (typeof input.categoryAliases === 'string' ? input.categoryAliases : '{}');

  await query(`UPDATE stores SET minimum_order=$1, delivery_fee=$2, free_delivery_above=$3,
    support_phone=$4, cancellation_window_minutes=$5, is_open=$6, enable_pickup_scheduling=$7, pickup_slots=$8,
    disabled_categories=$9, disable_promotions=$10, business_hours_start=$11, business_hours_end=$12,
    business_days=$13, accept_after_hours=$14, category_aliases=$15 WHERE id=$16`,
  [
    input.minimumOrder,
    input.deliveryFee,
    input.freeDeliveryAbove,
    input.supportPhone,
    input.cancellationWindowMinutes,
    input.open ? 1 : 0,
    input.enablePickupScheduling !== false ? 1 : 0,
    String(input.pickupSlots || '').trim() || '08:00 - 10:00, 10:00 - 12:00, 12:00 - 14:00, 14:00 - 16:00, 16:00 - 18:00, 18:00 - 20:00',
    String(input.disabledCategories || '').trim(),
    input.disablePromotions ? 1 : 0,
    input.businessHoursStart || '08:00',
    input.businessHoursEnd || '20:00',
    input.businessDays || '1,2,3,4,5,6',
    input.acceptAfterHours !== false ? 1 : 0,
    categoryAliasesJson,
    id
  ]);
  return getStore(id);
}

export async function listDeliveryZones(storeId, executor = { query }) {
  const result = await executor.query(`SELECT * FROM delivery_zones WHERE store_id=$1
    ORDER BY city, neighborhood, state`, [storeId]);
  return result.rows.map(mapDeliveryZone);
}

export async function replaceDeliveryZones(storeId, zones) {
  const now = isoNow();
  return transaction(async client => {
    await client.query('DELETE FROM delivery_zones WHERE store_id=$1', [storeId]);
    for (const zone of zones) {
      await client.query(`INSERT INTO delivery_zones
        (id,store_id,neighborhood,neighborhood_normalized,city,city_normalized,state,fee,active,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`, [
        `zone_${crypto.randomUUID().slice(0, 12)}`,
        storeId,
        zone.neighborhood,
        normalizeDeliveryArea(zone.neighborhood),
        zone.city || '',
        normalizeDeliveryArea(zone.city),
        zone.state || '',
        zone.fee,
        zone.active === false ? 0 : 1,
        now
      ]);
    }
    return listDeliveryZones(storeId, client);
  });
}

export async function quoteDeliveryFee(store, address, subtotal, executor = { query }) {
  const zones = await listDeliveryZones(store.id, executor);
  return calculateDeliveryFee({ store, zones, address, subtotal });
}

export async function listStores() {
  return (await query('SELECT * FROM stores ORDER BY created_at DESC')).rows.map(mapStore);
}

export async function createStore(input) {
  const id = `store_${crypto.randomUUID().slice(0, 12)}`;
  const now = isoNow();
  const credentials = hashPassword(input.password);
  await transaction(async client => {
    await client.query(`INSERT INTO stores
      (id, slug, name, owner, email, phone, city, state, status, plan, monthly_price, minimum_order,
       delivery_fee, free_delivery_above, support_phone, cancellation_window_minutes, brand_primary,
       brand_accent, brand_background, is_open, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'TRIAL',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,1,$19)`,
    [id, input.slug, input.name, input.owner, input.email, input.phone, input.city, input.state, input.plan,
      input.monthlyPrice, input.minimumOrder, input.deliveryFee, input.freeDeliveryAbove || 0,
      input.supportPhone || input.phone, input.cancellationWindowMinutes || 5, input.brandColors.primary,
      input.brandColors.accent, input.brandColors.background, now]);
    await client.query(`INSERT INTO subscriptions
      (id, store_id, plan, status, amount, billing_method, next_due_date, created_at)
      VALUES ($1,$2,$3,'TRIAL',$4,$5,$6,$7)`,
    [`sub_${crypto.randomUUID().slice(0, 12)}`, id, input.plan, input.monthlyPrice, input.billingMethod, nextDueDate(), now]);
    await client.query(`INSERT INTO users
      (id, store_id, role, name, email, password_hash, password_salt, created_at)
      VALUES ($1,$2,'STORE_MANAGER',$3,$4,$5,$6,$7)`,
    [`user_${crypto.randomUUID().slice(0, 12)}`, id, input.owner, input.email, credentials.hash, credentials.salt, now]);
  });
  return getStore(id);
}

export async function updateStore(id, input) {
  await transaction(async client => {
    await client.query(`UPDATE stores SET
      name=$1, owner=$2, email=$3, phone=$4, city=$5, state=$6, plan=$7, monthly_price=$8,
      minimum_order=$9, delivery_fee=$10, support_phone=$11
      WHERE id=$12`,
      [input.name, input.owner, input.email, input.phone, input.city, input.state, input.plan,
       input.monthlyPrice, input.minimumOrder, input.deliveryFee, input.supportPhone || input.phone, id]);
       
    await client.query(`UPDATE subscriptions SET plan=$1, amount=$2 WHERE store_id=$3 AND status != 'CANCELLED'`, [input.plan, input.monthlyPrice, id]);
    await client.query(`UPDATE users SET name=$1, email=$2 WHERE store_id=$3`, [input.owner, input.email, id]);
  });
  return getStore(id);
}

export async function updateStorePassword(id, password) {
  const credentials = hashPassword(password);
  const result = await query(`UPDATE users SET password_hash=$1, password_salt=$2 WHERE store_id=$3`, [credentials.hash, credentials.salt, id]);
  if (result.rowCount === 0) {
    throw new Error('Nenhum usuario encontrado para este supermercado');
  }
}

export async function updateStoreStatus(id, status) {
  await transaction(async client => {
    await client.query('UPDATE stores SET status=$1 WHERE id=$2', [status, id]);
    await client.query('UPDATE subscriptions SET status=$1 WHERE store_id=$2', [status, id]);
  });
  return getStore(id);
}

export async function updateStoreBranding(id, colors) {
  await query('UPDATE stores SET brand_primary=$1, brand_accent=$2, brand_background=$3 WHERE id=$4',
    [colors.primary, colors.accent, colors.background, id]);
  return getStore(id);
}

export async function deleteStore(id, actorId) {
  return transaction(async client => {
    const result = await client.query('SELECT * FROM stores WHERE id=$1 FOR UPDATE', [id]);
    const store = result.rows[0];
    if (!store) return null;
    await client.query(`INSERT INTO audit_logs (store_id,actor_id,action,entity_type,entity_id,metadata)
      VALUES (NULL,$1,'STORE_DELETED','STORE',$2,$3::jsonb)`, [
      actorId,
      store.id,
      JSON.stringify({ storeId: store.id, slug: store.slug, name: store.name, email: store.email })
    ]);
    await client.query('DELETE FROM stores WHERE id=$1', [id]);
    return mapStore(store);
  });
}

export async function listSubscriptions() {
  const result = await query(`SELECT subscriptions.*, stores.name AS store_name
    FROM subscriptions JOIN stores ON stores.id=subscriptions.store_id ORDER BY subscriptions.created_at DESC`);
  return result.rows.map(row => ({
    id: row.id, storeId: row.store_id, storeName: row.store_name, plan: row.plan, status: row.status,
    amount: Number(row.amount), billingMethod: row.billing_method, nextDueDate: row.next_due_date, externalId: row.external_id
  }));
}

export async function listBanners(storeId, includeInactive = false) {
  const result = await query(`SELECT * FROM banners WHERE store_id=$1 ${includeInactive ? '' : 'AND active=1'} ORDER BY position, created_at`, [storeId]);
  return result.rows.map(mapBanner);
}

export async function createBanner(storeId, input) {
  const id = `banner_${crypto.randomUUID().slice(0, 12)}`;
  const now = isoNow();
  const result = await query(`INSERT INTO banners
    (store_id,id,eyebrow,title,subtitle,image,active,position,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
  [storeId, id, input.eyebrow, input.title, input.subtitle, input.image, input.active ? 1 : 0, input.position, now]);
  return mapBanner(result.rows[0]);
}

export async function updateBanner(storeId, id, input) {
  const result = await query(`UPDATE banners SET eyebrow=$3,title=$4,subtitle=$5,image=$6,active=$7,position=$8,updated_at=$9
    WHERE store_id=$1 AND id=$2 RETURNING *`,
  [storeId, id, input.eyebrow, input.title, input.subtitle, input.image, input.active ? 1 : 0, input.position, isoNow()]);
  return result.rowCount ? mapBanner(result.rows[0]) : null;
}

export async function deleteBanner(storeId, id) {
  return (await query('DELETE FROM banners WHERE store_id=$1 AND id=$2', [storeId, id])).rowCount > 0;
}

export async function listPushCampaigns(storeId) {
  return (await query('SELECT * FROM push_campaigns WHERE store_id=$1 ORDER BY created_at DESC', [storeId])).rows.map(mapPushCampaign);
}

export async function listPendingPushCampaigns(storeId, now = new Date()) {
  return (await query("SELECT * FROM push_campaigns WHERE store_id=$1 AND status='SCHEDULED' AND scheduled_at <= $2 ORDER BY scheduled_at", [storeId, now.toISOString()])).rows.map(mapPushCampaign);
}

export async function createPushCampaign(storeId, input) {
  const id = `push_${crypto.randomUUID().slice(0, 12)}`;
  const now = isoNow();
  const result = await query(`INSERT INTO push_campaigns
    (store_id,id,title,body,audience,status,scheduled_at,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
  [storeId, id, input.title, input.body, input.audience, input.status, input.scheduledAt || null, now]);
  return mapPushCampaign(result.rows[0]);
}

export async function updatePushCampaign(storeId, id, input) {
  const result = await query(`UPDATE push_campaigns SET title=$3,body=$4,audience=$5,status=$6,scheduled_at=$7,updated_at=$8
    WHERE store_id=$1 AND id=$2 RETURNING *`,
  [storeId, id, input.title, input.body, input.audience, input.status, input.scheduledAt || null, isoNow()]);
  return result.rowCount ? mapPushCampaign(result.rows[0]) : null;
}

export async function deletePushCampaign(storeId, id) {
  return (await query('DELETE FROM push_campaigns WHERE store_id=$1 AND id=$2', [storeId, id])).rowCount > 0;
}

export async function getPushCampaign(storeId, id) {
  const row = (await query('SELECT * FROM push_campaigns WHERE store_id=$1 AND id=$2', [storeId, id])).rows[0];
  return row ? mapPushCampaign(row) : null;
}

export async function markPushCampaignResult(storeId, id, result) {
  const status = result.failureCount === 0 ? 'SENT' : result.successCount > 0 ? 'PARTIAL' : 'FAILED';
  const now = isoNow();
  await transaction(async client => {
    await client.query(`UPDATE push_campaigns SET status=$3,sent_at=$4,success_count=$5,failure_count=$6,send_error=$7,updated_at=$4
      WHERE store_id=$1 AND id=$2`, [storeId, id, status, now, result.successCount, result.failureCount, result.error || null]);
    if (result.invalidTokens?.length) {
      await client.query('UPDATE push_devices SET active=0 WHERE store_id=$1 AND token=ANY($2::text[])', [storeId, result.invalidTokens]);
    }
  });
  return getPushCampaign(storeId, id);
}

export async function registerPushDevice(storeId, input) {
  const now = isoNow();
  await query(`INSERT INTO push_devices (store_id,token,platform,customer_phone,active,created_at,last_seen_at)
    VALUES ($1,$2,'ANDROID',$3,1,$4,$4)
    ON CONFLICT(store_id,token) DO UPDATE SET customer_phone=EXCLUDED.customer_phone,active=1,last_seen_at=EXCLUDED.last_seen_at`,
  [storeId, input.token, input.customerPhone || '', now]);
  return { registered: true };
}

export async function listActivePushDevices(storeId) {
  const rows = (await query('SELECT token,customer_phone FROM push_devices WHERE store_id=$1 AND active=1 ORDER BY last_seen_at DESC', [storeId])).rows;
  return rows.map(row => ({ token: row.token, customerPhone: row.customer_phone }));
}

function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export async function listActivePushDevicesForPhone(storeId, phone) {
  const target = phoneDigits(phone);
  if (target.length < 8) return [];
  const devices = await listActivePushDevices(storeId);
  return devices.filter(device => {
    const digits = phoneDigits(device.customerPhone);
    if (digits.length < 8) return false;
    return digits === target || digits.endsWith(target) || target.endsWith(digits);
  });
}

export async function deactivatePushTokens(storeId, tokens) {
  if (!tokens?.length) return;
  await query('UPDATE push_devices SET active=0 WHERE store_id=$1 AND token=ANY($2::text[])', [storeId, tokens]);
}

const storeVisitorIps = new Map();

export function trackStoreIp(storeId, ip) {
  if (!ip) return;
  if (!storeVisitorIps.has(storeId)) storeVisitorIps.set(storeId, new Map());
  storeVisitorIps.get(storeId).set(ip, Date.now());
}

function getActiveIpCount(storeId, minutes = 15) {
  const ips = storeVisitorIps.get(storeId);
  if (!ips) return 0;
  const cutoff = Date.now() - (minutes * 60 * 1000);
  let count = 0;
  for (const [ip, time] of ips) {
    if (time >= cutoff) count++;
    else ips.delete(ip);
  }
  return count;
}

export async function pushDeviceSummary(storeId) {
  const row = (await query(`SELECT
    COUNT(*) FILTER (WHERE active=1 AND last_seen_at::timestamptz >= NOW()-INTERVAL '30 days')::int AS installed_devices,
    COUNT(*) FILTER (WHERE active=1 AND last_seen_at::timestamptz >= NOW()-INTERVAL '24 hours')::int AS seen_today
    FROM push_devices WHERE store_id=$1`, [storeId])).rows[0];
  return {
    installedDevices: Number(row.installed_devices || 0),
    onlineDevices: getActiveIpCount(storeId, 3),
    seenToday: Number(row.seen_today || 0),
    onlineWindowMinutes: 3
  };
}

export async function listPushAutomations(storeId) {
  return (await query('SELECT * FROM push_automations WHERE store_id=$1 ORDER BY active DESC,created_at DESC', [storeId])).rows.map(mapPushAutomation);
}

export async function createPushAutomation(storeId, input) {
  const id = `automation_${crypto.randomUUID().slice(0, 12)}`;
  const now = isoNow();
  const result = await query(`INSERT INTO push_automations
    (store_id,id,name,title,body,trigger_type,audience,send_time,weekday,inactive_days,active,next_run_at,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *`,
  [storeId, id, input.name, input.title, input.body, input.triggerType, input.audience, input.sendTime,
    input.weekday, input.inactiveDays, input.active ? 1 : 0, automationNextRun(input), now]);
  return mapPushAutomation(result.rows[0]);
}

export async function updatePushAutomation(storeId, id, input) {
  const result = await query(`UPDATE push_automations SET name=$3,title=$4,body=$5,trigger_type=$6,audience=$7,
    send_time=$8,weekday=$9,inactive_days=$10,active=$11,next_run_at=$12,updated_at=$13
    WHERE store_id=$1 AND id=$2 RETURNING *`,
  [storeId, id, input.name, input.title, input.body, input.triggerType, input.audience, input.sendTime,
    input.weekday, input.inactiveDays, input.active ? 1 : 0, automationNextRun(input), isoNow()]);
  return result.rowCount ? mapPushAutomation(result.rows[0]) : null;
}

export async function deletePushAutomation(storeId, id) {
  return (await query('DELETE FROM push_automations WHERE store_id=$1 AND id=$2', [storeId, id])).rowCount > 0;
}

async function enqueueAutomation(client, storeId, automation, now) {
  const timestamp = now.toISOString();
  await client.query(`INSERT INTO push_campaigns
    (store_id,id,title,body,audience,status,scheduled_at,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,'SCHEDULED',$6,$6,$6)`,
  [storeId, `push_${crypto.randomUUID().slice(0, 12)}`, automation.title, automation.body, automation.audience, timestamp]);
  const nextRunAt = automationNextRun({
    triggerType: automation.trigger_type, sendTime: automation.send_time, weekday: automation.weekday
  }, new Date(now.getTime() + 60_000));
  await client.query(`UPDATE push_automations SET last_run_at=$3,next_run_at=$4,updated_at=$3
    WHERE store_id=$1 AND id=$2`, [storeId, automation.id, timestamp, nextRunAt]);
}

export async function runDuePushAutomations(storeId, now = new Date()) {
  return transaction(async client => {
    const due = await client.query(`SELECT * FROM push_automations WHERE store_id=$1 AND active=1 AND next_run_at <= $2 FOR UPDATE SKIP LOCKED`,
      [storeId, now.toISOString()]);
    for (const automation of due.rows) await enqueueAutomation(client, storeId, automation, now);
    return due.rowCount;
  });
}

export async function runPushAutomationNow(storeId, id) {
  return transaction(async client => {
    const result = await client.query('SELECT * FROM push_automations WHERE store_id=$1 AND id=$2 FOR UPDATE', [storeId, id]);
    if (!result.rowCount) return null;
    await enqueueAutomation(client, storeId, result.rows[0], new Date());
    return mapPushAutomation((await client.query('SELECT * FROM push_automations WHERE store_id=$1 AND id=$2', [storeId, id])).rows[0]);
  });
}

export async function listProducts(storeId, filters = {}) {
  const clauses = ['p.store_id=$1'];
  const values = [storeId];
  if (!filters.includeInactive) clauses.push('p.active=1');
  if (!filters.includeHidden) clauses.push('p.catalog_visible=1');
  if (filters.sellable) {
    clauses.push('p.price>=0.001');
    clauses.push(`COALESCE(
      CASE WHEN upper(p.unit)='KG' AND p.sale_mode<>'UNIT' THEN p.catalog_stock END,
      p.stock
    )>0`);
  }
  if (filters.q) {
    values.push(`%${String(filters.q).toLowerCase()}%`);
    const index = values.length;
    clauses.push(`(lower(COALESCE(NULLIF(p.catalog_name,''),p.source_name,p.name)) LIKE $${index} OR lower(p.sku) LIKE $${index} OR p.barcode LIKE $${index} OR lower(COALESCE(NULLIF(p.catalog_category,''),p.source_category,p.category)) LIKE $${index})`);
  }
  if (filters.promoOnly) clauses.push('p.promo=1');
  if (filters.withoutImage) {
    clauses.push(`pi.product_id IS NULL AND ca.ean IS NULL AND COALESCE(p.image, '') = ''`);
  }
  if (filters.localEan) {
    clauses.push(`(COALESCE(p.barcode, '') = '' OR length(regexp_replace(COALESCE(p.barcode, ''), '\\D', '', 'g')) < 8 OR p.barcode = p.sku)`);
  }
  if (filters.category && filters.category !== 'Todos') {
    values.push(normalizeCategory(filters.category));
    clauses.push(`COALESCE(NULLIF(p.catalog_category,''),p.source_category,p.category) = $${values.length}`);
  }
  if (filters.since) {
    values.push(String(filters.since));
    clauses.push(`p.updated_at > $${values.length}`);
  }

  const limit = Number.isFinite(Number(filters.limit)) ? Math.min(500, Math.max(1, Number(filters.limit))) : null;
  const offset = Number.isFinite(Number(filters.offset)) ? Math.max(0, Number(filters.offset)) : 0;

  const result = await query(`
    SELECT p.*,
      (pi.product_id IS NOT NULL) AS has_stored_image,
      (ca.ean IS NOT NULL) AS has_catalog_image
    FROM products p
    LEFT JOIN product_images pi
      ON pi.store_id = p.store_id AND pi.product_id = p.id
    LEFT JOIN catalog_assets ca
      ON ca.ean = p.barcode
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      CASE WHEN (COALESCE(p.image,'') <> '' OR pi.product_id IS NOT NULL OR ca.ean IS NOT NULL) THEN 0 ELSE 1 END,
      p.promo DESC,
      COALESCE(NULLIF(p.catalog_name,''),p.source_name,p.name)
    ${limit ? `LIMIT $${values.length + 1} OFFSET $${values.length + 2}` : ''}
  `, limit ? [...values, limit, offset] : values);

  const store = await getStore(storeId);
  const disabledCats = new Set(
    String(store?.disabledCategories || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  );

  let filteredList = result.rows.map(row => {
    const product = mapProduct(row);
    if (store?.disablePromotions) product.promo = false;
    return product;
  });

  if (!filters.includeDisabled && disabledCats.size > 0) {
    filteredList = filteredList.filter(p => !disabledCats.has(String(p.category || '').toLowerCase()));
  }

  return filteredList;
}

export async function countProducts(storeId, filters = {}) {
  const clauses = ['p.store_id=$1'];
  const values = [storeId];
  if (!filters.includeInactive) clauses.push('p.active=1');
  if (!filters.includeHidden) clauses.push('p.catalog_visible=1');
  if (filters.q) {
    values.push(`%${String(filters.q).toLowerCase()}%`);
    const index = values.length;
    clauses.push(`(lower(COALESCE(NULLIF(p.catalog_name,''),p.source_name,p.name)) LIKE $${index} OR lower(p.sku) LIKE $${index} OR p.barcode LIKE $${index} OR lower(COALESCE(NULLIF(p.catalog_category,''),p.source_category,p.category)) LIKE $${index})`);
  }
  if (filters.promoOnly) clauses.push('p.promo=1');
  if (filters.withoutImage) {
    clauses.push(`NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.store_id=p.store_id AND pi.product_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM catalog_assets ca WHERE ca.ean=p.barcode)
      AND COALESCE(p.image, '') = ''`);
  }
  if (filters.localEan) {
    clauses.push(`(COALESCE(p.barcode, '') = '' OR length(regexp_replace(COALESCE(p.barcode, ''), '\\D', '', 'g')) < 8 OR p.barcode = p.sku)`);
  }
  if (filters.category && filters.category !== 'Todos') {
    values.push(normalizeCategory(filters.category));
    clauses.push(`COALESCE(NULLIF(p.catalog_category,''),p.source_category,p.category) = $${values.length}`);
  }
  const total = (await query(`SELECT COUNT(*)::int AS total FROM products p WHERE ${clauses.join(' AND ')}`, values)).rows[0]?.total || 0;
  return Number(total);
}

export async function getProduct(storeId, productId) {
  const row = (await query(`SELECT p.*,EXISTS(
    SELECT 1 FROM product_images pi WHERE pi.store_id=p.store_id AND pi.product_id=p.id
  ) AS has_stored_image,EXISTS(
    SELECT 1 FROM catalog_assets ca WHERE ca.ean=p.barcode
    ) AS has_catalog_image FROM products p WHERE p.store_id=$1 AND p.id=$2`, [storeId, productId])).rows[0];
  if (!row) return null;
  const product = mapProduct(row);
  if (!product.hasCatalogImage) {
    const virtualEan = getVirtualEan(product.name, product.category);
    if (virtualEan) {
      const virtualExists = await query("SELECT 1 FROM catalog_assets WHERE ean = $1 LIMIT 1", [virtualEan]);
      if (virtualExists.rowCount > 0) {
        product.hasCatalogImage = true;
      }
    }
  }
  return product;
}

export async function upsertProducts(storeId, items) {
  return transaction(async client => {
    const existing = new Set((await client.query('SELECT sku FROM products WHERE store_id=$1', [storeId])).rows.map(row => row.sku));
    let created = 0;
    let updated = 0;
    const now = isoNow();
    for (let offset = 0; offset < items.length; offset += 500) {
      const batch = items.slice(offset, offset + 500);
      const values = [];
      const rows = batch.map((item, rowIndex) => {
        // EANs can be shared by ERP variants; SKU is the stable identity inside a store.
        const id = `${storeId}:${item.sku}`;
        const cells = [storeId, id, item.sku, item.barcode, item.name, item.category, item.name, item.category, item.price, item.oldPrice,
          item.stock, item.unit, item.image, item.promo ? 1 : 0, item.active === false ? 0 : 1, now];
        values.push(...cells);
        const start = rowIndex * cells.length;
        return `(${cells.map((_, index) => `$${start + index + 1}`).join(',')})`;
      });
      await client.query(`INSERT INTO products
        (store_id,id,sku,barcode,name,category,source_name,source_category,price,old_price,stock,unit,image,promo,active,updated_at)
        VALUES ${rows.join(',')}
        ON CONFLICT(store_id,sku) DO UPDATE SET barcode=EXCLUDED.barcode,name=EXCLUDED.name,category=EXCLUDED.category,
          source_name=EXCLUDED.source_name,source_category=EXCLUDED.source_category,
          price=EXCLUDED.price,old_price=EXCLUDED.old_price,stock=EXCLUDED.stock,unit=EXCLUDED.unit,image=EXCLUDED.image,
          promo=EXCLUDED.promo,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at`, values);
      for (const item of batch) existing.has(item.sku) ? updated += 1 : created += 1;
    }
    const total = Number((await client.query('SELECT COUNT(*)::int AS total FROM products WHERE store_id=$1', [storeId])).rows[0].total);
    return { created, updated, total };
  });
}

export async function updateProductCatalog(storeId, productId, input) {
  const result = await query(`UPDATE products SET catalog_name=$3,catalog_category=$4,description=$5,
    catalog_visible=$6,sale_mode=$7,quantity_step=$8,
    catalog_stock=CASE
      WHEN upper(unit)='KG' AND $7::text<>'UNIT' THEN $9::double precision
      ELSE NULL::double precision
    END,
    updated_at=$10 WHERE store_id=$1 AND id=$2 RETURNING *`, [
    storeId, productId, input.catalogName || null, input.catalogCategory || null, input.description || '',
    input.catalogVisible ? 1 : 0, input.saleMode || 'AUTO', input.quantityStep || 0.1,
    input.stockOverride, isoNow()
  ]);
  return result.rowCount ? getProduct(storeId, productId) : null;
}

export async function updateProductsBulkSaleMode(storeId, productIds, input) {
  await query(`UPDATE products SET sale_mode=$3, quantity_step=$4, updated_at=$5 WHERE store_id=$1 AND id=ANY($2::text[])`, [
    storeId, productIds, input.saleMode || 'AUTO', input.quantityStep || 0.1, isoNow()
  ]);
}

export async function listProductCategories(storeId, includeDisabled = false) {
  const store = await getStore(storeId);
  const disabledCats = new Set(
    String(store?.disabledCategories || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  );
  const aliases = store?.categoryAliases || {};

  const result = await query(`SELECT COALESCE(NULLIF(catalog_category,''),source_category,category) AS name,
    COUNT(*)::int AS total FROM products WHERE store_id=$1 GROUP BY 1 ORDER BY 1`, [storeId]);
  const totals = new Map();
  for (const row of result.rows) {
    const name = normalizeCategory(row.name);
    if (!includeDisabled && disabledCats.has(name.toLowerCase())) continue;
    totals.set(name, (totals.get(name) || 0) + Number(row.total));
  }
  return [...totals].map(([name, total]) => {
    const alias = aliases[name] || '';
    return {
      name,
      displayName: alias || name,
      alias,
      isAliased: Boolean(alias),
      isHidden: disabledCats.has(name.toLowerCase()),
      total
    };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, 'pt-BR'));
}

function mapStoreIntegration(row) {
  if (!row) return null;
  return {
    storeId: row.store_id,
    providerCode: row.provider_code || 'GENERIC_JSON',
    providerName: row.provider_name,
    connectionMode: row.connection_mode || 'LOCAL_AGENT',
    endpointUrl: row.endpoint_url,
    authType: row.auth_type,
    authHeader: row.auth_header,
    hasSecret: Boolean(row.encrypted_secret),
    fieldMapping: row.field_mapping || {},
    syncIntervalSeconds: Number(row.sync_interval_seconds || 300),
    enabled: Boolean(row.enabled),
    lastSyncAt: row.last_sync_at,
    lastSyncStatus: row.last_sync_status,
    lastSyncMessage: row.last_sync_message
  };
}

export async function getStoreIntegration(storeId, includeSecret = false) {
  const row = (await query('SELECT * FROM store_integrations WHERE store_id=$1', [storeId])).rows[0];
  if (!row) return null;
  return includeSecret ? row : mapStoreIntegration(row);
}

export async function saveStoreIntegration(storeId, input) {
  const now = isoNow();
  const result = await query(`INSERT INTO store_integrations
    (store_id,provider_code,provider_name,connection_mode,endpoint_url,auth_type,auth_header,encrypted_secret,
     field_mapping,sync_interval_seconds,enabled,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$12)
    ON CONFLICT(store_id) DO UPDATE SET provider_code=EXCLUDED.provider_code,provider_name=EXCLUDED.provider_name,
      connection_mode=EXCLUDED.connection_mode,endpoint_url=EXCLUDED.endpoint_url,
      auth_type=EXCLUDED.auth_type,auth_header=EXCLUDED.auth_header,
      encrypted_secret=CASE WHEN EXCLUDED.encrypted_secret='' THEN store_integrations.encrypted_secret ELSE EXCLUDED.encrypted_secret END,
      field_mapping=EXCLUDED.field_mapping,sync_interval_seconds=EXCLUDED.sync_interval_seconds,
      enabled=EXCLUDED.enabled,updated_at=EXCLUDED.updated_at RETURNING *`, [
    storeId, input.providerCode, input.providerName, input.connectionMode, input.endpointUrl, input.authType,
    input.authHeader, input.encryptedSecret, JSON.stringify(input.fieldMapping), input.syncIntervalSeconds,
    input.enabled ? 1 : 0, now
  ]);
  return mapStoreIntegration(result.rows[0]);
}

export async function recordStoreIntegrationSync(storeId, status, message) {
  await query(`UPDATE store_integrations SET last_sync_at=$2,last_sync_status=$3,last_sync_message=$4,updated_at=$2 WHERE store_id=$1`,
    [storeId, isoNow(), status, String(message || '').slice(0, 500)]);
}

function mapIntegrationAgent(row, options = {}) {
  if (!row) return null;
  const lastSeen = row.last_seen_at ? new Date(row.last_seen_at) : null;
  // Agentes antigos so fazem heartbeat no ciclo de sync. Janela = 2x o intervalo + 30s
  // (minimo 3 min). Assim nao fica falso OFFLINE entre syncs; offline real ainda aparece.
  const syncIntervalSeconds = Math.max(
    30,
    Number(options.syncIntervalSeconds ?? row.sync_interval_seconds) || 300
  );
  const onlineWindowMs = Math.max(3 * 60_000, (syncIntervalSeconds * 2 + 30) * 1_000);
  const online = lastSeen && Date.now() - lastSeen.getTime() < onlineWindowMs;
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    providerCode: row.provider_code,
    version: row.version || '',
    status: row.status === 'REVOKED' ? 'REVOKED' : online ? 'ONLINE' : lastSeen ? 'OFFLINE' : 'PENDING',
    capabilities: row.capabilities || [],
    lastIp: row.last_ip || '',
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    onlineWindowSeconds: Math.round(onlineWindowMs / 1_000)
  };
}

export async function createIntegrationAgent(storeId, input) {
  const id = `agent_${crypto.randomUUID().slice(0, 16)}`;
  const token = `aima_${crypto.randomBytes(32).toString('base64url')}`;
  const now = isoNow();
  await transaction(async client => {
    await client.query("UPDATE integration_agents SET status='REVOKED',updated_at=$2 WHERE store_id=$1 AND status<>'REVOKED'", [storeId, now]);
    await client.query(`INSERT INTO integration_agents
      (id,store_id,name,provider_code,token_hash,status,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$6)`, [id, storeId, input.name, input.providerCode, tokenHash(token), now]);
  });
  const agent = mapIntegrationAgent((await query('SELECT * FROM integration_agents WHERE id=$1', [id])).rows[0]);
  return { agent, token };
}

export async function findIntegrationAgentByToken(token) {
  if (!token) return null;
  const row = (await query("SELECT * FROM integration_agents WHERE token_hash=$1 AND status<>'REVOKED'", [tokenHash(token)])).rows[0];
  return mapIntegrationAgent(row);
}

export async function heartbeatIntegrationAgent(agentId, input) {
  const result = await query(`UPDATE integration_agents SET version=$2,status='ONLINE',capabilities=$3::jsonb,
    last_ip=$4,last_seen_at=NOW(),updated_at=NOW() WHERE id=$1 AND status<>'REVOKED' RETURNING *`,
  [agentId, input.version || '', JSON.stringify(input.capabilities || []), input.ip || '']);
  return mapIntegrationAgent(result.rows[0]);
}

export async function listIntegrationOverview() {
  const integrations = (await query(`SELECT i.*,s.id AS store_id,s.name AS store_name,s.slug,s.status AS store_status,
    a.id AS agent_id,a.name AS agent_name,a.version AS agent_version,a.status AS agent_status,
    a.capabilities AS agent_capabilities,a.last_ip AS agent_last_ip,a.last_seen_at AS agent_last_seen_at,
    a.created_at AS agent_created_at
    FROM stores s LEFT JOIN store_integrations i ON i.store_id=s.id
    LEFT JOIN LATERAL (SELECT * FROM integration_agents ia WHERE ia.store_id=s.id AND ia.status<>'REVOKED'
      ORDER BY ia.created_at DESC LIMIT 1) a ON TRUE ORDER BY s.created_at DESC`)).rows;
  const runs = (await query(`SELECT DISTINCT ON (store_id) * FROM integration_runs ORDER BY store_id,started_at DESC`)).rows;
  const runByStore = new Map(runs.map(row => [row.store_id, {
    id: row.id, status: row.status, received: Number(row.received_count), created: Number(row.created_count),
    updated: Number(row.updated_count), errors: Number(row.error_count), message: row.message,
    startedAt: row.started_at, finishedAt: row.finished_at
  }]));
  return integrations.map(row => ({
    store: { id: row.store_id, name: row.store_name, slug: row.slug, status: row.store_status },
    integration: row.provider_name ? mapStoreIntegration(row) : null,
    agent: row.agent_id ? mapIntegrationAgent({
      id: row.agent_id, store_id: row.store_id, name: row.agent_name, provider_code: row.provider_code,
      version: row.agent_version, status: row.agent_status, capabilities: row.agent_capabilities,
      last_ip: row.agent_last_ip, last_seen_at: row.agent_last_seen_at, created_at: row.agent_created_at
    }, { syncIntervalSeconds: row.sync_interval_seconds }) : null,
    lastRun: runByStore.get(row.store_id) || null
  }));
}

export async function recordIntegrationRun(agent, result, input = {}) {
  const id = `run_${crypto.randomUUID().slice(0, 16)}`;
  await query(`INSERT INTO integration_runs
    (id,store_id,agent_id,provider_code,status,received_count,created_count,updated_count,error_count,message,started_at,finished_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`, [
    id, agent.storeId, agent.id, agent.providerCode, input.status || 'COMPLETED', Number(input.received || 0),
    Number(result.created || 0), Number(result.updated || 0), Number(input.errors || 0),
    String(input.message || '').slice(0, 500), input.startedAt || isoNow()
  ]);
  await recordStoreIntegrationSync(agent.storeId, input.status || 'SUCCESS', input.message || `${input.received || 0} produtos recebidos`);
  return id;
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

function hydrateOrder(row, items = []) {
  return {
    id: row.id,
    customer: {
      name: row.customer_name, phone: row.customer_phone, address: formattedAddress(row), cep: row.customer_cep || '',
      street: row.customer_street || '', number: row.customer_number || '', complement: row.customer_complement || '',
      neighborhood: row.customer_neighborhood || '', city: row.customer_city || '', state: row.customer_state || '',
      reference: row.customer_reference || ''
    },
    fulfillmentType: row.fulfillment_type,
    paymentMethod: row.payment_method,
    changeFor: row.change_for == null ? null : Number(row.change_for),
    notes: row.notes,
    scheduledTo: row.scheduled_to,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    status: row.status,
    cancelledBy: row.cancelled_by || null,
    cancelledAt: row.cancelled_at || null,
    cancelReason: row.cancel_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map(item => ({
      productId: item.product_id, name: item.name, unit: item.unit, quantity: Number(item.quantity),
      price: Number(item.price), total: Number(item.total)
    }))
  };
}

function customerOrderView(store, row, items) {
  const order = hydrateOrder(row, items);
  const windowEndsAt = new Date(new Date(row.created_at).getTime() + store.cancellationWindowMinutes * 60_000).toISOString();
  const statusAllowsCancellation = row.status === 'RECEIVED';
  const eligible = statusAllowsCancellation && Date.now() <= new Date(windowEndsAt).getTime();
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

async function orderItems(client, storeId, orderIds) {
  if (!orderIds.length) return new Map();
  const result = await client.query('SELECT * FROM order_items WHERE store_id=$1 AND order_id=ANY($2::text[]) ORDER BY id', [storeId, orderIds]);
  const grouped = new Map(orderIds.map(id => [id, []]));
  for (const item of result.rows) grouped.get(item.order_id)?.push(item);
  return grouped;
}

export async function getTrackedOrder(storeId, orderId, trackingToken) {
  const hash = tokenHash(trackingToken);
  const result = await query(`SELECT * FROM orders WHERE store_id=$1 AND id=$2 AND (tracking_token_hash=$3 OR tracking_token=$4)`,
    [storeId, orderId, hash, trackingToken]);
  if (!result.rowCount) return null;
  const [store, items] = await Promise.all([getStore(storeId), orderItems({ query }, storeId, [orderId])]);
  if (!store) return null;
  if (!result.rows[0].tracking_token_hash) {
    await query('UPDATE orders SET tracking_token_hash=$3,tracking_token=NULL WHERE store_id=$1 AND id=$2', [storeId, orderId, hash]);
  }
  return customerOrderView(store, result.rows[0], items.get(orderId));
}

export async function listOrders(storeId, filters = {}) {
  const clauses = ['store_id=$1'];
  const values = [storeId];
  if (filters.status) { values.push(filters.status); clauses.push(`status=$${values.length}`); }
  if (filters.fulfillmentType) { values.push(filters.fulfillmentType); clauses.push(`fulfillment_type=$${values.length}`); }
  const rows = (await query(`SELECT * FROM orders WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 250`, values)).rows;
  const items = await orderItems({ query }, storeId, rows.map(row => row.id));
  return rows.map(row => hydrateOrder(row, items.get(row.id)));
}

export async function reportDeliveries(storeId, start, end) {
  const rows = (await query(`SELECT * FROM orders WHERE store_id=$1 AND status='DONE' AND fulfillment_type='DELIVERY' AND updated_at >= $2 AND updated_at <= $3 ORDER BY updated_at DESC`, [storeId, start, end])).rows;
  const items = await orderItems({ query }, storeId, rows.map(row => row.id));
  return rows.map(row => hydrateOrder(row, items.get(row.id)));
}

export async function createOrder(store, input) {
  const trackingToken = crypto.randomBytes(24).toString('base64url');
  return transaction(async client => {
    const quantities = new Map();
    for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
    const normalizedItems = [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
    const productIds = normalizedItems.map(item => item.productId);
    const productsResult = await client.query(`SELECT * FROM products WHERE store_id=$1 AND id=ANY($2::text[]) AND active=1 AND price>=0.001 FOR UPDATE`,
      [store.id, productIds]);
    const products = new Map(productsResult.rows.map(row => [row.id, row]));
    const items = normalizedItems.map(item => {
      const sourceProduct = products.get(item.productId);
      if (!sourceProduct) throw Object.assign(new Error(`Produto nao encontrado: ${item.productId}`), { status: 400 });
      const product = mapProduct(sourceProduct);
      const quantity = Number(item.quantity);
      const step = product.quantityStep;
      const stepUnits = quantity / step;
      if (!Number.isFinite(quantity) || quantity <= 0 || Math.abs(stepUnits - Math.round(stepUnits)) > 0.000001) {
        const rule = product.soldByWeight ? `${Math.round(step * 1000)} g` : 'unidades inteiras';
        throw Object.assign(new Error(`${product.name} deve ser comprado em passos de ${rule}`), { status: 400 });
      }
      if (quantity > product.stock) throw Object.assign(new Error(`Estoque insuficiente para ${product.name}`), { status: 409 });
      return { product, quantity, total: Number((quantity * Number(product.price)).toFixed(2)) };
    });
    const subtotal = Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2));
    if (subtotal < store.minimumOrder) throw Object.assign(new Error(`Pedido minimo de R$ ${store.minimumOrder.toFixed(2)}`), { status: 400 });
    const deliveryQuote = input.fulfillmentType === 'DELIVERY'
      ? await quoteDeliveryFee(store, input.customer, subtotal, client)
      : { fee: 0 };
    if (deliveryQuote.available === false) {
      throw Object.assign(new Error(deliveryQuote.message || 'Infelizmente, não atendemos à sua localização.'), {
        status: 422,
        details: { code: 'OUTSIDE_DELIVERY_AREA' }
      });
    }
    const deliveryFee = deliveryQuote.fee;
    const id = `AM${Date.now().toString().slice(-8)}${crypto.randomInt(10, 100)}`;
    const now = isoNow();
    const result = await client.query(`INSERT INTO orders
      (store_id,id,tracking_token_hash,customer_name,customer_phone,customer_address,customer_cep,customer_street,
       customer_number,customer_complement,customer_neighborhood,customer_city,customer_state,customer_reference,
       fulfillment_type,payment_method,change_for,notes,scheduled_to,subtotal,delivery_fee,total,status,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'RECEIVED',$23,$23) RETURNING *`,
    [store.id, id, tokenHash(trackingToken), input.customer.name, input.customer.phone, input.customer.address,
      input.customer.cep, input.customer.street, input.customer.number, input.customer.complement, input.customer.neighborhood,
      input.customer.city, input.customer.state, input.customer.reference, input.fulfillmentType, input.paymentMethod,
      input.changeFor, input.notes, input.scheduledTo, subtotal, deliveryFee, subtotal + deliveryFee, now]);
    for (const item of items) {
      await client.query(`INSERT INTO order_items (store_id,order_id,product_id,name,unit,quantity,price,total)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [store.id, id, item.product.id, item.product.name, item.product.unit, item.quantity, item.product.price, item.total]);
      await client.query(`UPDATE products SET
        stock=CASE WHEN catalog_stock IS NULL THEN stock-$3 ELSE stock END,
        catalog_stock=CASE WHEN catalog_stock IS NULL THEN NULL ELSE catalog_stock-$3 END,
        updated_at=$4 WHERE store_id=$1 AND id=$2`,
        [store.id, item.product.id, item.quantity, now]);
    }
    const insertedItems = (await client.query('SELECT * FROM order_items WHERE store_id=$1 AND order_id=$2 ORDER BY id', [store.id, id])).rows;
    return { ...customerOrderView(store, result.rows[0], insertedItems), trackingToken };
  });
}

export async function cancelOrderByCustomer(storeId, orderId, trackingToken) {
  const store = await getStore(storeId);
  if (!store) return null;
  return transaction(async client => {
    const result = await client.query(`SELECT * FROM orders WHERE store_id=$1 AND id=$2
      AND (tracking_token_hash=$3 OR tracking_token=$4) FOR UPDATE`, [storeId, orderId, tokenHash(trackingToken), trackingToken]);
    if (!result.rowCount) return null;
    const current = result.rows[0];
    const windowEndsAt = new Date(new Date(current.created_at).getTime() + store.cancellationWindowMinutes * 60_000);
    if (current.status !== 'RECEIVED' || Date.now() > windowEndsAt.getTime()) {
      const error = new Error('O cancelamento pelo aplicativo nao esta mais disponivel. Ligue para a central da loja.');
      error.status = 409;
      error.details = { supportPhone: store.supportPhone, windowEndsAt: windowEndsAt.toISOString() };
      throw error;
    }
    const now = isoNow();
    await client.query(`UPDATE orders SET status='CANCELLED',cancelled_by='CUSTOMER',cancelled_at=$3,
      cancel_reason='Cancelado pelo cliente no aplicativo',updated_at=$3,tracking_token_hash=$4,tracking_token=NULL
      WHERE store_id=$1 AND id=$2`, [storeId, orderId, now, tokenHash(trackingToken)]);
    const items = (await client.query('SELECT * FROM order_items WHERE store_id=$1 AND order_id=$2', [storeId, orderId])).rows;
    for (const item of items) await client.query(`UPDATE products SET
      stock=CASE WHEN catalog_stock IS NULL THEN stock+$3 ELSE stock END,
      catalog_stock=CASE WHEN catalog_stock IS NULL THEN NULL ELSE catalog_stock+$3 END,
      updated_at=$4 WHERE store_id=$1 AND id=$2`, [storeId, item.product_id, item.quantity, now]);
    return customerOrderView(store, (await client.query('SELECT * FROM orders WHERE store_id=$1 AND id=$2', [storeId, orderId])).rows[0], items);
  });
}

const statusTransitions = {
  RECEIVED: ['PICKING', 'CANCELLED'], PICKING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DONE', 'CANCELLED'], OUT_FOR_DELIVERY: ['DONE', 'CANCELLED'], DONE: [], CANCELLED: []
};

export async function updateOrderStatus(storeId, orderId, status) {
  return transaction(async client => {
    const result = await client.query('SELECT * FROM orders WHERE store_id=$1 AND id=$2 FOR UPDATE', [storeId, orderId]);
    if (!result.rowCount) return null;
    const current = result.rows[0];
    if (!statusTransitions[current.status]?.includes(status)) throw Object.assign(new Error(`Transicao invalida: ${current.status} para ${status}`), { status: 409 });
    const now = isoNow();
    if (status === 'CANCELLED') {
      await client.query(`UPDATE orders SET status=$3,cancelled_by='STORE_MANAGER',cancelled_at=$4,
        cancel_reason='Cancelado pela loja',updated_at=$4 WHERE store_id=$1 AND id=$2`, [storeId, orderId, status, now]);
      const items = (await client.query('SELECT * FROM order_items WHERE store_id=$1 AND order_id=$2', [storeId, orderId])).rows;
      for (const item of items) await client.query(`UPDATE products SET
        stock=CASE WHEN catalog_stock IS NULL THEN stock+$3 ELSE stock END,
        catalog_stock=CASE WHEN catalog_stock IS NULL THEN NULL ELSE catalog_stock+$3 END,
        updated_at=$4 WHERE store_id=$1 AND id=$2`, [storeId, item.product_id, item.quantity, now]);
    } else {
      await client.query('UPDATE orders SET status=$3,updated_at=$4 WHERE store_id=$1 AND id=$2', [storeId, orderId, status, now]);
    }
    const [row, items] = await Promise.all([
      client.query('SELECT * FROM orders WHERE store_id=$1 AND id=$2', [storeId, orderId]),
      client.query('SELECT * FROM order_items WHERE store_id=$1 AND order_id=$2 ORDER BY id', [storeId, orderId])
    ]);
    return hydrateOrder(row.rows[0], items.rows);
  });
}

export async function updateOrderItems(storeId, orderId, inputItems) {
  return transaction(async client => {
    const result = await client.query('SELECT * FROM orders WHERE store_id=$1 AND id=$2 FOR UPDATE', [storeId, orderId]);
    if (!result.rowCount) return null;
    const current = result.rows[0];
    if (['DONE', 'CANCELLED'].includes(current.status)) {
      throw Object.assign(new Error('Nao e possivel editar itens de um pedido finalizado ou cancelado'), { status: 400 });
    }

    const now = isoNow();
    const existingItems = (await client.query('SELECT * FROM order_items WHERE store_id=$1 AND order_id=$2', [storeId, orderId])).rows;
    for (const item of existingItems) {
      await client.query(`UPDATE products SET
        stock=CASE WHEN catalog_stock IS NULL THEN stock+$3 ELSE stock END,
        catalog_stock=CASE WHEN catalog_stock IS NULL THEN NULL ELSE catalog_stock+$3 END,
        updated_at=$4 WHERE store_id=$1 AND id=$2`, [storeId, item.product_id, item.quantity, now]);
    }

    await client.query('DELETE FROM order_items WHERE store_id=$1 AND order_id=$2', [storeId, orderId]);

    const validItems = (inputItems || []).filter(item => Number(item.quantity) > 0);
    if (!validItems.length) {
      throw Object.assign(new Error('O pedido deve conter pelo menos 1 item com quantidade maior que zero'), { status: 400 });
    }

    const productIds = validItems.map(item => item.productId);
    const productsResult = await client.query('SELECT * FROM products WHERE store_id=$1 AND id=ANY($2::text[])', [storeId, productIds]);
    const productsMap = new Map(productsResult.rows.map(row => [row.id, row]));

    let subtotal = 0;
    for (const item of validItems) {
      const dbProduct = productsMap.get(item.productId);
      const name = item.name || dbProduct?.name || 'Produto';
      const unit = item.unit || dbProduct?.unit || 'UN';
      const price = item.price != null ? Number(item.price) : Number(dbProduct?.price || 0);
      const quantity = Number(item.quantity);
      const total = Number((quantity * price).toFixed(2));
      subtotal += total;

      await client.query(`INSERT INTO order_items (store_id,order_id,product_id,name,unit,quantity,price,total)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [storeId, orderId, item.productId, name, unit, quantity, price, total]);

      if (dbProduct) {
        await client.query(`UPDATE products SET
          stock=CASE WHEN catalog_stock IS NULL THEN stock-$3 ELSE stock END,
          catalog_stock=CASE WHEN catalog_stock IS NULL THEN NULL ELSE catalog_stock-$3 END,
          updated_at=$4 WHERE store_id=$1 AND id=$2`, [storeId, item.productId, quantity, now]);
      }
    }

    subtotal = Number(subtotal.toFixed(2));
    const deliveryFee = Number(current.delivery_fee || 0);
    const total = Number((subtotal + deliveryFee).toFixed(2));

    await client.query(`UPDATE orders SET subtotal=$3, total=$4, updated_at=$5 WHERE store_id=$1 AND id=$2`,
      [storeId, orderId, subtotal, total, now]);

    const [row, finalItems] = await Promise.all([
      client.query('SELECT * FROM orders WHERE store_id=$1 AND id=$2', [storeId, orderId]),
      client.query('SELECT * FROM order_items WHERE store_id=$1 AND order_id=$2 ORDER BY id', [storeId, orderId])
    ]);

    return hydrateOrder(row.rows[0], finalItems.rows);
  });
}

export async function dashboardSummary(storeId) {
  const [statuses, sales, lowStock, products] = await Promise.all([
    query('SELECT status,COUNT(*)::int AS total FROM orders WHERE store_id=$1 GROUP BY status', [storeId]),
    query(`SELECT COALESCE(SUM(total),0)::float8 AS total,COUNT(*)::int AS orders FROM orders
      WHERE store_id=$1 AND status!='CANCELLED' AND created_at::timestamptz::date=CURRENT_DATE`, [storeId]),
    query(`SELECT COUNT(*)::int AS total FROM products WHERE store_id=$1 AND active=1 AND COALESCE(
      CASE WHEN upper(unit)='KG' AND sale_mode<>'UNIT' THEN catalog_stock END,
      stock
    )<=5`, [storeId]),
    query('SELECT COUNT(*)::int AS total FROM products WHERE store_id=$1 AND active=1', [storeId])
  ]);
  return {
    statuses: Object.fromEntries(statuses.rows.map(row => [row.status, Number(row.total)])),
    salesToday: Number(sales.rows[0].total), ordersToday: Number(sales.rows[0].orders),
    lowStock: Number(lowStock.rows[0].total), products: Number(products.rows[0].total)
  };
}

export async function listCustomers(storeId, search = '') {
  const normalized = `%${String(search).toLowerCase()}%`;
  const result = await query(`WITH customer_totals AS (
      SELECT customer_phone AS phone,MAX(customer_name) AS name,COUNT(*)::int AS orders,
        COALESCE(SUM(CASE WHEN status!='CANCELLED' THEN total ELSE 0 END),0)::float8 AS total_spent,
        MAX(created_at) AS last_order_at
      FROM orders WHERE store_id=$1 AND (lower(customer_name) LIKE $2 OR customer_phone LIKE $2)
      GROUP BY customer_phone
    ), latest AS (
      SELECT DISTINCT ON (customer_phone) * FROM orders WHERE store_id=$1 ORDER BY customer_phone,created_at DESC
    )
    SELECT customer_totals.*,latest.status AS last_order_status,latest.customer_address,latest.customer_cep,
      latest.customer_street,latest.customer_number,latest.customer_complement,latest.customer_neighborhood,
      latest.customer_city,latest.customer_state
    FROM customer_totals JOIN latest ON latest.customer_phone=customer_totals.phone
    ORDER BY customer_totals.last_order_at DESC LIMIT 300`, [storeId, normalized]);
  return result.rows.map(row => ({
    name: row.name, phone: row.phone, orders: Number(row.orders), totalSpent: Number(row.total_spent),
    lastOrderAt: row.last_order_at, lastOrderStatus: row.last_order_status, address: formattedAddress(row),
    cep: row.customer_cep || '', neighborhood: row.customer_neighborhood || '', city: row.customer_city || ''
  }));
}

export async function storeReports(storeId) {
  const [today, daily, statuses, hours, customers, periods, topProducts, monthly] = await Promise.all([
    query(`SELECT COUNT(*)::int AS orders,
      COALESCE(SUM(CASE WHEN status!='CANCELLED' THEN total ELSE 0 END),0)::float8 AS revenue,
      COALESCE(AVG(CASE WHEN status!='CANCELLED' THEN total END),0)::float8 AS average_ticket,
      COUNT(*) FILTER (WHERE status='CANCELLED')::int AS cancellations
      FROM orders WHERE store_id=$1
      AND (created_at::timestamptz AT TIME ZONE 'America/Fortaleza')::date=(NOW() AT TIME ZONE 'America/Fortaleza')::date`, [storeId]),
    query(`SELECT day::date::text AS date,COUNT(orders.id)::int AS orders,
      COALESCE(SUM(CASE WHEN orders.status!='CANCELLED' THEN orders.total ELSE 0 END),0)::float8 AS revenue
      FROM generate_series((NOW() AT TIME ZONE 'America/Fortaleza')::date-INTERVAL '6 days',(NOW() AT TIME ZONE 'America/Fortaleza')::date,INTERVAL '1 day') day
      LEFT JOIN orders ON orders.store_id=$1 AND (orders.created_at::timestamptz AT TIME ZONE 'America/Fortaleza')::date=day::date GROUP BY day ORDER BY day`, [storeId]),
    query('SELECT status,COUNT(*)::int AS total FROM orders WHERE store_id=$1 GROUP BY status', [storeId]),
    query(`SELECT to_char(created_at::timestamptz AT TIME ZONE 'America/Fortaleza','HH24') AS hour,COUNT(*)::int AS total
      FROM orders WHERE store_id=$1 GROUP BY hour ORDER BY hour`, [storeId]),
    listCustomers(storeId),
    query(`SELECT
      COUNT(*) FILTER (WHERE status!='CANCELLED' AND (created_at::timestamptz AT TIME ZONE 'America/Fortaleza')::date=(NOW() AT TIME ZONE 'America/Fortaleza')::date)::int AS today_orders,
      COALESCE(SUM(total) FILTER (WHERE status!='CANCELLED' AND (created_at::timestamptz AT TIME ZONE 'America/Fortaleza')::date=(NOW() AT TIME ZONE 'America/Fortaleza')::date),0)::float8 AS today_revenue,
      COUNT(*) FILTER (WHERE status!='CANCELLED' AND date_trunc('week',created_at::timestamptz AT TIME ZONE 'America/Fortaleza')=date_trunc('week',NOW() AT TIME ZONE 'America/Fortaleza'))::int AS week_orders,
      COALESCE(SUM(total) FILTER (WHERE status!='CANCELLED' AND date_trunc('week',created_at::timestamptz AT TIME ZONE 'America/Fortaleza')=date_trunc('week',NOW() AT TIME ZONE 'America/Fortaleza')),0)::float8 AS week_revenue,
      COUNT(*) FILTER (WHERE status!='CANCELLED' AND date_trunc('month',created_at::timestamptz AT TIME ZONE 'America/Fortaleza')=date_trunc('month',NOW() AT TIME ZONE 'America/Fortaleza'))::int AS month_orders,
      COALESCE(SUM(total) FILTER (WHERE status!='CANCELLED' AND date_trunc('month',created_at::timestamptz AT TIME ZONE 'America/Fortaleza')=date_trunc('month',NOW() AT TIME ZONE 'America/Fortaleza')),0)::float8 AS month_revenue,
      COUNT(*) FILTER (WHERE status!='CANCELLED' AND date_trunc('year',created_at::timestamptz AT TIME ZONE 'America/Fortaleza')=date_trunc('year',NOW() AT TIME ZONE 'America/Fortaleza'))::int AS year_orders,
      COALESCE(SUM(total) FILTER (WHERE status!='CANCELLED' AND date_trunc('year',created_at::timestamptz AT TIME ZONE 'America/Fortaleza')=date_trunc('year',NOW() AT TIME ZONE 'America/Fortaleza')),0)::float8 AS year_revenue
      FROM orders WHERE store_id=$1`, [storeId]),
    query(`SELECT oi.product_id,oi.name,oi.unit,SUM(oi.quantity)::float8 AS quantity,
      SUM(oi.total)::float8 AS revenue,COUNT(DISTINCT oi.order_id)::int AS orders
      FROM order_items oi JOIN orders o ON o.store_id=oi.store_id AND o.id=oi.order_id
      WHERE oi.store_id=$1 AND o.status!='CANCELLED' AND o.created_at::timestamptz>=NOW()-INTERVAL '30 days'
      GROUP BY oi.product_id,oi.name,oi.unit ORDER BY revenue DESC,quantity DESC LIMIT 10`, [storeId]),
    query(`SELECT month::date::text AS month,COUNT(o.id)::int AS orders,
      COALESCE(SUM(CASE WHEN o.status!='CANCELLED' THEN o.total ELSE 0 END),0)::float8 AS revenue
      FROM generate_series(date_trunc('month',CURRENT_DATE)-INTERVAL '11 months',date_trunc('month',CURRENT_DATE),INTERVAL '1 month') month
      LEFT JOIN orders o ON o.store_id=$1 AND date_trunc('month',o.created_at::timestamptz AT TIME ZONE 'America/Fortaleza')=month
      GROUP BY month ORDER BY month`, [storeId])
  ]);
  const labels = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const current = periods.rows[0];
  const localNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const elapsed = { today: 1, week: Math.max(1, (localNow.getUTCDay() || 7)), month: localNow.getUTCDate(), year: Math.max(1, Math.floor((localNow - Date.UTC(localNow.getUTCFullYear(), 0, 0)) / 86400000)) };
  const period = key => {
    const orders = Number(current[`${key}_orders`] || 0);
    const revenue = Number(current[`${key}_revenue`] || 0);
    return { orders, revenue, averageTicket: orders ? revenue / orders : 0, averagePerDay: revenue / elapsed[key] };
  };
  return {
    today: {
      orders: Number(today.rows[0].orders), revenue: Number(today.rows[0].revenue),
      averageTicket: Number(today.rows[0].average_ticket), cancellations: Number(today.rows[0].cancellations)
    },
    days: daily.rows.map(row => ({ ...row, orders: Number(row.orders), revenue: Number(row.revenue), label: labels[new Date(`${row.date}T12:00:00Z`).getUTCDay()] })),
    statuses: Object.fromEntries(statuses.rows.map(row => [row.status, Number(row.total)])),
    busyHours: hours.rows.map(row => ({ hour: row.hour, total: Number(row.total) })),
    topCustomers: customers.slice(0, 5),
    periods: { today: period('today'), week: period('week'), month: period('month'), year: period('year') },
    topProducts: topProducts.rows.map(row => ({ productId: row.product_id, name: row.name, unit: row.unit, quantity: Number(row.quantity), revenue: Number(row.revenue), orders: Number(row.orders) })),
    months: monthly.rows.map(row => ({ month: row.month, orders: Number(row.orders), revenue: Number(row.revenue) }))
  };
}

export async function adminStoreDetail(storeId) {
  const store = await getStore(storeId);
  if (!store) return null;
  const [summary, categories, catalogStatsRow, promoStats, integration, subscription] = await Promise.all([
    dashboardSummary(storeId),
    listProductCategories(storeId, true),
    query(`
      SELECT
        COUNT(*)::int AS total_products,
        COUNT(*) FILTER (WHERE active = 1)::int AS active_products,
        COUNT(*) FILTER (WHERE active = 1 AND promo = 1)::int AS promo_products,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM product_images pi
            WHERE pi.store_id = p.store_id AND pi.product_id = p.id
          )
        )::int AS stored_images,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM product_images pi
            WHERE pi.store_id = p.store_id AND pi.product_id = p.id
          )
          OR EXISTS (
            SELECT 1 FROM catalog_assets ca WHERE ca.ean = p.barcode
          )
        )::int AS with_image,
        COUNT(*) FILTER (
          WHERE COALESCE(p.barcode, '') = ''
             OR length(regexp_replace(COALESCE(p.barcode, ''), '\\D', '', 'g')) < 8
             OR p.barcode = p.sku
        )::int AS local_ean
      FROM products p
      WHERE p.store_id = $1
    `, [storeId]),
    query(`
      SELECT id, sku, barcode, name, category, price, old_price, stock, unit, promo, catalog_visible
      FROM products
      WHERE store_id=$1 AND active=1 AND promo=1
      ORDER BY name
      LIMIT 100
    `, [storeId]),
    getStoreIntegration(storeId),
    query('SELECT * FROM subscriptions WHERE store_id=$1 ORDER BY created_at DESC LIMIT 1', [storeId])
  ]);

  const stats = catalogStatsRow.rows[0] || {};
  const totalProducts = Number(stats.total_products || 0);
  const withImage = Number(stats.with_image || 0);

  return {
    store,
    summary,
    categories,
    integration,
    subscription: subscription.rows[0] ? {
      id: subscription.rows[0].id,
      plan: subscription.rows[0].plan,
      status: subscription.rows[0].status,
      amount: Number(subscription.rows[0].amount),
      billingMethod: subscription.rows[0].billing_method,
      nextDueDate: subscription.rows[0].next_due_date
    } : null,
    catalogStats: {
      activeProducts: Number(stats.active_products || 0),
      totalProducts,
      promoProducts: Number(stats.promo_products || 0),
      withImage,
      withoutImage: Math.max(0, totalProducts - withImage),
      localEan: Number(stats.local_ean || 0),
      storedImages: Number(stats.stored_images || 0)
    },
    promotions: promoStats.rows.map(row => ({
      id: row.id,
      sku: row.sku,
      barcode: row.barcode,
      name: row.name,
      category: normalizeCategory(row.category),
      price: Number(row.price),
      oldPrice: row.old_price == null ? null : Number(row.old_price),
      stock: Number(row.stock),
      unit: row.unit,
      catalogVisible: Boolean(row.catalog_visible)
    }))
  };
}

export async function adminOverview() {
  const [stores, subscriptions] = await Promise.all([listStores(), listSubscriptions()]);
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

function loginAttemptKey(email, ip) {
  return crypto.createHash('sha256').update(`${String(email).toLowerCase()}|${ip}`).digest('hex');
}

export async function assertLoginAllowed(email, ip) {
  const row = (await query('SELECT blocked_until FROM login_attempts WHERE attempt_key=$1', [loginAttemptKey(email, ip)])).rows[0];
  if (row?.blocked_until && new Date(row.blocked_until).getTime() > Date.now()) {
    const error = new Error('Muitas tentativas de login. Aguarde 15 minutos e tente novamente.');
    error.status = 429;
    throw error;
  }
}

export async function recordLoginResult(email, ip, success) {
  const key = loginAttemptKey(email, ip);
  if (success) {
    await query('DELETE FROM login_attempts WHERE attempt_key=$1', [key]);
    return;
  }
  await query(`INSERT INTO login_attempts (attempt_key,failures,window_started_at,blocked_until,updated_at)
    VALUES ($1,1,NOW(),NULL,NOW())
    ON CONFLICT(attempt_key) DO UPDATE SET
      failures=CASE WHEN login_attempts.window_started_at < NOW()-INTERVAL '15 minutes' THEN 1 ELSE login_attempts.failures+1 END,
      window_started_at=CASE WHEN login_attempts.window_started_at < NOW()-INTERVAL '15 minutes' THEN NOW() ELSE login_attempts.window_started_at END,
      blocked_until=CASE WHEN (CASE WHEN login_attempts.window_started_at < NOW()-INTERVAL '15 minutes' THEN 1 ELSE login_attempts.failures+1 END)>=5
        THEN NOW()+INTERVAL '15 minutes' ELSE NULL END,updated_at=NOW()`, [key]);
}

export async function consumeOrderCreationQuota(ip) {
  const key = crypto.createHash('sha256').update(`public-order|${ip}`).digest('hex');
  const result = await query(`INSERT INTO api_rate_limits (limit_key,requests,window_started_at,updated_at)
    VALUES ($1,1,NOW(),NOW())
    ON CONFLICT(limit_key) DO UPDATE SET
      requests=CASE WHEN api_rate_limits.window_started_at < NOW()-INTERVAL '15 minutes' THEN 1 ELSE api_rate_limits.requests+1 END,
      window_started_at=CASE WHEN api_rate_limits.window_started_at < NOW()-INTERVAL '15 minutes' THEN NOW() ELSE api_rate_limits.window_started_at END,
      updated_at=NOW()
    RETURNING requests`, [key]);
  if (Number(result.rows[0].requests) > 30) {
    const error = new Error('Muitos pedidos enviados deste dispositivo. Aguarde alguns minutos e tente novamente.');
    error.status = 429;
    throw error;
  }
  if (Math.random() < 0.01) {
    query("DELETE FROM api_rate_limits WHERE updated_at < NOW()-INTERVAL '1 day'").catch(() => {});
  }
}

export async function writeAuditLog({ storeId = null, actorId = null, action, entityType, entityId = null, metadata = {} }) {
  await query(`INSERT INTO audit_logs (store_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [storeId, actorId, action, entityType, entityId, JSON.stringify(metadata)]);
}

export function getVirtualEan(name, category) {
  const cleanName = String(name || '').toLowerCase();
  
  // Carnes, Aves, Peixes, Frigorífico & Embutidos
  if (cleanName.includes('gordura')) return 'VIRTUAL_CARNE_GORDURA';
  if (cleanName.includes('mocoto') || cleanName.includes('mocotó')) return 'VIRTUAL_CARNE_MOCOTO';
  if (cleanName.includes('panelada')) return 'VIRTUAL_CARNE_PANELADA';
  if (cleanName.includes('sobrecoxa')) return 'VIRTUAL_FRANGO_COXA';
  if (cleanName.includes('toucinho')) return 'VIRTUAL_CARNE_TOUCINHO';
  if (cleanName.includes('tripa')) return 'VIRTUAL_CARNE_TRIPA';
  if (cleanName.includes('paleta')) return 'VIRTUAL_CARNE_PALETA';
  if (cleanName.includes('capa do file') || cleanName.includes('capa do filé')) return 'VIRTUAL_CARNE_CAPA_FILE';
  if (cleanName.includes('maminha')) return 'VIRTUAL_CARNE_MAMINHA';
  if (cleanName.includes('lombo')) return 'VIRTUAL_CARNE_LOMBO';
  if (cleanName.includes('picanha')) return 'VIRTUAL_CARNE_PICANHA';
  if (cleanName.includes('alcatra')) return 'VIRTUAL_CARNE_ALCATRA';
  if (cleanName.includes('contra file') || cleanName.includes('contra-file') || cleanName.includes('contrafile') || cleanName.includes('contrafilé')) return 'VIRTUAL_CARNE_CONTRA_FILE';
  if (cleanName.includes('costela')) return 'VIRTUAL_CARNE_COSTELA';
  if (cleanName.includes('moida') || cleanName.includes('moída')) return 'VIRTUAL_CARNE_MOIDA';
  if (cleanName.includes('patinho')) return 'VIRTUAL_CARNE_PATINHO';
  if (cleanName.includes('coxao mole') || cleanName.includes('coxão mole')) return 'VIRTUAL_CARNE_COXAO_MOLE';
  if (cleanName.includes('coxao duro') || cleanName.includes('coxão duro')) return 'VIRTUAL_CARNE_COXAO_DURO';
  if (cleanName.includes('acem') || cleanName.includes('acém')) return 'VIRTUAL_CARNE_ACEM';
  if (cleanName.includes('musculo') || cleanName.includes('músculo')) return 'VIRTUAL_CARNE_MUSCULO';
  if (cleanName.includes('fraldinha')) return 'VIRTUAL_CARNE_FRALDINHA';
  if (cleanName.includes('cupim')) return 'VIRTUAL_CARNE_CUPIM';
  if (cleanName.includes('bisteca')) return 'VIRTUAL_CARNE_BISTECA';
  if (cleanName.includes('pernil')) return 'VIRTUAL_CARNE_PERNIL';
  if (cleanName.includes('lagarto')) return 'VIRTUAL_CARNE_LAGARTO';
  if (cleanName.includes('peito') && (cleanName.includes('frango') || cleanName.includes('ave') || cleanName.includes('bovino'))) return 'VIRTUAL_FRANGO_PEITO';
  if (cleanName.includes('coxa') && (cleanName.includes('frango') || cleanName.includes('ave'))) return 'VIRTUAL_FRANGO_COXA';
  if (cleanName.includes('asa') && (cleanName.includes('frango') || cleanName.includes('ave'))) return 'VIRTUAL_FRANGO_ASA';
  if (cleanName.includes('coracao') || cleanName.includes('coração')) return 'VIRTUAL_FRANGO_CORACAO';
  if (cleanName.includes('linguiça') || cleanName.includes('linguica')) return 'VIRTUAL_LINGUICA';
  if (cleanName.includes('salsicha')) return 'VIRTUAL_SALSICHA';
  if (cleanName.includes('tilapia') || cleanName.includes('tilápia')) return 'VIRTUAL_PEIXE_TILAPIA';
  if (cleanName.includes('salmao') || cleanName.includes('salmão')) return 'VIRTUAL_PEIXE_SALMAO';
  if (cleanName.includes('camarao') || cleanName.includes('camarão')) return 'VIRTUAL_CAMARAO';
  if (cleanName.includes('suina') || cleanName.includes('suína') || cleanName.includes('porco')) return 'VIRTUAL_CARNE_SUINA';
  if (cleanName.includes('bife') || cleanName.includes('bovino') || cleanName.includes('bovina') || cleanName.includes('carne')) return 'VIRTUAL_CARNE_BIFE';

  // Hortifruti (Frutas, Legumes, Verduras)
  if (/\b(abacate)\b/i.test(cleanName)) return 'VIRTUAL_ABACATE';
  if (/\b(espinafre)\b/i.test(cleanName)) return 'VIRTUAL_ESPINAFRE';
  if (/\b(manjericao|manjericão)\b/i.test(cleanName)) return 'VIRTUAL_MANJERICAO';
  if (/\b(batata)\b/i.test(cleanName)) return 'VIRTUAL_BATATA';
  if (/\b(macaxeira|mandioca|aipim)\b/i.test(cleanName)) return 'VIRTUAL_MACAXEIRA';
  if (/\b(ata|pinha|fruta do conde)\b/i.test(cleanName)) return 'VIRTUAL_ATA';
  if (/\b(berinjela)\b/i.test(cleanName)) return 'VIRTUAL_BERINJELA';
  if (/\b(alho)\b/i.test(cleanName)) return 'VIRTUAL_ALHO';
  if (/\b(cebola)\b/i.test(cleanName)) return 'VIRTUAL_CEBOLA';
  if (/\b(cenoura)\b/i.test(cleanName)) return 'VIRTUAL_CENOURA';
  if (/\b(tomate)\b/i.test(cleanName)) return 'VIRTUAL_TOMATE';
  if (/\b(banana)\b/i.test(cleanName)) return 'VIRTUAL_BANANA';
  if (/\b(maca|maçã)\b/i.test(cleanName)) return 'VIRTUAL_MACA';
  if (/\b(laranja)\b/i.test(cleanName)) return 'VIRTUAL_LARANJA';
  if (/\b(limao|limão)\b/i.test(cleanName)) return 'VIRTUAL_LIMAO';
  if (/\b(mamao|mamão)\b/i.test(cleanName)) return 'VIRTUAL_MAMAO';
  if (/\b(abacaxi)\b/i.test(cleanName)) return 'VIRTUAL_ABACAXI';
  if (/\b(uva)\b/i.test(cleanName)) return 'VIRTUAL_UVA';
  if (/\b(alface)\b/i.test(cleanName)) return 'VIRTUAL_ALFACE';
  if (/\b(pimentao|pimentão)\b/i.test(cleanName)) return 'VIRTUAL_PIMENTAO';
  if (/\b(cheiro verde|coentro)\b/i.test(cleanName)) return 'VIRTUAL_CHEIRO_VERDE';
  if (/\b(repolho)\b/i.test(cleanName)) return 'VIRTUAL_REPOLHO';
  if (/\b(chuchu)\b/i.test(cleanName)) return 'VIRTUAL_CHUCHU';
  if (/\b(abobora|abóbora)\b/i.test(cleanName)) return 'VIRTUAL_ABOBORA';
  if (/\b(melancia)\b/i.test(cleanName)) return 'VIRTUAL_MELANCIA';
  if (/\b(melao|melão)\b/i.test(cleanName)) return 'VIRTUAL_MELAO';
  if (/\b(ovos|ovo)\b/i.test(cleanName)) return 'VIRTUAL_OVOS';
  if (/\b(beterraba)\b/i.test(cleanName)) return 'VIRTUAL_BETERRABA';
  if (/\b(abobrinha)\b/i.test(cleanName)) return 'VIRTUAL_ABOBRINHA';
  if (/\b(manga)\b/i.test(cleanName)) return 'VIRTUAL_MANGA';
  if (/\b(maracuja|maracujá)\b/i.test(cleanName)) return 'VIRTUAL_MARACUJA';
  if (/\b(morango)\b/i.test(cleanName)) return 'VIRTUAL_MORANGO';
  if (/\b(pepino)\b/i.test(cleanName)) return 'VIRTUAL_PEPINO';
  if (/\b(pera|pêra)\b/i.test(cleanName)) return 'VIRTUAL_PERA';

  return null;
}
