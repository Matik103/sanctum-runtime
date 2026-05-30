/** Connect + Shield bundled presets — one-click production hardening. */

export type ConnectShieldPreset = {
  id: string
  name: string
  description: string
  policy_preset_id: string
  shield_rules: Array<{
    actionPattern: string
    label: string
    response: 'BLOCK' | 'REQUIRE_VERIFICATION' | 'LOG_ONLY'
    category?: string
  }>
}

export const CONNECT_SHIELD_PRESETS: ConnectShieldPreset[] = [
  {
    id: 'connect-production',
    name: 'Connect Production',
    description: 'Strict policies + Shield blocks for destructive and financial tools.',
    policy_preset_id: 'strict',
    shield_rules: [
      { actionPattern: 'execute_*', label: 'Block shell execution', response: 'BLOCK', category: 'security' },
      { actionPattern: 'delete_database', label: 'Block database delete', response: 'BLOCK', category: 'data' },
      { actionPattern: 'transfer_*', label: 'Hold fund transfers', response: 'REQUIRE_VERIFICATION', category: 'financial' },
      { actionPattern: 'send_*', label: 'Hold outbound send actions', response: 'REQUIRE_VERIFICATION', category: 'data' },
      { actionPattern: 'tool_result', label: 'Review tool results', response: 'LOG_ONLY', category: 'ai' },
    ],
  },
  {
    id: 'connect-balanced-shield',
    name: 'Connect Balanced + Shield',
    description: 'Balanced policy preset with Shield holds on transfers and deletes.',
    policy_preset_id: 'balanced',
    shield_rules: [
      { actionPattern: 'transfer_*', label: 'Hold transfers', response: 'REQUIRE_VERIFICATION', category: 'financial' },
      { actionPattern: 'delete_*', label: 'Hold deletions', response: 'REQUIRE_VERIFICATION', category: 'data' },
    ],
  },
]

export function getConnectShieldPreset(id: string): ConnectShieldPreset | undefined {
  return CONNECT_SHIELD_PRESETS.find((p) => p.id === id)
}
