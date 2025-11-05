// electron-main.js - WITH AUTO-LOGIN SUPPORT
import { app, BrowserWindow, ipcMain, dialog, Menu, shell, Tray, nativeImage, protocol, session } from "electron";
import fetch from "node-fetch";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { getScreenshotMetadata, getScreenshotPath } from "./modules/screenshot-capture.js";
import { 
  initializeAuth, 
  handleLoginSuccess, 
  handleLogout, 
  resumeSession, 
  cleanup 
} from "./modules/auth-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let splashWindow = null;
let tray = null;
let latestOwnerCookieToken = null;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

console.log("=== Electron Environment ===");
console.log("Platform:", process.platform);
console.log("isDev:", isDev);
console.log("app.isPackaged:", app.isPackaged);

if (process.platform === "win32") {
  app.setAppUserModelId("com.amdital.desktop");
}

// ============================================================================
// PATH HELPERS
// ============================================================================
function fileExists(p) {
  try {
    return p && fs.existsSync(p);
  } catch {
    return false;
  }
}

function getAssetPath(assetPath) {
  const locations = isDev
    ? [path.join(__dirname, "..", "public", assetPath)]
    : [
        path.join(process.resourcesPath, "assets", assetPath),
        path.join(process.resourcesPath, assetPath),
        path.join(__dirname, "..", "public", assetPath)
      ];
  
  for (const loc of locations) {
    if (fileExists(loc)) return loc;
  }
  return null;
}

function getWindowIconPath() {
  return getAssetPath("icons/logo.png");
}

function getTrayIcon() {
  const iconPath = getAssetPath("icons/logo.png");
  if (!iconPath) return null;
  
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (process.platform === "win32") return icon.resize({ width: 16, height: 16 });
    if (process.platform === "darwin") return icon.resize({ width: 22, height: 22 });
    return icon;
  } catch {
    return null;
  }
}

function getPreloadPath() {
  const locations = isDev
    ? [path.join(__dirname, "preload.cjs")]
    : [
        path.join(process.resourcesPath, "app.asar.unpacked", "electron", "preload.cjs"),
        path.join(__dirname, "preload.cjs")
      ];
  
  for (const loc of locations) {
    if (fileExists(loc)) return loc;
  }
  return null;
}

function getSplashPath() {
  return getAssetPath("splash/splash.html");
}

function getSplashLogoPath() {
  const logoPath = getAssetPath("splash/splash.png");
  return logoPath ? `file://${logoPath}` : null;
}

// ============================================================================
// IPC HANDLERS - WINDOW CONTROL
// ============================================================================
ipcMain.on("get-splash-logo-path", (event) => {
  event.returnValue = getSplashLogoPath();
});

ipcMain.on("window-minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  mainWindow.webContents.send("window-is-maximized", mainWindow.isMaximized());
});

ipcMain.on("window-close", async () => {
  if (!mainWindow) return;
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Yes", "No"],
    defaultId: 1,
    title: "Confirm Exit",
    message: "Are you sure you want to quit Amdital Desktop?"
  });
  if (choice.response === 0) app.quit();
});

ipcMain.on("request-window-state", () => {
  if (mainWindow) {
    mainWindow.webContents.send("window-is-maximized", mainWindow.isMaximized());
  }
});

// ============================================================================
// IPC HANDLERS - AUTH
// ============================================================================
ipcMain.handle("check-saved-auth", async () => {
  try {
    const authInit = initializeAuth();
    return authInit;
  } catch (err) {
    console.error("❌ Error checking saved auth:", err);
    return { autoLogin: false, authData: null };
  }
});

ipcMain.handle("save-auth-data", async (event, authData) => {
  try {
    const result = await handleLoginSuccess(authData);
    return result;
  } catch (err) {
    console.error("❌ Error saving auth data:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("logout", async () => {
  try {
    const result = await handleLogout();
    return result;
  } catch (err) {
    console.error("❌ Error during logout:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("resume-session", async (event, authData) => {
  try {
    const result = await resumeSession(authData);
    return result;
  } catch (err) {
    console.error("❌ Error resuming session:", err);
    return { success: false, error: err.message };
  }
});

// ============================================================================
// IPC HANDLERS - SCREENSHOTS
// ============================================================================
ipcMain.handle("get-screenshot-metadata", async () => {
  try {
    return getScreenshotMetadata();
  } catch {
    return { screenshots: [] };
  }
});

ipcMain.handle("get-screenshot-file", async (event, filename) => {
  try {
    const filepath = getScreenshotPath(filename);
    const data = await fs.readFile(filepath);
    return data.toString('base64');
  } catch {
    return null;
  }
});

ipcMain.handle('get-latest-owner-cookie-token', async () => {
  const result = latestOwnerCookieToken ? { ...latestOwnerCookieToken } : null;
  latestOwnerCookieToken = null;
  return result;
});

ipcMain.handle("get-owner-token-from-cookies", async (event, { domain, names }) => {
  try {
    const ses = session.fromPartition('persist:main');
    if (!ses) return { success: false, error: 'Session not found' };
    if (!domain) return { success: false, error: 'Domain required' };
    
    const url = `https://${domain}`;
    const cookies = await ses.cookies.get({ url });
    const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
    
    if (Array.isArray(names) && names.length) {
      for (const name of names) {
        const c = cookies.find(x => x.name === name);
        if (c && jwtRegex.test(c.value)) {
          return { success: true, token: c.value, source: 'cookie', name };
        }
      }
    }
    
    const anyJwt = cookies.find(x => jwtRegex.test(x.value));
    if (anyJwt) {
      return { success: true, token: anyJwt.value, source: 'cookie', name: anyJwt.name };
    }
    return { success: false, error: 'No suitable cookie token found' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============================================================================
// EXCHANGE OWNER TOKEN
// ============================================================================
ipcMain.handle("exchange-owner-token", async (event, { initialToken, site, credentials }) => {
  try {
    if (!initialToken || !site) {
      return { success: false, error: "Missing initial token or site" };
    }

    const rawBase = site.url || site.old_api_url || (site.domain ? `https://${site.domain}/wp` : null) || site.app_url;
    if (!rawBase) return { success: false, error: "No valid site base URL" };
    
    const cleanBase = rawBase.replace(/\/wp\/?$/i, '/wp').replace(/\/$/, '');
    const rootBase = cleanBase.replace(/\/wp$/i, '');
    const candidateEndpoints = [
      `${cleanBase}/graphql`,
      `${cleanBase}/api/v1`,
      `${rootBase}/graphql`,
      `${rootBase}/wp/api/v1`
    ];

    const headersCommon = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(site.amdital_api_key ? { 'X-Amdital-API-Key': site.amdital_api_key } : {})
    };
    
    const headersWithAuth = { ...headersCommon, 'Authorization': `Bearer ${initialToken}` };

    // Try credential-based login first
    if (credentials?.username && credentials?.password) {
      const loginQuery = `mutation LoginUser($username: String!, $password: String!) {
        login(input: {
          clientMutationId: "amdital_desktop_app",
          username: $username,
          password: $password
        }) {
          authToken
          user {
            id name email userId
            roles { nodes { name } }
            onboardingStatus onboardingStep companyId
            firstName lastName userDesignation userRole
            profileImage memberID department slackUserId
            sites {
              blogId domain url app_url old_api_url old_app_url amdital_api_key
            }
          }
        }
      }`;
      
      const variables = { username: credentials.username, password: credentials.password };
      
      for (const ep of candidateEndpoints) {
        try {
          const res = await fetch(ep, { 
            method: 'POST', 
            headers: headersCommon, 
            body: JSON.stringify({ query: loginQuery, variables }), 
            timeout: 20000 
          });
          
          const text = await res.text();
          let data;
          try { data = JSON.parse(text); } catch { continue; }
          
          const token = data?.data?.login?.authToken;
          if (res.ok && token && typeof token === 'string' && token.split('.').length === 3) {
            console.log('✅ Owner token obtained via credentials');
            return { success: true, ownerAuthToken: token, endpoint: ep };
          }
        } catch (e) {
          continue;
        }
      }
    }

    return { success: false, error: 'Owner token exchange failed' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============================================================================
// WINDOW CREATION
// ============================================================================
function createSplash() {
  const splashPath = getSplashPath();
  if (!splashPath) {
    createMainWindow();
    return;
  }

  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    show: false,
    icon: getWindowIconPath(),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  splashWindow.loadFile(splashPath)
    .then(() => {
      splashWindow.show();
      setTimeout(() => createMainWindow(), 100);
    })
    .catch(() => createMainWindow());
}

function createMainWindow() {
  const preloadPath = getPreloadPath();
  if (!preloadPath) {
    console.error("❌ Cannot create window without preload script!");
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    resizable: true,
    show: false,
    icon: getWindowIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      devTools: isDev,
      preload: preloadPath
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173").catch(err => {
      dialog.showErrorBox("Dev Server Error", "Failed to connect to Vite dev server");
    });
  } else {
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    if (fileExists(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      mainWindow.loadURL("data:text/html,<h2>Error: index.html not found</h2>");
    }
  }

  mainWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.webContents.send("window-is-maximized", mainWindow.isMaximized());
  });

  setupMenu();
  setupTray();

  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window-is-maximized", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window-is-maximized", false);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ============================================================================
// MENU & TRAY
// ============================================================================
function setupMenu() {
  const template = [
    { label: "File", submenu: [{ role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupTray() {
  const trayIcon = getTrayIcon();
  if (!trayIcon) return;
  
  try {
    tray = new Tray(trayIcon);
    tray.setToolTip("Amdital Desktop");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Show App", click: () => mainWindow?.show() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ]));
    tray.on("click", () => mainWindow?.show());
  } catch {}
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================
app.whenReady().then(() => {
  protocol.registerFileProtocol('screenshot', (request, callback) => {
    const url = request.url.substr(13);
    callback({ path: path.normalize(url) });
  });
  
  // Cookie sniffer for owner tokens
  try {
    const ses = session.fromPartition('persist:main');
    if (ses?.webRequest) {
      ses.webRequest.onHeadersReceived({ urls: ['*://*.amdital.*/*', '*://*.diginnovators.*/*'] }, 
        (details, callback) => {
          try {
            const setCookie = details.responseHeaders?.['set-cookie'] || [];
            const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
            
            for (const cookie of setCookie) {
              const match = String(cookie).match(/(token|jwt|authToken)=([^;\s]+)/i);
              if (match && jwtRegex.test(match[2])) {
                latestOwnerCookieToken = { token: match[2], name: match[1] };
                break;
              }
            }
          } catch {}
          callback({ cancel: false, responseHeaders: details.responseHeaders });
        }
      );
    }
  } catch {}

  createSplash();
});

app.on("window-all-closed", () => {
  cleanup();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("before-quit", () => {
  cleanup();
});

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});