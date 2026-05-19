import type { ActionPolicy, ActionRequest, PolicyMap } from '@sanctum-runtime/sdk'
import { DEFAULT_POLICIES, DEFAULT_POLICY } from './default-policies.js'
import { loadPoliciesFromDisk, savePoliciesToDisk } from './store.js'
import { policiesFromYaml, policiesToYaml } from './yaml-policies.js'

export type PolicyEvaluation = {
  policy: ActionPolicy
  policyPath: string
  violations: string[]
}

export class PolicyEngine {
  private policies: PolicyMap
  private dataDir?: string
  private afterPersist?: (policies: PolicyMap) => Promise<void>
  private onDelete?: (action: string) => Promise<void>

  constructor(initial?: PolicyMap, dataDir?: string) {
    this.policies = { ...DEFAULT_POLICIES, ...initial }
    this.dataDir = dataDir
  }

  setAfterPersist(handler: (policies: PolicyMap) => Promise<void>): void {
    this.afterPersist = handler
  }

  setOnDelete(handler: (action: string) => Promise<void>): void {
    this.onDelete = handler
  }

  async load(): Promise<void> {
    const saved = await loadPoliciesFromDisk(this.dataDir)
    if (saved) {
      this.policies = { ...DEFAULT_POLICIES, ...saved }
    }
  }

  /** Overlay policies (e.g. from Supabase) on top of defaults + disk. */
  mergePolicies(overlay: PolicyMap): void {
    this.policies = { ...this.policies, ...overlay }
  }

  private async persist(): Promise<void> {
    try {
      await savePoliciesToDisk(this.policies, this.dataDir)
    } catch (err) {
      console.error('[sanctum] policy disk persist failed:', err)
    }
    await this.afterPersist?.(this.policies)
  }

  getPolicies(): PolicyMap {
    return { ...this.policies }
  }

  async updatePolicy(action: string, patch: Partial<ActionPolicy>): Promise<PolicyMap> {
    const current = this.policies[action] ?? { ...DEFAULT_POLICY }
    this.policies[action] = { ...current, ...patch }
    await this.persist()
    return this.getPolicies()
  }

  /** Register or replace a policy for any action name (unlimited keys). */
  async createPolicy(action: string, policy: Partial<ActionPolicy> = {}): Promise<PolicyMap> {
    return this.updatePolicy(action, policy)
  }

  /** Drop a policy from memory only (no disk / cloud sync). */
  forgetPolicy(action: string): void {
    delete this.policies[action]
  }

  async deletePolicy(action: string): Promise<PolicyMap> {
    delete this.policies[action]
    try {
      await savePoliciesToDisk(this.policies, this.dataDir)
    } catch (err) {
      console.error('[sanctum] policy disk persist failed:', err)
    }
    await this.onDelete?.(action)
    return this.getPolicies()
  }

  exportPoliciesYaml(): string {
    return policiesToYaml(this.policies)
  }

  async importPoliciesYaml(yaml: string, merge = true): Promise<PolicyMap> {
    const imported = policiesFromYaml(yaml)
    if (merge) {
      this.policies = { ...this.policies, ...imported }
    } else {
      this.policies = { ...DEFAULT_POLICIES, ...imported }
    }
    await this.persist()
    return this.getPolicies()
  }

  private resolvePolicyKey(request: ActionRequest): { key: string; path: string } {
    const ctx = request.context as Record<string, unknown>
    const orgId = String(ctx?.org_id ?? ctx?.orgId ?? '').trim()
    if (orgId) {
      const orgKey = `${orgId}:${request.action}`
      if (orgKey in this.policies) {
        return { key: orgKey, path: `policy.${orgId}.${request.action}` }
      }
    }
    return { key: request.action, path: `policy.${request.action}` }
  }

  /** Replace in-memory policies (used when Supabase is the store). */
  setPolicies(map: PolicyMap): void {
    this.policies = { ...map }
  }

  /** Write current policies to local disk (keeps data/ in sync with Supabase). */
  async persistToDisk(): Promise<void> {
    await savePoliciesToDisk(this.policies, this.dataDir)
  }

  /** Defaults + cloud/dashboard overrides. */
  applySupabasePolicies(overlay: PolicyMap): void {
    this.policies = { ...DEFAULT_POLICIES, ...overlay }
  }

  private resolveField(request: ActionRequest, field: string): unknown {
    if (field === 'actor') return request.actor
    if (field === 'action') return request.action
    if (field.startsWith('context.')) {
      const key = field.slice('context.'.length)
      return (request.context as Record<string, unknown>)[key]
    }
    return undefined
  }

  private testCondition(value: unknown, op: string, target: string | number | boolean): boolean {
    if (value === undefined || value === null) return false
    const numVal = Number(value)
    const numTarget = Number(target)
    switch (op) {
      case 'gt': return !isNaN(numVal) && !isNaN(numTarget) && numVal > numTarget
      case 'lt': return !isNaN(numVal) && !isNaN(numTarget) && numVal < numTarget
      case 'gte': return !isNaN(numVal) && !isNaN(numTarget) && numVal >= numTarget
      case 'lte': return !isNaN(numVal) && !isNaN(numTarget) && numVal <= numTarget
      case 'eq': return String(value) === String(target)
      case 'neq': return String(value) !== String(target)
      case 'contains': return String(value).includes(String(target))
      case 'startsWith': return String(value).startsWith(String(target))
      case 'endsWith': return String(value).endsWith(String(target))
      case 'matches': try { return new RegExp(String(target)).test(String(value)) } catch { return false }
      default: return false
    }
  }

  evaluate(request: ActionRequest, offlineMode: boolean): PolicyEvaluation {
    const { key, path } = this.resolvePolicyKey(request)
    const policy = this.policies[key] ?? DEFAULT_POLICY
    const policyPath = path
    const violations: string[] = []

    // Evaluate conditions before standard policy flags
    if (policy.conditions?.length) {
      for (const cond of policy.conditions) {
        const fieldValue = this.resolveField(request, cond.field)
        if (this.testCondition(fieldValue, cond.op, cond.value)) {
          const condViolations: string[] = []
          if (cond.result === 'block') condViolations.push('condition_auto_block')
          return {
            policy: {
              ...policy,
              autoBlock: cond.result === 'block',
              requiresVerification: cond.result === 'verify',
            },
            policyPath: `${path}.condition[${cond.field} ${cond.op} ${cond.value}]`,
            violations: condViolations,
          }
        }
      }
    }

    if (policy.autoBlock) {
      violations.push('policy_auto_block')
    }

    if (offlineMode && policy.blockWhenOffline) {
      violations.push('policy_block_when_offline')
    }

    if (policy.allowedActors?.length && !policy.allowedActors.includes(request.actor)) {
      violations.push('policy_actor_not_allowed')
    }

    return { policy, policyPath, violations }
  }
}

export { DEFAULT_POLICIES, DEFAULT_POLICY, BUILTIN_POLICY_ACTIONS }
