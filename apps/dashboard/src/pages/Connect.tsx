import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Check, Save, RefreshCw, AlertTriangle } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import { getConnectSettings, saveConnectSettings, clearConnectSettings } from '../lib/connect-settings'
import { sanitizeInput } from '../lib/sanitize'
import type { PageId } from '../layout/Sidebar'

const PLATFORMS = [
  { id: 'openai',   label: 'OpenAI',   flag: '🟢', defaultModel: 'gpt-4o-mini',      placeholder: 'sk-...',   keyLabel: 'OpenAI API key' },
  { id: 'deepseek', label: 'DeepSeek', flag: '🔵', defaultModel: 'deepseek-chat',     placeholder: 'sk-...',   keyLabel: 'DeepSeek API key' },
  { id: 'qwen',     label: 'Qwen',     flag: '🟠', defaultModel: 'qwen-plus',         placeholder: 'sk-...',   keyLabel: 'Qwen API key' },
  { id: 'kimi',     label: 'Kimi',     flag: '🌙', defaultModel: 'moonshot-v1-8k',    placeholder: 'sk-...',   keyLabel: 'Kimi (Moonshot) API key' },
  { id: 'doubao',   label: 'Doubao',   flag: '🟣', defaultModel: 'doubao-pro-4k',     placeholder: 'sk-...',   keyLabel: 'Doubao API key' },
  { id: 'gemini',   label: 'Gemini',   flag: '⭐', defaultModel: 'gemini-1.5-flash',  placeholder: 'AIza...', keyLabel: 'Gemini API key' },
] as const

type Platform = typeof PLATFORMS[number]['id']
const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as Platform[]
function emptyKeys() {
  return Object.fromEntries(PLATFORM_IDS.map((id) => [id, ''])) as Record<Platform, string>
}

type Props = { orgId: string | null; onPage: (p: PageId) => void }

export function Connect({ orgId, onPage }: Props) {
  const [platform, setPlatform] = useState<Platform>('openai')
  const [token, setToken] = useState('')
  const [apiKeys, setApiKeys] = useState(emptyKeys)
  const [tokenSaveStatus, setTokenSaveStatus]     = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [platformSaveStatus, setPlatformSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)
  const [copied, setCopied]         = useState<string | null>(null)
  const [codeTab, setCodeTab]       = useState<'python' | 'typescript'>('python')
  const tokenTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const platformTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSettings = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
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
      if (hasDecryptionFailure)
        setSaveError('Some credentials could not be decrypted — please re-enter and save.')
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [orgId])

  useEffect(() => { void loadSettings() }, [loadSettings])

  const tokenClean = sanitizeInput(token)
  const tokenInvalid = tokenClean.length > 0 && !tokenClean.startsWith('sk_agent_')

  async function saveToken() {
    if (!orgId) return
    if (tokenInvalid) { setSaveError('Agent token must start with sk_agent_ — get one from the Agents page.'); return }
    if (tokenTimerRef.current) clearTimeout(tokenTimerRef.current)
    setTokenSaveStatus('saving')
    setSaveError(null)
    try {
      await Promise.all(
        PLATFORM_IDS.map((id) => saveConnectSettings(orgId, id, { agent_token: tokenClean || null }))
      )
      setToken(tokenClean)
      setTokenSaveStatus('saved')
      tokenTimerRef.current = setTimeout(() => setTokenSaveStatus('idle'), 2500)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save token')
      setTokenSaveStatus('error')
    }
  }

  async function clearToken() {
    if (!orgId) return
    await Promise.all(PLATFORM_IDS.map((id) => saveConnectSettings(orgId, id, { agent_token: null }).catch(() => {}))).catch(() => {})
    setToken('')
    setTokenSaveStatus('idle')
    setSaveError(null)
  }

  async function savePlatformKey() {
    if (!orgId) return
    if (platformTimerRef.current) clearTimeout(platformTimerRef.current)
    setPlatformSaveStatus('saving')
    setSaveError(null)
    const clean = sanitizeInput(apiKeys[platform])
    try {
      await saveConnectSettings(orgId, platform, {
        agent_token: sanitizeInput(token) || null,
        platform_api_key: clean || null,
      })
      setApiKeys((prev) => ({ ...prev, [platform]: clean }))
      setPlatformSaveStatus('saved')
      platformTimerRef.current = setTimeout(() => setPlatformSaveStatus('idle'), 2500)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save key')
      setPlatformSaveStatus('error')
    }
  }

  async function clearPlatformKey() {
    if (!orgId) return
    await clearConnectSettings(orgId, platform).catch(() => {})
    setApiKeys((prev) => ({ ...prev, [platform]: '' }))
    setPlatformSaveStatus('idle')
  }

  const active = PLATFORMS.find((p) => p.id === platform)!
  const proxyUrl = `${apiBaseUrl}/v1/proxy/${platform}`
  const displayKey   = sanitizeInput(apiKeys[platform]) || `<your-${platform}-api-key>`
  // Only embed the token in the snippet if it looks valid — prevents leaking garbage values
  const displayToken = (!tokenInvalid && tokenClean) ? tokenClean : '<your-agent-token>'

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const pythonSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="${proxyUrl}",
    api_key="${displayKey}",
    default_headers={
        "X-Sanctum-Agent-Token": "${displayToken}",
    },
)

response = client.chat.completions.create(
    model="${active.defaultModel}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)`

  const tsSnippet = `import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '${proxyUrl}',
  apiKey: '${displayKey}',
  defaultHeaders: {
    'X-Sanctum-Agent-Token': '${displayToken}',
  },
})

const response = await client.chat.completions.create({
  model: '${active.defaultModel}',
  messages: [{ role: 'user', content: 'Hello' }],
})
console.log(response.choices[0].message.content)`

  const snippet = codeTab === 'python' ? pythonSnippet : tsSnippet

  // ── styles ──────────────────────────────────────────────────────────────
  const field: React.CSSProperties = {
    boxSizing: 'border-box', width: '100%',
    fontFamily: 'monospace', fontSize: '0.82rem',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '0.55rem 0.75rem',
    color: 'var(--text)', outline: 'none',
  }
  const label: React.CSSProperties = {
    fontSize: '0.75rem', fontWeight: 500,
    color: 'var(--muted)', marginBottom: '0.35rem', display: 'block',
  }
  const savedDot = (id: Platform) =>
    apiKeys[id].trim()
      ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success, #22c55e)', display: 'inline-block', marginLeft: 4, flexShrink: 0 }} />
      : null

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Connect Agent</h1>
          <p>Route any third-party AI agent through Sanctum — zero SDK required, just change the base URL.</p>
        </div>
      </header>

      {/* ── Global: Agent token strip ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.25rem', opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="agent-token" style={label}>
              Agent token{' '}
              <span style={{ fontWeight: 400, opacity: 0.6 }}>— shared across all platforms</span>
              {tokenSaveStatus === 'saved' && <span style={{ color: 'var(--success, #22c55e)', marginLeft: 6 }}>✓ saved</span>}
            </label>
            <input
              id="agent-token"
              type="text"
              placeholder="sk_agent_..."
              value={token}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => { setToken(e.target.value); setTokenSaveStatus('idle'); setSaveError(null) }}
              style={{ ...field, borderColor: tokenInvalid ? 'var(--error, #ef4444)' : 'rgba(255,255,255,0.1)' }}
            />
            {tokenInvalid && (
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: 'var(--error, #ef4444)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={11} /> This doesn't look like an agent token — it should start with <code style={{ fontSize: '0.72rem' }}>sk_agent_</code>
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingBottom: tokenInvalid ? 22 : 1 }}>
            <button
              type="button" className="response-btn"
              onClick={() => void saveToken()}
              disabled={tokenSaveStatus === 'saving' || !orgId || tokenInvalid}
              style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5, opacity: (!orgId || tokenSaveStatus === 'saving' || tokenInvalid) ? 0.5 : 1, whiteSpace: 'nowrap' }}
            >
              {tokenSaveStatus === 'saving' ? 'Saving…'
                : tokenSaveStatus === 'saved' ? <><Check size={13} /> Saved</>
                : <><Save size={13} /> Save token</>}
            </button>
            {token.trim() && (
              <button
                type="button"
                onClick={() => void clearToken()}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 3, padding: 0, whiteSpace: 'nowrap' }}
              >
                <RefreshCw size={11} /> Clear
              </button>
            )}
            <button
              type="button" onClick={() => onPage('agents')}
              style={{ background: 'none', border: 'none', color: 'var(--accent, #6366f1)', cursor: 'pointer', fontSize: '0.75rem', padding: 0, whiteSpace: 'nowrap' }}
            >
              Get from Agents →
            </button>
          </div>
        </div>
        {saveError && <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--error, #ef4444)' }}>{saveError}</p>}
      </div>

      {/* ── Platform tabs ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => { setPlatform(p.id); setPlatformSaveStatus('idle') }}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: 8,
              border: `1.5px solid ${platform === p.id ? 'var(--accent, #6366f1)' : 'rgba(255,255,255,0.1)'}`,
              background: platform === p.id ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: platform === p.id ? 'var(--accent, #6366f1)' : 'var(--text)',
              cursor: 'pointer', fontSize: '0.82rem',
              fontWeight: platform === p.id ? 600 : 400,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {p.flag} {p.label}{savedDot(p.id)}
          </button>
        ))}
        <span style={{ alignSelf: 'center', fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 4 }}>
          Anthropic / Claude is not compatible — use the Sanctum SDK instead.
        </span>
      </div>

      {/* ── Two-zone panel ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '1rem', alignItems: 'start' }}
           className="connect-grid">

        {/* Left: credentials for selected platform */}
        <div className="card">
          <p style={{ margin: '0 0 1rem', fontWeight: 600, fontSize: '0.85rem' }}>
            {active.flag} {active.label} credentials
          </p>

          <label htmlFor="platform-key" style={label}>
            {active.keyLabel}
            {platformSaveStatus === 'saved' && <span style={{ color: 'var(--success, #22c55e)', marginLeft: 6 }}>✓ saved</span>}
          </label>
          <input
            id="platform-key"
            key={platform}
            type="password"
            placeholder={active.placeholder}
            value={apiKeys[platform]}
            autoComplete="off"
            onChange={(e) => { setApiKeys((prev) => ({ ...prev, [platform]: e.target.value })); setPlatformSaveStatus('idle') }}
            style={{ ...field, marginBottom: '0.35rem' }}
          />
          <p style={{ margin: '0 0 1rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
            Stored encrypted in Sanctum — never shared, never logged.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button" className="response-btn"
              onClick={() => void savePlatformKey()}
              disabled={platformSaveStatus === 'saving' || !orgId}
              style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5, opacity: (!orgId || platformSaveStatus === 'saving') ? 0.5 : 1 }}
            >
              {platformSaveStatus === 'saving' ? 'Saving…'
                : platformSaveStatus === 'saved' ? <><Check size={13} /> Saved</>
                : <><Save size={13} /> Save</>}
            </button>
            {apiKeys[platform].trim() && (
              <button
                type="button"
                onClick={() => void clearPlatformKey()}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
              >
                <RefreshCw size={11} /> Clear
              </button>
            )}
          </div>

          {!orgId && <p style={{ margin: '0.75rem 0 0', fontSize: '0.72rem', color: 'var(--muted)' }}>Sign in to save credentials</p>}
        </div>

        {/* Right: proxy URL + ready-to-copy code */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Proxy URL */}
          <div>
            <label style={label}>Proxy base URL</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: '0.78rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 0.75rem', borderRadius: 8, fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--success, #22c55e)' }}>
                {proxyUrl}
              </code>
              <button type="button" className="response-btn" onClick={() => copy(proxyUrl, 'url')}
                style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                {copied === 'url' ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
          </div>

          {/* Code snippet */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label style={{ ...label, margin: 0 }}>Code snippet</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['python', 'typescript'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCodeTab(t)}
                    style={{
                      padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.72rem', cursor: 'pointer',
                      border: `1px solid ${codeTab === t ? 'var(--accent, #6366f1)' : 'rgba(255,255,255,0.1)'}`,
                      background: codeTab === t ? 'rgba(99,102,241,0.15)' : 'transparent',
                      color: codeTab === t ? 'var(--accent, #6366f1)' : 'var(--muted)',
                    }}
                  >
                    {t === 'python' ? 'Python' : 'TypeScript'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <pre style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '0.85rem 1rem', fontSize: '0.72rem', overflowX: 'auto', margin: 0, color: 'var(--text)', lineHeight: 1.65, maxHeight: 320, overflowY: 'auto' }}>
                <code>{snippet}</code>
              </pre>
              <button type="button" className="response-btn" onClick={() => copy(snippet, 'code')}
                style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.7rem', padding: '0.2rem 0.55rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                {copied === 'code' ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Live Feed CTA ───────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 0.2rem', fontSize: '0.88rem', fontWeight: 600 }}>Once your agent is running…</p>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Every tool call appears in the Live Feed in real time.</p>
        </div>
        <button type="button" className="response-btn active approve" onClick={() => onPage('live-feed')} style={{ fontSize: '0.82rem', padding: '0.45rem 1.25rem', whiteSpace: 'nowrap' }}>
          Open Live Feed →
        </button>
      </div>
    </>
  )
}
