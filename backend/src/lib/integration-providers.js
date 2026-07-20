const commonAliases = {
  items: ['products', 'produtos', 'items', 'data', 'content', 'resultado.produtos'],
  sku: ['sku', 'id', 'codigo', 'codigoProduto', 'produtoId', 'codProduto'],
  ean: ['ean', 'gtin', 'codigoBarras', 'codigo_barras', 'codBarras', 'barras'],
  name: ['name', 'nome', 'description', 'descricao', 'descricaoProduto'],
  category: ['category', 'categoria', 'departamento', 'secao', 'grupo'],
  price: ['price', 'preco', 'precoVenda', 'valorVenda', 'valor'],
  promoPrice: ['promotionalPrice', 'precoPromocional', 'precoOferta', 'valorPromocao'],
  stock: ['stock', 'estoque', 'quantity', 'quantidade', 'saldo', 'saldoEstoque'],
  unit: ['unit', 'unidade', 'siglaUnidade'],
  active: ['active', 'ativo', 'disponivel', 'status']
};

export const integrationProviders = [
  {
    code: 'SYSPDV',
    name: 'SysPDV / SysPDV Web',
    vendor: 'Casa Magalhaes',
    modes: ['LOCAL_AGENT', 'CLOUD_API', 'FILE_LAYOUT'],
    documentationStatus: 'OFFICIAL_PARTNER_ACCESS',
    description: 'Suporta API do SysPDV Web e layouts processados pelo SysPDV Service.',
    aliases: commonAliases
  },
  {
    code: 'VAREJO_FACIL',
    name: 'Varejo Facil',
    vendor: 'Casa Magalhaes',
    modes: ['LOCAL_AGENT', 'CLOUD_API'],
    documentationStatus: 'OFFICIAL_PARTNER_ACCESS',
    description: 'Conector para a retaguarda Varejo Facil, com URL e credenciais fornecidas na homologacao.',
    aliases: commonAliases
  },
  {
    code: 'SOLICOM',
    name: 'Solicom',
    vendor: 'A confirmar com o fornecedor',
    modes: ['LOCAL_AGENT', 'CLOUD_API'],
    documentationStatus: 'AWAITING_VENDOR_DOCS',
    description: 'Perfil configuravel pronto para receber o Swagger ou manual da versao instalada na loja.',
    aliases: commonAliases
  },
  {
    code: 'GENERIC_JSON',
    name: 'API JSON generica',
    vendor: 'Personalizado',
    modes: ['LOCAL_AGENT', 'CLOUD_API'],
    documentationStatus: 'CONFIGURABLE',
    description: 'Mapeamento manual para qualquer API REST que retorne produtos em JSON.',
    aliases: commonAliases
  }
];

export function integrationProvider(code) {
  return integrationProviders.find(item => item.code === String(code || '').toUpperCase()) || null;
}

export function publicIntegrationProvider(provider) {
  return {
    code: provider.code,
    name: provider.name,
    vendor: provider.vendor,
    modes: provider.modes,
    documentationStatus: provider.documentationStatus,
    description: provider.description
  };
}
