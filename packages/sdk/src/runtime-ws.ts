import WebSocket from 'ws'
import type { RuntimeCommand } from './control-plane.js'

export type RuntimeWsOptions = {
  baseUrl: string
  runtimeId: string
  apiKey?: string
  getAccessToken?: () => Promise<string | undefined>
  onCommand: (cmd: RuntimeCommand) => void | Promise<void>
  onAck: (commandId: string, ok: boolean) => Promise<void>
}

function wsUrl(baseUrl: string, runtimeId: string): string {
  const u = baseUrl.replace(/\/$/, '').replace(/^http/, 'ws')
  return `${u}/v1/runtimes/ws?runtimeId=${encodeURIComponent(runtimeId)}`
}

export function connectRuntimeWebSocket(opts: RuntimeWsOptions): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    void (async () => {
      if (opts.apiKey) headers['X-Sanctum-Key'] = opts.apiKey
      const token = opts.getAccessToken ? await opts.getAccessToken() : undefined
      if (token) headers['Authorization'] = `Bearer ${token}`

      const ws = new WebSocket(wsUrl(opts.baseUrl, opts.runtimeId), { headers })

      ws.once('open', () => resolve(() => ws.close()))
      ws.once('error', (err) => reject(err))

      ws.on('message', (raw) => {
        void (async () => {
          try {
            const msg = JSON.parse(raw.toString()) as {
              type?: string
              id?: string
              command?: string
              payload?: Record<string, unknown>
            }
            if (msg.type !== 'command' || !msg.id || !msg.command) return
            const cmd: RuntimeCommand = {
              id: msg.id,
              command: msg.command,
              payload: msg.payload ?? {},
            }
            try {
              await opts.onCommand(cmd)
              await opts.onAck(cmd.id, true)
            } catch {
              await opts.onAck(cmd.id, false)
            }
          } catch {
            /* ignore */
          }
        })()
      })
    })().catch(reject)
  })
}
