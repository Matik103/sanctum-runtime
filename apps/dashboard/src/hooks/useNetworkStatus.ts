import { useEffect, useState } from 'react'

export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const set = () => setOnline(navigator.onLine)
    window.addEventListener('online', set)
    window.addEventListener('offline', set)
    return () => {
      window.removeEventListener('online', set)
      window.removeEventListener('offline', set)
    }
  }, [])

  return online
}
