import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bookmark,
  CalendarClock,
  Boxes,
  Camera,
  Check,
  CheckSquare,
  ChevronRight,
  ChevronDown,
  Download,
  CircleDollarSign,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  Globe,
  HelpCircle,
  ImagePlus,
  ImageOff,
  LayoutDashboard,
  Images,
  Plug,
  LogOut,
  MapPin,
  Menu,
  Package,
  PackageCheck,
  Pencil,
  Phone,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShoppingBasket,
  Sparkles,
  Smartphone,
  Square,
  Store,
  Tags,
  Trash2,
  Truck,
  Upload,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
  Zap,
  Maximize2,
  Minimize2,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Tv,
  Info,
  X
} from 'lucide-react';
import { api } from './api.js';
import { realtime } from './realtime.js';

let audioCtx = null;
let orderAudioElement = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSynthesizedBell() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6, ctx.currentTime);
    compressor.knee.setValueAtTime(4, ctx.currentTime);
    compressor.ratio.setValueAtTime(16, ctx.currentTime);
    compressor.attack.setValueAtTime(0.002, ctx.currentTime);
    compressor.release.setValueAtTime(0.08, ctx.currentTime);
    compressor.connect(ctx.destination);

    const bursts = [
      { start: 0.0, duration: 0.45 },
      { start: 0.56, duration: 0.45 },
      { start: 1.12, duration: 0.58 }
    ];

    bursts.forEach(({ start, duration }) => {
      const t0 = ctx.currentTime + start;
      const t1 = t0 + duration;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, t0);
      masterGain.gain.linearRampToValueAtTime(0.95, t0 + 0.015);
      masterGain.gain.setValueAtTime(0.95, t1 - 0.03);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, t1);
      masterGain.connect(compressor);

      const tremolo = ctx.createGain();
      tremolo.gain.setValueAtTime(0.5, t0);
      tremolo.connect(masterGain);

      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.setValueAtTime(22, t0);

      const lfoAmp = ctx.createGain();
      lfoAmp.gain.setValueAtTime(0.5, t0);
      lfo.connect(lfoAmp);
      lfoAmp.connect(tremolo.gain);

      lfo.start(t0);
      lfo.stop(t1);

      const tones = [
        { freq: 753, gain: 0.65 },
        { freq: 852, gain: 0.65 },
        { freq: 1605, gain: 0.28 },
        { freq: 2280, gain: 0.18 }
      ];

      tones.forEach(({ freq, gain }) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0);

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(gain, t0);

        osc.connect(oscGain);
        oscGain.connect(tremolo);

        osc.start(t0);
        osc.stop(t1);
      });
    });
  } catch (err) {
    console.warn('Audio fallback error:', err);
  }
}

function playOrderChime() {
  try {
    if (typeof window !== 'undefined') {
      if (!orderAudioElement) {
        orderAudioElement = new Audio('/sounds/order-notification.wav');
      }
      orderAudioElement.currentTime = 0;
      orderAudioElement.volume = 1.0;
      const playPromise = orderAudioElement.play();
      if (playPromise !== undefined) {
        playPromise
          .catch((err) => {
            console.warn('WAV playback blocked, trying m4a fallback:', err);
            try {
              const m4a = new Audio('/sounds/order-notification.m4a');
              m4a.volume = 1.0;
              m4a.play().catch(() => playSynthesizedBell());
            } catch (_) {
              playSynthesizedBell();
            }
          });
        return;
      }
    }
  } catch (e) {
    console.warn('Audio error, using fallback:', e);
  }
  playSynthesizedBell();
}

const STATUS = {
  RECEIVED: { label: 'Novo', tone: 'blue', next: 'PICKING', action: 'Iniciar separacao' },
  PICKING: { label: 'Separando', tone: 'amber', next: 'READY', action: 'Marcar como pronto' },
  READY: { label: 'Pronto', tone: 'green', next: 'OUT_FOR_DELIVERY', action: 'Saiu para entrega' },
  OUT_FOR_DELIVERY: { label: 'Em entrega', tone: 'violet', next: 'DONE', action: 'Finalizar entrega' },
  DONE: { label: 'Concluido', tone: 'muted' },
  CANCELLED: { label: 'Cancelado', tone: 'red' }
};

const KANBAN_COLUMNS = [
  { status: 'RECEIVED', hint: 'Aguardando inicio' },
  { status: 'PICKING', hint: 'Na bancada agora' },
  { status: 'READY', hint: 'Pronto para sair' },
  { status: 'OUT_FOR_DELIVERY', hint: 'A caminho do cliente' }
];

const navItems = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'orders', label: 'Pedidos', icon: ShoppingBasket },
  { id: 'catalog', label: 'Catálogo', icon: Boxes },
  { id: 'integracao', label: 'Integração', icon: Plug },
  { id: 'delivery', label: 'Entregas', icon: Truck },
  { id: 'customers', label: 'Clientes', icon: UsersRound },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'storefront', label: 'Loja & App', icon: Images }
];

const storefrontSubTabs = [
  { id: 'fees', label: 'Taxas & Entregas', icon: FileText },
  { id: 'hours', label: 'Horários & Retirada', icon: Clock3 },
  { id: 'categories', label: 'Categorias no App', icon: Tags },
  { id: 'banners', label: 'Banners & Vitrine', icon: Images },
  { id: 'campaigns', label: 'Notificações Push', icon: Bookmark },
  { id: 'automations', label: 'Automações', icon: Zap }
];

function nextStatusFor(order) {
  const meta = STATUS[order.status] || {};
  if (order.status === 'READY' && order.fulfillmentType !== 'DELIVERY') {
    return { next: 'DONE', action: 'Cliente retirou' };
  }
  return { next: meta.next, action: meta.action };
}

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const shortTime = value => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

async function prepareCatalogImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem valido');
  const bitmap = await createImageBitmap(file);
  const maxSide = 1_400;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .84));
  if (!blob) throw new Error('Nao foi possivel otimizar a imagem');
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'produto'}.webp`, { type: 'image/webp' });
}

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

function Login({ onSuccess, onInstallApp, isStandalone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
          {!isStandalone && (
            <div className="login-install-strip">
              <button
                type="button"
                className="login-install-btn"
                onClick={onInstallApp}
                title="Instalar AiMerc como aplicativo fixo no seu computador (sem abas do navegador)"
              >
                <Download size={16} />
                <span>Instalar aplicativo neste computador</span>
                <span className="pwa-badge">Desktop</span>
              </button>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

function Sidebar({ active, setActive, store, user, onLogout, open, onClose, collapsed, onToggleCollapse, onInstallApp, isStandalone, canInstall }) {
  return (
    <aside className={`sidebar ${open ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="side-top">
        {!collapsed ? (
          <div className="platform-signature"><span>gestao por</span><strong><i>Ai</i>Merc</strong></div>
        ) : (
          <div className="platform-signature-collapsed" title="AiMerc Gestor"><strong><i>Ai</i></strong></div>
        )}
        <div className="side-top-actions">
          <button
            type="button"
            className="icon-button collapse-desktop-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral (Mais espaço para pedidos)'}
            aria-label="Recolher menu lateral"
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button className="icon-button close-menu" onClick={onClose} aria-label="Fechar menu"><X size={20} /></button>
        </div>
      </div>
      <div className="store-switcher" title={`${store?.name || 'Mercado'} - ${store?.city || ''}/${store?.state || ''}`}>
        <div className="store-avatar"><Store size={20} /></div>
        {!collapsed && (
          <>
            <div><strong>{store?.name}</strong><span>{store?.city} / {store?.state}</span></div>
            <ChevronRight size={16} />
          </>
        )}
      </div>
      <nav>
        {!collapsed && <p className="group-label">OPERAÇÃO</p>}
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={active === item.id ? 'active' : ''}
              onClick={() => { setActive(item.id); onClose(); }}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={19} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
      <div className="side-footer">
        {!isStandalone && (
          <button
            type="button"
            className="install-pwa-button"
            onClick={onInstallApp}
            title="Instalar AiMerc como aplicativo fixo no seu Computador (sem barras de navegação)"
          >
            <Download size={17} />
            {!collapsed && (
              <>
                <span>Instalar no PC</span>
                <span className="pwa-badge">Desktop</span>
              </>
            )}
          </button>
        )}
        <div className="user-card" title={user?.name}>
          <UserRound size={18} />
          {!collapsed && <div><strong>{user?.name}</strong><span>Gestor da loja</span></div>}
        </div>
        <button className="logout" onClick={onLogout} title="Sair do sistema">
          <LogOut size={17} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}

function Header({
  title,
  subtitle,
  onRefresh,
  refreshing,
  onMenu,
  soundEnabled,
  onToggleSound,
  onToggleMonitor,
  isMonitorMode,
  collapsed,
  onToggleCollapse,
  onInstallApp,
  isStandalone,
  activeView
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button menu-button" onClick={onMenu} aria-label="Abrir menu"><Menu size={22} /></button>
        <button
          type="button"
          className="icon-button topbar-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral (Mais espaço para pedidos)'}
          aria-label="Alternar menu lateral"
        >
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </button>
        <div className="page-title">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="top-actions">
        <span className="live-pill"><i /> Operação online</span>
        {activeView === 'orders' && (
          <button
            type="button"
            className={`topbar-monitor-btn ${isMonitorMode ? 'active' : ''}`}
            onClick={onToggleMonitor}
            title={isMonitorMode ? 'Sair da visualização monitor' : 'Modo Monitor / Tela Cheia: otimizado para o balcão e monitores de 14"'}
          >
            {isMonitorMode ? <Minimize2 size={16} /> : <Monitor size={16} />}
            <span>{isMonitorMode ? 'Sair do Monitor' : 'Modo Monitor'}</span>
          </button>
        )}
        {!isStandalone && (
          <button
            type="button"
            className="topbar-install-btn"
            onClick={onInstallApp}
            title="Instalar AiMerc no computador para rodar fixo fora do navegador"
          >
            <Download size={15} />
            <span>Instalar App</span>
          </button>
        )}
        <button
          type="button"
          className={`icon-button sound-btn ${soundEnabled ? 'active' : 'muted'}`}
          onClick={onToggleSound}
          title={soundEnabled ? 'Alerta sonoro ativado (clique para testar ou desativar)' : 'Alerta sonoro desativado (clique para ativar)'}
          aria-label="Alerta sonoro de pedidos"
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button className="icon-button notification-btn" aria-label="Notificações">
          <Bell size={18} />
          <span className="notification-badge-dot" />
        </button>
        <button className="refresh-button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /><span>Atualizar</span></button>
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
  const scheduled = order.scheduledTo && new Date(order.scheduledTo).getTime() > Date.now();
  return (
    <button className={`order-card ${selected ? 'selected' : ''}`} onClick={() => onSelect(order)}>
      <div className="order-main"><span className="order-id">#{order.id}</span><strong>{order.customer.name}</strong><small>{order.items.length} itens · {order.fulfillmentType === 'DELIVERY' ? 'Entrega' : 'Retirada'}</small>{scheduled && <span className="scheduled-order">Separar em {new Date(order.scheduledTo).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>}</div>
      <div className="order-meta"><StatusBadge status={order.status} /><strong>{money(order.total)}</strong><small>{shortTime(order.createdAt)}</small></div>
      <ChevronRight size={18} />
    </button>
  );
}

function KanbanCard({ order, selected, onSelect, onAdvance, busy }) {
  const { next, action } = nextStatusFor(order);
  const scheduled = order.scheduledTo && new Date(order.scheduledTo).getTime() > Date.now();
  const toneClass = order.status === 'RECEIVED' ? 'tone-blue' : order.status === 'PICKING' ? 'tone-amber' : order.status === 'READY' ? 'tone-green' : 'tone-violet';
  return (
    <article className={`kanban-card ${selected ? 'selected' : ''} ${toneClass}`}>
      <button type="button" className="kanban-card-body" onClick={() => onSelect(order)}>
        <div className="kanban-card-top">
          <span className="kanban-order-badge">#{order.id}</span>
          <span className="kanban-order-time"><Clock3 size={12} />{shortTime(order.createdAt)}</span>
        </div>
        <div className="kanban-customer-row">
          <strong className="kanban-customer-name">{order.customer.name}</strong>
          {order.fulfillmentType === 'DELIVERY' ? (
            <span className="kanban-tag delivery"><Truck size={12} /> Entrega</span>
          ) : (
            <span className="kanban-tag pickup"><Store size={12} /> Retirada</span>
          )}
        </div>
        <div className="kanban-items-summary">
          <span>{order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</span>
          {order.customer.address && order.fulfillmentType === 'DELIVERY' && (
            <small className="kanban-address-snippet" title={order.customer.address}> · {order.customer.address.split(',')[0]}</small>
          )}
        </div>
        {scheduled && <span className="scheduled-order">Separar em {new Date(order.scheduledTo).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
        <div className="kanban-card-foot">
          <div className="kanban-price-wrap">
            <span className="kanban-price-label">Total</span>
            <strong className="kanban-price-value">{money(order.total)}</strong>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </button>
      {next && (
        <button
          type="button"
          className={`kanban-advance-btn ${toneClass}`}
          disabled={busy}
          onClick={event => {
            event.stopPropagation();
            onAdvance(order, next);
          }}
        >
          {busy ? 'Atualizando...' : (
            <>
              <span>{action}</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>
      )}
    </article>
  );
}

function OrderDetail({ order, onClose, onAdvance, onPrint, onUpdateItems, busy, products = [] }) {
  if (!order) return null;
  const { next, action } = nextStatusFor(order);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showAddPicker, setShowAddPicker] = useState(false);

  useEffect(() => {
    if (order?.items) {
      setItems(order.items.map(it => ({ ...it })));
      setEditing(false);
      setShowAddPicker(false);
      setProductSearch('');
    }
  }, [order]);

  const canEdit = !['DONE', 'CANCELLED'].includes(order.status);

  function handleQuantityChange(index, newQty) {
    const parsed = Math.max(0, parseFloat(newQty) || 0);
    setItems(current => {
      const copy = [...current];
      copy[index] = {
        ...copy[index],
        quantity: parsed,
        total: Number((parsed * Number(copy[index].price || 0)).toFixed(2))
      };
      return copy;
    });
  }

  function handleRemoveItem(index) {
    setItems(current => current.filter((_, i) => i !== index));
  }

  function handleAddProduct(product) {
    const defaultQty = String(product.unit || '').toUpperCase() === 'KG' ? 1.0 : 1;
    const price = Number(product.price || 0);
    const existingIndex = items.findIndex(it => it.productId === product.id);
    if (existingIndex >= 0) {
      handleQuantityChange(existingIndex, items[existingIndex].quantity + defaultQty);
    } else {
      setItems(current => [
        ...current,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit || 'UN',
          quantity: defaultQty,
          price: price,
          total: Number((defaultQty * price).toFixed(2))
        }
      ]);
    }
    setShowAddPicker(false);
    setProductSearch('');
  }

  const calculatedSubtotal = useMemo(() => {
    return Number(items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0).toFixed(2));
  }, [items]);

  const calculatedTotal = useMemo(() => {
    return Number((calculatedSubtotal + Number(order.deliveryFee || 0)).toFixed(2));
  }, [calculatedSubtotal, order.deliveryFee]);

  async function saveItems() {
    const validItems = items.filter(it => Number(it.quantity) > 0);
    if (!validItems.length) {
      alert('O pedido deve conter pelo menos 1 item com quantidade maior que zero.');
      return;
    }
    setSaving(true);
    try {
      if (onUpdateItems) {
        await onUpdateItems(order, validItems);
      }
      setEditing(false);
    } catch (e) {
      alert('Erro ao atualizar itens: ' + (e.message || 'Tente novamente'));
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setItems(order.items.map(it => ({ ...it })));
    setEditing(false);
    setShowAddPicker(false);
  }

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 8);
    const q = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q))).slice(0, 10);
  }, [products, productSearch]);

  return (
    <div className="order-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="order-modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
        <div className="drawer-head">
          <div>
            <span>Pedido</span>
            <h2 id="order-modal-title">#{order.id}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar detalhe"><X /></button>
        </div>

        <div className="drawer-status">
          <StatusBadge status={order.status} />
          <span>Recebido as {shortTime(order.createdAt)}</span>
        </div>

        {order.scheduledTo && new Date(order.scheduledTo).getTime() > Date.now() && (
          <section className="scheduled-notice">
            <CalendarClock size={19} />
            <div>
              <strong>Pedido recebido fora do horario</strong>
              <span>Separar a partir de {new Date(order.scheduledTo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          </section>
        )}

        <section className="customer-block">
          <div className="avatar">{order.customer.name.slice(0, 1)}</div>
          <div>
            <strong>{order.customer.name}</strong>
            <span>{order.customer.phone}</span>
          </div>
        </section>

        {order.fulfillmentType === 'DELIVERY' && (
          <section className="address-block">
            <MapPin size={19} />
            <div>
              <span>Entregar em</span>
              <strong>{order.customer.address}</strong>
              <small>CEP {order.customer.cep || 'nao informado'}{order.customer.reference ? ` · Ref.: ${order.customer.reference}` : ''}</small>
            </div>
          </section>
        )}

        <section className="items-block">
          <div className="section-label order-items-head">
            <div>
              <span>Itens do pedido</span>
              <strong>{editing ? items.length : order.items.length}</strong>
            </div>
            {canEdit && !editing && (
              <button
                type="button"
                className="edit-items-trigger"
                onClick={() => setEditing(true)}
              >
                <Pencil size={13} />
                <span>Ajustar itens / peso real</span>
              </button>
            )}
            {editing && (
              <span className="editing-badge">
                Modo de ajuste ativo
              </span>
            )}
          </div>

          {!editing ? (
            <div className="order-items-list">
              {order.items.map(item => (
                <div className="detail-item" key={item.productId}>
                  <b>{item.quantity} {item.unit}</b>
                  <span>{item.name}</span>
                  <strong>{money(item.total)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="order-items-editing-list">
              {items.map((item, index) => {
                const isKg = String(item.unit || '').toUpperCase() === 'KG';
                return (
                  <div className="edit-item-row" key={item.productId || index}>
                    <div className="edit-item-info">
                      <strong>{item.name}</strong>
                      <small>{money(item.price)} / {item.unit || 'UN'}</small>
                    </div>
                    <div className="edit-item-inputs">
                      <div className="edit-qty-wrapper">
                        <input
                          type="number"
                          step={isKg ? '0.005' : '1'}
                          min="0"
                          value={item.quantity}
                          onChange={e => handleQuantityChange(index, e.target.value)}
                          aria-label={`Quantidade de ${item.name}`}
                          className="edit-qty-input"
                        />
                        <span className="edit-qty-unit">{item.unit || 'UN'}</span>
                      </div>
                      <strong className="edit-item-total">{money(item.total)}</strong>
                      <button
                        type="button"
                        className="edit-remove-btn"
                        onClick={() => handleRemoveItem(index)}
                        title="Remover item do pedido"
                        aria-label="Remover item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {!showAddPicker ? (
                <button
                  type="button"
                  className="add-item-btn"
                  onClick={() => setShowAddPicker(true)}
                >
                  <Plus size={15} />
                  <span>Adicionar produto do catálogo</span>
                </button>
              ) : (
                <div className="add-product-picker">
                  <div className="picker-search-box">
                    <Search size={15} />
                    <input
                      type="text"
                      placeholder="Buscar produto para adicionar..."
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowAddPicker(false)} className="picker-close-btn" aria-label="Fechar busca">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="picker-results">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="picker-product-item"
                        onClick={() => handleAddProduct(p)}
                      >
                        <div className="picker-product-info">
                          <span>{p.name}</span>
                          <small>{p.category || 'Geral'} · {p.unit || 'UN'}</small>
                        </div>
                        <strong>{money(p.price)}</strong>
                      </button>
                    ))}
                    {!filteredProducts.length && (
                      <div className="picker-empty">Nenhum produto encontrado</div>
                    )}
                  </div>
                </div>
              )}

              <div className="edit-actions-bar">
                <button
                  type="button"
                  className="btn-cancel-edit"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-save-edit"
                  onClick={saveItems}
                  disabled={saving || !items.length}
                >
                  {saving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                  <span>{saving ? 'Salvando...' : 'Salvar ajustes'}</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {order.notes && <section className="notes"><span>Observacao</span><p>{order.notes}</p></section>}

        <section className="totals">
          <div>
            <span>Subtotal</span>
            <b>{money(editing ? calculatedSubtotal : order.subtotal)}</b>
          </div>
          <div>
            <span>Entrega</span>
            <b>{money(order.deliveryFee)}</b>
          </div>
          <div className="grand">
            <span>Total</span>
            <strong>{money(editing ? calculatedTotal : order.total)}</strong>
          </div>
          {editing && calculatedTotal !== order.total && (
            <div className="total-diff-notice">
              <span>Variação de corte/ajuste: </span>
              <strong>{calculatedTotal > order.total ? `+ ${money(calculatedTotal - order.total)}` : `- ${money(order.total - calculatedTotal)}`}</strong>
            </div>
          )}
        </section>

        <div className="drawer-footer">
          <button className="print-slip" onClick={() => onPrint(order)}><Printer size={17} /> Imprimir guia de separacao</button>
          {next ? (
            <button className="primary large" disabled={busy || editing} onClick={() => onAdvance(order, next)}>
              {busy ? 'Atualizando...' : action}<ArrowRight size={18} />
            </button>
          ) : (
            <div className="completed-message"><Check size={19} /> Pedido encerrado</div>
          )}
        </div>
      </div>
    </div>
  );
}

function InstallGuideModal({ onClose, onPromptInstall, canDirectInstall }) {
  return (
    <div className="install-modal-backdrop" onClick={onClose}>
      <div className="install-modal" onClick={e => e.stopPropagation()}>
        <header className="install-modal-head">
          <div className="install-modal-title">
            <div className="install-icon-wrap"><Download size={22} /></div>
            <div>
              <h3>Instalar AiMerc no Computador</h3>
              <p>Execute como aplicativo fixo, sem abas nem barra de links</p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <div className="install-modal-body">
          <div className="install-benefits">
            <div className="benefit-item">
              <span className="benefit-dot">✓</span>
              <span><strong>Mais espaço na tela:</strong> Remove as barras do navegador e aproveita 100% do seu monitor de 14".</span>
            </div>
            <div className="benefit-item">
              <span className="benefit-dot">✓</span>
              <span><strong>Fixo no computador:</strong> Ícone na área de trabalho e barra de tarefas do Windows/Mac.</span>
            </div>
            <div className="benefit-item">
              <span className="benefit-dot">✓</span>
              <span><strong>Alertas sonoros contínuos:</strong> Nunca perde um pedido novo que chega no mercado.</span>
            </div>
          </div>

          {canDirectInstall ? (
            <div className="direct-install-action">
              <button
                type="button"
                className="primary large full-width"
                onClick={() => { onPromptInstall(); onClose(); }}
              >
                <Download size={18} />
                <span>Instalar Agora</span>
              </button>
            </div>
          ) : (
            <div className="install-steps">
              <h4>Como instalar pelo seu navegador:</h4>
              <div className="step-card">
                <span className="step-num">1</span>
                <div>
                  <strong>No Google Chrome / Edge / Brave:</strong>
                  <p>Olhe para o topo direito da barra de endereços (ao lado da estrelinha) e clique no ícone de <strong>Instalar Aplicativo (🖥️ ou 📥)</strong>.</p>
                </div>
              </div>
              <div className="step-card">
                <span className="step-num">2</span>
                <div>
                  <strong>Ou pelo Menu do Navegador:</strong>
                  <p>Clique nos <strong>3 pontinhos (⋮)</strong> no canto superior direito &gt; <strong>Transmitir, salvar e compartilhar</strong> &gt; <strong>Instalar AiMerc</strong>.</p>
                </div>
              </div>
              <div className="step-card">
                <span className="step-num">3</span>
                <div>
                  <strong>Pronto!</strong>
                  <p>Uma janela dedicada será aberta e você poderá fixar o AiMerc na barra de tarefas do seu PC.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="install-modal-footer">
          <button type="button" className="secondary" onClick={onClose}>Entendi</button>
        </footer>
      </div>
    </div>
  );
}

function EmptyState({ title, text, action }) {
  return <div className="empty-state"><div><ShoppingBasket size={24} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function OrdersPanel({
  orders,
  selected,
  setSelected,
  title = 'Painel de pedidos',
  compact = false,
  onAdvance,
  busy = false,
  onToggleMonitor,
  isMonitorMode,
  density = 'default',
  onChangeDensity
}) {
  const activeOrders = orders.filter(order => !['DONE', 'CANCELLED'].includes(order.status));

  if (compact) {
    return (
      <section className="panel orders-panel compact">
        <div className="panel-heading"><div><p className="overline">Agora</p><h2>{title}</h2></div><span className="counter">{activeOrders.length}</span></div>
        <div className="order-list">
          {activeOrders.length ? activeOrders.map(order => <OrderCard key={order.id} order={order} selected={selected?.id === order.id} onSelect={setSelected} />) : <EmptyState title="Fila limpa" text="Nenhum pedido aguardando acao neste momento." />}
        </div>
      </section>
    );
  }

  return (
    <section className={`panel orders-panel kanban-panel ${isMonitorMode ? 'is-monitor' : ''}`}>
      <div className="panel-heading kanban-panel-heading">
        <div className="kanban-title-area">
          <p className="overline">Fluxo da loja</p>
          <div className="kanban-heading-row">
            <h2>{title}</h2>
            <span className="counter">{activeOrders.length}</span>
          </div>
          <p className="kanban-help">Clique no card para ver os detalhes. Use o botao da etapa para avancar sem abrir o modal.</p>
        </div>
        <div className="kanban-panel-actions">
          <div className="density-toggle-group" title="Ajuste de densidade e tamanho para o seu monitor">
            <button
              type="button"
              className={`density-btn ${density === 'compact' ? 'active' : ''}`}
              onClick={() => onChangeDensity?.('compact')}
              title="Compacto: cabe mais pedidos em telas de 14 polegadas"
            >
              Compacto
            </button>
            <button
              type="button"
              className={`density-btn ${density === 'default' ? 'active' : ''}`}
              onClick={() => onChangeDensity?.('default')}
              title="Padrão"
            >
              Padrão
            </button>
            <button
              type="button"
              className={`density-btn ${density === 'large' ? 'active' : ''}`}
              onClick={() => onChangeDensity?.('large')}
              title="Ampliado: fontes maiores para visualização à distância"
            >
              Ampliado
            </button>
          </div>
          <button
            type="button"
            className={`monitor-mode-action-btn ${isMonitorMode ? 'active' : ''}`}
            onClick={onToggleMonitor}
            title={isMonitorMode ? 'Sair do Modo Monitor' : 'Modo Monitor / Tela Cheia (Ideal para PDV e Monitores de 14")'}
          >
            {isMonitorMode ? <Minimize2 size={16} /> : <Monitor size={16} />}
            <span>{isMonitorMode ? 'Sair do Monitor' : 'Modo Monitor'}</span>
          </button>
        </div>
      </div>
      {!activeOrders.length ? (
        <EmptyState title="Painel limpo" text="Nenhum pedido em andamento. Novos pedidos entram na coluna Novo." />
      ) : (
        <div className={`kanban-board density-${density || 'default'}`}>
          {KANBAN_COLUMNS.map(column => {
            const meta = STATUS[column.status];
            const columnOrders = activeOrders.filter(order => order.status === column.status);
            const ColumnIcon = column.status === 'RECEIVED' ? Bell : column.status === 'PICKING' ? Clock3 : column.status === 'READY' ? CheckSquare : Truck;
            return (
              <div key={column.status} className={`kanban-column ${meta.tone}`}>
                <header className="kanban-column-head">
                  <div className="kanban-head-title">
                    <ColumnIcon size={16} />
                    <div>
                      <strong>{meta.label}</strong>
                      <span className="kanban-column-hint">{column.hint}</span>
                    </div>
                  </div>
                  <span className="kanban-count-pill">{columnOrders.length}</span>
                </header>
                <div className="kanban-column-body">
                  {columnOrders.length ? columnOrders.map(order => (
                    <KanbanCard
                      key={order.id}
                      order={order}
                      selected={selected?.id === order.id}
                      onSelect={setSelected}
                      onAdvance={onAdvance}
                      busy={busy}
                    />
                  )) : (
                    <div className="kanban-empty">
                      <Package size={22} />
                      <span>Sem pedidos nesta etapa</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Overview({ summary, orders, products, selected, setSelected }) {
  const statuses = summary?.statuses || {};
  const activeOrders = orders.filter(order => !['DONE', 'CANCELLED'].includes(order.status));
  return (
    <>
      <section className="welcome-strip">
        <div>
          <p className="overline">Resumo do turno</p>
          <h2>Sua operação em um relance.</h2>
          <p>Acompanhe o que precisa de atenção sem perder tempo procurando.</p>
        </div>
      </section>
      <section className="stats-grid">
        <StatCard icon={Clock3} label="Novos pedidos" value={statuses.RECEIVED || 0} detail="aguardando separacao" tone="blue" />
        <StatCard icon={PackageCheck} label="Em separacao" value={statuses.PICKING || 0} detail="na bancada agora" tone="amber" />
        <StatCard icon={CircleDollarSign} label="Vendas de hoje" value={money(summary?.salesToday)} detail={`${summary?.ordersToday || 0} pedidos validos`} tone="green" />
        <StatCard icon={Boxes} label="Estoque baixo" value={summary?.lowStock || 0} detail={`de ${summary?.products || products.length} produtos`} tone="red" />
      </section>
      <section className="overview-grid">
        <OrdersPanel orders={orders} selected={selected} setSelected={setSelected} title="Fila de pedidos" compact />
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

function InlineStockEditor({ product, api, onChanged, setAssimilateMsg }) {
  const sourceIsKg = String(product.sourceUnit || product.unit || '').toUpperCase() === 'KG';
  
  const [saleMode, setSaleMode] = useState(
    product.saleMode === 'WEIGHT' ? (product.quantityStep === 1 ? 'WEIGHT_1000' : 'WEIGHT_100') : (product.saleMode || 'AUTO')
  );
  
  const [stockOverride, setStockOverride] = useState(product.stockOverride === null ? '' : product.stockOverride);
  const [stockUnit, setStockUnit] = useState('KG');
  const [busy, setBusy] = useState(false);

  async function handleSaleModeChange(newVal) {
    setSaleMode(newVal);
    let sMode = 'AUTO';
    let qStep = 1;
    if (newVal === 'UNIT') {
      sMode = 'UNIT';
    } else if (newVal.startsWith('WEIGHT_')) {
      sMode = 'WEIGHT';
      qStep = Number(newVal.split('_')[1]) / 1000;
    }
    setBusy(true);
    try {
      await api.updateProductCatalog(product.id, {
        saleMode: sMode,
        quantityStep: qStep,
        stockOverride: stockOverride === '' ? null : Number(stockOverride)
      });
      if (onChanged) await onChanged();
    } catch (e) {
      if (setAssimilateMsg) setAssimilateMsg(e.message || 'Erro ao salvar a forma de venda');
    } finally {
      setBusy(false);
    }
  }

  async function saveStock(newVal) {
    let finalStock = newVal === '' ? '' : (stockUnit === 'G' ? Number(newVal) / 1000 : Number(newVal));
    setStockOverride(finalStock);
    let sMode = 'AUTO';
    let qStep = 1;
    if (saleMode === 'UNIT') {
      sMode = 'UNIT';
    } else if (saleMode.startsWith('WEIGHT_')) {
      sMode = 'WEIGHT';
      qStep = Number(saleMode.split('_')[1]) / 1000;
    }
    setBusy(true);
    try {
      await api.updateProductCatalog(product.id, {
        catalogName: product.catalogName,
        catalogCategory: product.catalogCategory,
        description: product.description,
        catalogVisible: product.catalogVisible,
        saleMode: sMode,
        quantityStep: qStep,
        stockOverride: finalStock === '' ? null : Number(finalStock)
      });
      if (onChanged) await onChanged();
    } catch (e) {
      if (setAssimilateMsg) setAssimilateMsg(e.message || 'Erro ao salvar estoque manual');
    } finally {
      setBusy(false);
    }
  }

  if (!sourceIsKg) {
    return <div className="inline-stock-readonly">{product.stock} {product.unit}</div>;
  }

  return (
    <div className={`inline-stock-editor ${busy ? 'busy' : ''}`}>
      <select 
        value={saleMode} 
        onChange={e => handleSaleModeChange(e.target.value)}
        disabled={busy}
        className="inline-sale-mode-select"
        title="Forma de Venda"
      >
        <option value="AUTO">ERP</option>
        <option value="UNIT">Por Un</option>
        <option value="WEIGHT_1000">Por 1kg</option>
        <option value="WEIGHT_500">Por 500g</option>
        <option value="WEIGHT_100">Por 100g</option>
      </select>
      
      {saleMode !== 'UNIT' && (
        <div className="inline-stock-inputs">
          <input 
            type="number" 
            min="0"
            step={stockUnit === 'G' ? '1' : '0.001'}
            placeholder={stockUnit === 'G' ? `${(product.sourceStock ?? product.stock) * 1000}` : `${product.sourceStock ?? product.stock}`}
            value={stockOverride === '' ? '' : (stockUnit === 'G' ? Number(stockOverride) * 1000 : stockOverride)}
            onChange={e => setStockOverride(e.target.value === '' ? '' : (stockUnit === 'G' ? Number(e.target.value) / 1000 : e.target.value))}
            onBlur={e => saveStock(e.target.value)}
            disabled={busy}
            className="inline-stock-input"
            title="Estoque manual (deixe vazio para usar a integração)"
          />
          <select 
            value={stockUnit} 
            onChange={e => {
              setStockUnit(e.target.value);
            }}
            disabled={busy}
            className="inline-stock-unit-select"
            title="Unidade de entrada"
          >
            <option value="KG">kg</option>
            <option value="G">g</option>
          </select>
        </div>
      )}
    </div>
  );
}

function InlineNameEditor({ product, api, onChanged, setAssimilateMsg }) {
  const [name, setName] = useState(product.catalogName || product.name);
  const [busy, setBusy] = useState(false);

  async function handleBlur() {
    const trimmed = name.trim();
    if (trimmed === (product.catalogName || product.name)) return;
    
    setBusy(true);
    try {
      await api.updateProductCatalog(product.id, {
        catalogName: trimmed === product.sourceName ? '' : trimmed,
        catalogCategory: product.catalogCategory,
        description: product.description,
        catalogVisible: product.catalogVisible,
        saleMode: product.saleMode,
        quantityStep: product.quantityStep,
        stockOverride: product.stockOverride
      });
      if (onChanged) await onChanged();
    } catch (e) {
      if (setAssimilateMsg) setAssimilateMsg(e.message || 'Erro ao salvar o nome');
      setName(product.catalogName || product.name);
    } finally {
      setBusy(false);
    }
  }

  return (
    <input
      type="text"
      className={`inline-name-input ${busy ? 'busy' : ''}`}
      value={name}
      onChange={e => setName(e.target.value)}
      onBlur={handleBlur}
      disabled={busy}
      placeholder={product.sourceName}
      title="Clique para editar o nome"
    />
  );
}

function ProductEditor({ product, categories, onClose, onSaved }) {
  const sourceIsKg = String(product.sourceUnit || product.unit || '').toUpperCase() === 'KG';
  const [form, setForm] = useState({
    catalogName: product.catalogName || product.name,
    catalogCategory: product.catalogCategory || product.category,
    description: product.description || '',
    catalogVisible: product.catalogVisible,
    saleMode: sourceIsKg ? (product.saleMode || 'AUTO') : (product.saleMode === 'UNIT' ? 'UNIT' : 'AUTO'),
    quantityStepGrams: Math.round((product.quantityStep || 0.1) * 1000),
    stockOverride: product.stockOverride ?? '',
    stockUnit: 'KG'
  });
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const preview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : product.image, [imageFile, product.image]);

  useEffect(() => () => {
    if (imageFile && preview) URL.revokeObjectURL(preview);
  }, [imageFile, preview]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.updateProductCatalog(product.id, {
        ...form,
        quantityStep: Number(form.quantityStepGrams) / 1000,
        stockOverride: form.stockOverride === '' ? null : Number(form.stockOverride)
      });
      if (imageFile) await api.uploadProductImage(product.id, await prepareCatalogImage(imageFile));
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="catalog-editor-backdrop" onMouseDown={event => event.target === event.currentTarget && !saving && onClose()}>
      <form className="catalog-editor catalog-edit-modal" onSubmit={submit}>
        <header className="catalog-edit-head">
          <div>
            <div className="photo-head-tags">
              <span className="photo-queue-pill"><Pencil size={12} /> Edicao da Vitrine</span>
              <span className="photo-cat-badge">{product.category}</span>
            </div>
            <h2>Personalizar Produto</h2>
            <div className="photo-head-sub">
              <span>Original ERP:</span>
              <strong>{product.sourceName || product.name}</strong>
              <span className="bullet">·</span>
              <span>EAN:</span>
              <code>{product.barcode || product.sku || 'Sem codigo'}</code>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={saving} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="catalog-editor-body">
          <section className="product-image-editor">
            <div className="product-image-preview" style={{ backgroundImage: preview ? `url(${preview})` : 'none' }}>
              {!preview && <ImagePlus size={36} />}
            </div>
            <label className="image-upload-button">
              <ImagePlus size={16} /> Trocar imagem
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={event => setImageFile(event.target.files?.[0] || null)} />
            </label>
            <small>A imagem sera otimizada em WebP antes do envio. Recomendado: fundo neutro e produto centralizado.</small>
          </section>

          <section className="catalog-fields">
            <label>
              <span>Nome exibido no aplicativo</span>
              <input value={form.catalogName} onChange={event => setForm(current => ({ ...current, catalogName: event.target.value }))} maxLength="160" required />
            </label>
            
            <label>
              <span>Categoria</span>
              <input list="catalog-category-options" value={form.catalogCategory} onChange={event => setForm(current => ({ ...current, catalogCategory: event.target.value }))} maxLength="100" placeholder="Ex.: Carnes, Frutas ou Padaria" required />
            </label>
            <datalist id="catalog-category-options">
              {categories.map(category => <option value={category.name} key={category.name} />)}
            </datalist>

            <label>
              <span>Descricao do produto</span>
              <textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} maxLength="1000" placeholder="Detalhes, corte, origem, peso ou observacoes para o cliente." rows={3} />
            </label>

            <div className="sale-rule-grid">
              <label>
                <span>Forma de venda</span>
                <select value={form.saleMode} onChange={event => setForm(current => ({ ...current, saleMode: event.target.value }))}>
                  <option value="AUTO">Automatica pela unidade do ERP</option>
                  <option value="UNIT">Forcar venda por unidade</option>
                  {sourceIsKg && <option value="WEIGHT">Por peso (kg)</option>}
                </select>
              </label>

              <label>
                <span>Fracao de cada adicao (gramas)</span>
                <input type="number" min="1" max="100000" step="1" value={form.quantityStepGrams} disabled={!sourceIsKg || form.saleMode === 'UNIT'} onChange={event => setForm(current => ({ ...current, quantityStepGrams: event.target.value }))} required={sourceIsKg && form.saleMode !== 'UNIT'} />
              </label>

              {sourceIsKg && form.saleMode !== 'UNIT' && (
                <label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span>Estoque manual disponivel</span>
                    <select value={form.stockUnit} onChange={e => setForm(current => ({ ...current, stockUnit: e.target.value }))} style={{ width: 'auto', padding: '2px 8px', fontSize: 12, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                      <option value="KG">Quilos (kg)</option>
                      <option value="G">Gramas (g)</option>
                    </select>
                  </div>
                  <input 
                    type="number" 
                    min="0" 
                    step={form.stockUnit === 'G' ? "1" : "0.001"} 
                    value={form.stockOverride === '' ? '' : (form.stockUnit === 'G' ? Number(form.stockOverride) * 1000 : form.stockOverride)} 
                    onChange={e => {
                      const val = e.target.value;
                      const override = val === '' ? '' : (form.stockUnit === 'G' ? Number(val) / 1000 : val);
                      setForm(current => ({ ...current, stockOverride: override }));
                    }} 
                    placeholder={form.stockUnit === 'G' ? `Integracao: ${(product.sourceStock ?? product.stock) * 1000} g` : `Integracao: ${product.sourceStock ?? product.stock} kg`} 
                  />
                  <small>Deixe vazio para voltar a usar o estoque da integracao.</small>
                </label>
              )}
            </div>

            <div className="commercial-lock">
              <div><span>Preco da integracao</span><strong>{money(product.price)} / {product.sourceUnit || product.unit}</strong></div>
              <div><span>Estoque atual</span><strong>{product.stock} {product.unit}</strong></div>
            </div>

            <label className="visibility-toggle">
              <input type="checkbox" checked={form.catalogVisible} onChange={event => setForm(current => ({ ...current, catalogVisible: event.target.checked }))} />
              {form.catalogVisible ? <Eye size={18} /> : <EyeOff size={18} />}
              <span>
                <strong>{form.catalogVisible ? 'Visivel no aplicativo' : 'Oculto no aplicativo'}</strong>
                <small>Voce pode ocultar este item sem exclui-lo da integracao.</small>
              </span>
            </label>
          </section>
        </div>

        {error && <div className="form-error" style={{ margin: '0 24px 16px' }}>{error}</div>}

        <footer>
          <button type="button" className="catalog-cancel" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="primary" disabled={saving}>
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar alteracoes'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function CatalogPhotoQueue({
  products,
  index,
  busy,
  previewUrl,
  api,
  onClose,
  onSkip,
  onPickFile,
  onCapture,
  onConfirm,
  onClearPreview,
  onRemoteSaved
}) {
  const current = products[index];
  if (!current) return null;
  const isMulti = products.length > 1;

  const [mode, setMode] = useState('web'); // 'web' | 'manual'
  const [searchQuery, setSearchQuery] = useState(current.name || '');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [savingImageUrl, setSavingImageUrl] = useState(null);

  // Auto-search whenever current product changes
  useEffect(() => {
    const q = current.name || current.barcode || '';
    setSearchQuery(q);
    if (q) {
      triggerSearch(q);
    }
  }, [current.id, current.name]);

  async function triggerSearch(termToSearch) {
    const queryTerm = String(termToSearch != null ? termToSearch : searchQuery).trim();
    if (!queryTerm) return;
    setSearchLoading(true);
    setSearchError('');
    try {
      const data = await api.searchProductWebImages(queryTerm);
      setSearchResults(data.images || []);
    } catch (err) {
      setSearchError(err.message || 'Falha ao buscar imagens na web');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSelectWebImage(item) {
    if (!item?.url || savingImageUrl || busy) return;
    setSavingImageUrl(item.url);
    try {
      const res = await api.saveRemoteProductImage(current.id, item.url);
      if (onRemoteSaved) {
        await onRemoteSaved(res);
      }
    } catch (err) {
      alert(err.message || 'Erro ao baixar e gravar a imagem no sistema');
    } finally {
      setSavingImageUrl(null);
    }
  }

  return (
    <div className="catalog-editor-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && !savingImageUrl && onClose()}>
      <div className="catalog-editor catalog-photo-modal">
        <header className="catalog-photo-head">
          <div className="photo-head-meta">
            <div className="photo-head-tags">
              <span className="photo-queue-pill">
                <Camera size={13} />
                {isMulti ? `Fila de Fotos · ${index + 1} de ${products.length}` : 'Foto do Produto'}
              </span>
              {current.category && <span className="photo-cat-badge">{current.category}</span>}
              {current.hasImage ? <span className="badge-active">Foto Atual Ativa</span> : <span className="badge-missing">Foto Pendente</span>}
            </div>
            <h2 title={current.name}>{current.name}</h2>
            <div className="photo-head-sub">
              <span>EAN / Código:</span>
              <code>{current.barcode || current.sku || 'Sem código'}</code>
              <span className="bullet">·</span>
              <span>Preço:</span>
              <strong>{money(current.price)}</strong>
              <span className="bullet">·</span>
              <span>Estoque:</span>
              <span className={Number(current.stock) > 0 ? 'stock-ok' : 'stock-zero'}>
                {current.stock} {current.unit || 'un'}
              </span>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy || Boolean(savingImageUrl)} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        {isMulti && (
          <div className="photo-queue-progress-bar">
            <div className="photo-queue-progress-fill" style={{ width: `${((index + 1) / products.length) * 100}%` }} />
          </div>
        )}

        {/* Tab Selector */}
        <div className="photo-modal-nav">
          <button
            type="button"
            className={`photo-nav-btn ${mode === 'web' ? 'active' : ''}`}
            onClick={() => setMode('web')}
          >
            <Globe size={15} />
            <span>Buscar no Google / Shopping</span>
            <span className="nav-tag-badge">1 Clique para Salvar</span>
          </button>
          <button
            type="button"
            className={`photo-nav-btn ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            <Upload size={15} />
            <span>Enviar Arquivo / Câmera</span>
          </button>
        </div>

        <div className="catalog-photo-body">
          {mode === 'web' ? (
            <div className="photo-web-search-view">
              <form
                className="photo-search-bar"
                onSubmit={e => {
                  e.preventDefault();
                  triggerSearch(searchQuery);
                }}
              >
                <div className="photo-search-input-wrap">
                  <Search size={16} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Digite o nome do produto ou marca..."
                  />
                  {searchQuery && (
                    <button type="button" className="btn-clear-search" onClick={() => setSearchQuery('')}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button type="submit" className="primary" disabled={searchLoading}>
                  {searchLoading ? 'Buscando...' : 'Buscar Imagens'}
                </button>
              </form>

              {searchError && (
                <div className="photo-search-error">
                  <span>{searchError}</span>
                  <button type="button" onClick={() => triggerSearch(searchQuery)}>Tentar novamente</button>
                </div>
              )}

              {/* Search Results Grid */}
              <div className="photo-web-results-container">
                {searchLoading ? (
                  <div className="photo-web-loading">
                    <RefreshCw size={24} className="spin-anim" />
                    <span>Buscando fotos de <strong>{searchQuery}</strong> no Google e na web...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="photo-web-grid">
                    {searchResults.map((item, idx) => {
                      const isSavingThis = savingImageUrl === item.url;
                      return (
                        <div
                          key={item.url + idx}
                          className={`photo-web-card ${isSavingThis ? 'is-saving' : ''}`}
                          onClick={() => handleSelectWebImage(item)}
                          title={`Clique para salvar: ${item.title}`}
                        >
                          <div className="photo-web-img-frame">
                            <img src={item.thumb || item.url} alt={item.title} loading="lazy" />
                            {isSavingThis && (
                              <div className="photo-card-saving-overlay">
                                <RefreshCw size={20} className="spin-anim" />
                                <span>Gravando no sistema...</span>
                              </div>
                            )}
                            <div className="photo-card-hover-overlay">
                              <span className="btn-use-photo">
                                <Check size={14} /> Usar esta foto
                              </span>
                            </div>
                          </div>
                          <div className="photo-web-card-meta">
                            <span className="photo-web-title" title={item.title}>{item.title}</span>
                            <span className="photo-web-source">{item.source || 'Web'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="photo-web-empty">
                    <ImageOff size={36} />
                    <strong>Nenhuma imagem encontrada para "{searchQuery}"</strong>
                    <p>Tente buscar com palavras-chave mais simples ou pelo código de barras.</p>
                    <div className="photo-web-suggestions">
                      {current.barcode && (
                        <button type="button" onClick={() => { setSearchQuery(current.barcode); triggerSearch(current.barcode); }}>
                          Buscar por EAN: {current.barcode}
                        </button>
                      )}
                      <button type="button" onClick={() => {
                        const simpleName = (current.name || '').split(' ').slice(0, 3).join(' ');
                        setSearchQuery(simpleName);
                        triggerSearch(simpleName);
                      }}>
                        Buscar simplificado: {(current.name || '').split(' ').slice(0, 3).join(' ')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Manual Upload & Camera View */
            <div className="photo-compare-grid">
              {/* Current image card */}
              <div className="photo-card-side">
                <div className="photo-card-label">
                  <span>Foto Atual Cadastrada</span>
                  {current.hasImage ? <span className="badge-active">Ativa no App</span> : <span className="badge-missing">Pendente</span>}
                </div>
                <div className={`photo-display-frame ${current.hasImage ? '' : 'is-empty'}`}>
                  {current.hasImage && current.image ? (
                    <img src={current.image} alt={current.name} />
                  ) : (
                    <div className="no-image-placeholder">
                      <ImageOff size={32} />
                      <span>Nenhuma imagem cadastrada</span>
                      <small>Este item está sem foto no aplicativo</small>
                    </div>
                  )}
                </div>
              </div>

              {/* New upload dropzone / preview card */}
              <div className="photo-card-side">
                <div className="photo-card-label">
                  <span>{previewUrl ? 'Nova Foto Selecionada' : 'Enviar Nova Imagem'}</span>
                  {previewUrl && <span className="badge-pending">Pronta para Salvar</span>}
                </div>
                <div className={`photo-upload-frame ${previewUrl ? 'has-preview' : ''}`}>
                  {previewUrl ? (
                    <div className="photo-preview-wrap">
                      <img src={previewUrl} alt="Prévia da nova foto" />
                      <div className="photo-preview-overlay">
                        <button type="button" className="btn-overlay-change" onClick={onPickFile} disabled={busy}>
                          <Upload size={14} /> Trocar arquivo
                        </button>
                        <button type="button" className="btn-overlay-change" onClick={onCapture} disabled={busy}>
                          <Camera size={14} /> Tirar outra
                        </button>
                        {onClearPreview && (
                          <button type="button" className="btn-overlay-remove" onClick={onClearPreview} disabled={busy} title="Remover prévia">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="photo-dropzone-actions">
                      <div className="dropzone-icon-wrap">
                        <ImagePlus size={32} />
                      </div>
                      <strong>Selecione ou capture uma foto</strong>
                      <p>Recomendado: produto centralizado, fundo claro ou neutro.</p>
                      <div className="dropzone-buttons">
                        <button type="button" className="btn-dropzone-action primary-tint" onClick={onPickFile} disabled={busy}>
                          <Upload size={15} />
                          <span>Escolher Arquivo</span>
                        </button>
                        <button type="button" className="btn-dropzone-action" onClick={onCapture} disabled={busy}>
                          <Camera size={15} />
                          <span>Tirar Foto</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="catalog-photo-footer">
          <div className="footer-left">
            {isMulti ? (
              <button type="button" className="catalog-cancel" disabled={busy || Boolean(savingImageUrl)} onClick={onSkip}>
                Pular este produto
              </button>
            ) : (
              <button type="button" className="catalog-cancel" disabled={busy || Boolean(savingImageUrl)} onClick={onClose}>
                Fechar
              </button>
            )}
          </div>
          <div className="footer-right">
            {mode === 'manual' ? (
              <>
                <button type="button" className="secondary" disabled={busy} onClick={onCapture}>
                  <Camera size={15} /> Tirar foto
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={onPickFile}>
                  <Upload size={15} /> Enviar arquivo
                </button>
                <button
                  type="button"
                  className="primary large-btn"
                  disabled={busy || !previewUrl}
                  onClick={onConfirm}
                >
                  {busy ? 'Salvando...' : previewUrl ? (
                    <>
                      <Check size={16} />
                      {index === products.length - 1 ? 'Salvar foto' : 'Salvar e próximo'}
                    </>
                  ) : 'Selecione uma foto'}
                </button>
              </>
            ) : (
              <span className="photo-footer-hint">
                ✨ Clique em qualquer imagem acima para baixar e salvar diretamente no seu produto.
              </span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function Catalog({ products, categories, query, setQuery, category, setCategory, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(1);
  const [imageFilter, setImageFilter] = useState('all');
  const [assimilateMsg, setAssimilateMsg] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [photoQueue, setPhotoQueue] = useState([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const pageSize = 60;

  const withImage = products.filter(product => product.hasImage).length;
  const withoutImage = products.length - withImage;
  const outOfStock = products.filter(product => Number(product.stock) === 0).length;
  const internalEanCount = products.filter(product => !product.barcode || product.barcode.length < 8 || product.barcode === product.sku).length;
  const filteredProducts = (imageFilter === 'with'
    ? products.filter(product => product.hasImage)
    : imageFilter === 'without'
      ? products.filter(product => !product.hasImage)
      : imageFilter === 'internal_ean'
        ? products.filter(product => !product.barcode || product.barcode.length < 8 || product.barcode === product.sku)
        : imageFilter === 'out_of_stock'
          ? products.filter(product => Number(product.stock) === 0)
          : products
  ).slice().sort((a, b) => (b.hasImage ? 1 : 0) - (a.hasImage ? 1 : 0));
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visibleProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  const visibleIds = visibleProducts.map(product => product.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const selectedProducts = useMemo(
    () => products.filter(product => selectedIds.has(product.id)),
    [products, selectedIds]
  );

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [query, category, imageFilter]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach(id => next.delete(id));
      else visibleIds.forEach(id => next.add(id));
      return next;
    });
  }

  function selectFilteredCategory() {
    setSelectedIds(new Set(filteredProducts.map(product => product.id)));
  }

  function resetPhotoDraft() {
    setPhotoFile(null);
    setPhotoPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function openPhotoQueue(items) {
    const queue = items?.length ? items : selectedProducts;
    if (!queue.length) {
      setAssimilateMsg('Selecione ao menos um produto para tirar ou enviar foto.');
      return;
    }
    resetPhotoDraft();
    setPhotoQueue(queue);
    setPhotoIndex(0);
  }

  function closePhotoQueue() {
    resetPhotoDraft();
    setPhotoQueue([]);
    setPhotoIndex(0);
    setPhotoBusy(false);
  }

  function handlePhotoFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setAssimilateMsg('Selecione um arquivo de imagem valido.');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function confirmPhotoForCurrent() {
    const current = photoQueue[photoIndex];
    if (!current || !photoFile) return;
    setPhotoBusy(true);
    try {
      await api.uploadProductImage(current.id, await prepareCatalogImage(photoFile));
      const isLast = photoIndex >= photoQueue.length - 1;
      if (isLast) {
        setAssimilateMsg(`Fotos salvas para ${photoQueue.length} produto(s).`);
        closePhotoQueue();
        setSelectedIds(new Set());
        if (onChanged) await onChanged();
      } else {
        resetPhotoDraft();
        setPhotoIndex(photoIndex + 1);
      }
    } catch (error) {
      setAssimilateMsg(error.message || 'Falha ao salvar a foto');
    } finally {
      setPhotoBusy(false);
    }
  }

  function skipPhotoCurrent() {
    if (photoIndex >= photoQueue.length - 1) {
      closePhotoQueue();
      if (onChanged) onChanged();
      return;
    }
    resetPhotoDraft();
    setPhotoIndex(photoIndex + 1);
  }

  async function clearSelectedImages() {
    if (!selectedProducts.length) {
      setAssimilateMsg('Selecione produtos para remover a foto.');
      return;
    }
    if (!window.confirm(`Remover a foto de ${selectedProducts.length} produto(s) selecionado(s)?`)) return;
    try {
      const result = await api.clearProductImages(selectedProducts.map(product => product.id));
      setAssimilateMsg(`Removidas ${result.removedImages || 0} foto(s) dos selecionados.`);
      setSelectedIds(new Set());
      if (onChanged) await onChanged();
    } catch (error) {
      setAssimilateMsg(error.message || 'Falha ao remover fotos');
    }
  }

  async function handleBulkSaleMode(option) {
    if (!option || !selectedProducts.length) return;
    let saleMode = 'AUTO';
    let quantityStepGrams = 1000;
    if (option === 'UNIT') {
      saleMode = 'UNIT';
    } else if (option.startsWith('WEIGHT_')) {
      saleMode = 'WEIGHT';
      quantityStepGrams = Number(option.split('_')[1]);
    }
    
    try {
      setAssimilateMsg('Atualizando forma de venda...');
      const result = await api.updateBulkCatalog(selectedProducts.map(p => p.id), saleMode, quantityStepGrams);
      setAssimilateMsg(`A forma de venda de ${result.updated || selectedProducts.length} produto(s) foi atualizada.`);
      setSelectedIds(new Set());
      if (onChanged) await onChanged();
    } catch (error) {
      setAssimilateMsg(error.message || 'Falha ao alterar forma de venda');
    }
  }

  return (
    <section className="panel catalog-panel">
      <div className="panel-heading catalog-heading">
        <div>
          <p className="overline">Vitrine e estoque</p>
          <h2>Catalogo da loja</h2>
          <p className="catalog-intro">Selecione um ou varios produtos para tirar foto, enviar arquivo ou editar. Preco e estoque continuam sincronizados.</p>
        </div>
        <span className="counter">{filteredProducts.length}</span>
      </div>

      <div className="catalog-toolbar">
        <label className="search-box"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome, SKU, EAN ou categoria" /></label>
        <label className="category-select"><Tags size={17} /><select value={category} onChange={event => setCategory(event.target.value)}><option value="Todos">Todas as categorias</option>{categories.map(item => <option value={item.name} key={item.name}>{item.name} ({item.total})</option>)}</select></label>
      </div>

      {assimilateMsg && <div className="catalog-sync-note"><Images size={16} /><span>{assimilateMsg}</span></div>}

      <div className="image-filter-bar">
        <span>Fotos do catalogo</span>
        <div>
          <button className={imageFilter === 'all' ? 'active' : ''} onClick={() => setImageFilter('all')}>Todos <b>{products.length}</b></button>
          <button className={imageFilter === 'with' ? 'active' : ''} onClick={() => setImageFilter('with')}><Images size={14} /> Com imagem <b>{withImage}</b></button>
          <button className={imageFilter === 'without' ? 'active warning' : 'warning'} onClick={() => setImageFilter('without')}><ImageOff size={14} /> Sem imagem <b>{withoutImage}</b></button>
          <button className={imageFilter === 'internal_ean' ? 'active' : ''} onClick={() => setImageFilter('internal_ean')}><Tags size={14} /> EAN da empresa <b>{internalEanCount}</b></button>
          <button className={imageFilter === 'out_of_stock' ? 'active danger' : 'danger'} onClick={() => setImageFilter('out_of_stock')}><Boxes size={14} /> Estoque zerado <b>{outOfStock}</b></button>
        </div>
      </div>

      <div className="category-chips">
        <button className={category === 'Todos' ? 'active' : ''} onClick={() => setCategory('Todos')}>Todas</button>
        {categories.map(item => <button className={category === item.name ? 'active' : ''} onClick={() => setCategory(item.name)} key={item.name}>{item.name}<span>{item.total}</span></button>)}
      </div>

      <div className="catalog-select-bar">
        <button type="button" className="catalog-select-btn" onClick={toggleSelectAllVisible}>
          {allVisibleSelected ? <CheckSquare size={15} /> : <Square size={15} />}
          {allVisibleSelected ? 'Desmarcar pagina' : 'Marcar pagina'}
        </button>
        <button type="button" className="catalog-select-btn" onClick={selectFilteredCategory}>
          <CheckSquare size={15} /> Selecionar filtro ({filteredProducts.length})
        </button>
        <button type="button" className="catalog-select-btn" disabled={!selectedIds.size} onClick={() => setSelectedIds(new Set())}>
          Limpar selecao
        </button>
        <span className="catalog-select-count">{selectedIds.size} selecionado(s)</span>
      </div>

      {selectedIds.size > 0 && (
        <div className="catalog-bulk-bar">
          <div>
            <strong>{selectedIds.size} produto(s) selecionado(s)</strong>
            <span>Acoes em massa para a vitrine</span>
          </div>
          <div className="catalog-bulk-actions">
            <button type="button" className="primary" onClick={() => openPhotoQueue()}>
              <Camera size={15} /> Tirar / enviar fotos
            </button>
            <button type="button" className="secondary" onClick={clearSelectedImages}>
              <Trash2 size={15} /> Remover fotos
            </button>
            <select
              className="bulk-select-action"
              value=""
              onChange={e => handleBulkSaleMode(e.target.value)}
              style={{ marginLeft: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <option value="" disabled>Alterar forma de venda...</option>
              <option value="AUTO">Automático pelo ERP</option>
              <option value="UNIT">Forçar venda por Unidade</option>
              <option value="WEIGHT_1000">Por Peso (de 1 em 1 kg)</option>
              <option value="WEIGHT_500">Por Peso (de 500 em 500 g)</option>
              <option value="WEIGHT_100">Por Peso (de 100 em 100 g)</option>
            </select>
          </div>
        </div>
      )}

      <div className="catalog-sync-note">
        <RefreshCw size={16} />
        <span><strong>Sincronizacao protegida</strong> Preco, promocao e quantidade vêm da API. Foto, categoria e texto personalizados permanecem salvos.</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="catalog-check-col">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  aria-label="Selecionar todos da pagina"
                />
              </th>
              <th>Produto</th>
              <th>SKU / EAN</th>
              <th>Categoria</th>
              <th>Preco</th>
              <th>Estoque</th>
              <th>Vitrine</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map(product => {
              let statusClass = 'stock-status';
              let statusText = 'Publicado';
              let statusIcon = <Eye size={14} />;
              if (!product.catalogVisible) {
                statusClass = 'stock-status hidden';
                statusText = 'Oculto';
                statusIcon = <EyeOff size={14} />;
              } else if (Number(product.stock) === 0) {
                statusClass = 'stock-status low';
                statusText = 'Estoque zerado';
                statusIcon = <EyeOff size={14} />;
              }
              const selected = selectedIds.has(product.id);
              return (
                <tr key={product.id} className={`${!product.catalogVisible ? 'product-hidden' : ''} ${selected ? 'catalog-row-selected' : ''}`}>
                  <td className="catalog-check-col">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelect(product.id)}
                      aria-label={`Selecionar ${product.name}`}
                    />
                  </td>
                  <td>
                    <div className="product-cell">
                      <button
                        type="button"
                        className={`product-thumb ${product.hasImage ? '' : 'missing'} catalog-thumb-btn`}
                        style={{ backgroundImage: product.hasImage && product.image ? `url(${product.image})` : 'none' }}
                        onClick={() => openPhotoQueue([product])}
                        title="Tirar ou enviar foto"
                      >
                        {!product.hasImage && <ImageOff size={17} />}
                      </button>
                      <div>
                        <InlineNameEditor product={product} api={api} onChanged={onChanged} setAssimilateMsg={setAssimilateMsg} />
                        {product.catalogName && <small>Nome personalizado</small>}
                        {!product.hasImage && <small className="missing-image-label">Imagem pendente</small>}
                      </div>
                    </div>
                  </td>
                  <td><code>{product.barcode || product.sku}</code></td>
                  <td><span className="category-pill">{product.category}</span></td>
                  <td><strong>{money(product.price)}</strong></td>
                  <td><InlineStockEditor product={product} api={api} onChanged={onChanged} setAssimilateMsg={setAssimilateMsg} /></td>
                  <td><span className={statusClass}>{statusIcon}{statusText}</span></td>
                  <td>
                    <div className="catalog-row-actions">
                      <button type="button" className="edit-product-button" onClick={() => openPhotoQueue([product])}>
                        <Camera size={15} /> Foto
                      </button>
                      <button type="button" className="edit-product-button" onClick={() => setEditing(product)}>
                        <Pencil size={15} /> Editar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredProducts.length > pageSize && (
        <div className="catalog-pagination">
          <span>Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredProducts.length)} de {filteredProducts.length}</span>
          <div>
            <button disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Anterior</button>
            <strong>{page} / {totalPages}</strong>
            <button disabled={page === totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>Proxima</button>
          </div>
        </div>
      )}

      {!filteredProducts.length && (
        <EmptyState
          title={imageFilter === 'without' ? 'Todos os produtos possuem imagem' : imageFilter === 'out_of_stock' ? 'Nenhum produto com estoque zerado' : 'Nenhum produto encontrado'}
          text={imageFilter === 'without' ? 'Nao existem pendencias de foto neste filtro.' : imageFilter === 'out_of_stock' ? 'Todos os produtos ativos possuem estoque disponível.' : 'Tente outro nome, codigo ou categoria.'}
        />
      )}

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden onChange={handlePhotoFile} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handlePhotoFile} />

      {editing && <ProductEditor product={editing} categories={categories} onClose={() => setEditing(null)} onSaved={onChanged} />}
      {photoQueue.length > 0 && (
        <CatalogPhotoQueue
          products={photoQueue}
          index={photoIndex}
          busy={photoBusy}
          previewUrl={photoPreview}
          api={api}
          onClose={closePhotoQueue}
          onSkip={skipPhotoCurrent}
          onPickFile={() => fileInputRef.current?.click()}
          onCapture={() => cameraInputRef.current?.click()}
          onConfirm={confirmPhotoForCurrent}
          onClearPreview={resetPhotoDraft}
          onRemoteSaved={async () => {
            if (onChanged) await onChanged();
            if (photoIndex < photoQueue.length - 1) {
              setPhotoIndex(curr => curr + 1);
              resetPhotoDraft();
            } else {
              setAssimilateMsg('Foto gravada e armazenada com sucesso no sistema!');
              closePhotoQueue();
            }
          }}
        />
      )}
    </section>
  );
}

function Delivery() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const startStr = new Date(`${date}T00:00:00-03:00`).toISOString();
        const endStr = new Date(`${date}T23:59:59.999-03:00`).toISOString();
        const data = await api.reportDeliveries(startStr, endStr);
        if (active) setDeliveries(data);
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [date]);

  const totalValue = deliveries.reduce((sum, d) => sum + (Number(d.subtotal) || 0), 0);
  const totalFees = deliveries.reduce((sum, d) => sum + (Number(d.deliveryFee) || 0), 0);

  return (
    <section className="panel deliveries-report" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-heading catalog-heading">
        <div>
          <p className="overline">Fechamento do Motoboy</p>
          <h2>Relatorio de Entregas</h2>
        </div>
        <div className="catalog-toolbar" style={{ border: 'none', padding: 0 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontSize: 14 }} />
        </div>
      </div>
      
      {error && <div style={{ color: 'red', margin: '0 30px 20px' }}>{error}</div>}
      
      <div className="report-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 30, padding: '0 30px' }}>
        <div className="metric-card" style={{ background: 'var(--surface-sunken)', padding: 20, borderRadius: 12 }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 5 }}>Entregas concluidas</p>
          <strong style={{ fontSize: 24, display: 'block' }}>{deliveries.length}</strong>
        </div>
        <div className="metric-card" style={{ background: 'var(--surface-sunken)', padding: 20, borderRadius: 12 }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 5 }}>Valor das mercadorias</p>
          <strong style={{ fontSize: 24, color: 'var(--primary)', display: 'block' }}>{money(totalValue)}</strong>
        </div>
        <div className="metric-card" style={{ background: 'var(--surface-sunken)', padding: 20, borderRadius: 12 }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 5 }}>Taxas de entrega (Motoboy)</p>
          <strong style={{ fontSize: 24, display: 'block' }}>{money(totalFees)}</strong>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Horario</th>
              <th>Cliente</th>
              <th>Endereco</th>
              <th>Mercadorias</th>
              <th>Taxa de entrega</th>
            </tr>
          </thead>
          <tbody>
            {loading && deliveries.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40 }}>Carregando...</td></tr>
            ) : deliveries.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Nenhuma entrega finalizada nesta data.</td></tr>
            ) : (
              deliveries.map(d => (
                <tr key={d.id}>
                  <td><strong>#{d.id.slice(-8).toUpperCase()}</strong></td>
                  <td>{new Date(d.updatedAt || d.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{d.customer?.name}</td>
                  <td className="address-cell" style={{ maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.customer?.address}
                  </td>
                  <td>{money(d.subtotal)}</td>
                  <td><strong>{money(d.deliveryFee)}</strong></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Customers({ customers, query, setQuery }) {
  return <section className="panel customers-panel">
    <div className="panel-heading catalog-heading"><div><p className="overline">Relacionamento</p><h2>Base de clientes</h2></div><span className="counter">{customers.length}</span></div>
    <div className="catalog-toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome ou telefone" /></label><span className="sync-time"><UsersRound size={15} /> Compras registradas pela loja</span></div>
    <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Compras</th><th>Valor acumulado</th><th>Ultimo pedido</th><th>Endereco mais recente</th></tr></thead><tbody>{customers.map(customer => <tr key={customer.phone}><td><div className="customer-cell"><div>{customer.name.slice(0, 1).toUpperCase()}</div><strong>{customer.name}</strong></div></td><td>{customer.phone}</td><td><b>{customer.orders}</b></td><td><strong>{money(customer.totalSpent)}</strong></td><td>{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString('pt-BR') : '-'}</td><td className="address-cell">{customer.address || 'Retirada / endereco nao informado'}</td></tr>)}</tbody></table></div>
    {!customers.length && <EmptyState title="Nenhum cliente encontrado" text="Os clientes aparecem aqui depois da primeira compra." />}
  </section>;
}

function Reports({ report, devices }) {
  const today = report?.today || { orders: 0, revenue: 0, averageTicket: 0, cancellations: 0 };
  const periods = report?.periods || { today, week: {}, month: {}, year: {} };
  const days = report?.days || [];
  const months = report?.months || [];
  const maxRevenue = Math.max(...days.map(day => Number(day.revenue)), 1);
  const maxMonthRevenue = Math.max(...months.map(month => Number(month.revenue)), 1);
  const periodCards = [
    ['Hoje', periods.today],
    ['Esta semana', periods.week],
    ['Este mês', periods.month],
    ['Este ano', periods.year]
  ];
  const quantity = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(value || 0));
  return (
    <div className="reports-grid">
      <section className="report-hero">
        <div>
          <p className="overline">Inteligência da loja</p>
          <h2>O que vende, quanto rende e quando acontece.</h2>
          <p>Acompanhe faturamento, ticket médio, produtos mais vendidos e uso do aplicativo em tempo real.</p>
        </div>
        <div className="report-hero-value">
          <span>Faturamento hoje</span>
          <strong>{money(periods.today?.revenue)}</strong>
          <small>{periods.today?.orders || 0} pedidos válidos</small>
        </div>
      </section>

      <section className="period-grid">
        {periodCards.map(([label, value]) => (
          <article className="period-card" key={label}>
            <span>{label}</span>
            <strong>{money(value?.revenue)}</strong>
            <div>
              <small>{value?.orders || 0} pedidos</small>
              <small>Ticket {money(value?.averageTicket)}</small>
              <small>Média/dia {money(value?.averagePerDay)}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="report-device-grid">
        <StatCard icon={Smartphone} label="Aparelhos instalados" value={devices?.installedDevices || 0} detail={`${devices?.seenToday || 0} vistos nas últimas 24h`} tone="blue" />
        <StatCard icon={Zap} label="Aparelhos online" value={devices?.onlineDevices || 0} detail={`ativos nos últimos ${devices?.onlineWindowMinutes || 15} min`} tone="green" />
        <StatCard icon={X} label="Cancelamentos hoje" value={today.cancellations || 0} detail="pedidos cancelados no dia" tone="red" />
      </section>

      {/* Row 1: Charts Row (Daily Bar Chart + Monthly Progress Chart) */}
      <section className="panel sales-chart">
        <div className="panel-heading">
          <div>
            <p className="overline">Últimos 7 dias</p>
            <h2>Faturamento diário</h2>
          </div>
          <span className="sync-time">Pedidos não cancelados</span>
        </div>
        <div className="bar-chart">
          {days.map(day => (
            <div className="bar-column" key={day.date}>
              <strong>{day.revenue ? money(day.revenue) : '-'}</strong>
              <div className="bar-track">
                <i style={{ height: `${Math.max(6, (Number(day.revenue) / maxRevenue) * 100)}%` }} />
              </div>
              <span>{day.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel annual-chart">
        <div className="panel-heading">
          <div>
            <p className="overline">Últimos 12 meses</p>
            <h2>Evolução mensal</h2>
          </div>
          <span className="sync-time">Histórico anual</span>
        </div>
        <div className="month-chart">
          {months.map(item => (
            <div className="month-row" key={item.month}>
              <span>{new Date(`${item.month}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</span>
              <div>
                <i style={{ width: `${Math.max(item.revenue ? 4 : 0, (Number(item.revenue) / maxMonthRevenue) * 100)}%` }} />
              </div>
              <strong>{money(item.revenue)}</strong>
            </div>
          ))}
        </div>
      </section>

      {/* Row 2: Rankings Row (Top Selling Products + Top Customers) */}
      <section className="panel top-products">
        <div className="panel-heading">
          <div>
            <p className="overline">Últimos 30 dias</p>
            <h2>Produtos que mais vendem</h2>
          </div>
          <span className="counter">{(report?.topProducts || []).length}</span>
        </div>
        <div className="product-ranking">
          {(report?.topProducts || []).map((product, index) => (
            <div className="product-ranking-row" key={product.productId}>
              <span className="ranking">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{product.name}</strong>
                <small>{quantity(product.quantity)} {product.unit} · {product.orders} pedidos</small>
              </div>
              <strong>{money(product.revenue)}</strong>
            </div>
          ))}
        </div>
        {!report?.topProducts?.length && <EmptyState title="Ainda sem vendas" text="Os produtos mais vendidos aparecerão aqui." />}
      </section>

      <section className="panel top-customers">
        <div className="panel-heading">
          <div>
            <p className="overline">Recorrência</p>
            <h2>Melhores clientes</h2>
          </div>
          <span className="counter">{(report?.topCustomers || []).length}</span>
        </div>
        <div className="top-customers-list">
          {(report?.topCustomers || []).map((customer, index) => (
            <div className="report-customer-row" key={customer.phone}>
              <span className="ranking">{String(index + 1).padStart(2, '0')}</span>
              <div className="customer-cell">
                <div>{customer.name.slice(0, 1)}</div>
                <strong>{customer.name}</strong>
              </div>
              <span>{customer.orders} compras</span>
              <strong>{money(customer.totalSpent)}</strong>
            </div>
          ))}
        </div>
        {!report?.topCustomers?.length && <EmptyState title="Ainda sem dados" text="O relatório será preenchido conforme os pedidos chegarem." />}
      </section>
    </div>
  );
}

function escapePrint(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function printOrderSlip(order, store) {
  const popup = window.open('', '_blank', 'width=420,height=720');
  if (!popup) return;
  const items = order.items.map(item => `<tr><td>${escapePrint(item.quantity)} ${escapePrint(item.unit)} x ${escapePrint(item.name)}</td><td>${money(item.total)}</td></tr>`).join('');
  popup.document.write(`<!doctype html><html><head><title>Guia ${escapePrint(order.id)}</title><style>@page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;width:72mm;margin:0;color:#000;font-size:12px}.center{text-align:center}.line{border-top:1px dashed #000;margin:9px 0}h1{font-size:17px;margin:0 0 4px}h2{font-size:15px;margin:0}small{font-size:10px}table{width:100%;border-collapse:collapse}td{padding:6px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}.total{font-size:15px;font-weight:700;display:flex;justify-content:space-between}.note{font-weight:700}.cut{margin-top:18px;border-top:1px dashed #000;padding-top:8px;font-size:10px}</style></head><body><div class="center"><h1>${escapePrint(store?.name || 'AiMerc')}</h1><small>GUIA DE SEPARACAO</small><h2>#${escapePrint(order.id)}</h2><small>${new Date(order.createdAt).toLocaleString('pt-BR')}</small></div><div class="line"></div><b>${escapePrint(order.customer.name)}</b><br><small>${escapePrint(order.customer.phone)}</small><div class="line"></div><b>${order.fulfillmentType === 'DELIVERY' ? 'ENTREGA' : 'RETIRADA'}</b><br><small>${escapePrint(order.customer.address || 'Retirada na loja')}</small>${order.customer.reference ? `<br><small>Referencia: ${escapePrint(order.customer.reference)}</small>` : ''}<div class="line"></div><table>${items}</table><div class="line"></div><div class="total"><span>Total</span><span>${money(order.total)}</span></div><small>Pagamento: ${escapePrint(order.paymentMethod === 'CASH' ? 'Dinheiro' : order.paymentMethod === 'PIX' ? 'Pix' : 'Cartao na entrega')}</small>${order.notes ? `<div class="line"></div><div class="note">OBS: ${escapePrint(order.notes)}</div>` : ''}<div class="cut">Separador: ____________________<br>Conferente: ____________________</div></body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

const emptyBanner = { eyebrow: '', title: '', subtitle: '', image: '', active: true, position: 0 };

async function prepareBannerImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Selecione uma imagem valida');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 600;
  const context = canvas.getContext('2d');
  const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(new File([blob], 'banner.webp', { type: 'image/webp' })) : reject(new Error('Nao foi possivel preparar a imagem')),
    'image/webp',
    0.82
  ));
}

function PushCampaigns({ campaigns, onCreate, onSend, onDelete }) {
  const [form, setForm] = useState({ title: '', body: '', audience: 'ALL_CUSTOMERS', status: 'DRAFT', scheduledAt: '' });
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  async function submit(event) { event.preventDefault(); setSaving(true); try { await onCreate({ ...form, scheduledAt: form.status === 'SCHEDULED' ? form.scheduledAt : null }); setForm({ title: '', body: '', audience: 'ALL_CUSTOMERS', status: 'DRAFT', scheduledAt: '' }); } finally { setSaving(false); } }
  async function send(id) { setSendingId(id); try { await onSend(id); } finally { setSendingId(null); } }
  const statusText = campaign => campaign.status === 'SENT' ? `Enviada para ${campaign.successCount} aparelho(s)` : campaign.status === 'PARTIAL' ? `${campaign.successCount} enviada(s), ${campaign.failureCount} falha(s)` : campaign.status === 'FAILED' ? `Falhou: ${campaign.sendError || 'verifique o Firebase'}` : campaign.status === 'SCHEDULED' ? `Agendada ${new Date(campaign.scheduledAt).toLocaleString('pt-BR')}` : 'Rascunho';
  return <section className="panel push-panel"><div className="panel-heading"><div><p className="overline">Relacionamento</p><h2>Campanhas de push</h2></div><Bell size={19} /></div><p className="panel-description">Salve para revisar, dispare imediatamente ou programe o horario. O Firebase entrega a notificacao aos celulares habilitados.</p>
  <form className="settings-form" onSubmit={submit}>
    <div className="settings-form-row">
      <label className="mockup-field">
        <span className="mockup-label">Título da notificação</span>
        <div className="mockup-input-box">
          <input required maxLength="80" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Oferta relâmpago hoje" />
        </div>
      </label>
      <label className="mockup-field">
        <span className="mockup-label">Mensagem</span>
        <div className="mockup-input-box">
          <input required maxLength="180" value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} placeholder="Ex.: Frete grátis acima de R$ 80 até as 18h." />
        </div>
      </label>
    </div>
    <div className="settings-form-row">
      <label className="mockup-field">
        <span className="mockup-label">Público alvo</span>
        <div className="mockup-select-box">
          <select value={form.audience} onChange={event => setForm({ ...form, audience: event.target.value })}>
            <option value="ALL_CUSTOMERS">Todos os clientes</option>
            <option value="RECENT_CUSTOMERS">Clientes recentes</option>
            <option value="INACTIVE_CUSTOMERS">Clientes inativos</option>
          </select>
          <ChevronDown size={15} className="select-chevron" />
        </div>
      </label>
      <label className="mockup-field">
        <span className="mockup-label">Ação / Status</span>
        <div className="mockup-select-box">
          <select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>
            <option value="DRAFT">Salvar para revisar</option>
            <option value="SCHEDULED">Agendar envio</option>
          </select>
          <ChevronDown size={15} className="select-chevron" />
        </div>
      </label>
    </div>
    {form.status === 'SCHEDULED' && (
      <label className="mockup-field">
        <span className="mockup-label">Data e hora do envio</span>
        <div className="mockup-input-box" style={{ width: '220px' }}>
          <input type="datetime-local" value={form.scheduledAt} onChange={event => setForm({ ...form, scheduledAt: event.target.value })} required />
        </div>
      </label>
    )}
    <button className="primary large btn-forest-submit" disabled={saving} style={{ marginTop: '16px' }}><Bell size={17} />{saving ? 'Salvando...' : 'Salvar campanha'}</button>
  </form>
  <div className="push-list">{campaigns.map(campaign => <div className={`push-row push-${campaign.status.toLowerCase()}`} key={campaign.id}><div><strong>{campaign.title}</strong><span>{campaign.body}</span><small>{campaign.audience === 'ALL_CUSTOMERS' ? 'Todos os clientes' : campaign.audience === 'RECENT_CUSTOMERS' ? 'Clientes recentes' : 'Clientes inativos'} · {statusText(campaign)}</small></div><div className="push-actions">{campaign.status !== 'SENT' && <button className="send-button" disabled={sendingId === campaign.id} onClick={() => send(campaign.id)}><Bell size={15} />{sendingId === campaign.id ? 'Enviando...' : 'Disparar agora'}</button>}<button className="danger-button" onClick={() => onDelete(campaign.id)}><Trash2 size={15} /> Excluir</button></div></div>)}{!campaigns.length && <p className="empty-push">Nenhuma campanha criada ainda.</p>}</div></section>;
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
      <form className="settings-form automation-form" onSubmit={submit}>
        <div className="template-picker">
          {Object.keys(automationTemplates).map(type => (
            <button type="button" className={`template-pill ${form.triggerType === type ? 'active' : ''}`} onClick={() => applyTemplate(type)} key={type}>
              {triggerLabels[type]}
            </button>
          ))}
        </div>
        <div className="settings-form-row">
          <label className="mockup-field">
            <span className="mockup-label">Nome do programa (interno)</span>
            <div className="mockup-input-box">
              <input required maxLength="80" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
            </div>
          </label>
          <label className="mockup-field">
            <span className="mockup-label">Título da notificação</span>
            <div className="mockup-input-box">
              <input required maxLength="80" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
            </div>
          </label>
        </div>
        <label className="mockup-field">
          <span className="mockup-label">Mensagem da notificação</span>
          <textarea className="mockup-textarea" rows="2" required maxLength="180" value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} />
        </label>
        <div className="settings-form-row">
          <label className="mockup-field">
            <span className="mockup-label">Horário de disparo</span>
            <div className="mockup-input-box">
              <input type="time" required value={form.sendTime} onChange={event => setForm({ ...form, sendTime: event.target.value })} />
            </div>
          </label>
          {form.triggerType === 'WEEKLY' && (
            <label className="mockup-field">
              <span className="mockup-label">Dia da semana</span>
              <div className="mockup-select-box">
                <select value={form.weekday} onChange={event => setForm({ ...form, weekday: Number(event.target.value) })}>
                  {weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}
                </select>
                <ChevronDown size={15} className="select-chevron" />
              </div>
            </label>
          )}
          {form.triggerType === 'INACTIVE_CUSTOMERS' && (
            <label className="mockup-field">
              <span className="mockup-label">Sem comprar há (dias)</span>
              <div className="mockup-input-box">
                <input type="number" min="1" max="365" value={form.inactiveDays} onChange={event => setForm({ ...form, inactiveDays: Number(event.target.value) })} />
              </div>
            </label>
          )}
          {form.triggerType !== 'INACTIVE_CUSTOMERS' && (
            <label className="mockup-field">
              <span className="mockup-label">Público alvo</span>
              <div className="mockup-select-box">
                <select value={form.audience} onChange={event => setForm({ ...form, audience: event.target.value })}>
                  <option value="ALL_CUSTOMERS">Todos os clientes</option>
                  <option value="RECENT_CUSTOMERS">Clientes recentes</option>
                  <option value="INACTIVE_CUSTOMERS">Clientes inativos</option>
                </select>
                <ChevronDown size={15} className="select-chevron" />
              </div>
            </label>
          )}
        </div>
        <button className="primary large btn-forest-submit" disabled={saving} style={{ marginTop: '16px' }}><Zap size={17} />{saving ? 'Criando programa...' : 'Ativar automacão'}</button>
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

const PRINT_AGENT_HEALTH_URL = 'http://127.0.0.1:4177/health';
const PRINT_AGENT_TEST_URL = 'http://127.0.0.1:4177/test-print';

function AutoPrintPanel() {
  const [status, setStatus] = useState({ loading: true, online: false, detail: null, error: '' });
  const [testing, setTesting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const check = useCallback(async () => {
    try {
      const response = await fetch(PRINT_AGENT_HEALTH_URL, { signal: AbortSignal.timeout(2_500) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Agent indisponivel');
      setStatus({ loading: false, online: true, detail: data, error: '' });
    } catch {
      setStatus({ loading: false, online: false, detail: null, error: 'Print Agent offline neste PC' });
    }
  }, []);

  useEffect(() => {
    check();
    const timer = window.setInterval(check, 15_000);
    return () => window.clearInterval(timer);
  }, [check]);

  async function downloadInstaller() {
    setDownloading(true);
    try {
      await api.downloadPrintAgent();
      setStatus(current => ({ ...current, error: '' }));
    } catch (error) {
      setStatus(current => ({ ...current, error: error.message || 'Falha ao baixar o instalador' }));
    } finally {
      setDownloading(false);
    }
  }

  async function testPrint() {
    setTesting(true);
    try {
      const response = await fetch(PRINT_AGENT_TEST_URL, { method: 'POST', signal: AbortSignal.timeout(10_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Falha ao imprimir teste');
      setStatus(current => ({ ...current, error: '' }));
    } catch (error) {
      setStatus(current => ({ ...current, error: error.message || 'Falha ao imprimir teste' }));
    } finally {
      setTesting(false);
      check();
    }
  }

  const printerLabel = status.detail?.printer?.host
    ? `${status.detail.printer.host}:${status.detail.printer.port || 9100}`
    : 'IP da termica no app do agent';

  return (
    <section className="panel print-agent-panel">
      <div className="panel-heading">
        <div>
          <p className="overline">PC da loja · Windows</p>
          <h2>Pedidos Agent</h2>
        </div>
        <span className={`store-state ${status.online ? 'open' : 'closed'}`}>
          {status.loading ? 'Verificando...' : status.online ? 'Agent online' : 'Agent offline'}
        </span>
      </div>
      <p className="panel-description">
        Baixe o app no computador da loja, entre com o mesmo e-mail/senha deste painel, selecione sua impressora (USB do Windows ou Rede IP) e deixe rodando.
        Pedidos novos imprimem sozinhos na guia de separação do caixa ou balcão.
      </p>
      <div className="print-agent-meta">
        <div><span>Status realtime</span><strong>{status.detail?.connected ? 'Conectado ao AiMerc' : status.online ? 'Aguardando conexao' : 'Offline'}</strong></div>
        <div><span>Impressora</span><strong>{printerLabel}</strong></div>
        <div><span>Loja no cupom</span><strong>{status.detail?.storeName || '—'}</strong></div>
      </div>
      {status.error && <div className="form-error">{status.error}</div>}
      <div className="print-agent-actions">
        <button type="button" className="primary" onClick={downloadInstaller} disabled={downloading}><Download size={16} />{downloading ? 'Abrindo download...' : 'Baixar para Windows'}</button>
        <button type="button" className="secondary" onClick={check} disabled={status.loading}><RefreshCw size={16} /> Atualizar status</button>
        <button type="button" className="secondary" onClick={testPrint} disabled={!status.online || testing}><Printer size={16} />{testing ? 'Imprimindo...' : 'Testar impressao'}</button>
      </div>
      <ol className="print-agent-steps">
        <li>Baixe o zip, extraia no PC da loja e abra <code>AiMerc Pedidos Agent.exe</code>.</li>
        <li>Entre com o e-mail e senha deste painel, selecione a impressora (USB ou Rede) e conecte.</li>
        <li>Pode fechar a janela: ele continua na bandeja do Windows e sobe sozinho ao ligar o PC.</li>
      </ol>
    </section>
  );
}

function IntegracaoPanel() {
  return (
    <div className="integracao-grid">
      <AutoPrintPanel />
    </div>
  );
}

function Storefront({
  store,
  categories = [],
  deliveryZones = [],
  banners,
  campaigns,
  automations,
  storefrontTab = 'fees',
  setStorefrontTab,
  onSaveSettings,
  onCreateBanner,
  onUpdateBanner,
  onDeleteBanner,
  onCreateCampaign,
  onSendCampaign,
  onDeleteCampaign,
  onCreateAutomation,
  onToggleAutomation,
  onRunAutomation,
  onDeleteAutomation
}) {
  const [internalTab, setInternalTab] = useState('fees');
  const activeTab = storefrontTab || internalTab;
  const changeTab = setStorefrontTab || setInternalTab;

  const [settings, setSettings] = useState({
    minimumOrder: store?.minimumOrder ?? 0,
    deliveryFee: store?.deliveryFee ?? 0,
    freeDeliveryAbove: store?.freeDeliveryAbove ?? 0,
    supportPhone: store?.supportPhone ?? '',
    cancellationWindowMinutes: store?.cancellationWindowMinutes ?? 5,
    businessHoursStart: store?.businessHoursStart ?? '08:00',
    businessHoursEnd: store?.businessHoursEnd ?? '20:00',
    businessDays: store?.businessDays ?? '1,2,3,4,5,6',
    acceptAfterHours: store?.acceptAfterHours ?? true,
    open: store?.open ?? true,
    enablePickupScheduling: store?.enablePickupScheduling ?? true,
    pickupSlots: store?.pickupSlots ?? '08:00 - 10:00, 10:00 - 12:00, 12:00 - 14:00, 14:00 - 16:00, 16:00 - 18:00, 18:00 - 20:00',
    disabledCategories: store?.disabledCategories ?? '',
    categoryAliases: store?.categoryAliases ?? {},
    disablePromotions: store?.disablePromotions ?? false
  });
  const [categorySearch, setCategorySearch] = useState('');
  const [bannerForm, setBannerForm] = useState(emptyBanner);
  const [editingId, setEditingId] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState('');
  const [bannerFileError, setBannerFileError] = useState('');
  const [zones, setZones] = useState(deliveryZones);

  useEffect(() => {
    setSettings({
      minimumOrder: store?.minimumOrder ?? 0,
      deliveryFee: store?.deliveryFee ?? 0,
      freeDeliveryAbove: store?.freeDeliveryAbove ?? 0,
      supportPhone: store?.supportPhone ?? '',
      cancellationWindowMinutes: store?.cancellationWindowMinutes ?? 5,
      businessHoursStart: store?.businessHoursStart ?? '08:00',
      businessHoursEnd: store?.businessHoursEnd ?? '20:00',
      businessDays: store?.businessDays ?? '1,2,3,4,5,6',
      acceptAfterHours: store?.acceptAfterHours ?? true,
      open: store?.open ?? true,
      enablePickupScheduling: store?.enablePickupScheduling ?? true,
      pickupSlots: store?.pickupSlots ?? '08:00 - 10:00, 10:00 - 12:00, 12:00 - 14:00, 14:00 - 16:00, 16:00 - 18:00, 18:00 - 20:00',
      disabledCategories: store?.disabledCategories ?? '',
      categoryAliases: store?.categoryAliases ?? {},
      disablePromotions: store?.disablePromotions ?? false
    });
  }, [store?.minimumOrder, store?.deliveryFee, store?.freeDeliveryAbove, store?.supportPhone, store?.cancellationWindowMinutes, store?.businessHoursStart, store?.businessHoursEnd, store?.businessDays, store?.acceptAfterHours, store?.open, store?.enablePickupScheduling, store?.pickupSlots, store?.disabledCategories, store?.categoryAliases, store?.disablePromotions]);

  useEffect(() => {
    setZones(deliveryZones);
  }, [deliveryZones]);

  function addDeliveryZone() {
    setZones(current => [...current, {
      id: `new-${Date.now()}`,
      neighborhood: '',
      city: store?.city || '',
      state: store?.state || '',
      fee: '',
      active: true
    }]);
  }

  function updateDeliveryZone(index, field, value) {
    setZones(current => current.map((zone, zoneIndex) => zoneIndex === index ? { ...zone, [field]: value } : zone));
  }

  function removeDeliveryZone(index) {
    setZones(current => current.filter((_, zoneIndex) => zoneIndex !== index));
  }

  function editBanner(banner) {
    setEditingId(banner.id);
    setBannerForm({ eyebrow: banner.eyebrow, title: banner.title, subtitle: banner.subtitle, image: banner.image, active: banner.active, position: banner.position });
    setBannerFile(null);
    setBannerPreview(banner.image);
    setBannerFileError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetBanner() {
    setEditingId(null);
    setBannerForm(emptyBanner);
    setBannerFile(null);
    setBannerPreview('');
    setBannerFileError('');
  }

  async function chooseBannerImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBannerFileError('');
    try {
      const prepared = await prepareBannerImage(file);
      setBannerFile(prepared);
      setBannerPreview(URL.createObjectURL(prepared));
    } catch (error) {
      setBannerFile(null);
      setBannerFileError(error.message);
    }
  }

  const disabledSet = new Set(
    String(settings.disabledCategories || '')
      .split(',')
      .map(c => c.trim().toLowerCase())
      .filter(Boolean)
  );

  const toggleCategory = (catName) => {
    const list = String(settings.disabledCategories || '')
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);
    const index = list.findIndex(c => c.toLowerCase() === catName.toLowerCase());
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(catName);
    }
    setSettings({ ...settings, disabledCategories: list.join(', ') });
  };

  const updateCategoryAlias = (catName, customName) => {
    const nextAliases = { ...(settings.categoryAliases || {}) };
    if (customName && customName.trim()) {
      nextAliases[catName] = customName.trim();
    } else {
      delete nextAliases[catName];
    }
    setSettings({ ...settings, categoryAliases: nextAliases });
  };

  const clearCategoryAlias = (catName) => {
    const nextAliases = { ...(settings.categoryAliases || {}) };
    delete nextAliases[catName];
    setSettings({ ...settings, categoryAliases: nextAliases });
  };

  const filteredCategories = categories.filter(cat => {
    if (!categorySearch.trim()) return true;
    const q = categorySearch.toLowerCase();
    const original = (cat.name || '').toLowerCase();
    const alias = (settings.categoryAliases?.[cat.name] || '').toLowerCase();
    return original.includes(q) || alias.includes(q);
  });

  const totalCustomized = Object.keys(settings.categoryAliases || {}).filter(k => settings.categoryAliases[k]).length;
  const totalHidden = categories.filter(cat => disabledSet.has(cat.name.toLowerCase())).length;

  const businessDayOptions = [
    { value: 0, label: 'Dom' }, { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' },
    { value: 3, label: 'Qua' }, { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' },
    { value: 6, label: 'Sab' }
  ];
  const selectedBusinessDays = new Set(String(settings.businessDays || '').split(',').map(Number));
  function toggleBusinessDay(day) {
    const next = new Set(selectedBusinessDays);
    if (next.has(day)) {
      if (next.size === 1) return;
      next.delete(day);
    } else next.add(day);
    setSettings({ ...settings, businessDays: [...next].sort((a, b) => a - b).join(',') });
  }

  async function submitSettings(event) {
    event.preventDefault();
    setSavingSettings(true);
    try {
      await onSaveSettings(
        {
          ...settings,
          minimumOrder: Number(settings.minimumOrder),
          deliveryFee: Number(settings.deliveryFee),
          freeDeliveryAbove: Number(settings.freeDeliveryAbove),
          cancellationWindowMinutes: Number(settings.cancellationWindowMinutes),
          categoryAliases: settings.categoryAliases || {}
        },
        zones.map(zone => ({ neighborhood: zone.neighborhood.trim(), city: zone.city.trim(), state: zone.state.trim().toUpperCase(), fee: Number(zone.fee), active: zone.active !== false }))
      );
    }
    finally { setSavingSettings(false); }
  }

  async function submitBanner(event) {
    event.preventDefault();
    setSavingBanner(true);
    try {
      let image = bannerForm.image;
      if (bannerFile) image = (await api.uploadBannerImage(bannerFile)).image;
      if (!image) throw new Error('Selecione a imagem do banner');
      const payload = { ...bannerForm, image, position: Number(bannerForm.position) };
      if (editingId) await onUpdateBanner(editingId, payload);
      else await onCreateBanner(payload);
      resetBanner();
    } catch (error) {
      setBannerFileError(error.message || 'Nao foi possivel enviar a imagem');
    } finally { setSavingBanner(false); }
  }

  return (
    <div className="storefront-container">
      {/* Enterprise Desktop Tabs Header */}
      <div className="desktop-tabs-header">
        <div className="desktop-tabs-bar">
          {storefrontSubTabs.map(tab => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            let badgeCount = null;
            if (tab.id === 'categories') badgeCount = categories.length;
            if (tab.id === 'banners') badgeCount = banners?.filter(b => b.active).length;
            if (tab.id === 'campaigns') badgeCount = campaigns?.length;
            if (tab.id === 'automations') badgeCount = automations?.filter(a => a.active).length;

            return (
              <button
                key={tab.id}
                type="button"
                className={`desktop-tab-btn ${isSelected ? 'active' : ''}`}
                onClick={() => changeTab(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                {badgeCount != null && <span className="tab-counter">{badgeCount}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: TAXAS & ENTREGAS */}
      {activeTab === 'fees' && (
        <div className="storefront-tab-content">
          <div className="storefront-two-cols">
            {/* Left Card: Regras Comerciais */}
            <section className="panel settings-panel">
              <div className="panel-heading">
                <div>
                  <p className="overline">REGRAS COMERCIAIS</p>
                  <h2>Taxas de Entrega & Loja</h2>
                  <p className="panel-subtitle">Defina valores mínimos, taxa padrão e regras gerais para entrega.</p>
                </div>
                <span className={`store-state-badge ${settings.open ? 'open' : 'closed'}`}>
                  <span className="state-badge-dot" /> {settings.open ? 'Loja aberta' : 'Loja fechada'}
                </span>
              </div>
              <form className="settings-form" onSubmit={submitSettings}>
                <div className="settings-form-row">
                  <label className="mockup-field">
                    <span className="mockup-label">Pedido mínimo</span>
                    <span className="mockup-hint">Valor mínimo para comprar no app</span>
                    <div className="mockup-input-box">
                      <b className="mockup-currency">R$</b>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={settings.minimumOrder}
                        onChange={event => setSettings({ ...settings, minimumOrder: event.target.value })}
                      />
                    </div>
                  </label>
                  <label className="mockup-field">
                    <span className="mockup-label">Taxa padrão de entrega</span>
                    <span className="mockup-hint">Usada quando o bairro não possui taxa definida</span>
                    <div className="mockup-input-box">
                      <b className="mockup-currency">R$</b>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={settings.deliveryFee}
                        onChange={event => setSettings({ ...settings, deliveryFee: event.target.value })}
                      />
                      <HelpCircle size={16} className="input-info-icon" />
                    </div>
                  </label>
                </div>

                <label className="mockup-field">
                  <span className="mockup-label">Frete grátis acima de</span>
                  <span className="mockup-hint">Use R$ 0 para manter taxa fixa em todos os pedidos.</span>
                  <div className="mockup-input-box">
                    <b className="mockup-currency">R$</b>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={settings.freeDeliveryAbove}
                      onChange={event => setSettings({ ...settings, freeDeliveryAbove: event.target.value })}
                    />
                  </div>
                </label>

                <div className="settings-form-row">
                  <label className="mockup-field">
                    <span className="mockup-label">Central de atendimento (WhatsApp)</span>
                    <span className="mockup-hint">Telefone para suporte da loja</span>
                    <div className="mockup-input-box">
                      <input
                        type="tel"
                        value={settings.supportPhone}
                        onChange={event => setSettings({ ...settings, supportPhone: event.target.value })}
                        placeholder="85 90000-0000"
                        required
                      />
                      <Phone size={16} className="input-phone-icon" />
                    </div>
                  </label>
                  <label className="mockup-field">
                    <span className="mockup-label">Janela de cancelamento</span>
                    <span className="mockup-hint">Minutos antes da separação</span>
                    <div className="mockup-select-box">
                      <select
                        value={settings.cancellationWindowMinutes}
                        onChange={event => setSettings({ ...settings, cancellationWindowMinutes: Number(event.target.value) })}
                      >
                        <option value={5}>5 minutos</option>
                        <option value={10}>10 minutos</option>
                        <option value={15}>15 minutos</option>
                        <option value={30}>30 minutos</option>
                        <option value={60}>60 minutos</option>
                      </select>
                      <ChevronDown size={15} className="select-chevron" />
                    </div>
                  </label>
                </div>

                <div className="toggle-switch-card">
                  <div className="toggle-switch-info">
                    <div className="toggle-switch-icon"><Package size={18} /></div>
                    <div>
                      <strong>Receber novos pedidos</strong>
                      <small>Ao fechar, o aplicativo bloqueia novos checkouts.</small>
                    </div>
                  </div>
                  <label className="ios-switch">
                    <input
                      type="checkbox"
                      checked={settings.open}
                      onChange={event => setSettings({ ...settings, open: event.target.checked })}
                    />
                    <span className="ios-slider" />
                  </label>
                </div>

                <button className="primary large btn-forest-submit" disabled={savingSettings}>
                  <Save size={16} />
                  <span>{savingSettings ? 'Salvando...' : 'Salvar configurações de entrega'}</span>
                </button>
              </form>
            </section>

            {/* Right Card: Taxas por Bairro */}
            <section className="panel settings-panel">
              <div className="panel-heading">
                <div>
                  <p className="overline">ABRANGÊNCIA</p>
                  <h2>Taxas por Bairro</h2>
                  <p className="panel-subtitle">Defina os bairros atendidos e o valor de entrega para cada localidade.</p>
                </div>
                <button type="button" className="btn-add-neighborhood" onClick={addDeliveryZone}>
                  <Plus size={15} /> Adicionar bairro
                </button>
              </div>

              <form onSubmit={submitSettings}>
                <div className="delivery-zone-table-header">
                  <span className="col-bairro">BAIRRO</span>
                  <span className="col-cidade">CIDADE</span>
                  <span className="col-uf">UF</span>
                  <span className="col-taxa">TAXA DE ENTREGA</span>
                  <span className="col-action" />
                </div>

                <div className="delivery-zone-table-body">
                  {zones.map((zone, index) => (
                    <div className="delivery-zone-table-row" key={zone.id || index}>
                      <input
                        required
                        maxLength="100"
                        className="input-table col-bairro"
                        value={zone.neighborhood}
                        onChange={event => updateDeliveryZone(index, 'neighborhood', event.target.value)}
                        placeholder="Ex.: Centro"
                        aria-label="Bairro"
                      />
                      <input
                        required
                        maxLength="100"
                        className="input-table col-cidade"
                        value={zone.city}
                        onChange={event => updateDeliveryZone(index, 'city', event.target.value)}
                        placeholder="Cidade"
                        aria-label="Cidade"
                      />
                      <input
                        required
                        maxLength="2"
                        className="input-table col-uf text-center"
                        value={zone.state}
                        onChange={event => updateDeliveryZone(index, 'state', event.target.value.toUpperCase().slice(0, 2))}
                        placeholder="UF"
                        aria-label="UF"
                      />
                      <div className="money-input-table col-taxa">
                        <b>R$</b>
                        <input
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          value={zone.fee}
                          onChange={event => updateDeliveryZone(index, 'fee', event.target.value)}
                          aria-label="Taxa do bairro"
                        />
                      </div>
                      <button
                        className="btn-delete-row col-action"
                        type="button"
                        onClick={() => removeDeliveryZone(index)}
                        aria-label={`Excluir ${zone.neighborhood || 'bairro'}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}

                  {!zones.length && (
                    <div className="delivery-zone-empty">
                      Nenhum bairro cadastrado. A taxa padrão será usada para todas as entregas.
                    </div>
                  )}
                </div>

                <div className="neighborhood-callout-box">
                  <div className="neighborhood-callout-icon">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <strong>Não encontrou seu bairro?</strong>
                    <p>Adicione o bairro e defina a taxa de entrega para atender seus clientes.</p>
                  </div>
                </div>

                <button className="primary large btn-forest-submit" disabled={savingSettings}>
                  <Save size={16} />
                  <span>{savingSettings ? 'Salvando...' : 'Salvar taxas de entrega'}</span>
                </button>
              </form>
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: HORÁRIOS & RETIRADA */}
      {activeTab === 'hours' && (
        <div className="storefront-tab-content">
          <form className="storefront-two-cols" onSubmit={submitSettings}>
            {/* Left Card: Horário de Funcionamento */}
            <section className="panel settings-panel">
              <div className="panel-heading">
                <div>
                  <p className="overline">EXPEDIENTE</p>
                  <h2>Horário de Funcionamento</h2>
                  <p className="panel-subtitle">Configure o horário comercial e os dias de atendimento da sua loja.</p>
                </div>
              </div>

              <div className="settings-form">
                <div className="settings-section-block">
                  <div className="section-title-wrap">
                    <strong>Horário comercial de abertura</strong>
                    <span>Pedidos fora desse período entram na fila para a próxima abertura.</span>
                  </div>
                  <div className="settings-form-row">
                    <label className="mockup-field">
                      <span className="mockup-label">Abre às</span>
                      <div className="mockup-input-box">
                        <input
                          type="time"
                          required
                          value={settings.businessHoursStart}
                          onChange={event => setSettings({ ...settings, businessHoursStart: event.target.value })}
                        />
                      </div>
                    </label>
                    <label className="mockup-field">
                      <span className="mockup-label">Fecha às</span>
                      <div className="mockup-input-box">
                        <input
                          type="time"
                          required
                          value={settings.businessHoursEnd}
                          onChange={event => setSettings({ ...settings, businessHoursEnd: event.target.value })}
                        />
                      </div>
                    </label>
                  </div>
                </div>

                <div className="settings-section-block">
                  <div className="section-title-wrap">
                    <strong>Dias de atendimento</strong>
                    <span>Selecione os dias da semana em que a loja opera normalmente.</span>
                  </div>
                  <div className="business-days" aria-label="Dias de funcionamento">
                    {businessDayOptions.map(day => (
                      <button
                        type="button"
                        className={`business-day-pill ${selectedBusinessDays.has(day.value) ? 'selected' : ''}`}
                        onClick={() => toggleBusinessDay(day.value)}
                        key={day.value}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="toggle-switch-card">
                  <div className="toggle-switch-info">
                    <div className="toggle-switch-icon"><Clock3 size={18} /></div>
                    <div>
                      <strong>Receber pedidos fora do horário</strong>
                      <small>O cliente compra normalmente e o pedido fica agendado para a próxima abertura.</small>
                    </div>
                  </div>
                  <label className="ios-switch">
                    <input
                      type="checkbox"
                      checked={settings.acceptAfterHours}
                      onChange={event => setSettings({ ...settings, acceptAfterHours: event.target.checked })}
                    />
                    <span className="ios-slider" />
                  </label>
                </div>

                <button className="primary large btn-forest-submit" disabled={savingSettings}>
                  <Save size={16} />
                  <span>{savingSettings ? 'Salvando...' : 'Salvar horários'}</span>
                </button>
              </div>
            </section>

            {/* Right Card: Retirada na Loja */}
            <section className="panel settings-panel">
              <div className="panel-heading">
                <div>
                  <p className="overline">RETIRADA NA LOJA</p>
                  <h2>Agendamento de Retirada</h2>
                  <p className="panel-subtitle">Permita que o cliente escolha faixas de horário para buscar compras no balcão.</p>
                </div>
              </div>

              <div className="settings-form">
                <div className="toggle-switch-card">
                  <div className="toggle-switch-info">
                    <div className="toggle-switch-icon"><Store size={18} /></div>
                    <div>
                      <strong>Agendamento de horário na retirada</strong>
                      <small>Permitir que o cliente escolha a faixa de horário para buscar o pedido na loja.</small>
                    </div>
                  </div>
                  <label className="ios-switch">
                    <input
                      type="checkbox"
                      checked={settings.enablePickupScheduling}
                      onChange={event => setSettings({ ...settings, enablePickupScheduling: event.target.checked })}
                    />
                    <span className="ios-slider" />
                  </label>
                </div>

                {settings.enablePickupScheduling && (
                  <label className="mockup-field" style={{ marginTop: '16px' }}>
                    <span className="mockup-label">Faixas de horário disponíveis para retirada</span>
                    <span className="mockup-hint">Separe as opções por vírgula (ex.: 08:00 - 10:00, 10:00 - 12:00).</span>
                    <textarea
                      rows="4"
                      className="mockup-textarea"
                      value={settings.pickupSlots}
                      onChange={event => setSettings({ ...settings, pickupSlots: event.target.value })}
                      placeholder="08:00 - 10:00, 10:00 - 12:00, 12:00 - 14:00, 14:00 - 16:00, 16:00 - 18:00, 18:00 - 20:00"
                      required={settings.enablePickupScheduling}
                    />
                  </label>
                )}

                <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
                  <button className="primary large btn-forest-submit" disabled={savingSettings}>
                    <Save size={16} />
                    <span>{savingSettings ? 'Salvando...' : 'Salvar agendamento'}</span>
                  </button>
                </div>
              </div>
            </section>
          </form>
        </div>
      )}

      {/* TAB 3: CATEGORIAS NO APP */}
      {activeTab === 'categories' && (
        <div className="storefront-tab-content">
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <p className="overline">Vitrine & Categorias</p>
                <h2>Organização de Categorias no Aplicativo</h2>
              </div>
              <div className="categories-badges-summary">
                <span className="cat-badge-pill total">{categories.length} categorias</span>
                {totalCustomized > 0 && <span className="cat-badge-pill customized">✏️ {totalCustomized} ajustada{totalCustomized > 1 ? 's' : ''}</span>}
                {totalHidden > 0 && <span className="cat-badge-pill hidden">🚫 {totalHidden} oculta{totalHidden > 1 ? 's' : ''}</span>}
              </div>
            </div>
            <form className="settings-form" onSubmit={submitSettings}>
              <div className="categories-desktop-toolbar">
                <div className="category-search-bar">
                  <Search size={15} />
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={e => setCategorySearch(e.target.value)}
                    placeholder="Pesquisar categoria por nome original ou nome ajustado..."
                  />
                  {categorySearch && (
                    <button type="button" onClick={() => setCategorySearch('')} className="cat-search-clear" aria-label="Limpar busca">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <label className="cat-inline-toggle">
                  <input type="checkbox" checked={settings.disablePromotions} onChange={event => setSettings({ ...settings, disablePromotions: event.target.checked })} />
                  <span>Ocultar vitrine de ofertas</span>
                </label>
              </div>

              <div className="categories-list-container">
                {filteredCategories.map(cat => {
                  const isHidden = disabledSet.has(cat.name.toLowerCase());
                  const currentAlias = settings.categoryAliases?.[cat.name] || '';
                  const isCustomized = Boolean(currentAlias);

                  return (
                    <div key={cat.name} className={`category-item-card ${isCustomized ? 'is-customized' : ''} ${isHidden ? 'is-hidden' : ''}`}>
                      <div className="category-origin-info">
                        <span className="category-erp-label">ERP / Agente:</span>
                        <strong className="category-erp-name">{cat.name}</strong>
                        <span className="category-count-tag">{cat.total} produtos</span>
                      </div>

                      <div className="category-alias-input-wrapper">
                        <input
                          id={`cat-alias-${cat.name}`}
                          type="text"
                          value={currentAlias}
                          onChange={e => updateCategoryAlias(cat.name, e.target.value)}
                          placeholder={`Nome no app (padrão: ${cat.name})`}
                        />
                        {isCustomized && (
                          <button
                            type="button"
                            className="cat-reset-btn"
                            onClick={() => clearCategoryAlias(cat.name)}
                            title="Restaurar nome original do ERP"
                          >
                            Restaurar
                          </button>
                        )}
                      </div>

                      <div className="category-item-status-badges">
                        {isCustomized && <span className="cat-status-badge modified">✏️ Ajustado</span>}
                        {isHidden && <span className="cat-status-badge disabled">🚫 Oculto</span>}
                      </div>

                      <div className="category-visibility-control">
                        <label className="cat-visibility-toggle">
                          <input
                            type="checkbox"
                            checked={isHidden}
                            onChange={() => toggleCategory(cat.name)}
                          />
                          <span>Ocultar no app</span>
                        </label>
                      </div>
                    </div>
                  );
                })}

                {!filteredCategories.length && (
                  <div className="category-empty-search">
                    <Tags size={22} />
                    <p>Nenhuma categoria encontrada para "<strong>{categorySearch}</strong>"</p>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '14px' }}>
                <button className="primary large btn-forest-submit" disabled={savingSettings}>
                  <Save size={16} />
                  <span>{savingSettings ? 'Salvando...' : 'Salvar categorias do app'}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* TAB 4: BANNERS & VITRINE */}
      {activeTab === 'banners' && (
        <div className="storefront-tab-content">
          <div className="storefront-grid">
            <section className="panel banner-editor">
              <div className="panel-heading"><div><p className="overline">Vitrine do aplicativo</p><h2>{editingId ? 'Editar banner' : 'Novo banner'}</h2></div>{editingId && <button className="text-button" onClick={resetBanner}>Cancelar edição</button>}</div>
              <form className="settings-form" onSubmit={submitBanner}>
                <div className="settings-form-row">
                  <label className="mockup-field">
                    <span className="mockup-label">Chamada curta (opcional)</span>
                    <div className="mockup-input-box">
                      <input value={bannerForm.eyebrow} onChange={event => setBannerForm({ ...bannerForm, eyebrow: event.target.value })} placeholder="Ex.: Feira da semana" />
                    </div>
                  </label>
                  <label className="mockup-field">
                    <span className="mockup-label">Título principal (opcional)</span>
                    <div className="mockup-input-box">
                      <input maxLength="120" value={bannerForm.title} onChange={event => setBannerForm({ ...bannerForm, title: event.target.value })} placeholder="Ex.: Frescor que cabe no carrinho" />
                    </div>
                  </label>
                </div>
                <label className="mockup-field">
                  <span className="mockup-label">Descrição (opcional)</span>
                  <textarea className="mockup-textarea" rows="2" value={bannerForm.subtitle} onChange={event => setBannerForm({ ...bannerForm, subtitle: event.target.value })} placeholder="Explique a promoção em uma frase." />
                </label>
                <label className="mockup-field">
                  <span className="mockup-label">Imagem do banner</span>
                  <span className="mockup-hint">Imagem horizontal (ajustada para 1200 x 600 px em WebP).</span>
                  <input className="banner-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseBannerImage} required={!bannerForm.image} />
                </label>
                {bannerFileError && <p className="field-error">{bannerFileError}</p>}
                {bannerPreview && <div className="banner-upload-preview" style={{ backgroundImage: `url(${bannerPreview})` }}><span>Prévia 1200 x 600</span></div>}
                
                <div className="settings-form-row" style={{ marginTop: '16px', alignItems: 'center' }}>
                  <label className="mockup-field" style={{ marginBottom: 0 }}>
                    <span className="mockup-label">Ordem</span>
                    <div className="mockup-input-box" style={{ width: '80px' }}>
                      <input type="number" min="0" max="99" value={bannerForm.position} onChange={event => setBannerForm({ ...bannerForm, position: event.target.value })} />
                    </div>
                  </label>
                  <label className="cat-visibility-toggle" style={{ marginTop: '16px' }}>
                    <input type="checkbox" checked={bannerForm.active} onChange={event => setBannerForm({ ...bannerForm, active: event.target.checked })} /> 
                    <span>Exibir no app</span>
                  </label>
                </div>
                <button className="primary large btn-forest-submit" disabled={savingBanner} style={{ marginTop: '24px' }}>{editingId ? <Pencil size={17} /> : <Plus size={17} />}{savingBanner ? 'Salvando...' : editingId ? 'Atualizar banner' : 'Adicionar banner'}</button>
              </form>
            </section>

            <section className="panel banners-panel">
              <div className="panel-heading"><div><p className="overline">Carrossel no aplicativo</p><h2>Banners publicados</h2></div><span className="counter">{banners?.filter(banner => banner.active).length || 0}</span></div>
              <p className="panel-description">Banners ativos exibidos na home do aplicativo. A ordem menor aparece primeiro.</p>
              <div className="banner-list">
                {banners?.map(banner => <article className={`banner-admin-card ${banner.active ? '' : 'inactive'}`} key={banner.id}>
                  <div className="banner-preview" style={{ backgroundImage: `linear-gradient(90deg, rgba(5,36,26,.86), rgba(5,36,26,.15)), url(${banner.image})` }}><span>{banner.eyebrow}</span><strong>{banner.title}</strong><small>{banner.subtitle}</small></div>
                  <div className="banner-admin-meta"><span>Posição {banner.position + 1}</span><b>{banner.active ? 'Publicado' : 'Oculto'}</b><div><button onClick={() => editBanner(banner)}><Pencil size={15} /> Editar</button><button className="danger-button" onClick={() => onDeleteBanner(banner.id)}><Trash2 size={15} /> Excluir</button></div></div>
                </article>)}
                {!banners?.length && <EmptyState title="Nenhum banner cadastrado" text="Crie o primeiro destaque para a home do aplicativo." />}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 5: NOTIFICAÇÕES PUSH */}
      {activeTab === 'campaigns' && (
        <div className="storefront-tab-content">
          <PushCampaigns campaigns={campaigns} onCreate={onCreateCampaign} onSend={onSendCampaign} onDelete={onDeleteCampaign} />
        </div>
      )}

      {/* TAB 6: AUTOMAÇÕES */}
      {activeTab === 'automations' && (
        <div className="storefront-tab-content">
          <PushAutomations automations={automations} onCreate={onCreateAutomation} onToggle={onToggleAutomation} onRun={onRunAutomation} onDelete={onDeleteAutomation} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [active, setActive] = useState('overview');
  const [storefrontTab, setStorefrontTab] = useState('fees');
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [report, setReport] = useState(null);
  const [deviceSummary, setDeviceSummary] = useState(null);
  const [banners, setBanners] = useState([]);
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [customerQuery, setCustomerQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const catalogRefreshTimer = useRef(null);
  const ordersRefreshTimer = useRef(null);

  const loadCore = useCallback(async () => {
    if (!api.token) return;
    try {
      const [summaryData, ordersData, categoriesData] = await Promise.all([
        api.summary(),
        api.orders(),
        api.productCategories()
      ]);
      setSummary(summaryData);
      setSession(current => current || { user: summaryData.user, store: summaryData.store });
      setOrders(ordersData);
      setCategories(categoriesData);
      setSelected(current => current ? ordersData.find(order => order.id === current.id) || null : null);
      setError('');
    } catch (requestError) {
      if (requestError.status === 401) logout();
      else setError(requestError.message);
    }
  }, []);

  const load = useCallback(async () => {
    if (!api.token) return;
    setRefreshing(true);
    try {
      const [summaryData, ordersData, categoriesData] = await Promise.all([
        api.summary(),
        api.orders(),
        api.productCategories()
      ]);
      setSummary(summaryData);
      setSession(current => current || { user: summaryData.user, store: summaryData.store });
      setOrders(ordersData);
      setCategories(categoriesData);
      setSelected(current => current ? ordersData.find(order => order.id === current.id) || null : null);
      setError('');

      // Background fetch tab secondary resources without blocking
      if (active === 'customers') {
        api.customers(customerQuery).then(setCustomers).catch(() => {});
      } else if (active === 'reports') {
        Promise.all([api.reports(), api.pushDeviceSummary()]).then(([rep, dev]) => {
          setReport(rep);
          setDeviceSummary(dev);
        }).catch(() => {});
      } else if (active === 'storefront') {
        Promise.all([api.banners(), api.pushCampaigns(), api.pushAutomations(), api.deliveryZones(), api.pushDeviceSummary()]).then(([ban, cam, aut, del, dev]) => {
          setBanners(ban);
          setCampaigns(cam);
          setAutomations(aut);
          setDeliveryZones(del);
          setDeviceSummary(dev);
        }).catch(() => {});
      } else if (active === 'catalog') {
        api.products(query, category).then(setProducts).catch(() => {});
      }
    } catch (requestError) {
      if (requestError.status === 401) logout();
      else setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }, [active, customerQuery, query, category]);

  const refreshOrdersLive = useCallback(async () => {
    if (!api.token) return;
    try {
      const [summaryData, ordersData] = await Promise.all([api.summary(), api.orders()]);
      setSummary(summaryData);
      setSession(current => current || { user: summaryData.user, store: summaryData.store });
      setOrders(ordersData);
      setSelected(current => current ? ordersData.find(order => order.id === current.id) || null : null);
    } catch (requestError) {
      if (requestError.status === 401) logout();
    }
  }, []);

  const refreshCatalogLive = useCallback(async () => {
    if (!api.token) return;
    try {
      const productsData = await api.products(query, category);
      setProducts(productsData);
    } catch (requestError) {
      if (requestError.status === 401) logout();
    }
  }, [query, category]);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('aimerc.sound.enabled') !== 'false';
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('aimerc.sidebar.collapsed') === 'true';
  });
  const [monitorMode, setMonitorMode] = useState(false);
  const [kanbanDensity, setKanbanDensity] = useState(() => {
    return localStorage.getItem('aimerc.kanban.density') || 'default';
  });
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isStandalone, setIsStandalone] = useState(() => {
    return (
      (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true)
    );
  });

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('aimerc.sidebar.collapsed', String(next));
      return next;
    });
  }, []);

  const changeDensity = useCallback((density) => {
    setKanbanDensity(density);
    localStorage.setItem('aimerc.kanban.density', density);
  }, []);

  const toggleMonitorMode = useCallback(() => {
    setMonitorMode(prev => {
      const next = !prev;
      if (next) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setMonitorMode(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = useCallback(async () => {
    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setDeferredInstallPrompt(null);
          setIsStandalone(true);
        }
      } catch (err) {
        console.warn('Install prompt error:', err);
        setShowInstallGuide(true);
      }
    } else {
      setShowInstallGuide(true);
    }
  }, [deferredInstallPrompt]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(current => {
      const next = !current;
      localStorage.setItem('aimerc.sound.enabled', String(next));
      if (next) playOrderChime();
      return next;
    });
  }, []);

  useEffect(() => {
    const unlock = () => {
      getAudioContext();
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!api.token) return;
    loadCore();
    realtime.connect(api.token);
    const unsubscribe = realtime.onEvent((event) => {
      if (!event?.type) return;
      if (event.type === 'order.created' || event.type === 'order.updated') {
        if (event.type === 'order.created' && soundEnabled) {
          playOrderChime();
        }
        if (ordersRefreshTimer.current) window.clearTimeout(ordersRefreshTimer.current);
        ordersRefreshTimer.current = window.setTimeout(() => {
          refreshOrdersLive();
        }, 200);
        return;
      }
      if (event.type === 'catalog.updated') {
        if (catalogRefreshTimer.current) window.clearTimeout(catalogRefreshTimer.current);
        catalogRefreshTimer.current = window.setTimeout(() => {
          refreshCatalogLive();
        }, 2_000);
      }
    });
    const interval = window.setInterval(refreshOrdersLive, 45_000);
    return () => {
      unsubscribe();
      realtime.disconnect();
      window.clearInterval(interval);
      if (catalogRefreshTimer.current) window.clearTimeout(catalogRefreshTimer.current);
      if (ordersRefreshTimer.current) window.clearTimeout(ordersRefreshTimer.current);
    };
  }, [loadCore, refreshOrdersLive, refreshCatalogLive, soundEnabled]);

  useEffect(() => {
    if (!session) return;
    realtime.connect(api.token);
  }, [session]);

  // Tab lazy loader
  useEffect(() => {
    if (!session) return;
    if (active === 'catalog') {
      const timeout = window.setTimeout(refreshCatalogLive, 150);
      return () => window.clearTimeout(timeout);
    }
    if (active === 'customers') {
      const timeout = window.setTimeout(() => {
        api.customers(customerQuery).then(setCustomers).catch(() => {});
      }, 150);
      return () => window.clearTimeout(timeout);
    }
    if (active === 'reports') {
      Promise.all([api.reports(), api.pushDeviceSummary()]).then(([rep, dev]) => {
        setReport(rep);
        setDeviceSummary(dev);
      }).catch(() => {});
    }
    if (active === 'storefront') {
      Promise.all([api.banners(), api.pushCampaigns(), api.pushAutomations(), api.deliveryZones(), api.pushDeviceSummary()]).then(([ban, cam, aut, del, dev]) => {
        setBanners(ban);
        setCampaigns(cam);
        setAutomations(aut);
        setDeliveryZones(del);
        setDeviceSummary(dev);
      }).catch(() => {});
    }
  }, [active, query, category, customerQuery, session, refreshCatalogLive]);

  function logout() {
    realtime.disconnect();
    api.setToken('');
    setSession(null);
    setOrders([]);
    setProducts([]);
  }

  async function advance(order, status) {
    setBusy(true);
    try {
      const updated = await api.updateStatus(order.id, status);
      setSelected(current => (current?.id === order.id ? updated : current));
      await refreshOrdersLive();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateOrderItems(order, updatedItems) {
    setBusy(true);
    try {
      const updated = await api.updateOrderItems(order.id, updatedItems);
      setSelected(current => (current?.id === order.id ? updated : current));
      await refreshOrdersLive();
      return updated;
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
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

  async function saveSettings(settings, zones) {
    try { await Promise.all([api.updateSettings(settings), api.updateDeliveryZones(zones)]); await load(); }
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

  if (!session) {
    return (
      <>
        <Login
          onSuccess={value => { setSession(value); load(); }}
          onInstallApp={handleInstallApp}
          isStandalone={isStandalone}
        />
        {showInstallGuide && (
          <InstallGuideModal
            onClose={() => setShowInstallGuide(false)}
            onPromptInstall={handleInstallApp}
            canDirectInstall={!!deferredInstallPrompt}
          />
        )}
      </>
    );
  }

  const storefrontSubtitles = {
    fees: 'Taxas de entrega, pedido mínimo e bairros atendidos',
    hours: 'Horários de funcionamento comercial e retirada na loja',
    categories: 'Nomes de exibição amigáveis e visibilidade de categorias',
    banners: 'Banners e destaques na página inicial do aplicativo',
    campaigns: 'Disparo de notificações push para clientes',
    automations: 'Mensagens automáticas para recuperação e boas-vindas'
  };

  const pageMeta = {
    overview: ['Visao geral', 'Prioridades e desempenho do turno atual'],
    orders: ['Pedidos', 'Avance cada pedido pelo painel Kanban'],
    catalog: ['Catalogo', 'Precos e estoque recebidos da integracao'],
    delivery: ['Entregas', 'Pedidos que saem da loja ate o cliente'],
    customers: ['Clientes', 'Historico, recorrencia e endereco de cada comprador'],
    reports: ['Relatorios', 'Vendas, ticket medio e clientes recorrentes'],
    integracao: ['Integracao', 'Pedidos Agent Windows e impressao automatica na loja'],
    storefront: ['Loja & App', 'Gerencie taxas de entrega, bairros atendidos e configurações do seu aplicativo.']
  }[active];

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${monitorMode ? 'monitor-mode' : ''}`} style={storeTheme(summary?.store || session.store)}>
      {!monitorMode && (
        <Sidebar
          active={active}
          setActive={setActive}
          store={summary?.store || session.store}
          user={session.user}
          onLogout={logout}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onInstallApp={handleInstallApp}
          isStandalone={isStandalone}
          canInstall={!!deferredInstallPrompt}
        />
      )}
      {menuOpen && <button className="menu-overlay" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}
      <main className="workspace">
        {monitorMode ? (
          <header className="monitor-topbar">
            <div className="monitor-topbar-left">
              <div className="monitor-store-badge">
                <Store size={16} />
                <strong>{summary?.store?.name || session.store?.name}</strong>
              </div>
              <span className="live-pill"><i /> Modo Monitor Ativo</span>
            </div>
            <div className="monitor-topbar-right">
              <div className="density-toggle-group">
                <button
                  type="button"
                  className={`density-btn ${kanbanDensity === 'compact' ? 'active' : ''}`}
                  onClick={() => changeDensity('compact')}
                  title="Modo Compacto para telas de 14 polegadas"
                >
                  Compacto
                </button>
                <button
                  type="button"
                  className={`density-btn ${kanbanDensity === 'default' ? 'active' : ''}`}
                  onClick={() => changeDensity('default')}
                  title="Modo Padrão"
                >
                  Padrão
                </button>
                <button
                  type="button"
                  className={`density-btn ${kanbanDensity === 'large' ? 'active' : ''}`}
                  onClick={() => changeDensity('large')}
                  title="Modo Ampliado"
                >
                  Ampliado
                </button>
              </div>
              <button
                type="button"
                className={`icon-button sound-btn ${soundEnabled ? 'active' : 'muted'}`}
                onClick={toggleSound}
                title={soundEnabled ? 'Alerta sonoro ativado' : 'Alerta sonoro desativado'}
                aria-label="Alerta sonoro de pedidos"
              >
                {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <button className="refresh-button" onClick={load} disabled={refreshing}>
                <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
                <span>Atualizar</span>
              </button>
              <button
                type="button"
                className="exit-monitor-btn"
                onClick={toggleMonitorMode}
                title="Sair do Modo Monitor / Tela Cheia"
              >
                <Minimize2 size={16} />
                <span>Sair do Monitor</span>
              </button>
            </div>
          </header>
        ) : (
          <Header
            title={pageMeta[0]}
            subtitle={pageMeta[1]}
            onRefresh={load}
            refreshing={refreshing}
            onMenu={() => setMenuOpen(true)}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
            onToggleMonitor={toggleMonitorMode}
            isMonitorMode={monitorMode}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapse}
            onInstallApp={handleInstallApp}
            isStandalone={isStandalone}
            canInstall={!!deferredInstallPrompt}
            activeView={active}
          />
        )}
        {error && <div className="global-error"><span>{error}</span><button onClick={() => setError('')}><X size={17} /></button></div>}
        <div className="page-content">
          {active === 'overview' && <Overview summary={summary} orders={orders} products={products} selected={selected} setSelected={setSelected} />}
          {active === 'orders' && (
            <OrdersPanel
              orders={orders}
              selected={selected}
              setSelected={setSelected}
              onAdvance={advance}
              busy={busy}
              onToggleMonitor={toggleMonitorMode}
              isMonitorMode={monitorMode}
              density={kanbanDensity}
              onChangeDensity={changeDensity}
            />
          )}
          {active === 'catalog' && <Catalog products={products} categories={categories} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onChanged={load} />}
          {active === 'delivery' && <Delivery orders={orders} selected={selected} setSelected={setSelected} onAdvance={advance} busy={busy} />}
          {active === 'customers' && <Customers customers={customers} query={customerQuery} setQuery={setCustomerQuery} />}
          {active === 'reports' && <Reports report={report} devices={deviceSummary} />}
          {active === 'integracao' && <IntegracaoPanel />}
          {active === 'storefront' && <Storefront store={summary?.store} categories={categories} deliveryZones={deliveryZones} banners={banners} campaigns={campaigns} automations={automations} storefrontTab={storefrontTab} setStorefrontTab={setStorefrontTab} onSaveSettings={saveSettings} onCreateBanner={createBanner} onUpdateBanner={updateBanner} onDeleteBanner={deleteBanner} onCreateCampaign={createCampaign} onSendCampaign={sendCampaign} onDeleteCampaign={deleteCampaign} onCreateAutomation={createAutomation} onToggleAutomation={toggleAutomation} onRunAutomation={runAutomation} onDeleteAutomation={deleteAutomation} />}
        </div>
      </main>
      <OrderDetail order={selected} onClose={() => setSelected(null)} onAdvance={advance} onUpdateItems={handleUpdateOrderItems} onPrint={order => printOrderSlip(order, summary?.store || session.store)} busy={busy} products={products} />
      {showInstallGuide && (
        <InstallGuideModal
          onClose={() => setShowInstallGuide(false)}
          onPromptInstall={handleInstallApp}
          canDirectInstall={!!deferredInstallPrompt}
        />
      )}
    </div>
  );
}
