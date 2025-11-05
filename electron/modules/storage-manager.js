// electron/modules/storage-manager.js - Encrypted Token Storage
import Store from "electron-store";
import { app } from "electron";

// Initialize encrypted store
const store = new Store({
  name: "amdital-auth",
  encryptionKey: "amdital-desktop-secure-key-2024", // Change this in production
  clearInvalidConfig: true
});

const STORAGE_KEY = "auth_data";

/**
 * Save authentication data securely
 */
export function saveAuthData(authData) {
  try {
    const dataToSave = {
      ownerAuthToken: authData.ownerAuthToken,
      userData: authData.userData,
      savedAt: new Date().toISOString(),
      expiresAt: getTokenExpiry(authData.ownerAuthToken)
    };

    store.set(STORAGE_KEY, dataToSave);
    console.log("✅ Auth data saved securely");
    return { success: true };
  } catch (err) {
    console.error("❌ Failed to save auth data:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Get saved authentication data
 */
export function getAuthData() {
  try {
    const data = store.get(STORAGE_KEY);
    
    if (!data) {
      return null;
    }

    // Validate token expiry
    if (data.expiresAt && Date.now() >= data.expiresAt) {
      console.log("⚠️ Stored token expired, clearing...");
      clearAuthData();
      return null;
    }

    return data;
  } catch (err) {
    console.error("❌ Failed to get auth data:", err);
    return null;
  }
}

/**
 * Clear authentication data
 */
export function clearAuthData() {
  try {
    store.delete(STORAGE_KEY);
    console.log("✅ Auth data cleared");
    return { success: true };
  } catch (err) {
    console.error("❌ Failed to clear auth data:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Check if valid auth exists
 */
export function hasValidAuth() {
  const data = getAuthData();
  return data !== null && isTokenValid(data.ownerAuthToken);
}

/**
 * Validate JWT token
 */
export function isTokenValid(token) {
  if (!token || typeof token !== 'string') return false;
  
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    
    // Check expiry with 5-minute buffer
    const expiryTime = payload.exp * 1000;
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    
    return Date.now() < (expiryTime - bufferTime);
  } catch {
    return false;
  }
}

/**
 * Get token expiry timestamp
 */
function getTokenExpiry(token) {
  try {
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    return payload.exp * 1000; // Convert to milliseconds
  } catch {
    return null;
  }
}

/**
 * Get auth status for debugging
 */
export function getAuthStatus() {
  const data = getAuthData();
  
  if (!data) {
    return { hasAuth: false, isValid: false };
  }

  return {
    hasAuth: true,
    isValid: isTokenValid(data.ownerAuthToken),
    savedAt: data.savedAt,
    expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
    userId: data.userData?.userId,
    userEmail: data.userData?.userEmail
  };
}