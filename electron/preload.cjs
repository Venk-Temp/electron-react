// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload.cjs loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  trayClick: () => ipcRenderer?.send('tray-clicked'),
  minimize: () => ipcRenderer?.send('window-minimize'),
  maximize: () => ipcRenderer?.send('window-maximize'),
  close: () => ipcRenderer?.send('window-close'),

  // request initial window state
  requestWindowState: () => ipcRenderer?.send('request-window-state'),

  // subscribe to window-is-maximized events from main
  onWindowState: (callback) => {
    if (!ipcRenderer) return () => {};
    const listener = (_event, isMax) => callback(isMax);
    ipcRenderer.on('window-is-maximized', listener);
    return () => ipcRenderer.removeListener('window-is-maximized', listener);
  }
});
