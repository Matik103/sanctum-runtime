import { useEffect, useState } from 'react'

/** Master-detail inbox: stack on viewports under 768px. */
export function useInboxLayout() {
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return { isNarrow }
}
