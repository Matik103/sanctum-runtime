import { useCallback, useEffect, useState } from 'react'
import type { PageId } from '../layout/Sidebar'

export type ConsolePersona = 'developer' | 'operator' | 'compliance'

const STORAGE_KEY = 'sanctum.console.persona'

const PERSONA_LABELS: Record<ConsolePersona, string> = {
  developer: 'Developer',
  operator: 'Operator',
  compliance: 'Compliance',
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
