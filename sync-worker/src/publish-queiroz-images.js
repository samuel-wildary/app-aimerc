const catalogApiUrl = (process.env.CATALOG_API_URL || 'http://127.0.0.1:4300').replace(/\/$/, '');
const aimercApiUrl = (process.env.AIMERC_API_URL || '').replace(/\/$/, '');
const syncEmail = process.env.AIMERC_SYNC_EMAIL;
const syncPassword = process.env.AIMERC_SYNC_PASSWORD;

if (!aimercApiUrl || !syncEmail || !syncPassword) {
  console.error('Defina AIMERC_API_URL, AIMERC_SYNC_EMAIL e AIMERC_SYNC_PASSWORD.');
  process.exit(1);
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${aimercApiUrl}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API AiMerc respondeu HTTP ${response.status}`);
  return data;
}

const login = await jsonRequest('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: syncEmail, password: syncPassword })
});
const products = await jsonRequest('/products', { headers: { Authorization: `Bearer ${login.token}` } });
const productsByEan = new Map();
for (const product of products) {
  for (const value of [product.barcode, product.id]) {
    if (value) productsByEan.set(String(value).replace(/\D/g, ''), product);
  }
}

const catalogItems = [];
for (let offset = 0; ; offset += 500) {
  const page = await fetch(`${catalogApiUrl}/api/images?limit=500&offset=${offset}`).then(response => {
    if (!response.ok) throw new Error(`Catalogo respondeu HTTP ${response.status}`);
    return response.json();
  });
  const items = Array.isArray(page) ? page : page.items || [];
  catalogItems.push(...items);
  if (items.length < 500) break;
}

const queue = catalogItems.filter(item => productsByEan.has(String(item.ean).replace(/\D/g, '')));
let imported = 0;
let failed = 0;
let cursor = 0;

async function worker() {
  while (cursor < queue.length) {
    const item = queue[cursor++];
    const ean = String(item.ean).replace(/\D/g, '');
    const product = productsByEan.get(ean);
    try {
      const image = await fetch(`${catalogApiUrl}/api/images/${encodeURIComponent(ean)}`);
      if (!image.ok) throw new Error(`imagem respondeu HTTP ${image.status}`);
      const contentType = String(image.headers.get('content-type') || '').split(';')[0];
      const upload = await fetch(`${aimercApiUrl}/sync/product-images/${encodeURIComponent(product.id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${login.token}`, 'Content-Type': contentType },
        body: Buffer.from(await image.arrayBuffer())
      });
      if (!upload.ok) {
        const data = await upload.json().catch(() => ({}));
        throw new Error(data.error || `upload respondeu HTTP ${upload.status}`);
      }
      imported += 1;
      if (imported % 100 === 0) console.log(`${imported}/${queue.length} imagens importadas`);
    } catch (error) {
      failed += 1;
      console.error(`EAN ${ean}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: 4 }, worker));
console.log(JSON.stringify({ success: failed === 0, matched: queue.length, imported, failed }));
if (failed) process.exitCode = 1;
