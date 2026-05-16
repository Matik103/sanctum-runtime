import { parse, stringify } from 'yaml'
import { ActionPolicySchema, type ActionPolicy, type PolicyMap } from '@sanctum-runtime/sdk'

export type PoliciesDocument = {
  version?: number
  policies: PolicyMap
}

function normalizePolicy(raw: unknown): ActionPolicy {
  const parsed = ActionPolicySchema.partial().parse(raw ?? {})
  return {
    requiresVerification: parsed.requiresVerification ?? false,
    autoBlock: parsed.autoBlock ?? false,
    blockWhenOffline: parsed.blockWhenOffline ?? false,
    ...(parsed.allowedActors ? { allowedActors: parsed.allowedActors } : {}),
    ...(parsed.riskPrompt ? { riskPrompt: parsed.riskPrompt } : {}),
  }
}

export function policiesFromYaml(text: string): PolicyMap {
  const doc = parse(text) as PoliciesDocument | PolicyMap | null
  if (!doc || typeof doc !== 'object') {
    throw new Error('Invalid policies YAML: empty document')
  }

  const rawPolicies =
    'policies' in doc && doc.policies && typeof doc.policies === 'object'
      ? doc.policies
      : (doc as PolicyMap)

  const policies: PolicyMap = {}
  for (const [action, value] of Object.entries(rawPolicies)) {
    if (action === 'version') continue
    policies[action] = normalizePolicy(value)
  }

  if (!Object.keys(policies).length) {
    throw new Error('Invalid policies YAML: no policies found')
  }

  return policies
}

export function policiesToYaml(policies: PolicyMap): string {
  const doc: PoliciesDocument = { version: 1, policies }
  return stringify(doc, { lineWidth: 0 })
}
