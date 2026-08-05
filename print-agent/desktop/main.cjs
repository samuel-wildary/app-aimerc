const { app, BrowserWindow, ipcMain, safeStorage, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const DEFAULT_API = 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api';
const LAUNCH_AGENT_LABEL = 'br.com.aimerc.pedidos-agent';
const isBackground = process.argv.includes('--background') || process.argv.includes('--service');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    createWindow();
  });
}

let mainWindow = null;
let tray = null;
let agentModule = null;
let agent = null;
let quitting = false;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function launchAgentPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);
}

function executablePath() {
  return process.execPath;
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
      printerPort: raw.printerPort || 9100,
      autoStart: Boolean(raw.autoStart)
    };
  } catch {
    return {
      apiUrl: DEFAULT_API,
      email: '',
      password: '',
      printerHost: '',
      printerPort: 9100,
      autoStart: false
    };
  }
}

function saveConfig(config) {
  const current = loadConfig();
  const next = {
    apiUrl: config.apiUrl || current.apiUrl || DEFAULT_API,
    email: config.email ?? current.email ?? '',
    printerHost: config.printerHost ?? current.printerHost ?? '',
    printerPort: Number(config.printerPort || current.printerPort || 9100),
    autoStart: config.autoStart != null ? Boolean(config.autoStart) : Boolean(current.autoStart)
  };

  if (config.password) {
    if (safeStorage.isEncryptionAvailable()) {
      next.passwordEncrypted = safeStorage.encryptString(config.password).toString('base64');
    }
  } else if (current.password && safeStorage.isEncryptionAvailable()) {
    next.passwordEncrypted = safeStorage.encryptString(current.password).toString('base64');
  }

  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return { ...next, password: config.password || current.password || '' };
}

async function loadAgentModule() {
  if (agentModule) return agentModule;
  agentModule = await import(path.join(__dirname, '..', 'src', 'agent-core.js'));
  return agentModule;
}

function buildLaunchAgentPlist() {
  const program = executablePath();
  const escape = value => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escape(program)}</string>
    <string>--background</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${escape(path.dirname(program))}</string>
  <key>StandardOutPath</key>
  <string>${escape(path.join(app.getPath('userData'), 'service.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escape(path.join(app.getPath('userData'), 'service.err.log'))}</string>
</dict>
</plist>
`;
}

async function isAutoStartInstalled() {
  if (process.platform === 'win32') {
    return Boolean(app.getLoginItemSettings({ path: executablePath(), args: ['--background'] }).openAtLogin);
  }
  if (process.platform !== 'darwin') return false;
  try {
    await fs.promises.access(launchAgentPath());
    return true;
  } catch {
    return false;
  }
}

async function installAutoStart() {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: executablePath(),
      args: ['--background']
    });
    saveConfig({ ...loadConfig(), autoStart: true });
    return true;
  }
  if (process.platform !== 'darwin') {
    throw new Error('Inicio automatico disponivel no Windows e macOS.');
  }
  const plist = buildLaunchAgentPlist();
  const target = launchAgentPath();
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, plist, 'utf8');
  try {
    await execFileAsync('launchctl', ['unload', target]);
  } catch {}
  await execFileAsync('launchctl', ['load', target]);
  saveConfig({ ...loadConfig(), autoStart: true });
  return true;
}

async function uninstallAutoStart() {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: false,
      path: executablePath(),
      args: ['--background']
    });
    saveConfig({ ...loadConfig(), autoStart: false });
    return false;
  }
  if (process.platform !== 'darwin') return false;
  const target = launchAgentPath();
  try {
    await execFileAsync('launchctl', ['unload', target]);
  } catch {}
  try {
    await fs.promises.unlink(target);
  } catch {}
  saveConfig({ ...loadConfig(), autoStart: false });
  return false;
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 460,
    minHeight: 640,
    title: 'AiMerc Pedidos Agent',
    backgroundColor: '#0f1f1a',
    show: !isBackground,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', event => {
    if (quitting) return;
    // Keep service alive: closing the window only hides it.
    event.preventDefault();
    mainWindow.hide();
  });

  return mainWindow;
}

function trayImage() {
  const iconPath = path.join(__dirname, 'trayTemplate.png');
  const image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) {
    image.setTemplateImage(true);
    return image;
  }
  return nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAPUlEQVR4nO3OMQEAIAwDsIF/z6FbCkYgCwQAAAAA4N8yVwAAAAAAAAAAAAAAAOBXCwAAAAAAAAAA4NsycQDlqgEAb0sG0QAAAABJRU5ErkJggg==');
}

function updateTrayMenu() {
  if (!tray) return;
  const status = agent ? agent.getStatus() : { connected: false, storeName: '' };
  const label = status.connected
    ? `Conectado · ${status.storeName || 'loja'}`
    : 'Desconectado';

  const menu = Menu.buildFromTemplate([
    { label: 'AiMerc Pedidos Agent', enabled: false },
    { label, enabled: false },
    { type: 'separator' },
    {
      label: 'Abrir configuracao',
      click: () => createWindow()
    },
    {
      label: status.connected ? 'Reconectar' : 'Conectar com config salva',
      click: async () => {
        try {
          await startAgentFromSavedConfig();
        } catch (error) {
          dialog.showErrorBox('AiMerc Pedidos Agent', error.message || String(error));
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Sair do agent',
      click: async () => {
        quitting = true;
        try { await uninstallAutoStart(); } catch {}
        if (agent) await agent.stop();
        app.quit();
      }
    }
  ]);
  tray.setToolTip(status.connected ? `AiMerc · ${status.storeName}` : 'AiMerc Pedidos Agent');
  tray.setContextMenu(menu);
}

function createTray() {
  if (tray) return;
  tray = new Tray(trayImage());
  tray.setToolTip('AiMerc Pedidos Agent');
  tray.on('click', () => createWindow());
  tray.on('double-click', () => createWindow());
  updateTrayMenu();
}

function pushStatus() {
  updateTrayMenu();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('agent:status', agent ? agent.getStatus() : { connected: false, logs: [] });
}

async function ensureAgent() {
  const mod = await loadAgentModule();
  if (!agent) {
    agent = new mod.OrdersAgent();
    agent.onChange(() => pushStatus());
  }
  return agent;
}

async function startAgentFromSavedConfig() {
  const config = loadConfig();
  if (!config.email || !config.password) {
    throw new Error('Configure e-mail e senha antes de iniciar o servico.');
  }
  if (!config.printerHost) {
    throw new Error('Selecione a impressora antes de iniciar o servico.');
  }
  await ensureAgent();
  await agent.start(config);
  pushStatus();
  return agent.getStatus();
}

app.whenReady().then(async () => {
  createTray();

  if (isBackground) {
    try {
      await startAgentFromSavedConfig();
    } catch (error) {
      // Keep process alive for KeepAlive; open UI so user can fix config.
      createWindow();
      dialog.showErrorBox('AiMerc Pedidos Agent', error.message || String(error));
    }
  } else {
    createWindow();
    const config = loadConfig();
    if (config.autoStart && config.email && config.password && config.printerHost) {
      try { await startAgentFromSavedConfig(); } catch {}
    }
  }

  app.on('activate', () => createWindow());
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('window-all-closed', () => {
  // Stay resident in tray/background on all platforms.
});

ipcMain.handle('config:load', async () => {
  const config = loadConfig();
  return {
    ...config,
    autoStartInstalled: await isAutoStartInstalled()
  };
});

ipcMain.handle('config:save', (_event, config) => {
  saveConfig(config || {});
  return true;
});

ipcMain.handle('service:status', async () => ({
  autoStartInstalled: await isAutoStartInstalled(),
  background: isBackground,
  ...(agent ? agent.getStatus() : { connected: false, logs: [] })
}));

ipcMain.handle('service:install', async (_event, config) => {
  if (config) saveConfig({ ...config, autoStart: true });
  await installAutoStart();
  if (!agent?.connected) await startAgentFromSavedConfig();
  return { autoStartInstalled: true, ...(agent ? agent.getStatus() : {}) };
});

ipcMain.handle('service:uninstall', async () => {
  await uninstallAutoStart();
  return { autoStartInstalled: false, ...(agent ? agent.getStatus() : {}) };
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
    storeName: loadConfig().email ? 'AiMerc' : 'AiMerc'
  });
  return true;
});

ipcMain.handle('agent:connect', async (_event, config) => {
  saveConfig({ ...config, autoStart: true });
  await ensureAgent();
  await agent.start(config);
  try { await installAutoStart(); } catch {}
  pushStatus();
  return {
    ...(agent.getStatus()),
    autoStartInstalled: await isAutoStartInstalled()
  };
});

ipcMain.handle('agent:disconnect', async () => {
  if (agent) await agent.stop();
  pushStatus();
  return agent ? agent.getStatus() : { connected: false };
});

ipcMain.handle('agent:status', async () => ({
  ...(agent ? agent.getStatus() : { connected: false, logs: [] }),
  autoStartInstalled: await isAutoStartInstalled()
}));
