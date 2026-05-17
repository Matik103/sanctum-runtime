import { useState } from 'react'
import type { PolicyMap } from '@sanctum-runtime/sdk/browser'
import {
  actionLabel,
  createPolicyResponse,
  deletePolicyAction,
  exportPoliciesYaml,
  importPoliciesYaml,
  policyToResponse,
  type PolicyResponse,
} from '../lib/api'

const BUILTIN_ACTIONS = new Set([
  'unlock_door',
  'lock_door',
  'send_email',
  'delete_file',
  'execute_terminal',
  'access_database',
  'create_user',
  'transfer_funds',
  'disable_alarm',
  'move_robot',
])

type Props = {
  policies: PolicyMap
  audit: { action: string; timestamp: string }[]
  supabaseConfigured?: boolean
  onSetPolicy: (action: string, response: PolicyResponse) => Promise<void>
  onPoliciesChange: (policies: PolicyMap) => void
}

export function Policies({
  policies,
  audit,
  supabaseConfigured,
  onSetPolicy,
  onPoliciesChange,
}: Props) {
  const [newAction, setNewAction] = useState('')
  const [newMode, setNewMode] = useState<PolicyResponse>('verify')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yamlBusy, setYamlBusy] = useState(false)
  const [savingSpec, setSavingSpec] = useState<{ action: string; response: PolicyResponse } | null>(null)

  const exportYaml = async () => {
    setYamlBusy(true)
    setError(null)
    try {
      const yaml = await exportPoliciesYaml()
      const blob = new Blob([yaml], { type: 'text/yaml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'sanctum-policies.yaml'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setYamlBusy(false)
    }
  }

  const importYamlFile = async (file: File) => {
    setYamlBusy(true)
    setError(null)
    try {
      const yaml = await file.text()
      const next = await importPoliciesYaml(yaml, true)
      onPoliciesChange(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setYamlBusy(false)
    }
  }

  const addPolicy = async () => {
    const action = newAction.trim()
    if (!action) {
      setError('Enter an action name (e.g. deploy_model, acme:transfer_funds)')
      return
    }
    if (!/^[a-zA-Z0-9_.:@/-]+$/.test(action)) {
      setError('Action name can only contain letters, numbers, and _ . : @ / -')
      return
    }
    setAdding(true)
    setError(null)
    try {
      const next = await createPolicyResponse(action, newMode)
      onPoliciesChange(next)
      setNewAction('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add policy')
    } finally {
      setAdding(false)
    }
  }

  const removePolicy = async (action: string) => {
    if (!confirm(`Remove policy for "${action}"?`)) return
    try {
      const next = await deletePolicyAction(action)
      onPoliciesChange(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove policy')
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Policies</h1>
          <p>Define trust boundaries — not programming rules</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="response-btn"
            disabled={yamlBusy}
            onClick={() => void exportYaml()}
          >
            Export YAML
          </button>
          <label className="response-btn" style={{ cursor: yamlBusy ? 'wait' : 'pointer' }}>
            Import YAML
            <input
              type="file"
              accept=".yaml,.yml,text/yaml"
              hidden
              disabled={yamlBusy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importYamlFile(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </header>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          Add as many action policies as your product needs. Each policy sets how Sanctum responds
          when an AI requests that action. Changes are saved to the runtime API
          {supabaseConfigured ? ' and Supabase' : ''}.{' '}
          <strong style={{ color: 'var(--success)' }}>Approve</strong> runs automatically,{' '}
          <strong style={{ color: 'var(--warning)' }}>Verify</strong> pauses for you,{' '}
          <strong style={{ color: '#fca5a5' }}>Block</strong> denies immediately.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card-label" style={{ marginTop: 0 }}>
          Add policy
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="action_name or org:action"
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addPolicy() }}
            style={{
              flex: '1 1 12rem',
              minWidth: '12rem',
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
          <select
            value={newMode}
            onChange={(e) => setNewMode(e.target.value as PolicyResponse)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          >
            <option value="approve">Approve</option>
            <option value="verify">Verify</option>
            <option value="block">Block</option>
          </select>
          <button
            type="button"
            className="response-btn active approve"
            disabled={adding}
            onClick={() => void addPolicy()}
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {error && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#fca5a5' }}>{error}</p>
        )}
      </div>

      <div className="policy-grid">
        {Object.entries(policies).map(([action, policy]) => {
          const response = policyToResponse(policy)
          const last = audit.find((e) => e.action === action)

          return (
            <article key={action} className="policy-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>{actionLabel(action)}</h3>
                {!BUILTIN_ACTIONS.has(action) && (
                  <button
                    type="button"
                    className="response-btn"
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                    onClick={() => void removePolicy(action)}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p style={{ margin: '0.25rem 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
                When an agent requests this action, Sanctum applies the response below.
              </p>

              <p className="card-label" style={{ marginTop: '0.75rem' }}>
                Runtime response
              </p>
              <div className="response-select">
                {(['approve', 'verify', 'block'] as PolicyResponse[]).map((r) => {
                  const isSaving = savingSpec?.action === action && savingSpec?.response === r
                  const isBusy = savingSpec?.action === action
                  return (
                    <button
                      key={r}
                      type="button"
                      className={`response-btn ${response === r ? `active ${r}` : ''}`}
                      disabled={isBusy}
                      onClick={() => {
                        setSavingSpec({ action, response: r })
                        setError(null)
                        void onSetPolicy(action, r)
                          .catch((e) => {
                            setError(
                              e instanceof Error ? e.message : 'Failed to save policy',
                            )
                          })
                          .finally(() => setSavingSpec(null))
                      }}
                    >
                      {isSaving
                        ? 'Saving…'
                        : r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  )
                })}
              </div>

              {last && (
                <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                  Last triggered: {new Date(last.timestamp).toLocaleString()}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </>
  )
}
