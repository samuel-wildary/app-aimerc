/**
 * Web Product Image Search & Downloader
 * Permite buscar fotos de produtos em alta qualidade no Google / DuckDuckGo / OpenFoodFacts
 * e baixar diretamente para o PostgreSQL da VPS sem deixar dependencias ou links externos.
 */

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
]);

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export async function searchWebProductImages(query = '') {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  const results = [];
  const seenUrls = new Set();

  function addResult(url, thumb, title, source) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
    const cleanUrl = url.split('?')[0].trim();
    if (seenUrls.has(cleanUrl) || seenUrls.has(url)) return;
    seenUrls.add(cleanUrl);
    seenUrls.add(url);
    results.push({
      url,
      thumb: thumb || url,
      title: title || cleanQuery,
      source: source || 'web'
    });
  }

  // 1. DuckDuckGo Image API Search
  try {
    const vqdRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    const vqdHtml = await vqdRes.text();
    const vqdMatch = vqdHtml.match(/vqd=([\d-]+)/) || vqdHtml.match(/vqd="([\d-]+)"/);
    if (vqdMatch) {
      const vqd = vqdMatch[1];
      const imgRes = await fetch(`https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(cleanQuery)}&vqd=${vqd}&f=,,,&p=1`, {
        headers: { 'User-Agent': USER_AGENT }
      });
      const imgJson = await imgRes.json().catch(() => ({}));
      if (Array.isArray(imgJson.results)) {
        for (const item of imgJson.results.slice(0, 30)) {
          addResult(item.image, item.thumbnail, item.title, 'DuckDuckGo');
        }
      }
    }
  } catch (err) {
    console.warn('[web-image-search] DDG search error:', err.message);
  }

  // 2. Google Shopping & Images Scraper (udm=2)
  try {
    const gUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}&udm=2&gl=br&hl=pt-BR`;
    const gRes = await fetch(gUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    const gHtml = await gRes.text();
    const matches = gHtml.match(/https:\/\/encrypted-tbn[0-9]\.gstatic\.com\/[^\s"'\\]+/g) || [];
    for (const match of matches) {
      const cleanUrl = match.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
      addResult(cleanUrl, cleanUrl, cleanQuery, 'Google');
    }
  } catch (err) {
    console.warn('[web-image-search] Google search error:', err.message);
  }

  // 3. OpenFoodFacts if query looks like EAN or barcode
  const isEan = /^[0-9]{7,14}$/.test(cleanQuery);
  if (isEan) {
    try {
      const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${cleanQuery}.json`);
      const offJson = await offRes.json().catch(() => ({}));
      if (offJson.product?.image_url) {
        addResult(
          offJson.product.image_url,
          offJson.product.image_front_small_url || offJson.product.image_url,
          offJson.product.product_name || cleanQuery,
          'OpenFoodFacts'
        );
      }
    } catch {}
  }

  return results;
}

export async function downloadRemoteImage(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
    throw new Error('URL de imagem invalida');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Falha ao baixar imagem remota (HTTP ${response.status})`);
    }

    let contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (contentType === 'image/jpg') contentType = 'image/jpeg';

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer.length) {
      throw new Error('Arquivo de imagem vazio');
    }

    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error('Imagem excede o limite maximo de 10MB');
    }

    // Fallback content type se nao vier explicitamente no header
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      if (buffer[0] === 0xff && buffer[1] === 0xd8) contentType = 'image/jpeg';
      else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) contentType = 'image/png';
      else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) contentType = 'image/webp';
      else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) contentType = 'image/gif';
      else contentType = 'image/jpeg';
    }

    return { buffer, contentType };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
