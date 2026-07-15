const API_URL = import.meta.env.VITE_API_URL || 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api';

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
  customers(query = '') { return this.request(`/customers${query ? `?q=${encodeURIComponent(query)}` : ''}`); }
  reports() { return this.request('/reports/overview'); }
  banners() { return this.request('/banners'); }
  async uploadBannerImage(file) {
    const response = await fetch(`${API_URL}/banners/images`, {
      method: 'POST',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        'Content-Type': file.type || 'image/webp'
      },
      body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel enviar a imagem do banner');
    return data;
  }
  updateSettings(settings) { return this.request('/store/settings', { method: 'PATCH', body: JSON.stringify(settings) }); }
  createBanner(banner) { return this.request('/banners', { method: 'POST', body: JSON.stringify(banner) }); }
  updateBanner(id, banner) { return this.request(`/banners/${id}`, { method: 'PATCH', body: JSON.stringify(banner) }); }
  deleteBanner(id) { return this.request(`/banners/${id}`, { method: 'DELETE' }); }
  pushCampaigns() { return this.request('/push-campaigns'); }
  createPushCampaign(campaign) { return this.request('/push-campaigns', { method: 'POST', body: JSON.stringify(campaign) }); }
  sendPushCampaign(id) { return this.request(`/push-campaigns/${id}/send`, { method: 'POST' }); }
  deletePushCampaign(id) { return this.request(`/push-campaigns/${id}`, { method: 'DELETE' }); }
  pushAutomations() { return this.request('/push-automations'); }
  createPushAutomation(automation) { return this.request('/push-automations', { method: 'POST', body: JSON.stringify(automation) }); }
  updatePushAutomation(id, automation) { return this.request(`/push-automations/${id}`, { method: 'PATCH', body: JSON.stringify(automation) }); }
  runPushAutomation(id) { return this.request(`/push-automations/${id}/run`, { method: 'POST' }); }
  deletePushAutomation(id) { return this.request(`/push-automations/${id}`, { method: 'DELETE' }); }
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
