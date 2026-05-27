import { consoleUrl } from '@/lib/site-links'

/** Dashboard sidebar pages — keep labels in sync with apps/dashboard Sidebar NAV */
export type ConsolePageId =
  | 'overview'
  | 'activity'
  | 'threats'
  | 'shield'
  | 'shield-rules'
  | 'alerts'
  | 'policies'
  | 'policy-history'
  | 'workflow-builder'
  | 'assurance'
  | 'governance'
  | 'compliance'
  | 'agents'
  | 'devices'
  | 'fleet'
  | 'marketplace'
  | 'audit'
  | 'settings'

export const CONSOLE_PAGE_LABELS: Record<ConsolePageId, string> = {
  overview: 'Overview',
  activity: 'Runtime Activity',
  threats: 'Threat Monitor',
  shield: 'Sanctum Shield',
  'shield-rules': 'Shield Rules',
  alerts: 'Alerts',
  policies: 'Policies',
  'policy-history': 'Policy History',
  'workflow-builder': 'Workflow Builder',
  assurance: 'Assurance',
  governance: 'Governance',
  compliance: 'Compliance',
  agents: 'Agents',
  devices: 'Devices',
  fleet: 'Runtime Fleet',
  marketplace: 'Marketplace',
  audit: 'Audit Logs',
  settings: 'Settings',
}

export function consolePageUrl(page: ConsolePageId): string {
  const base = consoleUrl.replace(/\/$/, '')
  return `${base}/?page=${page}`
}

export function consolePageLabel(page: ConsolePageId): string {
  return CONSOLE_PAGE_LABELS[page]
}
