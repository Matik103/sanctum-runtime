import { useMemo, useState } from 'react'
import { ArrowRight, Braces, Cable, KeyRound, ShieldCheck } from 'lucide-react'
import { CopyButton } from './ui/CopyButton'
import { TabBar } from './ui/TabBar'
import { apiBaseUrl } from '../lib/api-url'

type ConnectionMode = 'easy' | 'sdk'
type Boundary = 'model-tools' | 'mcp' | 'http'

type Provider = {
  id: string
  label: string
  family: string
  providerCode: string
  boundary: Boundary
  /** Managed /v1/proxy/:platform route in Connect Agent */
  proxySupported?: boolean
}

type Props = {
  agentToken?: { name: string; token: string } | null
  orgId: string
  onOpenDevices: () => void
}

const PROVIDERS: Provider[] = [
  { id: 'openai', label: 'OpenAI', family: 'Agents / Responses API', providerCode: 'openai', boundary: 'model-tools', proxySupported: true },
  { id: 'claude', label: 'Claude', family: 'MCP / tool use', providerCode: 'anthropic', boundary: 'mcp', proxySupported: true },
  { id: 'gemini', label: 'Gemini', family: 'Function calling', providerCode: 'google-gemini', boundary: 'model-tools', proxySupported: true },
  { id: 'azure', label: 'Azure OpenAI', family: 'Enterprise OpenAI', providerCode: 'azure-openai', boundary: 'model-tools', proxySupported: true },
  { id: 'deepseek', label: 'DeepSeek', family: 'Tool calling', providerCode: 'deepseek', boundary: 'model-tools', proxySupported: true },
  { id: 'qwen', label: 'Qwen', family: 'Alibaba tool calling', providerCode: 'qwen', boundary: 'model-tools', proxySupported: true },
  { id: 'kimi', label: 'Kimi', family: 'Moonshot tool calling', providerCode: 'kimi', boundary: 'model-tools', proxySupported: true },
  { id: 'doubao', label: 'Doubao', family: 'ByteDance tool calling', providerCode: 'doubao', boundary: 'model-tools', proxySupported: true },
  { id: 'grok', label: 'Grok', family: 'xAI tool calling', providerCode: 'xai-grok', boundary: 'model-tools', proxySupported: true },
  { id: 'nvidia', label: 'NVIDIA NIM', family: 'Hosted / local models', providerCode: 'nvidia-nim', boundary: 'model-tools', proxySupported: true },
  { id: 'bedrock', label: 'AWS Bedrock', family: 'Bedrock OpenAI-compatible', providerCode: 'aws-bedrock', boundary: 'model-tools', proxySupported: true },
  { id: 'custom', label: 'Any model', family: 'Generic HTTP / local', providerCode: 'custom', boundary: 'http' },
]

const BOUNDARIES: Array<{ id: Boundary; label: string; detail: string }> = [
  { id: 'model-tools', label: 'Function tools', detail: 'Model APIs and hosted agents' },
  { id: 'mcp', label: 'MCP tool server', detail: 'Claude and MCP clients' },
  { id: 'http', label: 'Direct API', detail: 'Any language or workflow' },
]

function tokenValue(token?: string) {
  return token ?? 'sk_agent_COPY_AFTER_REGISTRATION'
}

function connectionSnippet(provider: Provider, boundary: Boundary, token: string, agentName: string) {
  if (boundary === 'mcp') {
    return `npm install @sanctum-runtime/sdk @sanctum-runtime/adapters

import { SanctumClient } from '@sanctum-runtime/sdk'
import { createSanctumMcpHook } from '@sanctum-runtime/adapters/mcp'

const client = new SanctumClient({
  baseUrl: '${apiBaseUrl}',
  agentToken: process.env.SANCTUM_AGENT_TOKEN,
})
const hook = createSanctumMcpHook({
  client,
  agentId: '${agentName}',
  enforceActionToken: true,
})

// In your MCP tools/call handler, before dispatch:
await hook.beforeToolCall(request.params.name, request.params.arguments)
return dispatchTool(request)

// SANCTUM_AGENT_TOKEN=${token}`
  }

  if (boundary === 'http') {
    return `curl -X POST '${apiBaseUrl}/v1/actions/verify' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Agent-Token: ${token}' \\
  -d '{
    "actor": "${agentName}",
    "action": "send_email",
    "context": { "destination": "ops@example.com" }
  }'

# Before the side effect, validate the returned actionToken.token with:
# POST ${apiBaseUrl}/v1/actions/token/verify
# Run the side effect only after the signed action token is valid.`
  }

  return `npm install @sanctum-runtime/sdk @sanctum-runtime/adapters

import { SanctumClient } from '@sanctum-runtime/sdk'
import { wrapModelToolExecutor } from '@sanctum-runtime/adapters/model-tools'

const client = new SanctumClient({
  baseUrl: '${apiBaseUrl}',
  agentToken: process.env.SANCTUM_AGENT_TOKEN,
})

const runTool = wrapModelToolExecutor(executeTool, {
  client,
  provider: '${provider.providerCode}',
  agentId: '${agentName}',
  enforceActionToken: true,
})

// Feed ${provider.label} tool/function calls through this boundary.
await runTool({ name: toolCall.name, arguments: toolCall.arguments })

// SANCTUM_AGENT_TOKEN=${token}`
}

function sdkSnippet(token: string, agentName: string) {
  return `npm install @sanctum-runtime/sdk @sanctum-runtime/adapters

import { SanctumClient } from '@sanctum-runtime/sdk'
import { wrapAgentTool } from '@sanctum-runtime/adapters/openai-agents'

const client = new SanctumClient({
  baseUrl: '${apiBaseUrl}',
  agentToken: process.env.SANCTUM_AGENT_TOKEN,
})

const safeTool = wrapAgentTool(tool, {
  client,
  agentId: '${agentName}',
  enforceActionToken: true,
})

// SANCTUM_AGENT_TOKEN=${token}`
}

export function AgentConnectStudio({ agentToken, orgId, onOpenDevices }: Props) {
  const [mode, setMode] = useState<ConnectionMode>('easy')
  const [providerId, setProviderId] = useState('claude')
  const selectedProvider = PROVIDERS.find((provider) => provider.id === providerId) ?? PROVIDERS[0]
  const [boundaryOverride, setBoundaryOverride] = useState<Boundary | null>(null)
  const boundary = boundaryOverride ?? selectedProvider.boundary
  const key = tokenValue(agentToken?.token)
  const actor = agentToken?.name || 'my-agent'
  const snippet = useMemo(
    () => mode === 'easy'
      ? connectionSnippet(selectedProvider, boundary, key, actor)
      : sdkSnippet(key, actor),
    [actor, boundary, key, mode, selectedProvider],
  )

  return (
    <section className="section connect-studio">
      <div className="section__header">
        <h2>Connect an agent</h2>
        <p>Choose the guided path or keep full SDK control for production fleets.</p>
      </div>
      <div className="section__body">
        <TabBar
          tabs={[
            { id: 'easy', label: 'Easy Connect' },
            { id: 'sdk', label: 'SDK & adapters' },
          ]}
          active={mode}
          onChange={setMode}
        />

        {mode === 'easy' ? (
          <>
            <div className="connect-truth">
              <ShieldCheck size={18} />
              <p>
                Sanctum gates actions when a connected agent or MCP tool is about to execute them.
                Consumer chat history is not monitored unless its tool boundary is connected here.
              </p>
            </div>

            <ol className="connect-steps" aria-label="Connection steps">
              <li className={agentToken ? 'ready' : ''}>
                <span><KeyRound size={17} /></span>
                <div>
                  <strong>Agent identity</strong>
                  <p>{agentToken ? `${agentToken.name} token is ready.` : 'Register an agent above to issue its signed token.'}</p>
                </div>
              </li>
              <li>
                <span><Cable size={17} /></span>
                <div>
                  <strong>Runtime credential</strong>
                  <p>Optional for fleet hosts, automations, and API administration.</p>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenDevices}>
                    Manage API keys <ArrowRight size={14} />
                  </button>
                </div>
              </li>
              <li className={agentToken ? 'ready' : ''}>
                <span><Braces size={17} /></span>
                <div>
                  <strong>Gate the tool boundary</strong>
                  <p>Copy the connector below. Approved actions appear in the console immediately.</p>
                </div>
              </li>
            </ol>

            <p className="connect-label">Model or client</p>
            <div className="provider-picker" role="radiogroup" aria-label="Select model provider">
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  role="radio"
                  aria-checked={providerId === provider.id}
                  className={`provider-option ${providerId === provider.id ? 'active' : ''}`}
                  onClick={() => {
                    setProviderId(provider.id)
                    setBoundaryOverride(null)
                  }}
                >
                  <strong>{provider.label}</strong>
                  <span>{provider.family}</span>
                  {provider.proxySupported && (
                    <span className="badge neutral" style={{ marginTop: '0.25rem', fontSize: '0.62rem' }}>Connect proxy</span>
                  )}
                </button>
              ))}
            </div>

            <p className="connect-label">Connection boundary</p>
            <div className="boundary-picker" role="radiogroup" aria-label="Select connection boundary">
              {BOUNDARIES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={boundary === option.id}
                  className={`boundary-option ${boundary === option.id ? 'active' : ''}`}
                  onClick={() => setBoundaryOverride(option.id)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.detail}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="connect-sdk-summary">
            <h3>Programmable integration</h3>
            <p>
              Use the existing SDK plus one of the 16 framework adapters for runtime registration,
              policy enforcement, signed action tokens, telemetry, and fleet workflows.
            </p>
            <div className="adapter-chips" aria-label="Available adapters">
              {['OpenAI Agents', 'LangChain', 'Vercel AI', 'MCP', 'CrewAI', 'AutoGen', 'Bedrock', 'ROS2', 'Home Assistant', 'Generic gate()'].map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="connect-output">
          <div className="connect-output__head">
            <div>
              <h3>{mode === 'easy' ? `${selectedProvider.label} - ${BOUNDARIES.find((item) => item.id === boundary)?.label}` : 'SDK adapter starter'}</h3>
              <p>{agentToken ? 'Includes the token created for this agent.' : 'Register an agent first, then replace the placeholder token.'}</p>
            </div>
            <CopyButton text={snippet} label="Copy setup" />
          </div>
          <pre className="connect-code">{snippet}</pre>
        </div>

        <p className="connect-footnote">
          API keys identify managed runtimes and operator pipelines. Agent tokens identify an individual
          connected agent at the action boundary. Both paths keep the same policies, approvals, audit, and push alerts.
          {orgId ? <> Workspace: <code>{orgId}</code>.</> : null}
        </p>
      </div>
    </section>
  )
}
