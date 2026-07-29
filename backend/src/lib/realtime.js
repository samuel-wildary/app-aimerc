import { WebSocketServer } from 'ws';
import { readToken } from './auth.js';
import { getStoreBySlug, getTrackedOrder } from './database.js';

const HEARTBEAT_MS = 25_000;

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map();

function roomKey(kind, ...parts) {
  return [kind, ...parts].join(':');
}

function joinRoom(ws, key) {
  if (!rooms.has(key)) rooms.set(key, new Set());
  rooms.get(key).add(ws);
  ws.__rooms.add(key);
}

function leaveAllRooms(ws) {
  for (const key of ws.__rooms || []) {
    const members = rooms.get(key);
    if (!members) continue;
    members.delete(ws);
    if (!members.size) rooms.delete(key);
  }
  ws.__rooms = new Set();
}

function send(ws, payload) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

export function publish(key, payload) {
  const members = rooms.get(key);
  if (!members?.size) return 0;
  const message = JSON.stringify(payload);
  let delivered = 0;
  for (const ws of members) {
    if (ws.readyState !== 1) continue;
    ws.send(message);
    delivered += 1;
  }
  return delivered;
}

export function publishStoreEvent(storeId, payload) {
  if (!storeId) return 0;
  return publish(roomKey('store', storeId), payload);
}

export function publishCatalogEvent(storeId, payload) {
  if (!storeId) return 0;
  return publish(roomKey('catalog', storeId), payload)
    + publish(roomKey('store', storeId), payload);
}

export function publishOrderEvent(storeId, orderId, payload) {
  if (!storeId || !orderId) return 0;
  return publish(roomKey('order', storeId, orderId), payload);
}

export function notifyOrderCreated(storeId, order) {
  publishStoreEvent(storeId, { type: 'order.created', storeId, order });
}

export function notifyOrderUpdated(storeId, order) {
  const orderId = order?.id;
  publishStoreEvent(storeId, { type: 'order.updated', storeId, order });
  if (orderId) {
    publishOrderEvent(storeId, orderId, { type: 'order.updated', storeId, orderId });
  }
}

export function notifyCatalogUpdated(storeId) {
  if (!storeId) return;
  const existing = catalogDebounce.get(storeId);
  if (existing) clearTimeout(existing);
  catalogDebounce.set(storeId, setTimeout(() => {
    catalogDebounce.delete(storeId);
    publishCatalogEvent(storeId, { type: 'catalog.updated', storeId });
  }, 5_000));
}

const catalogDebounce = new Map();

async function handleManagerAuth(ws, token) {
  const user = readToken(token);
  if (!user || user.role !== 'STORE_MANAGER' || !user.storeId) {
    send(ws, { type: 'error', error: 'Autenticacao invalida' });
    return;
  }
  leaveAllRooms(ws);
  ws.__role = 'manager';
  ws.__storeId = user.storeId;
  joinRoom(ws, roomKey('store', user.storeId));
  send(ws, { type: 'ready', role: 'manager', storeId: user.storeId });
}

async function handleCustomerSubscribe(ws, message) {
  const storeSlug = String(message.storeSlug || '').trim();
  const store = storeSlug ? await getStoreBySlug(storeSlug) : null;
  if (!store) {
    send(ws, { type: 'error', error: 'Loja nao encontrada' });
    return;
  }

  const orders = Array.isArray(message.orders) ? message.orders.slice(0, 50) : [];
  leaveAllRooms(ws);
  ws.__role = 'customer';
  ws.__storeId = store.id;
  // Catalogo publico da loja — sem pedidos de outros clientes.
  joinRoom(ws, roomKey('catalog', store.id));

  let tracked = 0;
  for (const entry of orders) {
    const orderId = String(entry?.id || '').trim();
    const token = String(entry?.token || '').trim();
    if (!orderId || !token) continue;
    const order = await getTrackedOrder(store.id, orderId, token);
    if (!order) continue;
    joinRoom(ws, roomKey('order', store.id, orderId));
    tracked += 1;
  }

  send(ws, { type: 'ready', role: 'customer', storeId: store.id, trackedOrders: tracked });
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    let pathname = '/';
    try {
      pathname = new URL(request.url || '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/api/realtime') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    ws.__rooms = new Set();
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    send(ws, { type: 'hello', protocol: 1 });

    ws.on('message', async (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        send(ws, { type: 'error', error: 'JSON invalido' });
        return;
      }

      try {
        if (message?.type === 'auth') {
          await handleManagerAuth(ws, message.token);
          return;
        }
        if (message?.type === 'subscribe') {
          await handleCustomerSubscribe(ws, message);
          return;
        }
        if (message?.type === 'ping') {
          send(ws, { type: 'pong', at: new Date().toISOString() });
          return;
        }
        send(ws, { type: 'error', error: 'Comando desconhecido' });
      } catch (error) {
        send(ws, { type: 'error', error: error.message || 'Falha no realtime' });
      }
    });

    ws.on('close', () => leaveAllRooms(ws));
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  wss.on('close', () => clearInterval(heartbeat));
  return wss;
}
