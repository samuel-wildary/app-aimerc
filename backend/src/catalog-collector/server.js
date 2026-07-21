import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import { runScraper } from './scraper.js';

dotenv.config();

const app = express();
const PORT = process.env.SCRAPER_PORT || 4300;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');

app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server for real-time logs
const wss = new WebSocketServer({ noServer: true });

let connectedClients = new Set();
let isScrapingActive = false;
let scraperStatus = 'idle'; // idle, running
let lastScrapeLogs = [];
let scraperProgress = { phase: 'idle', current: 0, total: 0, remaining: 0, saved: 0 };

wss.on('connection', (ws) => {
  connectedClients.add(ws);
  console.log(`[WS] Client connected. Total: ${connectedClients.size}`);
  
  // Send current status and last logs immediately
  ws.send(JSON.stringify({
    type: 'init',
    status: isScrapingActive ? 'running' : 'idle',
    logs: lastScrapeLogs,
    progress: scraperProgress
  }));

  ws.on('close', () => {
    connectedClients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${connectedClients.size}`);
  });
});

// Upgrade HTTP connection to WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Helper to broadcast log messages to all WS clients
function broadcastLog(message) {
  const logEntry = {
    timestamp: new Date().toLocaleTimeString(),
    message
  };
  lastScrapeLogs.push(logEntry);
  if (lastScrapeLogs.length > 500) {
    lastScrapeLogs.shift(); // Keep only last 500 logs
  }

  const payload = JSON.stringify({
    type: 'log',
    log: logEntry
  });

  for (const client of connectedClients) {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  }
}

// Broadcast scraping status change
function broadcastStatus(status) {
  scraperStatus = status;
  const payload = JSON.stringify({
    type: 'status',
    status
  });
  for (const client of connectedClients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

function broadcastProgress(progress) {
  scraperProgress = { ...scraperProgress, ...progress };
  const payload = JSON.stringify({
    type: 'progress',
    progress: scraperProgress
  });

  for (const client of connectedClients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

function isValidCatalogEAN(value) {
  return /^\d{8,14}$/.test(String(value || ''));
}

function catalogApiOrigin(req) {
  const protocol = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host')).split(',')[0].trim();
  return `${protocol}://${host}`;
}

function requireCatalogApiKey(req, res, next) {
  const configuredKey = process.env.CATALOG_API_KEY;
  if (!configuredKey || req.get('x-api-key') === configuredKey) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function setCatalogImageHeaders(res, mimeType) {
  res.setHeader('Content-Type', mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

// --- API ROUTES ---

// Public catalog layer. It intentionally exposes no supermarket/source metadata.
app.get('/api/catalog/:ean', requireCatalogApiKey, async (req, res) => {
  const ean = String(req.params.ean || '').trim();
  if (!isValidCatalogEAN(ean)) {
    return res.status(400).json({ error: 'Invalid EAN' });
  }

  try {
    const result = await db.query(
      `SELECT
         p.ean,
         p.product_name,
         p.image_url AS primary_image_url,
         COALESCE(
           json_agg(
             json_build_object('id', a.id, 'position', a.position)
             ORDER BY a.position, a.id
           ) FILTER (WHERE a.id IS NOT NULL AND a.image_url IS DISTINCT FROM p.image_url),
           '[]'::json
         ) AS extra_images
       FROM product_images p
       LEFT JOIN product_image_assets a ON a.ean = p.ean
       WHERE p.ean = $1
       GROUP BY p.ean, p.product_name, p.image_url`,
      [ean]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];
    const origin = catalogApiOrigin(req);
    const primaryImage = `${origin}/api/catalog/${encodeURIComponent(ean)}/image`;
    const images = [primaryImage];

    for (const asset of product.extra_images || []) {
      if (images.length >= 3) break;
      images.push(`${origin}/api/catalog/${encodeURIComponent(ean)}/images/${asset.id}`);
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({
      ean: product.ean,
      description: product.product_name || null,
      image: primaryImage,
      images
    });
  } catch (error) {
    console.error('Catalog lookup failed:', error.message);
    return res.status(500).json({ error: 'Catalog lookup failed' });
  }
});

app.get('/api/catalog/:ean/image', async (req, res) => {
  const ean = String(req.params.ean || '').trim();
  if (!isValidCatalogEAN(ean)) return res.status(400).json({ error: 'Invalid EAN' });

  try {
    const result = await db.query(
      'SELECT image_data, mime_type FROM product_images WHERE ean = $1',
      [ean]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Image not found' });

    setCatalogImageHeaders(res, result.rows[0].mime_type);
    return res.send(result.rows[0].image_data);
  } catch (error) {
    console.error('Catalog primary image failed:', error.message);
    return res.status(500).json({ error: 'Image unavailable' });
  }
});

app.get('/api/catalog/:ean/images/:assetId', async (req, res) => {
  const ean = String(req.params.ean || '').trim();
  const assetId = Number.parseInt(req.params.assetId, 10);
  if (!isValidCatalogEAN(ean) || !Number.isInteger(assetId) || assetId < 1) {
    return res.status(400).json({ error: 'Invalid image request' });
  }

  try {
    const result = await db.query(
      `SELECT image_data, mime_type
       FROM product_image_assets
       WHERE id = $1 AND ean = $2`,
      [assetId, ean]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Image not found' });

    setCatalogImageHeaders(res, result.rows[0].mime_type);
    return res.send(result.rows[0].image_data);
  } catch (error) {
    console.error('Catalog gallery image failed:', error.message);
    return res.status(500).json({ error: 'Image unavailable' });
  }
});

// 1. Database & Scraper Status
app.get('/api/status', async (req, res) => {
  const dbConnected = await db.checkStatus();
  let totalImages = 0;
  
  if (dbConnected) {
    try {
      const result = await db.query('SELECT COUNT(*) FROM product_images');
      totalImages = parseInt(result.rows[0].count, 10);
    } catch (e) {
      // Ignore count error
    }
  }

  res.json({
    database: {
      connected: dbConnected,
      name: process.env.DB_NAME || 'ean_scraper',
      host: process.env.DB_HOST || 'localhost'
    },
    scraper: {
      status: scraperStatus,
      active: isScrapingActive,
      progress: scraperProgress
    },
    statistics: {
      totalImages
    }
  });
});

// 2. Fetch all scraped image metadata
app.get('/api/images', async (req, res) => {
  try {
    const dbConnected = await db.checkStatus();
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database disconnected' });
    }
    
    const search = req.query.search || '';
    const limit = Math.min(Math.max(parseInt(req.query.limit || '200', 10), 1), 500);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
    let queryText = `
      SELECT
        p.id,
        p.ean,
        p.product_name,
        p.image_url,
        p.product_url,
        p.source_site,
        p.scraped_at,
        COALESCE(g.gallery_images, '[]'::json) AS gallery_images,
        COALESCE(g.image_count, 0) AS image_count
      FROM product_images p
      LEFT JOIN (
        SELECT
          ean,
          COUNT(*) AS image_count,
          json_agg(
            json_build_object('id', id, 'image_url', image_url, 'position', position)
            ORDER BY position, id
          ) AS gallery_images
        FROM product_image_assets
        GROUP BY ean
      ) g ON g.ean = p.ean
    `;
    let params = [];
    let countText = 'SELECT COUNT(*) FROM product_images p';
    
    if (search) {
      queryText += ' WHERE p.ean LIKE $1 OR p.source_site LIKE $1 OR p.product_name ILIKE $1 OR p.product_url ILIKE $1';
      countText += ' WHERE p.ean LIKE $1 OR p.source_site LIKE $1 OR p.product_name ILIKE $1 OR p.product_url ILIKE $1';
      params.push(`%${search}%`);
    }
    
    const pagingParams = [...params, limit, offset];
    queryText += ` ORDER BY p.scraped_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    
    const [result, countResult] = await Promise.all([
      db.query(queryText, pagingParams),
      db.query(countText, params)
    ]);

    res.json({
      items: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Serve raw binary image for EAN
app.get('/api/images/:ean', async (req, res) => {
  const { ean } = req.params;
  try {
    const dbConnected = await db.checkStatus();
    if (!dbConnected) {
      return res.status(503).send('Database disconnected');
    }

    const result = await db.query(
      'SELECT image_data, mime_type FROM product_images WHERE ean = $1',
      [ean]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Image not found');
    }

    const { image_data, mime_type } = result.rows[0];
    res.setHeader('Content-Type', mime_type);
    res.send(image_data);
  } catch (error) {
    console.error('Error fetching image binary:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/api/image-assets/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const dbConnected = await db.checkStatus();
    if (!dbConnected) {
      return res.status(503).send('Database disconnected');
    }

    const result = await db.query(
      'SELECT image_data, mime_type FROM product_image_assets WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Image asset not found');
    }

    const { image_data, mime_type } = result.rows[0];
    res.setHeader('Content-Type', mime_type);
    res.send(image_data);
  } catch (error) {
    console.error('Error fetching image asset binary:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// 4. Trigger Scraping Job
app.post('/api/scrape', async (req, res) => {
  const { type, value, concurrency } = req.body;
  
  if (!type || !value) {
    return res.status(400).json({ error: 'Parâmetros "type" (url/keyword) e "value" são obrigatórios.' });
  }

  const dbConnected = await db.checkStatus();
  if (!dbConnected) {
    return res.status(503).json({ error: 'O banco de dados PostgreSQL está offline. Conecte-o antes de iniciar a varredura.' });
  }

  if (isScrapingActive) {
    return res.status(409).json({ error: 'Um processo de scraping já está em execução no momento.' });
  }

  // Start scraper asynchronously
  isScrapingActive = true;
  lastScrapeLogs = []; // Clear old logs
  scraperProgress = { phase: 'starting', current: 0, total: 0, remaining: 0, saved: 0 };
  broadcastStatus('running');
  broadcastProgress(scraperProgress);
  
  // Run in background
  (async () => {
    try {
      broadcastLog(`[SISTEMA] Iniciando varredura para: ${value} (Tipo: ${type})`);
      const count = await runScraper({ type, value, concurrency, onProgress: broadcastProgress }, broadcastLog);
      broadcastLog(`[SISTEMA] Varredura finalizada! ${count} novas imagens salvas no banco de dados.`);
    } catch (err) {
      broadcastLog(`[ERRO CRÍTICO] Falha inesperada durante o scraping: ${err.message}`);
    } finally {
      isScrapingActive = false;
      if (scraperProgress.phase !== 'complete') {
        broadcastProgress({ phase: 'stopped' });
      }
      broadcastStatus('idle');
    }
  })();

  res.json({ success: true, message: 'Scraping iniciado em segundo plano.' });
});

// 5. Delete an image record
app.delete('/api/images/:ean', async (req, res) => {
  const { ean } = req.params;
  try {
    const dbConnected = await db.checkStatus();
    if (!dbConnected) {
      return res.status(503).json({ error: 'Database disconnected' });
    }

    const result = await db.query('DELETE FROM product_images WHERE ean = $1', [ean]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Item não encontrado no banco.' });
    }
    
    res.json({ success: true, message: `EAN ${ean} removido com sucesso.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Export database to JSON
app.get('/api/export', async (req, res) => {
  try {
    const dbConnected = await db.checkStatus();
    if (!dbConnected) {
      return res.status(503).send('Database disconnected');
    }

    // Select metadata only (exclude large bytea to keep export clean and fast)
    const result = await db.query(
      'SELECT id, ean, product_name, image_url, product_url, source_site, scraped_at FROM product_images ORDER BY scraped_at DESC'
    );

    res.setHeader('Content-disposition', 'attachment; filename=ean_images_export.json');
    res.setHeader('Content-Type', 'application/json');
    res.write(JSON.stringify(result.rows, null, 2));
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve the built dashboard from the same server to keep API and live updates on one origin.
app.use(express.static(frontendDistPath));

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});
