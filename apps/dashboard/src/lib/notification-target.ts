export function sameOriginNotificationTarget(
  target: string | undefined,
  origin: string,
): string | null {
  if (!target) return null
  try {
    const url = new URL(target, origin)
    if (url.origin !== origin) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}
