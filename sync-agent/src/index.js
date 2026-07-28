import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { normalizeProducts } from './normalizer.js';
import { loadSysPdvProducts } from './firebird-syspdv.js';

const installerScript = typeof __AIMERC_INSTALLER_SCRIPT__ === 'string' ? __AIMERC_INSTALLER_SCRIPT__ : '';

const configArgument = process.argv.findIndex(value => value === '--config');
const configPath = path.resolve(
  configArgument >= 0 && process.argv[configArgument + 1]
    ? process.argv[configArgument + 1]
    : process.env.AIMERC_AGENT_CONFIG || '.env'
);

async function loadConfigFile() {
  try {
    const contents = await fs.readFile(configPath, 'utf8');
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
      if (process.env[key] == null) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function launchInstaller(smokeTest = false) {
  if (!installerScript) throw new Error('Assistente de instalacao indisponivel nesta compilacao');
  const scriptPath = path.join(os.tmpdir(), `aimerc-configure-${Date.now()}.ps1`);
  await fs.writeFile(scriptPath, installerScript, 'utf8');
  try {
    try {
      const installerArguments = [
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
        '-Install', '-SourceExecutable', process.execPath
      ];
      if (smokeTest) installerArguments.push('-SmokeTest');
      execFileSync('powershell.exe', installerArguments, { stdio: 'pipe' });
    } catch (error) {
      const detail = String(error.stderr || error.stdout || error.message || error).trim().slice(0, 2_000);
      const errorLog = path.join(os.tmpdir(), 'AiMerc-Agent-Setup-error.log');
      await fs.writeFile(errorLog, `${detail}\n`, 'utf8');
      const message = `O instalador AiMerc encontrou um erro.\n\n${detail || 'Falha desconhecida'}\n\nDetalhes: ${errorLog}`;
      try {
        execFileSync('powershell.exe', [
          '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
          'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($env:AIMERC_INSTALL_ERROR, "AiMerc", "OK", "Error") | Out-Null'
        ], { stdio: 'ignore', env: { ...process.env, AIMERC_INSTALL_ERROR: message } });
      } catch {}
      throw error;
    }
  } finally {
    await fs.rm(scriptPath, { force: true });
  }
}

let config;
let dataDirectory;
let queuePath;
let logPath;

async function log(level, payload) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, ...payload });
  if (level === 'error') console.error(line); else console.log(line);
  try {
    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.appendFile(logPath, `${line}\n`, 'utf8');
  } catch {}
}

function validateConfig() {
  for (const [key, value] of [['AIMERC_API_URL', config.apiUrl], ['AIMERC_AGENT_TOKEN', config.agentToken]]) {
    if (!value) throw new Error(`${key} nao configurada`);
  }
  if (config.connectionMode === 'FIREBIRD') {
    for (const [key, value] of [
      ['FIREBIRD_ISQL_PATH', config.firebirdIsqlPath],
      ['FIREBIRD_DATABASE', config.database],
      ['FIREBIRD_USER', config.firebirdUser],
      ['FIREBIRD_PASSWORD', config.firebirdPassword]
    ]) {
      if (!value) throw new Error(`${key} nao configurado`);
    }
    if (config.provider !== 'SYSPDV') throw new Error('O modo FIREBIRD esta disponivel para o perfil SYSPDV');
  } else if (!config.erpUrl) {
    throw new Error('ERP_API_URL nao configurada');
  }
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.status === 204 ? null : response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadProducts() {
  if (config.connectionMode === 'FIREBIRD') {
    return loadSysPdvProducts({ ...config, dataDirectory });
  }
  const headers = { Accept: 'application/json' };
  if (config.erpAuthType === 'BEARER') headers.Authorization = `Bearer ${config.erpToken}`;
  if (config.erpAuthType === 'API_KEY') headers[config.erpAuthHeader] = config.erpToken;
  if (config.erpAuthType === 'BASIC') headers.Authorization = `Basic ${Buffer.from(config.erpToken).toString('base64')}`;
  const payload = await request(config.erpUrl, { headers });
  const mapping = { ...(config.fieldMapping || {}) };
  if (config.itemsPath) mapping.itemsPath = config.itemsPath;
  return normalizeProducts(payload, config.provider, mapping);
}

async function refreshRemoteConfig() {
  const remote = await request(`${config.apiUrl}/agent/config`, {
    headers: { Authorization: `Bearer ${config.agentToken}`, Accept: 'application/json' }
  });
  config.provider = String(remote.providerCode || config.provider).toUpperCase();
  config.fieldMapping = remote.fieldMapping && typeof remote.fieldMapping === 'object' ? remote.fieldMapping : {};
  config.interval = Math.max(30, Number(remote.syncIntervalSeconds) || config.interval);
}

async function savePending(products) {
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.writeFile(queuePath, JSON.stringify(products), 'utf8');
}

async function readPending() {
  try { return JSON.parse(await fs.readFile(queuePath, 'utf8')); } catch { return null; }
}

async function sendProducts(products) {
  const headers = { Authorization: `Bearer ${config.agentToken}`, 'Content-Type': 'application/json' };
  let summary = { created: 0, updated: 0, received: 0 };
  for (let offset = 0; offset < products.length; offset += config.batchSize) {
    const items = products.slice(offset, offset + config.batchSize);
    const result = await request(`${config.apiUrl}/agent/products`, {
      method: 'POST', headers, body: JSON.stringify({ items, agentVersion: config.version })
    });
    summary = {
      created: summary.created + Number(result.created || 0),
      updated: summary.updated + Number(result.updated || 0),
      received: summary.received + items.length
    };
  }
  await fs.rm(queuePath, { force: true });
  return summary;
}

async function heartbeat() {
  const capabilities = ['PRODUCT_SYNC', 'OFFLINE_QUEUE', 'REMOTE_CONFIG'];
  if (config.connectionMode === 'FIREBIRD') capabilities.push('FIREBIRD_SYSPDV');
  return request(`${config.apiUrl}/agent/heartbeat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.agentToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: config.version, capabilities })
  });
}

async function synchronize() {
  const started = new Date().toISOString();
  try {
    await refreshRemoteConfig();
    await heartbeat();
    const pending = await readPending();
    const products = pending?.length ? pending : await loadProducts();
    if (!pending) await savePending(products);
    const result = await sendProducts(products);
    await log('info', { ok: true, provider: config.provider, started, finished: new Date().toISOString(), ...result });
  } catch (error) {
    await log('error', { ok: false, provider: config.provider, started, error: error.message });
  }
}

async function main() {
  if (process.argv.includes('--version')) {
    console.log('AiMerc Sync Agent 1.1.2');
    return;
  }
  const isPackagedExecutable = path.extname(process.execPath).toLowerCase() === '.exe'
    && path.basename(process.execPath).toLowerCase() !== 'node.exe';
  const isAgentExecution = configArgument >= 0 || process.argv.includes('--once');
  if (isPackagedExecutable && !isAgentExecution) {
    await launchInstaller(process.argv.includes('--installer-smoke-test'));
    return;
  }
  await loadConfigFile();
  config = {
    apiUrl: String(process.env.AIMERC_API_URL || '').replace(/\/$/, ''),
    agentToken: String(process.env.AIMERC_AGENT_TOKEN || ''),
    provider: String(process.env.ERP_PROVIDER || 'GENERIC_JSON').toUpperCase(),
    connectionMode: String(process.env.ERP_CONNECTION_MODE || 'HTTP_JSON').toUpperCase(),
    erpUrl: String(process.env.ERP_API_URL || ''),
    erpAuthType: String(process.env.ERP_AUTH_TYPE || 'NONE').toUpperCase(),
    erpToken: String(process.env.ERP_API_TOKEN || ''),
    erpAuthHeader: String(process.env.ERP_AUTH_HEADER || 'X-API-Key'),
    itemsPath: String(process.env.ERP_ITEMS_PATH || ''),
    firebirdIsqlPath: String(process.env.FIREBIRD_ISQL_PATH || ''),
    host: String(process.env.FIREBIRD_HOST || '127.0.0.1'),
    port: Number(process.env.FIREBIRD_PORT) || 3050,
    database: String(process.env.FIREBIRD_DATABASE || ''),
    firebirdUser: String(process.env.FIREBIRD_USER || ''),
    firebirdPassword: String(process.env.FIREBIRD_PASSWORD || ''),
    firebirdCharset: String(process.env.FIREBIRD_CHARSET || 'WIN1252'),
    firebirdOutputEncoding: String(process.env.FIREBIRD_OUTPUT_ENCODING || 'windows-1252'),
    firebirdTimeoutMs: Math.max(30_000, Number(process.env.FIREBIRD_TIMEOUT_SECONDS || 120) * 1_000),
    interval: Math.max(30, Number(process.env.SYNC_INTERVAL_SECONDS) || 300),
    batchSize: Math.max(50, Math.min(1_000, Number(process.env.SYNC_BATCH_SIZE) || 500)),
    version: String(process.env.AGENT_VERSION || '1.1.2')
  };
  dataDirectory = path.resolve(process.env.AIMERC_DATA_DIR || path.join(path.dirname(configPath), 'data'));
  queuePath = path.join(dataDirectory, 'pending-products.json');
  logPath = path.join(dataDirectory, 'agent.log');
  validateConfig();
  if (process.argv.includes('--once')) {
    await synchronize();
    return;
  }
  const runScheduled = async () => {
    await synchronize();
    setTimeout(runScheduled, config.interval * 1_000);
  };
  await runScheduled();
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
