import { useEffect, useState } from 'react'
import { usePwa } from './usePwa'

/** Mobile companion layout: installed PWA or narrow viewport. */
export function useCompanionMode() {
  const { isStandalone } = usePwa()
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isStandalone || narrow
}
