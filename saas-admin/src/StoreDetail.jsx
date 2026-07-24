import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Cable,
  Images,
  Package,
  Percent,
  RefreshCw,
  Store,
  Tags
} from 'lucide-react';
import { api } from './api.js';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

function Stat({ label, value }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

export default function StoreDetail({ storeId, onBack, onEditBrand, onDelete }) {
  const [tab, setTab] = useState('cadastro');
  const [detail, setDetail] = useState(null);
  const [products, setProducts] = useState({ items: [], total: 0 });
  const [productFilter, setProductFilter] = useState('all');
  const [productQuery, setProductQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => {
    if (tab === 'catalogo' || tab === 'promocoes') loadProducts();
  }, [tab, loadProducts]);

  useEffect(() => {
    if (!job || !['RUNNING', 'STARTING'].includes(job.status)) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = await api.assimilateJob(storeId, job.id);
        setJob(next);
        if (next.status === 'COMPLETED' || next.status === 'FAILED') {
          setAssimilating(false);
          loadDetail();
          if (tab === 'catalogo') loadProducts();
        }
      } catch (_) {}
    }, 1200);
    return () => clearInterval(timer);
  }, [job, storeId, loadDetail, loadProducts, tab]);

  async function startAssimilate() {
    setAssimilating(true);
    setError('');
    try {
      const started = await api.assimilateStoreImages(storeId, 800);
      setJob(started);
      setTab('assimilar');
    } catch (err) {
      setAssimilating(false);
      setError(err.message);
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

  return (
    <div className="store-detail">
      <section className="panel">
        <div className="panel-head">
          <div>
            <button type="button" className="link" onClick={onBack}><ArrowLeft size={16} /> Voltar para lista</button>
            <p className="eyebrow">Gestao completa</p>
            <h2>{store.name}</h2>
            <small>{store.owner} · {store.city}/{store.state} · slug {store.slug}</small>
          </div>
          <div className="top-actions">
            <button className="refresh" onClick={loadDetail}><RefreshCw size={16} /> Atualizar</button>
            <button className="brand-edit" onClick={() => onEditBrand(store)}>Editar cores</button>
            <button className="accent small" disabled={assimilating} onClick={startAssimilate}>
              <Images size={16} /> {assimilating ? 'Assimilando...' : 'Assimilar fotos'}
            </button>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="metrics" style={{ marginTop: 12 }}>
          <Stat label="Produtos ativos" value={stats.activeProducts || 0} />
          <Stat label="Com imagem" value={stats.withImage || 0} />
          <Stat label="Sem imagem" value={stats.withoutImage || 0} />
          <Stat label="EAN local" value={stats.localEan || 0} />
          <Stat label="Promocoes" value={stats.promoProducts || 0} />
          <Stat label="Pedidos hoje" value={detail.summary?.ordersToday || 0} />
        </div>
        <div className="category-chips" style={{ marginTop: 16 }}>
          {[
            ['cadastro', 'Cadastro', Store],
            ['catalogo', 'Catalogo', Package],
            ['promocoes', 'Promocoes', Percent],
            ['assimilar', 'Assimilar fotos', Images]
          ].map(([id, label, Icon]) => (
            <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'cadastro' && (
        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow">Dados do cliente</p><h2>Cadastro completo</h2></div></div>
          <div className="overview-grid">
            <div className="quick-list">
              <div className="quick-row"><span>E-mail</span><strong>{store.email}</strong></div>
              <div className="quick-row"><span>Telefone</span><strong>{store.phone}</strong></div>
              <div className="quick-row"><span>Suporte</span><strong>{store.supportPhone}</strong></div>
              <div className="quick-row"><span>Plano</span><strong>{store.plan}</strong></div>
              <div className="quick-row"><span>Mensalidade</span><strong>{money(store.monthlyPrice)}</strong></div>
              <div className="quick-row"><span>Status</span><strong>{store.status}</strong></div>
              <div className="quick-row"><span>Pedido minimo</span><strong>{money(store.minimumOrder)}</strong></div>
              <div className="quick-row"><span>Taxa entrega</span><strong>{money(store.deliveryFee)}</strong></div>
              <div className="quick-row"><span>Frete gratis acima</span><strong>{money(store.freeDeliveryAbove)}</strong></div>
              <div className="quick-row"><span>Loja aberta</span><strong>{store.open ? 'Sim' : 'Nao'}</strong></div>
              <div className="quick-row"><span>Promocoes</span><strong>{store.disablePromotions ? 'Desativadas' : 'Ativas'}</strong></div>
              <div className="quick-row"><span>Categorias ocultas</span><strong>{store.disabledCategories || 'Nenhuma'}</strong></div>
            </div>
            <div className="finance-card">
              <div className="panel-head"><div><p className="eyebrow">Integracao</p><h2>ERP / agente</h2></div><Cable size={18} /></div>
              {detail.integration ? (
                <>
                  <div className="quick-row"><span>Provedor</span><strong>{detail.integration.providerName || detail.integration.providerCode}</strong></div>
                  <div className="quick-row"><span>Modo</span><strong>{detail.integration.connectionMode}</strong></div>
                  <div className="quick-row"><span>Ultimo sync</span><strong>{detail.integration.lastSyncAt ? new Date(detail.integration.lastSyncAt).toLocaleString('pt-BR') : 'Nunca'}</strong></div>
                  <div className="quick-row"><span>Status sync</span><strong>{detail.integration.lastSyncStatus || '-'}</strong></div>
                  <small>{detail.integration.lastSyncMessage || 'Sem mensagem'}</small>
                </>
              ) : <div className="empty">Nenhuma integracao configurada.</div>}
              {detail.subscription && (
                <>
                  <hr style={{ border: 0, borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />
                  <div className="quick-row"><span>Assinatura</span><strong>{detail.subscription.status}</strong></div>
                  <div className="quick-row"><span>Proxima cobranca</span><strong>{detail.subscription.nextDueDate}</strong></div>
                </>
              )}
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
            <div><p className="eyebrow">Estoque sincronizado</p><h2>Catalogo</h2></div>
            <label className="search"><Tags size={16} /><input value={productQuery} onChange={event => setProductQuery(event.target.value)} placeholder="Buscar produto" /></label>
          </div>
          <div className="category-chips">
            {[
              ['all', 'Todos'],
              ['without_image', 'Sem imagem'],
              ['local_ean', 'EAN local'],
              ['promo', 'Promocoes']
            ].map(([id, label]) => (
              <button key={id} type="button" className={productFilter === id ? 'active' : ''} onClick={() => setProductFilter(id)}>{label}</button>
            ))}
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Produto</th><th>EAN/SKU</th><th>Categoria</th><th>Preco</th><th>Estoque</th><th>Foto</th></tr></thead>
              <tbody>
                {products.items.map(item => (
                  <tr key={item.id}>
                    <td>
                      <div className="store-cell">
                        <div style={{
                          width: 42, height: 42, borderRadius: 8, backgroundSize: 'cover', backgroundPosition: 'center',
                          backgroundImage: item.hasImage ? `url(${item.imageUrl})` : 'none', backgroundColor: '#eef2ef'
                        }} />
                        <span><strong>{item.name}</strong><small>{item.promo ? 'Promocao' : 'Preco normal'}</small></span>
                      </div>
                    </td>
                    <td><code>{item.barcode || item.sku}</code></td>
                    <td>{item.category}</td>
                    <td><strong>{money(item.price)}</strong></td>
                    <td>{item.stock} {item.unit}</td>
                    <td>{item.hasImage ? 'Sim' : 'Pendente'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!products.items.length && <div className="empty">Nenhum produto neste filtro.</div>}
          <small style={{ display: 'block', marginTop: 10 }}>{products.total} produtos encontrados</small>
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

      {tab === 'assimilar' && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Banco central de imagens</p>
              <h2>Assimilar fotos por nome</h2>
              <p>Para EAN local (hortifruti/frigorifico), busca fotos reais de Pinheiro, Atacadao e outras fontes pelo nome do produto.</p>
            </div>
            <button className="accent" disabled={assimilating} onClick={startAssimilate}>
              <Images size={16} /> {assimilating ? 'Em andamento...' : 'Iniciar assimilacao'}
            </button>
          </div>
          <div className="finance-card" style={{ marginTop: 8 }}>
            <div className="quick-row"><span>Status</span><strong>{job?.status || 'Aguardando'}</strong></div>
            <div className="quick-row"><span>Progresso</span><strong>{percent}%</strong></div>
            <div className="quick-row"><span>Analisados</span><strong>{job?.examined || 0} / {job?.total || 0}</strong></div>
            <div className="quick-row"><span>Fotos aplicadas</span><strong>{job?.matched || 0}</strong></div>
            <div className="quick-row"><span>Sem match</span><strong>{job?.skipped || 0}</strong></div>
            <div className="finance-track" style={{ marginTop: 14 }}>
              <i style={{ width: `${percent}%`, display: 'block', height: '100%', background: 'currentColor' }} />
            </div>
            {job?.error && <div className="error" style={{ marginTop: 12 }}>{job.error}</div>}
          </div>
          {!!job?.samples?.length && (
            <div className="table-scroll" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>Produto da loja</th><th>Casa com</th><th>Fonte</th><th>Score</th></tr></thead>
                <tbody>
                  {job.samples.map(sample => (
                    <tr key={`${sample.productId}-${sample.matchedEan}`}>
                      <td><strong>{sample.name}</strong><br /><code>{sample.barcode || '-'}</code></td>
                      <td>{sample.matchedDescription}<br /><code>{sample.matchedEan}</code></td>
                      <td>{sample.sourceName}</td>
                      <td>{sample.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
