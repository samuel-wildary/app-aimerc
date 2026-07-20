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

const solidcon = {
  items: common.items,
  sku: ['id_produto'],
  ean: ['codigo_ean'],
  primaryEan: ['ean_principal'],
  name: ['produto'],
  category: ['classificacao01'],
  secondaryCategory: ['classificacao02'],
  price: ['vl_produto'],
  regularPrice: ['vl_produto_normal'],
  promoPrice: ['preco_fidelidade_promocao', 'preco_clube_promocao'],
  stock: ['qtd_produto'],
  unit: ['emb', 'unid_medida'],
  active: ['ativo']
};

export const providers = {
  SYSPDV: { code: 'SYSPDV', aliases: common },
  VAREJO_FACIL: { code: 'VAREJO_FACIL', aliases: common },
  SOLIDCON: { code: 'SOLIDCON', aliases: solidcon, dedupeBySku: true, requireValidGtin: true },
  SOLICOM: { code: 'SOLICOM', aliases: common },
  GENERIC_JSON: { code: 'GENERIC_JSON', aliases: common }
};

export function providerProfile(code) {
  return providers[String(code || '').toUpperCase()] || providers.GENERIC_JSON;
}
