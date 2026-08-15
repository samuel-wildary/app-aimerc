const API_URL = import.meta.env.VITE_API_URL || 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api';

function realtimeUrl() {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return `ws://${window.location.host}/realtime`;
  }
  const base = (import.meta.env.VITE_API_URL || 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api').replace(/\/$/, '');
  if (base.startsWith('https://')) return `${base.replace(/^https/, 'wss')}/realtime`;
  if (base.startsWith('http://')) return `${base.replace(/^http/, 'ws')}/realtime`;
  return `${base}/realtime`;
}

export class RealtimeClient {
  constructor() {
    this.socket = null;
    this.token = '';
    this.handlers = new Set();
    this.reconnectTimer = null;
    this.closedByUser = false;
    this.backoffMs = 1_000;
  }

  onEvent(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  connect(token) {
    this.token = token || '';
    this.closedByUser = false;
    this.#open();
  }

  disconnect() {
    this.closedByUser = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  #emit(event) {
    for (const handler of this.handlers) {
      try { handler(event); }
      catch { /* ignore listener errors */ }
    }
  }

  #open() {
    if (!this.token || this.closedByUser) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const socket = new WebSocket(realtimeUrl());
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.backoffMs = 1_000;
      socket.send(JSON.stringify({ type: 'auth', token: this.token }));
    });

    socket.addEventListener('message', (message) => {
      let data;
      try { data = JSON.parse(message.data); }
      catch { return; }
      this.#emit(data);
    });

    socket.addEventListener('close', () => {
      if (this.socket === socket) this.socket = null;
      if (this.closedByUser || !this.token) return;
      const wait = this.backoffMs;
      this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
      this.reconnectTimer = window.setTimeout(() => this.#open(), wait);
    });
  }
}

export const realtime = new RealtimeClient();
