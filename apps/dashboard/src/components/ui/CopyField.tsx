import { CopyButton } from './CopyButton'

type Props = {
  value: string
  label?: string
  hint?: string
}

export function CopyField({ value, label, hint }: Props) {
  return (
    <div className="copy-field">
      {label && <p className="copy-field__label">{label}</p>}
      <div className="copy-field__row">
        <code className="copy-field__value">{value}</code>
        <CopyButton text={value} label="Copy key" />
      </div>
      {hint && <p className="copy-field__hint">{hint}</p>}
    </div>
  )
}
