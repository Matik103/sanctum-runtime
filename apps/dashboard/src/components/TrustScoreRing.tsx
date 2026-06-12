type Props = {
  score: number | null
  label?: string
  subtitle?: string
  tone?: 'ok' | 'warn' | 'danger' | 'neutral'
}

export function TrustScoreRing({
  score,
  label = 'Trust score',
  subtitle,
  tone,
}: Props) {
  const hasScore = score != null
  const clamped = hasScore ? Math.max(0, Math.min(100, Math.round(score))) : 0
  const deg = hasScore ? (clamped / 100) * 360 : 0
  const resolvedTone =
    tone ?? (hasScore ? (clamped >= 80 ? 'ok' : clamped >= 50 ? 'warn' : 'danger') : 'neutral')

  return (
    <div
      className={`trust-ring trust-ring--${resolvedTone}`}
      role="img"
      aria-label={hasScore ? `${label}: ${clamped} percent` : `${label}: no data`}
    >
      <div
        className="trust-ring__arc"
        style={{
          background: hasScore
            ? `conic-gradient(var(--trust-ring-color) ${deg}deg, rgba(255,255,255,0.06) 0deg)`
            : 'rgba(255,255,255,0.06)',
        }}
      />
      <div className="trust-ring__inner">
        <span className="trust-ring__value">{hasScore ? `${clamped}%` : '—'}</span>
        <span className="trust-ring__label">{label}</span>
        {subtitle && (
          <span className="trust-ring__label" style={{ fontSize: '0.65rem', opacity: 0.75, marginTop: '0.15rem' }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  )
}
