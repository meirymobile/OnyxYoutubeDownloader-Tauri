import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import MobileApp from './MobileApp.jsx'
import MixerApp from './MixerApp.jsx'
import DjayCompanion from './DjayCompanion.jsx'
import DjayFloatingIcon from './DjayFloatingIcon.jsx'
import QrStageWindow from './QrStageWindow.jsx'

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
    {isQrStageWindow ? <QrStageWindow /> : (isDjayFloatWindow ? <DjayFloatingIcon /> : (isDjayWindow ? <DjayCompanion /> : (isMixerWindow ? <MixerApp /> : (isAndroidMobile() ? <MobileApp /> : <App />))))}
  </StrictMode>,
)
