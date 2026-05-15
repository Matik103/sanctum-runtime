import { useState } from 'react'
import type { ActionResult } from '@sanctum/sdk'
import { ActionDrawer } from './components/ActionDrawer'
import { VerificationModal } from './components/VerificationModal'
import { useDashboard } from './hooks/useDashboard'
import { Sidebar, type PageId } from './layout/Sidebar'
import { AuditLogs } from './pages/AuditLogs'
import { Devices } from './pages/Devices'
import { Overview } from './pages/Overview'
import { Policies } from './pages/Policies'
import { RuntimeActivity } from './pages/RuntimeActivity'
import { Settings } from './pages/Settings'
import { ThreatMonitor } from './pages/ThreatMonitor'

export function App() {
  const [page, setPage] = useState<PageId>('overview')
  const [selected, setSelected] = useState<ActionResult | null>(null)
  const {
    audit,
    policies,
    status,
    loading,
    runDemo,
    setPolicy,
    pendingVerification,
    dismissVerification,
  } = useDashboard()

  const onSelect = (e: ActionResult) => setSelected(e)

  return (
    <div className="shell">
      <Sidebar page={page} onPage={setPage} status={status} />

      <main className="main">
        {page === 'overview' && (
          <Overview
            audit={audit}
            policies={policies}
            status={status}
            loading={loading}
            onRunDemo={runDemo}
            onSelect={onSelect}
          />
        )}
        {page === 'activity' && <RuntimeActivity audit={audit} onSelect={onSelect} />}
        {page === 'threats' && <ThreatMonitor audit={audit} onSelect={onSelect} />}
        {page === 'policies' && (
          <Policies policies={policies} audit={audit} onSetPolicy={setPolicy} />
        )}
        {page === 'devices' && <Devices status={status} />}
        {page === 'audit' && <AuditLogs audit={audit} onSelect={onSelect} />}
        {page === 'settings' && <Settings status={status} />}
      </main>

      <ActionDrawer entry={selected} onClose={() => setSelected(null)} />

      {pendingVerification && (
        <VerificationModal
          entry={pendingVerification}
          onApproveOnce={() => {
            dismissVerification()
            setSelected(pendingVerification)
          }}
          onAlwaysApprove={async () => {
            await setPolicy(pendingVerification.action, 'approve')
            dismissVerification()
          }}
          onDeny={() => dismissVerification()}
        />
      )}
    </div>
  )
}
