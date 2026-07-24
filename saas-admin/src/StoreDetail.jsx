import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRightLeft,
  Cable,
  Images,
  Link2,
  Package,
  Percent,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Tags
} from 'lucide-react';
import { api } from './api.js';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const TABS = [
  ['cadastro', 'Cadastro', Store],
  ['catalogo', 'Catalogo', Package],
  ['promocoes', 'Promocoes', Percent],
  ['buscar', 'Buscar imagens', Search],
  ['assimilar', 'Assimilar IA', Sparkles]
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
            {sample.reason ? <p className="match-reason">{sample.reason}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export default function StoreDetail({ storeId, onBack, onEditBrand, onDelete }) {
  const [tab, setTab] = useState('cadastro');
  const [detail, setDetail] = useState(null);
  const [products, setProducts] = useState({ items: [], total: 0 });
  const [productFilter, setProductFilter] = useState('all');
  const [productQuery, setProductQuery] = useState('');
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

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.storeDetail(storeId);
      setDetail(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.storeProducts(storeId, {
        q: productQuery,
        filter: productFilter,
        limit: 80
      });
      setProducts(data);
    } catch (err) {
      setError(err.message);
    }
  }, [storeId, productQuery, productFilter]);

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
  useEffect(() => {
    if (tab === 'catalogo' || tab === 'promocoes' || tab === 'buscar') loadProducts();
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
          if (tab === 'catalogo' || tab === 'buscar') loadProducts();
        }
      } catch (_) {}
    }, 1200);
    return () => clearInterval(timer);
  }, [job, storeId, loadDetail, loadProducts, tab]);

  async function startAssimilate() {
    setAssimilating(true);
    setError('');
    setMessage('');
    try {
      const started = await api.assimilateStoreImages(storeId, 400);
      setJob(started);
      setTab('assimilar');
    } catch (err) {
      setAssimilating(false);
      setError(err.message);
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
      await loadProducts();
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
          <button className="ghost light" onClick={loadDetail}><RefreshCw size={16} /> Atualizar</button>
          <button className="ghost light" onClick={() => onEditBrand(store)}>Cores</button>
          <button className="accent" disabled={assimilating} onClick={startAssimilate}>
            <Sparkles size={16} /> {assimilating ? 'Assimilando...' : 'Assimilar com IA'}
          </button>
        </div>
      </section>

      {error && <div className="error">{error}</div>}
      {message && <div className="toast-ok">{message}</div>}

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
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Estoque sincronizado</p>
              <h2>Catalogo</h2>
              <p>Fotos, EAN e busca manual de imagem por produto.</p>
            </div>
            <label className="search"><Tags size={16} /><input value={productQuery} onChange={event => setProductQuery(event.target.value)} placeholder="Buscar produto" /></label>
          </div>
          <div className="filter-chips">
            {[
              ['all', 'Todos'],
              ['without_image', 'Sem imagem'],
              ['local_ean', 'EAN local'],
              ['promo', 'Promocoes']
            ].map(([id, label]) => (
              <button key={id} type="button" className={productFilter === id ? 'active' : ''} onClick={() => setProductFilter(id)}>{label}</button>
            ))}
          </div>
          <div className="product-grid">
            {products.items.map(item => (
              <article className="product-tile" key={item.id}>
                <div className="product-tile-media" style={{ backgroundImage: item.hasImage ? `url(${item.imageUrl})` : undefined }}>
                  {!item.hasImage && <span>Sem foto</span>}
                  {item.promo ? <b className="promo-tag">Promo</b> : null}
                </div>
                <div className="product-tile-body">
                  <strong>{item.name}</strong>
                  <code>{item.barcode || item.sku}</code>
                  <div className="product-tile-meta">
                    <span>{item.category}</span>
                    <span>{money(item.price)}</span>
                  </div>
                  <button type="button" className="brand-edit" onClick={() => {
                    setSelectedProduct(item);
                    setImageSearch(item.name);
                    setTab('buscar');
                  }}><Search size={14} /> Buscar foto</button>
                </div>
              </article>
            ))}
          </div>
          {!products.items.length && <div className="empty">Nenhum produto neste filtro.</div>}
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
              <h2>Vincular fotos ao catalogo</h2>
              <p>
                1) EAN global casa sozinho. 2) EAN local: a IA le abreviaturas do ERP, busca foto limpa no banco
                e rejeita embalagens com logo de concorrente.
              </p>
            </div>
            <button className="accent" disabled={assimilating} onClick={startAssimilate}>
              <Images size={16} /> {assimilating ? 'Em andamento...' : 'Iniciar assimilacao'}
            </button>
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
                <span><b>{job?.globalMatched || 0}</b>Global</span>
                <span><b>{job?.localMatched || 0}</b>IA local</span>
                <span><b>{job?.skipped || 0}</b>Sem match</span>
              </div>
              <div className="assimilate-meta">
                <div className="quick-row"><span>Fase</span><strong><PhaseLabel phase={job?.phase} /></strong></div>
                <div className="quick-row"><span>Fila</span><strong>{job?.examined || 0} / {job?.total || 0}</strong></div>
                {job?.message && <small>{job.message}</small>}
                {job?.error && <div className="error" style={{ marginTop: 10 }}>{job.error}</div>}
              </div>
            </div>
            <div className="assimilate-steps">
              <article>
                <b>01</b>
                <strong>EAN global</strong>
                <span>GTIN valido casa direto no banco, sem gastar token de IA.</span>
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
