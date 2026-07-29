import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Cable,
  Camera,
  CheckSquare,
  ImagePlus,
  Images,
  Link2,
  Package,
  Percent,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Store,
  Tags,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { api } from './api.js';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const PAGE_SIZE = 100;

const TABS = [
  ['cadastro', 'Cadastro', Store],
  ['catalogo', 'Catalogo', Package],
  ['promocoes', 'Promocoes', Percent],
  ['buscar', 'Buscar imagens', Search],
  ['assimilar', 'Assimilar IA', Sparkles]
];

const LOCAL_AI_CATEGORIES = [
  'Hortifruti',
  'Frigorifico',
  'Frios e Embutidos',
  'Peixaria',
  'Ovos',
  'Padaria',
  'Padaria industrial'
];

const CATALOG_FILTERS = [
  ['all', 'Todos'],
  ['without_image', 'Sem imagem'],
  ['local_ean', 'EAN local'],
  ['promo', 'Promocoes']
];

function Metric({ label, value, detail }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function PhaseLabel({ phase }) {
  if (phase === 'GLOBAL') return 'EAN global (automatico)';
  if (phase === 'LOCAL_AI') return 'EAN local (IA)';
  if (phase === 'DONE') return 'Concluido';
  return phase || 'Aguardando';
}

function MatchReport({ samples }) {
  if (!samples?.length) return null;
  return (
    <div className="match-report">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Relatorio de vinculos</p>
          <h2>O que a IA vinculou</h2>
          <p>Produto da loja a esquerda, imagem do banco a direita.</p>
        </div>
        <span className="match-count">{samples.length} vinculos</span>
      </div>
      <div className="match-list">
        {samples.map(sample => (
          <article className="match-card" key={`${sample.productId}-${sample.matchedEan}`}>
            <div className="match-side">
              <div className="match-thumb">
                {sample.productImage
                  ? <img src={sample.productImage} alt={sample.name} />
                  : <span>Sem preview</span>}
              </div>
              <div>
                <small>Produto da loja</small>
                <strong>{sample.name}</strong>
                <code>{sample.barcode || '-'}</code>
                {sample.category ? <em>{sample.category}</em> : null}
              </div>
            </div>
            <div className="match-bridge" title="Vinculado">
              <ArrowRightLeft size={16} />
              <span>{Math.round(Number(sample.score || 0) * 100)}%</span>
            </div>
            <div className="match-side">
              <div className="match-thumb">
                {sample.catalogImage
                  ? <img src={sample.catalogImage} alt={sample.matchedDescription || sample.matchedEan} />
                  : <span>Sem preview</span>}
              </div>
              <div>
                <small>Imagem do banco</small>
                <strong>{sample.matchedDescription || 'Sem descricao'}</strong>
                <code>{sample.matchedEan}</code>
                <em>{sample.sourceName || sample.method || 'catalogo'}</em>
              </div>
            </div>
            {sample.reason ? (
              <p className="match-reason">
                <b>{sample.method === 'openai-vision' || sample.method === 'openai-match' ? 'IA (foto+texto)' : sample.method === 'ean-global' ? 'EAN global' : 'Texto'}</b>
                {' · '}
                {sample.reason}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function PhotoQueueModal({
  products,
  index,
  busy,
  previewUrl,
  onClose,
  onSkip,
  onPickFile,
  onCapture,
  onConfirm
}) {
  const current = products[index];
  if (!current) return null;
  return (
    <div className="modal-layer catalog-photo-modal" role="dialog" aria-modal="true">
      <div className="modal catalog-photo-dialog">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Fila de fotos</p>
            <h2>{current.name}</h2>
            <p>Produto {index + 1} de {products.length} · {current.barcode || current.sku || 'sem codigo'}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>

        <div className="catalog-photo-progress">
          <div style={{ width: `${((index) / products.length) * 100}%` }} />
        </div>

        <div className="catalog-photo-stage">
          <div className="catalog-photo-current">
            <div className="catalog-photo-thumb">
              {current.hasImage ? (
                <img src={`${current.imageUrl}?v=${encodeURIComponent(current.updatedAt || '1')}`} alt="" />
              ) : (
                <span>Sem foto atual</span>
              )}
            </div>
            <div>
              <strong>{current.name}</strong>
              <code>{current.barcode || current.sku || '-'}</code>
              <em>{current.category || 'Sem categoria'}</em>
            </div>
          </div>

          <div className="catalog-photo-preview">
            {previewUrl
              ? <img src={previewUrl} alt="Nova foto" />
              : (
                <div className="catalog-photo-empty">
                  <ImagePlus size={28} />
                  <p>Tire ou envie a foto deste produto</p>
                </div>
              )}
          </div>
        </div>

        <div className="modal-actions catalog-photo-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onSkip}>Pular</button>
          <button type="button" className="ghost" disabled={busy} onClick={onCapture}><Camera size={15} /> Tirar foto</button>
          <button type="button" className="ghost" disabled={busy} onClick={onPickFile}><Upload size={15} /> Arquivo</button>
          <button type="button" className="accent" disabled={busy || !previewUrl} onClick={onConfirm}>
            {busy ? 'Salvando...' : index === products.length - 1 ? 'Salvar e concluir' : 'Salvar e proximo'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StoreDetail({ storeId, onBack, onEditBrand, onDelete }) {
  const [tab, setTab] = useState('cadastro');
  const [detail, setDetail] = useState(null);
  const [products, setProducts] = useState({ items: [], total: 0 });
  const [productFilter, setProductFilter] = useState('all');
  const [productCategory, setProductCategory] = useState('Todos');
  const [productQuery, setProductQuery] = useState('');
  const [productOffset, setProductOffset] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [imageSearch, setImageSearch] = useState('');
  const [imageResults, setImageResults] = useState({ items: [], total: 0, aiEnabled: false });
  const [searchingImages, setSearchingImages] = useState(false);
  const [linking, setLinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [job, setJob] = useState(null);
  const [assimilating, setAssimilating] = useState(false);
  const [assimilateCategory, setAssimilateCategory] = useState('Hortifruti');
  const [clearingShortEan, setClearingShortEan] = useState(false);
  const [syncingEan, setSyncingEan] = useState(false);
  const [photoQueue, setPhotoQueue] = useState([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const loadDetail = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const data = await api.storeDetail(storeId);
      setDetail(data);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [storeId]);

  const loadProducts = useCallback(async ({ append = false, offset = 0 } = {}) => {
    setLoadingProducts(true);
    try {
      const data = await api.storeProducts(storeId, {
        q: productQuery,
        filter: productFilter,
        category: productCategory,
        limit: PAGE_SIZE,
        offset
      });
      setProducts(prev => ({
        ...data,
        items: append ? [...prev.items, ...(data.items || [])] : (data.items || [])
      }));
      setProductOffset(offset);
      if (!append) setSelectedIds(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingProducts(false);
    }
  }, [storeId, productQuery, productFilter, productCategory]);

  const runImageSearch = useCallback(async (term = imageSearch) => {
    setSearchingImages(true);
    setError('');
    try {
      const data = await api.searchImages(term, 48, 0);
      setImageResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearchingImages(false);
    }
  }, [imageSearch]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  // Nao sincroniza fotos automaticamente ao abrir — force sync de 20k+ produtos trava a tela.
  // O botao "Atualizar fotos" no hero continua disponivel sob demanda.

  useEffect(() => {
    if (tab === 'catalogo' || tab === 'promocoes' || tab === 'buscar') {
      loadProducts({ append: false, offset: 0 });
    }
  }, [tab, loadProducts]);
  useEffect(() => {
    if (tab === 'buscar') runImageSearch(selectedProduct?.name || imageSearch || 'tomate');
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!job || !['RUNNING', 'STARTING'].includes(job.status)) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = await api.assimilateJob(storeId, job.id);
        setJob(next);
        if (next.status === 'COMPLETED' || next.status === 'FAILED') {
          setAssimilating(false);
          loadDetail();
          if (tab === 'catalogo' || tab === 'buscar') loadProducts({ append: false, offset: 0 });
        }
      } catch (_) {}
    }, 1200);
    return () => clearInterval(timer);
  }, [job, storeId, loadDetail, loadProducts, tab]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const visibleIds = useMemo(() => products.items.map(item => item.id), [products.items]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const selectedProducts = useMemo(
    () => products.items.filter(item => selectedIds.has(item.id)),
    [products.items, selectedIds]
  );
  const categoryOptions = useMemo(() => {
    const fromDetail = (Array.isArray(detail?.categories) ? detail.categories : [])
      .map(item => (typeof item === 'string' ? item : item?.name || item?.category || ''))
      .filter(Boolean);
    const fromItems = products.items.map(item => item.category).filter(Boolean);
    return ['Todos', ...new Set([...fromDetail, ...fromItems].filter(Boolean))].sort((a, b) => {
      if (a === 'Todos') return -1;
      if (b === 'Todos') return 1;
      return a.localeCompare(b, 'pt-BR');
    });
  }, [detail, products.items]);

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

  function selectCurrentCategory() {
    if (productCategory === 'Todos') {
      setSelectedIds(new Set(visibleIds));
      return;
    }
    setSelectedIds(new Set(
      products.items.filter(item => item.category === productCategory).map(item => item.id)
    ));
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
      setError('Selecione ao menos um produto para tirar ou enviar foto.');
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
      setError('Selecione um arquivo de imagem (JPG, PNG, WEBP...).');
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
    setError('');
    try {
      await api.uploadProductImage(storeId, current.id, photoFile);
      const isLast = photoIndex >= photoQueue.length - 1;
      if (isLast) {
        setMessage(`Foto salva para ${photoQueue.length} produto(s).`);
        closePhotoQueue();
        await loadDetail();
        await loadProducts({ append: false, offset: 0 });
      } else {
        resetPhotoDraft();
        setPhotoIndex(photoIndex + 1);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  function skipPhotoCurrent() {
    if (photoIndex >= photoQueue.length - 1) {
      closePhotoQueue();
      loadProducts({ append: false, offset: 0 });
      return;
    }
    resetPhotoDraft();
    setPhotoIndex(photoIndex + 1);
  }

  async function clearSelectedImages() {
    if (!selectedProducts.length) {
      setError('Selecione produtos para remover a foto.');
      return;
    }
    if (!window.confirm(`Remover a foto de ${selectedProducts.length} produto(s) selecionado(s)?`)) return;
    setError('');
    setMessage('');
    try {
      const result = await api.clearProductImages(storeId, selectedProducts.map(item => item.id));
      setMessage(`Removidas ${result.removedImages || 0} foto(s) dos selecionados.`);
      setSelectedIds(new Set());
      await loadDetail();
      await loadProducts({ append: false, offset: 0 });
    } catch (err) {
      setError(err.message);
    }
  }

  function openSearchForSelected() {
    const target = selectedProducts[0] || null;
    if (!target) {
      setError('Selecione um produto para buscar foto no banco.');
      return;
    }
    setSelectedProduct(target);
    setImageSearch(target.name);
    setTab('buscar');
  }

  async function startAssimilate() {
    if (!assimilateCategory) {
      setError('Escolha a categoria que a IA deve analisar (ex.: Hortifruti ou Frigorifico).');
      setTab('assimilar');
      return;
    }
    setAssimilating(true);
    setError('');
    setMessage('');
    try {
      const started = await api.assimilateStoreImages(storeId, {
        limit: 400,
        category: assimilateCategory,
        onlyLocalBarcode: true
      });
      setJob(started);
      setTab('assimilar');
    } catch (err) {
      setAssimilating(false);
      setError(err.message);
    }
  }

  function openAssimilateTab() {
    setTab('assimilar');
  }

  async function clearShortEanImages() {
    if (!window.confirm('Remover todas as fotos de produtos com EAN/codigo com menos de 6 digitos nesta loja?')) return;
    setClearingShortEan(true);
    setError('');
    setMessage('');
    try {
      const result = await api.clearShortEanImages(storeId, 5);
      setMessage(`Removidas ${result.removedImages || 0} fotos de EAN curto (< 6 digitos).`);
      await loadDetail();
      if (tab === 'catalogo' || tab === 'buscar') await loadProducts({ append: false, offset: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setClearingShortEan(false);
    }
  }

  async function linkImage(asset) {
    if (!selectedProduct) {
      setError('Selecione um produto da loja a esquerda antes de vincular a foto.');
      return;
    }
    setLinking(true);
    setError('');
    setMessage('');
    try {
      await api.linkProductImage(storeId, selectedProduct.id, asset.ean);
      setMessage(`Foto vinculada a ${selectedProduct.name} (EAN ${asset.ean}).`);
      await loadProducts({ append: false, offset: 0 });
      await loadDetail();
    } catch (err) {
      setError(err.message);
    } finally {
      setLinking(false);
    }
  }

  if (loading && !detail) {
    return <section className="panel"><div className="empty"><RefreshCw className="spin" /> Carregando supermercado...</div></section>;
  }
  if (!detail) {
    return <section className="panel"><div className="empty">{error || 'Supermercado nao encontrado'}<button className="link" onClick={onBack}>Voltar</button></div></section>;
  }

  const store = detail.store;
  const stats = detail.catalogStats || {};
  const percent = Number(job?.percent || 0);
  const brand = store.brandColors || {};

  return (
    <div className="store-detail">
      <section className="store-hero" style={{
        background: `radial-gradient(circle at 82% 40%, ${brand.accent || '#c8f05b'}33, transparent 28%), linear-gradient(125deg, ${brand.primary || '#0e1c1a'}, #203c35)`
      }}>
        <div>
          <button type="button" className="store-back" onClick={onBack}><ArrowLeft size={16} /> Lista de supermercados</button>
          <p className="eyebrow">Gestao do cliente</p>
          <h2>{store.name}</h2>
          <p>{store.owner} · {store.city}/{store.state} · slug {store.slug}</p>
        </div>
        <div className="store-hero-actions">
          <button
            className="ghost light"
            disabled={syncingEan}
            onClick={() => {
              loadDetail({ quiet: true });
              setSyncingEan(true);
              api.syncStoreEanImages(storeId, { force: false })
                .then(async result => {
                  const updated = Number(result.updated || 0);
                  setMessage(
                    updated > 0
                      ? `Fotos por EAN substituidas: ${updated} produto(s) do banco de imagens.`
                      : 'Fotos por EAN conferidas — nada novo para sincronizar.'
                  );
                  await loadDetail({ quiet: true });
                  if (tab === 'catalogo' || tab === 'promocoes' || tab === 'buscar') {
                    await loadProducts({ append: false, offset: 0 });
                  }
                })
                .catch(err => setError(err.message || 'Falha ao sincronizar fotos por EAN'))
                .finally(() => setSyncingEan(false));
            }}
          >
            <RefreshCw size={16} className={syncingEan ? 'spin' : ''} />
            {syncingEan ? 'Atualizando fotos...' : 'Atualizar'}
          </button>
          <button className="ghost light" onClick={() => onEditBrand(store)}>Cores</button>
          <button className="accent" disabled={assimilating} onClick={openAssimilateTab}>
            <Sparkles size={16} /> Assimilar com IA
          </button>
        </div>
      </section>

      {error && <div className="error">{error}</div>}
      {syncingEan && <div className="toast-ok">Sincronizando fotos por EAN com o banco de imagens...</div>}
      {message && !syncingEan && <div className="toast-ok">{message}</div>}

      <div className="metrics store-metrics">
        <Metric label="Produtos ativos" value={stats.activeProducts || 0} detail={`${stats.totalProducts || stats.activeProducts || 0} no total`} />
        <Metric label="Com imagem" value={stats.withImage || 0} detail="Mesma regra do painel da loja" />
        <Metric label="Sem imagem" value={stats.withoutImage || 0} detail="Pendentes de foto" />
        <Metric label="EAN local" value={stats.localEan || 0} detail="Precisam de IA" />
        <Metric label="Promocoes" value={stats.promoProducts || 0} />
        <Metric label="Pedidos hoje" value={detail.summary?.ordersToday || 0} />
      </div>

      <nav className="store-tabs" aria-label="Secoes do supermercado">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      {tab === 'cadastro' && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Dados do cliente</p>
              <h2>Cadastro completo</h2>
            </div>
          </div>
          <div className="overview-grid">
            <div className="detail-grid">
              {[
                ['E-mail', store.email],
                ['Telefone', store.phone],
                ['Suporte', store.supportPhone],
                ['Plano', store.plan],
                ['Mensalidade', money(store.monthlyPrice)],
                ['Status', store.status],
                ['Pedido minimo', money(store.minimumOrder)],
                ['Taxa entrega', money(store.deliveryFee)],
                ['Frete gratis acima', money(store.freeDeliveryAbove)],
                ['Loja aberta', store.open ? 'Sim' : 'Nao'],
                ['Promocoes', store.disablePromotions ? 'Desativadas' : 'Ativas'],
                ['Categorias ocultas', store.disabledCategories || 'Nenhuma']
              ].map(([label, value]) => (
                <div className="detail-cell" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="finance-card">
              <div className="panel-head">
                <div><p className="eyebrow">Integracao</p><h2>ERP / agente</h2></div>
                <Cable size={18} />
              </div>
              {detail.integration ? (
                <>
                  <div className="quick-row"><span>Provedor</span><strong>{detail.integration.providerName || detail.integration.providerCode}</strong></div>
                  <div className="quick-row"><span>Modo</span><strong>{detail.integration.connectionMode}</strong></div>
                  <div className="quick-row"><span>Ultimo sync</span><strong>{detail.integration.lastSyncAt ? new Date(detail.integration.lastSyncAt).toLocaleString('pt-BR') : 'Nunca'}</strong></div>
                  <div className="quick-row"><span>Status sync</span><strong>{detail.integration.lastSyncStatus || '-'}</strong></div>
                  <small>{detail.integration.lastSyncMessage || 'Sem mensagem'}</small>
                </>
              ) : <div className="empty">Nenhuma integracao configurada.</div>}
              <div className="modal-actions" style={{ marginTop: 16 }}>
                <button type="button" className="danger-button" onClick={() => onDelete(store)}>Excluir supermercado</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'catalogo' && (
        <section className="panel catalog-workspace">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Catalogo do cliente</p>
              <h2>Gestao de produtos</h2>
              <p>Selecione um, varios ou a categoria inteira para tirar foto, enviar arquivo ou buscar no banco.</p>
            </div>
            <div className="catalog-head-tools">
              <label className="search"><Tags size={16} /><input value={productQuery} onChange={event => setProductQuery(event.target.value)} placeholder="Buscar produto, EAN ou SKU" /></label>
              <select
                className="catalog-category-select"
                value={productCategory}
                onChange={event => setProductCategory(event.target.value)}
                aria-label="Filtrar categoria"
              >
                {categoryOptions.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="catalog-toolbar">
            <div className="filter-chips">
              {CATALOG_FILTERS.map(([id, label]) => (
                <button key={id} type="button" className={productFilter === id ? 'active' : ''} onClick={() => setProductFilter(id)}>{label}</button>
              ))}
            </div>
            <div className="catalog-toolbar-meta">
              <span>{products.total || 0} produtos</span>
              <span>{selectedIds.size} selecionados</span>
              {loadingProducts ? <span>Atualizando...</span> : null}
            </div>
          </div>

          <div className="catalog-select-bar">
            <button type="button" className="ghost" onClick={toggleSelectAllVisible}>
              {allVisibleSelected ? <CheckSquare size={15} /> : <Square size={15} />}
              {allVisibleSelected ? 'Desmarcar pagina' : 'Marcar pagina'}
            </button>
            <button type="button" className="ghost" onClick={selectCurrentCategory}>
              <CheckSquare size={15} /> Selecionar categoria
            </button>
            <button type="button" className="ghost" disabled={!selectedIds.size} onClick={() => setSelectedIds(new Set())}>
              Limpar selecao
            </button>
          </div>

          {selectedIds.size > 0 && (
            <div className="catalog-bulk-bar">
              <div>
                <strong>{selectedIds.size} produto(s)</strong>
                <span>Acoes em massa</span>
              </div>
              <div className="catalog-bulk-actions">
                <button type="button" className="accent" onClick={() => openPhotoQueue()}>
                  <Camera size={15} /> Tirar / enviar fotos
                </button>
                <button type="button" className="ghost" onClick={openSearchForSelected}>
                  <Search size={15} /> Buscar no banco
                </button>
                <button type="button" className="ghost danger-ghost" onClick={clearSelectedImages}>
                  <Trash2 size={15} /> Remover fotos
                </button>
              </div>
            </div>
          )}

          <div className="product-grid catalog-product-grid">
            {products.items.map(item => {
              const selected = selectedIds.has(item.id);
              return (
                <article
                  className={`product-tile ${selected ? 'selected' : ''} ${item.hasImage ? 'has-image' : 'no-image'}`}
                  key={item.id}
                >
                  <label className="product-tile-check">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelect(item.id)}
                      aria-label={`Selecionar ${item.name}`}
                    />
                  </label>
                  <button
                    type="button"
                    className="product-tile-media"
                    onClick={() => openPhotoQueue([item])}
                    title="Tirar ou enviar foto"
                  >
                    {item.hasImage ? (
                      <img
                        src={`${item.imageUrl}?v=${encodeURIComponent(item.updatedAt || '1')}`}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span>Sem foto</span>
                    )}
                    {item.promo ? <b className="promo-tag">Promo</b> : null}
                    <em className="product-tile-camera"><Camera size={14} /></em>
                  </button>
                  <div className="product-tile-body">
                    <strong>{item.name}</strong>
                    <code>{item.barcode || item.sku || '-'}</code>
                    <div className="product-tile-meta">
                      <span>{item.category || 'Sem categoria'}</span>
                      <span>{money(item.price)}</span>
                    </div>
                    <div className="product-tile-actions">
                      <button
                        type="button"
                        className="brand-edit"
                        onClick={() => openPhotoQueue([item])}
                      >
                        <ImagePlus size={14} /> Foto
                      </button>
                      <button
                        type="button"
                        className="brand-edit"
                        onClick={() => {
                          setSelectedProduct(item);
                          setImageSearch(item.name);
                          setTab('buscar');
                        }}
                      >
                        <Search size={14} /> Banco
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!products.items.length && !loadingProducts && <div className="empty">Nenhum produto neste filtro.</div>}

          {products.items.length < (products.total || 0) && (
            <div className="catalog-load-more">
              <button
                type="button"
                className="ghost"
                disabled={loadingProducts}
                onClick={() => loadProducts({ append: true, offset: productOffset + PAGE_SIZE })}
              >
                {loadingProducts ? 'Carregando...' : `Carregar mais (${products.items.length} de ${products.total})`}
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden onChange={handlePhotoFile} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handlePhotoFile} />

          {photoQueue.length > 0 && (
            <PhotoQueueModal
              products={photoQueue}
              index={photoIndex}
              busy={photoBusy}
              previewUrl={photoPreview}
              onClose={closePhotoQueue}
              onSkip={skipPhotoCurrent}
              onPickFile={() => fileInputRef.current?.click()}
              onCapture={() => cameraInputRef.current?.click()}
              onConfirm={confirmPhotoForCurrent}
            />
          )}
        </section>
      )}

      {tab === 'promocoes' && (
        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow">Ofertas ativas</p><h2>Promocoes</h2></div></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Produto</th><th>Categoria</th><th>De</th><th>Por</th><th>Estoque</th></tr></thead>
              <tbody>
                {(detail.promotions || []).map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.category}</td>
                    <td>{item.oldPrice != null ? money(item.oldPrice) : '-'}</td>
                    <td><strong>{money(item.price)}</strong></td>
                    <td>{item.stock} {item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!(detail.promotions || []).length && <div className="empty">Nenhuma promocao ativa no momento.</div>}
        </section>
      )}

      {tab === 'buscar' && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Biblioteca central</p>
              <h2>Buscar e vincular imagens</h2>
              <p>Escolha o produto da loja, busque no banco e vincule uma foto limpa (sem logo de concorrente).</p>
            </div>
          </div>
          <div className="link-workspace">
            <aside className="link-products">
              <p className="eyebrow">Produto da loja</p>
              <label className="search"><Tags size={16} /><input value={productQuery} onChange={event => setProductQuery(event.target.value)} placeholder="Filtrar produtos" /></label>
              <div className="filter-chips compact">
                <button type="button" className={productFilter === 'without_image' ? 'active' : ''} onClick={() => setProductFilter('without_image')}>Sem imagem</button>
                <button type="button" className={productFilter === 'local_ean' ? 'active' : ''} onClick={() => setProductFilter('local_ean')}>EAN local</button>
                <button type="button" className={productFilter === 'all' ? 'active' : ''} onClick={() => setProductFilter('all')}>Todos</button>
              </div>
              <div className="link-product-list">
                {products.items.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    className={`link-product ${selectedProduct?.id === item.id ? 'active' : ''}`}
                    onClick={() => { setSelectedProduct(item); setImageSearch(item.name); }}
                  >
                    <div className="link-product-thumb" style={{ backgroundImage: item.hasImage ? `url(${item.imageUrl})` : undefined }} />
                    <span>
                      <strong>{item.name}</strong>
                      <code>{item.barcode || item.sku}</code>
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <div className="link-results">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Resultados do banco</p>
                  <h2>{selectedProduct ? `Fotos para ${selectedProduct.name}` : 'Imagens encontradas'}</h2>
                </div>
                <form className="search" onSubmit={event => { event.preventDefault(); runImageSearch(imageSearch); }}>
                  <Search size={16} />
                  <input value={imageSearch} onChange={event => setImageSearch(event.target.value)} placeholder="Ex.: picanha, tomate, coxao mole" />
                </form>
              </div>
              <div className="top-actions" style={{ marginBottom: 12, marginLeft: 0 }}>
                <button type="button" className="accent small" disabled={searchingImages} onClick={() => runImageSearch(imageSearch)}>
                  {searchingImages ? 'Buscando...' : 'Buscar no banco'}
                </button>
                <small>{imageResults.aiEnabled ? 'IA ativa na assimilacao automatica' : 'Configure a chave em Configuracoes para IA automatica'}</small>
              </div>
              <div className="asset-grid link-asset-grid">
                {imageResults.items.map(item => (
                  <article className="asset-card" key={item.ean}>
                    <div className="asset-image"><img src={item.image} alt={item.description || item.ean} /></div>
                    <div className="asset-body">
                      <code>{item.ean}</code>
                      <h3>{item.description || 'Sem descricao'}</h3>
                      <span>{item.sourceName || 'Fonte'}</span>
                      <button type="button" className="brand-edit" disabled={linking || !selectedProduct} onClick={() => linkImage(item)}>
                        <Link2 size={14} /> Vincular
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!imageResults.items.length && <div className="empty">Nenhuma imagem para este termo.</div>}
            </div>
          </div>
        </section>
      )}

      {tab === 'assimilar' && (
        <section className="panel assimilate-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Assimilacao inteligente</p>
              <h2>EAN local por categoria</h2>
              <p>
                Escolha a categoria (Hortifruti, Frigorifico...). A IA analisa so produtos com EAN interno
                dessa categoria: le abreviaturas, busca foto limpa no banco e mostra o vinculo.
              </p>
            </div>
            <button className="accent" disabled={assimilating || !assimilateCategory} onClick={startAssimilate}>
              <Images size={16} /> {assimilating ? 'Analisando...' : `Analisar ${assimilateCategory}`}
            </button>
          </div>

          <div className="assimilate-scope">
            <div className="top-actions" style={{ marginLeft: 0, marginBottom: 12 }}>
              <button type="button" className="ghost" disabled={clearingShortEan} onClick={clearShortEanImages}>
                {clearingShortEan ? 'Removendo...' : 'Limpar fotos EAN < 6 digitos'}
              </button>
              <small>Remove do banco fotos ja vinculadas a codigos com 0–5 digitos.</small>
            </div>
            <div>
              <p className="eyebrow">Categoria para analisar</p>
              <div className="filter-chips">
                {LOCAL_AI_CATEGORIES.map(name => (
                  <button
                    key={name}
                    type="button"
                    className={assimilateCategory === name ? 'active' : ''}
                    disabled={assimilating}
                    onClick={() => setAssimilateCategory(name)}
                  >
                    {name}
                  </button>
                ))}
                {(detail.categories || [])
                  .map(item => item?.name)
                  .filter(Boolean)
                  .filter(name => !LOCAL_AI_CATEGORIES.includes(name))
                  .slice(0, 12)
                  .map(name => (
                    <button
                      key={name}
                      type="button"
                      className={assimilateCategory === name ? 'active' : ''}
                      disabled={assimilating}
                      onClick={() => setAssimilateCategory(name)}
                    >
                      {name}
                    </button>
                  ))}
              </div>
              <small className="assimilate-hint">
                Foco: produtos com EAN local/interno em <strong>{assimilateCategory}</strong>. EAN global (arroz, biscoito etc.) nao entra nesta rodada.
              </small>
            </div>
          </div>

          <div className="assimilate-board">
            <div className="scan-progress assimilate-progress">
              <div className="progress-orbit" style={{ background: `conic-gradient(var(--lime) ${percent}%, #e7ece7 0)` }}>
                <div className="progress-number">
                  <strong>{percent}%</strong>
                  <span>{job?.status || 'Pronto'}</span>
                </div>
              </div>
              <div className="progress-track"><i style={{ width: `${percent}%` }} /></div>
              <div className="progress-stats">
                <span><b>{job?.examined || 0}</b>Analisados</span>
                <span><b>{job?.localMatched || 0}</b>Vinculados</span>
                <span><b>{job?.skipped || 0}</b>Sem match</span>
                <span><b>{job?.total || 0}</b>Na fila</span>
              </div>
              <div className="assimilate-meta">
                <div className="quick-row"><span>Categoria</span><strong>{job?.category || assimilateCategory}</strong></div>
                <div className="quick-row"><span>Fase</span><strong><PhaseLabel phase={job?.phase} /></strong></div>
                <div className="quick-row"><span>Fila</span><strong>{job?.examined || 0} / {job?.total || 0}</strong></div>
                {job?.message && <small>{job.message}</small>}
                {job?.error && <div className="error" style={{ marginTop: 10 }}>{job.error}</div>}
              </div>
            </div>
            <div className="assimilate-steps">
              <article>
                <b>01</b>
                <strong>Escolha a categoria</strong>
                <span>Hortifruti, Frigorifico, Peixaria... so essa fila entra na IA.</span>
              </article>
              <article>
                <b>02</b>
                <strong>EAN local + IA</strong>
                <span>Expande abreviaturas (PIC, COXAO, TOM...), compara legendas e escolhe foto limpa.</span>
              </article>
              <article>
                <b>03</b>
                <strong>Relatorio visual</strong>
                <span>Mostra produto ↔ imagem vinculada com score e motivo.</span>
              </article>
            </div>
          </div>

          <MatchReport samples={job?.samples || []} />
        </section>
      )}
    </div>
  );
}
