const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aimercAgent', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: config => ipcRenderer.invoke('config:save', config),
  discoverPrinters: () => ipcRenderer.invoke('printers:discover'),
  testPrinter: config => ipcRenderer.invoke('printers:test', config),
  connect: config => ipcRenderer.invoke('agent:connect', config),
  disconnect: () => ipcRenderer.invoke('agent:disconnect'),
  status: () => ipcRenderer.invoke('agent:status'),
  serviceStatus: () => ipcRenderer.invoke('service:status'),
  installService: config => ipcRenderer.invoke('service:install', config),
  uninstallService: () => ipcRenderer.invoke('service:uninstall'),
  onStatus: handler => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('agent:status', listener);
    return () => ipcRenderer.removeListener('agent:status', listener);
  },
  onPrinterProgress: handler => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('printers:progress', listener);
    return () => ipcRenderer.removeListener('printers:progress', listener);
  }
});
