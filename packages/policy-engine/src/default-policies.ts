import type { ActionPolicy, PolicyMap } from '@sanctum/runtime'

export const DEFAULT_POLICIES: PolicyMap = {
  unlock_door: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  lock_door: {
    requiresVerification: false,
    autoBlock: false,
    blockWhenOffline: false,
  },
  send_email: {
    requiresVerification: false,
    autoBlock: false,
    blockWhenOffline: false,
  },
  delete_file: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  execute_terminal: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  access_database: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
  create_user: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
  transfer_funds: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
  disable_alarm: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
  move_robot: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
}

export const DEFAULT_POLICY: ActionPolicy = {
  requiresVerification: false,
  autoBlock: false,
  blockWhenOffline: false,
}
