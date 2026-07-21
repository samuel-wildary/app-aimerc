const aliases = new Map([
  ['A REVISAR', 'A revisar'],
  ['BAZAR', 'Casa e Bazar'],
  ['CASA E BAZAR', 'Casa e Bazar'],
  ['BEBIDAS', 'Bebidas'],
  ['BISCOITOS', 'Biscoitos'],
  ['BISCOITOS E BOLACHAS', 'Biscoitos'],
  ['BOMBONIERE', 'Bomboniere'],
  ['CEREAIS', 'Cereais'],
  ['CONGELADOS', 'Congelados'],
  ['DOCES E SNACKS', 'Doces e Snacks'],
  ['DOCES E SOBREMESA', 'Doces e Sobremesas'],
  ['DOCES E SOBREMESAS', 'Doces e Sobremesas'],
  ['ENLATADOS/CONSERVAS', 'Enlatados/Conservas'],
  ['FRIGORIFICO', 'Frigorifico'],
  ['FRIOS E EMBUTIDOS', 'Frios e Embutidos'],
  ['HIGIENE E BELEZA', 'Higiene e Beleza'],
  ['HORTI-FRUTI', 'Hortifruti'],
  ['HORTIFRUTI', 'Hortifruti'],
  ['INATIVO', 'Inativo'],
  ['LATICINEOS', 'Laticinios'],
  ['LIMPEZA', 'Limpeza'],
  ['MERCEARIA', 'Mercearia'],
  ['OVOS', 'Ovos'],
  ['PADARIA', 'Padaria'],
  ['PADARIA INDUSTRIAL', 'Padaria industrial'],
  ['PEIXARIA', 'Peixaria'],
  ['PERFUMARIA', 'Higiene e Beleza'],
  ['PETSHOP', 'Petshop'],
  ['PRODUTOS NATURAIS', 'Produtos naturais'],
  ['SEM CATEGORIA', 'Sem categoria'],
  ['TAXAS E SERVICOS', 'Taxas e servicos'],
  ['TEMPEROS', 'Temperos'],
  ['TEMPEROS E CONDIMENTOS', 'Temperos'],
  ['USO/CONSUMO', 'Uso/Consumo']
]);

function categoryKey(value) {
  return String(value || 'Sem categoria').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase();
}

export function normalizeCategory(value) {
  const text = String(value || '').trim();
  return aliases.get(categoryKey(text)) || text || 'Sem categoria';
}
