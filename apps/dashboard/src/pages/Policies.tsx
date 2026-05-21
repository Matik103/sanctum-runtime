import { useState } from 'react'
import type { PolicyCondition, PolicyMap } from '@sanctum-runtime/sdk/browser'
import {
  actionLabel,
  createPolicyResponse,
  deletePolicyAction,
  exportPoliciesYaml,
  importPoliciesYaml,
  policyToResponse,
  simulateAction,
  updatePolicyConditions,
  type PolicyResponse,
  type SimulateResult,
} from '../lib/api'

// ─── Normalization ───────────────────────────────────────────────────────────
function toActionKey(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s\-]+/g, '_')
    .toLowerCase()
    .replace(/[^a-z0-9_.:@]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// ─── Constants ───────────────────────────────────────────────────────────────
const RESPONSE_OPTIONS: { value: PolicyResponse; label: string; desc: string; accent: string }[] = [
  { value: 'approve', label: 'Approve', desc: 'Runs automatically, no review', accent: 'var(--success)' },
  { value: 'verify',  label: 'Verify',  desc: 'Pauses for your confirmation',  accent: 'var(--warning)' },
  { value: 'block',   label: 'Block',   desc: 'Always denied',                  accent: '#fca5a5' },
]

const CONDITION_OPS = ['gt','lt','gte','lte','eq','neq','contains','startsWith','endsWith','matches'] as const
type ConditionOp = typeof CONDITION_OPS[number]

const OP_LABELS: Record<ConditionOp, string> = {
  gt: '>', lt: '<', gte: '≥', lte: '≤',
  eq: '=', neq: '≠',
  contains: 'contains', startsWith: 'starts with',
  endsWith: 'ends with', matches: 'matches regex',
}

const CATEGORIES: { label: string; emoji: string; actions: string[] }[] = [
  { label: 'Files & System',   emoji: '🗂', actions: ['delete_file','execute_terminal','install_package','kill_process','run_workflow'] },
  { label: 'Data',             emoji: '🗄', actions: ['access_database','access_record','store_memory'] },
  { label: 'Communication',    emoji: '✉️', actions: ['send_email','send_message','post_slack','update_crm'] },
  { label: 'Finance',          emoji: '💳', actions: ['transfer_funds','place_order'] },
  { label: 'Access & Security',emoji: '🔐', actions: ['unlock_door','lock_door','open_door','open_gate','create_user','disable_alarm','arm_perimeter','stream_camera'] },
  { label: 'Robotics',         emoji: '🤖', actions: ['move_robot','robot_arm_move','navigate','dock','calibrate_arm','grasp','release_payload','move_to_location','handover_object','move_bed','dispense','change_route','engage_mode','emergency_stop','start_line','adjust_setpoint'] },
]

const BUILTIN_ACTIONS = new Set(CATEGORIES.flatMap((c) => c.actions))

// ─── Decision badge ──────────────────────────────────────────────────────────
const DECISION_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  APPROVED:             { bg: 'var(--success-soft)', color: '#6ee7b7', label: 'Would approve' },
  BLOCKED:              { bg: 'var(--danger-soft)',  color: '#fca5a5', label: 'Would block' },
  REQUIRE_VERIFICATION: { bg: 'var(--warning-soft)', color: '#fcd34d', label: 'Would verify' },
}

// ─── Copy chip ───────────────────────────────────────────────────────────────
function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
      style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'inline-flex', alignItems:'center' }}
    >
      <code style={{ fontSize:'0.72rem', fontFamily:'monospace', padding:'0.15rem 0.4rem', borderRadius:5, background:'rgba(255,255,255,0.06)', color: copied ? 'var(--success)' : 'var(--muted)', transition:'color .15s' }}>
        {copied ? '✓ copied' : value}
      </code>
    </button>
  )
}

// ─── Conditions editor ────────────────────────────────────────────────────────
function ConditionsEditor({ action, conditions, onSave }: {
  action: string
  conditions: PolicyCondition[]
  onSave: (conditions: PolicyCondition[]) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<PolicyCondition[]>(conditions)
  const [draft, setDraft] = useState<PolicyCondition>({ field: 'context.amount', op: 'gt', value: '', result: 'verify' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const add = () => {
    if (!draft.field.trim() || draft.value === '') { setErr('Fill in all fields'); return }
    setList((prev) => [...prev, { ...draft }])
    setDraft({ field: 'context.amount', op: 'gt', value: '', result: 'verify' })
    setErr(null)
  }

  const remove = (i: number) => setList((prev) => prev.filter((_, idx) => idx !== i))

  const save = async () => {
    setSaving(true)
    try { await onSave(list); setOpen(false) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const resultAccent = (r: string) =>
    r === 'block' ? '#fca5a5' : r === 'verify' ? 'var(--warning)' : 'var(--success)'

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ background:'none', border:'none', color:'var(--accent)', fontSize:'0.75rem', cursor:'pointer', padding:'0.3rem 0', display:'flex', alignItems:'center', gap:'0.25rem' }}
      >
        {conditions.length > 0
          ? `${conditions.length} condition${conditions.length > 1 ? 's' : ''} active`
          : '+ Add conditions'}
      </button>
    )
  }

  return (
    <div style={{ marginTop:'0.75rem', padding:'0.85rem', background:'rgba(255,255,255,0.03)', borderRadius:8, border:'1px solid var(--border)' }}>
      <p style={{ margin:'0 0 0.6rem', fontSize:'0.78rem', fontWeight:600, color:'var(--text)' }}>
        Conditions for <code style={{ fontSize:'0.74rem' }}>{action}</code>
      </p>
      <p style={{ margin:'0 0 0.75rem', fontSize:'0.75rem', color:'var(--muted)', lineHeight:1.5 }}>
        Rules are checked in order — first match wins and overrides the base policy.
      </p>

      {/* Existing conditions */}
      {list.map((c, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.4rem', fontSize:'0.78rem', flexWrap:'wrap' }}>
          <code style={{ fontSize:'0.73rem', color:'var(--text)', background:'rgba(255,255,255,0.05)', padding:'0.15rem 0.35rem', borderRadius:4 }}>{c.field}</code>
          <span style={{ color:'var(--muted)' }}>{OP_LABELS[c.op as ConditionOp] ?? c.op}</span>
          <code style={{ fontSize:'0.73rem', color:'var(--text)', background:'rgba(255,255,255,0.05)', padding:'0.15rem 0.35rem', borderRadius:4 }}>{String(c.value)}</code>
          <span style={{ color:'var(--muted)' }}>→</span>
          <strong style={{ color: resultAccent(c.result) }}>{c.result}</strong>
          <button type="button" onClick={() => remove(i)} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'0.72rem' }}>✕</button>
        </div>
      ))}

      {/* New condition row */}
      <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap', marginTop:'0.5rem', marginBottom:'0.5rem' }}>
        <input
          className="input" placeholder="field e.g. context.amount"
          value={draft.field}
          onChange={(e) => setDraft((d) => ({ ...d, field: e.target.value }))}
          style={{ flex:'2 1 140px', minWidth:0, fontSize:'0.78rem', padding:'0.35rem 0.5rem' }}
        />
        <select className="input" value={draft.op}
          onChange={(e) => setDraft((d) => ({ ...d, op: e.target.value as ConditionOp }))}
          style={{ flex:'1 1 90px', minWidth:0, fontSize:'0.78rem', padding:'0.35rem 0.5rem' }}
        >
          {CONDITION_OPS.map((op) => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
        </select>
        <input
          className="input" placeholder="value"
          value={String(draft.value)}
          onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
          style={{ flex:'1 1 80px', minWidth:0, fontSize:'0.78rem', padding:'0.35rem 0.5rem' }}
        />
        <select className="input" value={draft.result}
          onChange={(e) => setDraft((d) => ({ ...d, result: e.target.value as 'approve'|'verify'|'block' }))}
          style={{ flex:'1 1 70px', minWidth:0, fontSize:'0.78rem', padding:'0.35rem 0.5rem' }}
        >
          <option value="approve">Approve</option>
          <option value="verify">Verify</option>
          <option value="block">Block</option>
        </select>
        <button type="button" onClick={add} className="response-btn" style={{ fontSize:'0.75rem', padding:'0.35rem 0.65rem', whiteSpace:'nowrap' }}>
          + Add
        </button>
      </div>

      {err && <p style={{ color:'#fca5a5', fontSize:'0.75rem', margin:'0 0 0.5rem' }}>{err}</p>}

      <div style={{ display:'flex', gap:'0.5rem' }}>
        <button type="button" onClick={() => void save()} disabled={saving} className="response-btn active verify" style={{ fontSize:'0.75rem', padding:'0.35rem 0.75rem' }}>
          {saving ? 'Saving…' : 'Save conditions'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setList(conditions) }} style={{ background:'none', border:'none', color:'var(--muted)', fontSize:'0.75rem', cursor:'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Simulator ───────────────────────────────────────────────────────────────
function PolicySimulator({ policies }: { policies: PolicyMap }) {
  const [open, setOpen] = useState(false)
  const [actor, setActor] = useState('my-agent')
  const [action, setAction] = useState('')
  const [contextRaw, setContextRaw] = useState('{}')
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    const key = toActionKey(action)
    if (!key) { setErr('Enter an action name'); return }
    let ctx: Record<string, unknown> = {}
    try { ctx = JSON.parse(contextRaw) as Record<string, unknown> } catch { setErr('Context must be valid JSON'); return }
    setRunning(true); setErr(null); setResult(null)
    try { setResult(await simulateAction(actor, key, ctx)) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Simulation failed') }
    finally { setRunning(false) }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ background:'none', border:'none', color:'var(--accent)', fontSize:'0.82rem', cursor:'pointer', padding:0, textDecoration:'underline', textUnderlineOffset:3 }}
      >
        Test a policy decision
      </button>
    )
  }

  const ds = result ? DECISION_STYLE[result.decision] : null

  return (
    <div className="card" style={{ marginBottom:'1.25rem', borderLeft:'3px solid var(--accent)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
        <p style={{ margin:0, fontSize:'0.9rem', fontWeight:600, color:'var(--text)' }}>Policy Simulator</p>
        <button type="button" onClick={() => { setOpen(false); setResult(null) }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'0.8rem' }}>✕ Close</button>
      </div>
      <p style={{ margin:'0 0 0.85rem', fontSize:'0.8rem', color:'var(--muted)' }}>
        Test what the runtime would decide for any actor + action + context — without recording to the audit log.
      </p>

      <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.75rem' }}>
        <div style={{ flex:'1 1 140px' }}>
          <label style={{ display:'block', fontSize:'0.72rem', color:'var(--muted)', marginBottom:'0.3rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Actor</label>
          <input className="input" value={actor} onChange={(e) => setActor(e.target.value)} style={{ width:'100%', boxSizing:'border-box', fontSize:'0.83rem' }} />
        </div>
        <div style={{ flex:'2 1 180px' }}>
          <label style={{ display:'block', fontSize:'0.72rem', color:'var(--muted)', marginBottom:'0.3rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Action</label>
          <input
            className="input" list="sim-actions-list"
            placeholder="delete_file or type freely"
            value={action}
            onChange={(e) => { setAction(e.target.value); setErr(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
            style={{ width:'100%', boxSizing:'border-box', fontSize:'0.83rem' }}
          />
          <datalist id="sim-actions-list">
            {Object.keys(policies).map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
      </div>

      <div style={{ marginBottom:'0.75rem' }}>
        <label style={{ display:'block', fontSize:'0.72rem', color:'var(--muted)', marginBottom:'0.3rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Context (JSON)</label>
        <textarea
          className="input"
          value={contextRaw}
          onChange={(e) => setContextRaw(e.target.value)}
          rows={3}
          style={{ width:'100%', boxSizing:'border-box', fontFamily:'monospace', fontSize:'0.78rem', resize:'vertical' }}
        />
      </div>

      {err && <p style={{ color:'#fca5a5', fontSize:'0.82rem', margin:'0 0 0.5rem' }}>{err}</p>}

      <button type="button" className="response-btn active approve" onClick={() => void run()} disabled={running}
        style={{ padding:'0.5rem 1.5rem', fontSize:'0.85rem', marginBottom: result ? '1rem' : 0 }}>
        {running ? 'Running…' : 'Simulate'}
      </button>

      {result && ds && (
        <div style={{ padding:'0.85rem', background: ds.bg, borderRadius:8, border:`1px solid ${ds.color}30` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'0.5rem', marginBottom:'0.5rem' }}>
            <strong style={{ color: ds.color, fontSize:'1rem' }}>{ds.label}</strong>
            <span style={{ fontSize:'0.78rem', color:'var(--muted)', padding:'0.15rem 0.5rem', borderRadius:999, background:'rgba(0,0,0,0.2)' }}>
              risk: <strong>{result.risk}</strong>
            </span>
          </div>
          <p style={{ margin:'0 0 0.35rem', fontSize:'0.78rem', color:'var(--muted)' }}>
            Policy matched: <code style={{ color:'var(--text)', fontSize:'0.74rem' }}>{result.policyPath}</code>
          </p>
          {result.conditionMatched && (
            <p style={{ margin:'0 0 0.35rem', fontSize:'0.78rem', color:'var(--warning)' }}>⚡ A condition rule matched and overrode the base policy</p>
          )}
          {result.anomalyFlags.length > 0 && (
            <p style={{ margin:'0 0 0.35rem', fontSize:'0.78rem', color:'#fca5a5' }}>
              Anomalies: {result.anomalyFlags.join(', ')}
            </p>
          )}
          {result.policyFlags.conditions.length > 0 && (
            <p style={{ margin:0, fontSize:'0.75rem', color:'var(--muted)' }}>
              {result.policyFlags.conditions.length} condition rule{result.policyFlags.conditions.length > 1 ? 's' : ''} configured on this action
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  policies: PolicyMap
  audit: { action: string; timestamp: string }[]
  supabaseConfigured?: boolean
  onSetPolicy: (action: string, response: PolicyResponse) => Promise<void>
  onPoliciesChange: (policies: PolicyMap) => void
}

// ─── Component ────────────────────────────────────────────────────────────────
export function Policies({ policies, audit, onSetPolicy, onPoliciesChange }: Props) {
  const [inputValue, setInputValue] = useState('')
  const [newMode, setNewMode] = useState<PolicyResponse>('verify')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBrowse, setShowBrowse] = useState(false)
  const [yamlBusy, setYamlBusy] = useState(false)
  const [savingSpec, setSavingSpec] = useState<{ action: string; response: PolicyResponse } | null>(null)

  const previewKey = toActionKey(inputValue)
  const keyIsValid = previewKey.length > 0

  const exportYaml = async () => {
    setYamlBusy(true)
    try {
      const yaml = await exportPoliciesYaml()
      const blob = new Blob([yaml], { type: 'text/yaml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'sanctum-policies.yaml'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed') }
    finally { setYamlBusy(false) }
  }

  const importYamlFile = async (file: File) => {
    setYamlBusy(true)
    try { onPoliciesChange(await importPoliciesYaml(await file.text(), true)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Import failed') }
    finally { setYamlBusy(false) }
  }

  const addPolicy = async () => {
    if (!previewKey) { setError('Enter an action name above'); return }
    setAdding(true); setError(null)
    try { onPoliciesChange(await createPolicyResponse(previewKey, newMode)); setInputValue('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to save policy') }
    finally { setAdding(false) }
  }

  const removePolicy = async (action: string) => {
    if (!confirm(`Remove policy for "${actionLabel(action)}"?`)) return
    try { onPoliciesChange(await deletePolicyAction(action)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to remove') }
  }

  const saveConditions = async (action: string, conditions: PolicyCondition[]) => {
    const next = await updatePolicyConditions(action, conditions)
    onPoliciesChange(next)
  }

  return (
    <>
      {/* Header */}
      <header className="page-header">
        <div>
          <h1>Policies</h1>
          <p>Define what your AI agents are allowed to do — and when they need your sign-off</p>
        </div>
        <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
          <button type="button" className="response-btn" disabled={yamlBusy} onClick={() => void exportYaml()}>Export YAML</button>
          <label className="response-btn" style={{ cursor: yamlBusy ? 'wait' : 'pointer' }}>
            Import YAML
            <input type="file" accept=".yaml,.yml,text/yaml" hidden disabled={yamlBusy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importYamlFile(f); e.target.value = '' }} />
          </label>
        </div>
      </header>

      {/* How it works */}
      <div className="card" style={{ marginBottom:'1.25rem' }}>
        <p style={{ margin:'0 0 0.55rem', fontSize:'0.82rem', fontWeight:600, color:'var(--text)' }}>How policies work</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'1.25rem', marginBottom:'0.85rem' }}>
          {RESPONSE_OPTIONS.map((o) => (
            <span key={o.value} style={{ fontSize:'0.82rem', color:'var(--muted)' }}>
              <strong style={{ color:o.accent }}>{o.label}</strong> — {o.desc}
            </span>
          ))}
        </div>
        <div style={{ padding:'0.65rem 0.85rem', background:'rgba(255,255,255,0.03)', borderRadius:8, borderLeft:'3px solid rgba(79,124,255,0.4)' }}>
          <p style={{ margin:0, fontSize:'0.8rem', color:'var(--muted)', lineHeight:1.65 }}>
            Policies are automatically scoped to your org. Your agent activates them with:{' '}
            <code style={{ fontSize:'0.78rem', color:'var(--text)' }}>{'verifyAction({ action: \'delete_file\', context: { org_id: \'YOUR_ORG_ID\' } })'}</code>
            <br />
            Each card below shows the exact key to paste into <code style={{ fontSize:'0.78rem' }}>action:</code>. You can also add per-field <strong style={{ color:'var(--text)' }}>condition rules</strong> on any card — e.g. block <code style={{ fontSize:'0.78rem' }}>transfer_funds</code> only when <code style={{ fontSize:'0.78rem' }}>context.amount &gt; 10000</code>.
          </p>
        </div>
      </div>

      {/* Simulator */}
      <PolicySimulator policies={policies} />

      {/* Add policy form */}
      <div className="card" style={{ marginBottom:'1.25rem' }}>
        <p style={{ margin:'0 0 1rem', fontSize:'0.9rem', fontWeight:600, color:'var(--text)' }}>Add a policy</p>

        <div style={{ marginBottom:'1.1rem' }}>
          <label style={{ display:'block', fontSize:'0.78rem', color:'var(--muted)', marginBottom:'0.4rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Action name</label>
          <input
            type="text" className="input"
            placeholder="e.g. Delete File, sendEmail, deploy-model"
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && keyIsValid) void addPolicy() }}
            style={{ width:'100%', boxSizing:'border-box', fontSize:'0.9rem', padding:'0.65rem 0.85rem' }}
          />
          <div style={{ marginTop:'0.4rem', minHeight:'1.3rem', fontSize:'0.78rem', color:'var(--muted)' }}>
            {inputValue.trim()
              ? previewKey
                ? <><span>Agent key: </span><code style={{ color:'var(--text)', background:'rgba(255,255,255,0.06)', padding:'0.1rem 0.35rem', borderRadius:4, fontSize:'0.76rem' }}>{previewKey}</code><span style={{ color:'rgba(255,255,255,0.2)' }}> — normalised automatically</span></>
                : <span style={{ color:'#fca5a5' }}>Produces an empty key — try different input</span>
              : <span>Type any format — we normalise to snake_case automatically</span>
            }
          </div>
        </div>

        <div style={{ marginBottom:'1.1rem' }}>
          <label style={{ display:'block', fontSize:'0.78rem', color:'var(--muted)', marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>What happens when triggered?</label>
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
            {RESPONSE_OPTIONS.map((opt) => {
              const active = newMode === opt.value
              return (
                <button key={opt.value} type="button" onClick={() => setNewMode(opt.value)}
                  style={{ flex:'1 1 140px', display:'flex', flexDirection:'column', gap:'0.2rem', padding:'0.75rem 0.85rem', borderRadius:10, border: active ? `1.5px solid ${opt.accent}` : '1.5px solid var(--border)', background: active ? `color-mix(in srgb, ${opt.accent} 10%, transparent)` : 'var(--elevated)', cursor:'pointer', textAlign:'left', transition:'border-color .15s, background .15s' }}>
                  <span style={{ fontSize:'0.85rem', fontWeight:600, color: active ? opt.accent : 'var(--text)' }}>{opt.label}</span>
                  <span style={{ fontSize:'0.75rem', color:'var(--muted)', lineHeight:1.4 }}>{opt.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {error && <p style={{ margin:'0 0 0.75rem', fontSize:'0.82rem', color:'#fca5a5' }}>{error}</p>}

        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
          <button type="button" className={`response-btn active ${newMode}`} disabled={adding || !keyIsValid} onClick={() => void addPolicy()} style={{ padding:'0.55rem 1.5rem', fontSize:'0.85rem' }}>
            {adding ? 'Saving…' : 'Save policy'}
          </button>
          <button type="button" onClick={() => setShowBrowse((v) => !v)}
            style={{ background:'none', border:'none', color:'var(--accent)', fontSize:'0.82rem', cursor:'pointer', padding:0, textDecoration:'underline', textUnderlineOffset:3 }}>
            {showBrowse ? 'Hide' : 'Browse'} common actions
          </button>
        </div>

        {showBrowse && (
          <div style={{ marginTop:'1.1rem', borderTop:'1px solid var(--border)', paddingTop:'1rem' }}>
            <p style={{ margin:'0 0 0.75rem', fontSize:'0.78rem', color:'var(--muted)' }}>Click any action to pre-fill the form above.</p>
            {CATEGORIES.map((cat) => (
              <div key={cat.label} style={{ marginBottom:'0.75rem' }}>
                <p style={{ margin:'0 0 0.35rem', fontSize:'0.72rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{cat.emoji} {cat.label}</p>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem' }}>
                  {cat.actions.map((a) => {
                    const has = a in policies
                    return (
                      <button key={a} type="button" disabled={has} onClick={() => { setInputValue(actionLabel(a)); setError(null) }}
                        style={{ padding:'0.3rem 0.7rem', borderRadius:999, fontSize:'0.75rem', border:'1px solid var(--border)', background: has ? 'rgba(255,255,255,0.03)' : 'var(--elevated)', color: has ? 'var(--muted)' : 'var(--text)', cursor: has ? 'default' : 'pointer', opacity: has ? 0.5 : 1 }}>
                        {actionLabel(a)}{has && <span style={{ marginLeft:'0.3rem', fontSize:'0.65rem' }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Policy grid */}
      {Object.entries(policies).length === 0 ? (
        <div style={{ textAlign:'center', padding:'4rem 1rem', color:'var(--muted)' }}>
          <p style={{ fontSize:'1rem', marginBottom:'0.4rem' }}>No policies loaded yet</p>
          <p style={{ fontSize:'0.82rem' }}>Add an action above, or use Import YAML.</p>
        </div>
      ) : (
        <div className="policy-grid">
          {Object.entries(policies).map(([action, policy]) => {
            const response = policyToResponse(policy)
            const last = audit.find((e) => e.action === action)
            const isBuiltin = BUILTIN_ACTIONS.has(action)
            const conditions = (policy.conditions ?? []) as PolicyCondition[]

            return (
              <article key={action} className="policy-card">
                {/* Header */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'0.5rem', marginBottom:'0.15rem' }}>
                  <h3 style={{ margin:0, fontSize:'0.95rem', fontWeight:600 }}>{actionLabel(action)}</h3>
                  {!isBuiltin && (
                    <button type="button" className="response-btn" style={{ fontSize:'0.68rem', padding:'0.15rem 0.45rem', flexShrink:0 }} onClick={() => void removePolicy(action)}>
                      Remove
                    </button>
                  )}
                </div>

                {/* Key + built-in badge */}
                <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.65rem' }}>
                  <CopyChip value={action} />
                  {isBuiltin && <span style={{ fontSize:'0.65rem', color:'var(--muted)', padding:'0.1rem 0.4rem', borderRadius:999, border:'1px solid var(--border)' }}>built-in</span>}
                </div>

                {/* Response selector */}
                <div className="response-select">
                  {(['approve','verify','block'] as PolicyResponse[]).map((r) => {
                    const isSaving = savingSpec?.action === action && savingSpec?.response === r
                    const isBusy = savingSpec?.action === action
                    return (
                      <button key={r} type="button" className={`response-btn ${response === r ? `active ${r}` : ''}`} disabled={isBusy}
                        onClick={() => {
                          setSavingSpec({ action, response: r })
                          void onSetPolicy(action, r)
                            .catch((e) => setError(e instanceof Error ? e.message : 'Failed to save'))
                            .finally(() => setSavingSpec(null))
                        }}>
                        {isSaving ? '…' : r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    )
                  })}
                </div>

                {/* Conditions editor */}
                <ConditionsEditor
                  action={action}
                  conditions={conditions}
                  onSave={(c) => saveConditions(action, c)}
                />

                {/* Last triggered */}
                <p style={{ margin:'0.5rem 0 0', fontSize:'0.72rem', color:'var(--muted)' }}>
                  {last ? `Last triggered ${new Date(last.timestamp).toLocaleString()}` : 'Never triggered'}
                </p>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
