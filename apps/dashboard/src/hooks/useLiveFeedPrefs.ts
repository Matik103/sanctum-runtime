import { useCallback, useEffect, useState } from 'react'

export type LiveFeedPrefs = {
  tab: 'all' | 'held'
  platformFilter: string
  agentFilter: string
  toolFilter: string
  decisionFilter: string
}

const DEFAULT_PREFS: LiveFeedPrefs = {
  tab: 'all',
  platformFilter: '',
  agentFilter: '',
  toolFilter: '',
  decisionFilter: '',
}

function storageKey(orgId: string): string {
  return `sanctum.live-feed.prefs.${orgId}`
}

function readPrefs(orgId: string): LiveFeedPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(storageKey(orgId))
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<LiveFeedPrefs>
    return {
      tab: parsed.tab === 'held' ? 'held' : 'all',
      platformFilter: parsed.platformFilter ?? '',
      agentFilter: parsed.agentFilter ?? '',
      toolFilter: parsed.toolFilter ?? '',
      decisionFilter: parsed.decisionFilter ?? '',
    }
  } catch {
    return DEFAULT_PREFS
  }
}

/** Persist Live Feed tab + filters per org (survives refresh). */
export function useLiveFeedPrefs(orgId: string | null | undefined) {
  const [prefs, setPrefsState] = useState<LiveFeedPrefs>(DEFAULT_PREFS)

  useEffect(() => {
    if (!orgId) {
      setPrefsState(DEFAULT_PREFS)
      return
    }
    setPrefsState(readPrefs(orgId))
  }, [orgId])

  const setPrefs = useCallback(
    (patch: Partial<LiveFeedPrefs> | ((prev: LiveFeedPrefs) => LiveFeedPrefs)) => {
      if (!orgId) return
      setPrefsState((prev) => {
        const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
        try {
          window.localStorage.setItem(storageKey(orgId), JSON.stringify(next))
        } catch {
          /* quota / private mode */
        }
        return next
      })
    },
    [orgId],
  )

  return { prefs, setPrefs }
}
