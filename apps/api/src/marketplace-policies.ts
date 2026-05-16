import type { ActionPolicy } from '@sanctum-runtime/sdk'
import type { RuntimeEngine } from '@sanctum/runtime-engine'

function parseTemplate(raw: unknown): { action: string; patch: Partial<ActionPolicy> } | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const action = String(t.action ?? '').trim()
  if (!action || action.length > 120) return null

  const patch: Partial<ActionPolicy> = {}
  if (typeof t.requiresVerification === 'boolean') {
    patch.requiresVerification = t.requiresVerification
  }
  if (typeof t.autoBlock === 'boolean') {
    patch.autoBlock = t.autoBlock
  }
  if (typeof t.blockWhenOffline === 'boolean') {
    patch.blockWhenOffline = t.blockWhenOffline
  }
  if (Array.isArray(t.allowedActors)) {
    patch.allowedActors = t.allowedActors.filter((a) => typeof a === 'string') as string[]
  }
  if (typeof t.riskPrompt === 'string' && t.riskPrompt.trim()) {
    patch.riskPrompt = t.riskPrompt.trim()
  }

  return { action, patch }
}

/** Apply org-scoped policies from a marketplace package (`orgId:action` keys). */
export async function applyMarketplacePolicyTemplates(
  runtime: RuntimeEngine,
  orgId: string,
  templates: unknown[],
): Promise<string[]> {
  const applied: string[] = []
  const engine = runtime.getPolicyEngine()

  for (const raw of templates ?? []) {
    const parsed = parseTemplate(raw)
    if (!parsed) continue
    const key = `${orgId}:${parsed.action}`
    await engine.createPolicy(key, parsed.patch)
    applied.push(key)
  }

  return applied
}

/** Remove policies recorded on install (best-effort). */
export async function removeMarketplacePolicyTemplates(
  runtime: RuntimeEngine,
  policyKeys: string[],
): Promise<void> {
  const engine = runtime.getPolicyEngine()
  for (const key of policyKeys) {
    if (!key.includes(':')) continue
    try {
      await engine.deletePolicy(key)
    } catch {
      /* already removed */
    }
  }
}

export function policyKeysFromInstallConfig(config: Record<string, unknown> | undefined): string[] {
  const raw = config?.appliedPolicyKeys
  if (!Array.isArray(raw)) return []
  return raw.filter((k): k is string => typeof k === 'string' && k.includes(':'))
}
