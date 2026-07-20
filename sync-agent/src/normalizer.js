import { providerProfile } from './providers.js';

function valueAt(input, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value == null ? undefined : value[key], input);
}

function firstValue(input, paths) {
  for (const path of paths || []) {
    const value = valueAt(input, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function numberValue(value, fallback = 0) {
  if (typeof value === 'string') value = value.replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return !['0', 'false', 'nao', 'não', 'inativo', 'i'].includes(value.toLowerCase());
  return Boolean(value);
}

function pathsFor(profile, mapping, field) {
  return mapping[field] ? [mapping[field]] : profile.aliases[field];
}

export function sourceItems(payload, providerCode, mapping = {}) {
  const profile = providerProfile(providerCode);
  if (Array.isArray(payload)) return payload;
  const configured = mapping.itemsPath ? valueAt(payload, mapping.itemsPath) : undefined;
  if (Array.isArray(configured)) return configured;
  const discovered = firstValue(payload, profile.aliases.items);
  if (!Array.isArray(discovered)) throw new Error('Nao foi encontrada uma lista de produtos no JSON do ERP');
  return discovered;
}

export function normalizeProducts(payload, providerCode, mapping = {}) {
  const profile = providerProfile(providerCode);
  return sourceItems(payload, providerCode, mapping).map((source, index) => {
    const read = field => firstValue(source, pathsFor(profile, mapping, field));
    const sku = String(read('sku') ?? '').trim();
    const barcode = String(read('ean') ?? '').replace(/\D/g, '');
    const name = String(read('name') ?? '').trim();
    if (!sku && !barcode) throw new Error(`Produto ${index + 1} sem SKU ou EAN`);
    if (!name) throw new Error(`Produto ${index + 1} sem descricao`);
    const regularPrice = Math.max(0, numberValue(read('price')));
    const promotionalPrice = Math.max(0, numberValue(read('promoPrice')));
    const promo = promotionalPrice > 0 && promotionalPrice < regularPrice;
    const unit = String(read('unit') || 'UN').toUpperCase();
    return {
      sku: sku || barcode,
      barcode,
      name,
      category: String(read('category') || 'Sem categoria').trim(),
      price: promo ? promotionalPrice : regularPrice,
      oldPrice: promo ? regularPrice : null,
      stock: Math.max(0, numberValue(read('stock'))),
      unit: ['UN', 'KG', 'L', 'CX', 'PCT'].includes(unit) ? unit : 'UN',
      image: '',
      promo,
      active: booleanValue(read('active'))
    };
  });
}
