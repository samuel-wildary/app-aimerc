import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

function encryptionKey() {
  const configured = String(process.env.AIMERC_INTEGRATION_ENCRYPTION_KEY || process.env.AIMERC_TOKEN_SECRET || '');
  if (process.env.NODE_ENV === 'production' && configured.length < 32) {
    throw new Error('AIMERC_INTEGRATION_ENCRYPTION_KEY deve ter pelo menos 32 caracteres');
  }
  return crypto.createHash('sha256').update(configured || 'aimerc-local-integration-key').digest();
}

export function encryptIntegrationSecret(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(item => item.toString('base64url')).join('.');
}

export function decryptIntegrationSecret(value) {
  if (!value) return '';
  const [iv, tag, encrypted] = String(value).split('.').map(item => Buffer.from(item, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function privateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

async function safeEndpoint(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('A integracao deve usar HTTP ou HTTPS');
  if (process.env.NODE_ENV === 'production') {
    if (url.protocol !== 'https:') throw new Error('A API do supermercado deve usar HTTPS em producao');
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new Error('Endereco privado nao permitido na integracao');
  }
  return url;
}

function valueAtPath(input, path) {
  if (!path) return input;
  return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], input);
}

function numberValue(value, fallback = 0) {
  if (typeof value === 'string') value = value.replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value, fallback = true) {
  if (value == null) return fallback;
  if (typeof value === 'string') return !['0', 'false', 'nao', 'não', 'inativo'].includes(value.toLowerCase());
  return Boolean(value);
}

export const defaultFieldMapping = {
  itemsPath: 'products',
  skuPath: 'sku',
  eanPath: 'ean',
  namePath: 'description',
  categoryPath: 'category',
  pricePath: 'price',
  promoPricePath: 'promotionalPrice',
  stockPath: 'quantity',
  unitPath: 'unit',
  activePath: 'active'
};

export async function fetchStoreProducts(integration) {
  const endpoint = await safeEndpoint(integration.endpoint_url);
  const headers = { Accept: 'application/json' };
  const secret = decryptIntegrationSecret(integration.encrypted_secret);
  if (integration.auth_type === 'BEARER' && secret) headers.Authorization = `Bearer ${secret}`;
  if (integration.auth_type === 'API_KEY' && secret) headers[integration.auth_header || 'X-API-Key'] = secret;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(endpoint, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`API respondeu HTTP ${response.status}`);
    const payload = await response.json();
    const mapping = { ...defaultFieldMapping, ...(integration.field_mapping || {}) };
    const sourceItems = valueAtPath(payload, mapping.itemsPath);
    if (!Array.isArray(sourceItems)) throw new Error(`O caminho ${mapping.itemsPath || '(raiz)'} nao retornou uma lista`);
    if (!sourceItems.length) throw new Error('A API retornou uma lista vazia');
    if (sourceItems.length > 10_000) throw new Error('A API retornou mais de 10.000 produtos');
    const items = sourceItems.map((source, index) => {
      const sku = String(valueAtPath(source, mapping.skuPath) ?? '').trim();
      const barcode = String(valueAtPath(source, mapping.eanPath) ?? '').replace(/\D/g, '');
      const name = String(valueAtPath(source, mapping.namePath) ?? '').trim();
      if (!sku && !barcode) throw new Error(`Produto ${index + 1} sem SKU ou EAN`);
      if (!name) throw new Error(`Produto ${index + 1} sem descricao`);
      const regularPrice = numberValue(valueAtPath(source, mapping.pricePath));
      const promotionalPrice = numberValue(valueAtPath(source, mapping.promoPricePath));
      const promo = promotionalPrice > 0 && promotionalPrice < regularPrice;
      return {
        sku: sku || barcode,
        barcode,
        name,
        category: String(valueAtPath(source, mapping.categoryPath) || 'Sem categoria').trim(),
        price: promo ? promotionalPrice : regularPrice,
        oldPrice: promo ? regularPrice : null,
        stock: numberValue(valueAtPath(source, mapping.stockPath)),
        unit: String(valueAtPath(source, mapping.unitPath) || 'UN').toUpperCase(),
        image: '',
        promo,
        active: booleanValue(valueAtPath(source, mapping.activePath))
      };
    });
    return { items, received: sourceItems.length };
  } finally {
    clearTimeout(timeout);
  }
}
