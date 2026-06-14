import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './auth/AuthProvider'
import { SupportPortalAuthProvider } from './auth/SupportPortalAuthProvider'
import { App } from './App'
import { SupportPortalApp } from './SupportPortalApp'
import { UpdatePrompt } from './components/UpdatePrompt'
import { isSupportPortalPath } from './lib/support-portal-path'
import './styles.css'
import './styles/shell.css'
import './styles/pwa.css'

const portalMode = isSupportPortalPath()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {portalMode ? (
      <SupportPortalAuthProvider>
        <SupportPortalApp />
      </SupportPortalAuthProvider>
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
    {!portalMode ? <UpdatePrompt /> : null}
  </StrictMode>,
)
