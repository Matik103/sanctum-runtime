import { useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { formatApiError } from '../lib/sanitize-error'

type CreatedAgent = {
  id: string
  name: string
  token: string
  token_hint: string
}

type Props = {
  orgId: string
  onCreated: (agent: CreatedAgent) => void
}

export function ConnectInlineAgentCreate({ orgId, onCreated }: Props) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedAgent | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const token = await getAccessToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; message?: string }
        throw new Error(err.message ?? err.error ?? `create_agent_${res.status}`)
      }
      const data = (await res.json()) as CreatedAgent
      setCreated(data)
      onCreated(data)
    } catch (e) {
      setError(formatApiError(e, 'Could not create agent'))
    } finally {
      setCreating(false)
    }
  }

  function copyToken() {
    if (!created?.token) return
    navigator.clipboard.writeText(created.token).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      window.prompt('Copy agent token:', created.token)
    })
  }

  if (created) {
    return (
      <div className="alert alert--info" style={{ margin: '0.75rem 0 0' }}>
        <div className="alert__body">
          <strong>{created.name}</strong> created. Copy the token now — it is shown once.
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <code style={{ fontSize: '0.75rem', wordBreak: 'break-all', flex: 1 }}>{created.token}</code>
          <button type="button" className="btn btn-primary btn-sm" onClick={copyToken}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy token'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="connect-inline-agent" style={{ marginTop: '0.75rem' }}>
      <label className="connect-field-label">
        Quick create agent
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
          <input
            className="input"
            placeholder="e.g. billing-agent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={creating || !name.trim()}
            onClick={() => void handleCreate()}
          >
            {creating ? <Loader2 size={14} className="spin" /> : 'Create'}
          </button>
        </div>
      </label>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.78rem', marginTop: '0.35rem' }}>{error}</p>}
    </div>
  )
}
