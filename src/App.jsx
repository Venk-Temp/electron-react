// src/App.jsx - PRODUCTION READY (Fixed Credential Capture)
import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import TitleBar from "./components/TitleBar";

const App = () => {
  // Read from .env files - falls back to hardcoded URLs if not set
  const LOGIN_URL = import.meta.env.VITE_LOGIN_URL || 
    (import.meta?.env?.MODE === "production"
      ? "https://app.amdital.com/login"
      : "https://app-amdital.dev.diginnovators.site/login");
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [authStage, setAuthStage] = useState("initial");

  const webviewRef = useRef(null);
  const isCapturingRef = useRef(false);
  const initialAuthTokenRef = useRef(null);
  const ownerAuthTokenRef = useRef(null);
  const userDataRef = useRef(null);
  const rawLoginDetailsRef = useRef(null);
  const capturedCredsRef = useRef(null);
  const retryCountRef = useRef(0);
  const maxRetriesRef = useRef(15);
  const loginCheckIntervalRef = useRef(null);

  // ============================================================================
  // INITIALIZE
  // ============================================================================
  useEffect(() => {
    const initializeApp = async () => {
      console.log('🚀 Initializing app...');
      const savedAuth = localStorage.getItem("amdital_auth");
      if (savedAuth) {
        try {
          const authData = JSON.parse(savedAuth);
          const { ownerAuthToken, userData } = authData;

          const isValid =
            ownerAuthToken &&
            isTokenValid(ownerAuthToken) &&
            ownerAuthToken.length >= 270;

          if (isValid) {
            console.log('✅ Found valid saved auth');
            ownerAuthTokenRef.current = ownerAuthToken;
            userDataRef.current = userData;

            const site = userData.site;
            const url = site.old_app_url || site.app_url || site.url;
            setWebviewUrl(url);
            setIsAuthenticated(true);
            setAuthStage("ready");

            await window.electronAPI?.screenshots?.setToken({
              authToken: ownerAuthToken,
              userData: userData,
            });
            await window.electronAPI?.screenshots?.start();
            isCapturingRef.current = true;
          } else {
            console.log('⚠️ Invalid saved auth, clearing...');
            localStorage.removeItem("amdital_auth");
            setWebviewUrl(LOGIN_URL);
          }
        } catch (err) {
          console.error('❌ Error reading saved auth:', err);
          localStorage.removeItem("amdital_auth");
          setWebviewUrl(LOGIN_URL);
        }
      } else {
        console.log('ℹ️ No saved auth, showing login');
        setWebviewUrl(LOGIN_URL);
      }

      setLoading(false);
    };

    initializeApp();
  }, []);

  // ============================================================================
  // WEBVIEW MONITORING
  // ============================================================================
  useEffect(() => {
    if (!webviewUrl || loading) return;
    const webview = document.getElementById("main-webview");
    if (!webview) return;

    const handleDomReady = async () => {
      console.log('📄 Webview DOM ready, stage:', authStage);
      
      if (authStage === "initial" && !isAuthenticated) {
        if (loginCheckIntervalRef.current)
          clearInterval(loginCheckIntervalRef.current);

        loginCheckIntervalRef.current = setInterval(async () => {
          await checkForInitialLogin(webview);
        }, 2000);
      }

      if (authStage === "redirecting" || authStage === "owner_auth") {
        retryCountRef.current = 0;
        setTimeout(() => checkForOwnerToken(webview), 6000);
      }
    };

    const handleNavigate = async (event) => {
      console.log('🧭 Navigation:', event.url);
      
      if (event.url.includes("/login") || event.url.includes("/logout")) {
        if (isAuthenticated) await handleLogout();
      }

      if (
        authStage === "redirecting" &&
        (/.amdital\.dev\.diginnovators\.site/.test(event.url) || 
         /\.amdital\.com/.test(event.url) || 
         /api-amdital/.test(event.url))
      ) {
        console.log('✅ Owner domain detected, switching to owner_auth stage');
        setAuthStage("owner_auth");
      }
    };

    const handleDidFinishLoad = async () => {
      if (authStage === "owner_auth") {
        retryCountRef.current = 0;
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
        loginCheckIntervalRef.current = null;
      }
    };
  }, [webviewUrl, loading, isAuthenticated, authStage]);

  // ============================================================================
  // STAGE 1: Check for initial login - ENHANCED CREDENTIAL CAPTURE
  // ============================================================================
  const checkForInitialLogin = async (webview) => {
    try {
      const code = `
        (function() {
          try {
            // Try to get credentials from form inputs FIRST
            let capturedCreds = null;
            const forms = document.querySelectorAll('form');
            
            for (const form of forms) {
              const emailInput = form.querySelector('input[type="email"], input[name="username"], input[name="email"], input[name="log"]');
              const passwordInput = form.querySelector('input[type="password"], input[name="password"], input[name="pwd"]');
              
              if (emailInput && passwordInput) {
                const emailValue = emailInput.value || emailInput.defaultValue || '';
                const passwordValue = passwordInput.value || passwordInput.defaultValue || '';
                
                if (emailValue && passwordValue) {
                  capturedCreds = {
                    username: emailValue.trim(),
                    password: passwordValue
                  };
                  console.log('✅ Credentials captured from form');
                  break;
                }
              }
            }
            
            // Now check for login token
            const loginDetails = localStorage.getItem('store_temp_login_details');
            if (!loginDetails) return null;
            
            const loginData = JSON.parse(loginDetails);
            const authToken = loginData?.data?.login?.authToken;
            const user = loginData?.data?.login?.user;
            
            // Try to get credentials from localStorage if not captured from form
            if (!capturedCreds && loginData?.data?.login?.credentials) {
              capturedCreds = loginData.data.login.credentials;
              console.log('✅ Credentials found in localStorage');
            }
            
            if (!authToken || !user) return null;
            
            const sites = user.sites || [];
            if (sites.length === 0) return null;
            
            const firstSite = sites[0];
            
            return {
              authToken: authToken,
              rawLoginDetails: loginDetails,
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
              },
              credentials: capturedCreds
            };
          } catch (e) { 
            console.error('Error in checkForInitialLogin:', e);
            return null; 
          }
        })();
      `;

      const loginData = await webview.executeJavaScript(code);
      
      if (loginData && loginData.authToken) {
        console.log('🔑 Initial login detected!');
        console.log('   Has credentials:', !!loginData.credentials);
        console.log('   Username:', loginData.credentials?.username || 'NOT CAPTURED');
        
        if (loginCheckIntervalRef.current) {
          clearInterval(loginCheckIntervalRef.current);
          loginCheckIntervalRef.current = null;
        }

        // Store credentials immediately
        if (loginData.credentials && loginData.credentials.username) {
          capturedCredsRef.current = loginData.credentials;
          console.log('✅ Credentials stored in ref');
        }

        await handleInitialLogin(loginData);
      }
    } catch (err) {
      console.error('Error checking initial login:', err);
    }
  };

  // ============================================================================
  // STAGE 2: Handle initial login and redirect
  // ============================================================================
  const handleInitialLogin = async (loginData) => {
    try {
      console.log('🔄 Processing initial login...');
      const { authToken, userData, credentials } = loginData;
      initialAuthTokenRef.current = authToken;
      userDataRef.current = userData;
      rawLoginDetailsRef.current = loginData.rawLoginDetails || null;
      
      // Ensure credentials are stored
      if (credentials && credentials.username) {
        capturedCredsRef.current = credentials;
        console.log('✅ Credentials confirmed:', credentials.username);
      } else {
        console.warn('⚠️ No credentials available for owner exchange');
      }

      const webview = document.getElementById("main-webview");
      if (webview) {
        await webview.executeJavaScript(`localStorage.removeItem('token');`);
      }

      setAuthStage("owner_exchange");
      
      try {
        console.log('🔄 Attempting owner token exchange...');
        console.log('   Has credentials:', !!capturedCredsRef.current);
        console.log('   Username:', capturedCredsRef.current?.username || 'NONE');
        
        const resp = await window.electronAPI?.ownerExchange?.exchange(
          authToken, 
          userData.site, 
          capturedCredsRef.current
        );
        
        if (resp?.success && resp.ownerAuthToken) {
          console.log('✅ Owner token obtained via API exchange!');
          await handleOwnerTokenReceived(resp.ownerAuthToken);
          return;
        }
        
        console.log('⚠️ API exchange failed, trying alternative methods...');
      } catch (e) {
        console.error('❌ Owner exchange error:', e);
      }
      
      // Fallback: Navigate to owner domain
      console.log('🔄 Navigating to owner domain for token extraction...');
      setAuthStage("redirecting");
      const targetUrl = userData.site.old_app_url || userData.site.app_url || userData.site.url;
      setWebviewUrl(targetUrl);
      
    } catch (err) {
      console.error('❌ handleInitialLogin error:', err);
    }
  };

  // ============================================================================
  // STAGE 3: Extract owner token
  // ============================================================================
  const checkForOwnerToken = async (webview) => {
    if (retryCountRef.current >= maxRetriesRef.current) {
      console.error('❌ Max retries reached for owner token extraction');
      return;
    }
    
    retryCountRef.current++;
    console.log(`🔍 Checking for owner token (attempt ${retryCountRef.current}/${maxRetriesRef.current})...`);
    
    try {
      const code = `
        (function() {
          function isJwt(t){
            try{
              const p=t.split('.'); 
              if(p.length!==3||!t.startsWith('eyJ')) return false; 
              const pl=JSON.parse(atob(p[1])); 
              return !!pl;
            }catch{
              return false;
            }
          }
          
          function pickValidOwnerToken(token){
            if(!token||!isJwt(token)) return null;
            try{
              const issuer = JSON.parse(atob(token.split('.')[1])).iss || '';
              if(issuer && issuer.includes(window.location.hostname)){
                return { authToken: token, issuer };
              }
            }catch{}
            return null;
          }
          
          try {
            const localKeys = ['token','owner_token','amdital_owner_token','jwt','authToken','amdital_auth'];
            
            for(const k of localKeys){
              const raw = localStorage.getItem(k);
              if(!raw) continue;
              
              try{
                const parsed = JSON.parse(raw);
                const maybe = pickValidOwnerToken(parsed.authToken || parsed.token || parsed);
                if(maybe) return maybe;
              }catch{
                const maybe = pickValidOwnerToken(raw);
                if(maybe) return maybe;
              }
            }
            
            return null;
          } catch { 
            return null; 
          }
        })();
      `;

      const ownerData = await webview.executeJavaScript(code);

      if (ownerData && ownerData.authToken) {
        console.log('✅ Owner token found in localStorage!');
        await handleOwnerTokenReceived(ownerData.authToken);
      } else {
        console.log(`⏳ Owner token not found yet, retrying...`);
        setTimeout(() => checkForOwnerToken(webview), 3000);
      }
    } catch (err) {
      console.error('❌ Error checking owner token:', err);
      setTimeout(() => checkForOwnerToken(webview), 3000);
    }
  };

  // ============================================================================
  // STAGE 4: Save token and start capture
  // ============================================================================
  const handleOwnerTokenReceived = async (ownerToken) => {
    try {
      console.log('💾 Saving owner token and starting screenshot capture...');
      ownerAuthTokenRef.current = ownerToken;
      
      const authData = {
        ownerAuthToken: ownerToken,
        initialAuthToken: initialAuthTokenRef.current,
        userData: userDataRef.current,
        savedAt: new Date().toISOString(),
      };

      localStorage.setItem("amdital_auth", JSON.stringify(authData));

      await new Promise((r) => setTimeout(r, 2000));
      
      await window.electronAPI?.screenshots?.setToken({
        authToken: ownerToken,
        userData: userDataRef.current,
      });

      await window.electronAPI?.screenshots?.start();
      isCapturingRef.current = true;
      setIsAuthenticated(true);
      setAuthStage("ready");
      
      console.log('✅ Screenshot capture started successfully!');
    } catch (err) {
      console.error('❌ Error handling owner token:', err);
    }
  };

  // ============================================================================
  // LOGOUT
  // ============================================================================
  const handleLogout = async () => {
    try {
      console.log('👋 Logging out...');
      
      if (isCapturingRef.current) {
        await window.electronAPI?.screenshots?.stop();
        isCapturingRef.current = false;
      }
      
      if (loginCheckIntervalRef.current) {
        clearInterval(loginCheckIntervalRef.current);
        loginCheckIntervalRef.current = null;
      }
      
      initialAuthTokenRef.current = null;
      ownerAuthTokenRef.current = null;
      userDataRef.current = null;
      capturedCredsRef.current = null;
      retryCountRef.current = 0;
      
      localStorage.removeItem("amdital_auth");
      
      setIsAuthenticated(false);
      setAuthStage("initial");
      setWebviewUrl(LOGIN_URL);
    } catch (err) {
      console.error('Error during logout:', err);
    }
  };

  // ============================================================================
  // HELPER
  // ============================================================================
  const isTokenValid = (token) => {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const exp = payload.exp * 1000;
      return Date.now() < exp;
    } catch {
      return false;
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  if (loading) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1a1a",
          color: "#fff",
        }}
      >
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
      <div
        style={{
          position: "absolute",
          top: "var(--titlebar-height, 40px)",
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        {webviewUrl && (
          <webview
            id="main-webview"
            ref={webviewRef}
            src={webviewUrl}
            style={{ width: "100%", height: "100%", border: "none" }}
            webpreferences="contextIsolation=false, allowRunningInsecureContent=true, webSecurity=false"
            allowpopups="true"
            partition="persist:main"
          />
        )}
      </div>
    </div>
  );
};

export default App;