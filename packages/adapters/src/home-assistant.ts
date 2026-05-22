/**
 * Home Assistant adapter for Sanctum Runtime.
 *
 * Home Assistant agents (Assist pipelines, custom integrations) execute
 * "service calls" — domain.service(entity_id, data). Lights, locks, alarms,
 * garage doors, HVAC, security cameras all flow through this pattern.
 * Physical-world impact = blast radius defaults to medium+, locks/alarms
 * to critical.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

export type HassServiceCall = {
  domain: string      // 'light' | 'lock' | 'alarm_control_panel' | 'cover' | …
  service: string     // 'turn_on' | 'unlock' | 'disarm' | 'open' | …
  entity_id?: string | string[]
  service_data?: Record<string, unknown>
}

const PHYSICAL_DOMAINS = new Set([
  'lock', 'alarm_control_panel', 'cover', 'garage_door',
  'switch', 'siren', 'camera', 'climate', 'water_heater',
])

/**
 * Gate a Home Assistant service call.
 *
 * @example
 * ```ts
 * await gateHassServiceCall(
 *   { domain: 'lock', service: 'unlock', entity_id: 'lock.front_door' },
 *   { client, agentId: 'hass:assist' },
 * )
 * await hass.callService('lock', 'unlock', { entity_id: 'lock.front_door' })
 * ```
 */
export async function gateHassServiceCall(
  call: HassServiceCall,
  options: SanctumAdapterOptions,
): Promise<void> {
  const physical = PHYSICAL_DOMAINS.has(call.domain)
  await gate(
    {
      action: `${call.domain}.${call.service}`,
      params: {
        entity_id: call.entity_id,
        ...(call.service_data ?? {}),
      },
      actor: options.agentId ?? 'home-assistant',
      context: {
        physicalWorld: physical,
        // Locks / alarms are irreversible in the security sense
        reversible: !(call.domain === 'lock' || call.domain === 'alarm_control_panel'),
      },
    },
    options,
  )
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
