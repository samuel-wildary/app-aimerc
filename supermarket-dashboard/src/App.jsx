import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Boxes,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingBasket,
  Sparkles,
  Store,
  Truck,
  UserRound,
  X
} from 'lucide-react';
import { api } from './api.js';

const STATUS = {
  RECEIVED: { label: 'Novo', tone: 'blue', next: 'PICKING', action: 'Iniciar separacao' },
  PICKING: { label: 'Separando', tone: 'amber', next: 'READY', action: 'Marcar como pronto' },
  READY: { label: 'Pronto', tone: 'green', next: 'OUT_FOR_DELIVERY', action: 'Saiu para entrega' },
  OUT_FOR_DELIVERY: { label: 'Em entrega', tone: 'violet', next: 'DONE', action: 'Finalizar entrega' },
  DONE: { label: 'Concluido', tone: 'muted' },
  CANCELLED: { label: 'Cancelado', tone: 'red' }
};

const navItems = [
  { id: 'overview', label: 'Visao geral', icon: LayoutDashboard },
  { id: 'orders', label: 'Pedidos', icon: ShoppingBasket },
  { id: 'catalog', label: 'Catalogo', icon: Boxes },
  { id: 'delivery', label: 'Entregas', icon: Truck }
];

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const shortTime = value => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

function Login({ onSuccess }) {
  const [email, setEmail] = useState('gestor@aimerc.local');
  const [password, setPassword] = useState('Aimerc@2026');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const session = await api.login(email, password);
      api.setToken(session.token);
      onSuccess(session);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand"><span>Ai</span>Merc</div>
        <div className="story-copy">
          <p className="overline">Operacao sem gargalos</p>
          <h1>Do clique do cliente ate a sacola pronta.</h1>
          <p>Pedidos, separacao, estoque e entregas no mesmo ritmo do seu supermercado.</p>
        </div>
        <div className="story-card">
          <Sparkles size={20} />
          <span>Fila organizada em tempo real</span>
          <strong>menos espera, mais recompra</strong>
        </div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <div className="mobile-brand"><span>Ai</span>Merc</div>
          <p className="overline">Painel do supermercado</p>
          <h2>Bem-vindo de volta</h2>
          <p className="form-intro">Entre para acompanhar a operacao de hoje.</p>
          <label>E-mail<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label>Senha<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary large" disabled={loading}>{loading ? 'Entrando...' : <>Entrar no painel <ArrowRight size={18} /></>}</button>
          <small className="demo-note">Acesso local preenchido para demonstracao.</small>
        </form>
      </section>
    </main>
  );
}

function Sidebar({ active, setActive, store, user, onLogout, open, onClose }) {
  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="side-top">
        <div className="brand"><span>Ai</span>Merc</div>
        <button className="icon-button close-menu" onClick={onClose} aria-label="Fechar menu"><X size={20} /></button>
      </div>
      <div className="store-switcher">
        <div className="store-avatar"><Store size={20} /></div>
        <div><strong>{store?.name}</strong><span>{store?.city} / {store?.state}</span></div>
        <ChevronRight size={16} />
      </div>
      <nav>
        <p>Operacao</p>
        {navItems.map(item => {
          const Icon = item.icon;
          return <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => { setActive(item.id); onClose(); }}><Icon size={19} /><span>{item.label}</span></button>;
        })}
      </nav>
      <div className="side-footer">
        <div className="user-card"><UserRound size={18} /><div><strong>{user?.name}</strong><span>Gestor da loja</span></div></div>
        <button className="logout" onClick={onLogout}><LogOut size={17} /> Sair</button>
      </div>
    </aside>
  );
}

function Header({ title, subtitle, onRefresh, refreshing, onMenu }) {
  return (
    <header className="topbar">
      <button className="icon-button menu-button" onClick={onMenu} aria-label="Abrir menu"><Menu size={22} /></button>
      <div className="page-title"><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="top-actions">
        <span className="live-pill"><i /> Operacao online</span>
        <button className="icon-button" aria-label="Notificacoes"><Bell size={19} /></button>
        <button className="refresh-button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={17} className={refreshing ? 'spin' : ''} /><span>Atualizar</span></button>
      </div>
    </header>
  );
}

function StatCard({ icon: Icon, label, value, detail, tone }) {
  return <article className={`stat-card ${tone}`}><div className="stat-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function StatusBadge({ status }) {
  const meta = STATUS[status] || { label: status, tone: 'muted' };
  return <span className={`status ${meta.tone}`}><i />{meta.label}</span>;
}

function OrderCard({ order, selected, onSelect }) {
  return (
    <button className={`order-card ${selected ? 'selected' : ''}`} onClick={() => onSelect(order)}>
      <div className="order-main"><span className="order-id">#{order.id}</span><strong>{order.customer.name}</strong><small>{order.items.length} itens · {order.fulfillmentType === 'DELIVERY' ? 'Entrega' : 'Retirada'}</small></div>
      <div className="order-meta"><StatusBadge status={order.status} /><strong>{money(order.total)}</strong><small>{shortTime(order.createdAt)}</small></div>
      <ChevronRight size={18} />
    </button>
  );
}

function OrderDetail({ order, onClose, onAdvance, busy }) {
  if (!order) return null;
  const meta = STATUS[order.status] || {};
  return (
    <div className="drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="order-drawer">
        <div className="drawer-head"><div><span>Pedido</span><h2>#{order.id}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar detalhe"><X /></button></div>
        <div className="drawer-status"><StatusBadge status={order.status} /><span>Recebido as {shortTime(order.createdAt)}</span></div>
        <section className="customer-block"><div className="avatar">{order.customer.name.slice(0, 1)}</div><div><strong>{order.customer.name}</strong><span>{order.customer.phone}</span></div></section>
        {order.fulfillmentType === 'DELIVERY' && <section className="address-block"><MapPin size={19} /><div><span>Entregar em</span><strong>{order.customer.address}</strong></div></section>}
        <section className="items-block"><div className="section-label"><span>Itens do pedido</span><strong>{order.items.length}</strong></div>{order.items.map(item => <div className="detail-item" key={item.productId}><b>{item.quantity} {item.unit}</b><span>{item.name}</span><strong>{money(item.total)}</strong></div>)}</section>
        {order.notes && <section className="notes"><span>Observacao</span><p>{order.notes}</p></section>}
        <section className="totals"><div><span>Subtotal</span><b>{money(order.subtotal)}</b></div><div><span>Entrega</span><b>{money(order.deliveryFee)}</b></div><div className="grand"><span>Total</span><strong>{money(order.total)}</strong></div></section>
        <div className="drawer-footer">
          {meta.next ? <button className="primary large" disabled={busy} onClick={() => onAdvance(order, meta.next)}>{busy ? 'Atualizando...' : meta.action}<ArrowRight size={18} /></button> : <div className="completed-message"><Check size={19} /> Pedido encerrado</div>}
        </div>
      </aside>
    </div>
  );
}

function EmptyState({ title, text, action }) {
  return <div className="empty-state"><div><ShoppingBasket size={24} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function OrdersPanel({ orders, selected, setSelected, title = 'Fila de pedidos', compact = false }) {
  const activeOrders = orders.filter(order => !['DONE', 'CANCELLED'].includes(order.status));
  return (
    <section className={`panel orders-panel ${compact ? 'compact' : ''}`}>
      <div className="panel-heading"><div><p className="overline">Agora</p><h2>{title}</h2></div><span className="counter">{activeOrders.length}</span></div>
      <div className="order-list">
        {activeOrders.length ? activeOrders.map(order => <OrderCard key={order.id} order={order} selected={selected?.id === order.id} onSelect={setSelected} />) : <EmptyState title="Fila limpa" text="Nenhum pedido aguardando acao neste momento." />}
      </div>
    </section>
  );
}

function Overview({ summary, orders, products, selected, setSelected, createDemo, creatingDemo }) {
  const statuses = summary?.statuses || {};
  const activeOrders = orders.filter(order => !['DONE', 'CANCELLED'].includes(order.status));
  return (
    <>
      <section className="welcome-strip">
        <div><p className="overline">Resumo do turno</p><h2>Sua operacao em um relance.</h2><p>Acompanhe o que precisa de atencao sem perder tempo procurando.</p></div>
        <button className="secondary" onClick={createDemo} disabled={creatingDemo}><Sparkles size={17} />{creatingDemo ? 'Criando...' : 'Gerar pedido teste'}</button>
      </section>
      <section className="stats-grid">
        <StatCard icon={Clock3} label="Novos pedidos" value={statuses.RECEIVED || 0} detail="aguardando separacao" tone="blue" />
        <StatCard icon={PackageCheck} label="Em separacao" value={statuses.PICKING || 0} detail="na bancada agora" tone="amber" />
        <StatCard icon={CircleDollarSign} label="Vendas de hoje" value={money(summary?.salesToday)} detail={`${summary?.ordersToday || 0} pedidos validos`} tone="green" />
        <StatCard icon={Boxes} label="Estoque baixo" value={summary?.lowStock || 0} detail={`de ${summary?.products || products.length} produtos`} tone="red" />
      </section>
      <section className="overview-grid">
        <OrdersPanel orders={orders} selected={selected} setSelected={setSelected} compact />
        <section className="panel pulse-panel">
          <div className="panel-heading"><div><p className="overline">Ritmo da loja</p><h2>Fluxo operacional</h2></div></div>
          <div className="flow-list">
            {[['Recebidos', statuses.RECEIVED || 0, 'blue'], ['Separando', statuses.PICKING || 0, 'amber'], ['Prontos', statuses.READY || 0, 'green'], ['Em rota', statuses.OUT_FOR_DELIVERY || 0, 'violet']].map(([label, value, tone]) => <div key={label}><span><i className={tone} />{label}</span><strong>{value}</strong><div className="flow-track"><i className={tone} style={{ width: `${activeOrders.length ? Math.max(8, (value / activeOrders.length) * 100) : 0}%` }} /></div></div>)}
          </div>
          <div className="sync-card"><RefreshCw size={18} /><div><strong>Catalogo sincronizado</strong><span>{products.length} produtos disponiveis</span></div><Check size={18} /></div>
        </section>
      </section>
    </>
  );
}

function Catalog({ products, query, setQuery }) {
  return (
    <section className="panel catalog-panel">
      <div className="panel-heading catalog-heading"><div><p className="overline">Estoque da loja</p><h2>Catalogo sincronizado</h2></div><span className="counter">{products.length}</span></div>
      <div className="catalog-toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome, SKU, codigo ou categoria" /></label><span className="sync-time"><i /> Sincronizado agora</span></div>
      <div className="table-wrap"><table><thead><tr><th>Produto</th><th>SKU</th><th>Categoria</th><th>Preco</th><th>Estoque</th><th>Situacao</th></tr></thead><tbody>{products.map(product => <tr key={product.id}><td><div className="product-cell"><div className="product-thumb" style={{ backgroundImage: `url(${product.image})` }} /><strong>{product.name}</strong></div></td><td><code>{product.sku}</code></td><td>{product.category}</td><td><strong>{money(product.price)}</strong></td><td>{product.stock} {product.unit}</td><td><span className={`stock-status ${product.stock <= 5 ? 'low' : ''}`}><i />{product.stock <= 5 ? 'Estoque baixo' : 'Disponivel'}</span></td></tr>)}</tbody></table></div>
      {!products.length && <EmptyState title="Nenhum produto encontrado" text="Tente outro nome, codigo ou categoria." />}
    </section>
  );
}

function Delivery({ orders, selected, setSelected }) {
  const deliveries = orders.filter(order => order.fulfillmentType === 'DELIVERY');
  return <OrdersPanel orders={deliveries} selected={selected} setSelected={setSelected} title="Entregas da loja" />;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [active, setActive] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!api.token) return;
    setRefreshing(true);
    try {
      const [summaryData, ordersData, productsData] = await Promise.all([api.summary(), api.orders(), api.products(query)]);
      setSummary(summaryData);
      setSession(current => current || { user: summaryData.user, store: summaryData.store });
      setOrders(ordersData);
      setProducts(productsData);
      setSelected(current => current ? ordersData.find(order => order.id === current.id) || null : null);
      setError('');
    } catch (requestError) {
      if (requestError.status === 401) logout();
      else setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    if (!api.token) return;
    load();
    const interval = window.setInterval(load, 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!session || active !== 'catalog') return;
    const timeout = window.setTimeout(load, 250);
    return () => window.clearTimeout(timeout);
  }, [query, active, session, load]);

  function logout() {
    api.setToken('');
    setSession(null);
    setOrders([]);
    setProducts([]);
  }

  async function advance(order, status) {
    setBusy(true);
    try {
      const updated = await api.updateStatus(order.id, status);
      setSelected(updated);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createDemo() {
    setCreatingDemo(true);
    try {
      const selectedProducts = products.slice(0, 3).map((product, index) => ({ productId: product.id, quantity: product.unit === 'KG' ? 1 : index + 1 }));
      const order = await api.createDemoOrder(selectedProducts);
      await load();
      setSelected(order);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCreatingDemo(false);
    }
  }

  if (!session) return <Login onSuccess={value => { setSession(value); load(); }} />;

  const pageMeta = {
    overview: ['Visao geral', 'Prioridades e desempenho do turno atual'],
    orders: ['Pedidos', 'Acompanhe cada etapa da separacao'],
    catalog: ['Catalogo', 'Precos e estoque recebidos da integracao'],
    delivery: ['Entregas', 'Pedidos que saem da loja ate o cliente']
  }[active];

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} store={session.store || summary?.store} user={session.user} onLogout={logout} open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && <button className="menu-overlay" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}
      <main className="workspace">
        <Header title={pageMeta[0]} subtitle={pageMeta[1]} onRefresh={load} refreshing={refreshing} onMenu={() => setMenuOpen(true)} />
        {error && <div className="global-error"><span>{error}</span><button onClick={() => setError('')}><X size={17} /></button></div>}
        <div className="page-content">
          {active === 'overview' && <Overview summary={summary} orders={orders} products={products} selected={selected} setSelected={setSelected} createDemo={createDemo} creatingDemo={creatingDemo} />}
          {active === 'orders' && <OrdersPanel orders={orders} selected={selected} setSelected={setSelected} />}
          {active === 'catalog' && <Catalog products={products} query={query} setQuery={setQuery} />}
          {active === 'delivery' && <Delivery orders={orders} selected={selected} setSelected={setSelected} />}
        </div>
      </main>
      <OrderDetail order={selected} onClose={() => setSelected(null)} onAdvance={advance} busy={busy} />
    </div>
  );
}
