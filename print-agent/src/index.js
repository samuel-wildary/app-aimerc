import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isSea } from 'node:sea';
import { WebSocket } from './websocket.js';
import { buildOrderReceipt, buildTestReceipt } from './escpos.js';
import { sendRawToPrinter } from './print.js';

function resolveRootDir() {
  try {
    if (typeof isSea === 'function' && isSea()) return path.dirname(process.execPath);
  } catch {}
  return process.cwd();
}

const rootDir = resolveRootDir();
const args = new Set(process.argv.slice(2));
const printedOrders = new Map();
const PRINT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1_000;

const configArgument = process.argv.findIndex(value => value === '--config');
const configPath = path.resolve(
  configArgument >= 0 && process.argv[configArgument + 1]
    ? process.argv[configArgument + 1]
    : process.env.AIMERC_PRINT_CONFIG || path.join(rootDir, '.env')
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

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} nao configurada`);
  return value;
}

function apiBase() {
  return String(process.env.AIMERC_API_URL || 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api').replace(/\/$/, '');
}

function realtimeUrl() {
  const base = apiBase();
  if (base.startsWith('https://')) return `${base.replace(/^https/, 'wss')}/realtime`;
  if (base.startsWith('http://')) return `${base.replace(/^http/, 'ws')}/realtime`;
  return `${base}/realtime`;
}

function printerConfigured() {
  return Boolean(String(process.env.PRINTER_HOST || '').trim());
}

function printerHost() {
  return required('PRINTER_HOST');
}

function printerPort() {
  return Number(process.env.PRINTER_PORT || 9100);
}

function autoPrintEnabled() {
  const flag = String(process.env.AUTO_PRINT || 'true').trim().toLowerCase();
  return flag !== '0' && flag !== 'false' && flag !== 'no' && printerConfigured();
}

function healthPort() {
  return Number(process.env.HEALTH_PORT || 4177);
}

function log(level, message, extra = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
}

function rememberPrinted(orderId) {
  const now = Date.now();
  for (const [id, at] of printedOrders) {
    if (now - at > PRINT_DEDUPE_TTL_MS) printedOrders.delete(id);
  }
  if (printedOrders.has(orderId)) return false;
  printedOrders.set(orderId, now);
  return true;
}

async function login() {
  if (process.env.AIMERC_TOKEN) {
    return {
      token: process.env.AIMERC_TOKEN,
      store: { name: process.env.STORE_NAME || 'AiMerc' }
    };
  }
  const email = required('AIMERC_EMAIL');
  const password = required('AIMERC_PASSWORD');
  const response = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Falha no login do AiMerc Pedidos Agent');
  return data;
}

async function printOrder(order, storeName) {
  if (!order?.id) throw new Error('Pedido sem id');
  if (!autoPrintEnabled()) {
    log('info', 'Pedido recebido (impressao desligada ou sem PRINTER_HOST)', { orderId: order.id });
    return { skipped: true, reason: 'auto-print-off' };
  }
  if (!rememberPrinted(order.id)) {
    log('info', 'Pedido ja impresso nesta sessao', { orderId: order.id });
    return { skipped: true };
  }
  const payload = buildOrderReceipt(order, storeName);
  await sendRawToPrinter(printerHost(), printerPort(), payload);
  log('info', 'Cupom enviado para a termica', { orderId: order.id, host: printerHost(), port: printerPort() });
  return { printed: true };
}

async function printTest(storeName) {
  if (!printerConfigured()) throw new Error('PRINTER_HOST nao configurada no .env');
  const payload = buildTestReceipt(storeName);
  await sendRawToPrinter(printerHost(), printerPort(), payload);
  log('info', 'Cupom de teste enviado', { host: printerHost(), port: printerPort() });
}

function startHealthServer(state) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${healthPort()}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: 'aimerc-orders-agent',
        connected: Boolean(state.connected),
        storeName: state.storeName || null,
        autoPrint: autoPrintEnabled(),
        printer: printerConfigured()
          ? { host: process.env.PRINTER_HOST, port: printerPort() }
          : null,
        printedCount: printedOrders.size,
        lastOrderId: state.lastOrderId || null,
        version: '1.1.0'
      }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/test-print') {
      try {
        await printTest(state.storeName || 'AiMerc');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(healthPort(), '127.0.0.1', () => {
    log('info', 'Health local ativo', { url: `http://127.0.0.1:${healthPort()}/health` });
  });

  return server;
}

function connectRealtime(token, storeName, state) {
  let backoffMs = 1_000;
  let socket = null;
  let closedByUser = false;

  function open() {
    if (closedByUser) return;
    socket = new WebSocket(realtimeUrl());

    socket.addEventListener('open', () => {
      backoffMs = 1_000;
      socket.send(JSON.stringify({ type: 'auth', token }));
      log('info', 'WebSocket conectado, autenticando...');
    });

    socket.addEventListener('message', async event => {
      let data;
      try { data = JSON.parse(String(event.data)); }
      catch { return; }

      if (data.type === 'ready') {
        state.connected = true;
        log('info', 'AiMerc Pedidos Agent pronto', { storeId: data.storeId });
        return;
      }

      if (data.type === 'error') {
        state.connected = false;
        log('error', 'Erro no realtime', { error: data.error });
        return;
      }

      if (data.type === 'order.created' && data.order) {
        state.lastOrderId = data.order.id;
        log('info', 'Novo pedido recebido', { orderId: data.order.id, total: data.order.total });
        try {
          await printOrder(data.order, storeName);
        } catch (error) {
          printedOrders.delete(data.order.id);
          log('error', 'Falha ao imprimir pedido', { orderId: data.order.id, error: error.message });
        }
      }

      if (data.type === 'order.updated' && data.order) {
        state.lastOrderId = data.order.id;
        log('info', 'Pedido atualizado', { orderId: data.order.id, status: data.order.status });
      }
    });

    socket.addEventListener('close', () => {
      state.connected = false;
      if (closedByUser) return;
      log('info', 'WebSocket fechado, reconectando...', { waitMs: backoffMs });
      setTimeout(open, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30_000);
    });

    socket.addEventListener('error', () => {
      /* close handler reconecta */
    });
  }

  open();
  return {
    stop() {
      closedByUser = true;
      try { socket?.close(); } catch {}
    }
  };
}

async function main() {
  await loadConfigFile();
  const state = { connected: false, storeName: process.env.STORE_NAME || 'AiMerc', lastOrderId: null };

  if (args.has('--test-print')) {
    await printTest(state.storeName);
    return;
  }

  const session = await login();
  state.storeName = session.store?.name || state.storeName;
  const health = startHealthServer(state);

  if (args.has('--health-only')) {
    log('info', 'Modo health-only (sem websocket)');
    return;
  }

  const realtime = connectRealtime(session.token, state.storeName, state);
  log('info', 'AiMerc Pedidos Agent iniciado', {
    api: apiBase(),
    store: state.storeName,
    autoPrint: autoPrintEnabled(),
    printer: autoPrintEnabled() ? `${printerHost()}:${printerPort()}` : null
  });

  const shutdown = () => {
    realtime.stop();
    health.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(error => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    message: error.message || String(error)
  }));
  process.exit(1);
});
