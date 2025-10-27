// preload.cjs - PRODUCTION READY
const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload.cjs loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window control APIs
  trayClick: () => ipcRenderer?.send('tray-clicked'),
  minimize: () => ipcRenderer?.send('window-minimize'),
  maximize: () => ipcRenderer?.send('window-maximize'),
  close: () => ipcRenderer?.send('window-close'),
  requestWindowState: () => ipcRenderer?.send('request-window-state'),
  onWindowState: (callback) => {
    if (!ipcRenderer) return () => {};
    const listener = (_event, isMax) => callback(isMax);
    ipcRenderer.on('window-is-maximized', listener);
    return () => ipcRenderer.removeListener('window-is-maximized', listener);
  },

  // Screenshot APIs
  screenshots: {
    // Get all screenshot metadata
    getMetadata: () => ipcRenderer?.invoke('get-screenshot-metadata'),
    
    // Get screenshot file as base64
    getFile: (filename) => ipcRenderer?.invoke('get-screenshot-file', filename),
    
    // Start screenshot capture
    start: () => ipcRenderer?.invoke('start-screenshot-capture'),
    
    // Stop screenshot capture
    stop: () => ipcRenderer?.invoke('stop-screenshot-capture'),
    
    // Set authentication token and user data
    setToken: (tokenData) => ipcRenderer?.invoke('set-screenshot-token', tokenData),
    
    // Get capture status
    getStatus: () => ipcRenderer?.invoke('get-screenshot-status')
  },
  // Owner cookie token fallback
  ownerCookies: {
    getTokenFromCookies: (domain, names) => ipcRenderer?.invoke('get-owner-token-from-cookies', { domain, names }),
    getLatestCapturedToken: () => ipcRenderer?.invoke('get-latest-owner-cookie-token')
  },
  ownerExchange: {
    exchange: (initialToken, site, credentials) => ipcRenderer?.invoke('exchange-owner-token', { initialToken, site, credentials })
  },
  ownerReplay: {
    replay: (url, body, headers, initialToken) => ipcRenderer?.invoke('replay-owner-graphql', { url, body, headers, initialToken })
  }
});