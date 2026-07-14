function normalizedProductName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const categoryRules = [
  {
    category: 'Higiene e Beleza',
    pattern: /\b(CREME (PARA|P) PENTEAR|ELSEVE|SHAMPOO|CONDICIONADOR|MASCARA CAPILAR|OLEO CAPILAR|REPARADOR DE PONTAS|GEL DENTAL|CREME DENTAL|PASTA DE DENTE|ESCOVA DENTAL|ANTISSEPTICO BUCAL|ENXAGUANTE BUCAL|FIO DENTAL|DESODORANTE|ANTITRANSPIRANTE|SABONETE|ABSORVENTE|PROTETOR DIARIO|FRALDA|COTONETE|HIDRATANTE|ESMALTE|ACETONA|PROTETOR SOLAR|APARELHO (DE DESCARTAVEL )?PARA DEPILAR|TINTURA CAPILAR)\b/
  },
  {
    category: 'Limpeza',
    pattern: /\b(DESINFETANTE|DETERGENTE|AMACIANTE|AGUA SANITARIA|LAVA ROUPAS|SABAO EM PO|SABAO LIQUIDO|LIMPADOR (MULTIUSO|SANITARIO)|LIMPA VIDROS?|ESPONJA DE LIMPEZA|SACO PARA LIXO)\b/
  },
  {
    category: 'Doces e Snacks',
    pattern: /^(BALA|CHICLETE|OVO DE PASCOA)\b/
  },
  {
    category: 'Bebidas',
    pattern: /^(REFRIGERANTE|REFRIG|AGUA MINERAL|SUCO|NECTAR|ENERGETICO|ISOTONICO|AGUA DE COCO)\b/
  },
  {
    category: 'Bebidas Alcoolicas',
    pattern: /^(CERVEJA|VINHO|VODKA|WHISKY|WHISKEY|CACHACA|GIN|ESPUMANTE|LICOR|BEBIDA MISTA (ALCOOLICA )?.*VODKA)\b/
  },
  {
    category: 'Congelados',
    pattern: /^(LASANHA|MINI LASANHA|HAMBURGUER|PAO DE QUEIJO .*CONGELADO)\b/
  },
  {
    category: 'Padaria',
    pattern: /^(PAO|BOLO|BOLINHO|TORTA DOCE)\b/
  },
  {
    category: 'Laticinios',
    pattern: /^(IOGURTE|IOG |QUEIJO|REQUEIJAO|MANTEIGA|MARGARINA|CREME DE LEITE|BEBIDA LACTEA|BEBIBA LACTEA)\b/
  },
  {
    category: 'Frios e Embutidos',
    pattern: /^(SALAME|MORTADELA|MORTAD |PRESUNTO|SALSICHA|LINGUICA|LING |APRESUNTADO|PEITO DE PERU|PATE DE PRESUNTO)\b/
  },
  {
    category: 'Ovos',
    pattern: /^OVOS?\b/
  },
  {
    category: 'Pet Shop',
    pattern: /\b(RACAO (PARA )?(CAES|CAO|GATOS|GATO)|AREIA SANITARIA PARA GATOS)\b/
  }
];

export function classifyProductCategory(productName, sourceCategory) {
  const normalized = normalizedProductName(productName);
  const rule = categoryRules.find(item => item.pattern.test(normalized));
  return rule?.category || sourceCategory;
}
