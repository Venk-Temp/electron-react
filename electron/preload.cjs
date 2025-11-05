// electron/preload.cjs - WITH AUTH APIS
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window control
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

  // Authentication APIs (NEW)
  auth: {
    checkSavedAuth: () => ipcRenderer?.invoke('check-saved-auth'),
    saveAuthData: (authData) => ipcRenderer?.invoke('save-auth-data', authData),
    logout: () => ipcRenderer?.invoke('logout'),
    resumeSession: (authData) => ipcRenderer?.invoke('resume-session', authData)
  },

  // Screenshot APIs
  screenshots: {
    getMetadata: () => ipcRenderer?.invoke('get-screenshot-metadata'),
    getFile: (filename) => ipcRenderer?.invoke('get-screenshot-file', filename)
  },

  // Owner token exchange
  ownerExchange: {
    exchange: (initialToken, site, credentials) => 
      ipcRenderer?.invoke('exchange-owner-token', { initialToken, site, credentials })
  },

  // Owner cookie fallback
  ownerCookies: {
    getTokenFromCookies: (domain, names) => 
      ipcRenderer?.invoke('get-owner-token-from-cookies', { domain, names }),
    getLatestCapturedToken: () => 
      ipcRenderer?.invoke('get-latest-owner-cookie-token')
  }
});