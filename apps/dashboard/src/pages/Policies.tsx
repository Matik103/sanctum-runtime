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
  'unlock_door', 'lock_door', 'send_email', 'delete_file', 'execute_terminal',
  'access_database', 'create_user', 'transfer_funds', 'disable_alarm', 'move_robot',
  'robot_arm_move', 'navigate', 'dock', 'calibrate_arm', 'grasp', 'release_payload',
  'move_to_location', 'handover_object', 'install_package', 'kill_process', 'run_workflow',
  'post_slack', 'update_crm', 'open_gate', 'arm_perimeter', 'stream_camera', 'dispense',
  'move_bed', 'access_record', 'change_route', 'engage_mode', 'open_door', 'send_message',
  'store_memory', 'place_order', 'emergency_stop', 'start_line', 'adjust_setpoint',
])

type Props = {
  policies: PolicyMap
  audit: { action: string; timestamp: string }[]
  supabaseConfigured?: boolean
  onSetPolicy: (action: string, response: PolicyResponse) => Promise<void>
  onPoliciesChange: (policies: PolicyMap) => void
}

function CopyKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copy action key"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
      }}
    >
      <code style={{
        fontSize: '0.7rem',
        background: 'var(--surface-raised, rgba(255,255,255,0.06))',
        padding: '0.1rem 0.35rem',
        borderRadius: 4,
        color: copied ? 'var(--success)' : 'var(--muted)',
        fontFamily: 'monospace',
        letterSpacing: 0,
      }}>
        {copied ? 'copied!' : value}
      </code>
    </button>
  )
}

export function Policies({
  policies,
  audit,
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
    const raw = newAction.trim()
    if (!raw) {
      setError('Enter an action key (e.g. deploy_model)')
      return
    }
    if (raw.includes('-')) {
      setError(`Use underscores, not hyphens — try: ${raw.replace(/-/g, '_')}`)
      return
    }
    if (!/^[a-zA-Z0-9_.:@/]+$/.test(raw)) {
      setError('Action key can only contain letters, numbers, and _ . : @')
      return
    }
    setAdding(true)
    setError(null)
    try {
      const next = await createPolicyResponse(raw, newMode)
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
          <p>Configure trust boundaries for AI agent actions across your fleet</p>
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
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--success)' }}>Approve</strong> — runs automatically &nbsp;·&nbsp;
          <strong style={{ color: 'var(--warning)' }}>Verify</strong> — pauses for your review &nbsp;·&nbsp;
          <strong style={{ color: '#fca5a5' }}>Block</strong> — denied immediately
        </p>
      </div>

      {/* How policies reach agents */}
      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--accent)' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
          How policies apply to your agents
        </p>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--muted)' }}>
          Policies you set here are <strong style={{ color: 'var(--text)' }}>automatically scoped to your org</strong> — you don't need to add any prefix.
          To activate them, your agent must pass its org ID when calling{' '}
          <code style={{ fontSize: '0.78rem' }}>verifyAction()</code>:
        </p>
        <pre style={{
          margin: 0,
          padding: '0.6rem 0.75rem',
          background: 'var(--surface-raised, rgba(255,255,255,0.05))',
          borderRadius: 6,
          fontSize: '0.78rem',
          color: 'var(--text)',
          overflowX: 'auto',
          lineHeight: 1.6,
        }}>
{`await runtime.verifyAction({
  action: 'delete_file',   // must match the key shown on each card below
  context: { org_id: 'YOUR_ORG_ID' },
})`}
        </pre>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
          Without <code style={{ fontSize: '0.76rem' }}>org_id</code> in context, the global default policy applies.
          Each policy card below shows the exact key to use in <code style={{ fontSize: '0.76rem' }}>action:</code>.
        </p>
      </div>

      {/* Add custom policy */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p className="card-label" style={{ marginTop: 0 }}>
          Add custom action policy
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 12rem', minWidth: '12rem' }}>
            <input
              type="text"
              className="input"
              placeholder="my_custom_action"
              value={newAction}
              onChange={(e) => { setNewAction(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') void addPolicy() }}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
              Use <strong>snake_case</strong> — must match exactly what your agent passes to <code style={{ fontSize: '0.73rem' }}>verifyAction()</code>
            </p>
          </div>
          <select
            className="input"
            value={newMode}
            onChange={(e) => setNewMode(e.target.value as PolicyResponse)}
            style={{ flex: '0 0 auto' }}
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
            style={{ whiteSpace: 'nowrap' }}
          >
            {adding ? 'Adding…' : 'Add policy'}
          </button>
        </div>
        {error && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#fca5a5' }}>{error}</p>
        )}
      </div>

      <div className="policy-grid">
        {Object.entries(policies).length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)' }}>
            <p style={{ marginBottom: '0.5rem', fontSize: '0.95rem' }}>No policies loaded yet.</p>
            <p style={{ fontSize: '0.82rem' }}>Default policies will appear once the API is reachable. You can also add a custom action above.</p>
          </div>
        )}
        {Object.entries(policies).map(([action, policy]) => {
          const response = policyToResponse(policy)
          const last = audit.find((e) => e.action === action)
          const isBuiltin = BUILTIN_ACTIONS.has(action)

          return (
            <article key={action} className="policy-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem', alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{actionLabel(action)}</h3>
                {!isBuiltin && (
                  <button
                    type="button"
                    className="response-btn"
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', flexShrink: 0 }}
                    onClick={() => void removePolicy(action)}
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Copyable action key */}
              <div style={{ marginBottom: '0.6rem' }}>
                <CopyKey value={action} />
                {isBuiltin && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--muted)', marginLeft: '0.4rem' }}>
                    built-in
                  </span>
                )}
              </div>

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
                            setError(e instanceof Error ? e.message : 'Failed to save policy')
                          })
                          .finally(() => setSavingSpec(null))
                      }}
                    >
                      {isSaving ? 'Saving…' : r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  )
                })}
              </div>

              <p style={{ marginTop: '0.6rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
                {last
                  ? `Last triggered: ${new Date(last.timestamp).toLocaleString()}`
                  : 'Never triggered'}
              </p>
            </article>
          )
        })}
      </div>
    </>
  )
}
