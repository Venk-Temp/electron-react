  // electron/modules/screenshot-capture.js - DYNAMIC API ENDPOINT WITH OWNER TOKEN
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

  let currentAuthToken = null; // OWNER TOKEN with upload permissions
  let currentEmployeeData = null;
  let dynamicApiEndpoint = null;
  let amditalApiKey = null;
  let isReadyToCapture = false;
  let apiTestedOnce = false;

  fs.ensureDirSync(SCREENSHOTS_DIR);
  if (!fs.existsSync(METADATA_FILE)) {
    fs.writeJsonSync(METADATA_FILE, { screenshots: [] }, { spaces: 2 });
  }

  // ============================================================================
  // DYNAMIC ENDPOINT BUILDER
  // ============================================================================
  function buildMediaEndpoint(siteData) {
    // Priority order for base URL:
    // 1. old_api_url (most reliable for API endpoints)
    // 2. old_app_url
    // 3. app_url
    // 4. url (fallback)
    
    const baseUrl = siteData.old_api_url || 
                    siteData.old_app_url || 
                    siteData.app_url || 
                    siteData.url;
    
    if (!baseUrl) {
      throw new Error("No valid base URL found in site data");
    }

    // Clean up the base URL - remove trailing /wp or /wp/
    let cleanBase = baseUrl.replace(/\/wp\/?$/i, '');
    
    // Ensure no double slashes (except after protocol)
    cleanBase = cleanBase.replace(/([^:])\/\//g, '$1/');
    
    // Build the media endpoint
    // Format: https://subdomain.api-amdital.dev.diginnovators.site/wp-json/wp/v2/media?system_screenshot=true
    const endpoint = `${cleanBase}/wp-json/wp/v2/media?system_screenshot=true`;
    
    return endpoint;
  }

  // ============================================================================
  // SET TOKEN & USER DATA (CALLED FROM APP.JSX)
  // ============================================================================
  export function setAuthToken(tokenData) {
    try {
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔧 CONFIGURING SCREENSHOT MODULE");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Store OWNER token (has upload permissions)
      currentAuthToken = tokenData.authToken;
      currentEmployeeData = tokenData.userData;

      // Extract API key if available
      if (tokenData.userData.site?.amdital_api_key) {
        amditalApiKey = tokenData.userData.site.amdital_api_key;
        console.log("✅ Amdital API Key extracted");
      } else {
        console.log("⚠️ No Amdital API Key found (may not be required)");
      }

      const site = tokenData.userData.site;
      if (!site) {
        console.error("❌ No site data found!");
        isReadyToCapture = false;
        return { success: false, error: "No site data" };
      }

      // Build dynamic endpoint
      try {
        dynamicApiEndpoint = buildMediaEndpoint(site);
        console.log("✅ API Endpoint built successfully");
      } catch (err) {
        console.error("❌ Failed to build endpoint:", err.message);
        isReadyToCapture = false;
        return { success: false, error: err.message };
      }

      console.log("\n📋 CONFIGURATION DETAILS:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("👤 Employee:", currentEmployeeData.userName);
      console.log("🆔 User ID:", currentEmployeeData.userId);
      console.log("🏢 Company ID:", currentEmployeeData.companyId);
      console.log("👔 Role:", currentEmployeeData.userRole);
      console.log("\n🌐 SITE CONFIGURATION:");
      console.log("   Domain:", site.domain);
      console.log("   Blog ID:", site.blogId);
      console.log("   URL:", site.url);
      console.log("   App URL:", site.app_url || "N/A");
      console.log("   Old App URL:", site.old_app_url || "N/A");
      console.log("   Old API URL:", site.old_api_url || "N/A");
      console.log("\n🔐 AUTHENTICATION:");
      console.log("   Token Type: OWNER TOKEN (with upload permissions)");
      console.log("   Token Preview:", currentAuthToken.substring(0, 60) + "...");
      console.log("   Token Length:", currentAuthToken.length, "characters");
      console.log("   API Key:", amditalApiKey ? "Present (" + amditalApiKey.substring(0, 20) + "...)" : "Not provided");
      console.log("\n📡 API ENDPOINT:");
      console.log("   " + dynamicApiEndpoint);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      isReadyToCapture = true;
      apiTestedOnce = false; // Reset API test flag
      
      return { success: true, endpoint: dynamicApiEndpoint };
    } catch (err) {
      console.error("❌ Failed to configure screenshot module:", err);
      isReadyToCapture = false;
      return { success: false, error: err.message };
    }
  }

  // ============================================================================
  // TEST API CONNECTIVITY (OPTIONAL BUT RECOMMENDED)
  // ============================================================================
  async function testAPIEndpoint() {
    console.log("\n🧪 TESTING API CONNECTIVITY...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
      const response = await fetch(dynamicApiEndpoint.split('?')[0], {
        method: 'OPTIONS',
        headers: {
          'Authorization': `Bearer ${currentAuthToken}`,
          'Accept': 'application/json',
          ...(amditalApiKey && { 'X-Amdital-API-Key': amditalApiKey })
        },
        timeout: 10000
      });

      console.log("📡 Test Response:");
      console.log("   Status:", response.status);
      console.log("   Status Text:", response.statusText);
      console.log("   Headers:", Object.fromEntries(response.headers.entries()));

      // Accept various success codes
      if ([200, 204, 401, 405].includes(response.status)) {
        // 401 or 405 means endpoint exists (auth might fail but endpoint is valid)
        console.log("✅ Media endpoint is reachable");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        return true;
      }

      console.log("⚠️ Unexpected status, but will attempt upload anyway");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      return true;

    } catch (err) {
      console.log("⚠️ Test failed:", err.message);
      console.log("   Will attempt upload anyway - endpoint may still work");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      return true; // Don't block on test failure
    }
  }

  // ============================================================================
  // UPLOAD SCREENSHOT TO WORDPRESS MEDIA
  // ============================================================================
  async function sendToAPI(filepath, filename, metadata) {
    if (!isReadyToCapture || !currentAuthToken || !dynamicApiEndpoint) {
      console.warn("⚠️ Cannot upload: System not configured");
      return { success: false, error: "System not configured" };
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📤 UPLOADING SCREENSHOT`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📁 File:", filename);
    console.log("📡 Endpoint:", dynamicApiEndpoint);
    console.log("🔐 Auth: Bearer token (owner)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
      const fileBuffer = await fs.readFile(filepath);
      const formData = new FormData();
      
      // Add the file
      formData.append('file', fileBuffer, { 
        filename, 
        contentType: 'image/png' 
      });
      
      // Add WordPress media metadata
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
      formData.append('caption', `Captured by ${metadata.employee_name} on ${metadata.timestamp}`);
      formData.append('description', JSON.stringify(metadata, null, 2));
      formData.append('alt_text', `System Screenshot - ${metadata.employee_name} - ${metadata.employee_id}`);
      
      // Set up request headers
      const headers = { 
        ...formData.getHeaders(),
        'Authorization': `Bearer ${currentAuthToken}` // OWNER TOKEN
      };
      
      // Add Amdital API key if available
      if (amditalApiKey) {
        headers['X-Amdital-API-Key'] = amditalApiKey;
      }

      console.log("📋 Request Headers:");
      console.log("   Authorization: Bearer ***" + currentAuthToken.substring(currentAuthToken.length - 20));
      console.log("   Content-Type:", headers['content-type']);
      if (amditalApiKey) {
        console.log("   X-Amdital-API-Key: ***" + amditalApiKey.substring(amditalApiKey.length - 10));
      }
      console.log("   File Size:", fileBuffer.length, "bytes");

      // Set up timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      // Make the upload request
      const response = await fetch(dynamicApiEndpoint, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      // Read response
      const responseText = await response.text();
      const contentType = response.headers.get('content-type');

      console.log("\n📥 UPLOAD RESPONSE:");
      console.log("   Status:", response.status, response.statusText);
      console.log("   Content-Type:", contentType);

      // Check for non-JSON response (usually indicates error)
      if (!contentType?.includes('application/json')) {
        console.error("❌ Unexpected content type:", contentType);
        console.error("Response preview:", responseText.substring(0, 500));
        throw new Error(`Server returned ${contentType}, expected JSON. Check WordPress REST API configuration.`);
      }

      // Check for HTTP errors
      if (!response.ok) {
        console.error("❌ Upload failed with status:", response.status);
        console.error("Response body:", responseText);
        
        // Try to parse error message
        try {
          const errorData = JSON.parse(responseText);
          const errorMsg = errorData.message || errorData.error || responseText;
          throw new Error(`Upload failed (${response.status}): ${errorMsg}`);
        } catch {
          throw new Error(`Upload failed (${response.status}): ${responseText}`);
        }
      }

      // Parse successful response
      const result = JSON.parse(responseText);
      
      console.log("✅ UPLOAD SUCCESS!");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 Media Details:");
      console.log("   Media ID:", result.id);
      console.log("   Title:", result.title?.rendered || result.title);
      console.log("   URL:", result.source_url || result.guid?.rendered);
      console.log("   Type:", result.media_type);
      console.log("   MIME:", result.mime_type);
      console.log("   Date:", result.date);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      
      return { 
        success: true, 
        data: result, 
        mediaId: result.id, 
        url: result.source_url || result.guid?.rendered,
        mimeType: result.mime_type,
        date: result.date
      };

    } catch (err) {
      console.error("\n❌ UPLOAD FAILED");
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.error("Error:", err.message);
      console.error("File:", filepath);
      console.error("Endpoint:", dynamicApiEndpoint);
      console.error("Token Length:", currentAuthToken?.length || 0);
      console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      
      return { 
        success: false, 
        error: err.message,
        details: {
          endpoint: dynamicApiEndpoint,
          hasToken: !!currentAuthToken,
          hasApiKey: !!amditalApiKey
        }
      };
    }
  }

  // ============================================================================
  // CAPTURE SCREENSHOT
  // ============================================================================
  export async function captureScreenshot() {
    try {
      console.log("📸 Screenshot capture triggered...");
      
      if (!isReadyToCapture) {
        console.warn("⚠️ System not ready - missing configuration");
        return { success: false, error: "System not configured" };
      }

      // Capture screenshot
      const imgBuffer = await screenshot({ format: "png" });
      const timestamp = Date.now();
      const filename = `screenshot_${timestamp}.png`;
      const filepath = path.join(SCREENSHOTS_DIR, filename);
      
      // Save locally
      await fs.writeFile(filepath, imgBuffer);
      console.log(`✅ Screenshot saved locally: ${filename} (${imgBuffer.length} bytes)`);

      // Prepare metadata
      const metadata = {
        employee_id: currentEmployeeData?.userId || "UNKNOWN",
        employee_name: currentEmployeeData?.userName || "Unknown User",
        employee_email: currentEmployeeData?.userEmail || "",
        company_id: currentEmployeeData?.companyId || "",
        user_role: currentEmployeeData?.userRole || "",
        timestamp: new Date().toISOString(),
        device_info: {
          platform: process.platform,
          hostname: os.hostname(),
          username: os.userInfo().username,
          os_version: os.version(),
          os_type: os.type(),
          total_memory_gb: (os.totalmem() / (1024**3)).toFixed(2),
          free_memory_gb: (os.freemem() / (1024**3)).toFixed(2),
          uptime_hours: (os.uptime() / 3600).toFixed(2)
        },
        screenshot_info: {
          filename: filename,
          size_bytes: imgBuffer.length,
          size_kb: (imgBuffer.length / 1024).toFixed(2),
          format: "PNG"
        },
        api_info: {
          endpoint: dynamicApiEndpoint,
          domain: currentEmployeeData?.site?.domain || "",
          blog_id: currentEmployeeData?.site?.blogId || ""
        }
      };

      // Save metadata
      await saveMetadata(metadata, filepath);

      // Test API on first capture
      if (!apiTestedOnce) {
        apiTestedOnce = true;
        await testAPIEndpoint();
      }

      // Upload to WordPress
      const apiResult = await sendToAPI(filepath, filename, metadata);
      
      if (!apiResult.success) {
        console.warn("⚠️ Screenshot saved locally but upload failed");
        console.warn("   Error:", apiResult.error);
        console.warn("   Screenshot preserved at:", filepath);
      }

      return { 
        success: true, 
        filename, 
        filepath, 
        size: imgBuffer.length,
        apiUpload: apiResult.success, 
        mediaId: apiResult.mediaId, 
        url: apiResult.url,
        uploadError: apiResult.error 
      };

    } catch (err) {
      console.error("❌ Screenshot capture failed:", err.message);
      return { success: false, error: err.message };
    }
  }

  // ============================================================================
  // METADATA MANAGEMENT
  // ============================================================================
  async function saveMetadata(metadata, filepath) {
    try {
      const data = await fs.readJson(METADATA_FILE);
      
      data.screenshots.unshift({ 
        id: Date.now(), 
        filename: metadata.screenshot_info.filename, 
        timestamp: metadata.timestamp, 
        employee_id: metadata.employee_id, 
        employee_name: metadata.employee_name, 
        company_id: metadata.company_id, 
        file_path: filepath,
        size_bytes: metadata.screenshot_info.size_bytes,
        uploaded: false // Will be updated on successful upload
      });
      
      // Keep only last 100 screenshots in log
      data.screenshots = data.screenshots.slice(0, 100);
      
      await fs.writeJson(METADATA_FILE, data, { spaces: 2 });
      console.log("✅ Metadata saved to log");
    } catch (err) {
      console.error("❌ Failed to save metadata:", err.message);
    }
  }

  // ============================================================================
  // START / STOP CAPTURE
  // ============================================================================
  // ============================================================================
  // START / STOP CAPTURE
  // ============================================================================
  export function startScreenshotCapture(intervalSeconds = 30) { // DEFAULT: 30 seconds
    if (!isReadyToCapture) {
      console.warn("⚠️ Cannot start capture: System not configured");
      return null;
    }
    
    console.log("\n🚀 SCREENSHOT CAPTURE STARTED");
    console.log("⏰ First capture: 5 seconds");
    console.log("⏰ Interval: Every " + intervalSeconds + " seconds (" + (intervalSeconds/60).toFixed(1) + " min)");
    console.log("📡 Endpoint:", dynamicApiEndpoint);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    // First screenshot after 5 seconds
    setTimeout(() => {
      captureScreenshot();
    }, 5000);
    
    // Then continue at regular interval (30 seconds)
    const id = setInterval(captureScreenshot, intervalSeconds * 1000);
    
    return id;
  }

  export function stopScreenshotCapture(id) {
    if (id) {
      clearInterval(id);
      console.log("\n⏹️ Screenshot capture stopped");
    }
    
    isReadyToCapture = false;
    currentAuthToken = null;
    currentEmployeeData = null;
    dynamicApiEndpoint = null;
    amditalApiKey = null;
    apiTestedOnce = false;
  }

  // ============================================================================
  // UTILITY FUNCTIONS
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

  export function getAPIStatus() {
    return { 
      enabled: true, 
      endpoint: dynamicApiEndpoint || "Not configured", 
      hasToken: !!currentAuthToken, 
      hasApiKey: !!amditalApiKey, 
      isReady: isReadyToCapture, 
      employeeId: currentEmployeeData?.userId || null,
      employeeName: currentEmployeeData?.userName || null, 
      domain: currentEmployeeData?.site?.domain || null,
      blogId: currentEmployeeData?.site?.blogId || null,
      tokenInfo: currentAuthToken ? {
        length: currentAuthToken.length,
        preview: currentAuthToken.substring(0, 20) + "..." + currentAuthToken.substring(currentAuthToken.length - 20)
      } : null
    };
  }

  // ============================================================================
  // FORCE TOKEN REFRESH (UTILITY)
  // ============================================================================
  export function refreshToken(newTokenData) {
    console.log("🔄 Refreshing authentication token...");
    return setAuthToken(newTokenData);
  }