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

// ─── Normalization ──────────────────────────────────────────────────────────
// Users type naturally ("Delete File", "deleteFile", "delete-file")
// and we convert to the machine key the runtime expects.
function toActionKey(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')   // camelCase → snake
    .replace(/[\s\-]+/g, '_')              // spaces and hyphens → _
    .toLowerCase()
    .replace(/[^a-z0-9_.:@]/g, '')         // strip anything else
    .replace(/_+/g, '_')                   // collapse __
    .replace(/^_+|_+$/g, '')              // trim edges
}

// ─── Response options ────────────────────────────────────────────────────────
const RESPONSE_OPTIONS: {
  value: PolicyResponse
  label: string
  desc: string
  accent: string
  activeClass: string
}[] = [
  {
    value: 'approve',
    label: 'Approve',
    desc: 'Agent runs this automatically — no human review needed',
    accent: 'var(--success)',
    activeClass: 'approve',
  },
  {
    value: 'verify',
    label: 'Verify',
    desc: 'Pause and ask you to confirm before the action runs',
    accent: 'var(--warning)',
    activeClass: 'verify',
  },
  {
    value: 'block',
    label: 'Block',
    desc: 'Always denied — the agent can never perform this action',
    accent: '#fca5a5',
    activeClass: 'block',
  },
]

// ─── Categorised common actions ──────────────────────────────────────────────
const CATEGORIES: { label: string; emoji: string; actions: string[] }[] = [
  {
    label: 'Files & System',
    emoji: '🗂',
    actions: ['delete_file', 'execute_terminal', 'install_package', 'kill_process', 'run_workflow'],
  },
  {
    label: 'Data',
    emoji: '🗄',
    actions: ['access_database', 'access_record', 'store_memory'],
  },
  {
    label: 'Communication',
    emoji: '✉️',
    actions: ['send_email', 'send_message', 'post_slack', 'update_crm'],
  },
  {
    label: 'Finance',
    emoji: '💳',
    actions: ['transfer_funds', 'place_order'],
  },
  {
    label: 'Access & Security',
    emoji: '🔐',
    actions: [
      'unlock_door', 'lock_door', 'open_door', 'open_gate',
      'create_user', 'disable_alarm', 'arm_perimeter', 'stream_camera',
    ],
  },
  {
    label: 'Robotics & Physical',
    emoji: '🤖',
    actions: [
      'move_robot', 'robot_arm_move', 'navigate', 'dock', 'calibrate_arm',
      'grasp', 'release_payload', 'move_to_location', 'handover_object',
      'move_bed', 'dispense', 'change_route', 'engage_mode',
      'emergency_stop', 'start_line', 'adjust_setpoint',
    ],
  },
]

const BUILTIN_ACTIONS = new Set(CATEGORIES.flatMap((c) => c.actions))

// ─── Small helpers ───────────────────────────────────────────────────────────
function CopyChip({ value }: { value: string }) {
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
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <code
        style={{
          fontSize: '0.72rem',
          fontFamily: 'monospace',
          padding: '0.15rem 0.4rem',
          borderRadius: 5,
          background: 'rgba(255,255,255,0.06)',
          color: copied ? 'var(--success)' : 'var(--muted)',
          transition: 'color 0.15s',
        }}
      >
        {copied ? '✓ copied' : value}
      </code>
    </button>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────
type Props = {
  policies: PolicyMap
  audit: { action: string; timestamp: string }[]
  supabaseConfigured?: boolean
  onSetPolicy: (action: string, response: PolicyResponse) => Promise<void>
  onPoliciesChange: (policies: PolicyMap) => void
}

// ─── Component ───────────────────────────────────────────────────────────────
export function Policies({ policies, audit, onSetPolicy, onPoliciesChange }: Props) {
  // Add-form state
  const [inputValue, setInputValue] = useState('')   // what the user types
  const [newMode, setNewMode] = useState<PolicyResponse>('verify')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBrowse, setShowBrowse] = useState(false)

  // Import/export
  const [yamlBusy, setYamlBusy] = useState(false)

  // Per-card saving tracker
  const [savingSpec, setSavingSpec] = useState<{ action: string; response: PolicyResponse } | null>(null)

  // The normalised key derived live from what the user typed
  const previewKey = toActionKey(inputValue)
  const keyIsValid = previewKey.length > 0 && /^[a-z0-9_.:@]+$/.test(previewKey)

  // ── Export / import ────────────────────────────────────────────────────────
  const exportYaml = async () => {
    setYamlBusy(true)
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

  // ── Add policy ────────────────────────────────────────────────────────────
  const addPolicy = async (overrideKey?: string) => {
    const key = overrideKey ?? previewKey
    if (!key) { setError('Enter an action name above'); return }
    setAdding(true)
    setError(null)
    try {
      const next = await createPolicyResponse(key, newMode)
      onPoliciesChange(next)
      setInputValue('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save policy')
    } finally {
      setAdding(false)
    }
  }

  const removePolicy = async (action: string) => {
    if (!confirm(`Remove policy for "${actionLabel(action)}"?`)) return
    try {
      const next = await deletePolicyAction(action)
      onPoliciesChange(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove policy')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Header ── */}
      <header className="page-header">
        <div>
          <h1>Policies</h1>
          <p>Define what your AI agents are allowed to do — and when they need your sign-off</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="response-btn" disabled={yamlBusy} onClick={() => void exportYaml()}>
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
                const f = e.target.files?.[0]
                if (f) void importYamlFile(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </header>

      {/* ── How it works ── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 0.55rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
          How policies work
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginBottom: '0.85rem' }}>
          {RESPONSE_OPTIONS.map((o) => (
            <span key={o.value} style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              <strong style={{ color: o.accent }}>{o.label}</strong> — {o.desc}
            </span>
          ))}
        </div>
        <div style={{
          padding: '0.65rem 0.85rem',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 8,
          borderLeft: '3px solid rgba(79,124,255,0.4)',
        }}>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.65 }}>
            Your agent activates these policies by passing its org ID:{' '}
            <code style={{ fontSize: '0.78rem', color: 'var(--text)' }}>
              {'verifyAction({ action: \'delete_file\', context: { org_id: \'YOUR_ORG_ID\' } })'}
            </code>
            <br />
            The key in <code style={{ fontSize: '0.78rem' }}>action:</code> must match exactly — each policy card below shows the key to copy.
          </p>
        </div>
      </div>

      {/* ── Add policy form ── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
          Add a policy
        </p>

        {/* Action name input */}
        <div style={{ marginBottom: '1.1rem' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Action name
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Delete File, sendEmail, deploy-model"
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && keyIsValid) void addPolicy() }}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.9rem', padding: '0.65rem 0.85rem' }}
          />
          {/* Live key preview */}
          <div style={{ marginTop: '0.4rem', minHeight: '1.3rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
            {inputValue.trim() && (
              previewKey
                ? <>
                    Agent key:{' '}
                    <code style={{ color: 'var(--text)', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.35rem', borderRadius: 4, fontSize: '0.76rem' }}>
                      {previewKey}
                    </code>
                    {' '}<span style={{ color: 'rgba(255,255,255,0.2)' }}>— normalised automatically</span>
                  </>
                : <span style={{ color: '#fca5a5' }}>Name produces an empty key — try a different input</span>
            )}
            {!inputValue.trim() && (
              <span>Type any format — we'll normalise to the right key automatically</span>
            )}
          </div>
        </div>

        {/* Response selection */}
        <div style={{ marginBottom: '1.1rem' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            What happens when triggered?
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {RESPONSE_OPTIONS.map((opt) => {
              const active = newMode === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewMode(opt.value)}
                  style={{
                    flex: '1 1 140px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    padding: '0.75rem 0.85rem',
                    borderRadius: 10,
                    border: active ? `1.5px solid ${opt.accent}` : '1.5px solid var(--border)',
                    background: active ? `color-mix(in srgb, ${opt.accent} 10%, transparent)` : 'var(--elevated)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: active ? opt.accent : 'var(--text)' }}>
                    {opt.label}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                    {opt.desc}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Error + submit */}
        {error && (
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: '#fca5a5' }}>{error}</p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`response-btn active ${newMode}`}
            disabled={adding || !keyIsValid}
            onClick={() => void addPolicy()}
            style={{ padding: '0.55rem 1.5rem', fontSize: '0.85rem' }}
          >
            {adding ? 'Saving…' : 'Save policy'}
          </button>
          <button
            type="button"
            onClick={() => setShowBrowse((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: '0.82rem',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            {showBrowse ? 'Hide' : 'Browse'} common actions
          </button>
        </div>

        {/* Browsable common actions */}
        {showBrowse && (
          <div style={{ marginTop: '1.1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Click any action to pre-fill — then choose a response and save.
            </p>
            {CATEGORIES.map((cat) => (
              <div key={cat.label} style={{ marginBottom: '0.75rem' }}>
                <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {cat.emoji} {cat.label}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {cat.actions.map((a) => {
                    const alreadyHas = a in policies
                    return (
                      <button
                        key={a}
                        type="button"
                        disabled={alreadyHas}
                        onClick={() => { setInputValue(actionLabel(a)); setError(null) }}
                        style={{
                          padding: '0.3rem 0.7rem',
                          borderRadius: 999,
                          fontSize: '0.75rem',
                          border: '1px solid var(--border)',
                          background: alreadyHas ? 'rgba(255,255,255,0.03)' : 'var(--elevated)',
                          color: alreadyHas ? 'var(--muted)' : 'var(--text)',
                          cursor: alreadyHas ? 'default' : 'pointer',
                          opacity: alreadyHas ? 0.5 : 1,
                        }}
                      >
                        {actionLabel(a)}
                        {alreadyHas && <span style={{ marginLeft: '0.3rem', fontSize: '0.65rem' }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Policy grid ── */}
      {Object.entries(policies).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--muted)' }}>
          <p style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>No policies loaded yet</p>
          <p style={{ fontSize: '0.82rem' }}>Add an action above, or use Import YAML to load a policy set.</p>
        </div>
      ) : (
        <div className="policy-grid">
          {Object.entries(policies).map(([action, policy]) => {
            const response = policyToResponse(policy)
            const last = audit.find((e) => e.action === action)
            const isBuiltin = BUILTIN_ACTIONS.has(action)

            return (
              <article key={action} className="policy-card">
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.15rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
                    {actionLabel(action)}
                  </h3>
                  {!isBuiltin && (
                    <button
                      type="button"
                      className="response-btn"
                      style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', flexShrink: 0 }}
                      onClick={() => void removePolicy(action)}
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Action key + built-in label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  <CopyChip value={action} />
                  {isBuiltin && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', padding: '0.1rem 0.4rem', borderRadius: 999, border: '1px solid var(--border)' }}>
                      built-in
                    </span>
                  )}
                </div>

                {/* Response selector */}
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
                          void onSetPolicy(action, r)
                            .catch((e) => setError(e instanceof Error ? e.message : 'Failed to save'))
                            .finally(() => setSavingSpec(null))
                        }}
                      >
                        {isSaving ? '…' : r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    )
                  })}
                </div>

                {/* Last triggered */}
                <p style={{ margin: '0.65rem 0 0', fontSize: '0.72rem', color: 'var(--muted)' }}>
                  {last
                    ? `Last triggered ${new Date(last.timestamp).toLocaleString()}`
                    : 'Never triggered'}
                </p>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
