import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  Boxes,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LayoutDashboard,
  Images,
  LogOut,
  MapPin,
  Menu,
  PackageCheck,
  Pencil,
  Phone,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingBasket,
  Sparkles,
  Store,
  Trash2,
  Truck,
  UserRound,
  UsersRound,
  Zap,
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
  { id: 'delivery', label: 'Entregas', icon: Truck },
  { id: 'customers', label: 'Clientes', icon: UsersRound },
  { id: 'reports', label: 'Relatorios', icon: BarChart3 },
  { id: 'storefront', label: 'Loja & App', icon: Images }
];

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const shortTime = value => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

function readableText(hex) {
  const value = String(hex || '#000000').replace('#', '');
  const [red, green, blue] = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#102019' : '#FFFFFF';
}

function storeTheme(store) {
  const colors = store?.brandColors || { primary: '#092D22', accent: '#12C98A', background: '#F2F5EF' };
  return {
    '--forest': colors.primary,
    '--forest-2': colors.primary,
    '--mint': colors.accent,
    '--mint-soft': `${colors.accent}22`,
    '--canvas': colors.background,
    '--on-primary': readableText(colors.primary),
    '--on-accent': readableText(colors.accent)
  };
}

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
        <div className="platform-signature"><span>gestao por</span><strong><i>Ai</i>Merc</strong></div>
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

function OrderDetail({ order, onClose, onAdvance, onPrint, busy }) {
  if (!order) return null;
  const meta = STATUS[order.status] || {};
  return (
    <div className="drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="order-drawer">
        <div className="drawer-head"><div><span>Pedido</span><h2>#{order.id}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar detalhe"><X /></button></div>
        <div className="drawer-status"><StatusBadge status={order.status} /><span>Recebido as {shortTime(order.createdAt)}</span></div>
        <section className="customer-block"><div className="avatar">{order.customer.name.slice(0, 1)}</div><div><strong>{order.customer.name}</strong><span>{order.customer.phone}</span></div></section>
        {order.fulfillmentType === 'DELIVERY' && <section className="address-block"><MapPin size={19} /><div><span>Entregar em</span><strong>{order.customer.address}</strong><small>CEP {order.customer.cep || 'nao informado'}{order.customer.reference ? ` · Ref.: ${order.customer.reference}` : ''}</small></div></section>}
        <section className="items-block"><div className="section-label"><span>Itens do pedido</span><strong>{order.items.length}</strong></div>{order.items.map(item => <div className="detail-item" key={item.productId}><b>{item.quantity} {item.unit}</b><span>{item.name}</span><strong>{money(item.total)}</strong></div>)}</section>
        {order.notes && <section className="notes"><span>Observacao</span><p>{order.notes}</p></section>}
        <section className="totals"><div><span>Subtotal</span><b>{money(order.subtotal)}</b></div><div><span>Entrega</span><b>{money(order.deliveryFee)}</b></div><div className="grand"><span>Total</span><strong>{money(order.total)}</strong></div></section>
        <div className="drawer-footer">
          <button className="print-slip" onClick={() => onPrint(order)}><Printer size={17} /> Imprimir guia de separacao</button>
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

function Customers({ customers, query, setQuery }) {
  return <section className="panel customers-panel">
    <div className="panel-heading catalog-heading"><div><p className="overline">Relacionamento</p><h2>Base de clientes</h2></div><span className="counter">{customers.length}</span></div>
    <div className="catalog-toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome ou telefone" /></label><span className="sync-time"><UsersRound size={15} /> Compras registradas pela loja</span></div>
    <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Compras</th><th>Valor acumulado</th><th>Ultimo pedido</th><th>Endereco mais recente</th></tr></thead><tbody>{customers.map(customer => <tr key={customer.phone}><td><div className="customer-cell"><div>{customer.name.slice(0, 1).toUpperCase()}</div><strong>{customer.name}</strong></div></td><td>{customer.phone}</td><td><b>{customer.orders}</b></td><td><strong>{money(customer.totalSpent)}</strong></td><td>{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString('pt-BR') : '-'}</td><td className="address-cell">{customer.address || 'Retirada / endereco nao informado'}</td></tr>)}</tbody></table></div>
    {!customers.length && <EmptyState title="Nenhum cliente encontrado" text="Os clientes aparecem aqui depois da primeira compra." />}
  </section>;
}

function Reports({ report }) {
  const today = report?.today || { orders: 0, revenue: 0, averageTicket: 0, cancellations: 0 };
  const days = report?.days || [];
  const maxRevenue = Math.max(...days.map(day => Number(day.revenue)), 1);
  return <div className="reports-grid">
    <section className="report-hero"><div><p className="overline">Indicadores da loja</p><h2>Decisoes melhores a cada pedido.</h2><p>Vendas, ticket medio, cancelamentos e clientes recorrentes atualizados com a operacao.</p></div><div className="report-hero-value"><span>Faturamento hoje</span><strong>{money(today.revenue)}</strong><small>{today.orders} pedidos criados</small></div></section>
    <section className="report-metrics"><StatCard icon={ShoppingBasket} label="Pedidos hoje" value={today.orders} detail="inclui entregas e retiradas" tone="blue" /><StatCard icon={CircleDollarSign} label="Ticket medio" value={money(today.averageTicket)} detail="pedidos nao cancelados" tone="green" /><StatCard icon={X} label="Cancelamentos" value={today.cancellations} detail="pedidos cancelados hoje" tone="red" /></section>
    <section className="panel sales-chart"><div className="panel-heading"><div><p className="overline">Ultimos 7 dias</p><h2>Faturamento diario</h2></div><span className="sync-time">Valores liquidos de pedidos ativos</span></div><div className="bar-chart">{days.map(day => <div className="bar-column" key={day.date}><strong>{day.revenue ? money(day.revenue) : '-'}</strong><div className="bar-track"><i style={{ height: `${Math.max(5, (Number(day.revenue) / maxRevenue) * 100)}%` }} /></div><span>{day.label}</span></div>)}</div></section>
    <section className="panel top-customers"><div className="panel-heading"><div><p className="overline">Recorrencia</p><h2>Melhores clientes</h2></div></div>{(report?.topCustomers || []).map((customer, index) => <div className="report-customer-row" key={customer.phone}><span className="ranking">0{index + 1}</span><div className="customer-cell"><div>{customer.name.slice(0, 1)}</div><strong>{customer.name}</strong></div><span>{customer.orders} compras</span><strong>{money(customer.totalSpent)}</strong></div>)}{!report?.topCustomers?.length && <EmptyState title="Ainda sem dados" text="O relatorio sera preenchido conforme os pedidos chegarem." />}</section>
  </div>;
}

function escapePrint(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function printOrderSlip(order, store) {
  const popup = window.open('', '_blank', 'width=420,height=720');
  if (!popup) return;
  const items = order.items.map(item => `<tr><td>${escapePrint(item.quantity)} ${escapePrint(item.unit)} x ${escapePrint(item.name)}</td><td>${money(item.total)}</td></tr>`).join('');
  popup.document.write(`<!doctype html><html><head><title>Guia ${escapePrint(order.id)}</title><style>@page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;width:72mm;margin:0;color:#000;font-size:12px}.center{text-align:center}.line{border-top:1px dashed #000;margin:9px 0}h1{font-size:17px;margin:0 0 4px}h2{font-size:15px;margin:0}small{font-size:10px}table{width:100%;border-collapse:collapse}td{padding:6px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}.total{font-size:15px;font-weight:700;display:flex;justify-content:space-between}.note{font-weight:700}.cut{margin-top:18px;border-top:1px dashed #000;padding-top:8px;font-size:10px}</style></head><body><div class="center"><h1>${escapePrint(store?.name || 'AiMerc')}</h1><small>GUIA DE SEPARACAO</small><h2>#${escapePrint(order.id)}</h2><small>${new Date(order.createdAt).toLocaleString('pt-BR')}</small></div><div class="line"></div><b>${escapePrint(order.customer.name)}</b><br><small>${escapePrint(order.customer.phone)}</small><div class="line"></div><b>${order.fulfillmentType === 'DELIVERY' ? 'ENTREGA' : 'RETIRADA'}</b><br><small>${escapePrint(order.customer.address || 'Retirada na loja')}</small>${order.customer.reference ? `<br><small>Referencia: ${escapePrint(order.customer.reference)}</small>` : ''}<div class="line"></div><table>${items}</table><div class="line"></div><div class="total"><span>Total</span><span>${money(order.total)}</span></div><small>Pagamento: ${escapePrint(order.paymentMethod === 'CASH' ? 'Dinheiro' : 'Cartao na entrega')}</small>${order.notes ? `<div class="line"></div><div class="note">OBS: ${escapePrint(order.notes)}</div>` : ''}<div class="cut">Separador: ____________________<br>Conferente: ____________________</div></body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

const emptyBanner = { eyebrow: '', title: '', subtitle: '', image: '', active: true, position: 0 };

function PushCampaigns({ campaigns, onCreate, onSend, onDelete }) {
  const [form, setForm] = useState({ title: '', body: '', audience: 'ALL_CUSTOMERS', status: 'DRAFT', scheduledAt: '' });
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  async function submit(event) { event.preventDefault(); setSaving(true); try { await onCreate({ ...form, scheduledAt: form.status === 'SCHEDULED' ? form.scheduledAt : null }); setForm({ title: '', body: '', audience: 'ALL_CUSTOMERS', status: 'DRAFT', scheduledAt: '' }); } finally { setSaving(false); } }
  async function send(id) { setSendingId(id); try { await onSend(id); } finally { setSendingId(null); } }
  const statusText = campaign => campaign.status === 'SENT' ? `Enviada para ${campaign.successCount} aparelho(s)` : campaign.status === 'PARTIAL' ? `${campaign.successCount} enviada(s), ${campaign.failureCount} falha(s)` : campaign.status === 'FAILED' ? `Falhou: ${campaign.sendError || 'verifique o Firebase'}` : campaign.status === 'SCHEDULED' ? `Agendada ${new Date(campaign.scheduledAt).toLocaleString('pt-BR')}` : 'Rascunho';
  return <section className="panel push-panel"><div className="panel-heading"><div><p className="overline">Relacionamento</p><h2>Campanhas de push</h2></div><Bell size={19} /></div><p className="panel-description">Salve para revisar, dispare imediatamente ou programe o horario. O Firebase entrega a notificacao aos celulares habilitados.</p><form className="banner-form" onSubmit={submit}><label>Titulo da notificacao<input required maxLength="80" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Oferta relampago hoje" /></label><label>Mensagem<input required maxLength="180" value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} placeholder="Ex.: Frete gratis acima de R$ 80 ate as 18h." /></label><div className="banner-form-row"><label>Publico<select value={form.audience} onChange={event => setForm({ ...form, audience: event.target.value })}><option value="ALL_CUSTOMERS">Todos os clientes</option><option value="RECENT_CUSTOMERS">Clientes recentes</option><option value="INACTIVE_CUSTOMERS">Clientes inativos</option></select></label><label>Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="DRAFT">Salvar para revisar</option><option value="SCHEDULED">Agendar envio</option></select></label></div>{form.status === 'SCHEDULED' && <label>Data e hora<input type="datetime-local" value={form.scheduledAt} onChange={event => setForm({ ...form, scheduledAt: event.target.value })} required /></label>}<button className="primary large" disabled={saving}><Bell size={17} />{saving ? 'Salvando...' : 'Salvar campanha'}</button></form><div className="push-list">{campaigns.map(campaign => <div className={`push-row push-${campaign.status.toLowerCase()}`} key={campaign.id}><div><strong>{campaign.title}</strong><span>{campaign.body}</span><small>{campaign.audience === 'ALL_CUSTOMERS' ? 'Todos os clientes' : campaign.audience === 'RECENT_CUSTOMERS' ? 'Clientes recentes' : 'Clientes inativos'} · {statusText(campaign)}</small></div><div className="push-actions">{campaign.status !== 'SENT' && <button className="send-button" disabled={sendingId === campaign.id} onClick={() => send(campaign.id)}><Bell size={15} />{sendingId === campaign.id ? 'Enviando...' : 'Disparar agora'}</button>}<button className="danger-button" onClick={() => onDelete(campaign.id)}><Trash2 size={15} /> Excluir</button></div></div>)}{!campaigns.length && <p className="empty-push">Nenhuma campanha criada ainda.</p>}</div></section>;
}

const automationTemplates = {
  DAILY: { name: 'Oferta do dia', title: 'Oferta fresquinha para voce', body: 'Abra o app e confira as ofertas selecionadas de hoje.', triggerType: 'DAILY', audience: 'ALL_CUSTOMERS', sendTime: '10:00', weekday: 1, inactiveDays: 30, active: true },
  WEEKLY: { name: 'Feira da semana', title: 'A feira da semana comecou', body: 'Economize nos produtos selecionados e receba em casa.', triggerType: 'WEEKLY', audience: 'ALL_CUSTOMERS', sendTime: '09:00', weekday: 5, inactiveDays: 30, active: true },
  INACTIVE_CUSTOMERS: { name: 'Recuperar clientes', title: 'Sentimos sua falta', body: 'Tem novidade esperando por voce. Volte ao app e confira.', triggerType: 'INACTIVE_CUSTOMERS', audience: 'INACTIVE_CUSTOMERS', sendTime: '11:00', weekday: 1, inactiveDays: 30, active: true }
};

const triggerLabels = { DAILY: 'Todos os dias', WEEKLY: 'Toda semana', INACTIVE_CUSTOMERS: 'Clientes sem comprar' };
const weekdays = ['Domingo', 'Segunda-feira', 'Terca-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sabado'];

function PushAutomations({ automations, onCreate, onToggle, onRun, onDelete }) {
  const [form, setForm] = useState(automationTemplates.DAILY);
  const [saving, setSaving] = useState(false);

  function applyTemplate(type) {
    setForm({ ...automationTemplates[type] });
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onCreate(form);
      setForm({ ...automationTemplates.DAILY });
    } finally { setSaving(false); }
  }

  return <section className="panel automation-panel">
    <div className="panel-heading"><div><p className="overline">Piloto automatico</p><h2>Programas de push</h2></div><Zap size={20} /></div>
    <p className="panel-description">Monte uma regra uma vez. O sistema acompanha o horario, cria as proximas campanhas e mantem o relacionamento funcionando sozinho.</p>
    <div className="automation-layout">
      <form className="banner-form automation-form" onSubmit={submit}>
        <div className="template-picker">
          {Object.keys(automationTemplates).map(type => <button type="button" className={form.triggerType === type ? 'selected' : ''} onClick={() => applyTemplate(type)} key={type}>{triggerLabels[type]}</button>)}
        </div>
        <label>Nome do programa<input required maxLength="80" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label>Titulo da notificacao<input required maxLength="80" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label>Mensagem<textarea required maxLength="180" value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} /></label>
        <div className="automation-fields">
          <label>Horario<input type="time" required value={form.sendTime} onChange={event => setForm({ ...form, sendTime: event.target.value })} /></label>
          {form.triggerType === 'WEEKLY' && <label>Dia da semana<select value={form.weekday} onChange={event => setForm({ ...form, weekday: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>}
          {form.triggerType === 'INACTIVE_CUSTOMERS' && <label>Sem comprar ha<input type="number" min="1" max="365" value={form.inactiveDays} onChange={event => setForm({ ...form, inactiveDays: Number(event.target.value) })} /></label>}
          {form.triggerType !== 'INACTIVE_CUSTOMERS' && <label>Publico<select value={form.audience} onChange={event => setForm({ ...form, audience: event.target.value })}><option value="ALL_CUSTOMERS">Todos os clientes</option><option value="RECENT_CUSTOMERS">Clientes recentes</option><option value="INACTIVE_CUSTOMERS">Clientes inativos</option></select></label>}
        </div>
        <button className="primary large" disabled={saving}><Zap size={17} />{saving ? 'Criando programa...' : 'Ativar automacao'}</button>
      </form>
      <div className="automation-list">
        {automations.map(automation => <article className={`automation-card ${automation.active ? '' : 'paused'}`} key={automation.id}>
          <div className="automation-card-head"><span className={`automation-state ${automation.active ? 'active' : ''}`}>{automation.active ? 'Ativa' : 'Pausada'}</span><CalendarClock size={18} /></div>
          <h3>{automation.name}</h3><p>{automation.title}</p><small>{triggerLabels[automation.triggerType]} as {automation.sendTime}{automation.triggerType === 'WEEKLY' ? `, ${weekdays[automation.weekday]}` : ''}{automation.triggerType === 'INACTIVE_CUSTOMERS' ? `, apos ${automation.inactiveDays} dias` : ''}</small>
          <div className="automation-next"><span>Proxima execucao</span><strong>{new Date(automation.nextRunAt).toLocaleString('pt-BR')}</strong>{automation.lastRunAt && <small>Ultima: {new Date(automation.lastRunAt).toLocaleString('pt-BR')}</small>}</div>
          <div className="automation-actions"><button onClick={() => onToggle(automation, !automation.active)}>{automation.active ? 'Pausar' : 'Ativar'}</button><button onClick={() => onRun(automation.id)}><Play size={14} /> Testar agora</button><button className="danger-button" onClick={() => onDelete(automation.id)}><Trash2 size={14} /></button></div>
        </article>)}
        {!automations.length && <div className="automation-empty"><Zap size={25} /><strong>Nenhum programa automatico</strong><span>Escolha um modelo ao lado para comecar.</span></div>}
      </div>
    </div>
  </section>;
}

function Storefront({ store, banners, campaigns, automations, onSaveSettings, onCreateBanner, onUpdateBanner, onDeleteBanner, onCreateCampaign, onSendCampaign, onDeleteCampaign, onCreateAutomation, onToggleAutomation, onRunAutomation, onDeleteAutomation }) {
  const [settings, setSettings] = useState({ minimumOrder: store?.minimumOrder ?? 0, deliveryFee: store?.deliveryFee ?? 0, freeDeliveryAbove: store?.freeDeliveryAbove ?? 0, supportPhone: store?.supportPhone ?? '', cancellationWindowMinutes: store?.cancellationWindowMinutes ?? 5, open: store?.open ?? true });
  const [bannerForm, setBannerForm] = useState(emptyBanner);
  const [editingId, setEditingId] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);

  useEffect(() => {
    setSettings({ minimumOrder: store?.minimumOrder ?? 0, deliveryFee: store?.deliveryFee ?? 0, freeDeliveryAbove: store?.freeDeliveryAbove ?? 0, supportPhone: store?.supportPhone ?? '', cancellationWindowMinutes: store?.cancellationWindowMinutes ?? 5, open: store?.open ?? true });
  }, [store?.minimumOrder, store?.deliveryFee, store?.freeDeliveryAbove, store?.supportPhone, store?.cancellationWindowMinutes, store?.open]);

  function editBanner(banner) {
    setEditingId(banner.id);
    setBannerForm({ eyebrow: banner.eyebrow, title: banner.title, subtitle: banner.subtitle, image: banner.image, active: banner.active, position: banner.position });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetBanner() {
    setEditingId(null);
    setBannerForm(emptyBanner);
  }

  async function submitSettings(event) {
    event.preventDefault();
    setSavingSettings(true);
    try { await onSaveSettings({ ...settings, minimumOrder: Number(settings.minimumOrder), deliveryFee: Number(settings.deliveryFee), freeDeliveryAbove: Number(settings.freeDeliveryAbove), cancellationWindowMinutes: Number(settings.cancellationWindowMinutes) }); }
    finally { setSavingSettings(false); }
  }

  async function submitBanner(event) {
    event.preventDefault();
    setSavingBanner(true);
    try {
      const payload = { ...bannerForm, position: Number(bannerForm.position) };
      if (editingId) await onUpdateBanner(editingId, payload);
      else await onCreateBanner(payload);
      resetBanner();
    } finally { setSavingBanner(false); }
  }

  return (
    <div className="storefront-grid">
      <section className="panel settings-panel">
        <div className="panel-heading"><div><p className="overline">Operacao comercial</p><h2>Taxas e funcionamento</h2></div><span className={`store-state ${settings.open ? 'open' : 'closed'}`}>{settings.open ? 'Loja aberta' : 'Loja fechada'}</span></div>
        <form className="settings-form" onSubmit={submitSettings}>
          <label>Pedido minimo<span>Valor mínimo que o cliente precisa comprar.</span><div className="money-input"><b>R$</b><input type="number" min="0" step="0.01" value={settings.minimumOrder} onChange={event => setSettings({ ...settings, minimumOrder: event.target.value })} /></div></label>
          <label>Taxa de entrega<span>Valor somado somente aos pedidos de entrega.</span><div className="money-input"><b>R$</b><input type="number" min="0" step="0.01" value={settings.deliveryFee} onChange={event => setSettings({ ...settings, deliveryFee: event.target.value })} /></div></label>
          <label>Frete gratis acima de<span>Use R$ 0 para manter taxa fixa em todos os pedidos.</span><div className="money-input"><b>R$</b><input type="number" min="0" step="0.01" value={settings.freeDeliveryAbove} onChange={event => setSettings({ ...settings, freeDeliveryAbove: event.target.value })} /></div></label>
          <label>Central de atendimento<span>Telefone exibido quando o cancelamento precisar ser resolvido pela loja.</span><input type="tel" value={settings.supportPhone} onChange={event => setSettings({ ...settings, supportPhone: event.target.value })} placeholder="(85) 99999-0000" required /></label>
          <label>Cancelamento pelo app<span>Minutos em que o cliente pode cancelar antes da separacao.</span><input type="number" min="1" max="60" value={settings.cancellationWindowMinutes} onChange={event => setSettings({ ...settings, cancellationWindowMinutes: event.target.value })} /></label>
          <label className="open-toggle"><span><strong>Receber novos pedidos</strong><small>Ao fechar, o aplicativo bloqueia novos checkouts.</small></span><input type="checkbox" checked={settings.open} onChange={event => setSettings({ ...settings, open: event.target.checked })} /></label>
          <button className="primary large" disabled={savingSettings}>{savingSettings ? 'Salvando...' : 'Salvar configuracoes'}</button>
        </form>
      </section>

      <section className="panel banner-editor">
        <div className="panel-heading"><div><p className="overline">Vitrine do aplicativo</p><h2>{editingId ? 'Editar banner' : 'Novo banner'}</h2></div>{editingId && <button className="text-button" onClick={resetBanner}>Cancelar edicao</button>}</div>
        <form className="banner-form" onSubmit={submitBanner}>
          <label>Chamada curta<input value={bannerForm.eyebrow} onChange={event => setBannerForm({ ...bannerForm, eyebrow: event.target.value })} placeholder="Ex.: Feira da semana" /></label>
          <label>Titulo principal<input required maxLength="120" value={bannerForm.title} onChange={event => setBannerForm({ ...bannerForm, title: event.target.value })} placeholder="Ex.: Frescor que cabe no carrinho" /></label>
          <label>Descricao<textarea value={bannerForm.subtitle} onChange={event => setBannerForm({ ...bannerForm, subtitle: event.target.value })} placeholder="Explique a promocao em uma frase." /></label>
          <label>URL da imagem<input value={bannerForm.image} onChange={event => setBannerForm({ ...bannerForm, image: event.target.value })} placeholder="https://..." /></label>
          <div className="banner-form-row"><label>Ordem<input type="number" min="0" max="99" value={bannerForm.position} onChange={event => setBannerForm({ ...bannerForm, position: event.target.value })} /></label><label className="active-checkbox"><input type="checkbox" checked={bannerForm.active} onChange={event => setBannerForm({ ...bannerForm, active: event.target.checked })} /> Exibir no app</label></div>
          <button className="primary large" disabled={savingBanner}>{editingId ? <Pencil size={17} /> : <Plus size={17} />}{savingBanner ? 'Salvando...' : editingId ? 'Atualizar banner' : 'Adicionar banner'}</button>
        </form>
      </section>

      <section className="panel banners-panel">
        <div className="panel-heading"><div><p className="overline">Carrossel automatico</p><h2>Banners publicados</h2></div><span className="counter">{banners.filter(banner => banner.active).length}</span></div>
        <p className="panel-description">No aplicativo eles deslizam automaticamente da direita para a esquerda. A ordem menor aparece primeiro.</p>
        <div className="banner-list">
          {banners.map(banner => <article className={`banner-admin-card ${banner.active ? '' : 'inactive'}`} key={banner.id}>
            <div className="banner-preview" style={{ backgroundImage: `linear-gradient(90deg, rgba(5,36,26,.86), rgba(5,36,26,.15)), url(${banner.image})` }}><span>{banner.eyebrow}</span><strong>{banner.title}</strong><small>{banner.subtitle}</small></div>
            <div className="banner-admin-meta"><span>Posicao {banner.position + 1}</span><b>{banner.active ? 'Publicado' : 'Oculto'}</b><div><button onClick={() => editBanner(banner)}><Pencil size={15} /> Editar</button><button className="danger-button" onClick={() => onDeleteBanner(banner.id)}><Trash2 size={15} /> Excluir</button></div></div>
          </article>)}
          {!banners.length && <EmptyState title="Nenhum banner cadastrado" text="Crie o primeiro destaque para a home do aplicativo." />}
        </div>
      </section>
      <PushCampaigns campaigns={campaigns} onCreate={onCreateCampaign} onSend={onSendCampaign} onDelete={onDeleteCampaign} />
      <PushAutomations automations={automations} onCreate={onCreateAutomation} onToggle={onToggleAutomation} onRun={onRunAutomation} onDelete={onDeleteAutomation} />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [active, setActive] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [report, setReport] = useState(null);
  const [banners, setBanners] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [query, setQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
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
      const [summaryData, ordersData, productsData, bannersData, customersData, reportData, campaignsData, automationsData] = await Promise.all([api.summary(), api.orders(), api.products(query), api.banners(), api.customers(customerQuery), api.reports(), api.pushCampaigns(), api.pushAutomations()]);
      setSummary(summaryData);
      setSession(current => current || { user: summaryData.user, store: summaryData.store });
      setOrders(ordersData);
      setProducts(productsData);
      setBanners(bannersData);
      setCustomers(customersData);
      setReport(reportData);
      setCampaigns(campaignsData);
      setAutomations(automationsData);
      setSelected(current => current ? ordersData.find(order => order.id === current.id) || null : null);
      setError('');
    } catch (requestError) {
      if (requestError.status === 401) logout();
      else setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }, [query, customerQuery]);

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

  useEffect(() => {
    if (!session || active !== 'customers') return;
    const timeout = window.setTimeout(load, 250);
    return () => window.clearTimeout(timeout);
  }, [customerQuery, active, session, load]);

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

  async function saveSettings(settings) {
    try { await api.updateSettings(settings); await load(); }
    catch (requestError) { setError(requestError.message); throw requestError; }
  }

  async function createBanner(banner) {
    try { await api.createBanner(banner); await load(); }
    catch (requestError) { setError(requestError.message); throw requestError; }
  }

  async function updateBanner(id, banner) {
    try { await api.updateBanner(id, banner); await load(); }
    catch (requestError) { setError(requestError.message); throw requestError; }
  }

  async function deleteBanner(id) {
    try { await api.deleteBanner(id); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function createCampaign(campaign) {
    try { await api.createPushCampaign(campaign); await load(); }
    catch (requestError) { setError(requestError.message); throw requestError; }
  }

  async function deleteCampaign(id) {
    try { await api.deletePushCampaign(id); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function sendCampaign(id) {
    try { await api.sendPushCampaign(id); await load(); }
    catch (requestError) { setError(requestError.message); throw requestError; }
  }

  async function createAutomation(automation) {
    try { await api.createPushAutomation(automation); await load(); }
    catch (requestError) { setError(requestError.message); throw requestError; }
  }

  async function toggleAutomation(automation, active) {
    try { await api.updatePushAutomation(automation.id, { ...automation, active }); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function runAutomation(id) {
    try { await api.runPushAutomation(id); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function deleteAutomation(id) {
    try { await api.deletePushAutomation(id); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  if (!session) return <Login onSuccess={value => { setSession(value); load(); }} />;

  const pageMeta = {
    overview: ['Visao geral', 'Prioridades e desempenho do turno atual'],
    orders: ['Pedidos', 'Acompanhe cada etapa da separacao'],
    catalog: ['Catalogo', 'Precos e estoque recebidos da integracao'],
    delivery: ['Entregas', 'Pedidos que saem da loja ate o cliente'],
    customers: ['Clientes', 'Historico, recorrencia e endereco de cada comprador'],
    reports: ['Relatorios', 'Vendas, ticket medio e clientes recorrentes'],
    storefront: ['Loja & App', 'Taxas, funcionamento e vitrine do aplicativo']
  }[active];

  return (
    <div className="app-shell" style={storeTheme(summary?.store || session.store)}>
      <Sidebar active={active} setActive={setActive} store={summary?.store || session.store} user={session.user} onLogout={logout} open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && <button className="menu-overlay" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}
      <main className="workspace">
        <Header title={pageMeta[0]} subtitle={pageMeta[1]} onRefresh={load} refreshing={refreshing} onMenu={() => setMenuOpen(true)} />
        {error && <div className="global-error"><span>{error}</span><button onClick={() => setError('')}><X size={17} /></button></div>}
        <div className="page-content">
          {active === 'overview' && <Overview summary={summary} orders={orders} products={products} selected={selected} setSelected={setSelected} createDemo={createDemo} creatingDemo={creatingDemo} />}
          {active === 'orders' && <OrdersPanel orders={orders} selected={selected} setSelected={setSelected} />}
          {active === 'catalog' && <Catalog products={products} query={query} setQuery={setQuery} />}
          {active === 'delivery' && <Delivery orders={orders} selected={selected} setSelected={setSelected} />}
          {active === 'customers' && <Customers customers={customers} query={customerQuery} setQuery={setCustomerQuery} />}
          {active === 'reports' && <Reports report={report} />}
          {active === 'storefront' && <Storefront store={summary?.store} banners={banners} campaigns={campaigns} automations={automations} onSaveSettings={saveSettings} onCreateBanner={createBanner} onUpdateBanner={updateBanner} onDeleteBanner={deleteBanner} onCreateCampaign={createCampaign} onSendCampaign={sendCampaign} onDeleteCampaign={deleteCampaign} onCreateAutomation={createAutomation} onToggleAutomation={toggleAutomation} onRunAutomation={runAutomation} onDeleteAutomation={deleteAutomation} />}
        </div>
      </main>
      <OrderDetail order={selected} onClose={() => setSelected(null)} onAdvance={advance} onPrint={order => printOrderSlip(order, summary?.store || session.store)} busy={busy} />
    </div>
  );
}
