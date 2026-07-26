import crypto from 'node:crypto';
import { query } from './postgres.js';

const scraperBaseUrl = String(process.env.AIMERC_SCRAPER_URL || 'http://127.0.0.1:4300').replace(/\/$/, '');
const activeMonitors = new Set();

function jobId() {
  return `scan_${crypto.randomUUID()}`;
}

function clamp(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
}

async function scraperRequest(path, options = {}) {
  const response = await fetch(`${scraperBaseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(options.timeout || 10_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Coletor respondeu HTTP ${response.status}`);
  return data;
}

async function scraperStatus() {
  try {
    const status = await scraperRequest('/api/status', { timeout: 4_000 });
    return { online: true, ...status };
  } catch (error) {
    return { online: false, error: error.message, scraper: { status: 'offline', active: false, progress: {} } };
  }
}

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceValue: row.source_value,
    requestedLimit: Number(row.requested_limit),
    concurrency: Number(row.concurrency),
    status: row.status,
    phase: row.phase,
    current: Number(row.current_count),
    total: Number(row.total_count),
    saved: Number(row.saved_count),
    imported: Number(row.imported_count),
    events: row.events || [],
    error: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at
  };
}

function mapAsset(row) {
  return {
    ean: row.ean,
    description: row.description,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    collectedAt: row.collected_at,
    updatedAt: row.updated_at
  };
}

async function appendEvent(id, message) {
  const event = JSON.stringify([{ at: new Date().toISOString(), message }]);
  await query(`UPDATE catalog_scan_jobs SET events=(events || $2::jsonb),updated_at=NOW() WHERE id=$1`, [id, event]);
}

function scraperPayload(input) {
  const sourceType = String(input.sourceType || '').toUpperCase();
  const maxLimit = ['ATACADAO_ALL', 'PINHEIRO_ALL', 'CARREFOUR_ALL', 'PAO_DE_ACUCAR_ALL', 'SAO_LUIZ_ALL', 'GUARA_ALL', 'SUPER_DO_POVO_ALL'].includes(sourceType) ? 100_000 : 5_000;
  const requestedLimit = clamp(input.limit, 100, 1, maxLimit);
  const concurrency = clamp(input.concurrency, 6, 1, 30);
  const sourceValue = String(input.value || '').trim();
  const presets = {
    CARREFOUR_ALL: { type: 'carrefour_all', value: String(requestedLimit) },
    PAO_DE_ACUCAR_ALL: { type: 'pao_de_acucar_all', value: String(requestedLimit) },
    SAO_LUIZ_ALL: { type: 'sao_luiz_all', value: String(requestedLimit) },
    PINHEIRO_ALL: { type: 'pinheiro_all', value: String(requestedLimit) },
    ATACADAO_ALL: { type: 'atacadao_all', value: String(requestedLimit) },
    GUARA_ALL: { type: 'guara_all', value: String(requestedLimit) },
    SUPER_DO_POVO_ALL: { type: 'super_do_povo_all', value: String(requestedLimit) },
    CARREFOUR_SEARCH: { type: 'keyword', value: sourceValue },
    CUSTOM_URL: { type: 'url', value: sourceValue }
  };
  const scraper = presets[sourceType];
  if (!scraper) throw Object.assign(new Error('Fonte de varredura invalida'), { status: 400 });
  if (!scraper.value) throw Object.assign(new Error('Informe o termo ou a URL da varredura'), { status: 400 });
  if (sourceType === 'CUSTOM_URL') {
    let url;
    try { url = new URL(sourceValue); } catch { throw Object.assign(new Error('URL invalida'), { status: 400 }); }
    if (url.protocol !== 'https:') throw Object.assign(new Error('Use apenas URLs HTTPS'), { status: 400 });
  }
  return { sourceType, sourceValue, requestedLimit, concurrency, scraper: { ...scraper, concurrency } };
}

async function importLatestAssets(job) {
  const limit = Math.min(job.requestedLimit, ['ATACADAO_ALL', 'PINHEIRO_ALL', 'CARREFOUR_ALL', 'PAO_DE_ACUCAR_ALL', 'SAO_LUIZ_ALL', 'GUARA_ALL', 'SUPER_DO_POVO_ALL'].includes(job.sourceType) ? 100_000 : 5_000);
  let offset = 0;
  let imported = 0;
  let examined = 0;
  let skippedEmpty = 0;
  await appendEvent(job.id, 'Importando TODAS as imagens da fonte para o PostgreSQL (sem filtrar EAN).');

  while (examined < limit) {
    const pageSize = Math.min(200, limit - examined);
    const page = await scraperRequest(`/api/images?limit=${pageSize}&offset=${offset}`, { timeout: 20_000 });
    const items = Array.isArray(page.items) ? page.items : [];
    if (!items.length) break;
    for (const item of items) {
      examined += 1;
      try {
        const rawEan = String(item.ean || '').replace(/\D/g, '');
        if (!/^\d{8,14}$/.test(rawEan)) {
          skippedEmpty += 1;
          continue;
        }
        const assetKey = rawEan;
        const imageResponse = await fetch(`${scraperBaseUrl}/api/images/${encodeURIComponent(item.ean || item.id || assetKey)}`, {
          signal: AbortSignal.timeout(30_000)
        });
        // fallback: try by ean field as returned by list
        let response = imageResponse;
        if (!response.ok && item.ean) {
          response = await fetch(`${scraperBaseUrl}/api/images/${encodeURIComponent(item.ean)}`, {
            signal: AbortSignal.timeout(30_000)
          });
        }
        if (!response.ok) {
          skippedEmpty += 1;
          continue;
        }
        const data = Buffer.from(await response.arrayBuffer());
        if (!data.length || data.length > 12 * 1024 * 1024) {
          skippedEmpty += 1;
          continue;
        }
        const contentType = String(response.headers.get('content-type') || 'image/jpeg').split(';')[0];
        if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') {
          skippedEmpty += 1;
          continue;
        }
        const description = String(item.product_name || item.description || '').trim();
        if (!description) {
          skippedEmpty += 1;
          continue;
        }
        const checksum = crypto.createHash('sha256').update(data).digest('hex');
        await query(`INSERT INTO catalog_assets
          (ean,description,content_type,image_data,checksum,byte_size,source_name,source_url,collected_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz,NOW()),NOW())
          ON CONFLICT(ean) DO UPDATE SET
            description=CASE WHEN EXCLUDED.description<>'' THEN EXCLUDED.description ELSE catalog_assets.description END,
            content_type=EXCLUDED.content_type,image_data=EXCLUDED.image_data,checksum=EXCLUDED.checksum,
            byte_size=EXCLUDED.byte_size,source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,
            collected_at=EXCLUDED.collected_at,updated_at=NOW()`, [
          assetKey, description, contentType, data, checksum, data.length,
          String(item.source_site || ''), String(item.product_url || item.image_url || ''), item.scraped_at || null
        ]);
        imported += 1;
        if (imported % 5 === 0 || imported === 1) {
          await query('UPDATE catalog_scan_jobs SET imported_count=$2,updated_at=NOW() WHERE id=$1', [job.id, imported]);
        }
      } catch {
        skippedEmpty += 1;
      }
    }
    offset += items.length;
    if (items.length < pageSize) break;
  }
  await query('UPDATE catalog_scan_jobs SET imported_count=$2,updated_at=NOW() WHERE id=$1', [job.id, imported]);
  await appendEvent(job.id, `Importacao concluida: ${imported} no PostgreSQL, ${skippedEmpty} ignorados (sem EAN/descricao/foto utilizavel).`);
  return imported;
}

async function finishJob(id, status, values = {}) {
  const hasImported = Object.prototype.hasOwnProperty.call(values, 'imported');
  const imported = hasImported ? Number(values.imported || 0) : null;
  await query(`
    UPDATE catalog_scan_jobs SET
      status = $2,
      phase = $3,
      imported_count = CASE WHEN $4::int IS NULL THEN imported_count ELSE $4::int END,
      error_message = $5,
      current_count = CASE
        WHEN $2::varchar IN ('COMPLETED', 'CANCELLED') AND current_count = 0 AND $4::int IS NOT NULL THEN $4::int
        ELSE current_count
      END,
      saved_count = CASE
        WHEN $2::varchar = 'COMPLETED' AND saved_count = 0 AND $4::int IS NOT NULL THEN $4::int
        ELSE saved_count
      END,
      finished_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
  `, [id, status, values.phase || status.toLowerCase(), imported, values.error || '']);
}

function isStoppingStatus(status) {
  return ['FAILED', 'CANCELLED', 'CANCELLING'].includes(String(status || '').toUpperCase());
}

async function monitorJob(id) {
  if (activeMonitors.has(id)) return;
  activeMonitors.add(id);
  // A resposta 200 do endpoint /api/scrape confirma que a execucao foi aceita.
  let observedRunning = true;
  let offlineChecks = 0;
  try {
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1_500));
      const jobRow = (await query('SELECT status FROM catalog_scan_jobs WHERE id=$1', [id])).rows[0];
      if (jobRow && isStoppingStatus(jobRow.status)) return;
      if (jobRow && jobRow.status === 'COMPLETED') return;

      const status = await scraperStatus();
      if (!status.online) {
        offlineChecks += 1;
        if (offlineChecks >= 8) throw new Error('O servico de coleta ficou indisponivel durante a varredura');
        continue;
      }
      offlineChecks = 0;
      const scraper = status.scraper || {};
      const progress = scraper.progress || {};
      if (scraper.active || scraper.status === 'running') observedRunning = true;

      const live = (await query('SELECT status FROM catalog_scan_jobs WHERE id=$1', [id])).rows[0];
      if (live && isStoppingStatus(live.status)) return;

      await query(`UPDATE catalog_scan_jobs SET status=$2,phase=$3,current_count=$4,total_count=$5,
        saved_count=$6,updated_at=NOW()
        WHERE id=$1 AND status IN ('STARTING','RUNNING')`, [
        id, 'RUNNING', progress.phase || 'collecting',
        Number(progress.current || 0), Number(progress.total || 0), Number(progress.saved || 0)
      ]);
      if (!scraper.active && scraper.status !== 'running' && observedRunning) break;
    }

    const gate = (await query('SELECT status FROM catalog_scan_jobs WHERE id=$1', [id])).rows[0];
    if (gate && isStoppingStatus(gate.status)) return;

    const row = (await query('SELECT * FROM catalog_scan_jobs WHERE id=$1', [id])).rows[0];
    await query(`UPDATE catalog_scan_jobs SET status='IMPORTING',phase='importing',updated_at=NOW()
      WHERE id=$1 AND status IN ('STARTING','RUNNING')`, [id]);
    const still = (await query('SELECT status FROM catalog_scan_jobs WHERE id=$1', [id])).rows[0];
    if (!still || still.status !== 'IMPORTING') return;

    const imported = await importLatestAssets(mapJob(row));
    await appendEvent(id, `${imported} registros importados para a biblioteca central.`);
    await finishJob(id, 'COMPLETED', { phase: 'complete', imported });
  } catch (error) {
    await appendEvent(id, `Falha: ${error.message}`).catch(() => {});
    const live = (await query('SELECT status FROM catalog_scan_jobs WHERE id=$1', [id])).rows[0];
    if (!live || !['CANCELLED', 'CANCELLING'].includes(live.status)) {
      await finishJob(id, 'FAILED', { phase: 'failed', error: error.message }).catch(() => {});
    }
  } finally {
    activeMonitors.delete(id);
  }
}

export async function startCatalogScan(input, actorId) {
  const running = (await query("SELECT id FROM catalog_scan_jobs WHERE status IN ('STARTING','RUNNING','IMPORTING','CANCELLING') LIMIT 1")).rows[0];
  if (running) throw Object.assign(new Error('Ja existe uma varredura em andamento'), { status: 409 });
  const status = await scraperStatus();
  if (!status.online) throw Object.assign(new Error('O coletor local esta desligado. Inicie o EAN Scraper na porta 4300.'), { status: 503 });
  if (status.scraper?.active) throw Object.assign(new Error('O coletor ja esta executando outra varredura'), { status: 409 });

  const config = scraperPayload(input);
  const id = jobId();
  await query(`INSERT INTO catalog_scan_jobs
    (id,source_type,source_value,requested_limit,concurrency,status,phase,created_by,events)
    VALUES ($1,$2,$3,$4,$5,'STARTING','starting',$6,$7::jsonb)`, [id, config.sourceType, config.sourceValue,
    config.requestedLimit, config.concurrency, actorId, JSON.stringify([{ at: new Date().toISOString(), message: 'Varredura solicitada pelo painel SaaS.' }])]);
  try {
    await scraperRequest('/api/scrape', { method: 'POST', body: JSON.stringify(config.scraper), timeout: 15_000 });
    monitorJob(id);
  } catch (error) {
    await finishJob(id, 'FAILED', { phase: 'failed', error: error.message, imported: 0 });
    throw error;
  }
  return mapJob((await query('SELECT * FROM catalog_scan_jobs WHERE id=$1', [id])).rows[0]);
}

export async function cancelCatalogScan(actorId) {
  const runningJob = (await query("SELECT * FROM catalog_scan_jobs WHERE status IN ('STARTING','RUNNING','IMPORTING') ORDER BY started_at DESC LIMIT 1")).rows[0];
  if (!runningJob) return null;

  // Trava o monitor para nao zerar contadores nem competir na importacao
  await query(`UPDATE catalog_scan_jobs SET status='CANCELLING', phase='cancelling', updated_at=NOW() WHERE id=$1`, [runningJob.id]);
  await appendEvent(runningJob.id, 'Cancelamento solicitado — importando o que ja foi coletado...');

  try {
    await scraperRequest('/api/scrape/cancel', { method: 'POST', timeout: 5000 });
  } catch (error) {
    console.error('Failed to send cancel request to scraper:', error.message);
  }

  let imported = Number(runningJob.imported_count || 0);
  try {
    const fresh = (await query('SELECT * FROM catalog_scan_jobs WHERE id=$1', [runningJob.id])).rows[0];
    imported = await importLatestAssets(mapJob(fresh));
    await appendEvent(runningJob.id, `Importacao parcial apos cancelamento: ${imported} no banco central.`);
  } catch (error) {
    await appendEvent(runningJob.id, `Importacao parcial falhou: ${error.message}`).catch(() => {});
  }

  await finishJob(runningJob.id, 'CANCELLED', {
    phase: 'cancelled',
    imported,
    error: 'Cancelado pelo administrador.'
  });
  await appendEvent(runningJob.id, 'Varredura cancelada pelo administrador.').catch(() => {});

  return mapJob((await query('SELECT * FROM catalog_scan_jobs WHERE id=$1', [runningJob.id])).rows[0]);
}

export async function catalogLibraryOverview() {
  const [assets, realAssets, bytes, lastJob, service] = await Promise.all([
    query('SELECT COUNT(*)::int AS total FROM catalog_assets'),
    query(`SELECT COUNT(*)::int AS total FROM catalog_assets
      WHERE ean ~ '^[0-9]{8,14}$' AND content_type <> 'image/svg+xml' AND byte_size > 3000`),
    query(`SELECT COALESCE(SUM(byte_size),0)::bigint AS total FROM catalog_assets
      WHERE ean ~ '^[0-9]{8,14}$' AND content_type <> 'image/svg+xml' AND byte_size > 3000`),
    query('SELECT * FROM catalog_scan_jobs ORDER BY started_at DESC LIMIT 1'),
    scraperStatus()
  ]);
  return {
    totalAssets: Number(realAssets.rows[0].total),
    totalAllAssets: Number(assets.rows[0].total),
    totalBytes: Number(bytes.rows[0].total),
    collector: { online: service.online, active: Boolean(service.scraper?.active), url: scraperBaseUrl },
    job: mapJob(lastJob.rows[0])
  };
}

export async function listCatalogAssets({ search = '', limit = 48, offset = 0, realOnly = true } = {}) {
  const safeLimit = clamp(limit, 48, 1, 200);
  const safeOffset = clamp(offset, 0, 0, 100_000);
  const term = String(search || '').trim();
  const clauses = [];
  const values = [];

  if (realOnly !== false && realOnly !== '0') {
    clauses.push(`ean ~ '^[0-9]{8,14}$'`);
    clauses.push(`content_type <> 'image/svg+xml'`);
    clauses.push(`byte_size > 3000`);
  }

  if (term) {
    values.push(`%${term}%`);
    clauses.push(`(ean ILIKE $${values.length} OR description ILIKE $${values.length} OR source_name ILIKE $${values.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const index = values.length;
  const [items, count] = await Promise.all([
    query(`SELECT ean,description,content_type,byte_size,source_name,source_url,collected_at,updated_at
      FROM catalog_assets ${where}
      ORDER BY updated_at DESC
      LIMIT $${index + 1} OFFSET $${index + 2}`, [...values, safeLimit, safeOffset]),
    query(`SELECT COUNT(*)::int AS total FROM catalog_assets ${where}`, values)
  ]);
  return { items: items.rows.map(mapAsset), total: Number(count.rows[0].total), limit: safeLimit, offset: safeOffset, realOnly: realOnly !== false && realOnly !== '0' };
}

export async function getCatalogAssetImage(ean) {
  return (await query('SELECT content_type,image_data,checksum FROM catalog_assets WHERE ean=$1', [ean])).rows[0] || null;
}

export async function deleteCatalogAsset(ean) {
  return (await query('DELETE FROM catalog_assets WHERE ean=$1', [ean])).rowCount > 0;
}
