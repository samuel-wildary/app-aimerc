import React, { useEffect, useState } from 'react';
import { Bot, Check, KeyRound, Save, ServerCog } from 'lucide-react';
import { api } from './api.js';

const MODELS = [
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    detail: 'Mais inteligente — melhor para nomes abreviados e casos dificeis'
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    detail: 'Equilibrio entre qualidade e custo (recomendado)'
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    detail: 'Mais barato e rapido — bom para muitos produtos'
  },
  {
    id: 'gpt-5.6',
    name: 'GPT-5.6 (alias Sol)',
    detail: 'Alias oficial que aponta para o Sol'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    detail: 'Geracao anterior'
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    detail: 'Geracao anterior, mais barata'
  }
];

const DEFAULT_MODEL = 'gpt-5.6-terra';

export default function SettingsPage() {
  const [agent, setAgent] = useState(null);
  const [form, setForm] = useState({ provider: 'openai', model: DEFAULT_MODEL, apiKey: '', customModel: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const knownIds = new Set(MODELS.map(item => item.id));
  const selectedIsCustom = form.customModel.trim() !== '' || (form.model && !knownIds.has(form.model));

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.getAiAgentSettings();
      setAgent(data);
      const model = data.model || DEFAULT_MODEL;
      setForm({
        provider: data.provider || 'openai',
        model: knownIds.has(model) ? model : DEFAULT_MODEL,
        customModel: knownIds.has(model) ? '' : model,
        apiKey: ''
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function selectedModelId() {
    const custom = form.customModel.trim();
    if (custom) return custom;
    return form.model || DEFAULT_MODEL;
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const model = selectedModelId();
      if (!model) throw new Error('Informe o modelo OpenAI');
      const saved = await api.saveAiAgentSettings({
        provider: form.provider,
        model,
        apiKey: form.apiKey || undefined
      });
      setAgent(saved);
      setForm(current => ({
        ...current,
        apiKey: '',
        model: knownIds.has(saved.model) ? saved.model : DEFAULT_MODEL,
        customModel: knownIds.has(saved.model) ? '' : saved.model
      }));
      setMessage(`Agente salvo com ${saved.model}. A assimilacao de EAN local usara este modelo.`);
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
      const saved = await api.saveAiAgentSettings({
        clearApiKey: true,
        model: selectedModelId(),
        provider: form.provider
      });
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
          <p>Escolha o modelo OpenAI atual (Sol, Terra ou Luna) e a chave do agente de busca de imagens.</p>
        </div>
        <div className="hero-badge">
          <span>Agente de imagens</span>
          <strong>{agent?.hasApiKey ? 'Conectado' : 'Pendente'}</strong>
          <small>{agent?.model || 'Sem modelo'} · {agent?.source === 'settings' ? 'chave no painel' : agent?.source === 'env' ? 'chave no ambiente' : 'sem chave'}</small>
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
        <form onSubmit={save}>
          <label style={{ display: 'block', marginBottom: 14 }}>Provedor
            <select value={form.provider} onChange={event => setForm(current => ({ ...current, provider: event.target.value }))}>
              <option value="openai">OpenAI</option>
            </select>
          </label>

          <p className="eyebrow" style={{ marginBottom: 8 }}>Modelo GPT-5.6</p>
          <div className="palette-presets" style={{ marginBottom: 14 }}>
            {MODELS.map(item => {
              const active = !form.customModel.trim() && form.model === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={active ? 'selected' : ''}
                  onClick={() => setForm(current => ({ ...current, model: item.id, customModel: '' }))}
                  style={{ textAlign: 'left', minWidth: 180 }}
                >
                  <span><strong>{item.name}</strong><small style={{ display: 'block', opacity: 0.8 }}>{item.detail}</small><code style={{ fontSize: 11 }}>{item.id}</code></span>
                </button>
              );
            })}
          </div>

          <label style={{ display: 'block', marginBottom: 14 }}>
            Ou cole outro model id da OpenAI
            <input
              value={form.customModel}
              onChange={event => setForm(current => ({ ...current, customModel: event.target.value }))}
              placeholder="ex.: gpt-5.6-sol"
              autoComplete="off"
            />
            <small style={{ display: 'block', marginTop: 6, opacity: 0.75 }}>
              Modelo ativo: <code>{selectedModelId()}</code>{selectedIsCustom ? ' (personalizado)' : ''}
            </small>
          </label>

          <label style={{ display: 'block', marginBottom: 14 }}>Chave API
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
          <span>1) Banco de imagens coleta tudo da fonte. 2) EAN global casa sozinho. 3) EAN local usa este modelo com barra de progresso.</span>
        </div>
      </section>
    </div>
  );
}
