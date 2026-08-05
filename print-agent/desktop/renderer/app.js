const email = document.getElementById('email');
const password = document.getElementById('password');
const apiUrl = document.getElementById('apiUrl');
const printerSelect = document.getElementById('printerSelect');
const printerHost = document.getElementById('printerHost');
const scanBtn = document.getElementById('scanBtn');
const scanStatus = document.getElementById('scanStatus');
const testBtn = document.getElementById('testBtn');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusPill = document.getElementById('statusPill');
const message = document.getElementById('message');
const logList = document.getElementById('logList');

function currentConfig() {
  return {
    apiUrl: apiUrl.value.trim(),
    email: email.value.trim(),
    password: password.value,
    printerHost: printerHost.value.trim() || printerSelect.value.trim(),
    printerPort: 9100
  };
}

function setMessage(text, type = '') {
  message.textContent = text || '';
  message.className = `message ${type}`.trim();
}

function renderLogs(logs = []) {
  logList.innerHTML = logs.slice(0, 20).map(entry => `
    <div class="log-item">
      <small>${new Date(entry.timestamp).toLocaleTimeString('pt-BR')} · ${entry.level}</small>
      <div>${entry.message}${entry.orderId ? ` (#${entry.orderId})` : ''}</div>
    </div>
  `).join('') || '<div class="hint">Sem atividade ainda.</div>';
}

function renderStatus(status = {}) {
  const online = Boolean(status.connected);
  statusPill.textContent = online ? `Conectado · ${status.storeName || 'loja'}` : 'Desconectado';
  statusPill.className = `pill ${online ? 'online' : 'offline'}`;
  connectBtn.disabled = online;
  disconnectBtn.disabled = !online;
  renderLogs(status.logs || []);
}

function fillPrinters(printers = [], selected = '') {
  const options = ['<option value="">Selecione uma impressora</option>']
    .concat(printers.map(item => `<option value="${item.host}">${item.label || item.host}</option>`));
  if (selected && !printers.some(item => item.host === selected)) {
    options.push(`<option value="${selected}">Termica ${selected}</option>`);
  }
  printerSelect.innerHTML = options.join('');
  if (selected) {
    printerSelect.value = selected;
    printerHost.value = selected;
  }
}

printerSelect.addEventListener('change', () => {
  if (printerSelect.value) printerHost.value = printerSelect.value;
});

scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  scanStatus.textContent = 'Buscando impressoras na rede (porta 9100)...';
  setMessage('');
  try {
    const printers = await window.aimercAgent.discoverPrinters();
    fillPrinters(printers, printerHost.value.trim());
    scanStatus.textContent = printers.length
      ? `${printers.length} impressora(s) encontrada(s).`
      : 'Nenhuma termica encontrada. Confira se ela esta ligada na mesma rede e digite o IP.';
  } catch (error) {
    scanStatus.textContent = 'Falha na busca.';
    setMessage(error.message || 'Falha ao buscar impressoras', 'error');
  } finally {
    scanBtn.disabled = false;
  }
});

window.aimercAgent.onPrinterProgress(progress => {
  scanStatus.textContent = `Buscando... ${progress.found || 0} encontrada(s). Ultimo IP testado: ${progress.host}`;
  if (progress.printers?.length) fillPrinters(progress.printers, printerHost.value.trim());
});

testBtn.addEventListener('click', async () => {
  testBtn.disabled = true;
  setMessage('Enviando cupom de teste...');
  try {
    await window.aimercAgent.testPrinter(currentConfig());
    setMessage('Teste enviado para a impressora.', 'ok');
  } catch (error) {
    setMessage(error.message || 'Falha no teste', 'error');
  } finally {
    testBtn.disabled = false;
  }
});

connectBtn.addEventListener('click', async () => {
  const config = currentConfig();
  if (!config.email || !config.password) {
    setMessage('Preencha e-mail e senha do painel.', 'error');
    return;
  }
  connectBtn.disabled = true;
  setMessage('Conectando...');
  try {
    await window.aimercAgent.saveConfig(config);
    const status = await window.aimercAgent.connect(config);
    renderStatus(status);
    setMessage('Agent conectado. Pedidos novos serao impressos automaticamente.', 'ok');
  } catch (error) {
    setMessage(error.message || 'Falha ao conectar', 'error');
    connectBtn.disabled = false;
  }
});

disconnectBtn.addEventListener('click', async () => {
  const status = await window.aimercAgent.disconnect();
  renderStatus(status);
  setMessage('Desconectado.');
});

window.aimercAgent.onStatus(renderStatus);

(async function init() {
  const config = await window.aimercAgent.loadConfig();
  email.value = config.email || '';
  password.value = config.password || '';
  apiUrl.value = config.apiUrl || '';
  printerHost.value = config.printerHost || '';
  fillPrinters(config.printerHost ? [{ host: config.printerHost, label: `Termica ${config.printerHost}` }] : [], config.printerHost || '');
  renderStatus(await window.aimercAgent.status());
})();
