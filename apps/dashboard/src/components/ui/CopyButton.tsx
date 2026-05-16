import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'

type Props = {
  text: string
  label?: string
  className?: string
  /** Show label text beside icon (default true) */
  showLabel?: boolean
}

export function CopyButton({ text, label = 'Copy', className = '', showLabel = true }: Props) {
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* fallback for older browsers */
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }, [text])

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm copy-btn ${copied ? 'copy-btn--done' : ''} ${className}`.trim()}
      onClick={() => void onCopy()}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} strokeWidth={2} />}
      {showLabel && <span>{copied ? 'Copied' : label}</span>}
    </button>
  )
}
