// electron/modules/screenshot-capture.js - CLEAN VERSION
import screenshot from "screenshot-desktop";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import FormData from "form-data";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOTS_DIR = path.join(__dirname, "..", "..", "screenshots");
const METADATA_FILE = path.join(__dirname, "..", "..", "screenshots-log.json");
const API_TIMEOUT_MS = 60000;

let currentAuthToken = null;
let currentEmployeeData = null;
let dynamicApiEndpoint = null;
let amditalApiKey = null;
let isReadyToCapture = false;

fs.ensureDirSync(SCREENSHOTS_DIR);
if (!fs.existsSync(METADATA_FILE)) {
  fs.writeJsonSync(METADATA_FILE, { screenshots: [] }, { spaces: 2 });
}

// ============================================================================
// BUILD API ENDPOINT
// ============================================================================
function buildMediaEndpoint(siteData) {
  const baseUrl = siteData.url || siteData.old_api_url || siteData.old_app_url || siteData.app_url;
  if (!baseUrl) throw new Error("No valid base URL found");

  let cleanBase = baseUrl.replace(/\/wp\/?$/i, '');
  cleanBase = cleanBase.replace(/([^:])\/\//g, '$1/');
  
  return `${cleanBase}/wp-json/wp/v2/media?system_screenshot=true`;
}

// ============================================================================
// SET AUTH TOKEN
// ============================================================================
export function setAuthToken(tokenData) {
  try {
    console.log("🔧 Configuring screenshot module");

    currentAuthToken = tokenData.authToken;
    currentEmployeeData = tokenData.userData;

    if (tokenData.userData.site?.amdital_api_key) {
      amditalApiKey = tokenData.userData.site.amdital_api_key;
    }

    const site = tokenData.userData.site;
    if (!site) {
      isReadyToCapture = false;
      return { success: false, error: "No site data" };
    }

    try {
      dynamicApiEndpoint = buildMediaEndpoint(site);
      console.log("✅ Screenshot configured:", currentEmployeeData.userName);
      console.log("   Endpoint:", dynamicApiEndpoint);
    } catch (err) {
      isReadyToCapture = false;
      return { success: false, error: err.message };
    }

    isReadyToCapture = true;
    return { success: true, endpoint: dynamicApiEndpoint };
  } catch (err) {
    console.error("❌ Failed to configure:", err);
    isReadyToCapture = false;
    return { success: false, error: err.message };
  }
}

// ============================================================================
// UPLOAD TO API
// ============================================================================
async function sendToAPI(filepath, filename, metadata) {
  if (!isReadyToCapture || !currentAuthToken || !dynamicApiEndpoint) {
    return { success: false, error: "System not configured" };
  }

  try {
    const fileBuffer = await fs.readFile(filepath);
    const formData = new FormData();
    
    formData.append('file', fileBuffer, { filename, contentType: 'image/png' });
    
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    formData.append('title', `Screenshot - ${metadata.employee_name} - ${timestamp}`);
    formData.append('caption', `Captured by ${metadata.employee_name}`);
    formData.append('description', JSON.stringify(metadata));
    
    const headers = { 
      ...formData.getHeaders(),
      'Authorization': `Bearer ${currentAuthToken}`
    };
    
    if (amditalApiKey) {
      headers['X-Amdital-API-Key'] = amditalApiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(dynamicApiEndpoint, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    const responseText = await response.text();
    const contentType = response.headers.get('content-type');

    if (!contentType?.includes('application/json')) {
      throw new Error(`Server returned ${contentType}, expected JSON`);
    }

    if (!response.ok) {
      try {
        const errorData = JSON.parse(responseText);
        const errorMsg = errorData.message || errorData.error || responseText;
        throw new Error(`Upload failed (${response.status}): ${errorMsg}`);
      } catch {
        throw new Error(`Upload failed (${response.status})`);
      }
    }

    const result = JSON.parse(responseText);
    
    console.log("✅ Screenshot uploaded - ID:", result.id);
    
    return { 
      success: true, 
      mediaId: result.id, 
      url: result.source_url || result.guid?.rendered
    };

  } catch (err) {
    console.error("❌ Upload failed:", err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// CAPTURE SCREENSHOT
// ============================================================================
export async function captureScreenshot() {
  try {
    if (!isReadyToCapture) {
      return { success: false, error: "System not configured" };
    }

    const imgBuffer = await screenshot({ format: "png" });
    const timestamp = Date.now();
    const filename = `screenshot_${timestamp}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    
    await fs.writeFile(filepath, imgBuffer);

    const metadata = {
      employee_id: currentEmployeeData?.userId || "UNKNOWN",
      employee_name: currentEmployeeData?.userName || "Unknown",
      employee_email: currentEmployeeData?.userEmail || "",
      company_id: currentEmployeeData?.companyId || "",
      timestamp: new Date().toISOString(),
      device_info: {
        platform: process.platform,
        hostname: os.hostname()
      },
      screenshot_info: {
        filename,
        size_bytes: imgBuffer.length,
        format: "PNG"
      }
    };

    await saveMetadata(metadata, filepath);

    const apiResult = await sendToAPI(filepath, filename, metadata);
    
    if (!apiResult.success) {
      console.warn("⚠️ Screenshot saved locally but upload failed");
    }

    return { 
      success: true, 
      filename, 
      filepath, 
      apiUpload: apiResult.success, 
      mediaId: apiResult.mediaId
    };

  } catch (err) {
    console.error("❌ Capture failed:", err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// METADATA
// ============================================================================
async function saveMetadata(metadata, filepath) {
  try {
    const data = await fs.readJson(METADATA_FILE);
    data.screenshots.unshift({ 
      id: Date.now(), 
      filename: metadata.screenshot_info.filename, 
      timestamp: metadata.timestamp, 
      employee_id: metadata.employee_id, 
      employee_name: metadata.employee_name
    });
    data.screenshots = data.screenshots.slice(0, 100);
    await fs.writeJson(METADATA_FILE, data, { spaces: 2 });
  } catch (err) {
    console.error("❌ Metadata save failed:", err.message);
  }
}

// ============================================================================
// START / STOP
// ============================================================================
export function startScreenshotCapture(intervalSeconds = 60) {
  if (!isReadyToCapture) {
    console.warn("⚠️ Cannot start: System not configured");
    return null;
  }
  
  console.log(`🚀 Screenshot capture started (every ${intervalSeconds}s)`);
  
  setTimeout(() => captureScreenshot(), 5000);
  const id = setInterval(captureScreenshot, intervalSeconds * 1000);
  
  return id;
}

export function stopScreenshotCapture(id) {
  if (id) {
    clearInterval(id);
    console.log("⏹️ Screenshot capture stopped");
  }
  
  isReadyToCapture = false;
  currentAuthToken = null;
  currentEmployeeData = null;
  dynamicApiEndpoint = null;
  amditalApiKey = null;
}

// ============================================================================
// UTILITY
// ============================================================================
export function getScreenshotMetadata() {
  try { 
    return fs.readJsonSync(METADATA_FILE); 
  } catch { 
    return { screenshots: [] }; 
  }
}

export function getScreenshotPath(filename) {
  return path.join(SCREENSHOTS_DIR, filename);
}