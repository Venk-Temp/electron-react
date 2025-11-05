// electron/modules/auth-manager.js - Authentication Manager
import { 
  saveAuthData, 
  getAuthData, 
  clearAuthData, 
  hasValidAuth, 
  isTokenValid 
} from "./storage-manager.js";
import { 
  setAuthToken, 
  startScreenshotCapture, 
  stopScreenshotCapture 
} from "./screenshot-capture.js";

let screenshotIntervalId = null;

/**
 * Initialize authentication on app start
 * Returns: { autoLogin: boolean, authData: object | null }
 */
export function initializeAuth() {
  console.log("\n🔐 Initializing authentication...");
  
  const savedAuth = getAuthData();
  
  if (!savedAuth) {
    console.log("ℹ️ No saved authentication found");
    return { autoLogin: false, authData: null };
  }

  if (!isTokenValid(savedAuth.ownerAuthToken)) {
    console.log("⚠️ Saved token expired, clearing...");
    clearAuthData();
    return { autoLogin: false, authData: null };
  }

  console.log("✅ Valid authentication found");
  console.log("   User:", savedAuth.userData?.userEmail);
  console.log("   Saved:", savedAuth.savedAt);
  
  return { autoLogin: true, authData: savedAuth };
}

/**
 * Handle successful login
 */
export async function handleLoginSuccess(authData) {
  try {
    console.log("\n🎉 Login successful, saving auth data...");
    
    // Save to secure storage
    const saveResult = saveAuthData(authData);
    if (!saveResult.success) {
      console.error("❌ Failed to save auth data");
      return { success: false, error: "Failed to save auth" };
    }

    // Configure screenshot module
    const tokenResult = setAuthToken({
      authToken: authData.ownerAuthToken,
      userData: authData.userData
    });

    if (!tokenResult.success) {
      console.error("❌ Failed to configure screenshot module");
      return { success: false, error: "Failed to configure screenshots" };
    }

    // Start screenshot capture
    screenshotIntervalId = startScreenshotCapture(60);
    
    console.log("✅ Authentication setup complete");
    return { success: true };
    
  } catch (err) {
    console.error("❌ Error in handleLoginSuccess:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Handle logout
 */
export async function handleLogout() {
  try {
    console.log("\n👋 Logging out...");
    
    // Stop screenshot capture
    if (screenshotIntervalId) {
      stopScreenshotCapture(screenshotIntervalId);
      screenshotIntervalId = null;
      console.log("⏹️ Screenshot capture stopped");
    }

    // Clear stored auth
    clearAuthData();
    
    console.log("✅ Logout complete");
    return { success: true };
    
  } catch (err) {
    console.error("❌ Error during logout:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Resume session from saved auth
 */
export async function resumeSession(authData) {
  try {
    console.log("\n🔄 Resuming session...");
    
    // Configure screenshot module
    const tokenResult = setAuthToken({
      authToken: authData.ownerAuthToken,
      userData: authData.userData
    });

    if (!tokenResult.success) {
      console.error("❌ Failed to configure screenshot module");
      return { success: false, error: "Failed to configure screenshots" };
    }

    // Start screenshot capture
    screenshotIntervalId = startScreenshotCapture(60);
    
    console.log("✅ Session resumed successfully");
    return { success: true };
    
  } catch (err) {
    console.error("❌ Error resuming session:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Get current auth status
 */
export function getAuthStatus() {
  return {
    hasValidAuth: hasValidAuth(),
    isCapturing: screenshotIntervalId !== null
  };
}

/**
 * Stop all auth-related services (called on app quit)
 */
export function cleanup() {
  console.log("🧹 Cleaning up auth services...");
  if (screenshotIntervalId) {
    stopScreenshotCapture(screenshotIntervalId);
    screenshotIntervalId = null;
  }
}   