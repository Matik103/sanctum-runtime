/**
 * Offline mutation queue backed by IndexedDB.
 * Stores POST/PATCH mutations taken while offline so they can be replayed
 * in order once the network is restored.
 */

const DB_NAME    = 'sanctum-offline'
const DB_VERSION = 1
const STORE      = 'mutation_queue'

export type QueuedMutation =
  | { type: 'resolve_verification'; entryId: string; decision: 'APPROVED' | 'BLOCKED' }
  | { type: 'update_policy'; action: string; response: 'approve' | 'verify' | 'block' }

type QueueEntry = {
  id: string
  mutation: QueuedMutation
  queuedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function enqueue(mutation: QueuedMutation): Promise<void> {
  const db = await openDb()
  const entry: QueueEntry = {
    id: crypto.randomUUID(),
    mutation,
    queuedAt: Date.now(),
  }
  await tx(db, 'readwrite', (s) => s.put(entry))
}

export async function dequeue(): Promise<QueueEntry[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly')
    const req = t.objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result as QueueEntry[]).sort((a, b) => a.queuedAt - b.queuedAt))
    req.onerror   = () => reject(req.error)
  })
}

export async function remove(id: string): Promise<void> {
  const db = await openDb()
  await tx(db, 'readwrite', (s) => s.delete(id))
}

export async function queueSize(): Promise<number> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly')
    const req = t.objectStore(STORE).count()
    req.onsuccess = () => resolve(req.result as number)
    req.onerror   = () => reject(req.error)
  })
}
