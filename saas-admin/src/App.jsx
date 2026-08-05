import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BadgeDollarSign,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  Cable,
  CreditCard,
  Database,
  Download,
  HardDrive,
  Images,
  LayoutGrid,
  LogOut,
  Menu,
  Palette,
  Play,
  Plus,
  RefreshCw,
  ServerCog,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  UsersRound,
  WalletCards,
  X
} from 'lucide-react';
import { api } from './api.js';
import StoreDetail from './StoreDetail.jsx';
import SettingsPage from './SettingsPage.jsx';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const STATUS = {
  TRIAL: ['Em teste', 'trial'],
  ACTIVE: ['Ativo', 'active'],
  OVERDUE: ['Em atraso', 'overdue'],
  BLOCKED: ['Bloqueado', 'blocked'],
  CANCELLED: ['Cancelado', 'cancelled']
};

const BRAND_PALETTES = [
  { name: 'Mercado fresco', primary: '#092D22', accent: '#12C98A', background: '#F2F5EF' },
  { name: 'Azul confiavel', primary: '#12304A', accent: '#39A9DB', background: '#F3F7FA' },
  { name: 'Vermelho oferta', primary: '#4A1717', accent: '#F04B3E', background: '#FFF6F2' },
  { name: 'Amarelo popular', primary: '#28321A', accent: '#F2C94C', background: '#FAF8EE' }
];

function Status({ value }) {
  const [label, tone] = STATUS[value] || [value, 'cancelled'];
  return <span className={`status ${tone}`}><i />{label}</span>;
}

function Login({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api.login(email, password);
      if (data.user.role !== 'PLATFORM_ADMIN') throw new Error('Este acesso e exclusivo do administrador da plataforma');
      api.setToken(data.token);
      onSuccess(data);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }
  return <main className="admin-login"><section className="login-copy"><div className="logo"><span>Ai</span>Merc <b>Control</b></div><div><p className="eyebrow">Comando da plataforma</p><h1>O negocio inteiro, sem pontos cegos.</h1><p>Clientes, receita recorrente e operacao SaaS em uma unica cabine de controle.</p></div><div className="trust"><ShieldCheck /><span>Ambiente administrativo isolado</span></div></section><section className="login-form"><form onSubmit={submit}><p className="eyebrow">Acesso master</p><h2>Entrar no Control</h2><p>Use sua conta administrativa da plataforma.</p><label>E-mail<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" required /></label><label>Senha<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <div className="error">{error}</div>}<button className="accent" disabled={loading}>{loading ? 'Validando...' : <>Acessar painel <ArrowRight size={18} /></>}</button><small>Use as credenciais master configuradas com seguranca.</small></form></section></main>;
}

const nav = [
  ['overview', 'Visao geral', LayoutGrid],
  ['stores', 'Supermercados', Building2],
  ['integrations', 'Integracoes ERP', Cable],
  ['catalog', 'Banco de imagens', Images],
  ['billing', 'Assinaturas', WalletCards],
  ['settings', 'Configuracoes', ServerCog]
];

function Sidebar({ active, setActive, user, logout, open, close }) {
  return <aside className={`sidebar ${open ? 'open' : ''}`}><div className="side-head"><div className="logo"><span>Ai</span>Merc <b>Control</b></div><button className="icon close" onClick={close}><X size={20} /></button></div><nav><p>Administracao</p>{nav.map(([id,label,Icon]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => { setActive(id); close(); }}><Icon size={19} />{label}</button>)}</nav><div className="support-card"><ShieldCheck size={21} /><strong>Ambiente protegido</strong><span>Acesso exclusivo da equipe AiMerc.</span></div><div className="side-user"><div className="admin-avatar">SW</div><div><strong>{user?.name}</strong><span>Administrador</span></div><button onClick={logout} title="Sair"><LogOut size={17} /></button></div></aside>;
}

function Topbar({ title, openMenu, refresh, refreshing, onNew }) {
  return <header className="topbar"><button className="icon menu" onClick={openMenu}><Menu size={21} /></button><div><p className="eyebrow">AiMerc SaaS</p><h1>{title}</h1></div><div className="top-actions"><button className="icon"><Bell size={18} /></button><button className="refresh" onClick={refresh}><RefreshCw className={refreshing ? 'spin' : ''} size={17} /> <span>Atualizar</span></button>{onNew && <button className="accent small" onClick={onNew}><Plus size={17} /> <span>Novo supermercado</span></button>}</div></header>;
}

function Metric({ label, value, detail, icon: Icon, tone }) {
  return <article className="metric"><div className={`metric-icon ${tone}`}><Icon size={20} /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function StoresTable({ stores, query, setQuery, onStatus, onEditBrand, onDelete, onOpen }) {
  const visible = stores.filter(store => `${store.name} ${store.owner} ${store.city} ${store.plan}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">Base de clientes</p><h2>Supermercados</h2><small>Clique no supermercado para abrir cadastro, catalogo, promocoes e assimilacao de fotos.</small></div><label className="search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar cliente" /></label></div><div className="table-scroll"><table><thead><tr><th>Supermercado</th><th>Plano</th><th>Mensalidade</th><th>Status</th><th>Cidade</th><th>Gerenciar</th></tr></thead><tbody>{visible.map(store => <tr key={store.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(store)}><td><div className="store-cell"><div style={{background:store.brandColors?.primary,color:store.brandColors?.accent}}>{store.name.slice(0,2).toUpperCase()}</div><span><strong>{store.name}</strong><small>{store.owner}</small><span className="store-colors"><i style={{background:store.brandColors?.primary}}/><i style={{background:store.brandColors?.accent}}/><i style={{background:store.brandColors?.background}}/></span></span></div></td><td><b className="plan">{store.plan}</b></td><td><strong>{money(store.monthlyPrice)}</strong></td><td><Status value={store.status} /></td><td>{store.city} / {store.state}</td><td onClick={event => event.stopPropagation()}><div className="manage-actions"><label className="select-wrap"><select value={store.status} onChange={event => onStatus(store.id, event.target.value)}>{Object.keys(STATUS).map(value => <option key={value} value={value}>{STATUS[value][0]}</option>)}</select><ChevronDown size={14} /></label><button className="brand-edit" onClick={() => onOpen(store)}><Store size={14}/> Abrir</button><button className="brand-edit" onClick={() => onEditBrand(store)}><Palette size={14}/> Editar cores</button><button className="store-delete" title={`Excluir ${store.name}`} onClick={() => onDelete(store)}><Trash2 size={14}/><span>Excluir</span></button></div></td></tr>)}</tbody></table></div>{!visible.length && <div className="empty">Nenhum supermercado encontrado.</div>}</section>;
}

function DeleteStoreModal({ store, close, onDelete }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setDeleting(true);
    setError('');
    try {
      await onDelete(store.id, password);
      close();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeleting(false);
    }
  }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && !deleting && close()}><form className="modal delete-store-modal" onSubmit={submit}><div className="delete-warning"><Trash2 size={24}/></div><div className="modal-head"><div><p className="eyebrow danger-text">Exclusao permanente</p><h2>Excluir {store.name}?</h2></div><button type="button" className="icon" disabled={deleting} onClick={close}><X size={20}/></button></div><p className="delete-explanation">Pedidos, produtos, clientes, usuarios, cobrancas, banners, campanhas e integracoes exclusivos deste supermercado serao apagados. Esta acao nao pode ser desfeita.</p><label className="delete-password">Confirme com a mesma senha do seu login administrativo<input type="password" autoFocus autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Senha do administrador" required /></label>{error && <div className="error">{error}</div>}<div className="modal-actions"><button type="button" className="ghost" disabled={deleting} onClick={close}>Cancelar</button><button className="danger-button" disabled={deleting || !password}>{deleting ? 'Excluindo...' : 'Excluir permanentemente'}</button></div></form></div>;
}

function BrandingModal({ store, close, onSave }) {
  const [colors, setColors] = useState(store.brandColors || { primary: '#092D22', accent: '#12C98A', background: '#F2F5EF' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  function setColor(name, value) { setColors(current => ({ ...current, [name]: value.toUpperCase() })); }
  async function submit(event) { event.preventDefault(); setSaving(true); setError(''); try { await onSave(store.id, colors); close(); } catch (requestError) { setError(requestError.message); } finally { setSaving(false); } }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && close()}><form className="modal branding-modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">Identidade do cliente</p><h2>Editar cores de {store.name}</h2></div><button type="button" className="icon" onClick={close}><X size={20}/></button></div><section className="brand-builder"><div className="brand-builder-head"><div><Palette size={18}/><span><strong>Paleta do painel</strong><small>As alteracoes aparecem no proximo carregamento do painel do supermercado.</small></span></div><div className="mini-preview" style={{background:colors.primary,color:colors.accent}}><b>{store.name.slice(0,2).toUpperCase()}</b><span style={{background:colors.accent}}/></div></div><div className="palette-presets">{BRAND_PALETTES.map(palette => <button type="button" key={palette.name} className={palette.primary === colors.primary && palette.accent === colors.accent ? 'selected' : ''} onClick={() => setColors({primary:palette.primary,accent:palette.accent,background:palette.background})}><i style={{background:palette.primary}}/><i style={{background:palette.accent}}/><i style={{background:palette.background}}/><span>{palette.name}</span></button>)}</div><div className="color-fields"><label>Cor principal<div><input type="color" value={colors.primary} onChange={event => setColor('primary',event.target.value)}/><code>{colors.primary}</code></div></label><label>Cor de destaque<div><input type="color" value={colors.accent} onChange={event => setColor('accent',event.target.value)}/><code>{colors.accent}</code></div></label><label>Cor de fundo<div><input type="color" value={colors.background} onChange={event => setColor('background',event.target.value)}/><code>{colors.background}</code></div></label></div></section>{error && <div className="error">{error}</div>}<div className="modal-actions"><button type="button" className="ghost" onClick={close}>Cancelar</button><button className="accent" disabled={saving}>{saving ? 'Salvando...' : 'Aplicar identidade'}</button></div></form></div>;
}

function Billing({ subscriptions }) {
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">Cobranca recorrente</p><h2>Assinaturas</h2></div><span className="asaas-ready"><Check size={15} /> Estrutura pronta para Asaas</span></div><div className="table-scroll"><table><thead><tr><th>Cliente</th><th>Plano</th><th>Status</th><th>Proxima cobranca</th><th>Metodo</th><th>Valor</th></tr></thead><tbody>{subscriptions.map(item => <tr key={item.id}><td><strong>{item.storeName}</strong></td><td><b className="plan">{item.plan}</b></td><td><Status value={item.status} /></td><td>{new Date(`${item.nextDueDate}T12:00:00`).toLocaleDateString('pt-BR')}</td><td>{item.billingMethod}</td><td><strong>{money(item.amount)}</strong></td></tr>)}</tbody></table></div></section>;
}

function Overview({ overview, stores, subscriptions, goStores, goBilling }) {
  return <><section className="hero"><div><p className="eyebrow">Receita previsivel, clientes saudaveis</p><h2>Seu SaaS esta ganhando forma.</h2><p>Acompanhe crescimento, testes e cobrancas sem misturar com a operacao dos supermercados.</p></div><div className="hero-badge"><span>MRR atual</span><strong>{money(overview?.mrr)}</strong><small>{overview?.active || 0} contas ativas ou em teste</small></div></section><section className="metrics"><Metric label="Supermercados" value={overview?.stores || 0} detail={`${overview?.trials || 0} em periodo de teste`} icon={Building2} tone="lime" /><Metric label="Receita recorrente" value={money(overview?.mrr)} detail="previsao mensal" icon={BadgeDollarSign} tone="cyan" /><Metric label="Contas ativas" value={overview?.active || 0} detail="operando normalmente" icon={UsersRound} tone="blue" /><Metric label="Pendencias" value={(overview?.overdue || 0) + (overview?.blocked || 0)} detail="atrasadas ou bloqueadas" icon={CircleAlert} tone="orange" /></section><section className="overview-grid"><div className="panel quick-list"><div className="panel-head"><div><p className="eyebrow">Clientes recentes</p><h2>Ultimos supermercados</h2></div><button className="link" onClick={goStores}>Ver todos <ArrowRight size={15} /></button></div>{stores.slice(0,4).map(store => <div className="quick-row" key={store.id}><div className="store-cell"><div>{store.name.slice(0,2).toUpperCase()}</div><span><strong>{store.name}</strong><small>{store.city} / {store.state}</small></span></div><Status value={store.status} /><strong>{money(store.monthlyPrice)}</strong></div>)}</div><div className="panel finance-card"><div className="panel-head"><div><p className="eyebrow">Carteira</p><h2>Proximas cobrancas</h2></div><button className="link" onClick={goBilling}>Abrir <ArrowRight size={15} /></button></div><div className="finance-number"><span>Total contratado</span><strong>{money(subscriptions.reduce((sum,item) => sum + item.amount, 0))}</strong></div><div className="finance-track"><i style={{width:`${overview?.stores ? (overview.active / overview.stores) * 100 : 0}%`}} /></div><small>{overview?.active || 0} de {overview?.stores || 0} contas gerando receita</small></div></section></>;
}

const SCAN_SOURCES = [
  ['CARREFOUR_ALL', 'Carrefour completo'],
  ['PAO_DE_ACUCAR_ALL', 'Pao de Acucar completo'],
  ['SAO_LUIZ_ALL', 'Mercadinho Sao Luiz completo'],
  ['PINHEIRO_ALL', 'Pinheiro completo em lotes'],
  ['ATACADAO_ALL', 'Atacadao completo em lotes'],
  ['GBARBOSA_ALL', 'GBarbosa completo em lotes'],
  ['COMPER_ALL', 'Comper completo em lotes'],
  ['PREZUNIC_ALL', 'Prezunic completo em lotes'],
  ['BRETAS_ALL', 'Bretas completo em lotes'],
  ['SAVEGNAGO_ALL', 'Savegnago completo em lotes'],
  ['GUARA_ALL', 'Supermercado Guara completo'],
  ['SUPER_DO_POVO_ALL', 'Super do Povo completo'],
  ['CARREFOUR_SEARCH', 'Carrefour por termo'],
  ['CUSTOM_URL', 'URL personalizada']
];

const SCAN_LIMITS = {
  ATACADAO_ALL: 100_000,
  GBARBOSA_ALL: 100_000,
  COMPER_ALL: 100_000,
  PREZUNIC_ALL: 100_000,
  BRETAS_ALL: 100_000,
  SAVEGNAGO_ALL: 100_000,
  PINHEIRO_ALL: 100_000,
  CARREFOUR_ALL: 100_000,
  PAO_DE_ACUCAR_ALL: 100_000,
  SAO_LUIZ_ALL: 100_000,
  GUARA_ALL: 100_000,
  SUPER_DO_POVO_ALL: 100_000,
  DEFAULT: 5_000
};

const BULK_SCAN_SOURCES = [
  'ATACADAO_ALL',
  'GBARBOSA_ALL',
  'COMPER_ALL',
  'PREZUNIC_ALL',
  'BRETAS_ALL',
  'SAVEGNAGO_ALL',
  'PINHEIRO_ALL',
  'CARREFOUR_ALL',
  'PAO_DE_ACUCAR_ALL',
  'SAO_LUIZ_ALL',
  'GUARA_ALL',
  'SUPER_DO_POVO_ALL'
];

function bytes(value) {
  const amount = Number(value || 0);
  if (amount < 1024 * 1024) return `${(amount / 1024).toFixed(1)} KB`;
  if (amount < 1024 * 1024 * 1024) return `${(amount / 1024 / 1024).toFixed(1)} MB`;
  return `${(amount / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function elapsed(start, finish) {
  if (!start) return 'Nao iniciado';
  const startTime = new Date(start).getTime();
  const endTime = finish ? new Date(finish).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function CatalogLibrary() {
  const [library, setLibrary] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ sourceType: 'CARREFOUR_ALL', value: '', limit: 100000, concurrency: 8 });
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [auditJob, setAuditJob] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [purging, setPurging] = useState(false);
  const [auditLimit, setAuditLimit] = useState(5000);
  const [, tick] = useState(0);
  const running = ['STARTING', 'RUNNING', 'IMPORTING', 'CANCELLING'].includes(library?.job?.status);
  const auditRunning = ['STARTING', 'RUNNING'].includes(auditJob?.status);

  const load = useCallback(async (term = search) => {
    try { setLibrary(await api.catalogLibrary(term)); setError(''); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    load('');
    const polling = setInterval(() => load(search), 2_500);
    const clock = setInterval(() => tick(value => value + 1), 1_000);
    return () => { clearInterval(polling); clearInterval(clock); };
  }, [load, search]);

  useEffect(() => {
    if (!auditJob?.id || !auditRunning) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = await api.catalogAuditJob(auditJob.id);
        setAuditJob(next);
        if (next.status === 'COMPLETED' || next.status === 'FAILED') {
          setAuditing(false);
          load(search);
        }
      } catch (_) {}
    }, 1500);
    return () => clearInterval(timer);
  }, [auditJob?.id, auditRunning, load, search]);

  async function start(event) {
    event.preventDefault();
    setStarting(true);
    setError('');
    try { await api.startCatalogScan(form); await load(search); }
    catch (requestError) { setError(requestError.message); }
    finally { setStarting(false); }
  }

  async function cancel() {
    if (!window.confirm('Deseja realmente cancelar a varredura em andamento?')) return;
    setCancelling(true);
    setError('');
    try { await api.cancelCatalogScan(); await load(search); }
    catch (requestError) { setError(requestError.message); }
    finally { setCancelling(false); }
  }

  async function remove(ean) {
    if (!window.confirm(`Excluir o EAN ${ean} da biblioteca central?`)) return;
    try { await api.deleteCatalogAsset(ean); await load(search); }
    catch (requestError) { setError(requestError.message); }
  }

  async function startAudit({ withAi = true } = {}) {
    setAuditing(true);
    setError('');
    try {
      const started = await api.startCatalogAudit({
        limit: Number(auditLimit) || 5000,
        useAi: withAi,
        deleteMismatches: false
      });
      setAuditJob(started);
    } catch (requestError) {
      setAuditing(false);
      setError(requestError.message);
    }
  }

  async function purgeFlagged() {
    const eans = (auditJob?.mismatches || auditJob?.samples || []).map(item => item.ean).filter(Boolean);
    if (!eans.length) return;
    if (!window.confirm(`Remover ${eans.length} EAN(s) com foto inconsistente do banco de imagens?`)) return;
    setPurging(true);
    setError('');
    try {
      const result = await api.purgeCatalogMismatches(eans);
      setAuditJob(current => current ? {
        ...current,
        deleted: result.deleted,
        message: `Removidos ${result.deleted} erros do banco`,
        mismatches: [],
        samples: []
      } : current);
      await load(search);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPurging(false);
    }
  }

  const job = library?.job;
  const completed = job?.status === 'COMPLETED';
  const cancelled = job?.status === 'CANCELLED' || job?.phase === 'cancelled';
  const failed = job?.status === 'FAILED';
  const percentage = completed
    ? 100
    : (job?.total > 0 ? Math.min(100, Math.round((Number(job.current || 0) / Number(job.total)) * 100)) : 0);
  const displayProcessed = Number(job?.current || 0);
  const displaySaved = Number(job?.saved || 0);
  const displayImported = Number(job?.imported || 0);
  const phaseLabel = cancelled
    ? 'cancelado'
    : failed
      ? 'falhou'
      : (job?.phase || job?.status || '—');
  const totalLabel = 'no coletor';
  const needsValue = ['CARREFOUR_SEARCH', 'CUSTOM_URL'].includes(form.sourceType);
  const maxLimit = SCAN_LIMITS[form.sourceType] || SCAN_LIMITS.DEFAULT;
  const flaggedItems = auditJob?.mismatches?.length ? auditJob.mismatches : (auditJob?.samples || []);
  function chooseSource(sourceType) {
    setForm(current => ({
      ...current,
      sourceType,
      limit: BULK_SCAN_SOURCES.includes(sourceType) ? 100000 : Math.min(Number(current.limit) || 120, SCAN_LIMITS.DEFAULT),
      concurrency: BULK_SCAN_SOURCES.includes(sourceType) ? Math.min(Math.max(Number(current.concurrency) || 8, 1), 30) : current.concurrency
    }));
  }
  return <div className="catalog-page">
    <section className="catalog-hero">
      <div><p className="eyebrow">Patrimonio de catalogo</p><h2>Imagens certas, produtos reconhecidos.</h2><p>A biblioteca central guarda somente produtos com EAN valido (8 a 14 digitos), descricao e foto real coletadas das fontes. Codigos VIRTUAL e PLU nao entram nesta vitrine.</p></div>
      <div className={`collector-pill ${library?.collector?.online ? 'online' : 'offline'}`}><i />{library?.collector?.online ? 'Coletor conectado' : 'Coletor desligado'}</div>
    </section>
    <section className="catalog-metrics">
      <Metric label="EANs catalogados" value={library?.totalAssets || 0} detail="somente EAN 8-14 digitos no PostgreSQL" icon={Database} tone="lime" />
      <Metric label="Armazenamento" value={bytes(library?.totalBytes)} detail="imagens reais no PostgreSQL" icon={HardDrive} tone="cyan" />
      <Metric label="Importados no ciclo" value={displayImported} detail={job ? `${job.status}${displaySaved ? ` · ${displaySaved} salvos no coletor` : ''}` : 'nenhuma execucao'} icon={Images} tone="blue" />
      <Metric label="Tempo da varredura" value={elapsed(job?.startedAt, job?.finishedAt)} detail={running ? 'em andamento agora' : 'duracao do ultimo ciclo'} icon={RefreshCw} tone="orange" />
    </section>
    {error && <div className="global-error catalog-error">{error}<button onClick={() => setError('')}><X size={17} /></button></div>}
    <section className="catalog-control-grid">
      <form className="panel scan-form" onSubmit={start}>
        <div className="panel-head"><div><p className="eyebrow">Nova coleta</p><h2>Configurar varredura</h2></div><span className="scan-lock"><ShieldCheck size={15}/> Somente administrador</span></div>
        <label>Fonte de produtos<select value={form.sourceType} onChange={event => chooseSource(event.target.value)}>{SCAN_SOURCES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {needsValue && <label>{form.sourceType === 'CUSTOM_URL' ? 'URL HTTPS do supermercado' : 'Termo para pesquisar'}<input value={form.value} onChange={event => setForm(current => ({ ...current, value: event.target.value }))} placeholder={form.sourceType === 'CUSTOM_URL' ? 'https://loja.exemplo.com/produtos' : 'Ex.: cafe, arroz, limpeza'} required /></label>}
        <div className="scan-fields"><label>Quantidade maxima<input type="number" min="1" max={maxLimit} value={form.limit} onChange={event => setForm(current => ({ ...current, limit: event.target.value }))}/></label><label>Processos simultaneos<input type="number" min="1" max="30" value={form.concurrency} onChange={event => setForm(current => ({ ...current, concurrency: event.target.value }))}/></label></div>
        <div className="scan-note"><CircleAlert size={17}/><span>A varredura grava no banco central apenas itens com EAN numerico, descricao e foto real. Depois, no supermercado cliente, EAN global casa automatico e EAN local usa o agente de IA.</span></div>
        {running ? (
          <button type="button" className="danger-button scan-start" onClick={cancel} disabled={cancelling || job?.status === 'CANCELLING'}>
            <X size={18}/> {cancelling || job?.status === 'CANCELLING' ? 'Cancelando e importando...' : 'Cancelar varredura'}
          </button>
        ) : (
          <button className="accent scan-start" disabled={starting || !library?.collector?.online}>
            <Play size={18}/> {starting ? 'Iniciando...' : 'Iniciar varredura'}
          </button>
        )}
      </form>
      <section className="panel scan-progress">
        <div className="panel-head"><div><p className="eyebrow">Execucao atual</p><h2>{job ? (running ? 'Coleta em andamento' : 'Ultima varredura') : 'Aguardando primeira coleta'}</h2></div>{job && <span className={`job-status ${String(job.status).toLowerCase()}`}>{job.status}</span>}</div>
        {job ? <><div className="progress-orbit"><div className="progress-number"><strong>{percentage}%</strong><span>{phaseLabel}</span></div></div><div className="progress-track"><i style={{width:`${percentage}%`}}/></div><div className="progress-stats"><span><b>{displayProcessed}</b> processados</span><span><b>{Number(job.total || 0)}</b> {totalLabel}</span><span><b>{displaySaved}</b> salvos coletor</span><span><b>{displayImported}</b> no Postgres</span></div><div className="event-list">{(job.events || []).slice(-3).reverse().map((event,index) => <div key={`${event.at}-${index}`}><i/><span>{event.message}<small>{new Date(event.at).toLocaleTimeString('pt-BR')}</small></span></div>)}</div>{job.error && <div className="error">{job.error}</div>}</> : <div className="scan-empty"><Images size={32}/><strong>Nenhuma varredura registrada</strong><span>Escolha uma fonte e inicie a construcao da biblioteca.</span></div>}
      </section>
    </section>

    <section className="panel audit-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Qualidade do banco</p>
          <h2>Auditar inconsistencias</h2>
          <p className="catalog-library-hint">Acha foto errada (Monster com Baly, vagem com OMO, carne com arroz) por checksum duplicado, heuristica e IA.</p>
        </div>
        <div className="audit-actions">
          <label className="audit-limit">Limite IA<input type="number" min="0" max="50000" value={auditLimit} onChange={event => setAuditLimit(event.target.value)} disabled={auditRunning || auditing} /></label>
          <button type="button" className="ghost" disabled={auditRunning || auditing} onClick={() => startAudit({ withAi: false })}>
            <ShieldAlert size={16} /> So heuristicas
          </button>
          <button type="button" className="accent" disabled={auditRunning || auditing} onClick={() => startAudit({ withAi: true })}>
            <Sparkles size={16} /> {auditRunning || auditing ? 'Auditando...' : 'Auditar com IA'}
          </button>
          {flaggedItems.length > 0 && !auditRunning && (
            <button type="button" className="danger-button" disabled={purging} onClick={purgeFlagged}>
              <Trash2 size={16} /> {purging ? 'Removendo...' : `Remover ${flaggedItems.length} erros`}
            </button>
          )}
        </div>
      </div>
      {auditJob && (
        <div className="audit-summary">
          <div className="progress-track"><i style={{ width: `${Number(auditJob.percent || 0)}%` }} /></div>
          <div className="progress-stats">
            <span><b>{auditJob.flagged || 0}</b> erros</span>
            <span><b>{auditJob.aiChecked || 0}</b> checados IA</span>
            <span><b>{auditJob.aiMismatches || 0}</b> IA mismatch</span>
            <span><b>{auditJob.duplicateGroups || 0}</b> checksums</span>
            <span><b>{auditJob.deleted || 0}</b> removidos</span>
          </div>
          <p className="audit-message">{auditJob.message || auditJob.status}{auditJob.phase ? ` · ${auditJob.phase}` : ''}</p>
          {auditJob.error && <div className="error">{auditJob.error}</div>}
        </div>
      )}
      {flaggedItems.length > 0 && (
        <div className="mismatch-grid">
          {flaggedItems.slice(0, 60).map(item => (
            <article className="mismatch-card" key={`${item.ean}-${item.type}`}>
              <div className="mismatch-thumb" style={item.image ? { backgroundImage: `url(${item.image})` } : undefined} />
              <div>
                <code>{item.ean}</code>
                <strong>{item.description || 'Sem descricao'}</strong>
                <span className="mismatch-type">{item.type}{item.confidence != null ? ` · ${Math.round(Number(item.confidence) * 100)}%` : ''}</span>
                <small>{item.reason}</small>
                {item.seenProduct ? <small>IA viu: {item.seenProduct}</small> : null}
                <button type="button" className="link" onClick={() => remove(item.ean)}>Excluir este EAN</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>

    <section className="panel asset-library">
      <div className="panel-head"><div><p className="eyebrow">Biblioteca central</p><h2>Imagens por EAN</h2><p className="catalog-library-hint">{library?.assets?.total || 0} produtos com codigo EAN, descricao e foto</p></div><form className="search" onSubmit={event => { event.preventDefault(); load(search); }}><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar EAN, descricao ou origem"/></form></div>
      {loading ? <div className="asset-loading"><RefreshCw className="spin"/> Carregando biblioteca...</div> : library?.assets?.items?.length ? <div className="asset-grid">{library.assets.items.map(item => <article className="asset-card" key={item.ean}><div className="asset-image"><img src={item.image} alt={item.description || `Produto ${item.ean}`}/><button onClick={() => remove(item.ean)} title="Excluir"><Trash2 size={15}/></button></div><div className="asset-body"><code>{item.ean}</code><h3>{item.description || 'Descricao ainda nao identificada'}</h3><span>{item.sourceName || 'Fonte nao informada'}</span><small>{bytes(item.byteSize)} · {new Date(item.updatedAt).toLocaleDateString('pt-BR')}</small></div></article>)}</div> : <div className="scan-empty"><Database size={34}/><strong>Nenhum EAN encontrado</strong><span>So aparecem produtos com EAN numerico (8 a 14 digitos), descricao e foto real. VIRTUAL_ e PLU_ ficam fora desta lista.</span></div>}
    </section>
  </div>;
}

function IntegrationModal({ item, providers, close, saved }) {
  const current = item.integration || {};
  const storeId = item.store.id;
  const [form, setForm] = useState({
    providerCode: current.providerCode || 'SYSPDV', connectionMode: current.connectionMode || 'LOCAL_AGENT',
    endpointUrl: current.endpointUrl || '', authType: current.authType || 'NONE', authHeader: current.authHeader || 'X-API-Key',
    secret: '', syncIntervalSeconds: current.syncIntervalSeconds || 300, enabled: current.enabled !== false,
    fieldMapping: current.fieldMapping || {}
  });
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const provider = providers.find(value => value.code === form.providerCode) || providers[0];
  function field(name, value) { setForm(valueNow => ({ ...valueNow, [name]: value })); }
  function mappingField(name, value) {
    setForm(valueNow => ({ ...valueNow, fieldMapping: { ...valueNow.fieldMapping, [name]: value } }));
  }
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (!storeId) throw new Error('Identificador do supermercado nao foi carregado. Atualize a pagina.');
      await api.saveIntegration(storeId, form); await saved();
    }
    catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  }
  async function generateAgent() {
    setSaving(true); setError('');
    try {
      if (!storeId) throw new Error('Identificador do supermercado nao foi carregado. Atualize a pagina.');
      await api.saveIntegration(storeId, form);
      const result = await api.createIntegrationAgent(storeId, { name: `Agente ${item.store.name}` });
      setToken(result.token); await saved();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && close()}><form className="modal integration-modal" onSubmit={submit}>
    <div className="modal-head"><div><p className="eyebrow">Conector da loja</p><h2>{item.store.name}</h2></div><button type="button" className="icon" onClick={close}><X size={20}/></button></div>
    <div className="integration-provider-note"><ServerCog size={21}/><div><strong>{provider?.name}</strong><span>{provider?.description}</span>{provider?.documentationStatus === 'AWAITING_VENDOR_DOCS' && <small>Exige o manual ou Swagger da versao instalada para homologacao final.</small>}</div></div>
    <div className="form-grid">
      <label>Sistema do supermercado<select value={form.providerCode} onChange={event => { const code = event.target.value; const next = providers.find(value => value.code === code); setForm(value => ({ ...value, providerCode: code, connectionMode: next?.modes?.[0] || 'LOCAL_AGENT', fieldMapping: code === value.providerCode ? value.fieldMapping : {} })); }}>{providers.map(value => <option value={value.code} key={value.code}>{value.name}</option>)}</select></label>
      <label>Modo de conexao<select value={form.connectionMode} onChange={event => field('connectionMode',event.target.value)}>{(provider?.modes || []).map(value => <option key={value} value={value}>{value === 'LOCAL_AGENT' ? 'Agente local (recomendado)' : value === 'CLOUD_API' ? 'API em nuvem' : 'Layout de arquivos'}</option>)}</select></label>
      {form.connectionMode !== 'LOCAL_AGENT' && <label className="wide">URL da API<input value={form.endpointUrl} onChange={event => field('endpointUrl',event.target.value)} placeholder="https://api.erp.com/produtos"/></label>}
      <label>Autenticacao<select value={form.authType} onChange={event => field('authType',event.target.value)}><option value="NONE">Sem autenticacao</option><option value="BEARER">Bearer token</option><option value="API_KEY">API Key</option></select></label>
      <label>Intervalo de sincronizacao<select value={form.syncIntervalSeconds} onChange={event => field('syncIntervalSeconds',Number(event.target.value))}><option value="60">1 minuto</option><option value="300">5 minutos</option><option value="900">15 minutos</option><option value="3600">1 hora</option></select></label>
      {form.authType === 'API_KEY' && <label>Nome do cabecalho<input value={form.authHeader} onChange={event => field('authHeader',event.target.value)}/></label>}
      {form.authType !== 'NONE' && <label>Credencial {current.hasSecret && '(deixe vazio para manter)'}<input type="password" value={form.secret} onChange={event => field('secret',event.target.value)} autoComplete="new-password"/></label>}
      <label className="wide integration-toggle"><input type="checkbox" checked={form.enabled} onChange={event => field('enabled',event.target.checked)}/> Integracao habilitada</label>
      <details className="wide integration-mapping">
        <summary>Mapeamento avancado do JSON <small>opcional</small></summary>
        <p>Deixe em branco para usar o modelo de {provider?.name}. Use caminhos como <code>resultado.produtos</code>. Para mais de um campo promocional, separe por virgula.</p>
        <button type="button" className="mapping-reset" onClick={() => field('fieldMapping', {})}>Restaurar campos padrao</button>
        <div className="mapping-grid">
          {[
            ['itemsPath','Caminho da lista'],['sku','SKU'],['ean','EAN / GTIN'],['primaryEan','Indicador de EAN principal'],
            ['name','Nome'],['category','Categoria'],['price','Preco vigente'],['regularPrice','Preco normal'],
            ['promoPrice','Preco promocional'],['stock','Estoque'],['unit','Unidade'],['active','Produto ativo']
          ].map(([name,label]) => <label key={name}>{label}<input value={form.fieldMapping[name] || ''} onChange={event => mappingField(name,event.target.value)} placeholder="Usar padrao do conector"/></label>)}
        </div>
      </details>
    </div>
    {token && <div className="agent-token"><strong>Token gerado, copie agora</strong><code>{token}</code><button type="button" className="ghost" onClick={() => navigator.clipboard.writeText(token)}>Copiar token</button><small>Por seguranca, ele nao sera mostrado novamente.</small></div>}
    {error && <div className="error">{error}</div>}
    <div className="modal-actions"><button type="button" className="ghost" onClick={close}>Fechar</button><button type="button" className="ghost" onClick={generateAgent} disabled={saving}>{item.agent ? 'Trocar token do agente' : 'Gerar token do agente'}</button><button className="accent" disabled={saving}>{saving ? 'Salvando...' : 'Salvar integracao'}</button></div>
  </form></div>;
}

function IntegrationsPage() {
  const [items, setItems] = useState([]);
  const [providers, setProviders] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const [providerList, integrations] = await Promise.all([api.integrationProviders(), api.integrations()]); setProviders(providerList); setItems(integrations); setError(''); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);
  const configured = items.filter(item => item.integration).length;
  const online = items.filter(item => item.agent?.status === 'ONLINE').length;
  async function downloadAgent() {
    try {
      const blob = await api.downloadIntegrationAgent();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'AiMerc-Agent-Setup.exe';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setError('');
    } catch (requestError) { setError(requestError.message); }
  }
  return <div className="integrations-page">
    <section className="integration-hero"><div><p className="eyebrow">Conectividade operacional</p><h2>Um contrato para cada ERP.</h2><p>SysPDV, Varejo Facil, Solidcon, Solicom e APIs personalizadas entregam o mesmo catalogo normalizado ao AiMerc.</p></div><div className="integration-flow"><span>ERP local</span><ArrowRight/><span>Agente AiMerc</span><ArrowRight/><span>PostgreSQL</span></div></section>
    <section className="metrics"><Metric label="Lojas cadastradas" value={items.length} detail="disponiveis para integrar" icon={Building2} tone="lime"/><Metric label="Integracoes configuradas" value={configured} detail="com provedor definido" icon={Cable} tone="cyan"/><Metric label="Agentes online" value={online} detail="conforme intervalo de sync da loja" icon={ServerCog} tone="blue"/><Metric label="Precisam de atencao" value={items.filter(item => item.integration && item.agent?.status !== 'ONLINE').length} detail="agente pendente ou offline" icon={CircleAlert} tone="orange"/></section>
    {error && <div className="global-error catalog-error">{error}<button onClick={() => setError('')}><X size={17}/></button></div>}
    <section className="panel integration-list"><div className="panel-head"><div><p className="eyebrow">Supermercados</p><h2>Conectores e agentes</h2></div><div className="integration-actions"><button className="refresh" onClick={downloadAgent}><Download size={16}/> Baixar agente Windows</button><button className="refresh" onClick={load}><RefreshCw size={16}/> Atualizar status</button></div></div>
      {loading ? <div className="asset-loading"><RefreshCw className="spin"/> Carregando integracoes...</div> : <div className="integration-cards">{items.map(item => <article key={item.store.id} className="integration-card"><div className="integration-card-top"><div className="store-cell"><div>{item.store.name.slice(0,2).toUpperCase()}</div><span><strong>{item.store.name}</strong><small>{item.store.slug}</small></span></div><span className={`agent-status ${String(item.agent?.status || 'NOT_CONFIGURED').toLowerCase()}`}><i/>{item.agent?.status || 'NAO CONFIGURADO'}</span></div><div className="integration-details"><span><small>Provedor</small><b>{item.integration?.providerName || 'A definir'}</b></span><span><small>Ultima conexao</small><b>{item.agent?.lastSeenAt ? new Date(item.agent.lastSeenAt).toLocaleString('pt-BR') : 'Nunca'}</b></span><span><small>Ultimo lote</small><b>{item.lastRun ? `${item.lastRun.received} produtos` : 'Nenhum'}</b></span></div><button className="integration-configure" onClick={() => setEditing(item)}><ServerCog size={17}/>{item.integration ? 'Editar integracao' : 'Configurar integracao'}<ArrowRight size={16}/></button></article>)}</div>}
    </section>
    {editing && <IntegrationModal item={editing} providers={providers} close={() => setEditing(null)} saved={async () => { await load(); }} />}
  </div>;
}

function CreateStore({ close, onCreate }) {
  const [form, setForm] = useState({ name: '', owner: '', email: '', phone: '', city: 'Caucaia', state: 'CE', plan: 'PROFESSIONAL', monthlyPrice: 497, minimumOrder: 30, deliveryFee: 6, billingMethod: 'PIX', password: 'Mudar@2026', brandColors: { primary: '#092D22', accent: '#12C98A', background: '#F2F5EF' } });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  function field(name, value) { setForm(current => ({ ...current, [name]: value })); }
  async function submit(event) { event.preventDefault(); setSaving(true); setError(''); try { await onCreate(form); close(); } catch (requestError) { setError(requestError.message); } finally { setSaving(false); } }
  function setPalette(palette) { field('brandColors', { primary: palette.primary, accent: palette.accent, background: palette.background }); }
  function setColor(name, value) { field('brandColors', { ...form.brandColors, [name]: value.toUpperCase() }); }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && close()}><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">Novo cliente</p><h2>Cadastrar supermercado</h2></div><button type="button" className="icon" onClick={close}><X size={20} /></button></div><div className="form-grid"><label className="wide">Nome do supermercado<input value={form.name} onChange={event => field('name',event.target.value)} required /></label><label>Responsavel<input value={form.owner} onChange={event => field('owner',event.target.value)} required /></label><label>E-mail de acesso<input type="email" value={form.email} onChange={event => field('email',event.target.value)} required /></label><label>Telefone<input value={form.phone} onChange={event => field('phone',event.target.value)} /></label><label>Senha inicial<input value={form.password} onChange={event => field('password',event.target.value)} required /></label><label>Cidade<input value={form.city} onChange={event => field('city',event.target.value)} required /></label><label>UF<input maxLength="2" value={form.state} onChange={event => field('state',event.target.value)} required /></label><label>Plano<select value={form.plan} onChange={event => field('plan',event.target.value)}><option value="STARTER">Starter</option><option value="PROFESSIONAL">Profissional</option><option value="PREMIUM">Premium</option></select></label><label>Mensalidade<input type="number" min="1" value={form.monthlyPrice} onChange={event => field('monthlyPrice',event.target.value)} required /></label><label>Pedido minimo<input type="number" min="1" value={form.minimumOrder} onChange={event => field('minimumOrder',event.target.value)} /></label><label>Taxa de entrega<input type="number" min="0" value={form.deliveryFee} onChange={event => field('deliveryFee',event.target.value)} /></label><section className="brand-builder wide"><div className="brand-builder-head"><div><Palette size={18} /><span><strong>Identidade visual</strong><small>Escolha no maximo as tres cores usadas no painel do cliente.</small></span></div><div className="mini-preview" style={{background:form.brandColors.primary,color:form.brandColors.accent}}><b>{form.name?.slice(0,2).toUpperCase() || 'SM'}</b><span style={{background:form.brandColors.accent}} /></div></div><div className="palette-presets">{BRAND_PALETTES.map(palette => <button type="button" key={palette.name} className={palette.primary === form.brandColors.primary && palette.accent === form.brandColors.accent ? 'selected' : ''} onClick={() => setPalette(palette)}><i style={{background:palette.primary}} /><i style={{background:palette.accent}} /><i style={{background:palette.background}} /><span>{palette.name}</span></button>)}</div><div className="color-fields"><label>Cor principal<div><input type="color" value={form.brandColors.primary} onChange={event => setColor('primary',event.target.value)} /><code>{form.brandColors.primary}</code></div></label><label>Cor de destaque<div><input type="color" value={form.brandColors.accent} onChange={event => setColor('accent',event.target.value)} /><code>{form.brandColors.accent}</code></div></label><label>Cor de fundo<div><input type="color" value={form.brandColors.background} onChange={event => setColor('background',event.target.value)} /><code>{form.brandColors.background}</code></div></label></div></section></div>{error && <div className="error">{error}</div>}<div className="modal-actions"><button type="button" className="ghost" onClick={close}>Cancelar</button><button className="accent" disabled={saving}>{saving ? 'Criando estrutura...' : 'Cadastrar supermercado'}</button></div></form></div>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [active, setActive] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [stores, setStores] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [deletingStore, setDeletingStore] = useState(null);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const load = useCallback(async () => { if (!api.token) return; setRefreshing(true); try { const [a,b,c] = await Promise.all([api.overview(), api.stores(), api.subscriptions()]); setOverview(a); setStores(b); setSubscriptions(c); setSession(current => current || { user: { name: 'Administrador' } }); setError(''); } catch (requestError) { if (requestError.status === 401) logout(); else setError(requestError.message); } finally { setRefreshing(false); } }, []);
  useEffect(() => { if (api.token) load(); }, [load]);
  function logout() { api.setToken(''); setSession(null); setSelectedStoreId(null); }
  async function create(data) { await api.createStore(data); await load(); }
  async function saveBranding(id, colors) { await api.updateBranding(id, colors); await load(); }
  async function removeStore(id, password) { await api.deleteStore(id, password); setSelectedStoreId(null); await load(); }
  async function changeStatus(id,status) { try { await api.updateStatus(id,status); await load(); } catch (requestError) { setError(requestError.message); } }
  if (!session) return <Login onSuccess={value => { setSession(value); load(); }} />;
  const titles = { overview: 'Visao geral', stores: selectedStoreId ? 'Gestao do supermercado' : 'Supermercados', integrations: 'Integracoes ERP', catalog: 'Banco de imagens', billing: 'Assinaturas', settings: 'Configuracoes' };
  return <div className="shell"><Sidebar active={active} setActive={id => { setActive(id); setSelectedStoreId(null); }} user={session.user} logout={logout} open={menuOpen} close={() => setMenuOpen(false)} />{menuOpen && <button className="overlay" onClick={() => setMenuOpen(false)} />}<main className="workspace"><Topbar title={titles[active]} openMenu={() => setMenuOpen(true)} refresh={active === 'catalog' || active === 'integrations' || active === 'settings' || selectedStoreId ? () => {} : load} refreshing={refreshing} onNew={active === 'stores' || active === 'overview' ? () => setCreating(true) : null} />{error && <div className="global-error">{error}<button onClick={() => setError('')}><X size={17} /></button></div>}<div className="content">{active === 'overview' && <Overview overview={overview} stores={stores} subscriptions={subscriptions} goStores={() => setActive('stores')} goBilling={() => setActive('billing')} />}{active === 'stores' && !selectedStoreId && <StoresTable stores={stores} query={query} setQuery={setQuery} onStatus={changeStatus} onEditBrand={setEditingBrand} onDelete={setDeletingStore} onOpen={store => setSelectedStoreId(store.id)} />}{active === 'stores' && selectedStoreId && <StoreDetail storeId={selectedStoreId} onBack={() => setSelectedStoreId(null)} onEditBrand={setEditingBrand} onDelete={setDeletingStore} />}{active === 'integrations' && <IntegrationsPage />}{active === 'catalog' && <CatalogLibrary />}{active === 'billing' && <Billing subscriptions={subscriptions} />}{active === 'settings' && <SettingsPage />}</div></main>{creating && <CreateStore close={() => setCreating(false)} onCreate={create} />}{editingBrand && <BrandingModal store={editingBrand} close={() => setEditingBrand(null)} onSave={saveBranding} />}{deletingStore && <DeleteStoreModal store={deletingStore} close={() => setDeletingStore(null)} onDelete={removeStore} />}</div>;
}
