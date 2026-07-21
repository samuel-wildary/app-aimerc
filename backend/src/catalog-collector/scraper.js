import axios from 'axios';
import * as cheerio from 'cheerio';
import db from './db.js';

// Realistic browser headers to bypass simple scraping blocks
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://mercado.carrefour.com.br/',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

const CARREFOUR_BASE_URL = 'https://mercado.carrefour.com.br';
const MAX_PRODUCT_DETAIL_PAGES = 24;
const DEFAULT_CARREFOUR_ALL_PRODUCT_LIMIT = 120;
const MAX_CARREFOUR_ALL_PRODUCT_LIMIT = 50000;
const DEFAULT_CARREFOUR_DETAIL_CONCURRENCY = 6;
const MAX_CARREFOUR_DETAIL_CONCURRENCY = 12;
const MAX_IMAGES_PER_PRODUCT = 3;
const MAX_CARREFOUR_CATEGORY_LINKS = 30;
const MAX_CARREFOUR_PAGES_PER_CATEGORY = 25;
const PAO_BASE_URL = 'https://www.paodeacucar.com';
const PAO_API_BASE_URL = 'https://api.vendas.gpa.digital';
const PAO_IMAGE_BASE_URL = 'https://static.paodeacucar.com';
const PAO_STORE_ID = 461;
const PAO_CATEGORY_PAGE_SIZE = 36;
const DEFAULT_PAO_ALL_PRODUCT_LIMIT = 120;
const MAX_PAO_ALL_PRODUCT_LIMIT = 50000;
const DEFAULT_PAO_DETAIL_CONCURRENCY = 8;
const MAX_PAO_DETAIL_CONCURRENCY = 16;
const MAX_PAO_CATEGORY_PAGES = 400;
const SAO_LUIZ_BASE_URL = 'https://mercadinhossaoluiz.com.br';
const SAO_LUIZ_API_BASE_URL = 'https://merconnect.mercadapp.com.br';
const SAO_LUIZ_MARKET_ID = 355;
const SAO_LUIZ_BRAND_ID = 221;
const DEFAULT_SAO_LUIZ_PRODUCT_LIMIT = 120;
const MAX_SAO_LUIZ_PRODUCT_LIMIT = 50000;
const DEFAULT_SAO_LUIZ_CONCURRENCY = 8;
const MAX_SAO_LUIZ_CONCURRENCY = 12;
const MAX_SAO_LUIZ_CATEGORY_PAGES = 250;
const MERCADAPP_CLIENT_ID = 'dcdbcf6fdb36412bf96d4b1b4ca8275de57c2076cb9b88e27dc7901e8752cdff';
const MERCADAPP_CLIENT_SECRET = '27c92c098d3f4b91b8cb1a0d98138b43668c89d677b70bed397e6a5e0971257c';
let mercadappAccessToken = null;
let mercadappAccessTokenExpiresAt = 0;
const PINHEIRO_BASE_URL = 'https://www.lojaonline.pinheirosupermercado.com.br';
const PINHEIRO_API_BASE_URL = 'https://services.vipcommerce.com.br/api-admin/v1/org/180';
const PINHEIRO_IMAGE_BASE_URL = 'https://produto-assets-vipcommerce-com-br.br-se1.magaluobjects.com';
const PINHEIRO_ORGANIZATION_ID = 180;
const PINHEIRO_FILIAL_ID = 1;
const PINHEIRO_CD_ID = 1;
const PINHEIRO_PAGE_SIZE = 100;
const DEFAULT_PINHEIRO_PRODUCT_LIMIT = 120;
const MAX_PINHEIRO_PRODUCT_LIMIT = 50000;
const DEFAULT_PINHEIRO_CONCURRENCY = 8;
const MAX_PINHEIRO_CONCURRENCY = 12;
const PINHEIRO_LOJA_USER = 'loja';
const PINHEIRO_LOJA_KEY = 'df072f85df9bf7dd71b6811c34bdbaa4f219d98775b56cff9dfa5f8ca1bf8469';
const ATACADAO_BASE_URL = 'https://secure.atacadao.com.br';
const ATACADAO_API_URL = `${ATACADAO_BASE_URL}/api/catalog_system/pub/products/search`;
const ATACADAO_PAGE_SIZE = 50;
const DEFAULT_ATACADAO_PRODUCT_LIMIT = 120;
const MAX_ATACADAO_PRODUCT_LIMIT = 50000;
const DEFAULT_ATACADAO_CONCURRENCY = 6;
const MAX_ATACADAO_CONCURRENCY = 12;

export let shouldCancel = false;
export function cancelScrape() {
  shouldCancel = true;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clampInteger(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;

  async function runWorker() {
    let subtotal = 0;

    while (nextIndex < items.length) {
      if (shouldCancel) {
        break;
      }
      const currentIndex = nextIndex++;
      subtotal += await worker(items[currentIndex], currentIndex);
    }

    return subtotal;
  }

  const workerCount = Math.min(concurrency, items.length);
  const totals = await Promise.all(Array.from({ length: workerCount }, runWorker));
  return totals.reduce((sum, value) => sum + value, 0);
}

// Helper to check if a string is a valid Brazilian EAN-13 (starts with 789 or 790, followed by 10 digits)
function extractEAN(text) {
  if (!text) return null;
  const match = text.match(/\b(789|790)\d{10}\b/);
  return match ? match[0] : null;
}

function normalizeProductName(name) {
  if (!name) return null;
  const cleanName = String(name).replace(/\s+/g, ' ').trim();
  return cleanName || null;
}

function productNameFromUrl(productUrl) {
  if (!productUrl) return null;

  try {
    const slug = new URL(productUrl).pathname.split('/').filter(Boolean).pop() || '';
    const namePart = slug.replace(/-\d+$/, '').replace(/-/g, ' ');
    return normalizeProductName(namePart.replace(/\b\w/g, char => char.toUpperCase()));
  } catch {
    return null;
  }
}

function collectImageUrls(input, targetUrl) {
  const urls = [];

  function add(value) {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }

    if (typeof value === 'object') {
      add(value.url || value.imageUrl || value.contentUrl);
      return;
    }

    if (typeof value !== 'string') return;

    const firstSrc = value.split(',')[0].trim().split(/\s+/)[0];
    if (!firstSrc) return;

    try {
      const resolved = firstSrc.startsWith('http') ? firstSrc : new URL(firstSrc, targetUrl).href;
      if (!urls.includes(resolved)) urls.push(resolved);
    } catch {
      // Skip invalid image URLs.
    }
  }

  add(input);
  return urls.slice(0, MAX_IMAGES_PER_PRODUCT);
}

// Download image bytes
async function downloadImage(url, logCallback) {
  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      headers: DEFAULT_HEADERS,
      timeout: 10000 // 10s timeout
    });

    let contentType = response.headers['content-type'] || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      const pathname = new URL(url).pathname.toLowerCase();
      if (pathname.endsWith('.png')) contentType = 'image/png';
      else if (pathname.endsWith('.webp')) contentType = 'image/webp';
      else if (pathname.endsWith('.gif')) contentType = 'image/gif';
      else if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) contentType = 'image/jpeg';
    }
    const buffer = Buffer.from(response.data);
    
    return {
      buffer,
      mimeType: contentType
    };
  } catch (error) {
    logCallback(`[ERRO] Falha ao baixar imagem da URL: ${url}. Motivo: ${error.message}`);
    return null;
  }
}

async function saveImageAsset(ean, imageData, mimeType, imageUrl, sourceSite, position, logCallback) {
  try {
    await db.query(
      `INSERT INTO scraper_product_image_assets (ean, image_data, mime_type, image_url, source_site, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ean, image_url)
       DO UPDATE SET
         image_data = EXCLUDED.image_data,
         mime_type = EXCLUDED.mime_type,
         source_site = EXCLUDED.source_site,
         position = EXCLUDED.position,
         scraped_at = CURRENT_TIMESTAMP`,
      [ean, imageData, mimeType, imageUrl, sourceSite, position]
    );
    return true;
  } catch (error) {
    logCallback(`[ERRO] Falha ao salvar imagem extra (EAN: ${ean}): ${error.message}`);
    return false;
  }
}

async function saveProductImages(ean, imageUrls, sourceSite, logCallback, productUrl = null, productName = null) {
  const urls = [...new Set(imageUrls.filter(Boolean))].slice(0, MAX_IMAGES_PER_PRODUCT);
  let savedPrimary = false;

  for (let index = 0; index < urls.length; index++) {
    const imageUrl = urls[index];
    logCallback(`[DOWNLOAD] Baixando imagem ${index + 1}/${urls.length}: ${imageUrl}`);

    const downloaded = await downloadImage(imageUrl, logCallback);
    if (!downloaded) continue;

    if (index === 0) {
      savedPrimary = await saveToDatabase(
        ean,
        downloaded.buffer,
        downloaded.mimeType,
        imageUrl,
        sourceSite,
        logCallback,
        productUrl,
        productName
      );
      if (!savedPrimary) continue;
    }

    await saveImageAsset(ean, downloaded.buffer, downloaded.mimeType, imageUrl, sourceSite, index, logCallback);
  }

  return savedPrimary;
}

// Save product image to PostgreSQL
async function saveToDatabase(ean, imageData, mimeType, imageUrl, sourceSite, logCallback, productUrl = null, productName = null) {
  try {
    const cleanProductName = normalizeProductName(productName) || productNameFromUrl(productUrl);
    const queryText = `
      INSERT INTO scraper_product_images (ean, image_data, mime_type, image_url, source_site, product_url, product_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (ean) 
      DO UPDATE SET 
        image_data = EXCLUDED.image_data, 
        mime_type = EXCLUDED.mime_type, 
        image_url = EXCLUDED.image_url, 
        source_site = EXCLUDED.source_site,
        product_url = COALESCE(EXCLUDED.product_url, scraper_product_images.product_url),
        product_name = COALESCE(EXCLUDED.product_name, scraper_product_images.product_name),
        scraped_at = CURRENT_TIMESTAMP;
    `;
    
    await db.query(queryText, [ean, imageData, mimeType, imageUrl, sourceSite, productUrl, cleanProductName]);
    logCallback(`[SUCESSO] Salvo no banco: EAN ${ean} (${mimeType})`);
    return true;
  } catch (error) {
    logCallback(`[ERRO] Falha ao salvar no banco (EAN: ${ean}): ${error.message}`);
    return false;
  }
}

async function productExists(ean) {
  const result = await db.query('SELECT 1 FROM scraper_product_images WHERE ean = $1 LIMIT 1', [ean]);
  return result.rows.length > 0;
}

async function attachProductUrlToExistingEAN(ean, productUrl) {
  if (!productUrl) return;

  await db.query(
    `UPDATE scraper_product_images
     SET product_url = $2
     WHERE ean = $1 AND (product_url IS NULL OR product_url = '')`,
    [ean, productUrl]
  );
}

async function attachNameToExistingEAN(ean, productName) {
  const cleanProductName = normalizeProductName(productName);
  if (!cleanProductName) return;

  await db.query(
    `UPDATE scraper_product_images
     SET product_name = $2
     WHERE ean = $1 AND (product_name IS NULL OR product_name = '')`,
    [ean, cleanProductName]
  );
}

async function markProductPageProcessed(productUrl, status, ean = null) {
  if (!productUrl) return;

  await db.query(
    `INSERT INTO scraped_product_pages (product_url, ean, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (product_url)
     DO UPDATE SET
       ean = COALESCE(EXCLUDED.ean, scraped_product_pages.ean),
       status = EXCLUDED.status,
       processed_at = CURRENT_TIMESTAMP`,
    [productUrl, ean, status]
  );
}

async function getExistingCarrefourProductUrls(logCallback) {
  try {
    const result = await db.query(
      `SELECT product_url FROM scraper_product_images
       WHERE product_url LIKE 'https://mercado.carrefour.com.br/produto/%'
       UNION
       SELECT product_url FROM scraped_product_pages
       WHERE product_url LIKE 'https://mercado.carrefour.com.br/produto/%'`
    );

    return new Set(result.rows.map(row => row.product_url).filter(Boolean));
  } catch (error) {
    logCallback(`[AVISO] Não foi possível carregar produtos já processados: ${error.message}`);
    return new Set();
  }
}

async function getExistingPaoProductUrls(logCallback) {
  try {
    const result = await db.query(
      `SELECT product_url FROM scraper_product_images
       WHERE product_url LIKE 'https://www.paodeacucar.com/produto/%'
       UNION
       SELECT product_url FROM scraped_product_pages
       WHERE product_url LIKE 'https://www.paodeacucar.com/produto/%'`
    );

    return new Set(result.rows.map(row => row.product_url).filter(Boolean));
  } catch (error) {
    logCallback(`[AVISO] Nao foi possivel carregar produtos do Pao de Acucar ja processados: ${error.message}`);
    return new Set();
  }
}

function normalizePaoProductUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value, PAO_BASE_URL);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function normalizePaoEAN(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return /^\d{8,14}$/.test(digits) ? digits : null;
}

function collectPaoImageUrls(product) {
  const rawImages = [
    ...(Array.isArray(product?.productImages) ? product.productImages : []),
    ...Object.values(product?.mapOfImages || {}).map(image => image?.BIG)
  ];

  return collectImageUrls(
    rawImages.map(image => {
      if (!image) return null;
      return image.startsWith('http') ? image : `${PAO_IMAGE_BASE_URL}${image.startsWith('/') ? '' : '/'}${image}`;
    }),
    PAO_IMAGE_BASE_URL
  );
}

async function getPaoRootCategories(logCallback) {
  const response = await axios.get(PAO_BASE_URL, {
    headers: { ...DEFAULT_HEADERS, Referer: PAO_BASE_URL },
    timeout: 20000
  });
  const $ = cheerio.load(response.data);
  const nextDataText = $('#__NEXT_DATA__').html();

  if (!nextDataText) {
    throw new Error('Catalogo de categorias nao encontrado na pagina inicial.');
  }

  const nextData = JSON.parse(nextDataText);
  const categories = nextData?.props?.initialProps?.layoutProps?.categories || [];
  const roots = categories
    .map(category => ({
      name: normalizeProductName(category.name),
      slug: String(category.uiLink || '').split('/').filter(Boolean)[0]
    }))
    .filter(category => category.slug);

  logCallback(`[INFO] Pao de Acucar: ${roots.length} categorias principais encontradas.`);
  return roots;
}

async function fetchPaoCategoryPage(category, page) {
  const response = await axios.post(
    `${PAO_API_BASE_URL}/pa/search/category-page`,
    {
      partner: 'linx',
      page,
      resultsPerPage: PAO_CATEGORY_PAGE_SIZE,
      multiCategory: category.slug,
      sortBy: 'relevance',
      department: 'ecom',
      storeId: PAO_STORE_ID,
      customerPlus: true,
      filters: []
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: PAO_BASE_URL,
        Referer: `${PAO_BASE_URL}/`
      },
      timeout: 20000
    }
  );

  return response.data || {};
}

async function fetchPaoProductDetail(productId) {
  const response = await axios.get(
    `${PAO_API_BASE_URL}/pa/v4/products/ecom/${productId}/bestPrices`,
    {
      params: {
        storeId: PAO_STORE_ID,
        sellType: '',
        isClienteMais: true
      },
      headers: {
        Accept: 'application/vnd.nal.v1.2021+json',
        'x-origin': 'CATALOG',
        Origin: PAO_BASE_URL,
        Referer: `${PAO_BASE_URL}/`
      },
      timeout: 20000
    }
  );

  return response.data?.content || null;
}

async function scrapePaoProduct(candidate, logCallback) {
  const fallbackUrl = normalizePaoProductUrl(candidate.urlDetails);

  try {
    const product = await fetchPaoProductDetail(candidate.id);
    const productUrl = normalizePaoProductUrl(product?.urlDetails) || fallbackUrl;
    const ean = normalizePaoEAN(product?.ean);
    const productName = normalizeProductName(product?.name || candidate.name);
    const imageUrls = collectPaoImageUrls(product);

    if (!ean) {
      await markProductPageProcessed(productUrl, 'no_ean');
      logCallback(`[PULADO] ${productName || candidate.id}: EAN nao informado pelo Pao de Acucar.`);
      return 0;
    }

    if (imageUrls.length === 0) {
      await markProductPageProcessed(productUrl, 'no_image', ean);
      logCallback(`[PULADO] EAN ${ean}: produto sem imagem no catalogo.`);
      return 0;
    }

    if (await productExists(ean)) {
      await attachProductUrlToExistingEAN(ean, productUrl);
      await attachNameToExistingEAN(ean, productName);
      await markProductPageProcessed(productUrl, 'exists', ean);
      logCallback(`[PULADO] EAN ${ean} ja existe no banco.`);
      return 0;
    }

    logCallback(`[PRODUTO] ${productName || 'Sem nome'} | EAN: ${ean} | imagens: ${imageUrls.length}`);
    const saved = await saveProductImages(
      ean,
      imageUrls,
      'www.paodeacucar.com',
      logCallback,
      productUrl,
      productName
    );
    await markProductPageProcessed(productUrl, saved ? 'saved' : 'image_error', ean);
    return saved ? 1 : 0;
  } catch (error) {
    await markProductPageProcessed(fallbackUrl, 'request_error');
    logCallback(`[ERRO] Falha ao consultar produto ${candidate.id} no Pao de Acucar: ${error.message}`);
    return 0;
  }
}

async function scrapePaoDeAcucarAll(value, logCallback, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const productLimit = clampInteger(
    value,
    DEFAULT_PAO_ALL_PRODUCT_LIMIT,
    1,
    MAX_PAO_ALL_PRODUCT_LIMIT
  );
  const detailConcurrency = clampInteger(
    options.concurrency,
    DEFAULT_PAO_DETAIL_CONCURRENCY,
    1,
    MAX_PAO_DETAIL_CONCURRENCY
  );

  logCallback(`[INFO] Iniciando Pao de Acucar Completo. Limite: ${productLimit}. Velocidade: ${detailConcurrency} produtos em paralelo.`);
  onProgress({ phase: 'catalog', current: 0, total: productLimit, remaining: productLimit, saved: 0 });
  const categories = await getPaoRootCategories(logCallback);
  if (categories.length === 0) {
    logCallback('[AVISO] Nenhuma categoria do Pao de Acucar foi encontrada.');
    return 0;
  }

  const skippedProductUrls = await getExistingPaoProductUrls(logCallback);
  if (skippedProductUrls.size > 0) {
    logCallback(`[INFO] ${skippedProductUrls.size} produtos ja processados serao ignorados nesta rodada.`);
  }

  const candidates = [];
  const seenProductIds = new Set();
  let activeCategories = categories;

  for (let page = 1; page <= MAX_PAO_CATEGORY_PAGES && activeCategories.length > 0 && candidates.length < productLimit; page++) {
    logCallback(`[CATALOGO] Pagina ${page}: consultando ${activeCategories.length} categorias | selecionados: ${candidates.length}/${productLimit}`);
    const categoryResponses = await Promise.all(activeCategories.map(async category => {
      try {
        return { category, data: await fetchPaoCategoryPage(category, page) };
      } catch (error) {
        logCallback(`[ERRO] Categoria ${category.name || category.slug}, pagina ${page}: ${error.message}`);
        return { category, data: null };
      }
    }));

    activeCategories = categoryResponses
      .filter(({ data }) => data && page < Math.min(data.totalPages || 0, MAX_PAO_CATEGORY_PAGES))
      .map(({ category }) => category);

    for (const { data } of categoryResponses) {
      for (const product of data?.products || []) {
        if (candidates.length >= productLimit) break;
        const productUrl = normalizePaoProductUrl(product.urlDetails);
        if (!product.id || seenProductIds.has(product.id) || skippedProductUrls.has(productUrl)) continue;
        seenProductIds.add(product.id);
        candidates.push(product);
      }
    }

    await delay(75);
  }

  logCallback(`[INFO] Catalogo mapeado. ${candidates.length} produtos novos serao consultados pelo EAN.`);
  let completed = 0;
  let saved = 0;
  onProgress({ phase: 'products', current: 0, total: candidates.length, remaining: candidates.length, saved: 0 });
  const totalSaved = await runWithConcurrency(
    candidates,
    detailConcurrency,
    async candidate => {
      const result = await scrapePaoProduct(candidate, logCallback);
      completed++;
      saved += result;
      onProgress({
        phase: 'products',
        current: completed,
        total: candidates.length,
        remaining: Math.max(candidates.length - completed, 0),
        saved
      });
      return result;
    }
  );

  onProgress({ phase: 'complete', current: candidates.length, total: candidates.length, remaining: 0, saved: totalSaved });
  logCallback(`[FIM] Pao de Acucar finalizado. Produtos consultados: ${candidates.length}. Produtos salvos: ${totalSaved}.`);
  return totalSaved;
}

function saoLuizHeaders() {
  return {
    ...DEFAULT_HEADERS,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: SAO_LUIZ_BASE_URL,
    Referer: `${SAO_LUIZ_BASE_URL}/`
  };
}

async function createSaoLuizApiClient() {
  const client = axios.create({
    baseURL: SAO_LUIZ_API_BASE_URL,
    headers: saoLuizHeaders(),
    timeout: 25000
  });
  if (!mercadappAccessToken) {
    const cached = await db.query(
      `SELECT cache_value, expires_at
       FROM scraper_runtime_cache
       WHERE cache_key = 'mercadapp_access_token'
         AND expires_at > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
       LIMIT 1`
    );
    if (cached.rows.length > 0) {
      mercadappAccessToken = cached.rows[0].cache_value;
      mercadappAccessTokenExpiresAt = new Date(cached.rows[0].expires_at).getTime();
    }
  }

  if (!mercadappAccessToken || Date.now() >= mercadappAccessTokenExpiresAt) {
    let lastError;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const response = await client.post('/oauth/token', {
          client_id: MERCADAPP_CLIENT_ID,
          client_secret: MERCADAPP_CLIENT_SECRET,
          grant_type: 'client_credentials'
        });
        mercadappAccessToken = response.data.access_token;
        mercadappAccessTokenExpiresAt = Date.now() + 55 * 60 * 1000;
        await db.query(
          `INSERT INTO scraper_runtime_cache (cache_key, cache_value, expires_at)
           VALUES ('mercadapp_access_token', $1, $2)
           ON CONFLICT (cache_key)
           DO UPDATE SET cache_value = EXCLUDED.cache_value,
                         expires_at = EXCLUDED.expires_at,
                         updated_at = CURRENT_TIMESTAMP`,
          [mercadappAccessToken, new Date(mercadappAccessTokenExpiresAt)]
        );
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (![403, 429, 500, 502, 503, 504].includes(error.response?.status) || attempt === 5) throw error;
        await delay(1000 * (2 ** (attempt - 1)));
      }
    }
    if (lastError) throw lastError;
  }

  client.defaults.headers.common.Authorization = `Bearer ${mercadappAccessToken}`;
  return client;
}

async function saoLuizGetWithRetry(client, path, config = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await client.get(path, config);
    } catch (error) {
      lastError = error;
      if (![403, 429, 500, 502, 503, 504].includes(error.response?.status) || attempt === 4) throw error;
      await delay(350 * attempt);
    }
  }
  throw lastError;
}

async function getExistingSaoLuizProductUrls(logCallback) {
  try {
    const result = await db.query(
      `SELECT product_url FROM scraper_product_images
       WHERE product_url LIKE 'https://mercadinhossaoluiz.com.br/loja/355/%'
       UNION
       SELECT product_url FROM scraped_product_pages
       WHERE product_url LIKE 'https://mercadinhossaoluiz.com.br/loja/355/%'`
    );
    return new Set(result.rows.map(row => row.product_url).filter(Boolean));
  } catch (error) {
    logCallback(`[AVISO] Nao foi possivel carregar produtos do Sao Luiz ja processados: ${error.message}`);
    return new Set();
  }
}

function saoLuizProductUrl(product) {
  const categoryId = product.section_id || product.category_id || 'catalogo';
  const slug = product.slug || product.product_id;
  return `${SAO_LUIZ_BASE_URL}/loja/${SAO_LUIZ_MARKET_ID}/categoria/${categoryId}/produto/${encodeURIComponent(slug)}`;
}

function flattenMercadappItems(data) {
  return (data?.mixes || []).flatMap(mix => Array.isArray(mix.items) ? mix.items : []);
}

async function getSaoLuizCategories(client, logCallback) {
  const cached = await db.query(
    `SELECT cache_value
     FROM scraper_runtime_cache
     WHERE cache_key = 'sao_luiz_categories'
       AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`
  );
  if (cached.rows.length > 0) {
    const categories = JSON.parse(cached.rows[0].cache_value);
    logCallback(`[INFO] Sao Luiz: ${categories.length} categorias carregadas do cache local.`);
    return categories;
  }

  const response = await saoLuizGetWithRetry(client, `/mapp/v2/markets/${SAO_LUIZ_MARKET_ID}/brand_categories`);
  const roots = response.data?.categories || [];
  const categories = [];
  const seen = new Set();

  await runWithConcurrency(roots, 1, async root => {
    try {
      const result = await saoLuizGetWithRetry(
        client,
        `/mapp/v2/markets/${SAO_LUIZ_MARKET_ID}/brand_categories/${root.id}/subcategories`
      );
      const subcategories = result.data?.subcategories || [];
      const candidates = subcategories.length > 0 ? subcategories : [root];

      for (const category of candidates) {
        if (!category.id || seen.has(category.id)) continue;
        seen.add(category.id);
        categories.push({
          id: category.id,
          name: normalizeProductName(category.display_name || category.name || root.display_name)
        });
      }
      await delay(250);
    } catch (error) {
      logCallback(`[AVISO] Categoria ${root.display_name || root.id} nao pode ser detalhada: ${error.message}`);
    }
    return 0;
  });

  await db.query(
    `INSERT INTO scraper_runtime_cache (cache_key, cache_value, expires_at)
     VALUES ('sao_luiz_categories', $1, CURRENT_TIMESTAMP + INTERVAL '24 hours')
     ON CONFLICT (cache_key)
     DO UPDATE SET cache_value = EXCLUDED.cache_value,
                   expires_at = EXCLUDED.expires_at,
                   updated_at = CURRENT_TIMESTAMP`,
    [JSON.stringify(categories)]
  );
  logCallback(`[INFO] Sao Luiz: ${categories.length} categorias de produtos encontradas.`);
  return categories;
}

async function fetchSaoLuizCategoryPage(client, category, page) {
  const response = await saoLuizGetWithRetry(
    client,
    `/mapp/v3/markets/${SAO_LUIZ_MARKET_ID}/items`,
    { params: { page, category_id: category.id } }
  );
  await delay(250);
  return response.data || {};
}

async function saveSaoLuizImagesForExistingProduct(ean, imageUrls, logCallback) {
  let position = 0;
  const current = await db.query(
    'SELECT COALESCE(MAX(position), -1)::int AS position FROM scraper_product_image_assets WHERE ean = $1',
    [ean]
  );
  position = current.rows[0].position + 1;

  for (const imageUrl of imageUrls) {
    const downloaded = await downloadImage(imageUrl, logCallback);
    if (!downloaded) continue;
    await saveImageAsset(
      ean,
      downloaded.buffer,
      downloaded.mimeType,
      imageUrl,
      'mercadinhossaoluiz.com.br',
      position++,
      logCallback
    );
  }
}

async function scrapeSaoLuizProduct(product, logCallback) {
  const productUrl = saoLuizProductUrl(product);
  const ean = normalizePaoEAN(product.bar_code);
  const productName = normalizeProductName(product.description || product.short_description);
  const imageUrls = collectImageUrls([product.image, ...(product.images || [])], SAO_LUIZ_BASE_URL);

  if (!ean) {
    await markProductPageProcessed(productUrl, 'no_ean');
    logCallback(`[PULADO] ${productName || product.product_id}: codigo de barras nao e um EAN valido.`);
    return 0;
  }
  if (imageUrls.length === 0) {
    await markProductPageProcessed(productUrl, 'no_image', ean);
    logCallback(`[PULADO] EAN ${ean}: produto sem imagem no Sao Luiz.`);
    return 0;
  }

  if (await productExists(ean)) {
    await attachProductUrlToExistingEAN(ean, productUrl);
    await attachNameToExistingEAN(ean, productName);
    await saveSaoLuizImagesForExistingProduct(ean, imageUrls, logCallback);
    await markProductPageProcessed(productUrl, 'exists', ean);
    logCallback(`[PULADO] EAN ${ean} ja existe. Imagens extras do Sao Luiz foram conferidas.`);
    return 0;
  }

  logCallback(`[PRODUTO] ${productName || 'Sem nome'} | EAN: ${ean} | imagens: ${imageUrls.length}`);
  const saved = await saveProductImages(
    ean,
    imageUrls,
    'mercadinhossaoluiz.com.br',
    logCallback,
    productUrl,
    productName
  );
  await markProductPageProcessed(productUrl, saved ? 'saved' : 'image_error', ean);
  return saved ? 1 : 0;
}

async function scrapeSaoLuizAll(value, logCallback, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const productLimit = clampInteger(
    value,
    DEFAULT_SAO_LUIZ_PRODUCT_LIMIT,
    1,
    MAX_SAO_LUIZ_PRODUCT_LIMIT
  );
  const concurrency = clampInteger(
    options.concurrency,
    DEFAULT_SAO_LUIZ_CONCURRENCY,
    1,
    MAX_SAO_LUIZ_CONCURRENCY
  );

  logCallback(`[INFO] Iniciando Sao Luiz Completo. Limite: ${productLimit}. Velocidade: ${concurrency} produtos em paralelo.`);
  onProgress({ phase: 'catalog', current: 0, total: productLimit, remaining: productLimit, saved: 0 });

  const client = await createSaoLuizApiClient();
  const categories = await getSaoLuizCategories(client, logCallback);
  const skippedProductUrls = await getExistingSaoLuizProductUrls(logCallback);
  if (skippedProductUrls.size > 0) {
    logCallback(`[INFO] ${skippedProductUrls.size} produtos do Sao Luiz ja processados serao ignorados.`);
  }

  const candidates = [];
  const seenProductIds = new Set();
  let activeCategories = categories;

  for (let page = 1; page <= MAX_SAO_LUIZ_CATEGORY_PAGES && activeCategories.length > 0 && candidates.length < productLimit; page++) {
    logCallback(`[CATALOGO] Sao Luiz pagina ${page}: ${activeCategories.length} categorias | selecionados: ${candidates.length}/${productLimit}`);
    const pageResponses = [];

    await runWithConcurrency(activeCategories, Math.min(1, activeCategories.length), async category => {
      try {
        pageResponses.push({ category, data: await fetchSaoLuizCategoryPage(client, category, page) });
      } catch (error) {
        logCallback(`[ERRO] Categoria ${category.name || category.id}, pagina ${page}: ${error.message}`);
        pageResponses.push({ category, data: null });
      }
      return 0;
    });

    activeCategories = pageResponses
      .filter(({ data }) => data?.has_next_page)
      .map(({ category }) => category);

    for (const { data } of pageResponses) {
      for (const product of flattenMercadappItems(data)) {
        if (candidates.length >= productLimit) break;
        const productUrl = saoLuizProductUrl(product);
        const productId = String(product.product_id || product.id || productUrl);
        if (seenProductIds.has(productId) || skippedProductUrls.has(productUrl)) continue;
        seenProductIds.add(productId);
        candidates.push(product);
      }
    }

    await delay(75);
  }

  logCallback(`[INFO] Catalogo do Sao Luiz mapeado. ${candidates.length} produtos novos serao processados.`);
  let completed = 0;
  let saved = 0;
  onProgress({ phase: 'products', current: 0, total: candidates.length, remaining: candidates.length, saved: 0 });

  const totalSaved = await runWithConcurrency(candidates, concurrency, async product => {
    const result = await scrapeSaoLuizProduct(product, logCallback);
    completed++;
    saved += result;
    onProgress({
      phase: 'products',
      current: completed,
      total: candidates.length,
      remaining: Math.max(candidates.length - completed, 0),
      saved
    });
    return result;
  });

  onProgress({ phase: 'complete', current: candidates.length, total: candidates.length, remaining: 0, saved: totalSaved });
  logCallback(`[FIM] Sao Luiz finalizado. Produtos consultados: ${candidates.length}. Produtos novos salvos: ${totalSaved}.`);
  return totalSaved;
}

/**
 * Scrapes a VTEX store search API
 * VTEX exposes search results at /api/catalog_system/pub/products/search
 */
async function scrapeVTEXApi(domain, keyword, logCallback) {
  // Try using HTTPS
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
  const url = `https://www.${cleanDomain}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(keyword)}&_from=0&_to=49`;
  
  logCallback(`[INFO] Detectada loja VTEX. Acessando API de catálogo: ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: DEFAULT_HEADERS,
      timeout: 15000
    });
    
    const products = response.data;
    if (!Array.isArray(products) || products.length === 0) {
      logCallback(`[AVISO] Nenhum produto retornado pela API VTEX.`);
      return 0;
    }
    
    logCallback(`[INFO] API retornou ${products.length} produtos. Iniciando mapeamento...`);
    let count = 0;
    
    for (const product of products) {
      if (!product.items || !Array.isArray(product.items)) continue;
      
      for (const item of product.items) {
        const ean = extractEAN(item.ean) || extractEAN(item.itemId);
        if (!ean) continue;
        
        const imageUrls = collectImageUrls(
          item.images?.map(image => image.imageUrl || image.url || image),
          url
        );
        if (imageUrls.length === 0) continue;
        
        logCallback(`[PRODUTO] EAN Encontrado: ${ean} - ${product.productName}`);
        if (await productExists(ean)) {
          logCallback(`[PULADO] EAN ${ean} já existe no banco.`);
          continue;
        }

        const saved = await saveProductImages(
          ean,
          imageUrls,
          cleanDomain,
          logCallback,
          null,
          product.productName || item.name || null
        );
        if (saved) count++;
        
        // Small delay to respect rate limit
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    return count;
  } catch (error) {
    logCallback(`[ERRO] Falha ao acessar API VTEX: ${error.message}`);
    return 0;
  }
}

/**
 * Scrapes Carrefour Brazil search pages (handling VTEX queries or standard paths)
 */
async function scrapeCarrefour(keyword, logCallback) {
  logCallback(`[INFO] Iniciando varredura no Carrefour pelo termo: "${keyword}"`);
  
  // Carrefour is historically a VTEX site, let's try the catalog API first as it is 100% correct!
  const count = await scrapeVTEXApi('carrefour.com.br', keyword, logCallback);
  if (count > 0) {
    return count;
  }
  
  logCallback(`[AVISO] Não foi possível obter dados pela API VTEX do Carrefour. Tentando varredura HTML...`);
  // Fallback to HTML scraping
  const searchUrl = `https://mercado.carrefour.com.br/busca/${encodeURIComponent(keyword)}`;
  return await scrapeHTMLPage(searchUrl, logCallback);
}

function resolveProductUrl(href, targetUrl) {
  if (!href) return null;

  const resolved = new URL(href, targetUrl);
  if (resolved.hostname.includes('carrefour.com.br') && resolved.pathname.startsWith('/produto/')) {
    resolved.hostname = 'mercado.carrefour.com.br';
  }

  return resolved.href;
}

function normalizeCarrefourCategoryUrl(href, targetUrl) {
  if (!href) return null;

  const url = new URL(href, targetUrl);
  if (!url.hostname.includes('carrefour.com.br') || !url.pathname.startsWith('/categoria/')) {
    return null;
  }

  url.hostname = 'mercado.carrefour.com.br';
  url.hash = '';
  if (!url.searchParams.has('sort')) url.searchParams.set('sort', 'orders_desc');
  if (!url.searchParams.has('page')) url.searchParams.set('page', '0');

  return url.href;
}

function setPageParam(url, page) {
  const pagedUrl = new URL(url);
  pagedUrl.searchParams.set('page', String(page));
  return pagedUrl.href;
}

async function collectCarrefourCategoryLinks(logCallback) {
  try {
    logCallback(`[INFO] Carregando home do Carrefour para mapear categorias...`);
    const response = await axios.get(CARREFOUR_BASE_URL, {
      headers: DEFAULT_HEADERS,
      timeout: 20000
    });

    const $ = cheerio.load(response.data);
    const links = [];
    const seen = new Set();

    $('a[href*="/categoria/"]').each((_, link) => {
      const url = normalizeCarrefourCategoryUrl($(link).attr('href'), CARREFOUR_BASE_URL);
      if (!url || seen.has(url)) return;

      seen.add(url);
      links.push(url);
    });

    logCallback(`[INFO] ${links.length} categorias encontradas na home do Carrefour.`);
    return links.slice(0, MAX_CARREFOUR_CATEGORY_LINKS);
  } catch (error) {
    logCallback(`[ERRO] Falha ao mapear categorias do Carrefour: ${error.message}`);
    return [];
  }
}

async function scrapeProductDetailPages($, targetUrl, logCallback, options = {}) {
  const {
    maxProductPages = MAX_PRODUCT_DETAIL_PAGES,
    visitedProductUrls = new Set(),
    skippedProductUrls = new Set(),
    detailConcurrency = DEFAULT_CARREFOUR_DETAIL_CONCURRENCY,
    requestDelayMs = 500
  } = options;

  const links = [];
  const seen = new Set();

  $('a[href*="/produto/"]').each((_, link) => {
    const url = resolveProductUrl($(link).attr('href'), targetUrl);
    if (!url || seen.has(url) || visitedProductUrls.has(url) || skippedProductUrls.has(url)) return;

    seen.add(url);
    links.push(url);
  });

  if (links.length === 0) {
    return 0;
  }

  const selectedLinks = links.slice(0, maxProductPages);
  const concurrency = clampInteger(
    detailConcurrency,
    DEFAULT_CARREFOUR_DETAIL_CONCURRENCY,
    1,
    MAX_CARREFOUR_DETAIL_CONCURRENCY
  );

  selectedLinks.forEach(productUrl => visitedProductUrls.add(productUrl));
  logCallback(`[INFO] Encontrados ${links.length} links de produto. Visitando ${selectedLinks.length} páginas em paralelo (${concurrency} por vez)...`);

  return await runWithConcurrency(selectedLinks, concurrency, async (productUrl) => {
    logCallback(`[DETALHE] Acessando produto: ${productUrl}`);
    return await scrapeHTMLPage(productUrl, logCallback, {
      allowProductDetailCrawl: false,
      visitedProductUrls,
      skippedProductUrls,
      detailConcurrency: concurrency,
      requestDelayMs
    });
  });
}

function pinheiroProductUrl(product) {
  return `${PINHEIRO_BASE_URL}/produto/${product.produto_id}/${product.link || product.produto_id}`;
}

function pinheiroImageUrl(filename) {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename)) return filename;
  return `${PINHEIRO_IMAGE_BASE_URL}/${String(filename).replace(/^\/+/, '')}`;
}

function pinheiroHeaders(token = null) {
  const headers = {
    ...DEFAULT_HEADERS,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    OrganizationId: String(PINHEIRO_ORGANIZATION_ID),
    DomainKey: 'lojaonline.pinheirosupermercado.com.br',
    FilialID: String(PINHEIRO_FILIAL_ID),
    Origin: PINHEIRO_BASE_URL,
    Referer: `${PINHEIRO_BASE_URL}/`
  };
  if (token) headers.Authorization = token;
  return headers;
}

async function createPinheiroApiClient() {
  const authResponse = await axios.post(
    `${PINHEIRO_API_BASE_URL}/auth/loja/login`,
    {
      domain: 'lojaonline.pinheirosupermercado.com.br',
      username: PINHEIRO_LOJA_USER,
      key: PINHEIRO_LOJA_KEY
    },
    { headers: pinheiroHeaders(), timeout: 25000 }
  );
  const token = authResponse.data?.data;
  if (!token) throw new Error('A API VIPCommerce nao forneceu o token da loja.');

  return axios.create({
    baseURL: PINHEIRO_API_BASE_URL,
    headers: pinheiroHeaders(token),
    timeout: 25000
  });
}

async function pinheiroGetWithRetry(client, path, config = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await client.get(path, config);
    } catch (error) {
      lastError = error;
      if (![429, 500, 502, 503, 504].includes(error.response?.status) || attempt === 4) throw error;
      await delay(300 * attempt);
    }
  }
  throw lastError;
}

async function getExistingPinheiroProductUrls(logCallback) {
  try {
    const result = await db.query(
      `SELECT product_url FROM scraper_product_images
       WHERE product_url LIKE 'https://www.lojaonline.pinheirosupermercado.com.br/produto/%'
       UNION
       SELECT product_url FROM scraped_product_pages
       WHERE product_url LIKE 'https://www.lojaonline.pinheirosupermercado.com.br/produto/%'`
    );
    return new Set(result.rows.map(row => row.product_url).filter(Boolean));
  } catch (error) {
    logCallback(`[AVISO] Nao foi possivel carregar produtos do Pinheiro ja processados: ${error.message}`);
    return new Set();
  }
}

async function getPinheiroDepartments(client) {
  const path = `/filial/${PINHEIRO_FILIAL_ID}/centro_distribuicao/${PINHEIRO_CD_ID}/loja/classificacoes_mercadologicas/departamentos/arvore`;
  const response = await pinheiroGetWithRetry(client, path);
  return (response.data?.data || []).filter(department => department.classificacao_mercadologica_id);
}

async function fetchPinheiroDepartmentPage(client, departmentId, page) {
  const path = `/filial/${PINHEIRO_FILIAL_ID}/centro_distribuicao/${PINHEIRO_CD_ID}/loja/classificacoes_mercadologicas/departamentos/${departmentId}/produtos`;
  const response = await pinheiroGetWithRetry(client, path, {
    params: { page, limit: PINHEIRO_PAGE_SIZE }
  });
  return response.data || {};
}

async function getPinheiroProductImages(client, product) {
  const path = `/filial/${PINHEIRO_FILIAL_ID}/centro_distribuicao/${PINHEIRO_CD_ID}/loja/produtos/${product.produto_id}/detalhes`;
  try {
    const response = await pinheiroGetWithRetry(client, path);
    const detailImages = (response.data?.data?.imagens || []).map(image => pinheiroImageUrl(image.filename));
    return collectImageUrls([detailImages, pinheiroImageUrl(product.imagem)], PINHEIRO_BASE_URL);
  } catch {
    return collectImageUrls([pinheiroImageUrl(product.imagem)], PINHEIRO_BASE_URL);
  }
}

async function savePinheiroImagesForExistingProduct(ean, imageUrls, logCallback) {
  const current = await db.query(
    'SELECT COALESCE(MAX(position), -1)::int AS position FROM scraper_product_image_assets WHERE ean = $1',
    [ean]
  );
  let position = current.rows[0].position + 1;

  for (const imageUrl of imageUrls) {
    const downloaded = await downloadImage(imageUrl, logCallback);
    if (!downloaded) continue;
    await saveImageAsset(
      ean,
      downloaded.buffer,
      downloaded.mimeType,
      imageUrl,
      'lojaonline.pinheirosupermercado.com.br',
      position++,
      logCallback
    );
  }
}

async function scrapePinheiroProduct(client, product, logCallback) {
  const productUrl = pinheiroProductUrl(product);
  const ean = normalizePaoEAN(product.codigo_barras);
  const productName = normalizeProductName(product.descricao);

  if (!ean) {
    await markProductPageProcessed(productUrl, 'no_ean');
    logCallback(`[PULADO] ${productName || product.produto_id}: codigo de barras nao e um EAN valido.`);
    return 0;
  }

  const imageUrls = await getPinheiroProductImages(client, product);
  if (imageUrls.length === 0) {
    await markProductPageProcessed(productUrl, 'no_image', ean);
    logCallback(`[PULADO] EAN ${ean}: produto sem imagem no Pinheiro.`);
    return 0;
  }

  if (await productExists(ean)) {
    await attachProductUrlToExistingEAN(ean, productUrl);
    await attachNameToExistingEAN(ean, productName);
    await savePinheiroImagesForExistingProduct(ean, imageUrls, logCallback);
    await markProductPageProcessed(productUrl, 'exists', ean);
    logCallback(`[PULADO] EAN ${ean} ja existe. Imagens extras do Pinheiro foram conferidas.`);
    return 0;
  }

  logCallback(`[PRODUTO] ${productName || 'Sem nome'} | EAN: ${ean} | imagens: ${imageUrls.length}`);
  const saved = await saveProductImages(
    ean,
    imageUrls,
    'lojaonline.pinheirosupermercado.com.br',
    logCallback,
    productUrl,
    productName
  );
  await markProductPageProcessed(productUrl, saved ? 'saved' : 'image_error', ean);
  return saved ? 1 : 0;
}

async function scrapePinheiroAll(value, logCallback, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const productLimit = clampInteger(value, DEFAULT_PINHEIRO_PRODUCT_LIMIT, 1, MAX_PINHEIRO_PRODUCT_LIMIT);
  const concurrency = clampInteger(options.concurrency, DEFAULT_PINHEIRO_CONCURRENCY, 1, MAX_PINHEIRO_CONCURRENCY);

  logCallback(`[INFO] Iniciando Pinheiro Completo. Limite: ${productLimit}. Velocidade: ${concurrency} produtos em paralelo.`);
  onProgress({ phase: 'catalog', current: 0, total: productLimit, remaining: productLimit, saved: 0 });

  const client = await createPinheiroApiClient();
  const departments = await getPinheiroDepartments(client);
  const skippedProductUrls = await getExistingPinheiroProductUrls(logCallback);
  logCallback(`[INFO] Pinheiro: ${departments.length} departamentos encontrados e ${skippedProductUrls.size} produtos ja processados.`);

  const candidates = [];
  const seenProductIds = new Set();
  let activeDepartments = departments;

  for (let page = 1; activeDepartments.length > 0 && candidates.length < productLimit; page++) {
    logCallback(`[CATALOGO] Pinheiro pagina ${page}: ${activeDepartments.length} departamentos | selecionados: ${candidates.length}/${productLimit}`);
    const responses = [];
    await runWithConcurrency(activeDepartments, Math.min(4, activeDepartments.length), async department => {
      try {
        responses.push({
          department,
          data: await fetchPinheiroDepartmentPage(client, department.classificacao_mercadologica_id, page)
        });
      } catch (error) {
        logCallback(`[ERRO] Departamento ${department.descricao || department.classificacao_mercadologica_id}, pagina ${page}: ${error.message}`);
        responses.push({ department, data: null });
      }
      return 0;
    });

    activeDepartments = responses
      .filter(({ data }) => data?.paginator && page < data.paginator.total_pages)
      .map(({ department }) => department);

    for (const { data } of responses) {
      for (const product of data?.data || []) {
        if (candidates.length >= productLimit) break;
        const productId = String(product.produto_id || product.id || '');
        const productUrl = pinheiroProductUrl(product);
        if (!productId || seenProductIds.has(productId) || skippedProductUrls.has(productUrl)) continue;
        seenProductIds.add(productId);
        candidates.push(product);
      }
    }
  }

  logCallback(`[INFO] Catalogo do Pinheiro mapeado. ${candidates.length} produtos novos serao processados.`);
  let completed = 0;
  let saved = 0;
  onProgress({ phase: 'products', current: 0, total: candidates.length, remaining: candidates.length, saved: 0 });

  const totalSaved = await runWithConcurrency(candidates, concurrency, async product => {
    const result = await scrapePinheiroProduct(client, product, logCallback);
    completed++;
    saved += result;
    onProgress({
      phase: 'products', current: completed, total: candidates.length,
      remaining: Math.max(candidates.length - completed, 0), saved
    });
    return result;
  });

  onProgress({ phase: 'complete', current: candidates.length, total: candidates.length, remaining: 0, saved: totalSaved });
  logCallback(`[FIM] Pinheiro finalizado. Produtos consultados: ${candidates.length}. Produtos novos salvos: ${totalSaved}.`);
  return totalSaved;
}

function atacadaoCandidates(products) {
  const candidates = [];

  for (const product of products) {
    const productName = normalizeProductName(product.productName || product.productTitle || product.description);
    const productUrl = product.link || (product.linkText ? `${ATACADAO_BASE_URL}/${product.linkText}/p` : null);

    for (const item of product.items || []) {
      const ean = normalizePaoEAN(item.ean);
      const imageUrls = collectImageUrls(
        (item.images || []).map(image => image?.imageUrl),
        ATACADAO_BASE_URL
      );

      if (ean && imageUrls.length) candidates.push({ ean, imageUrls, productName, productUrl });
    }
  }

  return candidates;
}

async function scrapeAtacadaoProduct(candidate, logCallback) {
  const { ean, imageUrls, productName, productUrl } = candidate;

  if (await productExists(ean)) {
    await attachProductUrlToExistingEAN(ean, productUrl);
    await attachNameToExistingEAN(ean, productName);
    logCallback(`[PULADO] EAN ${ean} ja existe no banco.`);
    return 0;
  }

  logCallback(`[PRODUTO] ${productName || 'Sem nome'} | EAN: ${ean} | imagens: ${imageUrls.length}`);
  const saved = await saveProductImages(
    ean,
    imageUrls,
    'atacadao.com.br',
    logCallback,
    productUrl,
    productName
  );
  return saved ? 1 : 0;
}

async function scrapeAtacadaoAll(value, logCallback, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const productLimit = clampInteger(value, DEFAULT_ATACADAO_PRODUCT_LIMIT, 1, MAX_ATACADAO_PRODUCT_LIMIT);
  const concurrency = clampInteger(options.concurrency, DEFAULT_ATACADAO_CONCURRENCY, 1, MAX_ATACADAO_CONCURRENCY);
  const candidates = [];
  const seenEANs = new Set();

  logCallback(`[INFO] Iniciando Atacadao Completo. Limite: ${productLimit}. Velocidade: ${concurrency} produtos em paralelo.`);
  onProgress({ phase: 'catalog', current: 0, total: productLimit, remaining: productLimit, saved: 0 });

  logCallback(`[INFO] Carregando a árvore de categorias do Atacadão para contornar limites...`);
  let leafPaths = [];
  try {
    const treeResponse = await axios.get(`${ATACADAO_BASE_URL}/api/catalog_system/pub/category/tree/2`, {
      headers: DEFAULT_HEADERS,
      timeout: 20000
    });
    
    function getLeafCategoryPaths(categories) {
      const paths = [];
      function traverse(item) {
        if (Array.isArray(item.children) && item.children.length > 0) {
          item.children.forEach(traverse);
        } else if (item.url) {
          try {
            const path = new URL(item.url).pathname.replace(/^\/|\/$/g, '');
            if (path && !paths.includes(path)) {
              paths.push(path);
            }
          } catch (e) {}
        }
      }
      categories.forEach(traverse);
      return paths;
    }

    leafPaths = getLeafCategoryPaths(treeResponse.data);
    logCallback(`[INFO] Árvore de categorias carregada. Encontradas ${leafPaths.length} categorias folha.`);
  } catch (error) {
    logCallback(`[AVISO] Falha ao obter árvore de categorias: ${error.message}. Usando busca geral (limite VTEX ativo)...`);
  }

  if (leafPaths.length > 0) {
    for (const categoryPath of leafPaths) {
      if (candidates.length >= productLimit) break;
      if (shouldCancel) break;

      logCallback(`[CATEGORIA] Varrendo produtos de: ${categoryPath} | Coletados: ${candidates.length}/${productLimit}`);
      
      for (let from = 0; candidates.length < productLimit; from += ATACADAO_PAGE_SIZE) {
        if (shouldCancel) break;
        const to = from + ATACADAO_PAGE_SIZE - 1;
        
        let products;
        try {
          const response = await axios.get(`${ATACADAO_BASE_URL}/api/catalog_system/pub/products/search/${categoryPath}`, {
            params: { _from: from, _to: to },
            headers: { ...DEFAULT_HEADERS, Accept: 'application/json', Referer: `${ATACADAO_BASE_URL}/` },
            timeout: 30000
          });
          products = Array.isArray(response.data) ? response.data : [];
        } catch (error) {
          if (error.response?.status === 416) break;
          logCallback(`[AVISO] Erro ao consultar produtos na categoria ${categoryPath}: ${error.message}`);
          break;
        }

        if (!products.length) break;

        for (const candidate of atacadaoCandidates(products)) {
          if (candidates.length >= productLimit) break;
          if (seenEANs.has(candidate.ean)) continue;
          seenEANs.add(candidate.ean);
          candidates.push(candidate);
        }

        onProgress({
          phase: 'catalog', current: candidates.length, total: productLimit,
          remaining: Math.max(productLimit - candidates.length, 0), saved: 0
        });

        if (products.length < ATACADAO_PAGE_SIZE) break;
        await delay(60); // Evitar bloqueio de IP
      }
    }
  } else {
    for (let from = 0; candidates.length < productLimit; from += ATACADAO_PAGE_SIZE) {
      if (shouldCancel) break;
      const to = from + ATACADAO_PAGE_SIZE - 1;
      logCallback(`[CATALOGO] Atacadao produtos ${from + 1}-${to + 1} | selecionados: ${candidates.length}/${productLimit}`);

      let products;
      try {
        const response = await axios.get(ATACADAO_API_URL, {
          params: { _from: from, _to: to },
          headers: { ...DEFAULT_HEADERS, Accept: 'application/json', Referer: `${ATACADAO_BASE_URL}/` },
          timeout: 30000,
          maxRedirects: 5
        });
        products = Array.isArray(response.data) ? response.data : [];
      } catch (error) {
        if (error.response?.status === 416) break;
        throw new Error(`Falha ao consultar o catalogo do Atacadao: ${error.message}`);
      }

      if (!products.length) break;

      for (const candidate of atacadaoCandidates(products)) {
        if (candidates.length >= productLimit) break;
        if (seenEANs.has(candidate.ean)) continue;
        seenEANs.add(candidate.ean);
        candidates.push(candidate);
      }

      onProgress({
        phase: 'catalog', current: candidates.length, total: productLimit,
        remaining: Math.max(productLimit - candidates.length, 0), saved: 0
      });
      if (products.length < ATACADAO_PAGE_SIZE) break;
      await delay(60);
    }
  }

  let completed = 0;
  let saved = 0;
  onProgress({ phase: 'products', current: 0, total: candidates.length, remaining: candidates.length, saved: 0 });

  const totalSaved = await runWithConcurrency(candidates, concurrency, async candidate => {
    const result = await scrapeAtacadaoProduct(candidate, logCallback);
    completed++;
    saved += result;
    onProgress({
      phase: 'products', current: completed, total: candidates.length,
      remaining: Math.max(candidates.length - completed, 0), saved
    });
    return result;
  });

  onProgress({ phase: 'complete', current: candidates.length, total: candidates.length, remaining: 0, saved: totalSaved });
  logCallback(`[FIM] Atacadao finalizado. Produtos consultados: ${candidates.length}. Produtos novos salvos: ${totalSaved}.`);
  return totalSaved;
}

async function scrapeCarrefourAll(value, logCallback, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const productLimit = clampInteger(
    value,
    DEFAULT_CARREFOUR_ALL_PRODUCT_LIMIT,
    1,
    MAX_CARREFOUR_ALL_PRODUCT_LIMIT
  );
  const detailConcurrency = clampInteger(
    options.concurrency,
    DEFAULT_CARREFOUR_DETAIL_CONCURRENCY,
    1,
    MAX_CARREFOUR_DETAIL_CONCURRENCY
  );

  logCallback(`[INFO] Iniciando varredura completa controlada do Carrefour. Limite: ${productLimit} produtos. Velocidade: ${detailConcurrency} produtos em paralelo.`);
  onProgress({ phase: 'catalog', current: 0, total: productLimit, remaining: productLimit, saved: 0 });

  const categoryLinks = await collectCarrefourCategoryLinks(logCallback);
  if (categoryLinks.length === 0) {
    logCallback(`[AVISO] Nenhuma categoria encontrada para varredura completa.`);
    onProgress({ phase: 'complete', current: 0, total: 0, remaining: 0, saved: 0 });
    return 0;
  }

  const skippedProductUrls = await getExistingCarrefourProductUrls(logCallback);
  if (skippedProductUrls.size > 0) {
    logCallback(`[INFO] ${skippedProductUrls.size} produtos já processados serão ignorados nesta rodada.`);
  }

  const visitedProductUrls = new Set();
  let totalSaved = 0;

  for (const categoryUrl of categoryLinks) {
    if (visitedProductUrls.size >= productLimit) break;
    if (shouldCancel) break;

    for (let page = 0; page < MAX_CARREFOUR_PAGES_PER_CATEGORY; page++) {
      if (visitedProductUrls.size >= productLimit) break;
      if (shouldCancel) break;

      const pageUrl = setPageParam(categoryUrl, page);
      const remaining = productLimit - visitedProductUrls.size;
      logCallback(`[CATEGORIA] Varredura: ${pageUrl} | restante no limite: ${remaining}`);

      totalSaved += await scrapeHTMLPage(pageUrl, logCallback, {
        allowProductDetailCrawl: true,
        maxProductDetailPages: Math.min(remaining, MAX_PRODUCT_DETAIL_PAGES),
        visitedProductUrls,
        skippedProductUrls,
        detailConcurrency,
        requestDelayMs: 0
      });

      onProgress({
        phase: 'products',
        current: visitedProductUrls.size,
        total: productLimit,
        remaining: Math.max(productLimit - visitedProductUrls.size, 0),
        saved: totalSaved
      });

      await delay(150);
    }
  }

  logCallback(`[FIM] Carrefour completo finalizado. Produtos novos visitados: ${visitedProductUrls.size}. Imagens salvas/atualizadas: ${totalSaved}.`);
  onProgress({
    phase: 'complete',
    current: visitedProductUrls.size,
    total: visitedProductUrls.size,
    remaining: 0,
    saved: totalSaved
  });
  return totalSaved;
}

/**
 * Scrapes product data from a generic HTML page.
 * Scrapes product cards by block and searches for EAN-13 matching Brazilian prefixes.
 */
async function scrapeHTMLPage(targetUrl, logCallback, options = {}) {
  const {
    allowProductDetailCrawl = true,
    maxProductDetailPages = MAX_PRODUCT_DETAIL_PAGES,
    visitedProductUrls = new Set(),
    skippedProductUrls = new Set(),
    detailConcurrency = DEFAULT_CARREFOUR_DETAIL_CONCURRENCY,
    requestDelayMs = 500
  } = options;
  logCallback(`[INFO] Acessando página HTML: ${targetUrl}`);
  let count = 0;
  
  try {
    const parsedUrl = new URL(targetUrl);
    const domain = parsedUrl.hostname;
    const productPageUrl = domain.includes('carrefour.com.br') && parsedUrl.pathname.startsWith('/produto/')
      ? parsedUrl.href
      : null;
    let productPageHadEAN = false;
    let productPageWasMarked = false;
    
    const response = await axios.get(targetUrl, {
      headers: DEFAULT_HEADERS,
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    logCallback(`[INFO] Página carregada. Procurando metadados estruturados JSON-LD...`);
    
    // 1. Try to find product metadata in application/ld+json tags (very common for SEO & EANs)
    let jsonLdProducts = [];
    $('script[type="application/ld+json"]').each((_, elem) => {
      try {
        const jsonText = $(elem).html().trim();
        const data = JSON.parse(jsonText);
        
        // Function to extract product info recursively
        const extractProduct = (obj) => {
          if (!obj) return;
          if (obj['@type'] === 'Product' || obj['@type'] === 'http://schema.org/Product') {
            jsonLdProducts.push(obj);
          } else if (Array.isArray(obj)) {
            obj.forEach(extractProduct);
          } else if (typeof obj === 'object') {
            // Check nested objects
            for (const key in obj) {
              extractProduct(obj[key]);
            }
          }
        };
        
        extractProduct(data);
      } catch (e) {
        // Skip invalid JSON
      }
    });
    
    if (jsonLdProducts.length > 0) {
      logCallback(`[INFO] Encontrados ${jsonLdProducts.length} produtos estruturados via JSON-LD. Baixando imagens...`);
      for (const product of jsonLdProducts) {
        if (shouldCancel) {
          logCallback('[SISTEMA] Varredura cancelada pelo usuário.');
          break;
        }
        // Check standard fields for EAN-13
        const eanText = product.gtin13 || product.gtin || product.sku || product.mpn;
        const ean = extractEAN(String(eanText || ''));
        const productName = typeof product.name === 'string' ? product.name.trim() : null;
        if (ean && productPageUrl) {
          productPageHadEAN = true;
        }
        
        const imageUrls = collectImageUrls(product.image, targetUrl);
        
        if (ean && imageUrls.length > 0) {
          logCallback(`[JSON-LD] Produto: ${productName || 'Sem nome'} | EAN: ${ean}`);
          if (productPageUrl && await productExists(ean)) {
            await attachProductUrlToExistingEAN(ean, productPageUrl);
            await attachNameToExistingEAN(ean, productName);
            await saveProductImages(ean, imageUrls, domain, logCallback, productPageUrl, productName);
            await markProductPageProcessed(productPageUrl, 'exists', ean);
            productPageWasMarked = true;
            logCallback(`[PULADO] EAN ${ean} já existe no banco. Galeria conferida e produto marcado como processado.`);
            continue;
          }

          const saved = await saveProductImages(ean, imageUrls, domain, logCallback, productPageUrl, productName);
          if (saved) {
            count++;
            if (productPageUrl) {
              await markProductPageProcessed(productPageUrl, 'saved', ean);
              productPageWasMarked = true;
            }
          }
          if (requestDelayMs > 0) await delay(requestDelayMs);
        }
      }
    }
    
    // If we already scraped items via JSON-LD, we can return or continue with card parsing to catch more.
    // Let's do HTML card parsing to ensure maximum coverage!
    logCallback(`[INFO] Iniciando varredura por blocos/cards de produtos no HTML...`);
    
    // Common CSS classes for product elements on major e-commerces
    const productCardSelectors = [
      '[class*="product-card"]', 
      '[class*="productCard"]', 
      '[class*="product_card"]', 
      '[class*="product-item"]', 
      '[class*="productItem"]',
      'article[class*="product"]', 
      'li[class*="product"]',
      'div[class*="ProductCard"]',
      'div[class*="vtex-search-result"]',
      'div[class*="shelf-item"]'
    ];
    
    let productCards = $();
    for (const selector of productCardSelectors) {
      const found = $(selector);
      if (found.length > 0) {
        productCards = found;
        logCallback(`[INFO] Seletor de card identificado: "${selector}" (Encontrados: ${found.length})`);
        break;
      }
    }
    
    // If no card selector matched, fall back to parsing all images on the page
    if (productCards.length === 0) {
      logCallback(`[AVISO] Nenhum seletor de card comum foi encontrado. Varrendo todas as tags <img> da página...`);
      const images = $('img');
      logCallback(`[INFO] Total de imagens encontradas na página: ${images.length}`);
      
      for (let i = 0; i < images.length; i++) {
        if (shouldCancel) {
          logCallback('[SISTEMA] Varredura cancelada pelo usuário.');
          break;
        }
        const img = images[i];
        const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy-src');
        const alt = $(img).attr('alt') || '';
        const title = $(img).attr('title') || '';
        
        if (!src) continue;
        
        // Extract EAN from source URL, alt or title
        let ean = extractEAN(src) || extractEAN(alt) || extractEAN(title);
        
        // Also look at parent text of this specific image
        if (!ean) {
          const parentText = $(img).parent().text();
          ean = extractEAN(parentText);
        }
        
        if (ean) {
          const imageUrls = collectImageUrls(src, targetUrl);
          const resolvedImgUrl = imageUrls[0];
          if (!resolvedImgUrl) continue;
          logCallback(`[IMG] Encontrado EAN: ${ean} (alt: "${alt.substring(0, 30)}")`);
          if (await productExists(ean)) {
            logCallback(`[PULADO] EAN ${ean} já existe no banco.`);
            continue;
          }

          const productName = (alt || title || '').trim() || null;
          const saved = await saveProductImages(ean, imageUrls, domain, logCallback, null, productName);
          if (saved) count++;
          if (requestDelayMs > 0) await delay(requestDelayMs);
        }
      }
    } else {
      // Process card by card to guarantee correct mapping
      for (let i = 0; i < productCards.length; i++) {
        if (shouldCancel) {
          logCallback('[SISTEMA] Varredura cancelada pelo usuário.');
          break;
        }
        const card = productCards[i];
        const cardHtml = $(card).html();
        
        // Find EAN inside the card (HTML structure, links, scripts or text)
        let ean = extractEAN(cardHtml);
        
        // If not found in raw HTML, check specific attributes of links inside the card
        if (!ean) {
          $(card).find('a').each((_, a) => {
            const href = $(a).attr('href') || '';
            const testEan = extractEAN(href);
            if (testEan) ean = testEan;
          });
        }
        
        // Find images inside the card
        const cardImg = $(card).find('img').first();
        const src = cardImg.attr('src') || cardImg.attr('data-src') || cardImg.attr('data-lazy-src') || cardImg.attr('srcset');
        
        if (ean && src) {
          // Resolve image URL (in case of srcset, take first URL)
          let cleanSrc = src.split(' ')[0].trim();
          const resolvedImgUrl = cleanSrc.startsWith('http') ? cleanSrc : new URL(cleanSrc, targetUrl).href;
          
          const titleText = $(card).text().replace(/\s+/g, ' ').trim().substring(0, 40);
          logCallback(`[CARD] Encontrado EAN: ${ean} no bloco: "${titleText}..."`);
          if (await productExists(ean)) {
            logCallback(`[PULADO] EAN ${ean} já existe no banco.`);
            continue;
          }

          const productName = titleText || null;
          const saved = await saveProductImages(ean, [resolvedImgUrl], domain, logCallback, null, productName);
          if (saved) count++;
          if (requestDelayMs > 0) await delay(requestDelayMs);
        }
      }
    }

    if (count === 0 && allowProductDetailCrawl && domain.includes('carrefour.com.br')) {
      count += await scrapeProductDetailPages($, targetUrl, logCallback, {
        maxProductPages: maxProductDetailPages,
        visitedProductUrls,
        skippedProductUrls,
        detailConcurrency,
        requestDelayMs
      });
    }

    if (productPageUrl && !productPageWasMarked) {
      await markProductPageProcessed(productPageUrl, productPageHadEAN ? 'no_image' : 'no_ean');
    }

    logCallback(`[FIM] Varredura concluída. Total de imagens salvas: ${count}`);
    return count;
    
  } catch (error) {
    logCallback(`[ERRO] Falha ao processar página: ${error.message}`);
    return 0;
  }
}

/**
 * Main scraper dispatcher
 */
export async function runScraper(options, logCallback) {
  shouldCancel = false;
  const { type, value, concurrency, onProgress } = options; // type: 'url' ou 'keyword', value: URL ou palavra-chave
  
  logCallback(`[INÍCIO] Iniciando motor de scraping às ${new Date().toLocaleTimeString()}`);
  
  if (type === 'carrefour_all') {
    return await scrapeCarrefourAll(value, logCallback, { concurrency, onProgress });
  } else if (type === 'pao_de_acucar_all') {
    return await scrapePaoDeAcucarAll(value, logCallback, { concurrency, onProgress });
  } else if (type === 'sao_luiz_all') {
    return await scrapeSaoLuizAll(value, logCallback, { concurrency, onProgress });
  } else if (type === 'pinheiro_all') {
    return await scrapePinheiroAll(value, logCallback, { concurrency, onProgress });
  } else if (type === 'atacadao_all') {
    return await scrapeAtacadaoAll(value, logCallback, { concurrency, onProgress });
  } else if (type === 'keyword') {
    // Default supermarket is Carrefour Brazil
    return await scrapeCarrefour(value, logCallback);
  } else if (type === 'url') {
    try {
      const parsedUrl = new URL(value);
      const domain = parsedUrl.hostname;
      
      // Auto-detect if it's a VTEX search or page.
      // If the URL has search paths or is a VTEX site, let's check.
      if (domain.includes('carrefour.com.br')) {
        // If it's a search URL on Carrefour, e.g. https://www.carrefour.com.br/busca/arroz
        // We can extract the keyword and run the API query (which is more reliable)
        const match = value.match(/\/busca\/([^/?#]+)/);
        if (match && match[1]) {
          const keyword = decodeURIComponent(match[1]);
          logCallback(`[INFO] URL de busca do Carrefour detectada. Usando API de catálogo para o termo: "${keyword}"`);
          return await scrapeCarrefour(keyword, logCallback);
        }
      }
      
      // Generic HTML Page scraping
      return await scrapeHTMLPage(value, logCallback);
      
    } catch (e) {
      logCallback(`[ERRO] URL inválida fornecida: ${value}`);
      return 0;
    }
  }
  
  logCallback(`[ERRO] Tipo de scraper desconhecido: ${type}`);
  return 0;
}
