import { describe, expect, it } from 'vitest'
import { policiesFromYaml, policiesToYaml } from './yaml-policies.js'

describe('policy YAML round trip', () => {
  it('preserves governance and conditional policy controls', () => {
    const yaml = policiesToYaml({
      e2e_transfer_funds: {
        requiresVerification: true,
        autoBlock: false,
        blockWhenOffline: true,
        requireSecondApprover: true,
        autoEscalateAfterMinutes: 10,
        conditions: [
          { field: 'context.amount', op: 'gt', value: 1000, result: 'block' },
        ],
      },
    })

    expect(policiesFromYaml(yaml).e2e_transfer_funds).toEqual({
      requiresVerification: true,
      autoBlock: false,
      blockWhenOffline: true,
      requireSecondApprover: true,
      autoEscalateAfterMinutes: 10,
      conditions: [
        { field: 'context.amount', op: 'gt', value: 1000, result: 'block' },
      ],
    })
  })
})
