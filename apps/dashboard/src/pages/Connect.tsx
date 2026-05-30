import { useCallback, useEffect, useState } from 'react'
import { Activity, Check, Copy, ExternalLink, Loader2, Plug, Shield, Trash2, Zap } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import {
  applyConnectPreset,
  executionSnippet,
  fetchConnectHealth,
  fetchConnectPresets,
  fetchConnectSettings,
  fetchPolicySuggestions,
  langChainSnippet,
  runConnectTest,
  updateConnectSettings,
  type ConnectHealth,
  type ConnectOrgSettings,
  type ConnectPreset,
  type PolicySuggestion,
} from '../lib/connect-agent'
import {
  deletePlatformCredential,
  listPlatformCredentials,
  savePlatformCredential,
  testPlatformCredential,
  type PlatformCredential,
  type PlatformId,
} from '../lib/platform-credentials'
import type { PageId } from '../layout/Sidebar'

const PLATFORMS: { id: PlatformId; name: string; flag: string }[] = [
  { id: 'openai', name: 'OpenAI', flag: '🤖' },
  { id: 'deepseek', name: 'DeepSeek', flag: '🐋' },
  { id: 'qwen', name: 'Qwen / Alibaba', flag: '☁️' },
  { id: 'kimi', name: 'Kimi / Moonshot', flag: '🌙' },
  { id: 'doubao', name: 'Doubao / ByteDance', flag: '🎵' },
  { id: 'gemini', name: 'Gemini', flag: '✨' },
]

type AgentOption = {
  id: string
  name: string
  token_hint: string
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button type="button" className="btn btn-ghost" onClick={copy} title="Copy" style={{ padding: '0.2rem 0.5rem' }}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span style={{ marginLeft: '0.3rem', fontSize: '0.78rem' }}>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

function CodeBlock({ code, lang = 'python' }: { code: string; lang?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}>
        <CopyButton value={code} />
      </div>
      <pre style={{
        background: 'var(--surface-2, #1a1a2e)',
        borderRadius: '0.5rem',
        padding: '1rem',
        fontSize: '0.8rem',
        overflowX: 'auto',
        margin: 0,
        border: '1px solid var(--border, #2a2a3e)',
        lineHeight: 1.6,
      }}>
        <code data-lang={lang}>{code}</code>
      </pre>
    </div>
  )
}

function snippet(
  platform: string,
  savedKey: boolean,
  python = true,
): string {
  const proxyUrl = `${apiBaseUrl}/v1/proxy/${platform}`
  const tokenPlaceholder = 'sk_agent_...'
  const authLine = savedKey
    ? '    # Authorization optional — platform key saved in Sanctum Connect'
    : `    api_key="your-${platform}-api-key",`
  if (python) {
    return savedKey
      ? `from openai import OpenAI

client = OpenAI(
    base_url="${proxyUrl}",
    default_headers={
        "X-Sanctum-Agent-Token": "${tokenPlaceholder}"
    }
)

# Tool calls appear in Live Feed automatically
response = client.chat.completions.create(
    model="your-model",
    messages=[{"role": "user", "content": "..."}],
    tools=[...],
)`
      : `from openai import OpenAI

client = OpenAI(
    base_url="${proxyUrl}",
    ${authLine}
    default_headers={
        "X-Sanctum-Agent-Token": "${tokenPlaceholder}"
    }
)

response = client.chat.completions.create(
    model="your-model",
    messages=[{"role": "user", "content": "..."}],
    tools=[...],
)`
  }
  return savedKey
    ? `import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '${proxyUrl}',
  defaultHeaders: {
    'X-Sanctum-Agent-Token': '${tokenPlaceholder}',
  },
})

const response = await client.chat.completions.create({
  model: 'your-model',
  messages: [{ role: 'user', content: '...' }],
  tools: [...],
})`
    : `import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '${proxyUrl}',
  apiKey: 'your-${platform}-api-key',
  defaultHeaders: {
    'X-Sanctum-Agent-Token': '${tokenPlaceholder}',
  },
})

const response = await client.chat.completions.create({
  model: 'your-model',
  messages: [{ role: 'user', content: '...' }],
  tools: [...],
})`
}

type Props = {
  orgId?: string | null
  onPage: (p: PageId) => void
}

export function Connect({ orgId, onPage }: Props) {
  const [platform, setPlatform] = useState<PlatformId>('deepseek')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [credentials, setCredentials] = useState<PlatformCredential[]>([])
  const [platformKeyInput, setPlatformKeyInput] = useState('')
  const [keyEntryOpen, setKeyEntryOpen] = useState(false)
  const [lang, setLang] = useState<'python' | 'typescript'>('python')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<ConnectHealth | null>(null)
  const [settings, setSettings] = useState<ConnectOrgSettings | null>(null)
  const [presets, setPresets] = useState<ConnectPreset[]>([])
  const [suggestions, setSuggestions] = useState<PolicySuggestion[]>([])
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [presetApplying, setPresetApplying] = useState<string | null>(null)
  const [testRunning, setTestRunning] = useState(false)
  const [snippetTab, setSnippetTab] = useState<'proxy' | 'execution' | 'langchain'>('proxy')

  const savedCred = credentials.find((c) => c.platform === platform)
  const selectedAgent = agents.find((a) => a.id === selectedAgentId)
  const linkedAgent = savedCred?.default_agent_id
    ? agents.find((a) => a.id === savedCred.default_agent_id)
    : null
  const proxyUrl = `${apiBaseUrl}/v1/proxy/${platform}`

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const [credRes, agentRes, healthRes, settingsRes, presetRes, suggestRes] = await Promise.all([
        listPlatformCredentials(orgId),
        fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents`, { headers }),
        fetchConnectHealth(orgId).catch(() => null),
        fetchConnectSettings(orgId).catch(() => null),
        fetchConnectPresets(orgId).catch(() => null),
        fetchPolicySuggestions(orgId).catch(() => []),
      ])
      setCredentials(credRes)
      setHealth(healthRes)
      setSettings(settingsRes)
      if (presetRes) setPresets(presetRes.presets)
      setSuggestions(suggestRes)
      if (agentRes.ok) {
        const list = (await agentRes.json()) as AgentOption[]
        setAgents(list)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load connection settings')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (agents.length === 1 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  useEffect(() => {
    setPlatformKeyInput('')
    setKeyEntryOpen(false)
    setTestMsg(null)
  }, [platform])

  async function handleSaveKey() {
    if (!orgId || !platformKeyInput.trim()) return
    setSaving(true)
    setError(null)
    setTestMsg(null)
    try {
      const saved = await savePlatformCredential(
        orgId,
        platform,
        platformKeyInput.trim(),
        selectedAgentId || null,
      )
      setCredentials((prev) => {
        const rest = prev.filter((c) => c.platform !== platform)
        return [...rest, saved]
      })
      setPlatformKeyInput('')
      setKeyEntryOpen(false)
      setTestMsg('Platform API key saved securely.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestKey(useSaved = false) {
    if (!orgId) return
    const secret = useSaved ? undefined : platformKeyInput.trim()
    if (!useSaved && !secret) {
      setTestMsg('Enter an API key to test.')
      return
    }
    setTesting(true)
    setTestMsg(null)
    setError(null)
    try {
      const result = await testPlatformCredential(orgId, platform, secret)
      setTestMsg(result.ok ? 'Connection successful.' : `Test failed: ${result.detail ?? 'unknown error'}`)
      if (useSaved) void load()
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  async function handleSettingsChange(patch: Partial<ConnectOrgSettings>) {
    if (!orgId) return
    setSettingsSaving(true)
    setError(null)
    try {
      const next = await updateConnectSettings(orgId, patch)
      setSettings(next)
      setTestMsg('Connect settings saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Settings save failed')
    } finally {
      setSettingsSaving(false)
    }
  }

  async function handleApplyPreset(presetId: string) {
    if (!orgId) return
    setPresetApplying(presetId)
    setError(null)
    try {
      await applyConnectPreset(orgId, presetId)
      const [presetRes, settingsRes] = await Promise.all([
        fetchConnectPresets(orgId),
        fetchConnectSettings(orgId),
      ])
      setPresets(presetRes.presets)
      setSettings(settingsRes)
      setTestMsg(`Applied "${presetId}" preset.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preset apply failed')
    } finally {
      setPresetApplying(null)
    }
  }

  async function handleConnectTest() {
    if (!orgId || !selectedAgentId) {
      setTestMsg('Select an agent first.')
      return
    }
    setTestRunning(true)
    setTestMsg(null)
    try {
      const result = await runConnectTest(orgId, selectedAgentId, platform)
      setTestMsg(
        result.ok
          ? `Verify pipeline OK (${result.decision ?? 'APPROVED'}).`
          : `Test returned: ${result.reasoning ?? 'failed'}`,
      )
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setTestRunning(false)
    }
  }

  async function handleRemoveKey() {
    if (!orgId || !savedCred) return
    setSaving(true)
    try {
      await deletePlatformCredential(orgId, platform)
      setCredentials((prev) => prev.filter((c) => c.platform !== platform))
      setTestMsg('Platform key removed.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <Plug size={22} strokeWidth={1.75} />
        <h1 className="page-title">Connect your agent</h1>
        <p className="page-subtitle">
          Register a Sanctum agent, save your platform API key, and route traffic through the proxy — tool calls appear in Live Feed.
        </p>
      </div>

      {error && (
        <div className="alert alert--error" style={{ marginBottom: '1rem' }}>
          <div className="alert__body">{error}</div>
        </div>
      )}

      {health && health.credentials.some((c) => c.age_days >= 90) && (
        <div className="alert alert--warning" style={{ marginBottom: '1rem' }}>
          <div className="alert__body" style={{ fontSize: '0.85rem' }}>
            <strong>Key rotation reminder.</strong>{' '}
            {health.credentials.filter((c) => c.age_days >= 90).map((c) => c.platform).join(', ')}{' '}
            key(s) are 90+ days old — consider rotating platform API keys.
          </div>
        </div>
      )}

      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Health & usage */}
        {health && (
          <section className="card" style={{ padding: '1.25rem' }}>
            <h2 className="card-title" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Activity size={18} /> Connect health (7 days)
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.82rem' }}>
                <div style={{ opacity: 0.55, fontSize: '0.72rem' }}>Tool calls</div>
                <strong>{health.events.total}</strong>
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                <div style={{ opacity: 0.55, fontSize: '0.72rem' }}>Held</div>
                <strong>{health.events.by_decision.REQUIRE_VERIFICATION ?? 0}</strong>
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                <div style={{ opacity: 0.55, fontSize: '0.72rem' }}>Blocked</div>
                <strong>{health.events.by_decision.BLOCKED ?? 0}</strong>
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                <div style={{ opacity: 0.55, fontSize: '0.72rem' }}>Platforms</div>
                <strong>{health.platforms_configured}</strong>
              </div>
            </div>
            {health.top_tools.length > 0 && (
              <p style={{ fontSize: '0.78rem', opacity: 0.65, margin: 0 }}>
                Top tools: {health.top_tools.slice(0, 5).map((t) => `${t.action} (${t.count})`).join(' · ')}
              </p>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: '0.65rem' }}
              disabled={testRunning || !selectedAgentId}
              onClick={() => void handleConnectTest()}
            >
              {testRunning ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
              Run verify pipeline test
            </button>
          </section>
        )}

        {/* Protect settings */}
        {settings && (
          <section className="card" style={{ padding: '1.25rem' }}>
            <h2 className="card-title" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Shield size={18} /> Protection settings
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.82rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <span>Proxy mode</span>
                <select
                  className="input"
                  value={settings.proxy_mode}
                  disabled={settingsSaving}
                  onChange={(e) => void handleSettingsChange({ proxy_mode: e.target.value as 'gate' | 'observe' })}
                  style={{ width: 'auto' }}
                >
                  <option value="gate">Gate — verify tool calls</option>
                  <option value="observe">Observe — log only</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <span>Wait for operator approval</span>
                <input
                  type="checkbox"
                  checked={settings.wait_verification}
                  disabled={settingsSaving}
                  onChange={(e) => void handleSettingsChange({ wait_verification: e.target.checked })}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <span>Gate tool results (exfiltration)</span>
                <input
                  type="checkbox"
                  checked={settings.gate_tool_results}
                  disabled={settingsSaving}
                  onChange={(e) => void handleSettingsChange({ gate_tool_results: e.target.checked })}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <span>Redact sensitive arguments in audit</span>
                <input
                  type="checkbox"
                  checked={settings.redact_tool_arguments}
                  disabled={settingsSaving}
                  onChange={(e) => void handleSettingsChange({ redact_tool_arguments: e.target.checked })}
                />
              </label>
            </div>
          </section>
        )}

        {/* Policy presets */}
        {presets.length > 0 && (
          <section className="card" style={{ padding: '1.25rem' }}>
            <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>Policy presets</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {presets.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.65rem 0.75rem',
                    borderRadius: '0.4rem',
                    border: `1px solid ${p.active ? 'var(--accent, #6366f1)' : 'var(--border, #2a2a3e)'}`,
                    background: p.active ? 'var(--accent-muted, rgba(99,102,241,0.08))' : 'transparent',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.85rem' }}>{p.name}</strong>
                    {p.active && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--accent, #6366f1)' }}>active</span>}
                    <p style={{ fontSize: '0.78rem', opacity: 0.65, margin: '0.2rem 0 0' }}>{p.description}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={p.active || presetApplying !== null}
                    onClick={() => void handleApplyPreset(p.id)}
                  >
                    {presetApplying === p.id ? <Loader2 size={14} className="spin" /> : 'Apply'}
                  </button>
                </div>
              ))}
            </div>
            {suggestions.length > 0 && (
              <div style={{ marginTop: '0.85rem', fontSize: '0.78rem', opacity: 0.7 }}>
                <strong>Suggested policies</strong> (from Live Feed activity):{' '}
                {suggestions.slice(0, 3).map((s) => s.action).join(', ')}
              </div>
            )}
          </section>
        )}

        {/* Step 1 — Agent */}
        <section className="card" style={{ padding: '1.25rem' }}>
          <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
            <span className="step-badge">1</span> Sanctum agent
          </h2>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem', opacity: 0.75 }}>
            Choose which Sanctum agent will send traffic through the proxy. Create one on{' '}
            <button type="button" className="btn btn-ghost" style={{ padding: 0, fontSize: 'inherit', textDecoration: 'underline' }} onClick={() => onPage('agents')}>
              Agents
            </button>
            {' '}if you do not have one yet — copy its token when shown (once) for your client code.
          </p>
          {agents.length === 0 ? (
            <div className="alert alert--info" style={{ margin: 0 }}>
              <div className="alert__body" style={{ fontSize: '0.82rem' }}>
                No agents yet. Create one on the Agents page, then return here to connect it.
              </div>
              <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => onPage('agents')}>
                Go to Agents
              </button>
            </div>
          ) : (
            <label style={{ display: 'block', fontSize: '0.82rem' }}>
              Select agent
              <select
                className="input"
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                style={{ width: '100%', marginTop: '0.35rem' }}
              >
                <option value="">— Select agent —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · …{a.token_hint}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedAgent && (
            <p style={{ fontSize: '0.78rem', marginTop: '0.65rem', opacity: 0.6 }}>
              Live Feed labels rows by this agent&apos;s token at request time — not by what you pick on Connect alone.
            </p>
          )}
        </section>

        {/* Step 2 — Platform */}
        <section className="card" style={{ padding: '1.25rem' }}>
          <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
            <span className="step-badge">2</span> Pick your platform
          </h2>
          <p style={{ fontSize: '0.82rem', marginBottom: '0.75rem', opacity: 0.65 }}>
            The platform you select here sets the proxy URL and which API key you save. Live Feed shows the platform from each actual proxy request.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
            {PLATFORMS.map((p) => {
              const cred = credentials.find((c) => c.platform === p.id)
              const credAgent = cred?.default_agent_id
                ? agents.find((a) => a.id === cred.default_agent_id)
                : null
              return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.75rem 0.5rem',
                  borderRadius: '0.5rem',
                  border: `2px solid ${platform === p.id ? 'var(--accent, #6366f1)' : 'var(--border, #2a2a3e)'}`,
                  background: platform === p.id ? 'var(--accent-muted, rgba(99,102,241,0.12))' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: platform === p.id ? 600 : 400,
                  color: 'inherit',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>{p.flag}</span>
                <span>{p.name}</span>
                {cred && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--success, #22c55e)' }}>key saved</span>
                )}
                {credAgent && (
                  <span style={{ fontSize: '0.62rem', opacity: 0.55, textAlign: 'center' }}>{credAgent.name}</span>
                )}
              </button>
            )})}
          </div>
        </section>

        {/* Step 3 — Platform API key (NEW) */}
        <section className="card" style={{ padding: '1.25rem' }}>
          <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
            <span className="step-badge">3</span> Platform API key
          </h2>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem', opacity: 0.75 }}>
            Save your {PLATFORMS.find((p) => p.id === platform)?.name} key once — encrypted in Supabase, never shown again.
            The proxy can use it so your agent code only needs the Sanctum agent token.
          </p>

          {savedCred && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem',
              padding: '0.6rem 0.75rem', marginBottom: '0.75rem', borderRadius: '0.4rem',
              background: 'var(--surface-2, #1a1a2e)', border: '1px solid var(--border, #2a2a3e)',
            }}>
              <div style={{ fontSize: '0.82rem' }}>
                <strong>Saved</strong> · ••••{savedCred.key_suffix}
                {linkedAgent && (
                  <span style={{ marginLeft: '0.5rem', opacity: 0.65 }}>· agent: {linkedAgent.name}</span>
                )}
                {savedCred.last_tested_at && (
                  <span style={{ marginLeft: '0.5rem', opacity: 0.65 }}>
                    · tested {savedCred.last_test_ok ? '✓' : '✗'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={testing} onClick={() => void handleTestKey(true)}>
                  {testing ? <Loader2 size={14} className="spin" /> : <Zap size={14} />} Test
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setKeyEntryOpen(true); setPlatformKeyInput('') }}>
                  Replace
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => void handleRemoveKey()}>
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            </div>
          )}

          {!savedCred && !keyEntryOpen && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setKeyEntryOpen(true)}>
              Add platform API key
            </button>
          )}

          {keyEntryOpen && (
            <>
              <input
                type="text"
                className="input"
                placeholder="Paste your platform API key"
                value={platformKeyInput}
                onChange={(e) => setPlatformKeyInput(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{ fontFamily: 'monospace', fontSize: '0.85rem', width: '100%', marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={saving || !platformKeyInput.trim()} onClick={() => void handleSaveKey()}>
                  {saving ? <Loader2 size={14} className="spin" /> : null}
                  {savedCred ? 'Update saved key' : 'Save platform key'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={testing || !platformKeyInput.trim()} onClick={() => void handleTestKey(false)}>
                  {testing ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                  Test key
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setKeyEntryOpen(false); setPlatformKeyInput('') }}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {testMsg && (
            <p style={{ fontSize: '0.8rem', marginTop: '0.65rem', color: testMsg.includes('fail') || testMsg.includes('Fail') ? '#f87171' : 'var(--success, #22c55e)' }}>
              {testMsg}
            </p>
          )}

          {loading && <p style={{ fontSize: '0.78rem', opacity: 0.5, marginTop: '0.5rem' }}>Loading saved keys…</p>}
        </section>

        {/* Step 4 — Proxy URL */}
        <section className="card" style={{ padding: '1.25rem' }}>
          <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
            <span className="step-badge">4</span> Your proxy URL
          </h2>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem', opacity: 0.75 }}>
            Set this as your agent&apos;s <code>base_url</code>.
            {savedCred ? ' Platform key is stored — omit Authorization in your client.' : ' Pass your platform key in Authorization: Bearer …'}
            {' '}Each tool call is verified through Sanctum before your agent receives it — approve or deny held actions from Overview or the verification modal.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-2, #1a1a2e)', borderRadius: '0.4rem', padding: '0.6rem 0.75rem', border: '1px solid var(--border, #2a2a3e)' }}>
            <code style={{ flex: 1, fontSize: '0.85rem', wordBreak: 'break-all' }}>{proxyUrl}</code>
            <CopyButton value={proxyUrl} />
          </div>
        </section>

        {/* Step 5 — Quick start */}
        <section className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 className="card-title">
              <span className="step-badge">5</span> Code snippets
            </h2>
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {(['proxy', 'execution', 'langchain'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`btn btn-sm ${snippetTab === tab ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setSnippetTab(tab)}
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                >
                  {tab === 'proxy' ? 'Proxy' : tab === 'execution' ? 'Execution gate' : 'LangChain'}
                </button>
              ))}
              {snippetTab !== 'langchain' && (
                <>
                  {(['python', 'typescript'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={`btn btn-sm ${lang === l ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setLang(l)}
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                    >
                      {l === 'python' ? 'Python' : 'TS'}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
          <CodeBlock
            code={
              snippetTab === 'proxy'
                ? snippet(platform, Boolean(savedCred), lang === 'python')
                : snippetTab === 'execution'
                  ? executionSnippet(platform, lang)
                  : langChainSnippet(platform)
            }
            lang={snippetTab === 'langchain' ? 'python' : lang}
          />
          <p style={{ fontSize: '0.78rem', marginTop: '0.65rem', opacity: 0.6 }}>
            {snippetTab === 'proxy' && (
              <>Replace <code>sk_agent_...</code> with the token from Agents (shown once at creation).</>
            )}
            {snippetTab === 'execution' && (
              <>Call verify-execution before running tools locally — returns an action token when approved.</>
            )}
            {snippetTab === 'langchain' && (
              <>LangChain routes through the Connect proxy; use the execution snippet for local tool handlers.</>
            )}
            {selectedAgent ? ` Agent: ${selectedAgent.name}.` : ''}
          </p>
        </section>

        <div className="alert alert--info">
          <div className="alert__body">
            <strong>That&apos;s it.</strong> Tool calls appear in real time in{' '}
            <button type="button" className="btn btn-ghost" style={{ padding: 0, fontSize: 'inherit', textDecoration: 'underline' }} onClick={() => onPage('live-feed')}>
              Live Feed
            </button>
            . Tool calls are gated like the SDK — approve or deny held actions inline in Live Feed or from Overview.
          </div>
          <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => onPage('live-feed')}>
            <ExternalLink size={14} />
            Open Live Feed
          </button>
        </div>
      </div>
    </div>
  )
}
