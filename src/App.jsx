import React from 'react';
import './App.css';
import TitleBar from "./components/TitleBar";

const App = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <TitleBar />
      <div style={{ position: 'absolute', top: 'var(--titlebar-height, 40px)', left: 0, right: 0, bottom: 0 }}>
        <webview
          id="main-webview"
          src="https://app.amdital.com/"
          style={{ width: '100%', height: '100%', border: 'none' }}
          webpreferences="contextIsolation=false, allowRunningInsecureContent=true, webSecurity=false"
          allowpopups="true"
        />
      </div>
    </div>
  );
};

export default App;
