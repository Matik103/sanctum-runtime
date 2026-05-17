import type { ActionPolicy, PolicyMap } from '@sanctum-runtime/sdk'

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
  robot_arm_move: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  navigate: {
    requiresVerification: false,
    autoBlock: false,
    blockWhenOffline: false,
  },
  dock: {
    requiresVerification: false,
    autoBlock: false,
    blockWhenOffline: false,
  },
  calibrate_arm: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  grasp: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  release_payload: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  move_to_location: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  handover_object: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  install_package: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
  kill_process: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  run_workflow: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  post_slack: {
    requiresVerification: false,
    autoBlock: false,
    blockWhenOffline: false,
  },
  update_crm: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  open_gate: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
  arm_perimeter: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
  stream_camera: {
    requiresVerification: false,
    autoBlock: false,
    blockWhenOffline: false,
  },
  dispense: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
  move_bed: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  access_record: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
  change_route: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  engage_mode: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  open_door: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  send_message: {
    requiresVerification: false,
    autoBlock: false,
    blockWhenOffline: false,
  },
  store_memory: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  place_order: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
  emergency_stop: {
    requiresVerification: false,
    autoBlock: false,
    blockWhenOffline: false,
  },
  start_line: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: false,
  },
  adjust_setpoint: {
    requiresVerification: true,
    autoBlock: false,
    blockWhenOffline: true,
  },
}

export const DEFAULT_POLICY: ActionPolicy = {
  requiresVerification: false,
  autoBlock: false,
  blockWhenOffline: false,
}

export const BUILTIN_POLICY_ACTIONS = Object.keys(DEFAULT_POLICIES)
