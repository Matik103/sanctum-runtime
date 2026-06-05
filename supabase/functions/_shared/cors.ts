/** CORS for browser calls from the dashboard to Edge Functions. */

const LOCAL_ORIGINS = [
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]

function allowedOrigins(): Set<string> {
  const set = new Set(LOCAL_ORIGINS)
  const dashboard = Deno.env.get('DASHBOARD_URL')?.trim().replace(/\/$/, '')
  if (dashboard) set.add(dashboard)
  set.add('https://console.sanctumruntime.com')
  return set
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowed = allowedOrigins()
  const allowOrigin = origin && allowed.has(origin)
    ? origin
    : (Deno.env.get('DASHBOARD_URL')?.trim().replace(/\/$/, '') ?? 'https://console.sanctumruntime.com')

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: corsHeaders(req) })
}

export function jsonWithCors(
  req: Request,
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers)
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    headers.set(key, value)
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return new Response(JSON.stringify(body), { ...init, headers })
}
