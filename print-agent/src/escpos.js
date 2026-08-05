const ESC = '\x1b';
const GS = '\x1d';

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function paymentLabel(method) {
  if (method === 'CASH') return 'Dinheiro';
  if (method === 'PIX') return 'Pix';
  return 'Cartao na entrega';
}

function sanitize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '?');
}

function line(char = '-', width = 42) {
  return char.repeat(width);
}

function wrap(text, width = 42) {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word.slice(0, width);
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function row(left, right, width = 42) {
  const leftText = sanitize(left);
  const rightText = sanitize(right);
  const space = Math.max(1, width - leftText.length - rightText.length);
  return `${leftText}${' '.repeat(space)}${rightText}`;
}

export function buildOrderReceipt(order, storeName = 'AiMerc') {
  const createdAt = order?.createdAt
    ? new Date(order.createdAt).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR');
  const fulfillment = order?.fulfillmentType === 'DELIVERY' ? 'ENTREGA' : 'RETIRADA';
  const items = Array.isArray(order?.items) ? order.items : [];
  const chunks = [
    `${ESC}@`,
    `${ESC}a\x01`,
    `${ESC}!\x18`,
    `${sanitize(storeName)}\n`,
    `${ESC}!\x00`,
    'GUIA DE SEPARACAO\n',
    `${ESC}!\x10`,
    `#${sanitize(order?.id || '')}\n`,
    `${ESC}!\x00`,
    `${sanitize(createdAt)}\n`,
    `${ESC}a\x00`,
    `${line()}\n`,
    `${sanitize(order?.customer?.name || 'Cliente')}\n`,
    `${sanitize(order?.customer?.phone || '')}\n`,
    `${line()}\n`,
    `${fulfillment}\n`
  ];

  if (order?.fulfillmentType === 'DELIVERY') {
    for (const part of wrap(order?.customer?.address || 'Endereco nao informado')) chunks.push(`${part}\n`);
    if (order?.customer?.reference) {
      for (const part of wrap(`Ref.: ${order.customer.reference}`)) chunks.push(`${part}\n`);
    }
  } else {
    chunks.push('Retirada na loja\n');
  }

  chunks.push(`${line()}\n`);
  for (const item of items) {
    const qty = `${item.quantity} ${item.unit}`;
    const titleLines = wrap(`${qty} x ${item.name}`, 30);
    titleLines.forEach((part, index) => {
      const isLast = index === titleLines.length - 1;
      chunks.push(`${row(part, isLast ? money(item.total) : '', 42)}\n`);
    });
  }

  chunks.push(`${line()}\n`);
  chunks.push(`${row('Subtotal', money(order?.subtotal), 42)}\n`);
  chunks.push(`${row('Entrega', money(order?.deliveryFee), 42)}\n`);
  chunks.push(`${ESC}!\x08`);
  chunks.push(`${row('TOTAL', money(order?.total), 42)}\n`);
  chunks.push(`${ESC}!\x00`);
  chunks.push(`Pagamento: ${paymentLabel(order?.paymentMethod)}\n`);

  if (order?.notes) {
    chunks.push(`${line()}\n`);
    chunks.push('OBS:\n');
    for (const part of wrap(order.notes)) chunks.push(`${part}\n`);
  }

  chunks.push(`${line()}\n`);
  chunks.push('Separador: ____________________\n');
  chunks.push('Conferente: ___________________\n');
  chunks.push('\n\n\n');
  chunks.push(`${GS}V\x00`);

  return Buffer.from(chunks.join(''), 'ascii');
}

export function buildTestReceipt(storeName = 'AiMerc') {
  return buildOrderReceipt({
    id: 'TESTE',
    createdAt: new Date().toISOString(),
    fulfillmentType: 'PICKUP',
    paymentMethod: 'PIX',
    subtotal: 10,
    deliveryFee: 0,
    total: 10,
    customer: { name: 'Teste Print Agent', phone: '(00) 00000-0000', address: '' },
    items: [{ quantity: 1, unit: 'UN', name: 'Cupom de teste AiMerc', total: 10 }],
    notes: 'Se este papel saiu, a impressora esta ok.'
  }, storeName);
}
