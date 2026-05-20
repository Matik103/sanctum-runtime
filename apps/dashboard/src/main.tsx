import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './auth/AuthProvider'
import { App } from './App'
import { UpdatePrompt } from './components/UpdatePrompt'
import './styles.css'
import './styles/shell.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    <UpdatePrompt />
  </StrictMode>,
)
