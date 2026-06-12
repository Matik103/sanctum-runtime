import { useCallback, useEffect, useState } from 'react'
import type { PageId } from '../layout/Sidebar'

export type ConsolePersona = 'developer' | 'operator' | 'compliance'

const STORAGE_KEY = 'sanctum.console.persona'

export const PERSONA_LABELS: Record<ConsolePersona, string> = {
  developer: 'Developer',
  operator: 'Operator',
  compliance: 'Compliance',
}

/** Persona-specific Overview copy and primary CTAs. */
export const PERSONA_LANDING: Record<
  ConsolePersona,
  { subtitle: string; primary: { page: PageId; label: string }; secondary: { page: PageId; label: string } }
> = {
  developer: {
    subtitle: 'Connect agents and gate tool calls before they execute',
    primary: { page: 'connect', label: 'Connect Agent' },
    secondary: { page: 'live-feed', label: 'Live Feed' },
  },
  operator: {
    subtitle: 'Pre-execution trust verification for your AI agent fleet',
    primary: { page: 'live-feed', label: 'Live Feed' },
    secondary: { page: 'fleet', label: 'Runtime Fleet' },
  },
  compliance: {
    subtitle: 'Audit trail, approvals, and evidence for governed AI actions',
    primary: { page: 'audit', label: 'Audit Logs' },
    secondary: { page: 'compliance', label: 'Compliance' },
  },
}

/** Nav pages visible per persona (operator = full console). */
export const PERSONA_NAV: Record<ConsolePersona, PageId[] | null> = {
  developer: [
    'overview',
    'connect',
    'live-feed',
    'agents',
    'devices',
    'marketplace',
    'policies',
    'workflow-builder',
    'permissions',
    'billing',
    'settings',
  ],
  operator: null,
  compliance: [
    'overview',
    'activity',
    'audit',
    'threats',
    'alerts',
    'policies',
    'policy-history',
    'workflow-builder',
    'governance',
    'permissions',
    'assurance',
    'compliance',
    'billing',
    'settings',
  ],
}

function readPersona(): ConsolePersona {
  if (typeof window === 'undefined') return 'operator'
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === 'developer' || raw === 'compliance' || raw === 'operator') return raw
  return 'operator'
}

export function useConsolePersona() {
  const [persona, setPersonaState] = useState<ConsolePersona>(readPersona)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, persona)
  }, [persona])

  const setPersona = useCallback((next: ConsolePersona) => {
    setPersonaState(next)
  }, [])

  return {
    persona,
    setPersona,
    label: PERSONA_LABELS[persona],
    allowedNav: PERSONA_NAV[persona],
  }
}
