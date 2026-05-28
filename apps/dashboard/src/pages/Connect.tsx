import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import type { PageId } from '../layout/Sidebar'

const PLATFORMS = [
  { id: 'openai',   label: 'OpenAI',    flag: '🟢' },
  { id: 'deepseek', label: 'DeepSeek',  flag: '🔵' },
  { id: 'qwen',     label: 'Qwen',      flag: '🟠' },
  { id: 'kimi',     label: 'Kimi',      flag: '🌙' },
  { id: 'doubao',   label: 'Doubao',    flag: '🟣' },
  { id: 'gemini',   label: 'Gemini',    flag: '⭐' },
] as const

type Platform = typeof PLATFORMS[number]['id']

type Props = { onPage: (p: PageId) => void }

export function Connect({ onPage }: Props) {
  const [platform, setPlatform] = useState<Platform>('openai')
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const proxyUrl = `${apiBaseUrl}/v1/proxy/${platform}`

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const pythonSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="${proxyUrl}",
    api_key="<your-${platform}-api-key>",
    default_headers={
        "X-Sanctum-Agent-Token": "${token || '<your-agent-token>'}",
    },
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)`

  const tsSnippet = `import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '${proxyUrl}',
  apiKey: '<your-${platform}-api-key>',
  defaultHeaders: {
    'X-Sanctum-Agent-Token': '${token || '<your-agent-token>'}',
  },
})

const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
})
console.log(response.choices[0].message.content)`

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
            </button>
          ))}
        </div>
      </div>

      {/* Step 2 — Token */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
          <span className="step-badge">2</span> Paste your agent token
        </p>
        <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
          Get this from{' '}
          <button type="button" onClick={() => onPage('agents')} style={{ background: 'none', border: 'none', color: 'var(--accent, #6366f1)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>
            Agents
          </button>
          {' '}→ Register agent → copy token.
        </p>
        <input
          className="input"
          type="text"
          placeholder="sk_agent_..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.82rem' }}
        />
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
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
          Your platform API key goes in the <code>Authorization: Bearer …</code> header as usual — Sanctum never stores it.
        </p>
      </div>

      {/* Code snippets */}
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
