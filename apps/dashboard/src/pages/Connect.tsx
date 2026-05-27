import { useState } from 'react'
import { Check, Copy, ExternalLink, Plug } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import type { PageId } from '../layout/Sidebar'

const PLATFORMS = [
  { id: 'openai',    name: 'OpenAI',              flag: '🤖' },
  { id: 'deepseek',  name: 'DeepSeek',             flag: '🐋' },
  { id: 'qwen',      name: 'Qwen / Alibaba',        flag: '☁️' },
  { id: 'kimi',      name: 'Kimi / Moonshot',       flag: '🌙' },
  { id: 'doubao',    name: 'Doubao / ByteDance',    flag: '🎵' },
  { id: 'gemini',    name: 'Gemini',                flag: '✨' },
]

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
        padding: '1rem 1rem 1rem 1rem',
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

function snippet(platform: string, token: string, python = true): string {
  const proxyUrl = `${apiBaseUrl}/v1/proxy/${platform}`
  if (python) {
    return `from openai import OpenAI

client = OpenAI(
    base_url="${proxyUrl}",
    api_key="your-${platform}-api-key",
    default_headers={
        "X-Sanctum-Agent-Token": "${token || 'sk_agent_...'}"
    }
)

# All tool calls are now visible in the Sanctum Live Feed
response = client.chat.completions.create(
    model="your-model",
    messages=[{"role": "user", "content": "..."}],
    tools=[...],
)`
  }
  return `import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '${proxyUrl}',
  apiKey: 'your-${platform}-api-key',
  defaultHeaders: {
    'X-Sanctum-Agent-Token': '${token || 'sk_agent_...'}',
  },
})

// All tool calls are now visible in the Sanctum Live Feed
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

export function Connect({ orgId: _orgId, onPage }: Props) {
  const [platform, setPlatform] = useState('deepseek')
  const [agentToken, setAgentToken] = useState('')
  const [lang, setLang] = useState<'python' | 'typescript'>('python')

  const proxyUrl = `${apiBaseUrl}/v1/proxy/${platform}`

  return (
    <div className="page">
      <div className="page-header">
        <Plug size={22} strokeWidth={1.75} />
        <h1 className="page-title">Connect your agent</h1>
        <p className="page-subtitle">
          Let Sanctum observe what your AI agent is doing — no SDK required. Change one URL, add one header.
        </p>
      </div>

      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Step 1 — Agent token */}
        <section className="card" style={{ padding: '1.25rem' }}>
          <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
            <span className="step-badge">1</span> Your Sanctum agent token
          </h2>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem', opacity: 0.75 }}>
            This identifies your agent to Sanctum. Get one from the{' '}
            <button type="button" className="btn btn-ghost" style={{ padding: 0, fontSize: 'inherit', display: 'inline', textDecoration: 'underline' }} onClick={() => onPage('agents')}>
              Agents page
            </button>
            {' '}→ create an agent → copy the token.
          </p>
          <input
            type="text"
            className="input"
            placeholder="sk_agent_..."
            value={agentToken}
            onChange={(e) => setAgentToken(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '0.85rem', width: '100%' }}
          />
        </section>

        {/* Step 2 — Pick platform */}
        <section className="card" style={{ padding: '1.25rem' }}>
          <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
            <span className="step-badge">2</span> Pick your platform
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
            {PLATFORMS.map((p) => (
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
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>{p.flag}</span>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Step 3 — Proxy URL */}
        <section className="card" style={{ padding: '1.25rem' }}>
          <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
            <span className="step-badge">3</span> Your proxy URL
          </h2>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem', opacity: 0.75 }}>
            Paste this as your agent's <code>base_url</code> or API endpoint instead of the platform's default URL.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-2, #1a1a2e)', borderRadius: '0.4rem', padding: '0.6rem 0.75rem', border: '1px solid var(--border, #2a2a3e)' }}>
            <code style={{ flex: 1, fontSize: '0.85rem', wordBreak: 'break-all' }}>{proxyUrl}</code>
            <CopyButton value={proxyUrl} />
          </div>
          <p style={{ fontSize: '0.78rem', marginTop: '0.5rem', opacity: 0.6 }}>
            Your {PLATFORMS.find((p) => p.id === platform)?.name} API key goes in <code>Authorization: Bearer &lt;key&gt;</code> — it is forwarded directly and never stored by Sanctum.
          </p>
        </section>

        {/* Code snippets */}
        <section className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h2 className="card-title">
              <span className="step-badge">4</span> Quick start
            </h2>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {(['python', 'typescript'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`btn btn-sm ${lang === l ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setLang(l)}
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                >
                  {l === 'python' ? 'Python' : 'TypeScript'}
                </button>
              ))}
            </div>
          </div>
          <CodeBlock code={snippet(platform, agentToken, lang === 'python')} lang={lang} />
        </section>

        {/* Next step */}
        <div className="alert alert--info">
          <div className="alert__body">
            <strong>That's it.</strong> Once your agent makes a call with tools, the tool calls appear in real time in the{' '}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: 0, fontSize: 'inherit', display: 'inline', textDecoration: 'underline' }}
              onClick={() => onPage('live-feed')}
            >
              Live Feed
            </button>
            {' '}— no polling, no install, no code changes beyond the URL.
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '0.75rem' }}
            onClick={() => onPage('live-feed')}
          >
            <ExternalLink size={14} />
            Open Live Feed
          </button>
        </div>

      </div>
    </div>
  )
}
