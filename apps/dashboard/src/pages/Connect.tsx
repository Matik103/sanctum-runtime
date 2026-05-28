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
function emptyFlags() {
  return Object.fromEntries(PLATFORM_IDS.map((id) => [id, false])) as Record<Platform, boolean>
}

type Props = { orgId: string | null; onPage: (p: PageId) => void }

export function Connect({ orgId, onPage }: Props) {
  const [platform, setPlatform]   = useState<Platform>('openai')
  const [token, setToken]         = useState('')
  // What the user is currently typing — never pre-filled from Supabase
  const [draftKeys, setDraftKeys] = useState(emptyKeys)
  // Which platforms already have a key saved in Supabase (drives green dots + hint)
  const [savedPlatforms, setSavedPlatforms] = useState(emptyFlags)

  const [tokenSaveStatus,    setTokenSaveStatus]    = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [platformSaveStatus, setPlatformSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [copied, setCopied]       = useState<string | null>(null)
  const [codeTab, setCodeTab]     = useState<'python' | 'typescript'>('python')
  const tokenTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const platformTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSettings = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const results = await Promise.all(
        PLATFORM_IDS.map((id) => getConnectSettings(orgId, id).catch(() => null))
      )
      let savedToken = ''
      const flags = emptyFlags()
      let hasDecryptionFailure = false
      results.forEach((s, i) => {
        if (!s?.exists) return
        const id = PLATFORM_IDS[i]
        if (s.agent_token && !savedToken) savedToken = s.agent_token
        if (s.platform_api_key) flags[id] = true
        if (s.decryption_failed) hasDecryptionFailure = true
      })
      // Agent token pre-fills (user said this section is fine)
      setToken(savedToken)
      // Platform keys: only record which are saved, never fill the input
      setSavedPlatforms(flags)
      if (hasDecryptionFailure)
        setSaveError('Some credentials could not be decrypted — please re-enter and save.')
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [orgId])

  useEffect(() => { void loadSettings() }, [loadSettings])

  // ── Token ────────────────────────────────────────────────────────────────
  const tokenClean   = sanitizeInput(token)
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
    await Promise.all(
      PLATFORM_IDS.map((id) => saveConnectSettings(orgId, id, { agent_token: null }).catch(() => {}))
    )
    setToken('')
    setTokenSaveStatus('idle')
    setSaveError(null)
  }

  // ── Platform key ─────────────────────────────────────────────────────────
  const draftKey = draftKeys[platform]
  const hasSaved = savedPlatforms[platform]

  async function savePlatformKey() {
    if (!orgId) return
    if (platformTimerRef.current) clearTimeout(platformTimerRef.current)
    setPlatformSaveStatus('saving')
    setSaveError(null)
    const clean = sanitizeInput(draftKey)
    if (!clean) { setSaveError('Enter a key before saving.'); setPlatformSaveStatus('error'); return }
    try {
      await saveConnectSettings(orgId, platform, {
        agent_token: tokenClean || null,
        platform_api_key: clean,
      })
      // Clear the draft and mark this platform as saved
      setDraftKeys((prev) => ({ ...prev, [platform]: '' }))
      setSavedPlatforms((prev) => ({ ...prev, [platform]: true }))
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
    setDraftKeys((prev) => ({ ...prev, [platform]: '' }))
    setSavedPlatforms((prev) => ({ ...prev, [platform]: false }))
    setPlatformSaveStatus('idle')
    setSaveError(null)
  }

  // ── Snippet values ────────────────────────────────────────────────────────
  const active       = PLATFORMS.find((p) => p.id === platform)!
  const proxyUrl     = `${apiBaseUrl}/v1/proxy/${platform}`
  // Show live-typed key in snippet; fall back to placeholder
  const displayKey   = sanitizeInput(draftKey) || `<your-${platform}-api-key>`
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

  // ── styles ───────────────────────────────────────────────────────────────
  const field: React.CSSProperties = {
    boxSizing: 'border-box', width: '100%',
    fontFamily: 'monospace', fontSize: '0.82rem',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '0.55rem 0.75rem',
    color: 'var(--text)', outline: 'none',
  }
  const lbl: React.CSSProperties = {
    fontSize: '0.75rem', fontWeight: 500,
    color: 'var(--muted)', marginBottom: '0.35rem', display: 'block',
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Connect Agent</h1>
          <p>Route any third-party AI agent through Sanctum — zero SDK required, just change the base URL.</p>
        </div>
      </header>

      {/* ── Agent token strip ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.25rem', opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="agent-token" style={lbl}>
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
                <AlertTriangle size={11} /> Should start with <code style={{ fontSize: '0.72rem' }}>sk_agent_</code> — get yours from the Agents page.
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
              <button type="button" onClick={() => void clearToken()}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 3, padding: 0, whiteSpace: 'nowrap' }}>
                <RefreshCw size={11} /> Clear
              </button>
            )}
            <button type="button" onClick={() => onPage('agents')}
              style={{ background: 'none', border: 'none', color: 'var(--accent, #6366f1)', cursor: 'pointer', fontSize: '0.75rem', padding: 0, whiteSpace: 'nowrap' }}>
              Get from Agents →
            </button>
          </div>
        </div>
        {saveError && <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--error, #ef4444)' }}>{saveError}</p>}
      </div>

      {/* ── Platform tabs ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {PLATFORMS.map((p) => (
          <button
            key={p.id} type="button"
            onClick={() => { setPlatform(p.id); setPlatformSaveStatus('idle'); setSaveError(null) }}
            style={{
              padding: '0.4rem 0.9rem', borderRadius: 8, cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: platform === p.id ? 600 : 400,
              border: `1.5px solid ${platform === p.id ? 'var(--accent, #6366f1)' : 'rgba(255,255,255,0.1)'}`,
              background: platform === p.id ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: platform === p.id ? 'var(--accent, #6366f1)' : 'var(--text)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {p.flag} {p.label}
            {savedPlatforms[p.id] && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success, #22c55e)', display: 'inline-block', flexShrink: 0 }} />
            )}
          </button>
        ))}
        <span style={{ alignSelf: 'center', fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 4 }}>
          Anthropic / Claude is not compatible — use the Sanctum SDK instead.
        </span>
      </div>

      {/* ── Two-zone panel ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '1rem', alignItems: 'start' }}
           className="connect-grid">

        {/* Left — platform key entry */}
        <div className="card">
          <p style={{ margin: '0 0 1rem', fontWeight: 600, fontSize: '0.85rem' }}>
            {active.flag} {active.label} credentials
          </p>

          <label htmlFor="platform-key" style={lbl}>{active.keyLabel}</label>
          <input
            id="platform-key"
            key={platform}
            type="password"
            placeholder={hasSaved ? '••••••••  (key saved — enter to replace)' : active.placeholder}
            value={draftKey}
            autoComplete="off"
            onChange={(e) => { setDraftKeys((prev) => ({ ...prev, [platform]: e.target.value })); setPlatformSaveStatus('idle'); setSaveError(null) }}
            style={{ ...field, marginBottom: '0.35rem' }}
          />

          {hasSaved && !draftKey && (
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', color: 'var(--success, #22c55e)' }}>
              ✓ Key saved — enter a new key above to replace it.
            </p>
          )}
          {!hasSaved && (
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
              Stored encrypted in Sanctum — never shared, never logged.
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button" className="response-btn"
              onClick={() => void savePlatformKey()}
              disabled={platformSaveStatus === 'saving' || !orgId || !draftKey.trim()}
              style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5, opacity: (!orgId || platformSaveStatus === 'saving' || !draftKey.trim()) ? 0.5 : 1 }}
            >
              {platformSaveStatus === 'saving' ? 'Saving…'
                : platformSaveStatus === 'saved' ? <><Check size={13} /> Saved</>
                : <><Save size={13} /> {hasSaved ? 'Replace' : 'Save'}</>}
            </button>
            {hasSaved && (
              <button type="button" onClick={() => void clearPlatformKey()}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
                <RefreshCw size={11} /> Remove saved key
              </button>
            )}
          </div>

          {saveError && <p style={{ margin: '0.75rem 0 0', fontSize: '0.72rem', color: 'var(--error, #ef4444)' }}>{saveError}</p>}
          {!orgId && <p style={{ margin: '0.75rem 0 0', fontSize: '0.72rem', color: 'var(--muted)' }}>Sign in to save credentials</p>}
        </div>

        {/* Right — proxy URL + code snippet */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={lbl}>Proxy base URL</label>
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

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label style={{ ...lbl, margin: 0 }}>Code snippet</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['python', 'typescript'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setCodeTab(t)}
                    style={{
                      padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.72rem', cursor: 'pointer',
                      border: `1px solid ${codeTab === t ? 'var(--accent, #6366f1)' : 'rgba(255,255,255,0.1)'}`,
                      background: codeTab === t ? 'rgba(99,102,241,0.15)' : 'transparent',
                      color: codeTab === t ? 'var(--accent, #6366f1)' : 'var(--muted)',
                    }}>
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

      {/* ── Live Feed CTA ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 0.2rem', fontSize: '0.88rem', fontWeight: 600 }}>Once your agent is running…</p>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Every tool call appears in the Live Feed in real time.</p>
        </div>
        <button type="button" className="response-btn active approve" onClick={() => onPage('live-feed')}
          style={{ fontSize: '0.82rem', padding: '0.45rem 1.25rem', whiteSpace: 'nowrap' }}>
          Open Live Feed →
        </button>
      </div>
    </>
  )
}
