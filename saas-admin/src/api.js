const API_URL = import.meta.env.VITE_API_URL || 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api';

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
  storeDetail(id) { return this.request(`/admin/stores/${encodeURIComponent(id)}`); }
  storeProducts(id, { q = '', filter = 'all', limit = 60, offset = 0, category = 'Todos' } = {}) {
    const params = new URLSearchParams({
      q, filter, category, limit: String(limit), offset: String(offset)
    });
    return this.request(`/admin/stores/${encodeURIComponent(id)}/products?${params}`);
  }
  subscriptions() { return this.request('/admin/subscriptions'); }
  createStore(data) { return this.request('/admin/stores', { method: 'POST', body: JSON.stringify(data) }); }
  updateStatus(id, status) { return this.request(`/admin/stores/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
  updateBranding(id, colors) { return this.request(`/admin/stores/${id}/branding`, { method: 'PATCH', body: JSON.stringify(colors) }); }
  deleteStore(id, password) { return this.request(`/admin/stores/${id}`, { method: 'DELETE', body: JSON.stringify({ password }) }); }
  catalogLibrary(search = '') {
    return this.request(`/admin/catalog-library?limit=48&realOnly=1&search=${encodeURIComponent(search)}`);
  }
  startCatalogScan(data) { return this.request('/admin/catalog-library/scans', { method: 'POST', body: JSON.stringify(data) }); }
  cancelCatalogScan() { return this.request('/admin/catalog-library/scans/cancel', { method: 'POST' }); }
  deleteCatalogAsset(ean) { return this.request(`/admin/catalog-library/${encodeURIComponent(ean)}`, { method: 'DELETE' }); }
  syncStoreEanImages(storeId) {
    return this.request(`/admin/stores/${encodeURIComponent(storeId)}/sync-ean-images`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }
  assimilateStoreImages(storeId, { limit = 500, category = '', onlyLocalBarcode = true } = {}) {
    return this.request(`/admin/stores/${encodeURIComponent(storeId)}/assimilate-images`, {
      method: 'POST',
      body: JSON.stringify({ limit, category, onlyLocalBarcode })
    });
  }
  assimilateJob(storeId, jobId) {
    return this.request(`/admin/stores/${encodeURIComponent(storeId)}/assimilate-images/${encodeURIComponent(jobId)}`);
  }
  clearShortEanImages(storeId, maxDigits = 5) {
    return this.request(`/admin/stores/${encodeURIComponent(storeId)}/clear-short-ean-images`, {
      method: 'POST',
      body: JSON.stringify({ maxDigits })
    });
  }
  searchImages(q = '', limit = 48, offset = 0) {
    const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset), realOnly: '1' });
    return this.request(`/admin/image-search?${params}`);
  }
  linkProductImage(storeId, productId, catalogEan) {
    return this.request(`/admin/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/link-image`, {
      method: 'POST',
      body: JSON.stringify({ catalogEan })
    });
  }
  async uploadProductImage(storeId, productId, file) {
    const response = await fetch(
      `${API_URL}/admin/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/image`,
      {
        method: 'POST',
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          'Content-Type': file.type || 'image/jpeg'
        },
        body: file
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Falha ao enviar a foto');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  clearProductImage(storeId, productId) {
    return this.request(`/admin/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/image`, {
      method: 'DELETE'
    });
  }
  clearProductImages(storeId, productIds) {
    return this.request(`/admin/stores/${encodeURIComponent(storeId)}/products/clear-images`, {
      method: 'POST',
      body: JSON.stringify({ productIds })
    });
  }
  getAiAgentSettings() { return this.request('/admin/settings/ai-agent'); }
  saveAiAgentSettings(data) {
    return this.request('/admin/settings/ai-agent', { method: 'PUT', body: JSON.stringify(data) });
  }
  integrationProviders() { return this.request('/admin/integration-providers'); }
  integrations() { return this.request('/admin/integrations'); }
  saveIntegration(storeId, data) { return this.request(`/admin/stores/${storeId}/integration`, { method: 'PUT', body: JSON.stringify(data) }); }
  createIntegrationAgent(storeId, data = {}) { return this.request(`/admin/stores/${storeId}/integration/agent`, { method: 'POST', body: JSON.stringify(data) }); }
  async downloadIntegrationAgent() {
    const response = await fetch(`${API_URL}/admin/integration-agent/download`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {}
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.error || 'Nao foi possivel baixar o instalador');
      error.status = response.status;
      throw error;
    }
    return response.blob();
  }
}

export const api = new AdminApi();
