import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Play, Save, FileCode } from 'lucide-react'
import type { ActionPolicy, PolicyCondition } from '@sanctum-runtime/sdk/browser'
import { api, simulateAction, exportPoliciesYaml, importPoliciesYaml } from '../lib/api'
import { Alert } from '../components/ui/Alert'

type Rule = {
  id: string
  action: string
  response: 'approve' | 'verify' | 'block'
  requireSecondApprover: boolean
  blockWhenOffline: boolean
  conditions: PolicyCondition[]
  autoEscalateAfterMinutes?: number
}

const RESPONSE_OPTS: Rule['response'][] = ['approve', 'verify', 'block']
const OP_OPTS: PolicyCondition['op'][] = ['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'contains', 'startsWith', 'endsWith', 'matches']
const RESULT_OPTS: PolicyCondition['result'][] = ['approve', 'verify', 'block']

function newRule(action = ''): Rule {
  return {
    id: crypto.randomUUID(),
    action,
    response: 'verify',
    requireSecondApprover: false,
    blockWhenOffline: false,
    conditions: [],
  }
}

function ruleToPolicy(rule: Rule): Partial<ActionPolicy> {
  const base: Partial<ActionPolicy> = {
    requiresVerification: rule.response === 'verify',
    autoBlock: rule.response === 'block',
    blockWhenOffline: rule.blockWhenOffline,
    conditions: rule.conditions.length > 0 ? rule.conditions : undefined,
    requireSecondApprover: rule.requireSecondApprover || undefined,
    autoEscalateAfterMinutes: rule.autoEscalateAfterMinutes,
  }
  return base
}

export function WorkflowBuilder() {
  const [rules, setRules] = useState<Rule[]>([newRule('')])
  const [simActor, setSimActor] = useState('agent:test')
  const [simAction, setSimAction] = useState('')
  const [simContext, setSimContext] = useState('{\n  "amount": 1000,\n  "instructionSource": "user"\n}')
  const [simResult, setSimResult] = useState<Awaited<ReturnType<typeof simulateAction>> | null>(null)
  const [simError, setSimError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const yaml = useMemo(() => {
    const lines: string[] = []
    for (const r of rules) {
      if (!r.action.trim()) continue
      lines.push(`${r.action}:`)
      const p = ruleToPolicy(r)
      lines.push(`  requiresVerification: ${p.requiresVerification ?? false}`)
      lines.push(`  autoBlock: ${p.autoBlock ?? false}`)
      lines.push(`  blockWhenOffline: ${p.blockWhenOffline ?? false}`)
      if (p.requireSecondApprover) lines.push(`  requireSecondApprover: true`)
      if (p.autoEscalateAfterMinutes) lines.push(`  autoEscalateAfterMinutes: ${p.autoEscalateAfterMinutes}`)
      if (p.conditions && p.conditions.length) {
        lines.push(`  conditions:`)
        for (const c of p.conditions) {
          lines.push(`    - field: ${c.field}`)
          lines.push(`      op: ${c.op}`)
          lines.push(`      value: ${typeof c.value === 'string' ? `"${c.value}"` : c.value}`)
          lines.push(`      result: ${c.result}`)
        }
      }
      lines.push('')
    }
    return lines.join('\n')
  }, [rules])

  const update = (id: string, patch: Partial<Rule>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const removeRule = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id))

  const addCondition = (id: string) =>
    update(id, {
      conditions: [
        ...(rules.find((r) => r.id === id)?.conditions ?? []),
        { field: 'context.amount', op: 'gt', value: 1000, result: 'verify' },
      ],
    })

  const removeCondition = (ruleId: string, condIdx: number) => {
    const r = rules.find((x) => x.id === ruleId)
    if (!r) return
    update(ruleId, { conditions: r.conditions.filter((_, i) => i !== condIdx) })
  }

  const updateCondition = (ruleId: string, condIdx: number, patch: Partial<PolicyCondition>) => {
    const r = rules.find((x) => x.id === ruleId)
    if (!r) return
    update(ruleId, {
      conditions: r.conditions.map((c, i) => (i === condIdx ? { ...c, ...patch } : c)),
    })
  }

  const runSimulation = async () => {
    setSimError(null)
    setSimResult(null)
    try {
      const ctx = JSON.parse(simContext) as Record<string, unknown>
      const result = await simulateAction(simActor, simAction || rules[0]?.action || 'unknown', ctx)
      setSimResult(result)
    } catch (e) {
      setSimError(e instanceof Error ? e.message : 'Simulation failed')
    }
  }

  const saveWorkflow = async () => {
    setSaveError(null)
    setSaved(false)
    try {
      // Use YAML import to apply all rules atomically; merge=false replaces only listed actions
      await importPoliciesYaml(yaml, true)
      setSaved(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const loadExisting = async () => {
    try {
      const existing = await exportPoliciesYaml()
      // Best-effort: hint user, don't auto-parse (keep YAML view authoritative)
      void existing
      // eslint-disable-next-line no-alert
      alert('Loaded YAML view shows your in-progress workflow. Use "Policies" page to see current saved policies.')
    } catch { /* ignore */ }
  }

  useEffect(() => { void api }, [])

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Workflow Builder</h1>
          <p>Compose policies visually, simulate against sample contexts, save as YAML.</p>
        </div>
        <div className="responsive-action-row">
          <button type="button" className="btn btn-ghost" onClick={() => void loadExisting()}>
            <FileCode size={14} style={{ marginRight: '0.35rem' }} /> View YAML
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void saveWorkflow()}>
            <Save size={14} style={{ marginRight: '0.35rem' }} /> Save workflow
          </button>
        </div>
      </header>

      {saveError && <Alert variant="error" onDismiss={() => setSaveError(null)}>{saveError}</Alert>}
      {saved && <Alert variant="success" onDismiss={() => setSaved(false)}>Workflow saved.</Alert>}

      <div className="responsive-split" style={{ gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Rules</h2>
          {rules.map((rule) => (
            <div key={rule.id} className="card" style={{ marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  className="input"
                  value={rule.action}
                  placeholder="action name (e.g. transfer_funds)"
                  onChange={(e) => update(rule.id, { action: e.target.value })}
                  style={{ flex: 1 }}
                />
                <select
                  className="input"
                  value={rule.response}
                  onChange={(e) => update(rule.id, { response: e.target.value as Rule['response'] })}
                >
                  {RESPONSE_OPTS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => removeRule(rule.id)}
                  aria-label="Remove rule"
                  title="Remove rule"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={rule.requireSecondApprover}
                    onChange={(e) => update(rule.id, { requireSecondApprover: e.target.checked })}
                  />{' '}Require second approver
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={rule.blockWhenOffline}
                    onChange={(e) => update(rule.id, { blockWhenOffline: e.target.checked })}
                  />{' '}Block when offline
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Auto-escalate after
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    className="input"
                    style={{ width: 70 }}
                    value={rule.autoEscalateAfterMinutes ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      update(rule.id, { autoEscalateAfterMinutes: v ? Number(v) : undefined })
                    }}
                  />
                  min
                </label>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span className="card-label">Conditions</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                    onClick={() => addCondition(rule.id)}
                  >
                    <Plus size={12} /> Add condition
                  </button>
                </div>
                {rule.conditions.length === 0 && (
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.78rem' }}>
                    No conditions — rule applies to every call.
                  </p>
                )}
                {rule.conditions.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                    <input
                      className="input"
                      style={{ flex: 1, minWidth: 130 }}
                      value={c.field}
                      placeholder="field (e.g. context.amount)"
                      onChange={(e) => updateCondition(rule.id, i, { field: e.target.value })}
                    />
                    <select
                      className="input"
                      value={c.op}
                      onChange={(e) => updateCondition(rule.id, i, { op: e.target.value as PolicyCondition['op'] })}
                    >
                      {OP_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input
                      className="input"
                      style={{ width: 110 }}
                      value={String(c.value)}
                      onChange={(e) => {
                        const num = Number(e.target.value)
                        const val = e.target.value === '' ? '' : Number.isFinite(num) && /^-?\d/.test(e.target.value) ? num : e.target.value
                        updateCondition(rule.id, i, { value: val })
                      }}
                    />
                    <select
                      className="input"
                      value={c.result}
                      onChange={(e) => updateCondition(rule.id, i, { result: e.target.value as PolicyCondition['result'] })}
                    >
                      {RESULT_OPTS.map((r) => <option key={r} value={r}>→ {r}</option>)}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.2rem 0.4rem' }}
                      onClick={() => removeCondition(rule.id, i)}
                      aria-label="Remove condition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setRules((rs) => [...rs, newRule()])}
            style={{ marginBottom: '1rem' }}
          >
            <Plus size={14} style={{ marginRight: '0.35rem' }} /> Add rule
          </button>

          <div className="card">
            <strong style={{ fontSize: '0.85rem' }}>YAML preview</strong>
            <pre style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
{yaml || '# Add an action above to see YAML…'}
            </pre>
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Simulator</h2>
          <div className="card">
            <label style={{ fontSize: '0.8rem' }}>Actor</label>
            <input className="input" value={simActor} onChange={(e) => setSimActor(e.target.value)} style={{ marginBottom: '0.5rem' }} />
            <label style={{ fontSize: '0.8rem' }}>Action</label>
            <input
              className="input"
              value={simAction}
              placeholder={rules[0]?.action ?? 'transfer_funds'}
              onChange={(e) => setSimAction(e.target.value)}
              style={{ marginBottom: '0.5rem' }}
            />
            <label style={{ fontSize: '0.8rem' }}>Context (JSON)</label>
            <textarea
              className="input"
              value={simContext}
              onChange={(e) => setSimContext(e.target.value)}
              rows={6}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem', marginBottom: '0.5rem' }}
            />
            <button type="button" className="btn btn-primary" onClick={() => void runSimulation()}>
              <Play size={14} style={{ marginRight: '0.35rem' }} /> Simulate
            </button>
            {simError && <Alert variant="error" onDismiss={() => setSimError(null)} style={{ marginTop: '0.75rem' }}>{simError}</Alert>}
            {simResult && (
              <div style={{ marginTop: '0.85rem', padding: '0.75rem', background: 'var(--bg-secondary, rgba(255,255,255,0.03))', borderRadius: 6 }}>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={`badge ${simResult.decision === 'BLOCKED' ? 'danger' : simResult.decision === 'REQUIRE_VERIFICATION' ? 'warn' : 'success'}`}>
                    {simResult.decision}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                    risk: {simResult.risk} · policy: {simResult.policyPath}
                  </span>
                </div>
                {simResult.blastRadius && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem' }}>
                    <strong>Blast radius:</strong> {simResult.blastRadius.level} ({simResult.blastRadius.score}/100)
                    {simResult.blastRadius.factors.length > 0 && (
                      <span style={{ color: 'var(--muted)' }}> · {simResult.blastRadius.factors.join(', ')}</span>
                    )}
                  </p>
                )}
                {simResult.sourceTrust && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem' }}>
                    <strong>Source trust:</strong> {simResult.sourceTrust}
                  </p>
                )}
                {simResult.anomalyFlags.length > 0 && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem' }}>
                    <strong>Anomalies:</strong> {simResult.anomalyFlags.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
