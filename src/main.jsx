import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import MobileApp from './MobileApp.jsx'
import MixerApp from './MixerApp.jsx'

const isAndroidMobile = () => {
  if (typeof navigator !== 'undefined') {
    return /Android/i.test(navigator.userAgent)
  }
  return false
}

const isMixerWindow = typeof window !== 'undefined' && window.location.search.includes('mixer=true');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isMixerWindow ? <MixerApp /> : (isAndroidMobile() ? <MobileApp /> : <App />)}
  </StrictMode>,
)
