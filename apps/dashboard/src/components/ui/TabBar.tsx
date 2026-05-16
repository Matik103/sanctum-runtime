type Tab<T extends string> = { id: T; label: string; count?: number }

type Props<T extends string> = {
  tabs: Tab<T>[]
  active: T
  onChange: (id: T) => void
}

export function TabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`tab-bar__item ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className="tab-bar__count">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
