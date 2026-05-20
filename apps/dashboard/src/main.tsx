import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { AuthProvider } from './auth/AuthProvider'
import { App } from './App'
import './styles.css'
import './styles/shell.css'

// Registers the Workbox service worker; auto-updates on new deploys.
registerSW({ immediate: false })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
