import type { PageId } from '../layout/Sidebar'

export type NavigateQuery = Record<string, string>

export function buildPageUrl(page: PageId, query?: NavigateQuery): string {
  const params = new URLSearchParams()
  params.set('page', page)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value)
    }
  }
  const qs = params.toString()
  return `${window.location.pathname}?${qs}`
}

export function readPageQuery(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}
