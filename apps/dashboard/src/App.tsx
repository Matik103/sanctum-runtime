import { useState } from 'react'
import type { ActionResult } from '@sanctum-runtime/sdk'
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
    pendingReviewCount,
    markVerificationsDismissed,
    openNextPendingReview,
    apiError,
  } = useDashboard()

  const onSelect = (e: ActionResult) => setSelected(e)

  return (
    <div className="shell">
      <Sidebar page={page} onPage={setPage} status={status} />

      <main className="main">
        {apiError && (
          <div
            className="card"
            style={{
              marginBottom: '1rem',
              borderColor: 'var(--danger)',
              color: 'var(--foreground)',
              fontSize: '0.9rem',
            }}
          >
            <strong>API unreachable</strong>
            <p style={{ margin: '0.5rem 0 0', color: 'var(--muted)' }}>{apiError}</p>
          </div>
        )}

        {!pendingVerification && pendingReviewCount > 0 && (
          <div
            className="card"
            style={{
              marginBottom: '1rem',
              borderColor: 'var(--warning)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              <strong>{pendingReviewCount}</strong> action
              {pendingReviewCount === 1 ? '' : 's'} waiting for your review (from audit log).
            </p>
            <button type="button" className="btn btn-ghost" onClick={openNextPendingReview}>
              Review next
            </button>
          </div>
        )}

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
            const entry = pendingVerification
            markVerificationsDismissed('all')
            setSelected(entry)
          }}
          onAlwaysApprove={async () => {
            const entry = pendingVerification
            await setPolicy(entry.action, 'approve')
            markVerificationsDismissed({ action: entry.action })
          }}
          onDeny={() => markVerificationsDismissed('all')}
        />
      )}
    </div>
  )
}
