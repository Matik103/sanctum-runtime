import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Check, Save, Trash2 } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import { getConnectSettings, saveConnectSettings, clearConnectSettings } from '../lib/connect-settings'
import type { PageId } from '../layout/Sidebar'

const PLATFORMS = [
  { id: 'openai',   label: 'OpenAI',    flag: '🟢', defaultModel: 'gpt-4o-mini',       placeholder: 'sk-...' },
  { id: 'deepseek', label: 'DeepSeek',  flag: '🔵', defaultModel: 'deepseek-chat',      placeholder: 'sk-...' },
  { id: 'qwen',     label: 'Qwen',      flag: '🟠', defaultModel: 'qwen-plus',          placeholder: 'sk-...' },
  { id: 'kimi',     label: 'Kimi',      flag: '🌙', defaultModel: 'moonshot-v1-8k',     placeholder: 'sk-...' },
  { id: 'doubao',   label: 'Doubao',    flag: '🟣', defaultModel: 'doubao-pro-4k',      placeholder: 'sk-...' },
  { id: 'gemini',   label: 'Gemini',    flag: '⭐', defaultModel: 'gemini-1.5-flash',   placeholder: 'AIza...' },
] as const

type Platform = typeof PLATFORMS[number]['id']

const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as Platform[]

type ApiKeys = Record<Platform, string>

function emptyKeys(): ApiKeys {
  return Object.fromEntries(PLATFORM_IDS.map((id) => [id, ''])) as ApiKeys
}

type Props = { orgId: string | null; onPage: (p: PageId) => void }

export function Connect({ orgId, onPage }: Props) {
  const [platform, setPlatform] = useState<Platform>('openai')
  const [token, setToken] = useState('')
  const [apiKeys, setApiKeys] = useState<ApiKeys>(emptyKeys)

  const [loadingSettings, setLoadingSettings] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load saved credentials for all platforms at once on mount / org change
  const loadSettings = useCallback(async () => {
    if (!orgId) return
    setLoadingSettings(true)
    try {
      const results = await Promise.all(
        PLATFORM_IDS.map((id) => getConnectSettings(orgId, id).catch(() => null))
      )
      const keys = emptyKeys()
      let savedToken = ''
      let hasDecryptionFailure = false
      results.forEach((s, i) => {
        if (!s?.exists) return
        const id = PLATFORM_IDS[i]
        if (s.agent_token && !savedToken) savedToken = s.agent_token
        if (s.platform_api_key) keys[id] = s.platform_api_key
        if (s.decryption_failed) hasDecryptionFailure = true
      })
      setToken(savedToken)
      setApiKeys(keys)
      if (hasDecryptionFailure) setSaveError('Some saved credentials could not be decrypted — please re-enter and save again.')
    } catch {
      setToken('')
      setApiKeys(emptyKeys())
    } finally {
      setLoadingSettings(false)
    }
  }, [orgId])

  useEffect(() => { void loadSettings() }, [loadSettings])

  async function handleSave() {
    if (!orgId) return
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setSaveStatus('saving')
    setSaveError(null)
    try {
      await Promise.all(
        PLATFORM_IDS.map((id) =>
          saveConnectSettings(orgId, id, {
            agent_token: token.trim() || null,
            platform_api_key: apiKeys[id].trim() || null,
          })
        )
      )
      setSaveStatus('saved')
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
      setSaveStatus('error')
    }
  }

  async function handleClearAll() {
    if (!orgId) return
    try {
      await Promise.all(PLATFORM_IDS.map((id) => clearConnectSettings(orgId, id).catch(() => {})))
      setToken('')
      setApiKeys(emptyKeys())
      setSaveStatus('idle')
      setSaveError(null)
    } catch { /* ignore */ }
  }

  const proxyUrl = `${apiBaseUrl}/v1/proxy/${platform}`
  const defaultModel = PLATFORMS.find((p) => p.id === platform)?.defaultModel ?? 'gpt-4o-mini'
  const displayApiKey = apiKeys[platform].trim() || `<your-${platform}-api-key>`

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const pythonSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="${proxyUrl}",
    api_key="${displayApiKey}",
    default_headers={
        "X-Sanctum-Agent-Token": "${token || '<your-agent-token>'}",
    },
)

response = client.chat.completions.create(
    model="${defaultModel}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)`

  const tsSnippet = `import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '${proxyUrl}',
  apiKey: '${displayApiKey}',
  defaultHeaders: {
    'X-Sanctum-Agent-Token': '${token || '<your-agent-token>'}',
  },
})

const response = await client.chat.completions.create({
  model: '${defaultModel}',
  messages: [{ role: 'user', content: 'Hello' }],
})
console.log(response.choices[0].message.content)`

  const inputBase: React.CSSProperties = {
    boxSizing: 'border-box',
    fontFamily: 'monospace',
    fontSize: '0.82rem',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '0.5rem 0.75rem',
    color: 'var(--text)',
    outline: 'none',
  }

  const hasAnyCredential = !!token.trim() || PLATFORM_IDS.some((id) => apiKeys[id].trim())

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Connect Agent</h1>
          <p>Route any third-party agent through Sanctum with zero SDK installation — just change the base URL.</p>
        </div>
      </header>

      {/* Step 1 — Pick platform */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
          <span className="step-badge">1</span> Choose your AI platform
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: 8,
                border: `1.5px solid ${platform === p.id ? 'var(--accent, #6366f1)' : 'rgba(255,255,255,0.1)'}`,
                background: platform === p.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: platform === p.id ? 'var(--accent, #6366f1)' : 'var(--text)',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: platform === p.id ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {p.flag} {p.label}
              {apiKeys[p.id].trim() && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block', marginLeft: 2 }} />
              )}
            </button>
          ))}
        </div>
        <p style={{ margin: '0.65rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
          Anthropic / Claude uses a proprietary protocol — not compatible with this proxy. Use the Sanctum SDK instead.
        </p>
      </div>

      {/* Step 2 — Credentials */}
      <div className="card" style={{ marginBottom: '1.25rem', opacity: loadingSettings ? 0.6 : 1, transition: 'opacity 0.15s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
            <span className="step-badge">2</span> Your credentials
          </p>
          {hasAnyCredential && (
            <button
              type="button"
              onClick={() => void handleClearAll()}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
            >
              <Trash2 size={12} /> Clear all
            </button>
          )}
        </div>

        {/* Agent token — shared across all platforms */}
        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>
          Agent token <span style={{ fontWeight: 400, opacity: 0.6 }}>(shared across all platforms)</span>
        </label>
        <input
          type="text"
          placeholder="sk_agent_..."
          value={token}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setToken(e.target.value)}
          style={{ ...inputBase, width: '100%', marginBottom: '0.35rem' }}
        />
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
          Get this from{' '}
          <button type="button" onClick={() => onPage('agents')} style={{ background: 'none', border: 'none', color: 'var(--accent, #6366f1)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>
            Agents
          </button>
          {' '}→ Register agent → copy token.
        </p>

        {/* Platform API keys — all platforms at once */}
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>
          Platform API keys <span style={{ fontWeight: 400, opacity: 0.6 }}>(fill code snippets — stored encrypted)</span>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
          {PLATFORMS.map((p) => (
            <>
              <label
                key={`lbl-${p.id}`}
                htmlFor={`key-${p.id}`}
                style={{ fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {p.flag} {p.label}
              </label>
              <input
                key={`inp-${p.id}`}
                id={`key-${p.id}`}
                type="password"
                placeholder={p.placeholder}
                value={apiKeys[p.id]}
                autoComplete="off"
                onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                style={inputBase}
              />
            </>
          ))}
        </div>

        {/* Save row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="response-btn"
            onClick={() => void handleSave()}
            disabled={saveStatus === 'saving' || !orgId}
            style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, opacity: (!orgId || saveStatus === 'saving') ? 0.5 : 1 }}
          >
            {saveStatus === 'saved'
              ? <><Check size={13} /> Saved</>
              : saveStatus === 'saving'
                ? 'Saving…'
                : <><Save size={13} /> Save all</>}
          </button>
          {saveError && <span style={{ fontSize: '0.75rem', color: 'var(--error, #ef4444)' }}>{saveError}</span>}
          {!orgId && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Sign in to save credentials</span>}
        </div>
      </div>

      {/* Step 3 — Proxy URL */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
          <span className="step-badge">3</span> Set your agent's base URL
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <code style={{ flex: 1, fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '0.6rem 0.85rem', borderRadius: 8, fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--success)' }}>
            {proxyUrl}
          </code>
          <button type="button" className="response-btn" onClick={() => copy(proxyUrl, 'url')} style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5 }}>
            {copied === 'url' ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </button>
        </div>
      </div>

      {/* Step 4 — Code snippets */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
          <span className="step-badge">4</span> Update your code
        </p>

        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>Python</p>
        <div style={{ position: 'relative' }}>
          <pre style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '0.85rem 1rem', fontSize: '0.75rem', overflowX: 'auto', margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
            <code>{pythonSnippet}</code>
          </pre>
          <button type="button" className="response-btn" onClick={() => copy(pythonSnippet, 'py')}
            style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.72rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            {copied === 'py' ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
          </button>
        </div>

        <p style={{ margin: '1rem 0 0.5rem', fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>TypeScript / Node</p>
        <div style={{ position: 'relative' }}>
          <pre style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '0.85rem 1rem', fontSize: '0.75rem', overflowX: 'auto', margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
            <code>{tsSnippet}</code>
          </pre>
          <button type="button" className="response-btn" onClick={() => copy(tsSnippet, 'ts')}
            style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.72rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            {copied === 'ts' ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
          </button>
        </div>
      </div>

      {/* CTA to live feed */}
      <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>Once your agent is running…</p>
        <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--muted)' }}>Every tool call will appear in the Live Feed in real time.</p>
        <button type="button" className="response-btn active approve" onClick={() => onPage('live-feed')} style={{ fontSize: '0.85rem', padding: '0.5rem 1.5rem' }}>
          Open Live Feed →
        </button>
      </div>
    </>
  )
}
