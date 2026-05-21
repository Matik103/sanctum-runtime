import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    const update = registerSW({
      immediate: false,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
    })
    setUpdateSW(() => update)
  }, [])

  if (!needRefresh) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: '1.25rem',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem 1rem',
      background: '#18181b',
      border: '1px solid #27272a',
      borderRadius: '10px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      fontSize: '0.85rem',
      color: '#e4e4e7',
      whiteSpace: 'nowrap',
    }}>
      <span>New version available</span>
      <button
        type="button"
        onClick={() => void updateSW?.(true)}
        style={{
          padding: '0.3rem 0.75rem',
          borderRadius: '6px',
          border: 'none',
          background: '#2563eb',
          color: '#fff',
          fontSize: '0.8rem',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Update
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 0.25rem' }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
