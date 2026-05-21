type Props = {
  score: number
  label?: string
}

export function TrustScoreRing({ score, label = 'Trust score' }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const deg = (clamped / 100) * 360
  const tone = clamped >= 80 ? 'ok' : clamped >= 50 ? 'warn' : 'danger'

  return (
    <div className={`trust-ring trust-ring--${tone}`} role="img" aria-label={`${label}: ${clamped} percent`}>
      <div
        className="trust-ring__arc"
        style={{ background: `conic-gradient(var(--trust-ring-color) ${deg}deg, rgba(255,255,255,0.06) 0deg)` }}
      />
      <div className="trust-ring__inner">
        <span className="trust-ring__value">{clamped}%</span>
        <span className="trust-ring__label">{label}</span>
      </div>
    </div>
  )
}
