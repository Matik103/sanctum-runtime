import { useEffect } from 'react'
import { SupportInbox } from './pages/SupportInbox'
import { SupportPortalShell } from './layout/SupportPortalShell'
import { supportPortalSessionFromUrl } from './lib/support-portal-path'

export function SupportPortalApp() {
  const initialSessionId = supportPortalSessionFromUrl()

  useEffect(() => {
    document.title = 'Sanctum Guide · Support'
  }, [])

  return (
    <SupportPortalShell>
      <SupportInbox initialSessionId={initialSessionId} portalMode />
    </SupportPortalShell>
  )
}
