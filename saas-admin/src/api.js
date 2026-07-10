const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4100/api';

class AdminApi {
  constructor() { this.token = localStorage.getItem('aimerc.admin.token') || ''; }
  setToken(token) {
    this.token = token || '';
    if (token) localStorage.setItem('aimerc.admin.token', token);
    else localStorage.removeItem('aimerc.admin.token');
  }
  async request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...options.headers }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Falha ao processar a solicitacao');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  login(email, password) { return this.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); }
  overview() { return this.request('/admin/overview'); }
  stores() { return this.request('/admin/stores'); }
  subscriptions() { return this.request('/admin/subscriptions'); }
  createStore(data) { return this.request('/admin/stores', { method: 'POST', body: JSON.stringify(data) }); }
  updateStatus(id, status) { return this.request(`/admin/stores/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
}

export const api = new AdminApi();
