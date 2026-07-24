import React, { useEffect, useState } from 'react';
import { Bot, Check, KeyRound, Save, ServerCog } from 'lucide-react';
import { api } from './api.js';

const MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1'
];

export default function SettingsPage() {
  const [agent, setAgent] = useState(null);
  const [form, setForm] = useState({ provider: 'openai', model: 'gpt-4o-mini', apiKey: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.getAiAgentSettings();
      setAgent(data);
      setForm({
        provider: data.provider || 'openai',
        model: data.model || 'gpt-4o-mini',
        apiKey: ''
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await api.saveAiAgentSettings({
        provider: form.provider,
        model: form.model,
        apiKey: form.apiKey || undefined
      });
      setAgent(saved);
      setForm(current => ({ ...current, apiKey: '' }));
      setMessage('Agente de busca salvo. A assimilacao de EAN local usara esta configuracao.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function clearKey() {
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveAiAgentSettings({ clearApiKey: true, model: form.model, provider: form.provider });
      setAgent(saved);
      setMessage('Chave API removida das configuracoes.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="panel"><div className="empty">Carregando configuracoes...</div></section>;
  }

  return (
    <div className="store-detail">
      <section className="hero">
        <div>
          <p className="eyebrow">Plataforma</p>
          <h2>Configuracoes</h2>
          <p>Integre agentes de busca de imagens e outras APIs da plataforma sem misturar com a operacao das lojas.</p>
        </div>
        <div className="hero-badge">
          <span>Agente de imagens</span>
          <strong>{agent?.hasApiKey ? 'Conectado' : 'Pendente'}</strong>
          <small>{agent?.source === 'settings' ? 'Chave salva no painel' : agent?.source === 'env' ? 'Usando variavel de ambiente' : 'Sem chave'}</small>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Integracao com API</p>
            <h2>Agentes de busca</h2>
            <p>Usado apenas para EAN local (hortifruti/frigorifico). EAN global continua automatico, sem IA.</p>
          </div>
          <Bot size={22} />
        </div>
        {error && <div className="error">{error}</div>}
        {message && <div className="empty" style={{ marginBottom: 12 }}><Check size={16} /> {message}</div>}
        <form onSubmit={save} className="brand-builder">
          <label>Provedor
            <select value={form.provider} onChange={event => setForm(current => ({ ...current, provider: event.target.value }))}>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label>Modelo
            <select value={form.model} onChange={event => setForm(current => ({ ...current, model: event.target.value }))}>
              {MODELS.map(model => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
          <label>Chave API
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KeyRound size={16} />
              <input
                type="password"
                value={form.apiKey}
                onChange={event => setForm(current => ({ ...current, apiKey: event.target.value }))}
                placeholder={agent?.hasApiKey ? '•••••••• (deixe em branco para manter)' : 'sk-...'}
                autoComplete="off"
              />
            </div>
          </label>
          <div className="modal-actions">
            <button type="button" className="ghost" disabled={saving || !agent?.hasApiKey} onClick={clearKey}>Remover chave</button>
            <button className="accent" disabled={saving}><Save size={16} /> {saving ? 'Salvando...' : 'Salvar agente'}</button>
          </div>
        </form>
        <div className="support-card" style={{ marginTop: 18 }}>
          <ServerCog size={18} />
          <strong>Como funciona</strong>
          <span>1) Banco de imagens coleta tudo da fonte escolhida. 2) No supermercado, EAN global casa sozinho. 3) EAN local usa este agente com barra de progresso.</span>
        </div>
      </section>
    </div>
  );
}
