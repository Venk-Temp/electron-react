// electron-main.js - WITH SCREENSHOT FEATURE (UPDATED FOR APP.JSX CONTROL)
import { app, BrowserWindow, ipcMain, dialog, Menu, shell, Tray, nativeImage, protocol, session } from "electron";
import fetch from "node-fetch";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { startScreenshotCapture, stopScreenshotCapture, getScreenshotMetadata, getScreenshotPath } from "./modules/screenshot-capture.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let splashWindow = null;
let tray = null;
let screenshotIntervalId = null; // Store interval ID
let latestOwnerCookieToken = null; // Captured via Set-Cookie

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// const webview = document.getElementById("main-webview");
// webview.addEventListener("dom-ready", () => {
//   webview.openDevTools(); // 👈 opens devtools for webview content
// });


console.log("=== Electron Environment ===");
console.log("Platform:", process.platform);
console.log("isDev:", isDev);
console.log("__dirname:", __dirname);
console.log("app.isPackaged:", app.isPackaged);
console.log("process.resourcesPath:", process.resourcesPath);

if (process.platform === "win32") {
  app.setAppUserModelId("com.amdital.desktop");
}

// ============================================================================
// UNIVERSAL PATH RESOLVER
// ============================================================================

function fileExists(p) {
  try {
    return p && fs.existsSync(p);
  } catch {
    return false;
  }
}

function getAssetPath(assetPath) {
  const locations = [];
  
  if (isDev) {
    locations.push(path.join(__dirname, "..", "public", assetPath));
  } else {
    locations.push(
      path.join(process.resourcesPath, "assets", assetPath),
      path.join(process.resourcesPath, assetPath),
      path.join(__dirname, "..", "public", assetPath)
    );
  }
  
  for (const loc of locations) {
    if (fileExists(loc)) {
      console.log(`✅ Found asset: ${assetPath} at ${loc}`);
      return loc;
    }
  }
  
  console.warn(`⚠️ Asset not found: ${assetPath}`);
  console.warn(`   Searched in:`, locations);
  return null;
}

function getWindowIconPath() {
  const iconPath = getAssetPath("icons/logo.png");
  
  if (!iconPath) {
    console.error("❌ Window icon (logo.png) not found!");
    console.error("   Make sure you have: public/icons/logo.png");
  }
  
  return iconPath;
}

function getTrayIcon() {
  const iconPath = getAssetPath("icons/logo.png");
  
  if (!iconPath) {
    console.warn("⚠️ Tray icon not found");
    return null;
  }
  
  try {
    const icon = nativeImage.createFromPath(iconPath);
    
    if (process.platform === "win32") {
      return icon.resize({ width: 16, height: 16 });
    } else if (process.platform === "darwin") {
      return icon.resize({ width: 22, height: 22 });
    }
    
    return icon;
  } catch (err) {
    console.error("❌ Failed to create tray icon:", err);
    return null;
  }
}

function getPreloadPath() {
  const locations = [];
  
  if (isDev) {
    locations.push(path.join(__dirname, "preload.cjs"));
  } else {
    locations.push(
      path.join(process.resourcesPath, "app.asar.unpacked", "electron", "preload.cjs"),
      path.join(__dirname, "preload.cjs")
    );
  }
  
  for (const loc of locations) {
    if (fileExists(loc)) {
      console.log(`✅ Found preload: ${loc}`);
      return loc;
    }
  }
  
  console.error("❌ preload.cjs not found!");
  console.error("   Searched in:", locations);
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
// IPC HANDLERS
// ============================================================================

ipcMain.on("get-splash-logo-path", (event) => {
  const logoPath = getSplashLogoPath();
  console.log("📷 Splash logo requested:", logoPath);
  event.returnValue = logoPath;
});

ipcMain.on("window-minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-maximize", () => {
  if (!mainWindow) return;
  
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  
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
  
  if (choice.response === 0) {
    app.quit();
  }
});

ipcMain.on("request-window-state", () => {
  if (mainWindow) {
    mainWindow.webContents.send("window-is-maximized", mainWindow.isMaximized());
  }
});

ipcMain.on("tray-clicked", () => {
  if (!mainWindow) return;
  
  const menu = Menu.getApplicationMenu();
  
  if (menu) {
    menu.popup({
      window: mainWindow,
      x: 10,
      y: 40
    });
  }
});

// ============================================================================
// SCREENSHOT IPC HANDLERS
// ============================================================================

ipcMain.handle("get-screenshot-metadata", async () => {
  try {
    return getScreenshotMetadata();
  } catch (err) {
    console.error("❌ Failed to get screenshot metadata:", err);
    return { screenshots: [] };
  }
});

ipcMain.handle("get-screenshot-file", async (event, filename) => {
  try {
    const filepath = getScreenshotPath(filename);
    const data = await fs.readFile(filepath);
    return data.toString('base64');
  } catch (err) {
    console.error("❌ Failed to read screenshot file:", err);
    return null;
  }
});

ipcMain.handle("start-screenshot-capture", async () => {
  try {
    if (screenshotIntervalId) {
      console.log("⚠️ Screenshot capture already running");
      return { success: false, message: "Screenshot capture is already running" };
    }

    // Capture every 60 seconds as per product requirement
    screenshotIntervalId = startScreenshotCapture(60);
    console.log("✅ Screenshot capture started via IPC");
    return { success: true, message: "Screenshot capture started successfully" };
  } catch (err) {
    console.error("❌ Failed to start screenshot capture:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("stop-screenshot-capture", async () => {
  try {
    if (!screenshotIntervalId) {
      console.log("⚠️ Screenshot capture is not running");
      return { success: false, message: "Screenshot capture is not running" };
    }

    stopScreenshotCapture(screenshotIntervalId);
    screenshotIntervalId = null;
    console.log("⏹️ Screenshot capture stopped via IPC");
    return { success: true, message: "Screenshot capture stopped successfully" };
  } catch (err) {
    console.error("❌ Failed to stop screenshot capture:", err);
    return { success: false, error: err.message };
  }
});

// NEW HANDLER 1: Set auth token
ipcMain.handle("set-screenshot-token", async (event, tokenData) => {
  try {
    const { setAuthToken } = await import("./modules/screenshot-capture.js");
    setAuthToken(tokenData);
    console.log("✅ Auth token and user data set for screenshot module");
    return { success: true, message: "Token set successfully" };
  } catch (err) {
    console.error("❌ Failed to set token:", err);
    return { success: false, error: err.message };
  }
});

// NEW HANDLER 2: Get screenshot status
ipcMain.handle("get-screenshot-status", async () => {
  try {
    return {
      success: true,
      isCapturing: screenshotIntervalId !== null,
      hasToken: true
    };
  } catch (err) {
    console.error("❌ Failed to get screenshot status:", err);
    return { success: false, error: err.message };
  }
});

// IPC to fetch and clear latest captured owner cookie token
ipcMain.handle('get-latest-owner-cookie-token', async () => {
  const result = latestOwnerCookieToken ? { ...latestOwnerCookieToken } : null;
  latestOwnerCookieToken = null;
  return result;
});

// NEW HANDLER 3: Read owner token from HttpOnly cookies in 'persist:main' session
ipcMain.handle("get-owner-token-from-cookies", async (event, { domain, names }) => {
  try {
    const ses = session.fromPartition('persist:main');
    if (!ses) return { success: false, error: 'Session not found' };
    if (!domain) return { success: false, error: 'Domain required' };
    const url = `https://${domain}`;
    const cookies = await ses.cookies.get({ url });
    const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
    // 1) Prefer specific names
    if (Array.isArray(names) && names.length) {
      for (const name of names) {
        const c = cookies.find(x => x.name === name);
        if (c && jwtRegex.test(c.value)) {
          return { success: true, token: c.value, source: 'cookie', name };
        }
      }
    }
    // 2) Fallback: any JWT-looking cookie
    const anyJwt = cookies.find(x => jwtRegex.test(x.value));
    if (anyJwt) {
      return { success: true, token: anyJwt.value, source: 'cookie', name: anyJwt.name };
    }
    return { success: false, error: 'No suitable cookie token found', cookiesCount: cookies.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// NEW HANDLER 4: Exchange initial token for owner token via owner API
ipcMain.handle("exchange-owner-token", async (event, { initialToken, site, credentials }) => {
  try {
    console.log('🔄 Exchange request received:', { 
      hasToken: !!initialToken, 
      hasSite: !!site, 
      hasCreds: !!credentials,
      username: credentials?.username 
    });
    
    if (!initialToken || !site) {
      return { success: false, error: "Missing initial token or site" };
    }

    // Build candidate GraphQL endpoints derived from site data
    const rawBase = site.old_api_url || site.url || (site.domain ? `https://${site.domain}/wp` : null) || site.app_url;
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
    
    const headersWithAuth = {
      ...headersCommon,
      'Authorization': `Bearer ${initialToken}`
    };

    // GraphQL candidate mutations – minimal selections to reduce schema mismatch
    const gqlCandidates = [
      'mutation { login { authToken } }',
      'mutation { login { authToken user { userId email name } } }',
      'mutation { loginWithToken { authToken } }',
      'mutation { refreshToken { authToken } }'
    ];

    let lastErr = null;

    // If username/password available, try explicit LoginUser first across endpoints
    if (credentials?.username && credentials?.password) {
      console.log('🔑 Attempting credential-based login with:', credentials.username);
      
      // Use the exact GraphQL query from your browser example
      const loginQuery = `mutation LoginUser($username: String!, $password: String!) {
        login(input: {
          clientMutationId: "asdww",
          username: $username,
          password: $password
        }) {
          authToken
          user {
            id
            name
            email
            userId
            roles {
              nodes {
                name
              }
            }
            onboardingStatus
            onboardingStep
            companyId
            firstName
            lastName
            userDesignation
            userRole
            profileImage
            memberID
            department
            slackUserId
            sites{
              blogId
              domain
              url
              app_url
              old_api_url
              old_app_url
              amdital_api_key
            }
          }
        }
      }`;
      
      const variables = { username: credentials.username, password: credentials.password };
      const requestBody = JSON.stringify({ query: loginQuery, variables });
      console.log('📤 Request body length:', requestBody.length);
      console.log('📤 Request body preview:', requestBody.substring(0, 200) + '...');
      
      for (const ep of candidateEndpoints) {
        try {
          console.log('🌐 Trying endpoint:', ep);
          console.log('📋 Headers (no auth for fresh login):', JSON.stringify(headersCommon, null, 2));
          const res = await fetch(ep, { method: 'POST', headers: headersCommon, body: requestBody, timeout: 20000 });
          const text = await res.text();
          console.log('📥 Response status:', res.status);
          console.log('📥 Response body:', text.substring(0, 500) + '...');
          
          let data; try { data = JSON.parse(text); } catch { data = null; }
          const token = data?.data?.login?.authToken;
          if (res.ok && token && typeof token === 'string' && token.split('.').length === 3) {
            console.log('✅ Owner token obtained via credentials!');
            return { success: true, ownerAuthToken: token, endpoint: ep, status: res.status };
          }
          lastErr = `HTTP ${res.status} @ ${ep}: ${text?.slice(0, 200)}`;
        } catch (e) {
          console.log('❌ Request failed:', e.message);
          lastErr = `${e.message} @ ${ep}`;
        }
      }
    } else {
      console.log('⚠️ No credentials available for owner exchange');
    }
    // Try GraphQL mutations across candidate endpoints first
    for (const ep of candidateEndpoints) {
      for (const query of gqlCandidates) {
        try {
          const res = await fetch(ep, { method: 'POST', headers: headersWithAuth, body: JSON.stringify({ query }), timeout: 20000 });
          const text = await res.text();
          let data;
          try { data = JSON.parse(text); } catch { data = null; }
          const token = data?.data?.login?.authToken || data?.data?.loginWithToken?.authToken || data?.data?.refreshToken?.authToken;
          if (res.ok && token && typeof token === 'string' && token.split('.').length === 3) {
            return { success: true, ownerAuthToken: token, endpoint: ep, status: res.status };
          }
          lastErr = `HTTP ${res.status} @ ${ep}: ${text?.slice(0, 200)}`;
        } catch (e) {
          lastErr = `${e.message} @ ${ep}`;
        }
      }
    }

    // Fallback attempts if GraphQL mutations above fail
    const attempts = [
      { method: 'POST', body: JSON.stringify({ token: initialToken }) },
      { method: 'POST', body: JSON.stringify({}) },
      { method: 'GET' }
    ];

    for (const ep of candidateEndpoints) {
      for (const attempt of attempts) {
        try {
          const res = await fetch(ep, { method: attempt.method, headers: headersWithAuth, body: attempt.body, timeout: 20000 });
          const text = await res.text();
          let data;
          try { data = JSON.parse(text); } catch { data = null; }
          const token = data?.data?.login?.authToken || data?.data?.loginWithToken?.authToken || data?.data?.refreshToken?.authToken;
          if (res.ok && token && typeof token === 'string' && token.split('.').length === 3) {
            return { success: true, ownerAuthToken: token, endpoint: ep, status: res.status };
          }
          lastErr = `HTTP ${res.status} @ ${ep}: ${text?.slice(0, 200)}`;
        } catch (e) {
          lastErr = `${e.message} @ ${ep}`;
        }
      }
    }

    return { success: false, error: lastErr || 'Exchange failed' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// NEW HANDLER 5: Replay captured owner domain GraphQL/REST request and extract token
ipcMain.handle("replay-owner-graphql", async (event, { url, body, headers, initialToken }) => {
  try {
    if (!url || !body) return { success: false, error: 'Missing url or body' };
    const reqHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(headers || {})
    };
    // Ensure Authorization header
    if (initialToken) reqHeaders['Authorization'] = `Bearer ${initialToken}`;
    const res = await fetch(url, { method: 'POST', headers: reqHeaders, body: typeof body === 'string' ? body : JSON.stringify(body), timeout: 20000 });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    const token = data?.data?.login?.authToken || data?.data?.loginWithToken?.authToken || data?.data?.refreshToken?.authToken;
    if (res.ok && token && typeof token === 'string' && token.split('.').length === 3) {
      return { success: true, ownerAuthToken: token, status: res.status };
    }
    return { success: false, error: `HTTP ${res.status}: ${text.slice(0,200)}` };
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
    console.warn("⚠️ Splash screen not found, skipping...");
    createMainWindow();
    return;
  }

  const iconPath = getWindowIconPath();

  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    show: false,
    icon: iconPath,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  splashWindow.loadFile(splashPath)
    .then(() => {
      console.log("✅ Splash screen loaded");
      splashWindow.show();
      setTimeout(() => createMainWindow(), 100);
    })
    .catch((err) => {
      console.error("❌ Failed to load splash:", err);
      createMainWindow();
    });
}

function createMainWindow() {
  const iconPath = getWindowIconPath();
  const preloadPath = getPreloadPath();

  console.log("🚀 Creating main window...");
  console.log("   Icon path:", iconPath);
  console.log("   Preload path:", preloadPath);

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
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      devTools: isDev,
      preload: preloadPath
    }
  });

  if (process.platform === "darwin" && iconPath && app.dock) {
    try {
      app.dock.setIcon(iconPath);
    } catch (err) {
      console.warn("⚠️ Failed to set dock icon:", err.message);
    }
  }

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173").catch(err => {
      console.error("❌ Failed to load dev URL:", err);
      dialog.showErrorBox(
        "Development Server Error",
        "Failed to connect to http://localhost:5173\n\nMake sure Vite dev server is running."
      );
    });
  } else {
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    console.log("📂 Loading index.html from:", indexPath);
    
    if (fileExists(indexPath)) {
      mainWindow.loadFile(indexPath).catch(err => {
        console.error("❌ Failed to load index.html:", err);
      });
    } else {
      console.error("❌ index.html not found at:", indexPath);
      mainWindow.loadURL("data:text/html,<h2>Error: index.html not found</h2>");
    }
  }

  mainWindow.once("ready-to-show", () => {
    console.log("✅ Main window ready");
    
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    
    mainWindow.show();
    mainWindow.webContents.send("window-is-maximized", mainWindow.isMaximized());
  });

  if (!isDev) {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools();
    });
  }

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
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    }] : []),
    {
      label: "File",
      submenu: [
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac ? [
          { role: "pasteAndMatchStyle" },
          { role: "delete" },
          { role: "selectAll" },
          { type: "separator" },
          {
            label: "Speech",
            submenu: [
              { role: "startSpeaking" },
              { role: "stopSpeaking" }
            ]
          }
        ] : [
          { role: "delete" },
          { type: "separator" },
          { role: "selectAll" }
        ])
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(isDev ? [{ role: "toggleDevTools" }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "window" }
        ] : [
          { role: "close" }
        ])
      ]
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            await shell.openExternal("https://amdital.com");
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupTray() {
  const trayIcon = getTrayIcon();
  
  if (!trayIcon) {
    console.warn("⚠️ Tray icon not available, skipping tray setup");
    return;
  }

  try {
    tray = new Tray(trayIcon);
    tray.setToolTip("Amdital Desktop");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show App",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on("click", () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      }
    });

    console.log("✅ Tray setup complete");
  } catch (err) {
    console.error("❌ Failed to setup tray:", err);
  }
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(() => {
  console.log("🚀 App is ready");
  
  protocol.registerFileProtocol('screenshot', (request, callback) => {
    const url = request.url.substr(13); // Remove 'screenshot://'
    callback({ path: path.normalize(url) });
  });
  
  // Initialize Set-Cookie sniffer on persist:main session for owner domains
  try {
    const ses = session.fromPartition('persist:main');
    if (ses && ses.webRequest) {
      const urlFilters = { urls: ['*://*.api-amdital.dev.diginnovators.site/*', '*://*.amdital.dev.diginnovators.site/*'] };
      ses.webRequest.onHeadersReceived(urlFilters, (details, callback) => {
        try {
          const headers = details.responseHeaders || {};
          const setCookie = headers['set-cookie'] || headers['Set-Cookie'] || [];
          const values = Array.isArray(setCookie) ? setCookie : [setCookie];
          const jwtCookieRegex = /(^|;\s*)(token|owner_token|amdital_owner_token|jwt|authToken)=([^;\s]+)(;|$)/i;
          const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
          for (const v of values) {
            const m = String(v).match(jwtCookieRegex);
            if (m) {
              const name = m[2];
              const value = m[3];
              if (jwtRegex.test(value)) {
                latestOwnerCookieToken = { token: value, name, url: details.url };
                console.log('🔎 Captured owner token via Set-Cookie:', name, 'at', details.url);
                break;
              }
            }
          }
        } catch {}
        callback({ cancel: false, responseHeaders: details.responseHeaders });
      });
    }
  } catch (e) {
    console.warn('⚠️ Failed to initialize cookie sniffer:', e?.message);
  }

  createSplash();
});

app.on("window-all-closed", () => {
  if (screenshotIntervalId) {
    stopScreenshotCapture(screenshotIntervalId);
    console.log("⏹️ Screenshot capture stopped on app exit");
    screenshotIntervalId = null;
  }
  
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

if (isDev) {
  app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
  });
}

// ============================================================================
// ERROR HANDLERS
// ============================================================================

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
  
  if (!isDev) {
    dialog.showErrorBox(
      "Application Error",
      `An unexpected error occurred:\n\n${err.message}`
    );
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled Rejection:", reason);
});
