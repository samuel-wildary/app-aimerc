const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_API = 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api';

let mainWindow = null;
let agentModule = null;
let agent = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    let password = '';
    if (raw.passwordEncrypted && safeStorage.isEncryptionAvailable()) {
      password = safeStorage.decryptString(Buffer.from(raw.passwordEncrypted, 'base64'));
    }
    return {
      apiUrl: raw.apiUrl || DEFAULT_API,
      email: raw.email || '',
      password,
      printerHost: raw.printerHost || '',
      printerPort: raw.printerPort || 9100
    };
  } catch {
    return {
      apiUrl: DEFAULT_API,
      email: '',
      password: '',
      printerHost: '',
      printerPort: 9100
    };
  }
}

function saveConfig(config) {
  const payload = {
    apiUrl: config.apiUrl || DEFAULT_API,
    email: config.email || '',
    printerHost: config.printerHost || '',
    printerPort: Number(config.printerPort || 9100)
  };
  if (config.password && safeStorage.isEncryptionAvailable()) {
    payload.passwordEncrypted = safeStorage.encryptString(config.password).toString('base64');
  }
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(payload, null, 2));
}

async function loadAgentModule() {
  if (agentModule) return agentModule;
  agentModule = await import(path.join(__dirname, '..', 'src', 'agent-core.js'));
  return agentModule;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 460,
    minHeight: 640,
    title: 'AiMerc Pedidos Agent',
    backgroundColor: '#0f1f1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function pushStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('agent:status', agent ? agent.getStatus() : { connected: false, logs: [] });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (agent) await agent.stop();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('config:load', () => loadConfig());

ipcMain.handle('config:save', (_event, config) => {
  saveConfig(config || {});
  return true;
});

ipcMain.handle('printers:discover', async () => {
  const mod = await loadAgentModule();
  return mod.discoverThermalPrinters({
    onProgress: progress => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('printers:progress', progress);
    }
  });
});

ipcMain.handle('printers:test', async (_event, config) => {
  const mod = await loadAgentModule();
  await mod.testPrinterConnection({
    host: config.printerHost,
    port: config.printerPort || 9100,
    storeName: 'AiMerc'
  });
  return true;
});

ipcMain.handle('agent:connect', async (_event, config) => {
  saveConfig(config);
  const mod = await loadAgentModule();
  if (!agent) {
    agent = new mod.OrdersAgent();
    agent.onChange(() => pushStatus());
  }
  await agent.start(config);
  pushStatus();
  return agent.getStatus();
});

ipcMain.handle('agent:disconnect', async () => {
  if (agent) await agent.stop();
  pushStatus();
  return agent ? agent.getStatus() : { connected: false };
});

ipcMain.handle('agent:status', () => (agent ? agent.getStatus() : { connected: false, logs: [] }));
