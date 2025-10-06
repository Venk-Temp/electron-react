// src/components/TitleBar.jsx
import React, { useEffect, useState } from "react";
import "../styles/TitleBar.css";

const TitleBar = () => {
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    if (window?.electronAPI?.onWindowState) {
      const cleanup = window.electronAPI.onWindowState((state) => setIsMax(!!state));
      window.electronAPI?.requestWindowState?.();
      return cleanup;
    }
    return undefined;
  }, []);

  const onMin = () => window?.electronAPI?.minimize?.();
  const onMax = () => window?.electronAPI?.maximize?.();
  const onClose = () => window?.electronAPI?.close?.();
  const onTray = () => window?.electronAPI?.trayClick?.();

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <button className="control-btn tray-btn" title="Menu" onClick={onTray}>
          <svg className="tray-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="titlebar-center">
        <div className="title-text">Amdital</div>
      </div>

      <div className="window-controls">
        <button title="Minimize" onClick={onMin} className="control-btn minimize-btn">
          <svg width="14" height="14" viewBox="0 0 16 16"><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>

        <button title={isMax ? "Restore" : "Maximize"} onClick={onMax} className="control-btn maximize-btn">
          <svg width="14" height="14" viewBox="0 0 16 16">
            {isMax ? (
              <g transform="scale(-1,1) translate(-16,0)">
                <rect x="4" y="4" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="2" y="2" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2"/>
              </g>
            ) : (
              <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            )}
          </svg>
        </button>

        <button title="Close" onClick={onClose} className="control-btn close-btn">
          <svg width="14" height="14" viewBox="0 0 16 16"><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
