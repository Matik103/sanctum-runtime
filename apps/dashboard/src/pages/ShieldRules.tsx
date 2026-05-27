/**
 * Sanctum Shield — Custom Rules configuration page.
 *
 * Operators define action containment rules here.  A rule maps an action
 * pattern (exact name or glob, e.g. "transfer_*") to a required response:
 *   BLOCK                — deny the action immediately, no AI model invoked
 *   REQUIRE_VERIFICATION — hold for human approval even if AI scores low-risk
 *   LOG_ONLY             — allow but record for audit (default behaviour)
 *
 * Built-in Shield signals (prompt injection, physical harm, critical financial)
 * run regardless of custom rules and can never be disabled here.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Info,
  OctagonX,
  Plus,
  ShieldCheck,
  Trash2,
  ToggleLeft,
  ToggleRight,
  UserCheck,
} from 'lucide-react'
import { getAccessToken } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_SANCTUM_API_URL ?? ''

type ShieldRule = {
  id: string
  action_pattern: string
  label: string
  response: 'BLOCK' | 'REQUIRE_VERIFICATION' | 'LOG_ONLY'
  category: string | null
  min_amount: number | null
  conditions: Record<string, unknown> | null
  enabled: boolean
  created_at: string
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

const RESPONSE_META: Record<string, { label: string; color: string; icon: typeof OctagonX; desc: string }> = {
  BLOCK: {
    label: 'Block',
    color: 'var(--danger)',
    icon: OctagonX,
    desc: 'Action is denied immediately. No AI model runs. Operator is alerted.',
  },
  REQUIRE_VERIFICATION: {
    label: 'Verify',
    color: 'var(--warning)',
    icon: UserCheck,
    desc: 'Action is held for human approval even when the AI deems it low-risk.',
  },
  LOG_ONLY: {
    label: 'Log only',
    color: 'var(--muted)',
    icon: ShieldCheck,
    desc: 'Action proceeds normally but is flagged in the audit log.',
  },
}

const CATEGORY_OPTIONS = [
  { value: 'financial',       label: 'Financial' },
  { value: 'security',        label: 'Security' },
  { value: 'physical',        label: 'Physical' },
  { value: 'data',            label: 'Data' },
  { value: 'infrastructure',  label: 'Infrastructure' },
  { value: 'ai',              label: 'AI / Model' },
  { value: 'other',           label: 'Other' },
]

// Default rules shown as read-only reference (built into the Shield engine)
const BUILT_IN_RULES = [
  { pattern: 'disable_*_logging', response: 'BLOCK', label: 'Disable logging or audit controls' },
  { pattern: 'delete_audit_*',    response: 'BLOCK', label: 'Delete audit evidence' },
  { pattern: 'read_*_key',        response: 'BLOCK', label: 'Read secret or API key (untrusted source)' },
  { pattern: 'transfer_funds',    response: 'REQUIRE_VERIFICATION', label: 'Transfer funds (≥$10,000)' },
  { pattern: 'unlock_door',       response: 'REQUIRE_VERIFICATION', label: 'Physical access (owner absent)' },
] as const

type FormState = {
  actionPattern: string
  label: string
  response: 'BLOCK' | 'REQUIRE_VERIFICATION' | 'LOG_ONLY'
  category: string
  minAmount: string
  enabled: boolean
}

const EMPTY_FORM: FormState = {
  actionPattern: '',
  label: '',
  response: 'BLOCK',
  category: '',
  minAmount: '',
  enabled: true,
}

export function ShieldRules() {
  const [rules, setRules] = useState<ShieldRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const loadRules = useCallback(async () => {
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_BASE}/v1/shield/rules`, { headers })
      if (res.ok) {
        const d = await res.json() as { rules: ShieldRule[] }
        setRules(d.rules ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadRules() }, [loadRules])

  const saveRule = useCallback(async () => {
    if (!form.actionPattern.trim()) {
      setFormError('Action pattern is required.')
      return
    }
    if (!form.label.trim()) {
      setFormError('Label is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const headers = await authHeaders()
      const body: Record<string, unknown> = {
        actionPattern: form.actionPattern.trim(),
        label: form.label.trim(),
        response: form.response,
        enabled: form.enabled,
      }
      if (form.category) body.category = form.category
      if (form.minAmount) {
        const n = parseFloat(form.minAmount)
        if (!isNaN(n) && n > 0) body.minAmount = n
      }
      const res = await fetch(`${API_BASE}/v1/shield/rules`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error(typeof err.error === 'string' ? err.error : 'Failed to create rule.')
      }
      await loadRules()
      setForm(EMPTY_FORM)
      setShowForm(false)
      setSuccessMsg('Rule created.')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create rule.')
    } finally {
      setSaving(false)
    }
  }, [form, loadRules])

  const deleteRule = useCallback(async (id: string) => {
    setDeleting(id)
    try {
      const headers = await authHeaders()
      await fetch(`${API_BASE}/v1/shield/rules/${id}`, { method: 'DELETE', headers })
      setRules((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setDeleting(null)
    }
  }, [])

  const toggleRule = useCallback(async (rule: ShieldRule) => {
    setToggling(rule.id)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_BASE}/v1/shield/rules/${rule.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ enabled: !rule.enabled }),
      })
      if (res.ok) {
        setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
      }
    } finally {
      setToggling(null)
    }
  }, [])

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Shield Rules</h1>
          <p>Define which actions are automatically blocked or held for human approval</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setShowForm(true); setFormError(null) }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Plus size={15} />
          Add rule
        </button>
      </header>

      {successMsg && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {successMsg}
        </div>
      )}

      {/* Add rule form */}
      {showForm && (
        <section className="card" style={{ marginBottom: '1.25rem', border: '1px solid var(--primary, #6366f1)' }}>
          <h2 className="card-label" style={{ marginBottom: '0.75rem' }}>New Shield Rule</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <label>
              <span style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                Action pattern *
              </span>
              <input
                className="input"
                type="text"
                placeholder="e.g. delete_database or transfer_*"
                value={form.actionPattern}
                onChange={(e) => setForm((f) => ({ ...f, actionPattern: e.target.value }))}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.25rem', display: 'block' }}>
                Use * as a suffix wildcard: <code>transfer_*</code> matches transfer_funds, transfer_crypto, etc.
              </span>
            </label>

            <label>
              <span style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                Rule label *
              </span>
              <input
                className="input"
                type="text"
                placeholder="e.g. Block all database deletions"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <label>
              <span style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                Response *
              </span>
              <select
                className="input"
                value={form.response}
                onChange={(e) => setForm((f) => ({ ...f, response: e.target.value as FormState['response'] }))}
              >
                <option value="BLOCK">Block — deny immediately</option>
                <option value="REQUIRE_VERIFICATION">Verify — require human approval</option>
                <option value="LOG_ONLY">Log only — allow and record</option>
              </select>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.25rem', display: 'block' }}>
                {RESPONSE_META[form.response].desc}
              </span>
            </label>

            <label>
              <span style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                Category
              </span>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">— None —</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>

            <label>
              <span style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                Min amount (financial)
              </span>
              <input
                className="input"
                type="number"
                placeholder="e.g. 1000"
                value={form.minAmount}
                onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.25rem', display: 'block' }}>
                Rule only fires if context.amount ≥ this value
              </span>
            </label>
          </div>

          {formError && (
            <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>{formError}</p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void saveRule()}
              disabled={saving}
            >
              {saving ? 'Creating…' : 'Create rule'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(null) }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Built-in rules (read-only reference) */}
      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h2 className="card-label">Built-in Shield rules</h2>
          <Info size={14} color="var(--muted)" title="These rules are hardcoded in the Shield engine and cannot be disabled." />
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
          These patterns are detected by the built-in Shield engine and are always active regardless of your custom rules.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Pattern</th><th>Rule</th><th>Response</th></tr>
            </thead>
            <tbody>
              {BUILT_IN_RULES.map((r) => {
                const meta = RESPONSE_META[r.response]
                return (
                  <tr key={r.pattern}>
                    <td><code style={{ fontSize: '0.8rem' }}>{r.pattern}</code></td>
                    <td>{r.label}</td>
                    <td>
                      <span className={`badge ${r.response === 'BLOCK' ? 'danger' : 'warning'}`}>
                        {meta.label}
                      </span>
                      <span className="badge neutral" style={{ marginLeft: '0.25rem', fontSize: '0.7rem' }}>Built-in</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Custom rules */}
      <section>
        <h2 className="card-label" style={{ marginBottom: '0.75rem' }}>
          Your custom rules
          <span style={{ marginLeft: '0.5rem', fontWeight: 400, color: 'var(--muted)', fontSize: '0.82rem' }}>
            ({rules.filter((r) => r.enabled).length} active)
          </span>
        </h2>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>Loading rules…</div>
        ) : rules.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            <ShieldCheck size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
            <p>No custom rules yet.</p>
            <p style={{ fontSize: '0.82rem' }}>
              Add a rule above to block or verify specific actions before the AI model runs.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>Label</th>
                  <th>Response</th>
                  <th>Category</th>
                  <th>Min amount</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const meta = RESPONSE_META[rule.response]
                  const RespIcon = meta.icon
                  return (
                    <tr key={rule.id} style={{ opacity: rule.enabled ? 1 : 0.5 }}>
                      <td>
                        <code style={{ fontSize: '0.82rem' }}>{rule.action_pattern}</code>
                      </td>
                      <td>{rule.label}</td>
                      <td>
                        <span
                          className="badge"
                          style={{ color: meta.color, border: `1px solid ${meta.color}44`, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          <RespIcon size={11} />
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                        {rule.category ?? '—'}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                        {rule.min_amount ? `≥ $${rule.min_amount.toLocaleString()}` : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '0.15rem 0.3rem' }}
                          title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                          disabled={toggling === rule.id}
                          onClick={() => void toggleRule(rule)}
                        >
                          {rule.enabled
                            ? <ToggleRight size={20} color="var(--success, #10b981)" />
                            : <ToggleLeft size={20} color="var(--muted)" />}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '0.15rem 0.3rem', color: 'var(--danger)' }}
                          title="Delete rule"
                          disabled={deleting === rule.id}
                          onClick={() => void deleteRule(rule.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Usage examples */}
      <section className="card" style={{ marginTop: '1.5rem' }}>
        <h2 className="card-label" style={{ marginBottom: '0.75rem' }}>Rule examples</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
          {[
            { pattern: 'delete_database',         response: 'BLOCK',                label: 'Block all database deletions',       cat: 'infrastructure' },
            { pattern: 'transfer_*',               response: 'REQUIRE_VERIFICATION', label: 'Verify all financial transfers',     cat: 'financial' },
            { pattern: 'disable_security_camera',  response: 'BLOCK',                label: 'Block security camera tampering',    cat: 'security' },
            { pattern: 'unlock_door',              response: 'REQUIRE_VERIFICATION', label: 'Verify all physical access',         cat: 'physical' },
            { pattern: 'read_api_key',             response: 'BLOCK',                label: 'Block credential reads',             cat: 'security' },
            { pattern: 'send_email',               response: 'REQUIRE_VERIFICATION', label: 'Verify all outbound emails',         cat: 'data' },
          ].map((ex) => {
            const meta = RESPONSE_META[ex.response]
            return (
              <div
                key={ex.pattern}
                style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '0.5rem', cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setForm({
                    actionPattern: ex.pattern,
                    label: ex.label,
                    response: ex.response as FormState['response'],
                    category: ex.cat,
                    minAmount: '',
                    enabled: true,
                  })
                  setShowForm(true)
                  setFormError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setForm({
                      actionPattern: ex.pattern,
                      label: ex.label,
                      response: ex.response as FormState['response'],
                      category: ex.cat,
                      minAmount: '',
                      enabled: true,
                    })
                    setShowForm(true)
                    setFormError(null)
                  }
                }}
              >
                <code style={{ fontSize: '0.78rem', color: meta.color }}>{ex.pattern}</code>
                <p style={{ fontSize: '0.8rem', margin: '0.25rem 0 0', color: 'var(--muted)' }}>
                  {ex.label}
                </p>
                <span className={`badge ${ex.response === 'BLOCK' ? 'danger' : 'warning'}`} style={{ marginTop: '0.4rem', fontSize: '0.7rem' }}>
                  {meta.label}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
