const common = {
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

export const providers = {
  SYSPDV: { code: 'SYSPDV', aliases: common },
  VAREJO_FACIL: { code: 'VAREJO_FACIL', aliases: common },
  SOLICOM: { code: 'SOLICOM', aliases: common },
  GENERIC_JSON: { code: 'GENERIC_JSON', aliases: common }
};

export function providerProfile(code) {
  return providers[String(code || '').toUpperCase()] || providers.GENERIC_JSON;
}
