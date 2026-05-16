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

const sockets = new Map<string, WebSocket>()

export const runtimeWsHub = {
  isConnected(runtimeId: string): boolean {
    const ws = sockets.get(runtimeId)
    return Boolean(ws && ws.readyState === 1)
  },

  register(runtimeId: string, socket: WebSocket) {
    const prev = sockets.get(runtimeId)
    if (prev && prev !== socket && prev.readyState === 1) {
      try {
        prev.close(1000, 'replaced')
      } catch {
        /* ignore */
      }
    }
    sockets.set(runtimeId, socket)
    socket.on('close', () => {
      if (sockets.get(runtimeId) === socket) sockets.delete(runtimeId)
    })
  },

  unregister(runtimeId: string, socket?: WebSocket) {
    if (!socket || sockets.get(runtimeId) === socket) {
      sockets.delete(runtimeId)
    }
  },

  push(runtimeId: string, msg: WsCommandMessage): boolean {
    const ws = sockets.get(runtimeId)
    if (!ws || ws.readyState !== 1) return false
    try {
      ws.send(JSON.stringify(msg))
      return true
    } catch {
      return false
    }
  },

  pushMany(runtimeIds: string[], msg: Omit<WsCommandMessage, 'type'> & { command: string }) {
    let pushed = 0
    for (const id of runtimeIds) {
      const ok = this.push(id, { type: 'command', ...msg })
      if (ok) pushed++
    }
    return pushed
  },

  connectedCount(): number {
    return sockets.size
  },
}
