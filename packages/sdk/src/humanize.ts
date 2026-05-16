/** Known enum-like context values → plain English (extend per deployment). */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  location: {
    front_door: 'Front door',
    back_door: 'Back door',
    side_door: 'Side door',
    garage: 'Garage',
    bedroom: 'Bedroom',
    kitchen: 'Kitchen',
    porch: 'Porch',
    perimeter: 'Perimeter',
  },
  zone: {
    warehouse: 'Warehouse',
    perimeter: 'Perimeter',
    living_room: 'Living room',
    kitchen: 'Kitchen',
  },
  channel: {
    voice: 'Voice',
    chat: 'Chat',
    sms: 'SMS',
    api: 'API',
    app: 'Mobile app',
  },
  source: {
    voice: 'Voice',
    chat: 'Chat',
    sms: 'SMS',
    api: 'API',
  },
  speed: {
    slow: 'Slow',
    normal: 'Normal',
    fast: 'Fast',
  },
}

const HUMANIZE_STRING_KEYS = new Set([
  'location',
  'zone',
  'path',
  'channel',
  'source',
  'currency',
  'speed',
  'actor',
])

export function humanizeToken(token: string): string {
  return token
    .split(/[._-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function lookupLabel(key: string, raw: string): string | undefined {
  const table = VALUE_LABELS[key]
  if (!table) return undefined
  return table[raw] ?? table[raw.toLowerCase()]
}

/** Format a context field value for audit UI and narratives. */
export function humanizeContextValue(key: string, value: unknown): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  const str = String(value).trim()
  if (!str) return '—'

  if (HUMANIZE_STRING_KEYS.has(key) || key.endsWith('_id')) {
    return lookupLabel(key, str) ?? humanizeToken(str)
  }

  return str
}
