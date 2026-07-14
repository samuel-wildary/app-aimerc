import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BadgeDollarSign,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  Palette,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UsersRound,
  WalletCards,
  X
} from 'lucide-react';
import { api } from './api.js';

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
  const [email, setEmail] = useState('admin@aimerc.local');
  const [password, setPassword] = useState('Admin@2026');
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
  return <main className="admin-login"><section className="login-copy"><div className="logo"><span>Ai</span>Merc <b>Control</b></div><div><p className="eyebrow">Comando da plataforma</p><h1>O negocio inteiro, sem pontos cegos.</h1><p>Clientes, receita recorrente e operacao SaaS em uma unica cabine de controle.</p></div><div className="trust"><ShieldCheck /><span>Ambiente administrativo isolado</span></div></section><section className="login-form"><form onSubmit={submit}><p className="eyebrow">Acesso master</p><h2>Entrar no Control</h2><p>Use sua conta administrativa da plataforma.</p><label>E-mail<input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>Senha<input type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{error && <div className="error">{error}</div>}<button className="accent" disabled={loading}>{loading ? 'Validando...' : <>Acessar painel <ArrowRight size={18} /></>}</button><small>Credenciais locais preenchidas para demonstracao.</small></form></section></main>;
}

const nav = [
  ['overview', 'Visao geral', LayoutGrid],
  ['stores', 'Supermercados', Building2],
  ['billing', 'Assinaturas', WalletCards]
];

function Sidebar({ active, setActive, user, logout, open, close }) {
  return <aside className={`sidebar ${open ? 'open' : ''}`}><div className="side-head"><div className="logo"><span>Ai</span>Merc <b>Control</b></div><button className="icon close" onClick={close}><X size={20} /></button></div><nav><p>Administracao</p>{nav.map(([id,label,Icon]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => { setActive(id); close(); }}><Icon size={19} />{label}</button>)}</nav><div className="support-card"><ShieldCheck size={21} /><strong>Ambiente protegido</strong><span>Acesso exclusivo da equipe AiMerc.</span></div><div className="side-user"><div className="admin-avatar">SW</div><div><strong>{user?.name}</strong><span>Administrador</span></div><button onClick={logout} title="Sair"><LogOut size={17} /></button></div></aside>;
}

function Topbar({ title, openMenu, refresh, refreshing, onNew }) {
  return <header className="topbar"><button className="icon menu" onClick={openMenu}><Menu size={21} /></button><div><p className="eyebrow">AiMerc SaaS</p><h1>{title}</h1></div><div className="top-actions"><button className="icon"><Bell size={18} /></button><button className="refresh" onClick={refresh}><RefreshCw className={refreshing ? 'spin' : ''} size={17} /> <span>Atualizar</span></button><button className="accent small" onClick={onNew}><Plus size={17} /> <span>Novo supermercado</span></button></div></header>;
}

function Metric({ label, value, detail, icon: Icon, tone }) {
  return <article className="metric"><div className={`metric-icon ${tone}`}><Icon size={20} /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function StoresTable({ stores, query, setQuery, onStatus, onEditBrand }) {
  const visible = stores.filter(store => `${store.name} ${store.owner} ${store.city} ${store.plan}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">Base de clientes</p><h2>Supermercados</h2></div><label className="search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar cliente" /></label></div><div className="table-scroll"><table><thead><tr><th>Supermercado</th><th>Plano</th><th>Mensalidade</th><th>Status</th><th>Cidade</th><th>Gerenciar</th></tr></thead><tbody>{visible.map(store => <tr key={store.id}><td><div className="store-cell"><div style={{background:store.brandColors?.primary,color:store.brandColors?.accent}}>{store.name.slice(0,2).toUpperCase()}</div><span><strong>{store.name}</strong><small>{store.owner}</small><span className="store-colors"><i style={{background:store.brandColors?.primary}}/><i style={{background:store.brandColors?.accent}}/><i style={{background:store.brandColors?.background}}/></span></span></div></td><td><b className="plan">{store.plan}</b></td><td><strong>{money(store.monthlyPrice)}</strong></td><td><Status value={store.status} /></td><td>{store.city} / {store.state}</td><td><div className="manage-actions"><label className="select-wrap"><select value={store.status} onChange={event => onStatus(store.id, event.target.value)}>{Object.keys(STATUS).map(value => <option key={value} value={value}>{STATUS[value][0]}</option>)}</select><ChevronDown size={14} /></label><button className="brand-edit" onClick={() => onEditBrand(store)}><Palette size={14}/> Editar cores</button></div></td></tr>)}</tbody></table></div>{!visible.length && <div className="empty">Nenhum supermercado encontrado.</div>}</section>;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const load = useCallback(async () => { if (!api.token) return; setRefreshing(true); try { const [a,b,c] = await Promise.all([api.overview(), api.stores(), api.subscriptions()]); setOverview(a); setStores(b); setSubscriptions(c); setSession(current => current || { user: { name: 'Administrador' } }); setError(''); } catch (requestError) { if (requestError.status === 401) logout(); else setError(requestError.message); } finally { setRefreshing(false); } }, []);
  useEffect(() => { if (api.token) load(); }, [load]);
  function logout() { api.setToken(''); setSession(null); }
  async function create(data) { await api.createStore(data); await load(); }
  async function saveBranding(id, colors) { await api.updateBranding(id, colors); await load(); }
  async function changeStatus(id,status) { try { await api.updateStatus(id,status); await load(); } catch (requestError) { setError(requestError.message); } }
  if (!session) return <Login onSuccess={value => { setSession(value); load(); }} />;
  const titles = { overview: 'Visao geral', stores: 'Supermercados', billing: 'Assinaturas' };
  return <div className="shell"><Sidebar active={active} setActive={setActive} user={session.user} logout={logout} open={menuOpen} close={() => setMenuOpen(false)} />{menuOpen && <button className="overlay" onClick={() => setMenuOpen(false)} />}<main className="workspace"><Topbar title={titles[active]} openMenu={() => setMenuOpen(true)} refresh={load} refreshing={refreshing} onNew={() => setCreating(true)} />{error && <div className="global-error">{error}<button onClick={() => setError('')}><X size={17} /></button></div>}<div className="content">{active === 'overview' && <Overview overview={overview} stores={stores} subscriptions={subscriptions} goStores={() => setActive('stores')} goBilling={() => setActive('billing')} />}{active === 'stores' && <StoresTable stores={stores} query={query} setQuery={setQuery} onStatus={changeStatus} onEditBrand={setEditingBrand} />}{active === 'billing' && <Billing subscriptions={subscriptions} />}</div></main>{creating && <CreateStore close={() => setCreating(false)} onCreate={create} />}{editingBrand && <BrandingModal store={editingBrand} close={() => setEditingBrand(null)} onSave={saveBranding} />}</div>;
}
