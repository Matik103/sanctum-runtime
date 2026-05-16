import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { z } from 'zod'
import { authenticateRequest, getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { runtimeWsHub, type WsConnectedMessage } from './runtime-ws-hub.js'

export async function registerRuntimeWsRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const legacyKey = process.env.SANCTUM_API_KEY?.trim() || undefined

  app.get('/v1/runtimes/ws', { websocket: true }, (socket, req) => {
    void handleConnection(socket, req)
  })

  async function handleConnection(socket: WebSocket, req: FastifyRequest) {
    const q = z
      .object({ runtimeId: z.string().uuid() })
      .safeParse(req.query)

    if (!q.success) {
      socket.close(4400, 'runtimeId_required')
      return
    }

    const auth = await authenticateRequest(req.headers, {
      supabase: cfg,
      apiKey: legacyKey,
    })
    if (!auth.ok) {
      socket.close(4401, 'unauthorized')
      return
    }

    const runtimeId = q.data.runtimeId
    const orgId = await store.getRuntimeOrgId(runtimeId)
    if (!orgId) {
      socket.close(4404, 'runtime_not_found')
      return
    }

    const user = (req as FastifyRequest & { sanctumUser?: { id: string } }).sanctumUser
    if (auth.method === 'supabase' && user) {
      const orgs = await store.getUserOrgIds(user.id)
      if (!orgs.includes(orgId)) {
        socket.close(4403, 'org_forbidden')
        return
      }
    }

    if (auth.method === 'api_key') {
      const key = headerKey(req)
      if (key?.startsWith('sk_sanctum_')) {
        const keyOrg = await store.getApiKeyOrgId(key)
        if (keyOrg && keyOrg !== orgId) {
          socket.close(4403, 'org_forbidden')
          return
        }
      }
    }

    runtimeWsHub.register(runtimeId, socket)

    const hello: WsConnectedMessage = { type: 'connected', runtimeId }
    socket.send(JSON.stringify(hello))

    socket.on('message', (raw) => {
      try {
        const text = typeof raw === 'string' ? raw : raw.toString('utf8')
        const msg = JSON.parse(text) as { type?: string }
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }))
        }
      } catch {
        /* ignore malformed */
      }
    })
  }
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}
