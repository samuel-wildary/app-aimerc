import React, { useEffect, useState } from 'react';
import { Bot, Check, KeyRound, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from './api.js';

const MODELS = [
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    badge: 'Mais inteligente',
    detail: 'Melhor para nomes abreviados e casos dificeis de hortifruti/frigorifico.'
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    badge: 'Recomendado',
    detail: 'Equilibrio entre qualidade e custo para assimilacao em lote.'
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    badge: 'Economico',
    detail: 'Mais barato e rapido — bom para muitos produtos simples.'
  },
  {
    id: 'gpt-5.6',
    name: 'GPT-5.6',
    badge: 'Alias',
    detail: 'Alias oficial que aponta para o Sol.'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    badge: 'Anterior',
    detail: 'Geracao anterior da OpenAI.'
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    badge: 'Anterior',
    detail: 'Geracao anterior, mais barata.'
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

  const connected = Boolean(agent?.hasApiKey);

  return (
    <div className="settings-page">
      <section className="hero">
        <div>
          <p className="eyebrow">Plataforma</p>
          <h2>Configuracoes</h2>
          <p>Chave OpenAI e modelo do agente que analisa EAN local, abreviaturas do ERP e fotos limpas do banco.</p>
        </div>
        <div className="hero-badge">
          <span>Agente de imagens</span>
          <strong>{connected ? 'Conectado' : 'Pendente'}</strong>
          <small>
            {agent?.model || 'Sem modelo'} ·{' '}
            {agent?.source === 'settings' ? 'chave no painel' : agent?.source === 'env' ? 'chave no ambiente' : 'sem chave'}
          </small>
        </div>
      </section>

      <div className="settings-layout">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Integracao</p>
              <h2>Agente de busca</h2>
              <p>Usado so no EAN local. EAN global continua automatico, sem IA.</p>
            </div>
            <div className={`agent-pill ${connected ? 'on' : 'off'}`}>
              <Bot size={15} />
              {connected ? 'API pronta' : 'Sem chave'}
            </div>
          </div>

          {error && <div className="error">{error}</div>}
          {message && <div className="toast-ok"><Check size={16} /> {message}</div>}

          <form className="settings-form" onSubmit={save}>
            <label>
              Provedor
              <select value={form.provider} onChange={event => setForm(current => ({ ...current, provider: event.target.value }))}>
                <option value="openai">OpenAI</option>
              </select>
            </label>

            <div>
              <p className="eyebrow">Modelo</p>
              <div className="model-grid">
                {MODELS.map(item => {
                  const active = !form.customModel.trim() && form.model === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`model-card ${active ? 'selected' : ''}`}
                      onClick={() => setForm(current => ({ ...current, model: item.id, customModel: '' }))}
                    >
                      <span className="model-badge">{item.badge}</span>
                      <strong>{item.name}</strong>
                      <span>{item.detail}</span>
                      <code>{item.id}</code>
                    </button>
                  );
                })}
              </div>
            </div>

            <label>
              Ou cole outro model id
              <input
                value={form.customModel}
                onChange={event => setForm(current => ({ ...current, customModel: event.target.value }))}
                placeholder="ex.: gpt-5.6-sol"
                autoComplete="off"
              />
              <small>
                Modelo ativo: <code>{selectedModelId()}</code>{selectedIsCustom ? ' (personalizado)' : ''}
              </small>
            </label>

            <label>
              Chave API OpenAI
              <div className="key-field">
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
        </section>

        <aside className="settings-aside">
          <article className="settings-tip">
            <Sparkles size={18} />
            <strong>Como a IA trabalha</strong>
            <ol>
              <li>Banco de imagens coleta fotos das fontes.</li>
              <li>EAN global (GTIN) casa sozinho.</li>
              <li>EAN local: o modelo le abreviaturas, compara legendas e escolhe foto limpa.</li>
              <li>Relatorio mostra produto ↔ imagem vinculada.</li>
            </ol>
          </article>
          <article className="settings-tip muted">
            <ShieldCheck size={18} />
            <strong>Seguranca</strong>
            <span>A chave fica criptografada nas configuracoes da plataforma. Voce tambem pode usar AIMERC_OPENAI_API_KEY no ambiente do backend.</span>
          </article>
        </aside>
      </div>
    </div>
  );
}
