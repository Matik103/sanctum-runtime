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

  constructor(initial?: PolicyMap, dataDir?: string) {
    this.policies = { ...DEFAULT_POLICIES, ...initial }
    this.dataDir = dataDir
  }

  async load(): Promise<void> {
    const saved = await loadPoliciesFromDisk(this.dataDir)
    if (saved) {
      this.policies = { ...DEFAULT_POLICIES, ...saved }
    }
  }

  getPolicies(): PolicyMap {
    return { ...this.policies }
  }

  async updatePolicy(action: string, patch: Partial<ActionPolicy>): Promise<PolicyMap> {
    const current = this.policies[action] ?? { ...DEFAULT_POLICY }
    this.policies[action] = { ...current, ...patch }
    await savePoliciesToDisk(this.policies, this.dataDir)
    return this.getPolicies()
  }

  /** Register or replace a policy for any action name (unlimited keys). */
  async createPolicy(action: string, policy: Partial<ActionPolicy> = {}): Promise<PolicyMap> {
    return this.updatePolicy(action, policy)
  }

  async deletePolicy(action: string): Promise<PolicyMap> {
    delete this.policies[action]
    await savePoliciesToDisk(this.policies, this.dataDir)
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
    await savePoliciesToDisk(this.policies, this.dataDir)
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
    if (request.action in this.policies) {
      return { key: request.action, path: `policy.${request.action}` }
    }
    return { key: request.action, path: 'policy.default' }
  }

  evaluate(request: ActionRequest, offlineMode: boolean): PolicyEvaluation {
    const { key, path } = this.resolvePolicyKey(request)
    const policy = this.policies[key] ?? DEFAULT_POLICY
    const policyPath = path
    const violations: string[] = []

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

export { DEFAULT_POLICIES, DEFAULT_POLICY }
