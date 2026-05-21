import type { WebSocket } from 'ws'

export type WsCommandMessage = {
  type: 'command'
  id: string
  command: string
  payload: Record<string, unknown>
}

export type WsConnectedMessage = {
  type: 'connected'
  runtimeId: string
}

const PING_INTERVAL_MS  = 30_000   // send native WS ping every 30s
const PONG_TIMEOUT_MS   = 10_000   // close if no pong within one cycle after ping
const IDLE_TIMEOUT_MS   = 300_000  // close connections silent for 5 min

export const MAX_CONNECTIONS_PER_ORG = 50
export const MAX_CONNECTIONS_GLOBAL  = 500

type SocketMeta = {
  ws:              WebSocket
  orgId:           string
  lastActivityAt:  number
  waitingForPong:  boolean
}

// runtimeId → connection metadata
const sockets = new Map<string, SocketMeta>()
// orgId → set of runtimeIds currently connected
const orgConnections = new Map<string, Set<string>>()

function remove(runtimeId: string, orgId: string) {
  sockets.delete(runtimeId)
  const orgSet = orgConnections.get(orgId)
  if (orgSet) {
    orgSet.delete(runtimeId)
    if (orgSet.size === 0) orgConnections.delete(orgId)
  }
}

// Health-check loop: ping every socket, evict idle or non-responsive ones
const healthCheck: NodeJS.Timeout = setInterval(() => {
  const now = Date.now()
  for (const [runtimeId, meta] of sockets) {
    if (meta.ws.readyState !== 1 /* OPEN */) {
      remove(runtimeId, meta.orgId)
      continue
    }
    // Idle timeout — no activity for 5 min
    if (now - meta.lastActivityAt > IDLE_TIMEOUT_MS) {
      try { meta.ws.close(1001, 'idle_timeout') } catch { /* ignore */ }
      remove(runtimeId, meta.orgId)
      continue
    }
    // Pong timeout — client didn't reply to last ping within one cycle
    if (meta.waitingForPong) {
      try { meta.ws.close(1002, 'pong_timeout') } catch { /* ignore */ }
      remove(runtimeId, meta.orgId)
      continue
    }
    // Send native WS ping frame (browsers + ws library both reply automatically)
    meta.waitingForPong = true
    try {
      meta.ws.ping()
    } catch {
      remove(runtimeId, meta.orgId)
    }
  }
}, PING_INTERVAL_MS)

// Don't hold the process open just for this timer
healthCheck.unref()

export const runtimeWsHub = {
  isConnected(runtimeId: string): boolean {
    const meta = sockets.get(runtimeId)
    return Boolean(meta && meta.ws.readyState === 1)
  },

  connectedCount(): number {
    return sockets.size
  },

  connectedCountForOrg(orgId: string): number {
    return orgConnections.get(orgId)?.size ?? 0
  },

  /**
   * Register a new WebSocket for a runtime.
   * Returns { ok: false, reason } if a connection limit would be exceeded.
   * The caller must close the socket on failure.
   */
  register(
    runtimeId: string,
    socket: WebSocket,
    orgId: string,
  ): { ok: true } | { ok: false; reason: string } {
    // Enforce caps (don't count the slot being replaced for the same runtimeId)
    const isReplacing = sockets.has(runtimeId)
    const globalCount = isReplacing ? sockets.size - 1 : sockets.size
    if (globalCount >= MAX_CONNECTIONS_GLOBAL) {
      return { ok: false, reason: 'global_limit_reached' }
    }
    const orgCount = (orgConnections.get(orgId)?.size ?? 0) - (isReplacing ? 1 : 0)
    if (orgCount >= MAX_CONNECTIONS_PER_ORG) {
      return { ok: false, reason: 'org_limit_reached' }
    }

    // Evict previous connection for the same runtimeId
    const prev = sockets.get(runtimeId)
    if (prev && prev.ws !== socket) {
      try { prev.ws.close(1000, 'replaced') } catch { /* ignore */ }
    }
    remove(runtimeId, prev?.orgId ?? orgId)

    const meta: SocketMeta = {
      ws: socket,
      orgId,
      lastActivityAt: Date.now(),
      waitingForPong: false,
    }
    sockets.set(runtimeId, meta)
    if (!orgConnections.has(orgId)) orgConnections.set(orgId, new Set())
    orgConnections.get(orgId)!.add(runtimeId)

    // Any incoming message counts as activity
    socket.on('message', () => {
      const m = sockets.get(runtimeId)
      if (m) {
        m.lastActivityAt = Date.now()
        m.waitingForPong = false
      }
    })

    // Native WS pong frame resets the liveness flag
    socket.on('pong', () => {
      const m = sockets.get(runtimeId)
      if (m) {
        m.lastActivityAt = Date.now()
        m.waitingForPong = false
      }
    })

    socket.on('close', () => {
      if (sockets.get(runtimeId)?.ws === socket) {
        remove(runtimeId, orgId)
      }
    })

    return { ok: true }
  },

  unregister(runtimeId: string, socket?: WebSocket) {
    const meta = sockets.get(runtimeId)
    if (meta && (!socket || meta.ws === socket)) {
      remove(runtimeId, meta.orgId)
    }
  },

  push(runtimeId: string, msg: WsCommandMessage): boolean {
    const meta = sockets.get(runtimeId)
    if (!meta || meta.ws.readyState !== 1) return false
    try {
      meta.ws.send(JSON.stringify(msg))
      return true
    } catch {
      return false
    }
  },

  pushMany(runtimeIds: string[], msg: Omit<WsCommandMessage, 'type'> & { command: string }) {
    let pushed = 0
    for (const id of runtimeIds) {
      if (this.push(id, { type: 'command', ...msg })) pushed++
    }
    return pushed
  },
}
