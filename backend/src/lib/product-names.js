/**
 * Torna nomes tipicos de PDV (SysPDV etc.) legiveis no app.
 * Nao altera catalog_name personalizado — so o nome bruto da integracao.
 */
const ABBREVIATIONS = [
  [/\bCR\.?\s*COND\.?/gi, 'Creme Condicionador '],
  [/\bCR\.?\s*TRAT\.?/gi, 'Creme de Tratamento '],
  [/\bCR\.?\s*PENT\.?/gi, 'Creme para Pentear '],
  [/\bSHAMP?\.?\b/gi, 'Shampoo'],
  [/\bDESOD\.?/gi, 'Desodorante '],
  [/\bAMAC\.?/gi, 'Amaciante '],
  [/\bDET\.?/gi, 'Detergente '],
  [/\bSAB\.?/gi, 'Sabonete '],
  [/\bABS\.?/gi, 'Absorvente '],
  [/\bESC\.?\s*DENT\.?/gi, 'Escova Dental '],
  [/\bCREME?\s*DENT\.?/gi, 'Creme Dental '],
  [/\bREFRI\.?/gi, 'Refrigerante '],
  [/\bBISC\.?/gi, 'Biscoito '],
  [/\bACHOC\.?/gi, 'Achocolatado '],
  [/\bLEITE\s*COND\.?/gi, 'Leite Condensado '],
  [/\bSCH\.?\b/gi, 'Sache'],
  [/\bPCT\.?\b/gi, 'Pacote'],
  [/\bCX\.?\b/gi, 'Caixa'],
  [/\bLT\.?\b/gi, 'Lata'],
  [/\bGF\.?\b/gi, 'Garrafa'],
  [/\bFD\.?\b/gi, 'Fardo']
];

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'a', 'o', 'as', 'os']);

function titleCaseWord(word, index) {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (/^\d/.test(word)) {
    return word.replace(/(kg|ml|g|l|un)$/i, (unit) => unit.toLowerCase() === 'l' ? 'L' : unit.toLowerCase());
  }
  if (/^(kg|ml|g|l|un)$/i.test(word)) return lower === 'l' ? 'L' : lower;
  if (index > 0 && SMALL_WORDS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function beautifyProductName(raw) {
  let name = String(raw || '').trim();
  if (!name) return '';

  name = name.replace(/^#+/, '').trim();

  for (const [pattern, replacement] of ABBREVIATIONS) {
    name = name.replace(pattern, replacement);
  }

  name = name
    .replace(/(?<=\D)\.(?=\D)/g, ' ')
    .replace(/(?<=\D)\.(?=\d)/g, ' ')
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = name.split(' ').filter(Boolean);
  name = words.map((word, index) => titleCaseWord(word, index)).join(' ');

  return name.slice(0, 160);
}
