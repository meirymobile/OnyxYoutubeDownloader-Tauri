import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import MobileApp from './MobileApp.jsx'
import MixerApp from './MixerApp.jsx'
import DjayCompanion from './DjayCompanion.jsx'

const isAndroidMobile = () => {
  if (typeof navigator !== 'undefined') {
    return /Android/i.test(navigator.userAgent)
  }
  return false
}

const isMixerWindow = typeof window !== 'undefined' && window.location.search.includes('mixer=true');
const isDjayWindow = typeof window !== 'undefined' && window.location.search.includes('djay=true');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isDjayWindow ? <DjayCompanion /> : (isMixerWindow ? <MixerApp /> : (isAndroidMobile() ? <MobileApp /> : <App />))}
  </StrictMode>,
)
