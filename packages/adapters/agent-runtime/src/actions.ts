/** Canonical agent action types (Category 1 — AI agents). */
export const AgentActions = {
  SEND_EMAIL: 'send_email',
  DELETE_FILE: 'delete_file',
  EXECUTE_TERMINAL: 'execute_terminal',
  TRANSFER_FUNDS: 'transfer_funds',
  ACCESS_DATABASE: 'access_database',
  CREATE_USER: 'create_user',
} as const

export type AgentAction = (typeof AgentActions)[keyof typeof AgentActions]

export const AGENT_ACTIONS = Object.values(AgentActions) as AgentAction[]
