// src/App.jsx - UPDATED FINAL VERSION (STABLE & CLEAN)
import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import TitleBar from "./components/TitleBar";

const App = () => {
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
  const forcedOwnerNavRef = useRef(false);
  const hiddenOwnerWebviewRef = useRef(null);

  // ============================================================================
  // INITIALIZE
  // ============================================================================
  useEffect(() => {
    const initializeApp = async () => {
      console.log("🚀 Initializing app...");

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
            console.log(
              "✅ Restored session (Token: " + ownerAuthToken.length + " chars)"
            );
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
            console.log("⚠️ Invalid saved token, forcing fresh login");
            localStorage.removeItem("amdital_auth");
            setWebviewUrl("https://app-amdital.dev.diginnovators.site/login");
          }
        } catch (err) {
          console.error("❌ Error restoring session:", err);
          localStorage.removeItem("amdital_auth");
          setWebviewUrl("https://app-amdital.dev.diginnovators.site/login");
        }
      } else {
        console.log("ℹ️ No saved session, loading login page");
        setWebviewUrl("https://app-amdital.dev.diginnovators.site/login");
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
      if (event.url.includes("/login") || event.url.includes("/logout")) {
        if (isAuthenticated) await handleLogout();
      }

      if (
        authStage === "redirecting" &&
        event.url.includes(".api-amdital.dev.diginnovators.site")
      ) {
        console.log("🔄 Reached owner subdomain, waiting for auto-login...");
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
  // STAGE 1: Check for initial login
  // ============================================================================
  const checkForInitialLogin = async (webview) => {
    try {
      const code = `
        (function() {
          try {
            const loginDetails = localStorage.getItem('store_temp_login_details');
            if (!loginDetails) return null;
            const loginData = JSON.parse(loginDetails);
            const authToken = loginData?.data?.login?.authToken;
            const user = loginData?.data?.login?.user;
            const creds = loginData?.data?.login?.credentials || null;
            if (!authToken || !user) return null;
            const sites = user.sites || [];
            if (sites.length === 0) return null;
            const firstSite = sites[0];
            
            // Also try to capture credentials from form if not in loginData
            let capturedCreds = creds;
            if (!capturedCreds) {
              try {
                const usernameInput = document.querySelector('input[type="email"], input[name="username"], input[name="email"]');
                const passwordInput = document.querySelector('input[type="password"]');
                if (usernameInput && passwordInput) {
                  capturedCreds = {
                    username: usernameInput.value || usernameInput.getAttribute('value') || '',
                    password: passwordInput.value || passwordInput.getAttribute('value') || ''
                  };
                }
              } catch {}
            }
            
            return {
              authToken: authToken,
              rawLoginDetails: loginDetails,
              userData: {
                userId: user.userId,
                userName: user.name,
                userEmail: user.email,
                site: {
                  domain: firstSite.domain,
                  url: firstSite.url,
                  app_url: firstSite.app_url,
                  old_app_url: firstSite.old_app_url,
                  old_api_url: firstSite.old_api_url,
                  amdital_api_key: firstSite.amdital_api_key
                }
              },
              credentials: capturedCreds
            };
          } catch (e) { return null; }
        })();
      `;

      const loginData = await webview.executeJavaScript(code);
      if (loginData && loginData.authToken) {
        if (loginCheckIntervalRef.current) {
          clearInterval(loginCheckIntervalRef.current);
          loginCheckIntervalRef.current = null;
        }

        console.log("\n✅ Initial login detected");
        console.log("👤 User:", loginData.userData.userEmail);
        console.log("🌐 Subdomain:", loginData.userData.site.domain);
        console.log("🔑 Credentials:", loginData.credentials ? "Captured" : "Not available");

        await handleInitialLogin(loginData);
      }
    } catch {}
  };

  // ============================================================================
  // STAGE 2: Handle initial login and redirect
  // ============================================================================
  const handleInitialLogin = async (loginData) => {
    try {
      const { authToken, userData, credentials } = loginData;
      initialAuthTokenRef.current = authToken;
      userDataRef.current = userData;
      rawLoginDetailsRef.current = loginData.rawLoginDetails || null;
      capturedCredsRef.current = credentials || capturedCredsRef.current;

      const webview = document.getElementById("main-webview");
      if (webview) await webview.executeJavaScript(`localStorage.removeItem('token');`);

      // Keep normal app flow visible; probe owner token in a hidden webview
      console.log("🔄 Exchanging token with owner API...\n");
      setAuthStage("owner_exchange");
      try {
        console.log("🔑 Using credentials:", capturedCredsRef.current ? "Yes" : "No");
        const resp = await window.electronAPI?.ownerExchange?.exchange(authToken, userData.site, capturedCredsRef.current || undefined);
        if (resp?.success && resp.ownerAuthToken) {
          console.log("✅ Owner token exchange successful!");
          await handleOwnerTokenReceived(resp.ownerAuthToken);
          return;
        }
        console.warn("⚠️ Owner exchange failed, falling back to hidden probe:", resp?.error || 'unknown');
        setAuthStage("owner_probe");
        startHiddenOwnerProbe(userData.site);
      } catch (e) {
        console.warn("⚠️ Owner exchange error, falling back to hidden probe:", e?.message);
        setAuthStage("owner_probe");
        startHiddenOwnerProbe(userData.site);
      }
    } catch (err) {
      console.error("❌ Error handling initial login:", err);
    }
  };

  // ============================================================================
  // STAGE 3: Extract owner token (FIXED)
  // ============================================================================
  const checkForOwnerToken = async (webview) => {
    try {
      const code = `
        (function() {
          function isJwt(t){
            try{const p=t.split('.'); if(p.length!==3||!t.startsWith('eyJ')) return false; const pl=JSON.parse(atob(p[1])); return !!pl;}catch{return false}
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
            const host = window.location.hostname;
            const captured = window.__amditalCaptured || { reqs: [] };
            // 1) Preferred: localStorage keys
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
            // 1b) sessionStorage fallback
            for(const k of localKeys){
              try {
                const raw = sessionStorage.getItem(k);
                if(!raw) continue;
                try{ const parsed = JSON.parse(raw); const maybe = pickValidOwnerToken(parsed.authToken || parsed.token || parsed); if(maybe) return maybe; }catch{ const maybe = pickValidOwnerToken(raw); if(maybe) return maybe; }
              } catch {}
            }
            // 2) Cookies by name
            const cookies = document.cookie ? document.cookie.split(';') : [];
            for(const c of cookies){
              const [name, valRaw] = c.split('=');
              const nameTrim = (name||'').trim();
              const val = decodeURIComponent((valRaw||'').trim());
              if(['token','owner_token','amdital_owner_token','jwt','authToken','amdital_auth'].includes(nameTrim)){
                const maybe = pickValidOwnerToken(val);
                if(maybe) return maybe;
              }
            }
            // 3) Any JWT-like value in cookies
            for(const c of cookies){
              const val = decodeURIComponent((c.split('=')[1]||'').trim());
              if(isJwt(val)){
                const maybe = pickValidOwnerToken(val);
                if(maybe) return maybe;
              }
            }
            return { host, captured }
          } catch { return null; }
        })();
      `;

      const ownerData = await webview.executeJavaScript(code);

      if (ownerData && ownerData.authToken) {
        console.log("✅ Owner token captured!");
        console.log("📏 Length:", ownerData.authToken.length);
        console.log("🌐 Issuer:", ownerData.issuer);
        await handleOwnerTokenReceived(ownerData.authToken);
        // Clean up hidden webview if used
        try {
          if (hiddenOwnerWebviewRef.current && hiddenOwnerWebviewRef.current === webview) {
            hiddenOwnerWebviewRef.current.remove();
            hiddenOwnerWebviewRef.current = null;
          }
        } catch {}
      } else {
        if (ownerData && ownerData.host) {
          console.log("⏳ Owner token not ready, current host:", ownerData.host);
          // For hidden probe, ensure it's on the correct owner domain
          if (hiddenOwnerWebviewRef.current && webview === hiddenOwnerWebviewRef.current) {
            const ownerDomain = userDataRef.current?.site?.domain;
            if (ownerDomain && !ownerData.host.includes(ownerDomain)) {
              const target = `https://${ownerDomain}`;
              try { webview.loadURL?.(target); console.log("➡️ Hidden probe navigating:", target); } catch {}
            }
          }
          // Fallback: ask main process to read HttpOnly cookies
          if (hiddenOwnerWebviewRef.current && webview === hiddenOwnerWebviewRef.current) {
            try {
              const ownerDomain = userDataRef.current?.site?.domain;
              if (ownerDomain && window.electronAPI?.ownerCookies?.getTokenFromCookies) {
                const resp = await window.electronAPI.ownerCookies.getTokenFromCookies(ownerDomain, ['token','owner_token','amdital_owner_token']);
                if (resp?.success && resp.token) {
                  console.log("✅ Owner token captured from cookies (", resp.name, ")");
                  await handleOwnerTokenReceived(resp.token);
                  try { hiddenOwnerWebviewRef.current?.remove(); hiddenOwnerWebviewRef.current = null; } catch {}
                  return;
                }
                // Also check latest captured token from Set-Cookie sniffer
                if (window.electronAPI?.ownerCookies?.getLatestCapturedToken) {
                  const latest = await window.electronAPI.ownerCookies.getLatestCapturedToken();
                  if (latest?.token) {
                    console.log("✅ Owner token captured via Set-Cookie sniffer (", latest.name || 'unknown', ")");
                    await handleOwnerTokenReceived(latest.token);
                    try { hiddenOwnerWebviewRef.current?.remove(); hiddenOwnerWebviewRef.current = null; } catch {}
                    return;
                  }
                }
                // Replay captured GraphQL/REST if present
                if (ownerData?.captured?.reqs && ownerData.captured.reqs.length && window.electronAPI?.ownerReplay?.replay) {
                  for (const r of ownerData.captured.reqs) {
                    try {
                      const url = r.url;
                      const body = r.body;
                      const headers = r.headers;
                      const rep = await window.electronAPI.ownerReplay.replay(url, body, headers, initialAuthTokenRef.current);
                      if (rep?.success && rep.ownerAuthToken) {
                        console.log('✅ Owner token captured via replay');
                        await handleOwnerTokenReceived(rep.ownerAuthToken);
                        try { hiddenOwnerWebviewRef.current?.remove(); hiddenOwnerWebviewRef.current = null; } catch {}
                        return;
                      }
                    } catch {}
                  }
                }
              }
            } catch {}
          }
        } else {
          console.log("⏳ Owner token not found yet");
        }
        retryCountRef.current++;
        if (retryCountRef.current < maxRetriesRef.current) {
          console.log(`⏳ Waiting for owner token... (${retryCountRef.current}/${maxRetriesRef.current})`);
          setTimeout(() => checkForOwnerToken(webview), 3000);
        } else {
          console.error("❌ Failed to capture owner token after retries");
          alert("Authentication failed. Please logout and login again.");
        }
      }
    } catch (err) {
      console.error("❌ Error checking owner token:", err);
    }
  };

  // ==========================================================================
  // Hidden owner probe: load owner domain off-screen, auto-generate token there
  // ==========================================================================
  const startHiddenOwnerProbe = (site) => {
    try {
      const domain = site?.domain;
      const target = domain ? `https://${domain}` : (site?.old_app_url || site?.app_url || site?.url);
      if (!target) return;

      // Reuse or create hidden webview
      let hv = hiddenOwnerWebviewRef.current;
      if (!hv) {
        hv = document.createElement('webview');
        hv.setAttribute('partition', 'persist:main');
        hv.setAttribute('allowpopups', 'true');
        hv.setAttribute('webpreferences', 'contextIsolation=false, allowRunningInsecureContent=true, webSecurity=false');
        hv.style.width = '0px';
        hv.style.height = '0px';
        hv.style.position = 'absolute';
        hv.style.left = '-9999px';
        document.body.appendChild(hv);
        hiddenOwnerWebviewRef.current = hv;
      }

      const onReady = async () => {
        retryCountRef.current = 0;
        // Inject initial login details into owner origin to trigger auto-login flow
        try {
          // Intercept fetch and XHR to capture owner authToken from API responses
          const interceptor = `(() => {
            try {
              const storeToken = (t) => {
                if (!t) return;
                try { localStorage.setItem('amdital_owner_token', JSON.stringify({ authToken: t })); } catch {}
              };
              const captureReq = (url, body, headers) => {
                try {
                  const caps = window.__amditalCaptured || { reqs: [] };
                  caps.reqs.push({ url, body, headers });
                  window.__amditalCaptured = caps;
                } catch {}
              };
              // Wrap fetch
              if (window.fetch && !window.__amditalFetchWrapped) {
                const origFetch = window.fetch.bind(window);
                window.fetch = async (...args) => {
                  try {
                    const [input, init] = args;
                    let url = typeof input === 'string' ? input : (input?.url || '');
                    let body = init?.body;
                    let headers = init?.headers || {};
                    try { if (typeof body !== 'string') body = body ? JSON.stringify(body) : undefined; } catch {}
                    try { captureReq(url, body, headers); } catch {}
                    const res = await origFetch(input, init);
                    try {
                      const clone = res.clone();
                      const ct = clone.headers.get('content-type') || '';
                      if (ct.includes('application/json')) {
                        const data = await clone.json();
                        const tk = data?.data?.login?.authToken;
                        if (tk && typeof tk === 'string' && tk.split('.').length === 3) storeToken(tk);
                      }
                    } catch {}
                    return res;
                  } catch (e) {
                    throw e;
                  }
                };
                window.__amditalFetchWrapped = true;
              }
              // Wrap XHR
              if (window.XMLHttpRequest && !window.__amditalXHRWrapped) {
                const OrigXHR = window.XMLHttpRequest;
                const jwtLike = (v) => typeof v === 'string' && v.split('.').length === 3;
                window.XMLHttpRequest = function() {
                  const xhr = new OrigXHR();
                  const origOpen = xhr.open;
                  xhr.open = function(method, url) { xhr.__am_url = url; return origOpen.apply(xhr, arguments); };
                  const origSend = xhr.send;
                  xhr.send = function(body) { try { captureReq(xhr.__am_url, body, {}); } catch {} return origSend.apply(xhr, arguments); };
                  xhr.addEventListener('load', function() {
                    try {
                      const ct = xhr.getResponseHeader && xhr.getResponseHeader('content-type');
                      if (ct && ct.includes('application/json') && xhr.responseText) {
                        const data = JSON.parse(xhr.responseText);
                        const tk = data?.data?.login?.authToken;
                        if (jwtLike(tk)) storeToken(tk);
                      }
                    } catch {}
                  });
                  return xhr;
                };
                window.__amditalXHRWrapped = true;
              }
            } catch {}
          })();`;
          await hv.executeJavaScript(interceptor);
          if (rawLoginDetailsRef.current) {
            await hv.executeJavaScript(`localStorage.setItem('store_temp_login_details', ${JSON.stringify(JSON.stringify(rawLoginDetailsRef.current))});`);
            console.log('📦 Injected store_temp_login_details into owner domain');
          }
        } catch {}
        // Small delay to allow app scripts to process, then scan
        setTimeout(async () => {
          await checkForOwnerToken(hv);
        }, 1500);
      };
      hv.addEventListener('dom-ready', onReady, { once: true });

      try { hv.loadURL(target); } catch { hv.setAttribute('src', target); }
      console.log('🕵️ Hidden owner probe started at:', target);
    } catch (e) {
      console.error('❌ Hidden owner probe failed to start:', e);
    }
  };

  // ============================================================================
  // STAGE 4: Save token and start capture
  // ============================================================================
  const handleOwnerTokenReceived = async (ownerToken) => {
    try {
      ownerAuthTokenRef.current = ownerToken;
      const authData = {
        ownerAuthToken: ownerToken,
        initialAuthToken: initialAuthTokenRef.current,
        userData: userDataRef.current,
        savedAt: new Date().toISOString(),
      };

      localStorage.setItem("amdital_auth", JSON.stringify(authData));
      console.log("✅ Token saved (" + ownerToken.length + " chars)");

      await new Promise((r) => setTimeout(r, 2000));
      await window.electronAPI?.screenshots?.setToken({
        authToken: ownerToken,
        userData: userDataRef.current,
      });

      await window.electronAPI?.screenshots?.start();
      isCapturingRef.current = true;
      setIsAuthenticated(true);
      setAuthStage("ready");
      console.log("🎉 Ready to capture!\n");
    } catch (err) {
      console.error("❌ Error:", err);
    }
  };

  // ============================================================================
  // LOGOUT
  // ============================================================================
  const handleLogout = async () => {
    try {
      console.log("\n🚪 Logging out...");
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
      retryCountRef.current = 0;
      localStorage.removeItem("amdital_auth");
      setIsAuthenticated(false);
      setAuthStage("initial");
      setWebviewUrl("https://app-amdital.dev.diginnovators.site/login");
      console.log("✅ Logged out\n");
    } catch (err) {
      console.error("❌ Logout error:", err);
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
  if (loading)
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
