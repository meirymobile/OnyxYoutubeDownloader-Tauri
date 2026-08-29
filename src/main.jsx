import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import MobileApp from './MobileApp.jsx'

const isAndroidMobile = () => {
  if (typeof navigator !== 'undefined') {
    return /Android/i.test(navigator.userAgent)
  }
  return false
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAndroidMobile() ? <MobileApp /> : <App />}
  </StrictMode>,
)
