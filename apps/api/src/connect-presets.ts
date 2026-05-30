/** Connect Agent policy presets — applied to org runtime policies. */

export type ConnectPolicyPreset = {
  id: string
  name: string
  description: string
  proxy_mode: 'gate' | 'observe'
  policies: Record<string, { requiresVerification: boolean; autoBlock: boolean; reasoning: string }>
}

export const CONNECT_POLICY_PRESETS: ConnectPolicyPreset[] = [
  {
    id: 'strict',
    name: 'Strict',
    description: 'Block or hold high-impact tools (email, delete, transfer, admin).',
    proxy_mode: 'gate',
    policies: {
      send_email: { requiresVerification: true, autoBlock: false, reasoning: 'Connect strict: outbound email requires approval.' },
      send_status_email: { requiresVerification: true, autoBlock: false, reasoning: 'Connect strict: status email requires approval.' },
      delete_file: { requiresVerification: true, autoBlock: false, reasoning: 'Connect strict: deletions require approval.' },
      delete_database: { autoBlock: true, requiresVerification: false, reasoning: 'Connect strict: database delete blocked.' },
      transfer_funds: { autoBlock: true, requiresVerification: false, reasoning: 'Connect strict: fund transfers blocked.' },
      unlock_door: { requiresVerification: true, autoBlock: false, reasoning: 'Connect strict: physical access requires approval.' },
      execute_shell: { autoBlock: true, requiresVerification: false, reasoning: 'Connect strict: shell execution blocked.' },
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Hold sensitive actions; allow routine reads and low-risk tools.',
    proxy_mode: 'gate',
    policies: {
      send_email: { requiresVerification: true, autoBlock: false, reasoning: 'Connect balanced: email held for review.' },
      delete_file: { requiresVerification: true, autoBlock: false, reasoning: 'Connect balanced: delete held for review.' },
      transfer_funds: { requiresVerification: true, autoBlock: false, reasoning: 'Connect balanced: transfers held for review.' },
    },
  },
  {
    id: 'observe',
    name: 'Observe only',
    description: 'Log tool calls without gating — use for onboarding or debugging.',
    proxy_mode: 'observe',
    policies: {},
  },
]

export function getConnectPreset(id: string): ConnectPolicyPreset | undefined {
  return CONNECT_POLICY_PRESETS.find((p) => p.id === id)
}
