import fs from 'node:fs';

const API_URL = process.env.AIMERC_API_URL || 'http://127.0.0.1:4100/api';
const EMAIL = process.env.AIMERC_SYNC_EMAIL || 'gestor@aimerc.local';
const PASSWORD = process.env.AIMERC_SYNC_PASSWORD || 'Aimerc@2026';
const filePath = process.argv[2];

if (!filePath) {
  console.error('Use: npm run sync:sample');
  process.exit(1);
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { values.push(current.trim()); current = ''; }
    else current += character;
  }
  values.push(current.trim());
  return values;
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`);
  return data;
}

const content = fs.readFileSync(filePath, 'utf8').trim();
const [headerLine, ...rows] = content.split(/\r?\n/);
const headers = parseCsvLine(headerLine);
const items = rows.filter(Boolean).map(row => {
  const values = parseCsvLine(row);
  const item = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  return {
    sku: item.sku,
    barcode: item.barcode,
    name: item.name,
    category: item.category,
    price: Number(item.price),
    oldPrice: item.oldPrice ? Number(item.oldPrice) : null,
    stock: Number(item.stock),
    unit: item.unit || 'UN',
    image: item.image || '',
    promo: item.promo === 'true',
    active: item.active !== 'false'
  };
});

const login = await jsonRequest('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD })
});

const result = await jsonRequest('/sync/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` },
  body: JSON.stringify({ items })
});

console.log(JSON.stringify(result, null, 2));
