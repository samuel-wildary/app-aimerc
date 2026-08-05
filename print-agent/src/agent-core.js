import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { WebSocket } from './websocket.js';
import { buildOrderReceipt, buildTestReceipt } from './escpos.js';
import { sendRawToPrinter } from './print.js';

const DEFAULT_API = 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api';
const PRINT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1_000;

function apiBase(url) {
  return String(url || DEFAULT_API).replace(/\/$/, '');
}

function realtimeUrl(apiUrl) {
  const base = apiBase(apiUrl);
  if (base.startsWith('https://')) return `${base.replace(/^https/, 'wss')}/realtime`;
  if (base.startsWith('http://')) return `${base.replace(/^http/, 'ws')}/realtime`;
  return `${base}/realtime`;
}

function probePort(host, port, timeoutMs = 350) {
  return new Promise(resolve => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

function localSubnets() {
  const interfaces = os.networkInterfaces();
  const prefixes = new Set();
  for (const entries of Object.values(interfaces)) {
    for (const item of entries || []) {
      const family = item.family === 4 || item.family === 'IPv4';
      if (!family || item.internal) continue;
      const parts = String(item.address || '').split('.');
      if (parts.length !== 4) continue;
      prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
    }
  }
  return [...prefixes];
}

export async function discoverThermalPrinters({ onProgress } = {}) {
  const found = [];
  const seen = new Set();
  const prefixes = localSubnets();
  if (!prefixes.length) prefixes.push('192.168.0', '192.168.1');

  for (const prefix of prefixes) {
    const batch = [];
    for (let hostPart = 1; hostPart <= 254; hostPart += 1) {
      const host = `${prefix}.${hostPart}`;
      batch.push((async () => {
        const open = await probePort(host, 9100);
        if (!open || seen.has(host)) return;
        seen.add(host);
        const printer = { host, port: 9100, label: `Termica ${host}` };
        found.push(printer);
        onProgress?.({ found: found.length, host, printers: [...found] });
      })());
      if (batch.length >= 48) {
        await Promise.all(batch);
        batch.length = 0;
      }
    }
    if (batch.length) await Promise.all(batch);
  }

  return found.sort((a, b) => a.host.localeCompare(b.host, undefined, { numeric: true }));
}

export async function loginToStore({ apiUrl, email, password }) {
  const response = await fetch(`${apiBase(apiUrl)}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'E-mail ou senha invalidos');
  return data;
}

export async function testPrinterConnection({ host, port = 9100, storeName = 'AiMerc' }) {
  if (!host) throw new Error('Selecione ou informe o IP da impressora');
  await sendRawToPrinter(host, port, buildTestReceipt(storeName));
}

export class OrdersAgent {
  constructor() {
    this.connected = false;
    this.storeName = 'AiMerc';
    this.storeId = null;
    this.lastOrderId = null;
    this.lastError = '';
    this.printedCount = 0;
    this.logs = [];
    this.printedOrders = new Map();
    this.socket = null;
    this.closedByUser = false;
    this.backoffMs = 1_000;
    this.config = null;
    this.listeners = new Set();
    this.healthServer = null;
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    const snapshot = this.getStatus();
    for (const listener of this.listeners) {
      try { listener(snapshot); } catch {}
    }
  }

  log(level, message, extra = {}) {
    const entry = { timestamp: new Date().toISOString(), level, message, ...extra };
    this.logs = [entry, ...this.logs].slice(0, 80);
    if (level === 'error') this.lastError = message;
    this.emit();
  }

  getStatus() {
    return {
      connected: this.connected,
      storeName: this.storeName,
      storeId: this.storeId,
      lastOrderId: this.lastOrderId,
      lastError: this.lastError,
      printedCount: this.printedCount,
      autoPrint: Boolean(this.config?.printerHost),
      printer: this.config?.printerHost
        ? { host: this.config.printerHost, port: this.config.printerPort || 9100 }
        : null,
      logs: this.logs
    };
  }

  rememberPrinted(orderId) {
    const now = Date.now();
    for (const [id, at] of this.printedOrders) {
      if (now - at > PRINT_DEDUPE_TTL_MS) this.printedOrders.delete(id);
    }
    if (this.printedOrders.has(orderId)) return false;
    this.printedOrders.set(orderId, now);
    return true;
  }

  async printOrder(order) {
    if (!this.config?.printerHost) {
      this.log('info', 'Pedido recebido (sem impressora selecionada)', { orderId: order.id });
      return;
    }
    if (!this.rememberPrinted(order.id)) {
      this.log('info', 'Pedido ja impresso nesta sessao', { orderId: order.id });
      return;
    }
    const payload = buildOrderReceipt(order, this.storeName);
    await sendRawToPrinter(this.config.printerHost, this.config.printerPort || 9100, payload);
    this.printedCount += 1;
    this.log('info', 'Cupom impresso', { orderId: order.id });
  }

  startHealthServer(port = 4177) {
    if (this.healthServer) return;
    this.healthServer = http.createServer((_req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'aimerc-orders-agent', ...this.getStatus(), version: '2.0.0' }));
    });
    this.healthServer.listen(port, '127.0.0.1');
  }

  async start(config) {
    await this.stop();
    this.config = {
      apiUrl: apiBase(config.apiUrl || DEFAULT_API),
      email: config.email,
      password: config.password,
      printerHost: config.printerHost || '',
      printerPort: Number(config.printerPort || 9100),
      healthPort: Number(config.healthPort || 4177)
    };
    this.lastError = '';
    this.closedByUser = false;
    this.backoffMs = 1_000;

    const session = await loginToStore({
      apiUrl: this.config.apiUrl,
      email: this.config.email,
      password: this.config.password
    });
    this.storeName = session.store?.name || 'AiMerc';
    this.startHealthServer(this.config.healthPort);
    this.openSocket(session.token);
    this.log('info', 'Login ok, conectando aos pedidos...', { store: this.storeName });
    return this.getStatus();
  }

  openSocket(token) {
    if (this.closedByUser) return;
    const socket = new WebSocket(realtimeUrl(this.config.apiUrl));
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.backoffMs = 1_000;
      socket.send(JSON.stringify({ type: 'auth', token }));
      this.log('info', 'WebSocket aberto, autenticando...');
    });

    socket.addEventListener('message', async event => {
      let data;
      try { data = JSON.parse(String(event.data)); }
      catch { return; }

      if (data.type === 'ready') {
        this.connected = true;
        this.storeId = data.storeId || null;
        this.log('info', 'Conectado. Aguardando pedidos.', { storeId: this.storeId });
        return;
      }

      if (data.type === 'error') {
        this.connected = false;
        this.log('error', data.error || 'Erro no realtime');
        return;
      }

      if (data.type === 'order.created' && data.order) {
        this.lastOrderId = data.order.id;
        this.log('info', 'Novo pedido', { orderId: data.order.id });
        try {
          await this.printOrder(data.order);
        } catch (error) {
          this.printedOrders.delete(data.order.id);
          this.log('error', error.message || 'Falha ao imprimir');
        }
      }

      if (data.type === 'order.updated' && data.order) {
        this.lastOrderId = data.order.id;
        this.log('info', 'Pedido atualizado', { orderId: data.order.id, status: data.order.status });
      }
    });

    socket.addEventListener('close', () => {
      this.connected = false;
      this.emit();
      if (this.closedByUser) return;
      this.log('info', 'Conexao caiu, reconectando...', { waitMs: this.backoffMs });
      const wait = this.backoffMs;
      this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
      setTimeout(() => this.openSocket(token), wait);
    });

    socket.addEventListener('error', () => {});
  }

  async stop() {
    this.closedByUser = true;
    this.connected = false;
    try { this.socket?.close(); } catch {}
    this.socket = null;
    if (this.healthServer) {
      await new Promise(resolve => this.healthServer.close(() => resolve()));
      this.healthServer = null;
    }
    this.emit();
  }
}
