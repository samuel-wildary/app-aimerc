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

function valuesAt(input, paths) {
  return (paths || []).map(path => valueAt(input, path)).filter(value => value !== undefined && value !== null && value !== '');
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
  const configured = mapping[field] || mapping[`${field}Path`];
  if (Array.isArray(configured)) return configured.filter(Boolean);
  if (configured) return String(configured).split(',').map(value => value.trim()).filter(Boolean);
  return profile.aliases[field];
}

function isValidGtin(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  const expected = Number(digits.at(-1));
  const sum = [...body].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === expected;
}

function barcodeScore(source, profile, mapping) {
  const barcode = firstValue(source, pathsFor(profile, mapping, 'ean'));
  const primaryValue = firstValue(source, pathsFor(profile, mapping, 'primaryEan'));
  const primary = primaryValue === true || primaryValue === 1 || ['true', '1', 'sim'].includes(String(primaryValue ?? '').toLowerCase());
  return (primary ? 100 : 0) + (isValidGtin(barcode) ? 50 : 0);
}

function collapseDuplicateSources(items, profile, mapping) {
  if (!profile.dedupeBySku) return items;
  const grouped = new Map();
  for (const source of items) {
    const sku = String(firstValue(source, pathsFor(profile, mapping, 'sku')) ?? '').trim();
    const key = sku || `__row_${grouped.size}`;
    const current = grouped.get(key);
    if (!current || barcodeScore(source, profile, mapping) > barcodeScore(current, profile, mapping)) grouped.set(key, source);
  }
  return [...grouped.values()];
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
  const items = collapseDuplicateSources(sourceItems(payload, providerCode, mapping), profile, mapping);
  return items.map((source, index) => {
    const read = field => firstValue(source, pathsFor(profile, mapping, field));
    const sku = String(read('sku') ?? '').trim();
    const barcodeValue = String(read('ean') ?? '').replace(/\D/g, '');
    const barcode = profile.requireValidGtin && !isValidGtin(barcodeValue) ? '' : barcodeValue;
    const name = String(read('name') ?? '').replace(/\s*<<<\s*INATIVO\s*>>>\s*$/i, '').trim();
    if (!sku && !barcode) throw new Error(`Produto ${index + 1} sem SKU ou EAN`);
    if (!name) throw new Error(`Produto ${index + 1} sem descricao`);
    const currentPrice = Math.max(0, numberValue(read('price')));
    const regularPrice = Math.max(0, numberValue(read('regularPrice'), currentPrice));
    const promotionalPrice = valuesAt(source, pathsFor(profile, mapping, 'promoPrice'))
      .map(value => Math.max(0, numberValue(value)))
      .concat(profile.aliases.regularPrice ? [currentPrice] : [])
      .filter(value => value > 0 && value < regularPrice)
      .sort((left, right) => left - right)[0] || 0;
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
