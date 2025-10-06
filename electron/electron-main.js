// electron-main.js - CROSS-PLATFORM ROBUST VERSION
import { app, BrowserWindow, ipcMain, dialog, Menu, shell, Tray, nativeImage } from "electron";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let splashWindow = null;
let tray = null;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

console.log("=== Electron Environment ===");
console.log("Platform:", process.platform);
console.log("isDev:", isDev);
console.log("__dirname:", __dirname);
console.log("app.isPackaged:", app.isPackaged);
console.log("process.resourcesPath:", process.resourcesPath);

// Windows AppUserModelID for proper taskbar behavior
if (process.platform === "win32") {
  app.setAppUserModelId("com.amdital.desktop");
}

// ============================================================================
// UNIVERSAL PATH RESOLVER - Works in DEV, PROD, and PACKAGED
// ============================================================================

function fileExists(p) {
  try {
    return p && fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Universal asset path resolver
 * @param {string} assetPath - Relative path like "icons/logo.png" or "splash/splash.html"
 * @returns {string|null} Absolute path to asset or null if not found
 */
function getAssetPath(assetPath) {
  const locations = [];
  
  if (isDev) {
    // Development: assets in public/ folder
    locations.push(path.join(__dirname, "..", "public", assetPath));
  } else {
    // Production/Packaged: check multiple locations
    locations.push(
      // electron-builder extraResources location
      path.join(process.resourcesPath, "assets", assetPath),
      // Fallback for splash folder (configured separately in extraResources)
      path.join(process.resourcesPath, assetPath),
      // Additional fallback
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

/**
 * Get icon path for window (MUST be .png for cross-platform compatibility)
 * @returns {string|null}
 */
function getWindowIconPath() {
  // CRITICAL: Use PNG for window icons, not .icns or .ico
  const iconPath = getAssetPath("icons/logo.png");
  
  if (!iconPath) {
    console.error("❌ Window icon (logo.png) not found!");
    console.error("   Make sure you have: public/icons/logo.png");
  }
  
  return iconPath;
}

/**
 * Get tray icon path (platform-specific sizing)
 * @returns {nativeImage|null}
 */
function getTrayIcon() {
  const iconPath = getAssetPath("icons/logo.png");
  
  if (!iconPath) {
    console.warn("⚠️ Tray icon not found");
    return null;
  }
  
  try {
    const icon = nativeImage.createFromPath(iconPath);
    
    // Platform-specific sizing for better display
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

/**
 * Get preload script path
 * @returns {string|null}
 */
function getPreloadPath() {
  const locations = [];
  
  if (isDev) {
    locations.push(path.join(__dirname, "preload.cjs"));
  } else {
    // Production: preload.cjs must be in app.asar.unpacked (configured in package.json)
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

/**
 * Get splash HTML path
 * @returns {string|null}
 */
function getSplashPath() {
  return getAssetPath("splash/splash.html");
}

/**
 * Get splash logo path (for file:// URL)
 * @returns {string|null}
 */
function getSplashLogoPath() {
  const logoPath = getAssetPath("splash/splash.png");
  return logoPath ? `file://${logoPath}` : null;
}

// ============================================================================
// IPC HANDLERS
// ============================================================================

// IPC handler for splash logo path
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
  
  // Confirm exit dialog
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
// WINDOW CREATION
// ============================================================================

/**
 * Create splash window
 */
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

/**
 * Create main application window
 */
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

  // Set dock icon on macOS
  if (process.platform === "darwin" && iconPath && app.dock) {
    try {
      app.dock.setIcon(iconPath);
    } catch (err) {
      console.warn("⚠️ Failed to set dock icon:", err.message);
    }
  }

  // Load URL based on environment
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

  // Show main window when ready
  mainWindow.once("ready-to-show", () => {
    console.log("✅ Main window ready");
    
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    
    mainWindow.show();
    mainWindow.webContents.send("window-is-maximized", mainWindow.isMaximized());
  });

  // Disable DevTools in production
  if (!isDev) {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  // Setup menu and tray
  setupMenu();
  setupTray();

  // Window state listeners
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
  createSplash();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// Allow self-signed certificates in development
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