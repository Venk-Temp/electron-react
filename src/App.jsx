// src/App.jsx - CLEAN & SIMPLIFIED WITH AUTO-LOGIN
import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import TitleBar from "./components/TitleBar";

const App = () => {
  const LOGIN_URL = import.meta.env.VITE_LOGIN_URL || "https://app.amdital.com/login";
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [authStage, setAuthStage] = useState("checking"); // checking, login, redirecting, owner_auth, ready

  const webviewRef = useRef(null);
  const initialAuthTokenRef = useRef(null);
  const userDataRef = useRef(null);
  const capturedCredsRef = useRef(null);
  const retryCountRef = useRef(0);
  const loginCheckIntervalRef = useRef(null);

  // ============================================================================
  // STEP 1: Check for saved auth on startup
  // ============================================================================
  useEffect(() => {
    const checkSavedAuth = async () => {
      console.log('🔍 Checking for saved authentication...');
      
      try {
        const result = await window.electronAPI?.auth?.checkSavedAuth();
        
        if (result?.autoLogin && result?.authData) {
          console.log('✅ Auto-login: Valid auth found');
          
          const { ownerAuthToken, userData } = result.authData;
          const site = userData.site;
          const targetUrl = site.old_app_url || site.app_url || site.url;
          
          setWebviewUrl(targetUrl);
          setIsAuthenticated(true);
          setAuthStage("ready");
          
          // Resume session
          await window.electronAPI?.auth?.resumeSession(result.authData);
          
        } else {
          console.log('ℹ️ No valid auth, showing login');
          setWebviewUrl(LOGIN_URL);
          setAuthStage("login");
        }
      } catch (err) {
        console.error('❌ Error checking auth:', err);
        setWebviewUrl(LOGIN_URL);
        setAuthStage("login");
      }
      
      setLoading(false);
    };

    checkSavedAuth();
  }, []);

  // ============================================================================
  // STEP 2: Monitor webview for login events
  // ============================================================================
  useEffect(() => {
    if (!webviewUrl || loading) return;
    const webview = document.getElementById("main-webview");
    if (!webview) return;

    const handleDomReady = async () => {
      if (authStage === "login") {
        // Start checking for login
        if (loginCheckIntervalRef.current) clearInterval(loginCheckIntervalRef.current);
        loginCheckIntervalRef.current = setInterval(() => checkForInitialLogin(webview), 2000);
      }

      if (authStage === "owner_auth") {
        retryCountRef.current = 0;
        setTimeout(() => checkForOwnerToken(webview), 3000);
      }
    };

    const handleNavigate = async (event) => {
      // Detect logout
      if ((event.url.includes("/login") || event.url.includes("/logout")) && isAuthenticated) {
        await handleLogout();
      }

      // Detect owner domain redirect
      if (authStage === "redirecting" && 
          (event.url.includes('.amdital.') || event.url.includes('diginnovators'))) {
        console.log('✅ Owner domain detected');
        setAuthStage("owner_auth");
      }
    };

    const handleDidFinishLoad = async () => {
      if (authStage === "owner_auth") {
        await checkForOwnerToken(webview);
      }
    };

    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-finish-load", handleDidFinishLoad);

    return () => {
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-finish-load", handleDidFinishLoad);
      if (loginCheckIntervalRef.current) {
        clearInterval(loginCheckIntervalRef.current);
      }
    };
  }, [webviewUrl, loading, isAuthenticated, authStage]);

  // ============================================================================
  // STEP 3: Check for initial login and capture credentials
  // ============================================================================
  const checkForInitialLogin = async (webview) => {
    try {
      const code = `
        (function() {
          try {
            // Capture credentials from form submission
            if (!window.__credsCaptured) {
              window.__credsCaptured = false;
              document.addEventListener('submit', function(e) {
                const form = e.target;
                const emailInput = form.querySelector('input[type="email"], input[name="username"]');
                const passwordInput = form.querySelector('input[type="password"]');
                
                if (emailInput && passwordInput) {
                  window.__lastCredentials = {
                    username: emailInput.value,
                    password: passwordInput.value
                  };
                  window.__credsCaptured = true;
                }
              }, true);
            }
            
            // Check for login token
            const loginDetails = localStorage.getItem('store_temp_login_details');
            if (!loginDetails) return null;
            
            const loginData = JSON.parse(loginDetails);
            const authToken = loginData?.data?.login?.authToken;
            const user = loginData?.data?.login?.user;
            
            if (!authToken || !user || !user.sites?.length) return null;
            
            const firstSite = user.sites[0];
            
            return {
              authToken,
              credentials: window.__lastCredentials || null,
              userData: {
                userId: user.userId,
                userName: user.name,
                userEmail: user.email,
                companyId: user.companyId,
                userRole: user.userRole,
                site: {
                  domain: firstSite.domain,
                  blogId: firstSite.blogId,
                  url: firstSite.url,
                  app_url: firstSite.app_url,
                  old_app_url: firstSite.old_app_url,
                  old_api_url: firstSite.old_api_url,
                  amdital_api_key: firstSite.amdital_api_key
                }
              }
            };
          } catch { 
            return null; 
          }
        })();
      `;

      const loginData = await webview.executeJavaScript(code);
      
      if (loginData?.authToken) {
        console.log('🔑 Login detected!');
        
        if (loginCheckIntervalRef.current) {
          clearInterval(loginCheckIntervalRef.current);
          loginCheckIntervalRef.current = null;
        }

        initialAuthTokenRef.current = loginData.authToken;
        userDataRef.current = loginData.userData;
        capturedCredsRef.current = loginData.credentials;

        await handleInitialLogin(loginData);
      }
    } catch (err) {
      console.error('Error checking login:', err);
    }
  };

  // ============================================================================
  // STEP 4: Exchange initial token for owner token
  // ============================================================================
  const handleInitialLogin = async (loginData) => {
    try {
      const { authToken, userData, credentials } = loginData;
      
      setAuthStage("owner_exchange");
      
      // Try to exchange for owner token
      if (credentials?.username) {
        const resp = await window.electronAPI?.ownerExchange?.exchange(
          authToken, 
          userData.site, 
          credentials
        );
        
        if (resp?.success && resp.ownerAuthToken) {
          console.log('✅ Owner token obtained!');
          await handleOwnerTokenReceived(resp.ownerAuthToken);
          return;
        }
      }
      
      // Fallback: Navigate to owner domain
      console.log('🔄 Navigating to owner domain...');
      setAuthStage("redirecting");
      const targetUrl = userData.site.old_app_url || userData.site.app_url || userData.site.url;
      setWebviewUrl(targetUrl);
      
    } catch (err) {
      console.error('❌ Error in handleInitialLogin:', err);
    }
  };

  // ============================================================================
  // STEP 5: Extract owner token from localStorage
  // ============================================================================
  const checkForOwnerToken = async (webview) => {
    if (retryCountRef.current >= 10) {
      console.error('❌ Max retries reached');
      return;
    }
    
    retryCountRef.current++;
    console.log(`🔍 Checking for owner token (${retryCountRef.current}/10)...`);
    
    try {
      const code = `
        (function() {
          const keys = ['token','owner_token','amdital_owner_token','jwt','authToken'];
          
          for(const k of keys){
            const raw = localStorage.getItem(k);
            if(!raw) continue;
            
            try{
              const parsed = JSON.parse(raw);
              const token = parsed.authToken || parsed.token || parsed;
              if(typeof token === 'string' && token.split('.').length === 3) {
                return { authToken: token };
              }
            }catch{
              if(typeof raw === 'string' && raw.split('.').length === 3) {
                return { authToken: raw };
              }
            }
          }
          return null;
        })();
      `;

      const ownerData = await webview.executeJavaScript(code);

      if (ownerData?.authToken) {
        console.log('✅ Owner token found!');
        await handleOwnerTokenReceived(ownerData.authToken);
      } else {
        setTimeout(() => checkForOwnerToken(webview), 3000);
      }
    } catch (err) {
      console.error('❌ Error checking owner token:', err);
      setTimeout(() => checkForOwnerToken(webview), 3000);
    }
  };

  // ============================================================================
  // STEP 6: Save owner token and complete authentication
  // ============================================================================
  const handleOwnerTokenReceived = async (ownerToken) => {
    try {
      console.log('💾 Saving authentication...');
      
      const authData = {
        ownerAuthToken: ownerToken,
        userData: userDataRef.current
      };

      // Save to secure storage
      const saveResult = await window.electronAPI?.auth?.saveAuthData(authData);
      
      if (saveResult?.success) {
        setIsAuthenticated(true);
        setAuthStage("ready");
        console.log('✅ Authentication complete!');
      }
    } catch (err) {
      console.error('❌ Error saving owner token:', err);
    }
  };

  // ============================================================================
  // STEP 7: Handle logout
  // ============================================================================
  const handleLogout = async () => {
    try {
      console.log('👋 Logging out...');
      
      await window.electronAPI?.auth?.logout();
      
      if (loginCheckIntervalRef.current) {
        clearInterval(loginCheckIntervalRef.current);
        loginCheckIntervalRef.current = null;
      }
      
      initialAuthTokenRef.current = null;
      userDataRef.current = null;
      capturedCredsRef.current = null;
      retryCountRef.current = 0;
      
      setIsAuthenticated(false);
      setAuthStage("login");
      setWebviewUrl(LOGIN_URL);
      
      console.log('✅ Logged out successfully');
    } catch (err) {
      console.error('Error during logout:', err);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  if (loading) {
    return (
      <div style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        color: "#fff"
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "10px" }}>⏳</div>
          <div>Loading Amdital...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <TitleBar />
      <div style={{
        position: "absolute",
        top: "var(--titlebar-height, 40px)",
        left: 0,
        right: 0,
        bottom: 0
      }}>
        {webviewUrl && (
          <webview
            id="main-webview"
            ref={webviewRef}
            src={webviewUrl}
            style={{ width: "100%", height: "100%", border: "none" }}
            webpreferences="contextIsolation=false"
            allowpopups="true"
            partition="persist:main"
          />
        )}
      </div>
    </div>
  );
};

export default App;