import type { ActionPolicy, ActionRequest, PolicyMap } from '@sanctum-runtime/sdk'
import { DEFAULT_POLICIES, DEFAULT_POLICY } from './default-policies.js'
import { loadPoliciesFromDisk, savePoliciesToDisk } from './store.js'

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

  evaluate(request: ActionRequest, offlineMode: boolean): PolicyEvaluation {
    const policy = this.policies[request.action] ?? DEFAULT_POLICY
    const policyPath =
      request.action in this.policies ? `policy.${request.action}` : 'policy.default'
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
