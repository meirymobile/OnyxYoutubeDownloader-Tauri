import React, { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import MobileApp from './MobileApp.jsx'
import MixerApp from './MixerApp.jsx'
import DjayCompanion from './DjayCompanion.jsx'
import DjayFloatingIcon from './DjayFloatingIcon.jsx'
import QrStageWindow from './QrStageWindow.jsx'

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error("Global window error:", event.error || event.message);
    const root = document.getElementById('root');
    if (root && (!root.children || root.children.length === 0)) {
      root.innerHTML = `<div style="padding:30px;color:#f43f5e;background:#07020d;font-family:sans-serif;direction:ltr;">
        <h2>Startup Error:</h2>
        <pre style="background:#1e112a;padding:16px;border-radius:8px;color:#fbcfe8;white-space:pre-wrap;">${event.message}\n${event.filename || ''}:${event.lineno || ''}</pre>
      </div>`;
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error("Unhandled promise rejection:", event.reason);
  });
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("UI Error caught by boundary:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 30, background: '#07020d', color: '#fff', minHeight: '100vh', fontFamily: 'sans-serif', direction: 'rtl' }}>
          <h2 style={{ color: '#f43f5e', marginBottom: 12 }}>שגיאה בטעינת הממשק</h2>
          <pre style={{ background: '#1e112a', padding: 16, borderRadius: 12, color: '#fbcfe8', overflowX: 'auto', fontSize: 13, border: '1px solid #701a75' }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => { localStorage.removeItem('onyx_guest_host_url'); window.location.reload(); }} 
            style={{ marginTop: 16, padding: '10px 20px', background: '#9333ea', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold' }}
          >
            איפוס הגדרות ורענון
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const isAndroidMobile = () => {
  if (typeof navigator !== 'undefined') {
    return /Android/i.test(navigator.userAgent)
  }
  return false
}

const isMixerWindow = typeof window !== 'undefined' && window.location.search.includes('mixer=true');
const isDjayWindow = typeof window !== 'undefined' && window.location.search.includes('djay=true');
const isDjayFloatWindow = typeof window !== 'undefined' && window.location.search.includes('djay_float=true');
const isQrStageWindow = typeof window !== 'undefined' && window.location.search.includes('qr_stage=true');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      {isQrStageWindow ? <QrStageWindow /> : (isDjayFloatWindow ? <DjayFloatingIcon /> : (isDjayWindow ? <DjayCompanion /> : (isMixerWindow ? <MixerApp /> : (isAndroidMobile() ? <MobileApp /> : <App />))))}
    </ErrorBoundary>
  </StrictMode>,
)
