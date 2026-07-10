const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4100/api';

export class ApiClient {
  constructor() {
    this.token = localStorage.getItem('aimerc.store.token') || '';
  }

  setToken(token) {
    this.token = token || '';
    if (token) localStorage.setItem('aimerc.store.token', token);
    else localStorage.removeItem('aimerc.store.token');
  }

  async request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...options.headers
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Nao foi possivel concluir a operacao');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  login(email, password) {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  }

  summary() { return this.request('/dashboard/summary'); }
  orders() { return this.request('/orders'); }
  products(query = '') { return this.request(`/products${query ? `?q=${encodeURIComponent(query)}` : ''}`); }
  updateStatus(id, status) { return this.request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
  createDemoOrder(items) {
    return this.request('/public/stores/aimerc-demo/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer: { name: 'Ana Beatriz', phone: '(85) 98888-2026', address: 'Rua Coronel Correia, 820, Centro' },
        fulfillmentType: 'DELIVERY',
        paymentMethod: 'CARD_ON_DELIVERY',
        notes: 'Ligar ao chegar. Pedido de demonstracao.',
        items
      })
    });
  }
}

export const api = new ApiClient();
